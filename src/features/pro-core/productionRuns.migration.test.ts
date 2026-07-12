/// <reference types="node" />
/**
 * 0028 production-runs migration guard — contract-lockstep + safety invariants, proven statically
 * against the SQL text (comment-stripped). No live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductionEventType, ProductionStatus } from './productionContracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', '0028_production_runs.sql'), 'utf8');
const CODE = SQL.replace(/--.*$/gm, '');

const TABLES = [
  'production_runs',
  'production_run_planned_items',
  'production_run_actuals',
  'production_run_events',
] as const;

const STATUSES: ProductionStatus[] = ['draft', 'planned', 'in_progress', 'completed', 'cancelled'];
const EVENT_TYPES: ProductionEventType[] = ['created', 'planned', 'started', 'actual_recorded', 'completed', 'cancelled', 'amended', 'note_added'];

const parseSet = (re: RegExp) => new Set(CODE.match(re)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? []);

describe('0028 production migration — shape & lockstep', () => {
  it('creates the four additive tables and recreates no existing one', () => {
    for (const t of TABLES) expect(CODE.includes(`create table if not exists public.${t}`), t).toBe(true);
    for (const owned of ['saved_recipes', 'recipe_versions', 'products', 'entitlements', 'partners']) {
      // "create table [if not exists] public.<owned>" — anchored so an FK reference never trips it
      expect(new RegExp(`create table (if not exists )?public\\.${owned}\\b`).test(CODE), owned).toBe(false);
    }
    expect(/mapper_basement/.test(CODE)).toBe(false);
  });

  it('enables RLS on every table', () => {
    for (const t of TABLES) expect(CODE.includes(`alter table public.${t} enable row level security`), t).toBe(true);
  });

  it('plans from the EXACT immutable recipe version (references recipe_versions + saved_recipes)', () => {
    expect(CODE.includes('recipe_version_id uuid not null references public.recipe_versions(id)')).toBe(true);
    expect(CODE.includes('recipe_id uuid not null references public.saved_recipes(id)')).toBe(true);
  });

  it('status + event-type checks are lockstep with the TS unions', () => {
    expect(parseSet(/status in\s*\(([^)]*)\)/)).toEqual(new Set(STATUSES));
    expect(parseSet(/event_type in\s*\(([^)]*)\)/)).toEqual(new Set(EVENT_TYPES));
  });

  it('constrains positive weights', () => {
    expect(/planned_batch_g numeric not null check \(planned_batch_g > 0\)/.test(CODE)).toBe(true);
    expect(/planned_grams numeric not null check \(planned_grams >= 0\)/.test(CODE)).toBe(true);
  });
});

describe('0028 — production safety invariants', () => {
  it('authorizes by auth.uid(), never email', () => {
    expect(CODE.includes('auth.uid()')).toBe(true);
    expect(/using \([^)]*email|with check \([^)]*email/i.test(CODE)).toBe(false);
  });

  it('the planned snapshot is immutable: planned_items has no update/delete', () => {
    expect(/on public\.production_run_planned_items\s+for (update|delete)/.test(CODE)).toBe(false);
    expect(/grant[^;]*(update|delete)[^;]*production_run_planned_items to authenticated/.test(CODE)).toBe(false);
    // insert + select are granted so the frozen plan can still be written once and read
    expect(/grant select, insert on public\.production_run_planned_items to authenticated/.test(CODE)).toBe(true);
  });

  it('history is append-only: production_run_events has no update/delete', () => {
    expect(/on public\.production_run_events\s+for (update|delete)/.test(CODE)).toBe(false);
    expect(/grant[^;]*(update|delete)[^;]*production_run_events to authenticated/.test(CODE)).toBe(false);
    expect(/grant select, insert on public\.production_run_events to authenticated/.test(CODE)).toBe(true);
  });

  it('runs are never destroyed: no delete policy or grant on production_runs', () => {
    expect(/on public\.production_runs\s+for delete/.test(CODE)).toBe(false);
    expect(/grant[^;]*delete[^;]*production_runs to authenticated/.test(CODE)).toBe(false);
  });

  it('grants nothing to anon', () => {
    expect(/to anon\b/.test(CODE)).toBe(false);
  });
});
