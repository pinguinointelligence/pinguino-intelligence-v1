import { describe, expect, it } from 'vitest';
import { resolveEffectiveItems } from './composition';
import { ATWATER_KCAL_PER_G, computeNutritionPer100g, ingredientKcalContribution } from './nutrition';
import type { EngineIngredient, IngredientComponentProfile, RecipeItem } from './types';

const ZERO_PROFILE: IngredientComponentProfile = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const makeIngredient = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
): EngineIngredient => ({
  id,
  name: id,
  category: 'other',
  composition: { ...ZERO_PROFILE, ...composition },
  pod_value: null,
  pac_value: null,
  npac_value: null,
  de_value: null,
  cost_per_kg: 0,
  confidence_score: 85,
  source_type: 'manual',
  is_verified: false,
});

const makeItem = (
  id: string,
  composition: Partial<IngredientComponentProfile>,
  planned_grams: number,
): RecipeItem => ({
  id,
  ingredient: makeIngredient(`ing-${id}`, composition),
  planned_grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

const effective = (...items: RecipeItem[]) => resolveEffectiveItems(items);

describe('nutrition per 100 g', () => {
  it('calculates per-100 g values from per-ingredient composition', () => {
    const items = effective(
      makeItem(
        'milk',
        {
          water_percent: 87.5,
          fat_percent: 3.5,
          protein_percent: 3.3,
          carbohydrate_percent: 4.8,
          sugar_percent: 4.8,
          lactose_percent: 4.8,
          salt_percent: 0.1,
          kcal_per_100g: 64,
        },
        500,
      ),
      makeItem('water', { water_percent: 100 }, 500),
    );
    const nutrition = computeNutritionPer100g(items, 1000)!;
    expect(nutrition.kcal).toBeCloseTo(32, 9); // 500 × 0.64 / 1000 × 100
    expect(nutrition.fat_g).toBeCloseTo(1.75, 9);
    expect(nutrition.protein_g).toBeCloseTo(1.65, 9);
    expect(nutrition.carbohydrate_g).toBeCloseTo(2.4, 9);
    expect(nutrition.sugars_g).toBeCloseTo(2.4, 9);
    expect(nutrition.salt_g).toBeCloseTo(0.05, 9);
    expect(nutrition.alcohol_g).toBe(0);
  });

  it('uses stored ingredient kcal when available (> 0)', () => {
    const [item] = effective(makeItem('sucrose', { kcal_per_100g: 400, sugar_percent: 100 }, 100));
    expect(ingredientKcalContribution(item!)).toBeCloseTo(400, 9);
  });

  it('falls back to Atwater factors when kcal is missing', () => {
    // fat 10, protein 5, carbs 20 incl. 5 polyol, fiber 3, alcohol 2 — kcal 0
    const [item] = effective(
      makeItem(
        'label-only',
        {
          fat_percent: 10,
          protein_percent: 5,
          carbohydrate_percent: 20,
          polyol_percent: 5,
          fiber_percent: 3,
          alcohol_percent: 2,
        },
        100,
      ),
    );
    // 10×9 + 5×4 + (20−5)×4 + 5×2.4 + 3×2 + 2×7 = 90+20+60+12+6+14 = 202
    expect(ingredientKcalContribution(item!)).toBeCloseTo(202, 9);
    expect(ATWATER_KCAL_PER_G.alcohol).toBe(7);
  });

  it('alcohol contributes 7 kcal/g in the fallback (Jim Beam-like, kcal missing)', () => {
    const [item] = effective(
      makeItem('jim-beam', { water_percent: 60, alcohol_percent: 40 }, 100),
    );
    expect(ingredientKcalContribution(item!)).toBeCloseTo(280, 9);
  });

  it('reports saturated fat only when every fat-bearing ingredient provides it', () => {
    const withSat = effective(
      makeItem('cream', { fat_percent: 35, saturated_fat_percent: 23 }, 100),
      makeItem('butter', { fat_percent: 82, saturated_fat_percent: 54 }, 100),
    );
    const complete = computeNutritionPer100g(withSat, 200)!;
    expect(complete.saturated_fat_g).toBeCloseTo((23 + 54) / 2, 9);

    const missingOne = effective(
      makeItem('cream', { fat_percent: 35, saturated_fat_percent: 23 }, 100),
      makeItem('mystery-fat', { fat_percent: 30 }, 100), // no saturated data
    );
    expect(computeNutritionPer100g(missingOne, 200)!.saturated_fat_g).toBeNull();
  });

  it('zero-gram lines do not poison the saturated-fat completeness', () => {
    const items = effective(
      makeItem('cream', { fat_percent: 35, saturated_fat_percent: 23 }, 200),
      makeItem('unused-fat', { fat_percent: 30 }, 0), // 0 g — ignored
    );
    expect(computeNutritionPer100g(items, 200)!.saturated_fat_g).toBeCloseTo(23, 9);
  });

  it('returns null for a zero-mass batch and stays deterministic/non-mutating', () => {
    expect(computeNutritionPer100g([], 0)).toBeNull();
    const items = effective(makeItem('milk', { fat_percent: 3.5, kcal_per_100g: 64 }, 500));
    const snapshot = JSON.parse(JSON.stringify(items)) as unknown;
    expect(computeNutritionPer100g(items, 500)).toEqual(computeNutritionPer100g(items, 500));
    expect(items).toEqual(snapshot);
  });
});
