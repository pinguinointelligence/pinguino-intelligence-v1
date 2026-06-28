/// <reference types="node" />
/**
 * Product-code sequence grant migration guard (Slice 0010).
 *
 * Locks migration 0010: the LEAST-PRIVILEGE fix for the "permission denied for sequence
 * products_code_seq" failure seen in the 3-row Mercadona import smoke test. The migration
 * must do ONLY two grants, to `authenticated` ONLY — USAGE on the product-code sequence
 * (what nextval needs) + EXECUTE on next_product_code() — and nothing else: no SELECT/UPDATE
 * on the sequence, no anon/public/service_role, no RLS/schema/function/sequence-logic change,
 * no DML, no SECURITY DEFINER, no mapper_basement. Static SQL guard (comment-stripped
 * executable scan); no live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '0010_products_code_sequence_grants.sql'),
  'utf8',
);

/** The migration with every SQL line comment (-- … end of line) removed. */
const EXECUTABLE = MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('Product-code sequence grants migration — least-privilege grants (0010)', () => {
  it('grants USAGE on public.products_code_seq to authenticated', () => {
    expect(
      /grant\s+usage\s+on\s+sequence\s+public\.products_code_seq\s+to\s+authenticated/i.test(EXECUTABLE),
    ).toBe(true);
  });

  it('grants EXECUTE on public.next_product_code() to authenticated', () => {
    expect(
      /grant\s+execute\s+on\s+function\s+public\.next_product_code\s*\(\s*\)\s+to\s+authenticated/i.test(
        EXECUTABLE,
      ),
    ).toBe(true);
  });

  it('contains EXACTLY two grant statements, both to authenticated only', () => {
    expect((EXECUTABLE.match(/\bgrant\b/gi) ?? []).length).toBe(2);
    expect((EXECUTABLE.match(/\bto\s+authenticated\b/gi) ?? []).length).toBe(2);
  });
});

describe('Product-code sequence grants migration — boundaries (0010)', () => {
  it('does NOT grant SELECT or UPDATE on the sequence (USAGE only)', () => {
    expect(/\bselect\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\bupdate\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('grants to NO other role — no anon, no public role, no service_role', () => {
    expect(/\bto\s+anon\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\bto\s+public\b/i.test(EXECUTABLE)).toBe(false); // the schema-qualified public.* is not a grantee
    expect(/service[_-]?role/i.test(EXECUTABLE)).toBe(false);
  });

  it('never names the locked reference base', () => {
    expect(/mapper_basement/i.test(EXECUTABLE)).toBe(false);
  });

  it('makes NO schema change (no alter/create table, add column, or drop)', () => {
    expect(/alter\s+table/i.test(EXECUTABLE)).toBe(false);
    expect(/create\s+table/i.test(EXECUTABLE)).toBe(false);
    expect(/add\s+column/i.test(EXECUTABLE)).toBe(false);
    expect(/\bdrop\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('makes NO RLS change (no policy, no row level security)', () => {
    expect(/\bpolicy\b/i.test(EXECUTABLE)).toBe(false);
    expect(/row\s+level\s+security/i.test(EXECUTABLE)).toBe(false);
  });

  it('changes NO function or sequence logic (no create/alter function/sequence, no trigger)', () => {
    expect(/create\s+(or\s+replace\s+)?function/i.test(EXECUTABLE)).toBe(false);
    expect(/alter\s+function/i.test(EXECUTABLE)).toBe(false);
    expect(/create\s+sequence/i.test(EXECUTABLE)).toBe(false);
    expect(/alter\s+sequence/i.test(EXECUTABLE)).toBe(false);
    expect(/create\s+trigger/i.test(EXECUTABLE)).toBe(false);
  });

  it('runs NO DML (no insert / update / delete) — imports no products', () => {
    expect(/\binsert\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\bupdate\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\bdelete\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('uses NO SECURITY DEFINER (the grant approach is sufficient)', () => {
    expect(/security\s+definer/i.test(EXECUTABLE)).toBe(false);
  });

  it('carries no npac_value', () => {
    expect(/npac_value/i.test(EXECUTABLE)).toBe(false);
  });
});
