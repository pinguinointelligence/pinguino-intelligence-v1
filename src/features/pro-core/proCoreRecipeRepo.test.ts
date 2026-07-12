import { afterEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { RecipeCapabilities } from './recipeContracts';
import { __resetDevRecipesRepository, resolveRecipesRepository } from './proCoreRecipeRepo';

const PRO: RecipeCapabilities = { canSaveRecipe: true, canViewRecipeVersions: true, canRestoreRecipeVersion: true, maxSavedRecipes: null, canViewExactGrams: true };
const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number): RecipeInput =>
  ({ items: [item('a', 'Milk', 600), item('b', 'Sugar', 400)], mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;

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
    const { recipe } = await repository!.createRecipe({ ownerUserId: 'u1', title: 'Draft', recipeInput: input(1000), trace: { engineVersion: 'e', configVersion: 'c' }, by: 'u1', capabilities: PRO });
    expect((await repository!.listRecipes('u1')).map((r) => r.recipeId)).toEqual([recipe.recipeId]);
    expect(await repository!.getVersions(recipe.recipeId)).toHaveLength(1);
  });

  it('is a stable singleton within a session (until reset)', () => {
    const a = resolveRecipesRepository().repository;
    const b = resolveRecipesRepository().repository;
    expect(a).toBe(b);
    __resetDevRecipesRepository();
    expect(resolveRecipesRepository().repository).not.toBe(a);
  });
});
