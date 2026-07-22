/**
 * Visible product types vs internal Engine categories (owner P0 — canonical Pro workbench).
 *
 * The CUSTOMER-FACING product-type selector exposes exactly FOUR types:
 * Gelato · Sorbet · Vegan · Protein. The engine's `ProductCategory` values
 * (milk/fruit/nut/chocolate/alcohol gelato, sorbet, vegan, custom) are INTERNAL calculation
 * policies — scientifically required, never removed, never shown as primary choices. Chocolate is
 * NEVER a visible product type: a Gelato containing chocolate ingredients routes internally to
 * `chocolate_gelato`.
 *
 * Detection is pure and derived from the ACTUAL ingredients (never guessed):
 *  - alcohol   → any line with category 'alcohol' or composition.alcohol_percent > 0;
 *  - chocolate → category 'chocolate_cocoa';
 *  - nut       → category 'nut_paste';
 *  - fruit     → category 'fruit'.
 *
 * Routing priority (deterministic, test-pinned): alcohol > chocolate > nut > fruit > milk.
 * Alcohol dominates because it changes freezing physics the most; chocolate/nut are solid-fat
 * dominant policies; fruit is the weakest modifier. This module only PICKS between existing
 * engine categories — no formula, band, or engine value is created or altered here.
 */
import type { ProductCategory, RecipeItem } from '@/engine';

export type VisibleProductType = 'gelato' | 'sorbet' | 'vegan' | 'protein';

export const VISIBLE_PRODUCT_TYPES: readonly VisibleProductType[] = [
  'gelato',
  'sorbet',
  'vegan',
  'protein',
];

/** Ingredient-derived classifications (owner QA diagnostic surfaces these). */
export interface DetectedClassifications {
  alcohol: boolean;
  chocolate: boolean;
  nut: boolean;
  fruit: boolean;
}

export function detectClassifications(items: readonly RecipeItem[]): DetectedClassifications {
  let alcohol = false;
  let chocolate = false;
  let nut = false;
  let fruit = false;
  for (const item of items) {
    const ing = item.ingredient;
    if (ing.category === 'alcohol' || ing.composition.alcohol_percent > 0) alcohol = true;
    if (ing.category === 'chocolate_cocoa') chocolate = true;
    if (ing.category === 'nut_paste') nut = true;
    if (ing.category === 'fruit') fruit = true;
  }
  return { alcohol, chocolate, nut, fruit };
}

/** The internal Engine category a visible GELATO routes to, from its real ingredients. */
export function gelatoInternalCategory(items: readonly RecipeItem[]): ProductCategory {
  const detected = detectClassifications(items);
  if (detected.alcohol) return 'alcohol_gelato';
  if (detected.chocolate) return 'chocolate_gelato';
  if (detected.nut) return 'nut_gelato';
  if (detected.fruit) return 'fruit_gelato';
  return 'milk_gelato';
}

/**
 * The internal category for a visible type + the current ingredients.
 * Protein is NOT scientifically complete: it maps to no engine category — callers keep the
 * previous category and show the honest unsupported state (never a silent guess).
 */
export function internalCategoryFor(
  visible: VisibleProductType,
  items: readonly RecipeItem[],
  previous: ProductCategory,
): ProductCategory {
  switch (visible) {
    case 'gelato':
      return gelatoInternalCategory(items);
    case 'sorbet':
      return 'sorbet';
    case 'vegan':
      return 'vegan_gelato';
    case 'protein':
      return previous; // honest unsupported — the recipe is never silently re-profiled
  }
}

/** The visible type an internal category projects to (for reopened saved recipes). */
export function visibleTypeOf(category: ProductCategory): VisibleProductType {
  switch (category) {
    case 'sorbet':
      return 'sorbet';
    case 'vegan_gelato':
      return 'vegan';
    default:
      return 'gelato'; // milk/fruit/nut/chocolate/alcohol gelato + custom are all visible GELATO
  }
}

/** True when the visible type is scientifically supported by the Engine today. */
export function isSupportedVisibleType(visible: VisibleProductType): boolean {
  return visible !== 'protein';
}
