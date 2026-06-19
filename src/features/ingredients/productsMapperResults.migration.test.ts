/// <reference types="node" />
/**
 * Mapper result columns migration guard (Slice E / 0008).
 *
 * Locks migration 0008: the additive, nullable Mapper-result columns added to
 * public.products to store one D2 productMatcher result. Asserts the 11 columns
 * exist as nullable / default-less ADD COLUMN IF NOT EXISTS, the three enum
 * CHECKs match the approved domains exactly, candidate_count allows NULL and
 * enforces >= 0, and — critically — that NOTHING writes the locked reference
 * base (no FK, no trigger, no function, no DML; executable SQL never names it).
 * Also re-locks the boundary: the runtime still reads mapper_basement, the
 * productMatcher stays pure, the products service does not import it, and
 * ProductRow carries no mapper-result fields yet (D3 write-back is future).
 * Static SQL / source-text guard (vitest node env); no live DB, no runtime change.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

const MIGRATION = read('supabase', 'migrations', '0008_products_mapper_results.sql');
const INGREDIENTS = read('src', 'services', 'ingredients.ts');
const PRODUCTS_SERVICE = read('src', 'services', 'products.ts');
const PRODUCT_ROW = read('src', 'data', 'products', 'productRow.ts');
const MATCHER = read('src', 'data', 'products', 'productMatcher.ts');

/** The migration with every SQL line comment (-- … end of line) removed. */
const EXECUTABLE = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** Comment-strip TS source (block + line) so doc text never trips a literal scan. */
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The 11 new columns, in declaration order, with their SQL types. */
const COLUMN_TYPES: ReadonlyArray<readonly [string, string]> = [
  ['matched_basement_id', 'text'],
  ['match_confidence', 'text'],
  ['match_method', 'text'],
  ['mapper_status', 'text'],
  ['mapper_notes', 'text'],
  ['normalized_name', 'text'],
  ['normalized_category', 'text'],
  ['needs_review_reason', 'text'],
  ['missing_fields_json', 'jsonb'],
  ['candidate_ids', 'jsonb'],
  ['candidate_count', 'integer'],
];

/** Extract the quoted values from a nullable enum CHECK:
 * `check (<col> is null or <col> in ('a', 'b', …))`. */
function checkValues(col: string): string[] | null {
  const m = EXECUTABLE.match(
    new RegExp(`check \\(${col} is null or ${col} in \\(([\\s\\S]*?)\\)\\)`, 'i'),
  );
  if (!m) return null;
  return (m[1]!.match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
}

describe('Mapper result columns migration (0008)', () => {
  it('targets ALTER TABLE public.products and adds exactly the 11 columns via ADD COLUMN IF NOT EXISTS', () => {
    expect(/alter table public\.products/i.test(MIGRATION)).toBe(true);
    for (const [col, type] of COLUMN_TYPES) {
      expect(new RegExp(`add column if not exists ${col} ${type}`, 'i').test(EXECUTABLE), col).toBe(true);
    }
    // exactly 11 ADD COLUMN statements in the executable DDL — no more, no fewer
    expect((EXECUTABLE.match(/add column if not exists/gi) ?? []).length).toBe(11);
  });

  it('every new column is nullable with no default (no NOT NULL / DEFAULT in the executable DDL)', () => {
    expect(/\bnot null\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\bdefault\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('match_confidence CHECK = exactly the six confidence values (NULL allowed)', () => {
    expect(checkValues('match_confidence')).toEqual([
      'exact', 'high', 'medium', 'low', 'needs_review', 'rejected',
    ]);
  });

  it('match_method CHECK = exactly the eight method values incl. manual_mapping (NULL allowed)', () => {
    expect(checkValues('match_method')).toEqual([
      'exact_ean', 'exact_normalized_name', 'brand_name', 'category_composition_similarity',
      'ingredient_type', 'fuzzy_name', 'no_confident_match', 'manual_mapping',
    ]);
  });

  it('mapper_status CHECK = exactly the five status values (NULL allowed)', () => {
    expect(checkValues('mapper_status')).toEqual([
      'unmatched', 'matched', 'ambiguous', 'needs_review', 'rejected',
    ]);
  });

  it('candidate_count allows NULL and enforces >= 0', () => {
    expect(/check \(candidate_count is null or candidate_count >= 0\)/i.test(EXECUTABLE)).toBe(true);
  });

  it('adds no npac_value (raw + executable)', () => {
    expect(/npac_value/i.test(MIGRATION)).toBe(false);
    expect(/npac_value/i.test(EXECUTABLE)).toBe(false);
  });

  it('defers calculated_profile_json and source_values_json (absent from the executable DDL)', () => {
    expect(/calculated_profile_json/i.test(EXECUTABLE)).toBe(false);
    expect(/source_values_json/i.test(EXECUTABLE)).toBe(false);
  });

  it('matched_basement_id is plain text, never a foreign key', () => {
    expect(/add column if not exists matched_basement_id text/i.test(EXECUTABLE)).toBe(true);
    // no REFERENCES within the matched_basement_id clause (up to the next comma)
    expect(/matched_basement_id[^,]*references/i.test(EXECUTABLE)).toBe(false);
  });

  it('NO write path to the locked reference base: no mapper_basement, no FK, no function/trigger, no DML', () => {
    // comments may document the boundary; the executable SQL must never name it
    expect(/mapper_basement/i.test(EXECUTABLE)).toBe(false);
    expect(/references\s+public\.mapper_basement/i.test(MIGRATION)).toBe(false);
    expect(/create\s+(or\s+replace\s+)?function/i.test(MIGRATION)).toBe(false);
    expect(/create\s+trigger/i.test(MIGRATION)).toBe(false);
    expect(/\binsert\s+into\b/i.test(MIGRATION)).toBe(false);
    expect(/\bupdate\s+public\./i.test(MIGRATION)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(MIGRATION)).toBe(false);
    expect(/drop\s+table/i.test(MIGRATION)).toBe(false);
  });
});

describe('Slice E / 0008 — runtime + pure matcher stay locked; D3 has landed the TS layer', () => {
  it('the runtime ingredient service still reads the locked base (mapper_basement)', () => {
    expect(INGREDIENTS.includes("const TABLE = 'mapper_basement'")).toBe(true);
  });

  it('productMatcher remains pure (no DB / service / engine imports, no DB writes)', () => {
    const code = stripTs(MATCHER);
    expect(/supabase/i.test(code)).toBe(false);
    expect(/@\/services\//.test(code)).toBe(false);
    expect(/@\/engine/.test(code)).toBe(false);
    for (const w of ['.from(', '.insert(', '.update(', '.delete(']) {
      expect(code.includes(w), w).toBe(false);
    }
  });

  it('the products service now exposes the D3 write-back targeting these 0008 columns', () => {
    expect(/export async function saveProductMatchResult\(/.test(PRODUCTS_SERVICE)).toBe(true);
    expect(PRODUCTS_SERVICE.includes('productMatchResultToPatch')).toBe(true);
    // the write-back never reaches the locked base in executable code
    expect(/mapper_basement/i.test(stripTs(PRODUCTS_SERVICE))).toBe(false);
  });

  it('ProductRow now carries all 11 mapper-result fields these columns back (D3)', () => {
    const code = stripTs(PRODUCT_ROW);
    for (const f of [
      'matched_basement_id', 'match_confidence', 'match_method', 'mapper_status', 'mapper_notes',
      'normalized_name', 'normalized_category', 'needs_review_reason', 'missing_fields_json',
      'candidate_ids', 'candidate_count',
    ]) {
      expect(code.includes(f), f).toBe(true);
    }
  });
});
