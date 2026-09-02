/**
 * LIVE SCANNER — where a collected product goes.
 *
 * The sweep produces two kinds of result and they have two different destinations. This
 * module is the split, and nothing more: it decides, it does not act.
 *
 *   CONFIRMED       resolved to an exact catalogue entry -> the SAME HOME draft, through
 *                   the SAME `hydrateIngredient` + `recipeStore.addIngredient` path the
 *                   intent chips already use. The scanner adds no second way into a
 *                   recipe and does no formulation of its own.
 *
 *   NEEDS_RESOLUTION  read, but not something the catalogue knows -> the EXISTING deep
 *                   Scanner / contribution flow, which is where a new product is
 *                   profiled and submitted. The live sweep never invents one.
 */
import type { AcceptedProduct, LiveScanSessionState } from './liveScanSession';

export interface LiveScanHandoff {
  /** Catalogue product ids, ready for the HOME draft. */
  readonly toRecipe: readonly AcceptedProduct[];
  /** Products the deep Scanner has to profile before they can be used. */
  readonly toDeepScan: readonly AcceptedProduct[];
}

/** Split the review list by destination. Order follows the sweep. */
export function planHandoff(state: LiveScanSessionState): LiveScanHandoff {
  return {
    toRecipe: state.accepted.filter((product) => product.acceptance === 'confirmed'),
    toDeepScan: state.accepted.filter((product) => product.acceptance === 'needs_resolution'),
  };
}

/**
 * What the review screen says about a product.
 *
 * An unresolved product is never given a made-up name; it is described by what is
 * actually known about it, which is that it was read but not recognised.
 */
export function reviewLabel(product: AcceptedProduct): string {
  if (product.acceptance === 'confirmed') return product.label;
  return 'Nowy produkt — dokończ skanowanie';
}
