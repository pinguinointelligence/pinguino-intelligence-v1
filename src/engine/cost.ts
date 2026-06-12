/**
 * Cost — recipe total, per kg and per serving (masterplan §12.10).
 *
 * Honesty rule: an ingredient with cost_per_kg === null is UNKNOWN — the recipe
 * cost becomes the incomplete state (complete: false, all money fields null,
 * missing ingredient ids listed). A missing cost is never silently treated as
 * 0; an explicit 0 means genuinely free (e.g. water). Currency-agnostic.
 *
 * Pure, deterministic, non-mutating.
 */
import type { EffectiveRecipeItem, RecipeCosts } from './types';

/** Standard serving sizes (grams) reported on every cost result. */
const STANDARD_SERVINGS_G = [60, 70, 80] as const;

export function computeRecipeCosts(
  items: readonly EffectiveRecipeItem[],
  totalBatchG: number,
  customServingG?: number,
): RecipeCosts {
  const missing_cost_ingredient_ids: string[] = [];
  let total = 0;

  for (const item of items) {
    const costPerKg = item.ingredient.cost_per_kg;
    if (costPerKg === null) {
      missing_cost_ingredient_ids.push(item.ingredient.id);
    } else {
      total += (item.effective_grams / 1000) * costPerKg;
    }
  }

  const complete = missing_cost_ingredient_ids.length === 0;
  const total_cost = complete ? total : null;
  const cost_per_kg = complete && totalBatchG > 0 ? (total / totalBatchG) * 1000 : null;
  const serving = (grams: number): number | null =>
    cost_per_kg !== null ? (cost_per_kg * grams) / 1000 : null;

  const costs: RecipeCosts = {
    total_cost,
    cost_per_kg,
    cost_per_serving_60g: serving(STANDARD_SERVINGS_G[0]),
    cost_per_serving_70g: serving(STANDARD_SERVINGS_G[1]),
    cost_per_serving_80g: serving(STANDARD_SERVINGS_G[2]),
    complete,
    missing_cost_ingredient_ids,
  };

  if (customServingG !== undefined) {
    costs.custom_serving_g = customServingG;
    costs.cost_per_custom_serving = customServingG > 0 ? serving(customServingG) : null;
  }

  return costs;
}
