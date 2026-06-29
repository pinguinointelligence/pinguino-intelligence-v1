/// <reference types="node" />
/**
 * product_snapshots migration guard (0011).
 *
 * Locks migration 0011 as a SAFE, additive history table: it creates exactly one new table
 * (public.product_snapshots), owner-scoped + append-only (SELECT/INSERT policies only, no
 * UPDATE/DELETE), grants to `authenticated` only, FK to public.products ON DELETE CASCADE,
 * and touches NOTHING existing — no ALTER of public.products, no mapper_basement, no
 * destructive op, no npac_value. Static SQL guard (vitest node env); no live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const MIGRATION = readFileSync(join(REPO, 'supabase', 'migrations', '0011_product_snapshots.sql'), 'utf8');
const EXECUTABLE = MIGRATION.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

describe('product_snapshots migration (0011) — safe + additive', () => {
  it('creates exactly the new product_snapshots table (idempotent), and no other table', () => {
    expect(/create table if not exists public\.product_snapshots/i.test(EXECUTABLE)).toBe(true);
    expect((EXECUTABLE.match(/create table/gi) ?? []).length).toBe(1);
  });

  it('does NOT alter public.products or touch the locked reference base', () => {
    expect(/alter table public\.products\b/i.test(EXECUTABLE)).toBe(false);
    expect(/mapper_basement/i.test(EXECUTABLE)).toBe(false);
  });

  it('carries the captured history columns', () => {
    for (const col of [
      'product_id', 'owner_user_id', 'snapshot_at', 'change_type', 'price', 'package_size',
      'ingredients_text', 'source_url', 'ocr_text', 'fat_percent', 'saturated_fat_percent',
      'carbohydrate_percent', 'total_sugars_percent', 'protein_percent', 'salt_percent',
      'kcal_per_100g', 'detected_changes',
    ]) {
      expect(EXECUTABLE.includes(col), col).toBe(true);
    }
  });

  it('FKs to public.products ON DELETE CASCADE', () => {
    expect(/references public\.products\(id\) on delete cascade/i.test(EXECUTABLE)).toBe(true);
  });

  it('change_type CHECK = the expected change kinds', () => {
    const m = EXECUTABLE.match(/change_type in \(([\s\S]*?)\)/i);
    const vals = (m?.[1]?.match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
    expect(vals).toEqual(['created', 'price', 'package', 'nutrition', 'ingredients', 'image', 'source', 'other']);
  });

  it('is APPEND-ONLY + owner-scoped: SELECT/INSERT policies only, no UPDATE/DELETE policy', () => {
    expect(/enable row level security/i.test(EXECUTABLE)).toBe(true);
    expect(/for select using \(auth\.uid\(\) = owner_user_id\)/i.test(EXECUTABLE)).toBe(true);
    expect(/for insert with check \(auth\.uid\(\) = owner_user_id\)/i.test(EXECUTABLE)).toBe(true);
    expect(/for update/i.test(EXECUTABLE)).toBe(false);
    expect(/for delete/i.test(EXECUTABLE)).toBe(false);
  });

  it('grants SELECT + INSERT to authenticated only (no anon, no delete/update, no service_role)', () => {
    expect(/grant select, insert on public\.product_snapshots to authenticated/i.test(EXECUTABLE)).toBe(true);
    expect(/to anon\b/i.test(EXECUTABLE)).toBe(false);
    expect(/service_role/i.test(EXECUTABLE)).toBe(false);
    expect(/grant .*delete.* on public\.product_snapshots/i.test(EXECUTABLE)).toBe(false);
  });

  it('no npac_value, no destructive op', () => {
    expect(/npac_value/i.test(MIGRATION)).toBe(false);
    expect(/\b(drop|truncate)\b/i.test(EXECUTABLE)).toBe(false);
    expect(/delete from/i.test(EXECUTABLE)).toBe(false);
  });
});
