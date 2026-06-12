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
  /** 'seeded' = from the LOCKED spec; 'estimated' = calibration-pending default. */
  status: 'seeded' | 'estimated';
}

/**
 * Exactly ONE seeded row — milk gelato @ −11 °C, verbatim from the LOCKED spec
 * (NPAC 33 → ≈ 54.5 % ice; NPAC 42 → ≈ 45 % ice). No anchors are invented for
 * other categories or temperatures; they arrive only via external calibration.
 * Unseeded categories fall back to the milk_gelato rows — explicitly a
 * CALIBRATION-PENDING fallback (see estimateIceFraction).
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
  },
];

/**
 * Temperature fallback slope: ice-fraction points per °C colder, applied when
 * the target temperature has no anchored row (colder ⇒ more ice).
 * ESTIMATE — CALIBRATION-PENDING; recipe fixtures at non-anchored serving
 * temperatures calibrate it. Overridable per call via IceFractionOptions.
 */
export const ICE_TEMPERATURE_SLOPE_PER_C = 2.0;
