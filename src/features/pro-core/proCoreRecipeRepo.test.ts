import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeInput, RecipeItem } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import {
  recipeCompositionFromState,
  type RecipeToppingItem,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { VisibleProductType } from '@/features/studio/productType';
import { buildCurrentRecipeResultAuthority } from '@/features/pro-workbench/currentRecipeResultAuthority';
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
  const items =
    visibleProductType === 'sorbet'
      ? [
          ...starter.items,
          {
            id: 'basic4v1-strawberries-main',
            ingredient: {
              ...findDemoIngredient('raspberry')!,
              id: 'PI-ING-001553',
              canonical_ingredient_id: 'PI-ING-001553',
              name: 'STRAWBERRIES · Fresh Fruit',
            },
            planned_grams: 600,
            actual_grams: null,
            lock_type: 'main',
            user_intent_anchor_grams: 600,
          } satisfies RecipeItem,
        ]
      : starter.items;
  return {
    items,
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
};

const basic4v1LimeTopping = (): RecipeToppingItem => ({
  id: 'basic4v1-lime-topping',
  ingredient: {
    ...findDemoIngredient('raspberry')!,
    id: 'PI-ING-001640',
    canonical_ingredient_id: 'PI-ING-001640',
    name: 'LIME · Fresh Fruit',
  },
  planned_grams: 25,
  actual_grams: null,
  process_scope: 'POST_PROCESS_ADDON',
  addon_sort_order: 0,
});

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
    'BASIC4V1 %s: Save/Reopen preserves the 1000 g Base + 25 g Topping authority',
    async (profile) => {
      const recipeInput = nativeStarterInput(profile);
      const toppings = [basic4v1LimeTopping()];
      const snapshots = productBehaviorTestSnapshots(recipeInput, toppings);
      const productComposition = recipeCompositionFromState({
        items: recipeInput.items,
        baseOrder: recipeInput.items.map((item) => item.id),
        toppings,
        productBehaviorSnapshots: snapshots,
      });
      expect(recipeInput.items.reduce((sum, line) => sum + line.planned_grams, 0)).toBeCloseTo(
        1_000,
        12,
      );
      expect(calculateFinalProduct(recipeInput, toppings).finalMassG).toBe(1_025);
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
        [...recipeInput.items.map((line) => line.id), toppings[0]!.id].sort(),
      );
      for (const line of reopened?.recipeInput.items ?? []) {
        expect(reopened?.productComposition?.behaviorSnapshots?.[line.id]).toMatchObject({
          lineId: line.id,
          processScope: 'BASE_FORMULATION',
          behaviorBindingVersion: 'test-v1',
        });
      }
      expect(reopened?.productComposition?.toppings).toEqual(toppings);
      expect(calculateFinalProduct(
        reopened!.recipeInput,
        reopened!.productComposition!.toppings,
      ).finalMassG).toBe(1_025);
      const beforeAuthority = buildCurrentRecipeResultAuthority({
        recipe: recipeInput,
        toppings: productComposition.toppings,
        snapshots,
        draftRevision: 1,
        awaitingRecalculation: false,
        loading: false,
      });
      const reopenedAuthority = buildCurrentRecipeResultAuthority({
        recipe: reopened!.recipeInput,
        toppings: reopened!.productComposition?.toppings ?? [],
        snapshots: reopened!.productComposition?.behaviorSnapshots ?? {},
        draftRevision: 1,
        awaitingRecalculation: false,
        loading: false,
      });
      expect(reopenedAuthority.ready).toBe(true);
      expect(reopenedAuthority.recipeFingerprint).toBe(beforeAuthority.recipeFingerprint);
      expect(reopenedAuthority.behaviorFingerprint).toBe(beforeAuthority.behaviorFingerprint);
      expect(reopenedAuthority.resultReference).toBe(beforeAuthority.resultReference);
      expect(await repository!.getVersions(created.recipe.recipeId)).toHaveLength(1);
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
