/**
 * Ice fraction — anchor-matrix MVP estimation (spec §9).
 *
 * Estimates the category-anchored ice-fraction percentage at the target serving
 * temperature from (category, temperature, NPAC) for the anchor-calibrated
 * categories (milk / protein gelato and the documented milk fallback). It is NOT
 * a Sorbet authority: Sorbet ice is ice mass / total mix mass from the
 * composition-sensitive solver (`sorbetFreezingPhysics.ts`); this function
 * returns null for Sorbet whenever no Sorbet anchor rows exist (none are seeded
 * and none may be invented). Inverse-linear inside the calibrated band:
 * higher NPAC ⇒ more freezing depression ⇒ SOFTER gelato ⇒ lower ice fraction;
 * lower NPAC ⇒ harder ⇒ higher ice fraction.
 *
 * Strategy (documented; every fallback is CALIBRATION-PENDING):
 * 1. Invalid input (null/NaN/negative NPAC, NaN temperature, no anchors)
 *    → null. The function never throws in normal recipe use.
 * 2. temperature ≥ 0 °C → 0 (physical bound: nothing freezes at or above 0).
 * 3. Row selection is CATEGORY-FIRST: anchors are filtered by the input
 *    category. Sorbet never falls back because its production path is the
 *    composition-sensitive solver in calculateRecipe. Other unseeded
 *    categories retain the documented milk_gelato fallback, and return null
 *    if even those rows are absent. Within the rows: exact temperature match,
 *    otherwise nearest by |Δtemp| (tie → the colder row).
 * 4. NPAC inside the band: linear between (npac_low → ice_at_npac_low) and
 *    (npac_high → ice_at_npac_high). Outside the band: linear extrapolation on
 *    the same band slope, then clamped to the physical [0, 100] range — always
 *    finite, never NaN/Infinity.
 * 5. Non-anchored temperatures: the row result shifts by
 *    (row.temperature − target) × temperature_slope (colder ⇒ more ice) —
 *    the slope is a calibration-pending estimate from config.
 *
 * Upgrade path (spec §9): per-category anchor rows and/or a freezing-curve
 * model can replace these internals later with the same signature.
 * Only active external reference fixtures may calibrate anchors or slope (spec §16).
 * Pure and deterministic; inputs are never mutated.
 */
import {
  ICE_ANCHOR_ROWS,
  ICE_TEMPERATURE_SLOPE_PER_C,
  resolveIceAnchorRows,
  type IceAnchorRow,
} from './config/iceAnchors';
import type { ProductCategory } from './types';

export interface IceFractionInput {
  npac: number | null;
  temperature_c: number;
  category: ProductCategory;
}

export interface IceFractionOptions {
  anchors?: readonly IceAnchorRow[];
  /** Ice-points per °C colder for non-anchored temperatures (calibration-pending). */
  temperature_slope?: number;
}

/** Nearest row by |Δtemperature|; ties resolve to the colder row (deterministic). */
function selectNearestRow(rows: readonly IceAnchorRow[], temperatureC: number): IceAnchorRow {
  let selected = rows[0]!;
  let bestDistance = Math.abs(selected.temperature_c - temperatureC);
  for (const candidate of rows) {
    const distance = Math.abs(candidate.temperature_c - temperatureC);
    if (
      distance < bestDistance ||
      (distance === bestDistance && candidate.temperature_c < selected.temperature_c)
    ) {
      selected = candidate;
      bestDistance = distance;
    }
  }
  return selected;
}

export function estimateIceFraction(
  input: IceFractionInput,
  options: IceFractionOptions = {},
): number | null {
  const { anchors = ICE_ANCHOR_ROWS, temperature_slope = ICE_TEMPERATURE_SLOPE_PER_C } = options;
  const { npac, temperature_c, category } = input;

  // 1. invalid input → null (safe, never throws)
  if (npac === null || Number.isNaN(npac) || npac < 0) return null;
  if (Number.isNaN(temperature_c)) return null;
  if (anchors.length === 0) return null;

  // 2. physical bound
  if (temperature_c >= 0) return 0;

  // 3. category-first selection; Sorbet must never receive milk-gelato truth.
  //    The rule lives in ONE named seam so the documented dairy fallback (which
  //    is what today answers for Vegan) can be replaced in a single place —
  //    `resolveIceAnchorRows`. Behaviour here is unchanged.
  const rows = resolveIceAnchorRows(anchors, category);
  if (rows.length === 0) return null;

  const row = selectNearestRow(rows, temperature_c);
  if (row.npac_high === row.npac_low) return null; // degenerate anchor row

  // 4. inverse-linear within the band; extrapolation continues the band slope
  const bandSlope = (row.ice_at_npac_high - row.ice_at_npac_low) / (row.npac_high - row.npac_low);
  const iceAtRowTemperature = row.ice_at_npac_low + (npac - row.npac_low) * bandSlope;

  // 5. temperature shift for non-anchored temperatures (calibration-pending)
  const shifted = iceAtRowTemperature + (row.temperature_c - temperature_c) * temperature_slope;

  // physical clamp — always finite
  return Math.min(100, Math.max(0, shifted));
}
