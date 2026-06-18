/// <reference types="node" />
/**
 * Mapper Products migration guard (Slice C).
 *
 * Locks the public.products skeleton (migration 0007): the GROWING, owner-scoped
 * product layer — separate from the LOCKED reference base. Asserts the schema,
 * the status/source_type CHECK enums, own-row RLS + authenticated-only grants,
 * and — critically — that NO automatic path writes into the locked reference
 * base (the executable SQL, comments stripped, never even names it). Static
 * SQL-text guard (vitest node env); no live DB, no runtime/engine change.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

const MIGRATION = read('supabase', 'migrations', '0007_products.sql');
const SERVICE = read('src', 'services', 'ingredients.ts');

/** The migration with every SQL line comment (-- … end of line) removed. */
const EXECUTABLE = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** Extract the quoted values inside a `<col> text not null default '…' check (<col> in (…))`. */
function checkValues(col: string): string[] | null {
  const m = MIGRATION.match(
    new RegExp(`${col} text not null default '[^']*'\\s*check \\(${col} in \\(([\\s\\S]*?)\\)\\)`),
  );
  if (!m) return null;
  return (m[1]!.match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
}

describe('Mapper Products migration (0007)', () => {
  it('creates public.products with a gen_random_uuid PK, owner FK, is_active, touch trigger, and NO npac_value', () => {
    expect(MIGRATION.includes('create table if not exists public.products')).toBe(true);
    expect(/id uuid primary key default gen_random_uuid\(\)/.test(MIGRATION)).toBe(true);
    expect(/owner_user_id uuid not null references auth\.users/.test(MIGRATION)).toBe(true);
    expect(/is_active boolean not null default true/.test(MIGRATION)).toBe(true);
    expect(MIGRATION.includes('execute function public.touch_updated_at()')).toBe(true);
    // reuses the 0001 function — never redefines it
    expect(/create\s+(or\s+replace\s+)?function/i.test(MIGRATION)).toBe(false);
    // no npac_value column/reference anywhere in the executable SQL (comments may explain the no-NPAC model)
    expect(/npac_value/i.test(EXECUTABLE)).toBe(false);
  });

  it('keeps pac_value + pod_value and mirrors the engine-ready composition columns (all numeric)', () => {
    expect(/pac_value\s+numeric/.test(MIGRATION)).toBe(true);
    expect(/pod_value\s+numeric/.test(MIGRATION)).toBe(true);
    for (const c of [
      'water_percent', 'total_solids_percent', 'fat_percent', 'protein_percent',
      'total_sugars_percent', 'sucrose_percent', 'dextrose_percent', 'fructose_percent',
      'lactose_percent', 'salt_percent', 'alcohol_percent', 'de_value', 'sweetness_factor',
      'freezing_factor', 'stabilizer_activity', 'kcal_per_100g', 'cost_per_kg',
    ]) {
      expect(new RegExp(`${c}\\s+numeric`).test(MIGRATION), c).toBe(true);
    }
  });

  it('includes the intake + ownership + provenance columns required by the slice', () => {
    for (const re of [
      /product_image_url text/, /detected_text text/, /extracted_json jsonb/,
      /catalog_source text/, /ean_code text/, /barcode text/, /brand text/, /supplier text/,
      /created_by uuid references auth\.users \(id\) on delete set null/,
      /reviewed_by uuid references auth\.users/, /reviewed_at timestamptz/, /review_notes text/,
      /promoted_to_basement boolean not null default false/, /promoted_at timestamptz/,
      /dataset_version text,/, // nullable, no default
    ]) {
      expect(re.test(MIGRATION), String(re)).toBe(true);
    }
  });

  it('ean_code and barcode are NOT globally unique (multi-user/catalog scans allowed)', () => {
    // no UNIQUE constraint/index anywhere in the executable DDL (the comment may
    // explain that ean_code/barcode are intentionally not unique)
    expect(/\bunique\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('status CHECK contains exactly the six lifecycle values', () => {
    expect(checkValues('status')).toEqual([
      'draft', 'pi_calculated', 'pi_generated', 'manual_adjusted', 'pi_verified', 'rejected',
    ]);
  });

  it('source_type CHECK contains exactly the eight source values', () => {
    expect(checkValues('source_type')).toEqual([
      'customer_upload', 'label_scan', 'barcode_ean', 'catalog_import',
      'mercadona', 'colin_catalog', 'manual', 'api',
    ]);
  });

  it('enforces own-row RLS on auth.uid() = owner_user_id — no anon, no using(true)', () => {
    expect(MIGRATION.includes('alter table public.products enable row level security')).toBe(true);
    for (const p of [
      'products_select_own', 'products_insert_own', 'products_update_own', 'products_delete_own',
    ]) {
      expect(MIGRATION.includes(p), p).toBe(true);
    }
    expect(/for\s+select\s+using\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/.test(MIGRATION)).toBe(true);
    expect(/for\s+insert\s+with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/.test(MIGRATION)).toBe(true);
    expect(
      /for\s+update\s+using\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)\s*with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/.test(MIGRATION),
    ).toBe(true);
    expect(/for\s+delete\s+using\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/.test(MIGRATION)).toBe(true);
    expect(/using\s*\(\s*true\s*\)/i.test(MIGRATION)).toBe(false);
    expect(/to\s+anon/i.test(EXECUTABLE.replace(/grant usage on schema public to anon, authenticated;/, ''))).toBe(false);
  });

  it('grants CRUD to authenticated only — no anon table grant, no service_role', () => {
    expect(MIGRATION.includes('grant select, insert, update, delete on table public.products to authenticated')).toBe(true);
    expect(/grant[^;]*on table public\.products[^;]*to[^;]*anon/i.test(EXECUTABLE)).toBe(false);
    expect(/service[_-]?role/i.test(EXECUTABLE)).toBe(false);
  });

  it('NO auto-write to the locked reference base: executable SQL never names it, no function, no DML, no FK', () => {
    // comments may document the boundary; executable SQL must not reference it
    expect(/mapper_basement/i.test(EXECUTABLE)).toBe(false);
    expect(/create\s+(or\s+replace\s+)?function/i.test(MIGRATION)).toBe(false);
    expect(/\binsert\s+into\b/i.test(MIGRATION)).toBe(false);
    expect(/\bupdate\s+public\./i.test(MIGRATION)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(MIGRATION)).toBe(false);
    expect(/references\s+public\.mapper_basement/i.test(MIGRATION)).toBe(false);
    expect(/drop\s+table/i.test(MIGRATION)).toBe(false);
  });
});

describe('Slice C leaves the runtime + reference base untouched', () => {
  it('the runtime service still reads the locked reference base (mapper_basement)', () => {
    expect(SERVICE.includes("const TABLE = 'mapper_basement'")).toBe(true);
    expect(SERVICE.includes('ingredients_final_v0_95_no_npac')).toBe(false);
  });
});
