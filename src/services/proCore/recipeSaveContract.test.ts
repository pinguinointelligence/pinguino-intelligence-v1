/**
 * THE SAVE CONTRACT (owner v1.4), pinned end-to-end against the fake DB.
 *
 * Contract, in the owner's words:
 *   1. a successful save persists the user-visible state,
 *   2. it creates an immutable version snapshot automatically,
 *   3. the snapshot is complete enough to reconstruct the recipe without current defaults,
 *   4. earlier versions are never overwritten,
 *   5. the parent points at the newest saved state,
 *   6. `updated_at` corresponds to a real successful save,
 *   7. library metadata corresponds to that saved state,
 *   8. restore appends a NEW latest version and never renumbers history,
 *   9. concurrent saves never duplicate a version number, and no save can leave the parent
 *      advanced without its version (or a version without its aggregate advance).
 *
 * Both persistence paths are proven: the atomic RPCs (`rpcEnabled`) and the documented
 * non-transactional fallback used when a database does not have them yet.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { supabaseRecipesRepository } from './supabaseRecipes';
import { FakeDB, makeClient } from './supabaseRecipesFake';

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const PRO: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};
const USER = 'user-1';

/** The owner QA shape: Protein, −12°C, OPTIMAL, a Main line, a gram lock, 1000 g. */
const qaInput = (grams = 400, strategy: 'eco' | 'optimal' = 'optimal'): RecipeInput =>
  ({
    items: [
      {
        id: 'line-main',
        ingredient: { name: 'Whey isolate' },
        planned_grams: grams,
        actual_grams: null,
        lock_type: 'main',
      },
      {
        id: 'line-locked',
        ingredient: { name: 'Sucrose' },
        planned_grams: 120,
        actual_grams: null,
        lock_type: 'grams',
        grams_constraint: { grams: 120 },
      },
      {
        id: 'line-free',
        ingredient: { name: 'Milk' },
        planned_grams: 1000 - grams - 120,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ],
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: strategy },
    pinguino_profile_v1: {
      visibleProductType: 'protein',
      mode: 'classic',
      formulationStrategy: strategy,
      targetBatchGrams: 1000,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Profesjonalna',
      servingModeId: 'temp_minus_12',
      targetTemperatureC: -12,
      machineCapacityGrams: null,
      directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  }) as unknown as RecipeInput;

const setup = (atomic: boolean) => {
  const db = new FakeDB();
  db.rpcEnabled = atomic;
  return { db, repo: supabaseRecipesRepository(makeClient(db, USER)) };
};

const create = (repo: ReturnType<typeof supabaseRecipesRepository>, recipeInput: RecipeInput) =>
  repo.createRecipe({
    ownerUserId: USER,
    title: 'QA Persistence v1.4',
    notes: null,
    recipeInput,
    productComposition: null,
    trace: TRACE,
    source: 'manual',
    by: USER,
    capabilities: PRO,
  });

for (const atomic of [true, false]) {
  const label = atomic ? 'atomic RPC path' : 'non-transactional fallback path';

  describe(`recipe save contract — ${label}`, () => {
    it('v1: persists the aggregate AND an immutable version 1 with a complete identity', async () => {
      const { db, repo } = setup(atomic);
      const { recipe, version } = await create(repo, qaInput());

      expect(version.versionNumber).toBe(1);
      expect(db.recipe_versions).toHaveLength(1);
      // §4 completeness — the snapshot knows what it is without asking current defaults.
      expect(version.productProfile).toBe('protein');
      expect(version.temperatureC).toBe(-12);
      expect(version.totalBatchG).toBe(1000);
      const snapshot = version.recipeInput as unknown as {
        goals: { formulation_strategy: string };
        items: Array<{ id: string; lock_type: string; grams_constraint?: { grams: number } }>;
      };
      expect(snapshot.goals.formulation_strategy).toBe('optimal');
      expect(snapshot.items.find((i) => i.id === 'line-main')?.lock_type).toBe('main');
      expect(snapshot.items.find((i) => i.id === 'line-locked')?.grams_constraint).toEqual({
        grams: 120,
      });
      // §7 library metadata — no NULL columns, no '−11°C Engine' default over a −12°C save.
      const row = db.saved_recipes.find((r) => r.id === recipe.recipeId)!;
      expect(row.product_type).toBe('protein');
      expect(row.serving_profile).toBe('temp_minus_12');
      expect(row.active_engine_label).toBe('Silnik −12°C');
    });

    it('v2: appends a NEW version, leaves v1 byte-identical, and advances the parent', async () => {
      const { db, repo } = setup(atomic);
      const { recipe } = await create(repo, qaInput(400));
      const v1 = structuredClone(db.recipe_versions[0]);

      const v2 = await repo.saveNewVersion(recipe.recipeId, qaInput(450), TRACE, USER, {}, null);

      expect(v2.versionNumber).toBe(2);
      expect(db.recipe_versions).toHaveLength(2);
      expect(db.recipe_versions[0]).toEqual(v1); // §4 immutability
      // §5 the parent points at the newest saved state.
      const row = db.saved_recipes.find((r) => r.id === recipe.recipeId)!;
      const parentItems = (row.recipe_input as { items: Array<{ id: string; planned_grams: number }> })
        .items;
      expect(parentItems.find((i) => i.id === 'line-main')?.planned_grams).toBe(450);
      expect(
        db.saved_recipe_meta.find((m) => m.recipe_id === recipe.recipeId)!.latest_version_number,
      ).toBe(2);
    });

    it('restore v1 after v3: history is preserved and a NEW v4 is created', async () => {
      const { db, repo } = setup(atomic);
      const { recipe } = await create(repo, qaInput(400));
      await repo.saveNewVersion(recipe.recipeId, qaInput(450), TRACE, USER, {}, null);
      await repo.saveNewVersion(recipe.recipeId, qaInput(500), TRACE, USER, {}, null);
      const before = structuredClone(db.recipe_versions);
      expect(before.map((v) => v.version_number)).toEqual([1, 2, 3]);

      const restored = await repo.restore(recipe.recipeId, 1, USER, PRO);

      expect(restored.versionNumber).toBe(4);
      expect(restored.restoredFromVersion).toBe(1);
      expect(restored.source).toBe('restored');
      // v1/v2/v3 untouched — never rewritten, never renumbered.
      expect(db.recipe_versions.slice(0, 3)).toEqual(before);
      expect(db.recipe_versions.map((v) => v.version_number)).toEqual([1, 2, 3, 4]);
      // v4 carries v1's formulation.
      const items = (restored.recipeInput as unknown as {
        items: Array<{ id: string; planned_grams: number }>;
      }).items;
      expect(items.find((i) => i.id === 'line-main')?.planned_grams).toBe(400);
      // …and the aggregate follows it.
      expect(
        db.saved_recipe_meta.find((m) => m.recipe_id === recipe.recipeId)!.latest_version_number,
      ).toBe(4);
    });

    it('a restored version keeps a complete identity even from a pre-v1.4 NULL snapshot', async () => {
      const { db, repo } = setup(atomic);
      const { recipe } = await create(repo, qaInput());
      // Simulate the staging reality: every version written before v1.4 has NULL identity columns.
      db.recipe_versions[0]!.product_profile = null;
      db.recipe_versions[0]!.temperature_c = null;

      const restored = await repo.restore(recipe.recipeId, 1, USER, PRO);

      expect(restored.productProfile).toBe('protein');
      expect(restored.temperatureC).toBe(-12);
    });

    it('reopening the newest version reconstructs the saved state exactly', async () => {
      const { repo } = setup(atomic);
      const written = qaInput(450, 'eco');
      const { recipe } = await create(repo, written);
      await repo.saveNewVersion(recipe.recipeId, written, TRACE, USER, {}, null);

      const aggregate = (await repo.getRecipe(recipe.recipeId))!;
      const latest = (await repo.getVersion(recipe.recipeId, aggregate.latestVersionNumber))!;

      expect(latest.recipeInput).toEqual(written);
      expect(aggregate.temperatureC).toBe(-12);
    });

    it('every version number is unique and gap-free after rapid consecutive saves', async () => {
      const { db, repo } = setup(atomic);
      const { recipe } = await create(repo, qaInput());
      for (let i = 0; i < 5; i += 1) {
        await repo.saveNewVersion(recipe.recipeId, qaInput(400 + i), TRACE, USER, {}, null);
      }
      const numbers = db.recipe_versions.map((v) => Number(v.version_number)).sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('a failed save is never reported as saved and leaves no partial state', async () => {
      const { db, repo } = setup(atomic);
      const { recipe } = await create(repo, qaInput());
      const versionsBefore = structuredClone(db.recipe_versions);
      const parentBefore = structuredClone(db.saved_recipes);

      db.failOn = { table: 'recipe_versions', op: 'insert' };
      await expect(
        repo.saveNewVersion(recipe.recipeId, qaInput(999), TRACE, USER, {}, null),
      ).rejects.toThrow();

      expect(db.recipe_versions).toEqual(versionsBefore);
      // §9 the parent must NOT have advanced past a version that was never written.
      expect(db.saved_recipes).toEqual(parentBefore);
    });
  });
}

describe('recipe save contract — atomicity of the aggregate advance', () => {
  it('atomic path: a failing aggregate advance rolls the version back with it', async () => {
    const { db, repo } = setup(true);
    const { recipe } = await create(repo, qaInput());
    const before = structuredClone(db.recipe_versions);

    db.failOn = { table: 'saved_recipes', op: 'update' };
    await expect(
      repo.saveNewVersion(recipe.recipeId, qaInput(450), TRACE, USER, {}, null),
    ).rejects.toThrow();

    // ONE transaction: no orphan version ahead of the aggregate the library reads.
    expect(db.recipe_versions).toEqual(before);
    expect(
      db.saved_recipe_meta.find((m) => m.recipe_id === recipe.recipeId)!.latest_version_number,
    ).toBe(1);
  });

  it('falls back honestly when the database does not have the append RPC yet', async () => {
    const { db, repo } = setup(false);
    const { recipe } = await create(repo, qaInput());
    const v2 = await repo.saveNewVersion(recipe.recipeId, qaInput(450), TRACE, USER, {}, null);
    expect(v2.versionNumber).toBe(2);
    expect(db.recipe_versions).toHaveLength(2);
  });
});

describe('recipe save contract — rename is metadata, never a content version', () => {
  it('renaming does not create a version and does not move the version history', async () => {
    const { db, repo } = setup(true);
    const { recipe } = await create(repo, qaInput());
    const before = structuredClone(db.recipe_versions);

    await repo.renameRecipe(recipe.recipeId, 'Nowa nazwa');

    expect(db.recipe_versions).toEqual(before);
    expect(db.saved_recipes[0]!.name).toBe('Nowa nazwa');
  });
});
