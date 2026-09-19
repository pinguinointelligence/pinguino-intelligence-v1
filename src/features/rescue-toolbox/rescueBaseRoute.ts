/**
 * THE BASE ROUTE OF A RECIPE — the structural family its composition belongs to,
 * as distinct from its `ProductCategory`.
 *
 * NAPRAWA 5 needs this because profile identity outranks Direction: a candidate
 * that would convert a Sorbet into a dairy Gelato, a Vegan draft into a dairy or
 * egg product, or a PLANT Protein recipe into a DAIRY Protein recipe is invalid
 * however good its physics. `ProductCategory` alone cannot express that — every
 * Protein Gelato carries the same category whether its protein comes from whey
 * or from pea.
 *
 * The route is DERIVED, never stored and never guessed: for Protein it comes
 * from `recipeProteinSourceProfile`, the existing authority that weights each
 * line by the protein grams it actually delivers. When that authority cannot
 * classify the recipe the route is `unknown`, and an `unknown` route never
 * licenses a candidate — it withholds one, which is the safe direction.
 */
import type { ProductCategory, RecipeInput } from '@/engine';
import { recipeProteinSourceProfile } from '@/features/protein-gelato/proteinBehavior';

export type RescueBaseRoute = 'dairy' | 'plant' | 'water' | 'unknown';

/** Protein source classes that ARE the dairy route. */
const DAIRY_PROTEIN_CLASSES = new Set([
  'whey_protein_isolate',
  'whey_protein_concentrate',
  'milk_protein_concentrate',
  'micellar_casein',
  'caseinate',
  'skim_milk_powder',
  'milk_powder',
  'fluid_dairy',
  'fermented_dairy',
  'mixed_dairy_protein',
]);

/** The gelato families whose canonical base is dairy. */
const DAIRY_GELATO_CATEGORIES: ReadonlySet<ProductCategory> = new Set<ProductCategory>([
  'milk_gelato',
  'fruit_gelato',
  'nut_gelato',
  'chocolate_gelato',
  'alcohol_gelato',
]);

export function rescueBaseRoute(input: RecipeInput): RescueBaseRoute {
  if (input.category === 'sorbet') return 'water';
  if (input.category === 'vegan_gelato') return 'plant';
  if (DAIRY_GELATO_CATEGORIES.has(input.category)) return 'dairy';
  if (input.category === 'protein_gelato') {
    const profile = recipeProteinSourceProfile(
      input.items.map((item) => ({ ingredient: item.ingredient, grams: item.planned_grams })),
    );
    const dominant = profile.dominantClass;
    if (dominant === null) return 'unknown';
    if (dominant === 'plant_protein') return 'plant';
    if (DAIRY_PROTEIN_CLASSES.has(dominant)) return 'dairy';
    // `egg_protein` and `unknown` are deliberately not a route: neither tells us
    // which structure the recipe is built on, and inventing one here is exactly
    // how a plant route would quietly become a dairy route.
    return 'unknown';
  }
  // `custom` and anything added later: do not guess. A caller that cannot resolve
  // the route records a missing authority rather than claiming impossibility.
  return 'unknown';
}
