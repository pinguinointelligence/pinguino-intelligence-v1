/// <reference types="node" />
/**
 * Product identity foundation migration guard (Slice D5A / 0009).
 *
 * Locks migration 0009: the DB-generated product code (sequence + function + default +
 * backfill + NOT NULL + unique), the IMMUTABLE digit-normalizer + generated normalized
 * EAN/barcode columns (leading zeros preserved), the identity/url/size columns, and the
 * PER-OWNER (never global) duplicate-prevention indexes. Critically, it re-locks the hard
 * rule: the only new functions are read-only (next_product_code, normalize_to_digits) and
 * NOTHING writes / names the locked reference base. Static SQL/source-text guard
 * (comment-stripped executable scan); no live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

const MIGRATION = read('supabase', 'migrations', '0009_products_identity.sql');
const INGREDIENTS = read('src', 'services', 'ingredients.ts');
const PRODUCTS_SERVICE = read('src', 'services', 'products.ts');
const ORCHESTRATOR = read('src', 'services', 'productMapper.ts');

/** The migration with every SQL line comment (-- … end of line) removed. */
const EXECUTABLE = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('Product identity migration — product code (0009)', () => {
  it('creates the products_code_seq sequence (idempotent)', () => {
    expect(/create sequence if not exists public\.products_code_seq/i.test(MIGRATION)).toBe(true);
  });

  it('creates next_product_code() producing the PR-ING- + 6-digit-zero-padded format', () => {
    expect(/create or replace function public\.next_product_code\s*\(\s*\)/i.test(MIGRATION)).toBe(true);
    expect(MIGRATION.includes("'PR-ING-'")).toBe(true);
    expect(/lpad\(\s*nextval\(\s*'public\.products_code_seq'\s*\)::text\s*,\s*6\s*,\s*'0'\s*\)/i.test(MIGRATION)).toBe(true);
  });

  it('wires product_code DB-side: column + default + backfill + NOT NULL + unique index', () => {
    expect(/add column if not exists product_code text/i.test(EXECUTABLE)).toBe(true);
    expect(/alter column product_code set default public\.next_product_code\(\)/i.test(EXECUTABLE)).toBe(true);
    expect(/update public\.products set product_code = public\.next_product_code\(\) where product_code is null/i.test(EXECUTABLE)).toBe(true);
    expect(/alter column product_code set not null/i.test(EXECUTABLE)).toBe(true);
    expect(/create unique index if not exists products_product_code_uniq on public\.products \(product_code\)/i.test(EXECUTABLE)).toBe(true);
  });

  it('generates product codes DB-side — no app-side MAX / nextval / product_code in the service', () => {
    expect(/\bmax\s*\(/i.test(PRODUCTS_SERVICE)).toBe(false);
    expect(/nextval/i.test(PRODUCTS_SERVICE)).toBe(false);
    expect(PRODUCTS_SERVICE.includes('product_code')).toBe(false);
  });
});

describe('Product identity migration — normalized columns (0009)', () => {
  it('defines an IMMUTABLE normalize_to_digits that strips non-digits (preserving leading zeros)', () => {
    expect(/create or replace function public\.normalize_to_digits\s*\(\s*input text\s*\)/i.test(MIGRATION)).toBe(true);
    expect(/returns text language sql immutable/i.test(MIGRATION)).toBe(true);
    expect(/regexp_replace\(\s*coalesce\(input, ''\)\s*,\s*'\[\^0-9\]'\s*,\s*''\s*,\s*'g'\s*\)/i.test(MIGRATION)).toBe(true);
    // nothing that would DROP leading zeros (no trim/ltrim/numeric cast of the value)
    expect(/ltrim|trim\s*\(\s*leading|::\s*(bigint|integer|numeric)/i.test(EXECUTABLE)).toBe(false);
  });

  it('adds ean_code_normalized + barcode_normalized as GENERATED ALWAYS … STORED', () => {
    expect(/add column if not exists ean_code_normalized text\s+generated always as \(public\.normalize_to_digits\(ean_code\)\) stored/i.test(EXECUTABLE)).toBe(true);
    expect(/add column if not exists barcode_normalized text\s+generated always as \(public\.normalize_to_digits\(barcode\)\) stored/i.test(EXECUTABLE)).toBe(true);
  });

  it('does NOT re-add normalized_name / normalized_category (already in 0008)', () => {
    expect(/add column if not exists normalized_name\b/i.test(EXECUTABLE)).toBe(false);
    expect(/add column if not exists normalized_category\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('adds the identity / url / size columns', () => {
    for (const c of ['product_url', 'source_url', 'package_size', 'product_identity_hash']) {
      expect(new RegExp(`add column if not exists ${c} text`, 'i').test(EXECUTABLE), c).toBe(true);
    }
  });
});

describe('Product identity migration — per-owner duplicate prevention (0009)', () => {
  it('adds PER-OWNER partial unique indexes on normalized EAN + barcode (never global)', () => {
    expect(/create unique index if not exists products_owner_ean_norm_uniq\s+on public\.products \(owner_user_id, ean_code_normalized\)\s+where ean_code_normalized <> ''/i.test(EXECUTABLE)).toBe(true);
    expect(/create unique index if not exists products_owner_barcode_norm_uniq\s+on public\.products \(owner_user_id, barcode_normalized\)\s+where barcode_normalized <> ''/i.test(EXECUTABLE)).toBe(true);
    // no GLOBAL unique on a bare ean/barcode column
    expect(/create unique index[^\n]*\(\s*ean_code_normalized\s*\)/i.test(EXECUTABLE)).toBe(false);
    expect(/create unique index[^\n]*\(\s*barcode_normalized\s*\)/i.test(EXECUTABLE)).toBe(false);
  });

  it('adds the non-unique identity + source lookup indexes', () => {
    expect(/create index if not exists products_owner_identity_hash_idx\s+on public\.products \(owner_user_id, product_identity_hash\)/i.test(EXECUTABLE)).toBe(true);
    expect(/create index if not exists products_owner_source_url_idx\s+on public\.products \(owner_user_id, source_url\)/i.test(EXECUTABLE)).toBe(true);
  });
});

describe('Product identity migration — boundaries (0009)', () => {
  it('carries no npac_value (raw + executable)', () => {
    expect(/npac_value/i.test(MIGRATION)).toBe(false);
    expect(/npac_value/i.test(EXECUTABLE)).toBe(false);
  });

  it('NEVER touches the locked reference base — no mapper_basement, no FK, no trigger, only the 2 read-only functions', () => {
    expect(/mapper_basement/i.test(EXECUTABLE)).toBe(false);
    expect(/references\s+public\.mapper_basement/i.test(MIGRATION)).toBe(false);
    expect(/create\s+trigger/i.test(MIGRATION)).toBe(false);
    // exactly two functions, both the named read-only helpers
    expect((MIGRATION.match(/create\s+or\s+replace\s+function/gi) ?? []).length).toBe(2);
    expect(/create or replace function public\.(next_product_code|normalize_to_digits)/gi.test(MIGRATION)).toBe(true);
  });

  it('writes ONLY public.products — no DML against any other table', () => {
    expect(/\binsert\s+into\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(EXECUTABLE)).toBe(false);
    expect(/drop\s+table/i.test(EXECUTABLE)).toBe(false);
    // the only UPDATE is the product_code backfill on public.products
    expect(/update\s+public\.products/i.test(EXECUTABLE)).toBe(true);
    expect(/update\s+public\.(?!products\b)/i.test(EXECUTABLE)).toBe(false);
  });
});

describe('Slice D5A leaves runtime, the service, and the orchestrator untouched', () => {
  it('the runtime ingredient service still reads the locked base (mapper_basement)', () => {
    expect(INGREDIENTS.includes("const TABLE = 'mapper_basement'")).toBe(true);
  });

  it('the products service still writes ONLY public.products (unchanged this slice)', () => {
    expect(PRODUCTS_SERVICE.includes("const TABLE = 'products'")).toBe(true);
  });

  it('the D4 orchestrator is unchanged (still the explicit matchAndSaveProduct entry)', () => {
    expect(/export async function matchAndSaveProduct\(\s*productId: string\s*\)/.test(ORCHESTRATOR)).toBe(true);
  });
});
