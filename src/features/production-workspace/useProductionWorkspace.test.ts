import { describe, expect, it } from 'vitest';
import { productionSourceForRecipe } from './useProductionWorkspace';

describe('production source integrity', () => {
  it('uses the immutable version id only while the current vector is still saved', () => {
    expect(
      productionSourceForRecipe({
        dirty: false,
        savedRecipeId: 'recipe-1',
        savedRecipeName: 'Pistacja',
        currentVersionNumber: 3,
      }),
    ).toEqual({
      recipeId: 'recipe-1',
      recipeVersionId: 'recipe-1:v3',
      recipeVersionNumber: 3,
      recipeName: 'Pistacja',
    });

    expect(
      productionSourceForRecipe({
        dirty: true,
        savedRecipeId: 'recipe-1',
        savedRecipeName: 'Pistacja',
        currentVersionNumber: 3,
      }),
    ).toEqual({
      recipeId: 'recipe-1',
      recipeVersionId: null,
      recipeVersionNumber: null,
      recipeName: 'Pistacja',
    });
  });
});
