/// <reference types="node" />
/**
 * Phase 2A.2 — the saved-recipes migration must exist with RLS and owner-scoped
 * policies, and must not depend on a privileged server role in the frontend repo.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const migration = (file: string) =>
  readFileSync(join(REPO, 'supabase', 'migrations', file), 'utf8');

const SQL = migration('0001_auth_my_recipes.sql');
// whitespace-normalized, lowercased grants migration for tolerant matching
const GRANTS = migration('0002_grant_profile_and_recipe_permissions.sql')
  .toLowerCase()
  .replace(/\s+/g, ' ');

describe('Phase 2A.2 migration', () => {
  it('creates both tables with recipe_input as JSONB', () => {
    expect(SQL.includes('public.profiles')).toBe(true);
    expect(SQL.includes('public.saved_recipes')).toBe(true);
    expect(SQL.includes('recipe_input jsonb')).toBe(true);
  });

  it('enables row level security on both tables', () => {
    expect(SQL.includes('alter table public.profiles enable row level security')).toBe(true);
    expect(SQL.includes('alter table public.saved_recipes enable row level security')).toBe(true);
  });

  it('scopes saved_recipes to the owner for all CRUD (auth.uid() = user_id)', () => {
    for (const op of ['select', 'insert', 'update', 'delete']) {
      expect(SQL.includes(`saved_${op}_own`), op).toBe(true);
    }
    const ownerChecks = (SQL.match(/auth\.uid\(\) = user_id/g) ?? []).length;
    expect(ownerChecks).toBeGreaterThanOrEqual(4);
    expect(SQL.includes('auth.uid() = id')).toBe(true); // profiles
  });

  it('does not depend on the service role', () => {
    expect(/service[_-]?role/i.test(SQL)).toBe(false);
  });
});

describe('Phase 2A.2 grants migration (0002)', () => {
  it('grants schema usage to anon + authenticated', () => {
    expect(GRANTS.includes('grant usage on schema public to anon, authenticated')).toBe(true);
  });

  it('grants profiles read/insert/update to authenticated', () => {
    expect(
      GRANTS.includes('grant select, insert, update on table public.profiles to authenticated'),
    ).toBe(true);
  });

  it('grants saved_recipes full CRUD to authenticated', () => {
    expect(
      GRANTS.includes(
        'grant select, insert, update, delete on table public.saved_recipes to authenticated',
      ),
    ).toBe(true);
  });

  it('does not grant to a privileged server role', () => {
    expect(/service[_-]?role/i.test(GRANTS)).toBe(false);
  });
});
