/**
 * Ingredient statement builder (Labels & Exports, file-first / client-only).
 *
 * Produces the EU QUID-ordered ingredient list from the engine's RECIPE RESULT
 * output — descending by effective grams. It reads names and effective grams
 * that the engine already computed; it never recomputes recipe math.
 *
 * NO allergen output: the engine carries no allergen data, so this builder
 * honestly omits it. The allergen gap is stated in copy (not fabricated here).
 */
import type { RecipeResult } from '@/engine';

export interface IngredientStatementEntry {
  name: string;
  /** Effective grams in the batch, rounded to 1 decimal. */
  grams: number;
  /** Share of total batch mass (%), rounded to 1 decimal (EU QUID). */
  percent: number;
}

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Build the ingredient statement, sorted by DESCENDING effective grams.
 * Zero-mass lines are omitted (they are not part of the finished product).
 */
export function buildIngredientStatement(result: RecipeResult): IngredientStatementEntry[] {
  const total = result.total_batch_g;
  return result.items
    .filter((item) => item.effective_grams > 0)
    .slice()
    .sort((a, b) => b.effective_grams - a.effective_grams)
    .map((item) => ({
      name: item.ingredient.name,
      grams: round1(item.effective_grams),
      percent: total > 0 ? round1((item.effective_grams / total) * 100) : 0,
    }));
}
