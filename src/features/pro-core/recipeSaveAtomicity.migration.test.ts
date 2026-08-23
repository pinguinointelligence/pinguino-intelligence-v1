/**
 * Migration 20260823103000 — the save contract in the DATABASE (owner v1.4).
 *
 * Pins the two guarantees the client cannot provide on its own: the first save writes the library
 * columns inside the same transaction as v1, and appending v2+ (or a restore) is ONE transaction
 * whose version number is derived under the parent row lock.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const CODE = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260823103000_recipe_save_atomicity_and_metadata.sql'),
  'utf8',
);
const SQL = CODE.replace(/--.*$/gm, '');

describe('create_recipe_with_v1 — the first save writes honest library metadata', () => {
  it('accepts the serving profile and engine label the pre-v1.4 signature had no room for', () => {
    expect(SQL).toContain('p_serving_profile text default null');
    expect(SQL).toContain('p_active_engine_label text default null');
  });

  it('writes them into saved_recipes alongside product_type', () => {
    const insert = SQL.slice(SQL.indexOf('insert into public.saved_recipes'));
    expect(insert).toMatch(/product_type,\s*\n?\s*serving_profile, active_engine_label/);
  });

  it('retires the previous overload so an old client cannot route around the columns', () => {
    expect(SQL).toContain('drop function if exists public.create_recipe_with_v1(');
    expect(SQL).toMatch(/drop function if exists public\.create_recipe_with_v1\([^)]*jsonb\s*\n?\);/);
  });

  it('stays SECURITY INVOKER so RLS still decides ownership', () => {
    const matches = SQL.match(/security invoker/g) ?? [];
    expect(matches.length).toBe(2); // create + append
    expect(SQL).not.toMatch(/security definer/i);
  });
});

describe('append_recipe_version_v1 — one transaction, one version number', () => {
  it('exists and is granted only to authenticated', () => {
    expect(SQL).toContain('create or replace function public.append_recipe_version_v1');
    expect(SQL).toMatch(/revoke all on function public\.append_recipe_version_v1/);
    expect(SQL).toMatch(/grant execute on function public\.append_recipe_version_v1[\s\S]*?to authenticated;/);
  });

  it('locks the parent row before deriving the next number (no duplicate vN)', () => {
    const body = SQL.slice(SQL.indexOf('create or replace function public.append_recipe_version_v1'));
    const lockAt = body.indexOf('for update');
    const deriveAt = body.indexOf('coalesce(max(version_number), 0) + 1');
    expect(lockAt).toBeGreaterThan(-1);
    expect(deriveAt).toBeGreaterThan(lockAt);
  });

  it('inserts the version and advances BOTH aggregate rows in the same function body', () => {
    const body = SQL.slice(SQL.indexOf('create or replace function public.append_recipe_version_v1'));
    expect(body).toContain('insert into public.recipe_versions');
    expect(body).toContain('update public.saved_recipes set');
    expect(body).toContain('update public.saved_recipe_meta set');
    // …and the aggregate follows the version it just wrote.
    expect(body).toContain('latest_version_number = v_next');
  });

  it('never updates or deletes an existing version row (history is append-only)', () => {
    const body = SQL.slice(SQL.indexOf('create or replace function public.append_recipe_version_v1'));
    expect(body).not.toMatch(/update public\.recipe_versions/);
    expect(body).not.toMatch(/delete from public\.recipe_versions/);
  });

  it('carries the restore provenance so a restored version is identifiable', () => {
    expect(SQL).toContain('p_restored_from_version integer default null');
  });

  it('never overwrites a known column with NULL', () => {
    const body = SQL.slice(SQL.indexOf('update public.saved_recipes set'));
    expect(body).toContain('product_type = coalesce(p_product_profile, product_type)');
    expect(body).toContain('serving_profile = coalesce(p_serving_profile, serving_profile)');
  });
});
