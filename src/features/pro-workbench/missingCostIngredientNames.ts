import type { FinalProductCalculation } from '@/features/recipe-composition/finalProduct';

/** Resolve customer copy from the ingredients currently present in the final product.
 * Missing technical ids are deliberately omitted instead of leaking into the UI. */
export function missingCostIngredientNames(
  product: Pick<FinalProductCalculation, 'finalCosts' | 'finalItems'> | null,
): string[] {
  const missingIds = new Set(product?.finalCosts?.missing_cost_ingredient_ids ?? []);
  if (missingIds.size === 0) return [];
  const names = new Set<string>();
  for (const item of product?.finalItems ?? []) {
    if (!missingIds.has(item.ingredient.id)) continue;
    const name = item.ingredient.name.trim();
    if (name) names.add(name);
  }
  return [...names];
}
