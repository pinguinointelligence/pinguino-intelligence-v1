/// <reference types="node" />
/**
 * Legacy Products cleanup migration guard (0034).
 *
 * Locks migration 0034 as a SAFE, reversible, EXPLICITLY-scoped delete of the legacy
 * Mercadona import rows only:
 *  - never a bare `delete from public.products` (must carry the explicit predicate);
 *  - the predicate is the verified safe set (matched → content in mapper_basement, or
 *    rejected/dead), which RETAINS the unmatched drafts;
 *  - a reversible backup (`create table if not exists _backup_legacy_products_0034 as select`)
 *    for BOTH products and product_snapshots exists BEFORE any delete;
 *  - FK-safe order: dependent product_snapshots are deleted before the products;
 *  - staging-only, never prod, no TRUNCATE, no ALTER/DROP of the products table.
 * Static SQL guard (vitest node env); no live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '0034_remove_legacy_products.sql'),
  'utf8',
);
// Executable view = comments stripped, whitespace normalized (so predicate/order checks
// only see real SQL, never the header prose). Split on /\r?\n/ so CRLF files strip cleanly
// (a trailing \r would otherwise defeat the `--.*$` comment strip).
const EXECUTABLE = MIGRATION.split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const NORM = EXECUTABLE.replace(/\s+/g, ' ').toLowerCase();

/** The single explicit predicate every backup + delete statement must carry. */
const PREDICATE =
  "source_type = 'mercadona' and (matched_basement_id is not null or status = 'rejected')";

describe('legacy products cleanup migration (0034) — safe + explicit + reversible', () => {
  it('NEVER contains a bare `delete from products` (predicate is mandatory)', () => {
    // Every delete on products/product_snapshots must be followed by a WHERE clause.
    const deletes = NORM.match(/delete from public\.\w+[^;]*/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const stmt of deletes) {
      expect(stmt.includes(' where '), `unguarded delete: ${stmt}`).toBe(true);
    }
    expect(/delete from public\.products\s*;/i.test(EXECUTABLE)).toBe(false);
    expect(/delete from public\.products\s+where\s+true/i.test(EXECUTABLE)).toBe(false);
  });

  it('every delete + backup carries the explicit legacy predicate', () => {
    // Predicate appears for: products backup, snapshots backup subquery, snapshots delete
    // subquery, products delete → at least 4 occurrences.
    const occurrences = NORM.split(PREDICATE).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(4);
  });

  it('RETAINS the unmatched drafts (predicate deletes matched OR rejected only)', () => {
    // A cleanup that removed unmatched rows would test `matched_basement_id is null`.
    expect(NORM.includes('matched_basement_id is not null')).toBe(true);
    expect(/matched_basement_id\s+is\s+null/i.test(EXECUTABLE)).toBe(false);
  });

  it('creates reversible backups for BOTH products and product_snapshots BEFORE any delete', () => {
    const productsBackup =
      /create table if not exists public\._backup_legacy_products_0034\s+as\s+select/i;
    const snapshotsBackup =
      /create table if not exists public\._backup_legacy_product_snapshots_0034\s+as\s+select/i;
    expect(productsBackup.test(EXECUTABLE)).toBe(true);
    expect(snapshotsBackup.test(EXECUTABLE)).toBe(true);
    // Both backups precede the first delete.
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
    expect(MIGRATION.includes('tunabqqrwabacxjcxxkz')).toBe(true);
    expect(MIGRATION.includes('riwipywgqobrulyzrzad')).toBe(true); // named as NEVER
    expect(MIGRATION.includes('tjntmljkrxbpwjmkautu')).toBe(true); // named as NEVER
  });
});
