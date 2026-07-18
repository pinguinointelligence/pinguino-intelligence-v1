/**
 * Ice-fraction anchor configuration (spec §9) — category-aware from day one.
 *
 * The anchor-matrix MVP model estimates ice fraction from (category, target
 * temperature, NPAC). ALL values here are calibration data: only active
 * external reference fixtures may change them (config-only change + CONFIG_VERSION bump,
 * spec §16–§17). Documented upgrade path: more per-category rows and/or a
 * freezing-curve model replace the internals later without an API change.
 */
import type { ProductCategory } from '../types';

export interface IceAnchorRow {
  /** Anchor rows are never category-blind (spec product categories). */
  category: ProductCategory;
  temperature_c: number;
  /** Band: lower NPAC ⇒ harder ⇒ MORE ice; higher NPAC ⇒ softer ⇒ LESS ice. */
  npac_low: number;
  ice_at_npac_low: number;
  npac_high: number;
  ice_at_npac_high: number;
  /** 'seeded' = from the LOCKED spec / approved reference records; 'estimated' = calibration-pending default. */
  status: 'seeded' | 'estimated';
  /** Traceable provenance of the two anchor points (approved fixture ids). */
  source?: string;
}

/**
 * Seeded milk_gelato anchor rows, all transcribed from ALREADY-APPROVED reference
 * records — nothing here is invented.
 *
 *  • −11 °C: verbatim from the LOCKED spec (NPAC 33 → 54.5 % ice; 42 → 45 %).
 *  • −12 °C and −13 °C (CONFIG 0.7.0, owner-authorized 2026-07-18): the two anchor
 *    points per temperature are the exact (NPAC, ice-fraction) coordinates of the
 *    LOCKED clean-reference recipes in
 *    `src/spine/temperatureRegulator.ts::TEMPERATURE_REGULATOR_GOLDEN_FIXTURES`:
 *      −12: G15 (NPAC 44.98 → 50.35 %) and G17 (NPAC 46.18 → 50.34 %);
 *      −13: G11 (NPAC 51.77 → 49.73 %) and G18 (NPAC 53.15 → 49.69 %).
 *    This CONNECTS previously-approved data that was never wired into the ice model;
 *    it is implementation of approved values, not new calibration. It removes the
 *    −11-anchor temperature extrapolation that made −12/−13 recipes fall out of the
 *    ice band and blocked Monitor recalculation.
 *
 * HONEST LIMITATION (documented, not blocking — see
 * docs/engine/TRACK_G_ICE_ANCHOR_WIRING.md): the two clean anchors at each of
 * −12/−13 sit close together in NPAC (Δ≈1.2 / 1.4), so the WITHIN-band ice-vs-NPAC
 * slope is weakly constrained (near-flat ≈ the approved clean-anchor ice level).
 * That is sufficient for the actual defect — the NPAC, POD and ice bands are now
 * JOINTLY satisfiable, so the solver finds real corrections — but a
 * production-grade slope would need additional approved validation points spread
 * across the band. No such points exist in the approved records, so none are
 * invented. Unseeded categories still fall back to the milk_gelato rows at the
 * same temperature (a pre-existing, documented category-fallback approximation).
 */
export const ICE_ANCHOR_ROWS: readonly IceAnchorRow[] = [
  {
    category: 'milk_gelato',
    temperature_c: -11,
    npac_low: 33,
    ice_at_npac_low: 54.5,
    npac_high: 42,
    ice_at_npac_high: 45,
    status: 'seeded',
    source: 'locked_spec_v1',
  },
  {
    // Approved clean −12 °C anchors, exact fixture coordinates (no invention).
    category: 'milk_gelato',
    temperature_c: -12,
    npac_low: 44.98, // G15
    ice_at_npac_low: 50.35, // G15
    npac_high: 46.18, // G17
    ice_at_npac_high: 50.34, // G17
    status: 'seeded',
    source: 'golden_fixtures:G15,G17',
  },
  {
    // Approved clean −13 °C anchors, exact fixture coordinates (no invention).
    category: 'milk_gelato',
    temperature_c: -13,
    npac_low: 51.77, // G11
    ice_at_npac_low: 49.73, // G11
    npac_high: 53.15, // G18
    ice_at_npac_high: 49.69, // G18
    status: 'seeded',
    source: 'golden_fixtures:G11,G18',
  },
];

/**
 * True when the ice model has a SEEDED anchor at exactly `temperatureC` for
 * `category` (its own, or the milk_gelato fallback at that temperature) — i.e. the
 * estimate needs NO cross-temperature extrapolation. Interactive Monitor tuning is
 * only offered where this holds, so PI never endorses gram changes computed from a
 * temperature-extrapolated ice curve.
 */
export function hasSeededIceAnchorAtTemperature(
  category: ProductCategory,
  temperatureC: number,
): boolean {
  const seededAt = (cat: ProductCategory): boolean =>
    ICE_ANCHOR_ROWS.some(
      (r) => r.category === cat && r.temperature_c === temperatureC && r.status === 'seeded',
    );
  return seededAt(category) || seededAt('milk_gelato');
}

/**
 * Temperature fallback slope: ice-fraction points per °C colder, applied when
 * the target temperature has no anchored row (colder ⇒ more ice).
 * ESTIMATE — CALIBRATION-PENDING; recipe fixtures at non-anchored serving
 * temperatures calibrate it. Overridable per call via IceFractionOptions.
 */
export const ICE_TEMPERATURE_SLOPE_PER_C = 2.0;
