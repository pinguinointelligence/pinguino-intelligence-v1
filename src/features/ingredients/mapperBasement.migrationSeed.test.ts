/// <reference types="node" />
/**
 * Mapper Basement migration + seed guards.
 *
 * Locks the locked reference table (`public.mapper_basement`, migration 0006)
 * and its v1.0 replacement seed: no ingredient-level `npac_value`, the renamed
 * approval columns (`approved_for_base` / `approved_for_engines`, never the
 * legacy names), PI Pro-only read RLS, and 2,083 rows replaced in one
 * transaction. Detailed CSV row/column/value pins stay in
 * mapperBasementCsv.test.ts (not duplicated here).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

const MIGRATION = read('supabase', 'migrations', '0006_mapper_basement.sql');
const SEED = read('supabase', 'seed', 'mapper_basement_v1_0.sql');
const SERVICE = read('src', 'services', 'ingredients.ts');

describe('Mapper Basement migration (0006)', () => {
  it('creates public.mapper_basement with no npac_value, pac_value retained, v0.95', () => {
    expect(MIGRATION.includes('create table if not exists public.mapper_basement')).toBe(true);
    expect(/npac_value/i.test(MIGRATION)).toBe(false);
    expect(/pac_value\s+numeric/.test(MIGRATION)).toBe(true);
    expect(/dataset_version text not null default 'v0\.95'/.test(MIGRATION)).toBe(true);
    expect(/is_active boolean not null default true/.test(MIGRATION)).toBe(true);
  });

  it('uses the renamed approval columns and NO legacy approval names', () => {
    expect(/(^|[^a-z_])approved_for_base([^a-z_]|$)/m.test(MIGRATION)).toBe(true);
    expect(/(^|[^a-z_])approved_for_engines([^a-z_]|$)/m.test(MIGRATION)).toBe(true);
    expect(/approved_for_pinguino_base/.test(MIGRATION)).toBe(false);
    expect(/approved_for_minus_11_engine/.test(MIGRATION)).toBe(false);
  });

  it('keeps PI Pro-only read RLS gated on approved_for_base, no anon, no user writes, no service_role', () => {
    expect(MIGRATION.includes('enable row level security')).toBe(true);
    expect(MIGRATION.includes('mapper_basement_select_pro')).toBe(true);
    expect(MIGRATION.includes('public.subscriptions')).toBe(true);
    expect(/for\s+select\s+to\s+authenticated/.test(MIGRATION)).toBe(true);
    expect(/and\s+approved_for_base/.test(MIGRATION)).toBe(true); // the PI-Pro gate column
    expect(/using\s*\(\s*true\s*\)/i.test(MIGRATION)).toBe(false);
    expect(/to\s+anon/i.test(MIGRATION)).toBe(false);
    expect(/for\s+(insert|update|delete)/i.test(MIGRATION)).toBe(false);
    expect(/grant\s+(insert|update|delete)/i.test(MIGRATION)).toBe(false);
    expect(/service[_-]?role/i.test(MIGRATION)).toBe(false);
  });

  it('does not drop the legacy rollback tables', () => {
    expect(/drop\s+table/i.test(MIGRATION)).toBe(false);
  });
});

describe('Mapper Basement seed (mapper_basement_v1_0.sql)', () => {
  const tuples = SEED.split('\n').filter((l) => l.startsWith('('));

  it('replaces all rows with 2083 v1.0 tuples in one transaction, no npac_value', () => {
    expect(tuples.length).toBe(2083);
    expect(/npac_value/i.test(SEED)).toBe(false);
    // 2083 tuple values + the dataset_version column default
    expect((SEED.match(/'v1\.0'/g) ?? []).length).toBe(2084);
    expect(SEED.includes('begin;')).toBe(true);
    expect(SEED.includes('delete from public.mapper_basement;')).toBe(true);
    expect(SEED.includes('insert into public.mapper_basement')).toBe(true);
    expect(SEED.includes("alter column dataset_version set default 'v1.0';")).toBe(true);
    expect(SEED.includes('commit;')).toBe(true);
    const ids = tuples.map((t) => t.match(/^\('([^']+)'/)?.[1]);
    expect(new Set(ids).size).toBe(2083);
  });

  it('uses the renamed approval columns and NO legacy approval names', () => {
    expect(SEED.includes('approved_for_base')).toBe(true);
    expect(SEED.includes('approved_for_engines')).toBe(true);
    expect(/approved_for_pinguino_base/.test(SEED)).toBe(false);
    expect(/approved_for_minus_11_engine/.test(SEED)).toBe(false);
  });

  it('provenance comment references mapper_basement.csv, not the legacy v0.94 CSV', () => {
    expect(SEED.includes('mapper_basement.csv')).toBe(true);
    expect(/pinguino_base_ingredients_cleaned_v0_94/.test(SEED)).toBe(false);
  });
});

describe('Mapper Basement — runtime switched (Slice B2)', () => {
  it('the app service now queries mapper_basement, not the legacy v0.95 table', () => {
    expect(SERVICE.includes('mapper_basement')).toBe(true);
    expect(SERVICE.includes('ingredients_final_v0_95_no_npac')).toBe(false);
  });

  it('the app service filters by approved_for_engines, not the legacy approval column', () => {
    expect(SERVICE.includes('approved_for_engines')).toBe(true);
    expect(/approved_for_minus_11_engine/.test(SERVICE)).toBe(false);
  });
});
