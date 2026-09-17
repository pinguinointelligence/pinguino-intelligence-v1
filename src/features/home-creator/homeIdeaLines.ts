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
import type { IntentRole } from './homeIntentParsing';

/** Whatever the recipe holds, read by its canonical ingredient identity. */
export interface RecipeLineIdentity {
  readonly ingredient: { readonly id: string };
}

/**
 * The recognised chips whose product is not yet in the recipe IN THE ROLE THEY WERE SAID IN
 * (§22 identity, §33 role). The base and the toppings are two collections: a product used as
 * a topping does not answer a request to use it in the base, and the other way round.
 *
 * `statedRoles` is the customer's own §58 answer per chip (`usageAnswersByChipId`), which
 * outranks the word in the chip — the same precedence the add door uses. With no stated role
 * either collection still counts: the existing resolver decides where such a chip belongs,
 * and this module holds no ProductBehavior to repeat that decision.
 */
export function ideaProductsMissingFromRecipe(
  chips: readonly IntentChip[],
  items: readonly RecipeLineIdentity[],
  toppings: readonly RecipeLineIdentity[],
  statedRoles: Readonly<Record<string, IntentRole>> = {},
): readonly IntentChip[] {
  const inBase = new Set(items.map((line) => line.ingredient.id));
  const inToppings = new Set(toppings.map((line) => line.ingredient.id));
  return chips.filter((chip) => {
    if (chip.productId === null || chip.ambiguous) return false;
    const role = statedRoles[chip.id] ?? chip.role;
    if (role === 'topping') return !inToppings.has(chip.productId);
    if (role === 'ingredient') return !inBase.has(chip.productId);
    return !inBase.has(chip.productId) && !inToppings.has(chip.productId);
  });
}
