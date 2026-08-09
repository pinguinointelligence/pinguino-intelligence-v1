/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '0038_owner_relationship_rls_hardening.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, '');

describe('0038 owner relationship and production immutability hardening', () => {
  it('binds every persisted child to its owned parent rather than trusting a copied owner id', () => {
    for (const parent of [
      'saved_recipes recipe',
      'recipe_versions version',
      'production_runs run',
    ]) {
      expect(CODE).toContain(parent);
    }
    expect(CODE).toContain('version.recipe_id = recipe.id');
    expect(CODE).toContain('run.recipe_version_id = recipe_cost_snapshots.recipe_version_id');
    expect(CODE).toContain('run.owner_user_id = auth.uid()');
  });

  it('pins creator identities to auth.uid()', () => {
    expect((CODE.match(/auth\.uid\(\) = created_by/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(CODE).toContain('auth.uid() = recorded_by');
  });

  it('freezes the run source and enforces the canonical lifecycle in the database', () => {
    expect(CODE).toContain('enforce_production_run_immutability');
    for (const column of [
      'owner_user_id',
      'recipe_id',
      'recipe_version_id',
      'recipe_version_number',
      'planned_batch_g',
      'engine_version',
      'config_version',
      'mapper_dataset_version',
    ]) {
      expect(CODE).toContain(`new.${column} is distinct from old.${column}`);
    }
    expect(CODE).toContain("old.status = 'draft' and new.status in ('planned', 'cancelled')");
    expect(CODE).toContain("old.status = 'planned' and new.status in ('in_progress', 'cancelled')");
    expect(CODE).toContain("old.status = 'in_progress' and new.status in ('completed', 'cancelled')");
  });

  it('blocks actual writes unless the owned run is currently in progress', () => {
    expect(CODE).toContain('enforce_active_production_actuals');
    expect((CODE.match(/run\.status = 'in_progress'/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(CODE).toContain('Production actual ownership is immutable.');
  });

  it('freezes planned lines before the planned state and validates event/status pairs', () => {
    expect(CODE).toContain("run.status = 'draft'");
    expect(CODE).not.toContain("run.status in ('draft', 'planned')");
    expect(CODE).toContain('enforce_production_event_state');
    expect(CODE).toContain("new.event_type = 'planned' and run_status = 'planned'");
    expect(CODE).toContain(
      "new.event_type in ('started', 'actual_recorded') and run_status = 'in_progress'",
    );
    expect(CODE).toContain("new.event_type in ('completed', 'amended') and run_status = 'completed'");
  });
});
