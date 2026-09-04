import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { calculateFinalProduct } from './finalProduct';
import type { RecipeToppingItem } from './recipeCompositionPersistence';
import type { CatalogLabelToppingIngredient } from './labelTopping';

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

const labelTopping = (grams: number): RecipeToppingItem => ({
  id: 'catalog-label-topping',
  ingredient: {
    kind: 'catalog_label_topping',
    id: 'catalog:strawberry-sauce',
    canonical_ingredient_id: 'catalog:strawberry-sauce',
    private_product_id: 'catalog:strawberry-sauce:version:v1',
    name: 'Owner Brand · Strawberry sauce',
    catalog_product_id: 'strawberry-sauce',
    catalog_version_id: 'v1',
    verification_status: 'manual_unverified',
    label_nutrition_per_100g: {
      basis: 'per_100g',
      energyKcal: 220,
      fat: 1,
      saturatedFat: 0.2,
      carbohydrate: 52,
      sugars: 45,
      protein: 0.8,
      salt: 0.03,
      fibre: 2,
    },
    ingredients_text: 'Truskawki, cukier',
    allergens_text: 'Brak zadeklarowanych alergenów',
    cost_per_kg: null,
    cost_currency: null,
  } satisfies CatalogLabelToppingIngredient,
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

  it('keeps a 0 g Topping outside final mass, science, nutrition and cost', () => {
    const before = calculateFinalProduct(base);
    const result = calculateFinalProduct(base, [topping('zero-science', 0)]);

    expect(result.baseResult).toEqual(before.baseResult);
    expect(result.finalItems).toEqual(before.finalItems);
    expect(result.finalNutritionPer100g).toEqual(before.finalNutritionPer100g);
    expect(result.finalLabelNutritionPer100g).toEqual(before.finalLabelNutritionPer100g);
    expect(result.finalCosts).toEqual(before.finalCosts);
    expect(result.toppingMassG).toBe(0);
    expect(result.finalMassG).toBe(before.finalMassG);
  });

  it('does not let a 0 g label-only Topping suppress nutrition or make cost incomplete', () => {
    const before = calculateFinalProduct(base);
    const result = calculateFinalProduct(base, [labelTopping(0)]);

    expect(result.finalItems).toEqual(before.finalItems);
    expect(result.finalNutritionPer100g).toEqual(before.finalNutritionPer100g);
    expect(result.finalLabelNutritionPer100g).toEqual(before.finalLabelNutritionPer100g);
    expect(result.finalCosts).toEqual(before.finalCosts);
    expect(result.finalMassG).toBe(before.finalMassG);
  });

  it('uses declared label nutrition without changing Base Engine science', () => {
    const before = calculateRecipe(base);
    const item = labelTopping(100);
    const result = calculateFinalProduct(base, [item]);

    expect(before.nutrition_per_100g).not.toBeNull();
    expect(result.baseResult).toEqual(before);
    expect(result.finalMassG).toBe(before.total_batch_g + 100);
    expect(result.finalNutritionPer100g).toBeNull();
    expect(result.finalLabelNutritionPer100g).not.toBeNull();
    expect(result.finalLabelNutritionPer100g!.kcal).toBeCloseTo(
      ((before.nutrition_per_100g!.kcal * before.total_batch_g) / 100 + 220) /
        (result.finalMassG / 100),
      8,
    );
    expect(result.finalLabelNutritionPer100g!.alcohol_g).toBeNull();
    expect(result.finalLabelNutritionPer100g!.saturated_fat_g).toBeNull();
    expect(result.finalItems.at(-1)?.ingredient).toMatchObject({
      kind: 'catalog_label_topping',
      catalog_product_id: 'strawberry-sauce',
    });
    expect(result.finalCosts?.complete).toBe(false);
    expect(result.finalCosts?.known_cost).toBeGreaterThan(0);
    expect(result.finalCosts?.missing_cost_ingredient_ids).toContain('catalog:strawberry-sauce');
  });

  it('keeps a 5 g unpriced post-production topping outside the 1000 g technical Base', () => {
    const before = calculateRecipe(base);
    const result = calculateFinalProduct(base, [labelTopping(5)]);

    expect(result.baseResult).toEqual(before);
    expect(result.baseMassG).toBe(1000);
    expect(result.toppingMassG).toBe(5);
    expect(result.finalMassG).toBe(1005);
    expect(result.finalCosts).toMatchObject({
      complete: false,
      known_cost: before.costs?.known_cost,
    });
  });
});
