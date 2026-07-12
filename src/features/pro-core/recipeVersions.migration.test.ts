/// <reference types="node" />
/**
 * 0027 saved-recipes-and-versions migration guard — contract-lockstep + safety invariants,
 * proven statically against the SQL text (comment-stripped). No live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeVersionSource } from './recipeContracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const CODE = readFileSync(join(REPO, 'supabase', 'migrations', '0027_saved_recipes_and_versions.sql'), 'utf8').replace(/--.*$/gm, '');

const SOURCES: RecipeVersionSource[] = ['manual', 'starter_draft', 'optimizer_correction', 'restored', 'imported'];

describe('0027 recipe-versions migration', () => {
  it('adds recipe_versions + saved_recipe_meta and does NOT recreate saved_recipes', () => {
    expect(CODE.includes('create table if not exists public.recipe_versions')).toBe(true);
    expect(CODE.includes('create table if not exists public.saved_recipe_meta')).toBe(true);
    expect(/create table if not exists public\.saved_recipes\b/.test(CODE)).toBe(false);
  });

  it('enables RLS and authorizes by auth.uid(), never email', () => {
    expect(CODE.includes('alter table public.recipe_versions enable row level security')).toBe(true);
    expect(CODE.includes('alter table public.saved_recipe_meta enable row level security')).toBe(true);
    expect(CODE.includes('auth.uid()')).toBe(true);
    expect(/using \([^)]*email|with check \([^)]*email/i.test(CODE)).toBe(false);
  });

  it('recipe_versions is IMMUTABLE (select + insert only, no update/delete)', () => {
    expect(/on public\.recipe_versions\s+for update/.test(CODE)).toBe(false);
    expect(/on public\.recipe_versions\s+for delete/.test(CODE)).toBe(false);
    expect(/grant[^;]*update[^;]*recipe_versions to authenticated/.test(CODE)).toBe(false);
    expect(/grant[^;]*delete[^;]*recipe_versions to authenticated/.test(CODE)).toBe(false);
  });

  it('version source check is lockstep with the TS union', () => {
    const sources = CODE.match(/source in \(([^)]*)\)/)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(new Set(sources)).toEqual(new Set(SOURCES));
  });

  it('constraints: positive batch, valid version sequence, unique per recipe; no anon', () => {
    expect(/total_batch_g > 0/.test(CODE)).toBe(true);
    expect(/version_number >= 1/.test(CODE)).toBe(true);
    expect(/unique \(recipe_id, version_number\)/.test(CODE)).toBe(true);
    expect(/to anon\b/.test(CODE)).toBe(false);
  });
});
