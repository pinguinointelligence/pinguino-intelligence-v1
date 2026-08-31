/// <reference types="node" />
/**
 * Community derivation must carry the source's ProductBehavior authority.
 *
 * ROOT CAUSE (served QA, 2026-08-31): copying ANY Community recipe with ingredient
 * lines failed with
 *
 *   create_recipe_with_v1 → P0001
 *   "recipe product behavior scope mismatch for milk-base:milk_3_5"
 *
 * The guard was CORRECT — `assert_recipe_behavior_authority_all_lines_v1` requires a
 * resolved snapshot per line. The fault was that the entitled read never returned
 * `product_composition`, so `useRecipeDerivation` passed `null` and every line looked
 * unresolved.
 *
 * Staging audit: of 4 published publications, the only one with lines carried
 * snapshots for 6 of 6 — the data was valid. The other three "worked" solely because
 * they have zero lines and the guard had nothing to check.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '20260831090000_publication_full_carries_composition.sql';
const SQL = readFileSync(
  resolve(import.meta.dirname, '../../../../supabase/migrations', MIGRATION),
  'utf8',
).replace(/\r\n?/g, '\n');
const EXEC = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const HOOK = readFileSync(
  join(process.cwd(), 'src/features/community/useRecipeDerivation.ts'),
  'utf8',
);

describe('the entitled read carries the composition', () => {
  it('returns product_composition from the immutable version', () => {
    expect(EXEC).toMatch(/'product_composition',\s*v_version\.product_composition/);
  });

  it('keeps every pre-existing key of the payload', () => {
    for (const key of [
      'ok', 'entitlement', 'publication_id', 'recipe_id', 'recipe_version_id',
      'version_number', 'title', 'creator_user_id', 'recipe_input',
      'engine_version', 'config_version', 'total_batch_g',
    ]) {
      expect(EXEC, key).toContain(`'${key}'`);
    }
  });

  it('does not widen visibility — the entitlement gate is byte-identical', () => {
    expect(EXEC).toMatch(/if v_uid is null then raise exception 'authentication required'/);
    expect(EXEC).toMatch(/v_pub\.creator_user_id <> v_uid and not public\.gellatti_has_paid_access_v1\(v_uid\)/);
    expect(EXEC).toMatch(/'reason', 'entitlement_required'/);
    expect(EXEC).toMatch(/status = 'published'/);
  });

  it('pins a fixed search_path and stays STABLE', () => {
    expect(EXEC).toMatch(/set search_path to 'pg_catalog', 'public'/);
    expect(EXEC).toMatch(/\bstable\b/i);
  });
});

describe('the guard is NOT weakened', () => {
  it('changes no authority function', () => {
    for (const guard of [
      'assert_recipe_behavior_authority_all_lines_v1',
      'assert_recipe_behavior_authority_v1',
      'recipe_behavior_write_guard_v1',
      'create_recipe_with_v1',
    ]) {
      expect(EXEC, guard).not.toMatch(new RegExp(`create or replace function[^;]*${guard}`));
    }
  });

  it('fabricates no composition anywhere in the client', () => {
    // The fix must PASS THROUGH the source's snapshots, never synthesise them.
    expect(HOOK).not.toMatch(/behaviorSnapshots\s*:/);
    expect(HOOK).toContain('productComposition: full.productComposition');
  });
});

describe('the derivation carries it through', () => {
  it('reads product_composition from the publication source', () => {
    expect(HOOK).toMatch(/productComposition: result\.product_composition \?\? null/);
  });

  it('states the remaining share-path gap instead of hiding it', () => {
    // The share RPCs still do not return a composition (verified on staging), so a
    // share of an ingredient-bearing recipe is still refused. That must be visible.
    expect(HOOK).toMatch(/KNOWN REMAINING GAP/);
    expect(HOOK).toMatch(/gellatti_open_share_v1/);
  });

  it('no longer hard-codes null on the publication path', () => {
    const derive = HOOK.slice(HOOK.indexOf('const { recipe } = await'), HOOK.indexOf('// 3. Attribution'));
    expect(derive).not.toMatch(/productComposition: null/);
  });
});
