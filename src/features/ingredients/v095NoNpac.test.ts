/// <reference types="node" />
/**
 * v0.95 no-NPAC hotfix guards — the active ingredient table/seed/service must
 * carry NO ingredient-level `npac_value`, keep the PI Pro-only read model, and
 * the app must query the v0.95 table.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

const MIGRATION = read('supabase', 'migrations', '0005_ingredients_final_v0_95_no_npac.sql');
const SEED = read('supabase', 'seed', 'ingredients_final_v0_95_no_npac.sql');
const SERVICE = read('src', 'services', 'ingredients.ts');
const CSV = read(
  'docs',
  'ingredients',
  'validation',
  'pinguino_base_ingredients_cleaned_v0_95_no_npac.csv',
);

describe('v0.95 no-NPAC migration (0005)', () => {
  it('creates the v0.95 table with no npac_value column', () => {
    expect(MIGRATION.includes('create table if not exists public.ingredients_final_v0_95_no_npac')).toBe(true);
    expect(/npac_value/i.test(MIGRATION)).toBe(false);
    expect(/pac_value\s+numeric/.test(MIGRATION)).toBe(true);
    expect(/dataset_version text not null default 'v0\.95'/.test(MIGRATION)).toBe(true);
  });

  it('keeps PI Pro-only read RLS, no anon, no user writes, no service_role', () => {
    expect(MIGRATION.includes('enable row level security')).toBe(true);
    expect(MIGRATION.includes('ingredients_v95_select_pro')).toBe(true);
    expect(MIGRATION.includes('public.subscriptions')).toBe(true);
    expect(/for\s+select\s+to\s+authenticated/.test(MIGRATION)).toBe(true);
    expect(/using\s*\(\s*true\s*\)/i.test(MIGRATION)).toBe(false);
    expect(/to\s+anon/i.test(MIGRATION)).toBe(false);
    expect(/for\s+(insert|update|delete)/i.test(MIGRATION)).toBe(false);
    expect(/grant\s+(insert|update|delete)/i.test(MIGRATION)).toBe(false);
    expect(/service[_-]?role/i.test(MIGRATION)).toBe(false);
  });
});

describe('v0.95 no-NPAC seed', () => {
  const tuples = SEED.split('\n').filter((l) => l.startsWith('('));

  it('has 542 rows, no npac_value column, v0.95, idempotent upsert', () => {
    expect(tuples.length).toBe(542);
    expect(/npac_value/i.test(SEED)).toBe(false);
    expect((SEED.match(/'v0\.95'/g) ?? []).length).toBe(542);
    expect(SEED.includes('insert into public.ingredients_final_v0_95_no_npac')).toBe(true);
    expect(SEED.includes('on conflict (ingredient_id) do update set')).toBe(true);
    const ids = tuples.map((t) => t.match(/^\('([^']+)'/)?.[1]);
    expect(new Set(ids).size).toBe(542);
  });
});

describe('v0.95 service + dataset', () => {
  it('the runtime service no longer queries the v0.95 table (now rollback-only)', () => {
    // Slice B2 moved the runtime onto public.mapper_basement; the v0.95 table +
    // its migration/seed remain on disk for rollback only.
    expect(SERVICE.includes('ingredients_final_v0_95_no_npac')).toBe(false);
    expect(SERVICE.includes('mapper_basement')).toBe(true);
  });

  it('the v0.95 rollback CSV has no npac_value column', () => {
    expect(/(^|,)npac_value(,|$)/m.test(CSV.split(/\r?\n/)[0]!)).toBe(false);
  });
});
