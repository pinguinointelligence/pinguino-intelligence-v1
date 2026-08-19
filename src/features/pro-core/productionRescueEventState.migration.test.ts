/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260819031000_production_rescue_event_state.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, '');

describe('forward-only Production Rescue event-state repair', () => {
  it('permits the atomic rescue_applied event only while its owned run is in progress', () => {
    expect(CODE).toContain('create or replace function public.enforce_production_event_state()');
    expect(CODE).toContain('where run.id = new.run_id');
    expect(CODE).toContain('run.owner_user_id = new.owner_user_id');
    expect(CODE).toContain(
      "new.event_type in ('started', 'actual_recorded', 'rescue_applied')",
    );
    expect(CODE).toContain("and run_status = 'in_progress'");
  });

  it('preserves the existing lifecycle pairs and fails closed for every other combination', () => {
    expect(CODE).toContain("new.event_type = 'note_added'");
    expect(CODE).toContain("new.event_type = 'created' and run_status = 'draft'");
    expect(CODE).toContain("new.event_type = 'planned' and run_status = 'planned'");
    expect(CODE).toContain(
      "new.event_type in ('completed', 'amended') and run_status = 'completed'",
    );
    expect(CODE).toContain("new.event_type = 'cancelled' and run_status = 'cancelled'");
    expect(CODE).toContain('Production event is incompatible with the current run status.');
    expect(CODE).toContain("errcode = '23514'");

    const condition = CODE.match(/if not \(([\s\S]*?)\) then/)?.[1]?.replace(/\s+/g, ' ').trim();
    expect(condition).toBe(
      [
        "new.event_type = 'note_added'",
        "or (new.event_type = 'created' and run_status = 'draft')",
        "or (new.event_type = 'planned' and run_status = 'planned')",
        "or ( new.event_type in ('started', 'actual_recorded', 'rescue_applied') and run_status = 'in_progress' )",
        "or (new.event_type in ('completed', 'amended') and run_status = 'completed')",
        "or (new.event_type = 'cancelled' and run_status = 'cancelled')",
      ].join(' '),
    );
  });

  it('changes only trigger logic and carries no data rewrite or privilege grant', () => {
    expect(CODE).toContain('set search_path = pg_catalog, public');
    expect(CODE).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from)\b/i);
    expect(CODE).not.toMatch(/\bgrant\b/i);
    expect(CODE).not.toMatch(/alter\s+table/i);
  });
});
