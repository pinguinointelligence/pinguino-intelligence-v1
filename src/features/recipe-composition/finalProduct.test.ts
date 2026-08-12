import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { calculateFinalProduct } from './finalProduct';
import type { RecipeToppingItem } from './recipeCompositionPersistence';

const base = {
  items: DEFAULT_PRESET.items,
  mode: 'classic' as const,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};

const topping = (id: string, grams: number): RecipeToppingItem => ({
  id: `topping-${id}`,
  ingredient: { ...DEFAULT_PRESET.items[0]!.ingredient, id, canonical_ingredient_id: id },
  planned_grams: grams,
  actual_grams: null,
  process_scope: 'POST_PROCESS_ADDON',
  addon_sort_order: 0,
});

describe('final product composition', () => {
  it('keeps Base technical metrics byte-identical while adding final nutrition/cost mass', () => {
    const before = calculateRecipe(base);
    const result = calculateFinalProduct(base, [topping('milk-topping', 70)]);
    expect(result.baseResult.pod_points).toBe(before.pod_points);
    expect(result.baseResult.npac_points).toBe(before.npac_points);
    expect(result.baseResult.scores).toEqual(before.scores);
    expect(result.toppingMassG).toBe(70);
    expect(result.finalMassG).toBe(before.total_batch_g + 70);
    expect(result.finalItems.reduce((sum, item) => sum + item.effective_grams, 0)).toBe(
      result.finalMassG,
    );
    expect(result.finalNutritionPer100g).not.toEqual(before.nutrition_per_100g);
  });

  it('uses actual topping mass only for the final actual product', () => {
    const item = { ...topping('sauce', 60), actual_grams: 65 };
    expect(calculateFinalProduct(base, [item], 'planning').toppingMassG).toBe(60);
    expect(calculateFinalProduct(base, [item], 'actual_batch').toppingMassG).toBe(65);
  });
});
