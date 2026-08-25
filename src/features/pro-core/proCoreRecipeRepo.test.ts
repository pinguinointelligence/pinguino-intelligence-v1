import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { VisibleProductType } from '@/features/studio/productType';
import type { RecipeCapabilities } from './recipeContracts';
import { __resetDevRecipesRepository, resolveRecipesRepository } from './proCoreRecipeRepo';

// This suite verifies the DEV IN-MEMORY fallback, so pin the backend as NOT configured
// (a local .env.local would otherwise make resolveRecipesRepository return the real Supabase
// adapter). The Supabase-backed path is covered by supabaseRecipes.test.ts + repositorySelector.test.ts.
vi.mock('@/lib/supabase/client', () => ({ supabase: null, isSupabaseConfigured: false }));

const PRO: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};
const item = (id: string, name: string, grams: number) => ({
  id,
  ingredient: { name },
  planned_grams: grams,
});
const input = (batch: number): RecipeInput =>
  ({
    items: [item('a', 'Milk', 600), item('b', 'Sugar', 400)],
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: batch,
    machine_capacity_grams: null,
  }) as unknown as RecipeInput;

const nativeStarterInput = (visibleProductType: VisibleProductType): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({ visibleProductType, servingModeId: 'fresh' });
  return {
    items: starter.items,
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
};

afterEach(() => __resetDevRecipesRepository());

describe('resolveRecipesRepository — DEV local-mode availability', () => {
  it('returns a usable, local-dev in-memory repository in DEV', () => {
    const state = resolveRecipesRepository();
    expect(state.unavailable).toBe(false);
    expect(state.isLocalDev).toBe(true);
    expect(state.mode).toBe('in_memory_dev');
    expect(state.repository).not.toBeNull();
  });

  it('the repository round-trips create → list through the async port', async () => {
    const { repository } = resolveRecipesRepository();
    const { recipe } = await repository!.createRecipe({
      ownerUserId: 'u1',
      title: 'Draft',
      recipeInput: input(1000),
      trace: { engineVersion: 'e', configVersion: 'c' },
      by: 'u1',
      capabilities: PRO,
    });
    expect((await repository!.listRecipes('u1')).map((r) => r.recipeId)).toEqual([recipe.recipeId]);
    expect(await repository!.getVersions(recipe.recipeId)).toHaveLength(1);
  });

  it.each(['gelato', 'sorbet', 'vegan', 'protein'] as const)(
    'round-trips a fresh %s Save/Reopen with one Base-scoped PB snapshot per saved line',
    async (profile) => {
      const recipeInput = nativeStarterInput(profile);
      const snapshots = productBehaviorTestSnapshots(recipeInput);
      const productComposition = recipeCompositionFromState({
        items: recipeInput.items,
        baseOrder: recipeInput.items.map((item) => item.id),
        productBehaviorSnapshots: snapshots,
      });
      const { repository } = resolveRecipesRepository();
      const created = await repository!.createRecipe({
        ownerUserId: 'u1',
        title: `Fresh ${profile}`,
        recipeInput,
        productComposition,
        trace: { engineVersion: 'e', configVersion: 'c' },
        by: 'u1',
        capabilities: PRO,
      });

      const reopened = await repository!.getVersion(created.recipe.recipeId, 1);
      expect(reopened?.recipeInput.category).toBe(recipeInput.category);
      expect(
        reopened?.recipeInput.items.map(({ id, planned_grams }) => ({ id, planned_grams })),
      ).toEqual(recipeInput.items.map(({ id, planned_grams }) => ({ id, planned_grams })));
      expect(Object.keys(reopened?.productComposition?.behaviorSnapshots ?? {}).sort()).toEqual(
        recipeInput.items.map((line) => line.id).sort(),
      );
      for (const line of reopened?.recipeInput.items ?? []) {
        expect(reopened?.productComposition?.behaviorSnapshots?.[line.id]).toMatchObject({
          lineId: line.id,
          processScope: 'BASE_FORMULATION',
          behaviorBindingVersion: 'test-v1',
        });
      }
      if (profile === 'vegan') {
        expect(
          reopened?.productComposition?.behaviorSnapshots?.['new-recipe-2-PI-ING-000163'],
        ).toMatchObject({
          mapperIngredientId: 'PI-ING-000163',
          processScope: 'BASE_FORMULATION',
        });
      }
    },
  );

  it('is a stable singleton within a session (until reset)', () => {
    const a = resolveRecipesRepository().repository;
    const b = resolveRecipesRepository().repository;
    expect(a).toBe(b);
    __resetDevRecipesRepository();
    expect(resolveRecipesRepository().repository).not.toBe(a);
  });
});
