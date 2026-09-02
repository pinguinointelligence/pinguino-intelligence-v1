import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { carbonatedProductsForRecipe } from './productionDegassing';

const recipe = {
  items: [
    {
      id: 'cola-a',
      planned_grams: 200,
      actual_grams: null,
      lock_type: 'none',
      ingredient: {
        id: 'PR-ING-000001',
        canonical_ingredient_id: 'PR-ING-000001',
        name: 'Cola Zero',
        carbonation_status: 'CARBONATED',
      },
    },
    {
      id: 'cola-b',
      planned_grams: 150,
      actual_grams: null,
      lock_type: 'none',
      ingredient: {
        id: 'PR-ING-000001',
        canonical_ingredient_id: 'PR-ING-000001',
        name: 'Cola Zero',
        carbonation_status: 'CARBONATED',
      },
    },
    {
      id: 'unknown',
      planned_grams: 50,
      actual_grams: null,
      lock_type: 'none',
      ingredient: { id: 'PI-ING-1', name: 'Drink', carbonation_status: 'UNKNOWN' },
    },
  ],
} as unknown as RecipeInput;

describe('Production degassing projection', () => {
  it('lists only canonical CARBONATED products and aggregates their grams', () => {
    expect(
      carbonatedProductsForRecipe(
        recipe,
        recipeCompositionFromState({ items: recipe.items, baseOrder: recipe.items.map((x) => x.id) }),
      ),
    ).toEqual([{ productId: 'PR-ING-000001', name: 'Cola Zero', grams: 350 }]);
  });
});
