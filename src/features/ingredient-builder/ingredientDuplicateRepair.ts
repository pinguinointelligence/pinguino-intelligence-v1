import type { RecipeItem } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

/** Count only repairable duplicate aliases of the same canonical ingredient. */
export function repairableCanonicalDuplicateCount(items: readonly RecipeItem[]): number {
  const seen = new Set<string>();
  let extras = 0;
  for (const item of items) {
    if (item.lock_type !== 'unlocked' || item.actual_grams !== null) continue;
    const identity = canonicalIngredientId(item.ingredient);
    if (seen.has(identity)) extras += 1;
    else seen.add(identity);
  }
  return extras;
}
