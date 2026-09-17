/**
 * Owner 2026-09-17 (kiwi) — the bridge between a RECOGNISED idea and the RECIPE.
 *
 * Resolution writes the product onto the chip; it does not create a line. When a recipe
 * is already on screen (a saved recipe reopened, a second idea after the first recipe was
 * built) the customer saw „KIWI · Fresh Fruit” on the chip while the recipe stayed six
 * base ingredients. PURE: this only answers WHICH recognised products are still missing;
 * adding them stays with the existing add door (`addResolvedChip`), and so does the
 * amount question when nothing sizes a new line automatically.
 */
import type { IntentChip } from './homeDraftStore';

/** Whatever the recipe holds, read by its canonical ingredient identity. */
export interface RecipeLineIdentity {
  readonly ingredient: { readonly id: string };
}

/** The recognised chips whose product is in no base line and no topping (§22 identity). */
export function ideaProductsMissingFromRecipe(
  chips: readonly IntentChip[],
  items: readonly RecipeLineIdentity[],
  toppings: readonly RecipeLineIdentity[],
): readonly IntentChip[] {
  const present = new Set([
    ...items.map((line) => line.ingredient.id),
    ...toppings.map((line) => line.ingredient.id),
  ]);
  return chips.filter(
    (chip) => chip.productId !== null && !chip.ambiguous && !present.has(chip.productId),
  );
}
