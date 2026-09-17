/// <reference types="node" />
/**
 * Rollbacks for the two unapplied payout migrations that had none:
 * 20260831202500_payout_execution and 20260831203000_partner_scheduling.
 *
 * A rollback is judged against its migration, not restated: it must remove
 * exactly what the migration created (every function, by signature, every
 * table and schedule), touch no data row, and refuse in the states where
 * dropping would strand money or erase an owner decision.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');
const strip = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** Every function a migration creates, with the signature its revoke names. */
const createdFunctions = (sql: string): string[] =>
  [...strip(sql).matchAll(/revoke all on function public\.([a-z0-9_]+\([^)]*\))/g)].map((m) => m[1] as string);

const createdTables = (sql: string): string[] =>
  [...strip(sql).matchAll(/create table if not exists public\.([a-z0-9_]+)/g)].map((m) => m[1] as string);

const EXECUTION = read('supabase/migrations/20260831202500_payout_execution.sql');
const EXECUTION_RB = strip(read('supabase/rollbacks/20260831202500_payout_execution.rollback.sql'));
const SCHEDULING = read('supabase/migrations/20260831203000_partner_scheduling.sql');
const SCHEDULING_RB = strip(read('supabase/rollbacks/20260831203000_partner_scheduling.rollback.sql'));

describe.each([
  ['20260831202500_payout_execution', EXECUTION, EXECUTION_RB],
  ['20260831203000_partner_scheduling', SCHEDULING, SCHEDULING_RB],
])('%s rollback', (_name, migration, rollback) => {
  it('drops every function the migration created, by exact signature', () => {
    const created = createdFunctions(migration);
    expect(created.length).toBeGreaterThan(0);
    for (const signature of created) {
      expect(rollback, signature).toContain(`drop function if exists public.${signature};`);
    }
    expect([...rollback.matchAll(/drop function if exists/g)]).toHaveLength(created.length);
  });

  it('drops the tables the migration created, and no other', () => {
    const created = createdTables(migration);
    expect([...rollback.matchAll(/drop table if exists public\.([a-z0-9_]+);/g)].map((m) => m[1]).sort()).toEqual(
      [...created].sort(),
    );
  });

  it('changes no data row and runs as one transaction', () => {
    expect(rollback).not.toMatch(/^\s*(update|delete|truncate|insert)\b/im);
    expect(rollback).toMatch(/^begin;$/m);
    expect(rollback).toMatch(/^commit;$/m);
  });
});

describe('20260831203000_partner_scheduling rollback', () => {
  it('unschedules exactly the pg_cron jobs the migration schedules', () => {
    const scheduled = [...strip(SCHEDULING).matchAll(/cron\.schedule\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
    expect(scheduled).toEqual(['gellatti-partner-daily', 'gellatti-partner-monthly']);
    expect(SCHEDULING_RB).toContain("where j.jobname in ('gellatti-partner-daily', 'gellatti-partner-monthly');");
    expect(SCHEDULING_RB).not.toContain('gellatti-partner-tier-snapshots');
  });
});

describe('20260831202500_payout_execution rollback refuses where dropping would do harm', () => {
  const guard = EXECUTION_RB.slice(EXECUTION_RB.indexOf('do $guard$'), EXECUTION_RB.indexOf('end $guard$;'));
  const firstDrop = EXECUTION_RB.indexOf('drop function');

  it('checks everything before it drops anything', () => {
    expect(guard.length).toBeGreaterThan(0);
    expect(EXECUTION_RB.indexOf('end $guard$;')).toBeLessThan(firstDrop);
  });

  it('while the batch binding or the scheduler still calls these functions', () => {
    expect(guard).toContain(
      "to_regprocedure('public.gellatti_settle_payout_line_v2(uuid, text, uuid, integer, text, boolean, timestamptz)') is not null",
    );
    expect(guard).toContain("to_regprocedure('public.gellatti_run_partner_job_v1(text)') is not null");
  });

  it('when live payouts were ever released', () => {
    expect(guard).toContain('where live_payouts_released or released_at is not null');
  });

  it('while a payout line is pending or processing', () => {
    expect(guard).toContain("where status in ('pending', 'processing')");
  });

  it('leaves the payout tables that existed before the migration alone', () => {
    for (const table of ['payout_batches', 'partner_payouts', 'partner_payout_items']) {
      expect(EXECUTION_RB).not.toMatch(new RegExp(`drop table if exists public\\.${table}\\b`));
    }
  });
});
