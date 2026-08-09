/**
 * Visible product types vs internal Engine categories (owner P0 — canonical Pro workbench).
 *
 * The CUSTOMER-FACING product-type selector exposes exactly FOUR types:
 * Gelato · Sorbet · Vegan · Protein. The engine's `ProductCategory` union keeps every
 * historical value (science freeze — no engine type is removed), but only a SUBSET of it
 * carries NATIVE seeded target bands.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * OWNER FINAL INTEGRATION ADDENDUM — item 1 (canonical families, 2026-07-25)
 *
 * WHAT WAS TRUE BEFORE: this module routed a visible Gelato to `alcohol_gelato` /
 * `nut_gelato` / `fruit_gelato` from ingredient presence (priority alcohol > chocolate >
 * nut > fruit > milk). `src/engine/config/targets.ts` seeds NATIVE bands for exactly
 * four categories (milk_gelato, chocolate_gelato, sorbet, vegan_gelato at −11/−12/−13 =
 * 12 cells); fruit/nut/alcohol_gelato and custom are deliberately UNSEEDED and
 * `statuses.ts selectTargetBand` silently substitutes the milk_gelato bands
 * (`CATEGORY_FALLBACK`) while flagging `category_fallback: true`. Every fruit, nut and
 * alcohol result was therefore scored on SUBSTITUTE bands and permanently labelled
 * provisional — the single root of the "provisional fruit result" the owner has been
 * fighting.
 *
 * WHAT IS TRUE NOW: RUNTIME MAY ONLY EVER SELECT A CATEGORY THAT HAS NATIVE SEEDED
 * BANDS. Fruit, nuts and alcohol are FLAVOUR COMPONENTS of a canonical family, never
 * families of their own. The canonical runtime families are exactly:
 *   Gelato (→ milk_gelato / chocolate_gelato) · Sorbet (→ sorbet) ·
 *   Vegan (→ vegan_gelato) · Protein (honest-unsupported, never silently re-profiled).
 *
 * The allowed set is DERIVED from the engine's own seeded-cell list, so seeding a new
 * cell in `targets.ts` automatically unlocks that category for runtime — this module
 * never hard-codes the list and never touches a band value (science freeze).
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Detection is pure and derived from the ACTUAL selected ingredients (never guessed,
 * never from names):
 *  - alcohol   → any line with category 'alcohol' or composition.alcohol_percent > 0;
 *  - chocolate → category 'chocolate_cocoa';
 *  - nut       → category 'nut_paste';
 *  - fruit     → category 'fruit';
 *  - dairy     → REAL composition: lactose present (the milk-solids marker carried by
 *                milk / cream / SMP / condensed milk) OR the structured `is_dairy`
 *                flag (the anhydrous-milk-fat / butter-oil case, where lactose ≈ 0 but
 *                the fat is dairy fat). NEVER a name match.
 *
 * Grams are deliberately NOT part of detection: a SELECTED line at 0 g is a selection
 * PI may fill (the frozen zero-gram selected-ingredient semantics), so a fruit gelato
 * whose milk line still sits at 0 g is a DAIRY gelato, not a sorbet.
 */
import { TARGET_BANDS, type ProductCategory, type RecipeItem } from '@/engine';

export type VisibleProductType = 'gelato' | 'sorbet' | 'vegan' | 'protein';

export const VISIBLE_PRODUCT_TYPES: readonly VisibleProductType[] = [
  'gelato',
  'sorbet',
  'vegan',
  'protein',
];

/**
 * The internal categories the ENGINE really seeds with native approved bands — read
 * from `TARGET_BANDS` itself (owner addendum item 1). Never hard-coded: when the
 * science team seeds a new profile cell, that category becomes selectable at runtime
 * with no change to this module.
 */
export const NATIVE_BAND_CATEGORIES: readonly ProductCategory[] = [
  ...new Set(TARGET_BANDS.filter((band) => band.status === 'seeded').map((band) => band.category)),
];

/** TRUE when the engine has its OWN approved bands for this category (no fallback). */
export function hasNativeSeededBands(category: ProductCategory): boolean {
  return NATIVE_BAND_CATEGORIES.includes(category);
}

/** Ingredient-derived classifications (owner QA diagnostic surfaces these). */
export interface DetectedClassifications {
  alcohol: boolean;
  chocolate: boolean;
  nut: boolean;
  fruit: boolean;
  /** Owner addendum item 1 — real milk solids / dairy fat present in the mix. */
  dairy: boolean;
}

export function detectClassifications(items: readonly RecipeItem[]): DetectedClassifications {
  let alcohol = false;
  let chocolate = false;
  let nut = false;
  let fruit = false;
  let dairy = false;
  for (const item of items) {
    const ing = item.ingredient;
    if (ing.category === 'alcohol' || ing.composition.alcohol_percent > 0) alcohol = true;
    if (ing.category === 'chocolate_cocoa') chocolate = true;
    if (ing.category === 'nut_paste') nut = true;
    if (ing.category === 'fruit') fruit = true;
    // REAL composition, never a name: lactose is the milk-solids marker; the
    // structured is_dairy flag covers dairy fat that carries no lactose.
    if (ing.composition.lactose_percent > 0 || ing.flags?.is_dairy === true) dairy = true;
  }
  return { alcohol, chocolate, nut, fruit, dairy };
}

/**
 * The internal Engine category a visible GELATO routes to, from its real ingredients.
 *
 * OWNER ADDENDUM item 1 — the complete decision table (EVERY branch is a NATIVE cell):
 *   1. fruit present AND no dairy anywhere  → `sorbet`
 *      A water-based non-dairy fruit recipe IS a sorbet whatever the selector said; the
 *      sorbet cell is the only approved profile whose bands DISABLE the dairy gates, so
 *      it is the only honest home for it.
 *   2. chocolate / cocoa present            → `chocolate_gelato` (already native, kept)
 *   3. anything else                        → `milk_gelato`
 *
 * Alcohol and nuts no longer route anywhere of their own (this SUPERSEDES the previous
 * alcohol > chocolate > nut > fruit priority): they are flavour components of the dairy
 * family and are now scored on the real, approved milk/chocolate science instead of on
 * substituted milk bands wearing a `category_fallback` flag.
 *
 * Known edge, documented deliberately: chocolate WITHOUT dairy and WITHOUT fruit stays
 * on `chocolate_gelato`, whose approved bands include the dairy gates — the recipe then
 * fails those gates VISIBLY (honest) rather than being silently re-profiled to vegan.
 */
export function gelatoInternalCategory(items: readonly RecipeItem[]): ProductCategory {
  const detected = detectClassifications(items);
  if (detected.fruit && !detected.dairy) return 'sorbet';
  if (detected.chocolate) return 'chocolate_gelato';
  return 'milk_gelato';
}

/**
 * The internal category for a visible type + the current ingredients.
 * Every visible product type maps to one dedicated seeded calculation policy.
 */
export function internalCategoryFor(
  visible: VisibleProductType,
  items: readonly RecipeItem[],
  _previous: ProductCategory,
): ProductCategory {
  void _previous;
  switch (visible) {
    case 'gelato':
      return gelatoInternalCategory(items);
    case 'sorbet':
      return 'sorbet';
    case 'vegan':
      return 'vegan_gelato';
    case 'protein':
      return 'protein_gelato';
  }
}

/**
 * CANONICALIZE a category that arrived from OUTSIDE the live derivation — a persisted
 * draft, a saved recipe version, a demo preset, a direct `setCategory` write, an
 * imported `RecipeInput`.
 *
 * Owner addendum item 1: an UNSEEDED category is a flavour description, not a family —
 * it is re-derived from the real ingredients so the engine can only ever be asked for
 * bands it actually owns. A category that HAS native bands is returned untouched (byte
 * identity), so this is a no-op for every already-canonical recipe.
 *
 * Every unseeded value (`fruit_gelato`, `nut_gelato`, `alcohol_gelato`, `custom`)
 * projects to the visible GELATO family, so the gelato derivation is the whole rule.
 */
export function canonicalInternalCategory(
  category: ProductCategory,
  items: readonly RecipeItem[],
): ProductCategory {
  if (hasNativeSeededBands(category)) return category;
  return gelatoInternalCategory(items);
}

/** The visible type an internal category projects to (for reopened saved recipes). */
export function visibleTypeOf(category: ProductCategory): VisibleProductType {
  switch (category) {
    case 'sorbet':
      return 'sorbet';
    case 'vegan_gelato':
      return 'vegan';
    case 'protein_gelato':
      return 'protein';
    default:
      return 'gelato'; // milk/fruit/nut/chocolate/alcohol gelato + custom are all visible GELATO
  }
}

/** True when the visible type owns native seeded bands. */
export function isSupportedVisibleType(visible: VisibleProductType): boolean {
  return hasNativeSeededBands(internalCategoryFor(visible, [], 'milk_gelato'));
}
