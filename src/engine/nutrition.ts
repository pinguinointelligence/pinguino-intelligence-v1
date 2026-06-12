/**
 * Nutrition — per-100 g label values (masterplan §12.10; spec §6 mass rules).
 *
 * Stored-kcal-first: an ingredient's kcal_per_100g is used when > 0; otherwise
 * the Atwater fallback derives energy from the composition. No hidden nutrition
 * values are invented: saturated fat is reported only when every fat-bearing
 * ingredient provides the optional saturated_fat_percent — otherwise null.
 *
 * Pure, deterministic, non-mutating; zero-mass batches return null.
 */
import { computeComponentGrams } from './composition';
import type { EffectiveRecipeItem, NutritionPer100g } from './types';

/**
 * Atwater energy factors (kcal per gram) — regulatory standards documented in
 * masterplan §12.10, NOT calibration data (hence constants here, not config).
 * Polyols count inside carbohydrates on EU labels, so the fallback uses
 * (carbohydrate − polyol) × 4 + polyol × 2.4 to avoid double counting.
 */
export const ATWATER_KCAL_PER_G = {
  fat: 9,
  protein: 4,
  carbohydrate: 4,
  alcohol: 7,
  fiber: 2,
  polyol: 2.4,
} as const;

/** One ingredient's kcal: stored kcal_per_100g when > 0, else Atwater fallback. */
export function ingredientKcalContribution(item: EffectiveRecipeItem): number {
  const c = item.ingredient.composition;
  const g = item.effective_grams;
  if (c.kcal_per_100g > 0) {
    return (g * c.kcal_per_100g) / 100;
  }
  const carbExPolyol = Math.max(0, c.carbohydrate_percent - c.polyol_percent);
  const kcalPer100g =
    c.fat_percent * ATWATER_KCAL_PER_G.fat +
    c.protein_percent * ATWATER_KCAL_PER_G.protein +
    carbExPolyol * ATWATER_KCAL_PER_G.carbohydrate +
    c.polyol_percent * ATWATER_KCAL_PER_G.polyol +
    c.fiber_percent * ATWATER_KCAL_PER_G.fiber +
    c.alcohol_percent * ATWATER_KCAL_PER_G.alcohol;
  return (g * kcalPer100g) / 100;
}

/** Per-100 g nutrition of the mix. Null for zero-mass batches. */
export function computeNutritionPer100g(
  items: readonly EffectiveRecipeItem[],
  totalBatchG: number,
): NutritionPer100g | null {
  if (totalBatchG <= 0) return null;

  let kcal = 0;
  let fat = 0;
  let saturated = 0;
  let saturatedComplete = true;
  let carbohydrate = 0;
  let sugars = 0;
  let protein = 0;
  let salt = 0;
  let fiber = 0;
  let alcohol = 0;

  for (const item of items) {
    const g = item.effective_grams;
    if (g <= 0) continue; // zero-mass lines contribute nothing
    const c = item.ingredient.composition;

    kcal += ingredientKcalContribution(item);
    fat += computeComponentGrams(g, c.fat_percent);
    if (c.saturated_fat_percent !== undefined) {
      saturated += computeComponentGrams(g, c.saturated_fat_percent);
    } else if (c.fat_percent > 0) {
      saturatedComplete = false; // fat-bearing ingredient without saturated data
    }
    carbohydrate += computeComponentGrams(g, c.carbohydrate_percent);
    sugars += computeComponentGrams(g, c.sugar_percent);
    protein += computeComponentGrams(g, c.protein_percent);
    salt += computeComponentGrams(g, c.salt_percent);
    fiber += computeComponentGrams(g, c.fiber_percent);
    alcohol += computeComponentGrams(g, c.alcohol_percent);
  }

  const per100 = (grams: number): number => (grams / totalBatchG) * 100;

  return {
    kcal: per100(kcal),
    fat_g: per100(fat),
    saturated_fat_g: saturatedComplete ? per100(saturated) : null,
    carbohydrate_g: per100(carbohydrate),
    sugars_g: per100(sugars),
    protein_g: per100(protein),
    salt_g: per100(salt),
    fiber_g: per100(fiber),
    alcohol_g: per100(alcohol),
  };
}
