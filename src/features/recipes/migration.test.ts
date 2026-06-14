/// <reference types="node" />
/**
 * Phase 2A.2 — the saved-recipes migration must exist with RLS and owner-scoped
 * policies, and must not depend on a privileged server role in the frontend repo.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', '0001_auth_my_recipes.sql'), 'utf8');

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
