/// <reference types="node" />
/**
 * Reviewed (semantic) legacy-products cleanup migration guard (0035).
 *
 * Locks migration 0035 as a SAFE, reversible, EXPLICITLY-enumerated delete of exactly the
 * legacy Mercadona rows the semantic audit proved are represented in `mapper_basement` (or are
 * dead), while RETAINING every genuinely-unmatched row and the one row with a required source
 * reference (PR-ING-000002, live-wired into the dev Mapper-smoke tool):
 *  - never a bare `delete from public.products` (must carry the explicit allow-list predicate);
 *  - the delete is an EXPLICIT 40-code product_code allow-list scoped `source_type='mercadona'`;
 *  - PR-ING-000002 is NOT in the delete list (retained — required reference);
 *  - a reversible backup (`create table if not exists _backup_legacy_products_0035 as select`)
 *    for BOTH products and product_snapshots exists BEFORE any delete;
 *  - FK-safe order: dependent product_snapshots are deleted before the products;
 *  - staging-only, never prod / MOOTOORS, no TRUNCATE, no ALTER/DROP of the products table.
 * Static SQL guard (vitest node env); no live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '0035_retire_legacy_products_reviewed.sql'),
  'utf8',
);
// Executable view = comments stripped, whitespace normalized (so predicate/order checks only
// see real SQL, never the header prose). Split on /\r?\n/ so CRLF files strip cleanly.
const EXECUTABLE = MIGRATION.split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const NORM = EXECUTABLE.replace(/\s+/g, ' ').toLowerCase();

/** The scoping every backup + delete statement must carry (allow-list follows in `in (...)`). */
const SCOPE = "source_type = 'mercadona' and product_code in (";

describe('reviewed legacy products cleanup migration (0035) — safe + explicit + reversible', () => {
  it('NEVER contains a bare `delete from products` (allow-list is mandatory)', () => {
    const deletes = NORM.match(/delete from public\.\w+[^;]*/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const stmt of deletes) {
      expect(stmt.includes(' where '), `unguarded delete: ${stmt}`).toBe(true);
    }
    expect(/delete from public\.products\s*;/i.test(EXECUTABLE)).toBe(false);
    expect(/delete from public\.products\s+where\s+true/i.test(EXECUTABLE)).toBe(false);
  });

  it('every delete + backup carries the explicit mercadona + product_code allow-list scope', () => {
    // products backup, snapshots backup subquery, snapshots delete subquery, products delete
    // → at least 4 occurrences of the scoped allow-list.
    const occurrences = NORM.split(SCOPE).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(4);
  });

  it('deletes EXACTLY the 40 audited product_codes and RETAINS PR-ING-000002', () => {
    // Isolate the final products delete statement and count its allow-list codes.
    const prodDelete = EXECUTABLE.slice(EXECUTABLE.search(/delete from public\.products\b/i));
    const codes = prodDelete.match(/PR-ING-\d{6}/g) ?? [];
    expect(new Set(codes).size).toBe(40);
    // The retained required-reference row must never appear in the delete list.
    expect(codes).not.toContain('PR-ING-000002');
    expect(NORM.includes("'pr-ing-000002'")).toBe(false);
  });

  it('creates reversible backups for BOTH products and product_snapshots BEFORE any delete', () => {
    const productsBackup =
      /create table if not exists public\._backup_legacy_products_0035\s+as\s+select/i;
    const snapshotsBackup =
      /create table if not exists public\._backup_legacy_product_snapshots_0035\s+as\s+select/i;
    expect(productsBackup.test(EXECUTABLE)).toBe(true);
    expect(snapshotsBackup.test(EXECUTABLE)).toBe(true);
    const firstDelete = EXECUTABLE.search(/delete from/i);
    expect(EXECUTABLE.search(productsBackup)).toBeGreaterThanOrEqual(0);
    expect(EXECUTABLE.search(productsBackup)).toBeLessThan(firstDelete);
    expect(EXECUTABLE.search(snapshotsBackup)).toBeLessThan(firstDelete);
  });

  it('is FK-safe: deletes dependent product_snapshots BEFORE products', () => {
    const snapDelete = EXECUTABLE.search(/delete from public\.product_snapshots/i);
    const prodDelete = EXECUTABLE.search(/delete from public\.products\b/i);
    expect(snapDelete).toBeGreaterThanOrEqual(0);
    expect(prodDelete).toBeGreaterThanOrEqual(0);
    expect(snapDelete).toBeLessThan(prodDelete);
  });

  it('never TRUNCATEs, and never ALTERs/DROPs the products table', () => {
    expect(/\btruncate\b/i.test(EXECUTABLE)).toBe(false);
    expect(/alter table public\.products\b/i.test(EXECUTABLE)).toBe(false);
    expect(/drop table public\.products\b/i.test(EXECUTABLE)).toBe(false);
  });

  it('is documented staging-only and never targets prod / MOOTOORS', () => {
    expect(MIGRATION.includes('tunabqqrwabacxjcxxkz')).toBe(true); // staging
    expect(MIGRATION.includes('riwipywgqobrulyzrzad')).toBe(true); // prod, named as NEVER
    expect(MIGRATION.includes('tjntmljkrxbpwjmkautu')).toBe(true); // MOOTOORS, named as NEVER
  });

  it('records the exact deleted-count (40) and retained-count (29) for owner review', () => {
    expect(/DELETED\s*=\s*40/i.test(MIGRATION)).toBe(true);
    expect(/RETAINED\s*=\s*29/i.test(MIGRATION)).toBe(true);
  });
});
