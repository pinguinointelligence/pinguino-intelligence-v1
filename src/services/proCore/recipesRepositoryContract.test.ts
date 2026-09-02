/**
 * E2 — RecipesRepository CONTRACT suite: one behavioural contract, executed against every adapter
 * shape a real surface can be wired to through the selector:
 *
 *   • in-memory (DEV singleton semantics — durable for the session, honestly non-durable across
 *     a reload, which the isLocalDev banner surfaces);
 *   • Supabase adapter over the fake migration-0027 store, legacy first-save path (no RPC);
 *   • Supabase adapter over the same store with the migration-0036 transactional RPC enabled.
 *
 * Proven for each: version CONTINUATION (v2, v3, …, never reset), restore = a NEW version (an old
 * snapshot is never overwritten), refresh/login persistence (a fresh adapter over the same store
 * continues the history), and owner isolation on list reads.
 *
 * RLS note (documented from the APPLIED migrations, not guessed): the fake store cannot execute
 * Postgres policies. In the real DB, migration 0027 scopes saved_recipe_meta/recipe_versions with
 * `auth.uid() = owner_user_id` policies (SELECT+INSERT only on recipe_versions — no UPDATE/DELETE
 * grant exists), and migration 0001 scopes saved_recipes by `auth.uid() = user_id`. The adapter
 * additionally owner-filters every list query, which is what this suite can and does prove.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { InMemoryRecipes } from './inMemoryRecipes';
import { inMemoryRecipesRepository, type RecipesRepository } from './recipesRepository';
import { supabaseRecipesRepository } from './supabaseRecipes';
import { FakeDB, makeClient } from './supabaseRecipesFake';

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const PRO: RecipeCapabilities = { canSaveRecipe: true, canViewRecipeVersions: true, canRestoreRecipeVersion: true, maxSavedRecipes: null, canViewExactGrams: true };

const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({ items, mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;

interface AdapterContext {
  repo: RecipesRepository;
  /** A brand-new repository instance over the SAME backing store — models refresh / re-login. */
  reopen: () => RecipesRepository;
}

const CONTEXTS: ReadonlyArray<{ name: string; make: () => AdapterContext }> = [
  {
    name: 'in-memory (DEV singleton semantics)',
    make: () => {
      let k = 0;
      const store = new InMemoryRecipes(
        () => `2026-07-12T10:00:${String((k += 1)).padStart(2, '0')}.000Z`,
        () => `id-${(k += 1)}`,
      );
      return {
        repo: inMemoryRecipesRepository(store),
        // Same store, new port wrapper — the DEV singleton persists within a session. (A browser
        // reload clears the store itself; that non-durability is surfaced by isLocalDev, not here.)
        reopen: () => inMemoryRecipesRepository(store),
      };
    },
  },
  {
    name: 'supabase adapter — legacy first save (no RPC in the database)',
    make: () => {
      const db = new FakeDB();
      return {
        repo: supabaseRecipesRepository(makeClient(db, 'user-1')),
        reopen: () => supabaseRecipesRepository(makeClient(db, 'user-1')),
      };
    },
  },
  {
    name: 'supabase adapter — transactional first save (migration-0036 RPC present)',
    make: () => {
      const db = new FakeDB();
      db.rpcEnabled = true;
      return {
        repo: supabaseRecipesRepository(makeClient(db, 'user-1')),
        reopen: () => supabaseRecipesRepository(makeClient(db, 'user-1')),
      };
    },
  },
];

describe.each(CONTEXTS)('RecipesRepository contract — $name', ({ make }) => {
  const create = (repo: RecipesRepository, title = 'Vanilla') =>
    repo.createRecipe({
      ownerUserId: 'user-1', title,
      recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]),
      trace: TRACE, by: 'user-1', capabilities: PRO,
    });

  it('continues version numbering: v1 → v2 → v3, ascending history, never a reset', async () => {
    const { repo } = make();
    const { recipe, version } = await create(repo);
    expect(version.versionNumber).toBe(1);

    const v2 = await repo.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 700), item('b', 'Sugar', 400)]), TRACE, 'user-1');
    const v3 = await repo.saveNewVersion(recipe.recipeId, input(1200, [item('a', 'Milk', 800), item('b', 'Sugar', 400)]), TRACE, 'user-1');
    expect([v2.versionNumber, v3.versionNumber]).toEqual([2, 3]);

    const history = await repo.getVersions(recipe.recipeId);
    expect(history.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect((await repo.getRecipe(recipe.recipeId))?.latestVersionNumber).toBe(3);
  });

  it('restore creates a NEW version and NEVER overwrites the target snapshot', async () => {
    const { repo } = make();
    const { recipe } = await create(repo);
    await repo.saveNewVersion(recipe.recipeId, input(1500, [item('a', 'Milk', 900), item('b', 'Sugar', 600)]), TRACE, 'user-1');

    const v1Before = JSON.stringify(await repo.getVersion(recipe.recipeId, 1));
    const restored = await repo.restore(recipe.recipeId, 1, 'user-1', PRO);

    expect(restored.versionNumber).toBe(3); // appended, not rewound
    expect(restored.source).toBe('restored');
    expect(restored.restoredFromVersion).toBe(1);
    expect((restored.recipeInput as unknown as { target_batch_grams: number }).target_batch_grams).toBe(1000);
    // the target snapshot is byte-for-byte what it was — never overwritten
    expect(JSON.stringify(await repo.getVersion(recipe.recipeId, 1))).toBe(v1Before);
    expect(await repo.getVersions(recipe.recipeId)).toHaveLength(3);
  });

  it('an earlier version is immutable across later saves (deep-equal before/after)', async () => {
    const { repo } = make();
    const { recipe } = await create(repo);
    const v1Snapshot = JSON.parse(JSON.stringify(await repo.getVersion(recipe.recipeId, 1)));
    await repo.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 1100)]), TRACE, 'user-1');
    expect(await repo.getVersion(recipe.recipeId, 1)).toEqual(v1Snapshot);
  });

  it('refresh/login: a fresh repository over the same store sees the history and CONTINUES it', async () => {
    const ctx = make();
    const { recipe } = await create(ctx.repo);
    await ctx.repo.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 1100)]), TRACE, 'user-1'); // v2

    const reopened = ctx.reopen();
    expect((await reopened.listRecipes('user-1')).map((r) => r.recipeId)).toEqual([recipe.recipeId]);
    expect(await reopened.getVersions(recipe.recipeId)).toHaveLength(2);
    const v3 = await reopened.saveNewVersion(recipe.recipeId, input(1200, [item('a', 'Milk', 1200)]), TRACE, 'user-1');
    expect(v3.versionNumber).toBe(3); // numbering continues from the store — never back to v1
  });

  it('owner isolation: another user id lists NOTHING of this owner', async () => {
    const { repo } = make();
    await create(repo);
    expect(await repo.listRecipes('user-1')).toHaveLength(1);
    expect(await repo.listRecipes('someone-else')).toHaveLength(0);
  });
});
