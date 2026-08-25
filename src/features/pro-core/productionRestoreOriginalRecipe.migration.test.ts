import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260825153000_production_restore_original_recipe.sql',
  ),
  'utf8',
);

describe('Production restore-original-recipe authorization migration', () => {
  it('extends both fail-closed stable-option allow-lists without rewriting the proof RPC', () => {
    expect(migration).toContain('production_rescue_authorizations_stable_option_id_check');
    expect(migration).toContain("'restore_original_recipe'");
    expect(migration).toContain('pg_get_functiondef');
    expect(migration).toContain('Production Rescue stable-option allow-list signature changed');
    expect(migration).not.toContain('create or replace function public.production_create');
  });
});
