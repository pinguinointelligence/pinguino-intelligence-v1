/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/20260912225438_off_mirror_products.sql'),
  'utf8',
).replace(/\r\n?/g, '\n');

const executable = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const productsTable = executable.match(
  /create table if not exists off_mirror\.products \([\s\S]*?\n\);/,
)?.[0] ?? '';

describe('private Open Food Facts mirror migration', () => {
  it('creates a deterministic, unique GTIN-14 lookup', () => {
    expect(executable).toMatch(
      /create or replace function off_mirror\.normalize_gtin14\(candidate text\)[\s\S]*?immutable[\s\S]*?char_length\(code\) in \(8, 12, 13, 14\)[\s\S]*?lpad\(code, 14, '0'\)/,
    );
    expect(productsTable).toMatch(/gtin14 text primary key/);
    expect(productsTable).toMatch(/ean text not null unique/);
    expect(productsTable).toMatch(/check \(gtin14 = off_mirror\.normalize_gtin14\(ean\)\)/);
  });

  it('stores the required OFF fields and provenance, with no image columns', () => {
    for (const field of [
      'product_name',
      'brand',
      'manufacturer',
      'quantity',
      'ingredients',
      'allergens',
      'nutrition jsonb',
      'nutrition_basis',
      'categories',
      'countries_markets',
      'off_url',
      'off_updated_at',
      'source_row_number',
      'import_run_id',
    ]) {
      expect(productsTable, field).toContain(field);
    }
    expect(productsTable).not.toMatch(/\bimage(?:_|s\b)/i);
    expect(executable).toMatch(
      /import_run_id uuid not null references off_mirror\.sync_runs\(id\) on delete restrict/,
    );
  });

  it('denies all client roles and enables RLS without public policies', () => {
    expect(executable).toMatch(
      /revoke all on schema off_mirror from public, anon, authenticated, service_role/,
    );
    expect(executable).toMatch(/alter table off_mirror\.sync_runs enable row level security/);
    expect(executable).toMatch(/alter table off_mirror\.products enable row level security/);
    expect(executable).not.toMatch(/create policy/i);
    expect(executable).not.toMatch(/grant (?:select|insert|update|delete|usage|execute)/i);
  });

  it('indexes provenance while primary and unique constraints cover EAN lookup', () => {
    expect(executable).toMatch(
      /create index if not exists off_mirror_products_import_run_id_idx\s+on off_mirror\.products \(import_run_id\)/,
    );
  });
});
