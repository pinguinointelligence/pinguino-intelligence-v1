/**
 * Composition arithmetic fixture — the engine-spec Appendix A mix.
 *
 * SCOPE: raw mass arithmetic ONLY (spec §6). The expected values below are the
 * hand-verified component totals from Appendix A. They involve no coefficients,
 * so they are independent of calibration. Appendix A itself remains
 * "illustrative / calibration-pending": this fixture carries NO POD/PAC/NPAC or
 * ice-fraction expectations and is NOT a verified production recipe.
 */
import type { EngineIngredient, IngredientComponentProfile, RecipeItem } from '../../types';

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

const ingredient = (
  id: string,
  name: string,
  category: EngineIngredient['category'],
  composition: Partial<IngredientComponentProfile>,
): EngineIngredient => ({
  id,
  name,
  category,
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

const item = (ingredientDef: EngineIngredient, planned_grams: number): RecipeItem => ({
  id: `line-${ingredientDef.id}`,
  ingredient: ingredientDef,
  planned_grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

/** The Appendix A mix: 6 ingredients, 1000.0 g batch. */
export const APPENDIX_A_ITEMS: readonly RecipeItem[] = [
  item(
    ingredient('whole-milk-35', 'Whole milk 3.5 %', 'dairy', {
      water_percent: 87.5,
      solids_percent: 12.5,
      fat_percent: 3.5,
      protein_percent: 3.3,
      carbohydrate_percent: 4.8,
      sugar_percent: 4.8,
      lactose_percent: 4.8,
      salt_percent: 0.1,
      kcal_per_100g: 64,
    }),
    670,
  ),
  item(
    ingredient('cream-35', 'Cream 35 %', 'dairy', {
      water_percent: 58.9,
      solids_percent: 41.1,
      fat_percent: 35,
      protein_percent: 2.2,
      carbohydrate_percent: 3.1,
      sugar_percent: 3.1,
      lactose_percent: 3.1,
      salt_percent: 0.1,
      kcal_per_100g: 337,
    }),
    130,
  ),
  item(
    ingredient('smp', 'Skimmed milk powder', 'dairy', {
      water_percent: 3.5,
      solids_percent: 96.5,
      fat_percent: 0.8,
      protein_percent: 35,
      carbohydrate_percent: 52,
      sugar_percent: 52,
      lactose_percent: 52,
      salt_percent: 1,
      kcal_per_100g: 360,
    }),
    35,
  ),
  item(
    ingredient('sucrose', 'Sucrose', 'sugar', {
      solids_percent: 100,
      carbohydrate_percent: 100,
      sugar_percent: 100,
      sucrose_percent: 100,
      kcal_per_100g: 400,
    }),
    130,
  ),
  item(
    ingredient('dextrose', 'Dextrose (monohydrate)', 'sugar', {
      water_percent: 8,
      solids_percent: 92,
      carbohydrate_percent: 92,
      sugar_percent: 92,
      dextrose_percent: 92,
      kcal_per_100g: 368,
    }),
    30,
  ),
  item(
    ingredient('tara-gum', 'Tara gum', 'stabilizer', {
      water_percent: 12,
      solids_percent: 88,
      carbohydrate_percent: 80,
      fiber_percent: 80,
      kcal_per_100g: 200,
    }),
    5,
  ),
];

/** Hand-verified Appendix A component totals (exact arithmetic, full precision). */
export const APPENDIX_A_EXPECTED_TOTALS = {
  total_batch_g: 1000,
  water_g: 667.045,
  solids_g: 332.955,
  fat_g: 69.23,
  protein_g: 37.22,
  lactose_g: 54.39,
  sucrose_g: 130,
  dextrose_g: 27.6,
  fiber_g: 4,
  salt_g: 1.15,
  alcohol_g: 0,
} as const;
