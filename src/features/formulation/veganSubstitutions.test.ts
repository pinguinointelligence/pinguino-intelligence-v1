import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { veganSubstitutionRecommendations } from './veganSubstitutions';

const line = (id: string, ingredientId: string) => ({
  id,
  ingredient: findDemoIngredient(ingredientId)!,
  planned_grams: 100,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

describe('Vegan substitute adapter', () => {
  it('offers verified candidates without mutating source lines or claiming 1:1 equivalence', () => {
    const items = [line('milk', 'milk_3_5'), line('cream', 'cream_30')];
    const issues = veganRecipeEligibilityIssues(items);
    const recommendations = veganSubstitutionRecommendations(items, issues);
    expect(recommendations).toMatchObject([
      { lineId: 'milk', candidateIngredientId: 'PI-ING-001565', requiresReformulation: true },
      { lineId: 'cream', candidateIngredientId: 'PI-ING-000163', requiresReformulation: true },
    ]);
    expect(items.map((item) => item.ingredient.id)).toEqual(['milk_3_5', 'cream_30']);
  });
});
