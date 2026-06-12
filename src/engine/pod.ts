/**
 * POD — relative sweetening power (spec §7).
 *
 * POD is calculated from sugar-TYPE contributions, never from total sugar:
 * `sugar_percent` is never read here. Coefficients come exclusively from
 * src/engine/config/coefficients.ts (passed as a parameter, defaulting to
 * POD_COEFFICIENTS) — no inline coefficients.
 *
 * Stored-value-first rule (spec §7): a non-null ingredient `pod_value` wins over
 * the breakdown fallback. Convention: `pod_value` is on the per-100 g points
 * scale with sucrose = 100 (pure sucrose stores 100), so an ingredient
 * contribution is `effective_grams × pod_value / 100` — the same point-gram
 * unit as the coefficient path. This convention is validated/corrected by the
 * honey and glucose-syrup external reference fixtures at calibration (spec §16).
 *
 * Polyols and untyped "other" sugar are ingredient-specific per the spec §7
 * table: the breakdown fallback contributes 0 for them — their correct path is
 * a stored `pod_value`. Seed/ingredient data must store `pod_value` for polyol
 * and special ingredients (honey, syrups, invert).
 *
 * All functions are pure, deterministic and never mutate their inputs.
 * No PAC/NPAC here — freezing power is a separate later stage (spec §8).
 */
import { computeComponentGrams } from './composition';
import { POD_COEFFICIENTS } from './config/coefficients';
import type { EffectiveRecipeItem, SugarCoefficients } from './types';

/**
 * One ingredient's POD term in point-grams (the Σ numerator of the spec §7
 * formula): stored `pod_value` if present, otherwise the typed sugar breakdown
 * weighted by the config coefficients.
 */
export function ingredientPodContribution(
  item: EffectiveRecipeItem,
  coefficients: SugarCoefficients = POD_COEFFICIENTS,
): number {
  const { ingredient, effective_grams } = item;

  // A. Stored-value-first (spec §7) — per-100 g points scale, sucrose = 100.
  if (ingredient.pod_value !== null) {
    return (effective_grams * ingredient.pod_value) / 100;
  }

  // B. Fallback: typed sugar breakdown only — never sugar_percent (spec §4).
  const c = ingredient.composition;
  return (
    computeComponentGrams(effective_grams, c.sucrose_percent) * coefficients.sucrose +
    computeComponentGrams(effective_grams, c.dextrose_percent) * coefficients.dextrose +
    computeComponentGrams(effective_grams, c.glucose_percent) * coefficients.glucose +
    computeComponentGrams(effective_grams, c.fructose_percent) * coefficients.fructose +
    computeComponentGrams(effective_grams, c.lactose_percent) * coefficients.lactose
  );
}

/**
 * Spec §7: `pod_points = Σ(component_g × pod_coefficient) / total_batch_g × 100`,
 * with stored ingredient `pod_value` converted to the same point-gram unit.
 * Division-by-zero safe: an empty or zero-mass batch yields 0 — never NaN or
 * Infinity.
 */
export function computeRecipePod(
  items: readonly EffectiveRecipeItem[],
  totalBatchG: number,
  coefficients: SugarCoefficients = POD_COEFFICIENTS,
): number {
  if (totalBatchG <= 0) return 0;
  let pointGrams = 0;
  for (const item of items) {
    pointGrams += ingredientPodContribution(item, coefficients);
  }
  return (pointGrams / totalBatchG) * 100;
}
