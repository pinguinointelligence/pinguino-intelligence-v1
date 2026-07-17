/// <reference types="node" />
/**
 * 0030 user-machine-preference migration guard — contract-lockstep + §23.4
 * safety invariants, proven statically against the SQL text (comment-stripped).
 * No live DB. The migration file is COMMITTED but NOT APPLIED (file-first).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOME_TECHNOLOGY_TO_VISIBLE_MODE,
  type HomeVisibleModeId,
  type MachineTechnology,
} from '@/features/machine-catalog';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const RAW = readFileSync(join(REPO, 'supabase', 'migrations', '0030_user_machine_preference.sql'), 'utf8');
const CODE = RAW.replace(/--.*$/gm, '');

const HOME_TECHNOLOGIES = Object.entries(HOME_TECHNOLOGY_TO_VISIBLE_MODE)
  .filter(([, mode]) => mode !== null)
  .map(([technology]) => technology) as MachineTechnology[];
const HOME_MODES = [
  ...new Set(Object.values(HOME_TECHNOLOGY_TO_VISIBLE_MODE).filter((m): m is HomeVisibleModeId => m !== null)),
];

function checkList(column: string): string[] {
  const match = CODE.match(new RegExp(`${column} in \\(([^)]*)\\)`));
  return match?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
}

describe('0030 user_machine_preference migration', () => {
  it('is ADDITIVE: creates only the new table, never drops/alters existing tables', () => {
    expect(CODE.includes('create table if not exists public.user_machine_preference')).toBe(true);
    expect(/\bdrop\s+(table|column|policy)/i.test(CODE)).toBe(false);
    expect(/alter table (?!public\.user_machine_preference\b)/i.test(CODE)).toBe(false);
    // No seeding/backfill: existing users are NEVER assigned a machine (§23.4).
    expect(/\binsert\s+into\b/i.test(CODE)).toBe(false);
    expect(/\bupdate\s+public\./i.test(CODE)).toBe(false);
  });

  it('enables owner-scoped RLS by auth.uid(), never email; no anon grants', () => {
    expect(CODE.includes('alter table public.user_machine_preference enable row level security')).toBe(true);
    expect(CODE.includes('auth.uid() = user_id')).toBe(true);
    expect(/using \([^)]*email|with check \([^)]*email/i.test(CODE)).toBe(false);
    expect(/to anon\b/.test(CODE)).toBe(false);
    expect(/grant[^;]*to authenticated/.test(CODE)).toBe(true);
  });

  it('one row per user (user_id PRIMARY KEY → auth.users, cascade)', () => {
    expect(/user_id uuid primary key references auth\.users\(id\) on delete cascade/.test(CODE)).toBe(true);
  });

  it('selection is EITHER a catalog id OR a custom profile (XOR check)', () => {
    expect(CODE.includes('machine_profile_id is not null and custom_profile is null')).toBe(true);
    expect(CODE.includes('machine_profile_id is null and custom_profile is not null')).toBe(true);
  });

  it('technology check is lockstep with the Home-supported technologies (no soft serve)', () => {
    expect(new Set(checkList('resolved_technology'))).toEqual(new Set(HOME_TECHNOLOGIES));
    expect(checkList('resolved_technology')).not.toContain('continuous_soft_serve');
  });

  it('visible-mode check is lockstep with HomeVisibleModeId', () => {
    expect(new Set(checkList('resolved_visible_mode'))).toEqual(new Set(HOME_MODES));
  });

  it('default_batch kinds are lockstep with SavedDefaultBatch (grams | none)', () => {
    const kinds = CODE.match(/default_batch->>'kind' in \(([^)]*)\)/)?.[1] ?? '';
    expect(kinds).toContain("'grams'");
    expect(kinds).toContain("'none'");
    expect(kinds).not.toContain('ml_suggestion');
  });

  it('carries the §8.6 provenance columns (catalog version, set_at, schema version)', () => {
    expect(/catalog_version text not null/.test(CODE)).toBe(true);
    expect(/set_at timestamptz not null/.test(CODE)).toBe(true);
    expect(/schema_version integer not null default 1/.test(CODE)).toBe(true);
    expect(/market text not null/.test(CODE)).toBe(true);
    expect(/capacity_snapshot jsonb not null/.test(CODE)).toBe(true);
  });

  it('documents the FILE-FIRST / not-applied contract in the header', () => {
    expect(RAW).toContain('NOT APPLIED');
    expect(RAW).toContain('riwipywgqobrulyzrzad'); // never production
  });
});
