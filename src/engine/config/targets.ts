/**
 * Target ranges by (product category, target serving temperature) — spec §9.
 * Data only: band lookup/interpolation lives in statuses.ts.
 *
 * The milk gelato @ −11 °C band is seeded verbatim from the LOCKED spec and is
 * NEVER edited (the calibrated base stays stable).
 *
 * CONFIG 0.6.0 — temperature-aware bands (owner-approved engine slice): the
 * remaining 11 profile × temperature cells are seeded VERBATIM from the locked
 * Temperature Regulator documents (src/spine/temperatureRegulator.ts, v0.1
 * FINAL transcriptions of Temperature_Regulator_{GELATO,SORBET,VEGAN,
 * CHOCOLATE}.md). Nothing is invented:
 *  - regulator gate ids map to engine metrics 1:1 except
 *    lactoseSanding → lactose_sandiness_risk and
 *    proteinShareInSolids → protein_in_solids (the Slice-12 shadow mapping);
 *  - sorbet/vegan bands OMIT the dairy gates the regulator DISABLES
 *    (lactose, lactose_sandiness_risk, aerating_protein, protein_in_solids —
 *    and fat for sorbet): an omitted metric is never solver-gated and
 *    classifies as needs_correction (cannot assess) — never evaluated against
 *    a foreign category's band again;
 *  - chocolate protein_in_solids is the regulator's ADVISORY gate: its engine
 *    band uses the LOCKED hard minimum 7 as min (below 7 even chocolate fails)
 *    and the locked advisory band max 13 — so the advisory zone 7–8 no longer
 *    hard-flags the way the old milk-band fallback ([9,13]) did. The full
 *    advisory semantics live in the spine regulator evaluation, unchanged;
 *  - the alcohol range is the engine spec §9 row (temperature- and
 *    category-independent safety warn) carried verbatim into every band —
 *    exactly what every cell already received via the old fallback.
 * Sources per entry are annotated with the regulator's own status string.
 * fruit_gelato / nut_gelato / alcohol_gelato / other stay UNSEEDED and keep
 * the documented milk_gelato fallback (flagged calibration-pending).
 */
import type { TargetBand, TargetRange } from '../types';

/**
 * Status classification threshold (spec §9/§12.7): the centered fraction of a
 * target band classified as 'ideal' — values inside the band but outside this
 * inner zone classify as 'good'. CALIBRATION-PENDING estimate, tunable; affects
 * only the ideal/good split, never in-band vs out-of-band truth.
 */
export const IDEAL_ZONE_FRACTION = 0.6;

/** Spec §9 alcohol safety row — temperature/category-independent (see header). */
const ALCOHOL_RANGE: TargetRange = { min: 0, max: 2.5, warn_above: 2.5 };

export const TARGET_BANDS: readonly TargetBand[] = [
  {
    category: 'milk_gelato',
    temperature_c: -11,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 17 },
      npac: { min: 33, max: 42 },
      ice_fraction: { min: 45, max: 54.5 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 9, max: 13 },
      total_solids: { min: 31, max: 45 },
      water: { min: 57, max: 70 },
      alcohol: { min: 0, max: 2.5, warn_above: 2.5 },
    },
  },

  // ── standard_gelato → milk_gelato (Temperature_Regulator_GELATO.md) ───────
  {
    // regulator: standard_gelato −12, locked_v0_1 (G17 reference, G15 anchor)
    category: 'milk_gelato',
    temperature_c: -12,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 17 },
      npac: { min: 42, max: 50 },
      ice_fraction: { min: 46, max: 54 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 9, max: 13 },
      total_solids: { min: 31, max: 44 },
      water: { min: 56, max: 70 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: standard_gelato −13, locked_v0_1 (G18 reference, G11 anchor)
    category: 'milk_gelato',
    temperature_c: -13,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 17 },
      npac: { min: 48, max: 55 },
      ice_fraction: { min: 46, max: 52 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 9, max: 13 },
      total_solids: { min: 35, max: 45 },
      water: { min: 55, max: 65 },
      alcohol: ALCOHOL_RANGE,
    },
  },

  // ── chocolate_gelato (Temperature_Regulator_CHOCOLATE.md) ─────────────────
  // protein_in_solids min = the LOCKED hard minimum 7 (advisory band [8,13],
  // hardMinimum 7) — see the header note; advisory semantics stay spine-side.
  {
    // regulator: chocolate_gelato −11, locked_pinguino_internal_v0_1
    category: 'chocolate_gelato',
    temperature_c: -11,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 20 },
      npac: { min: 34, max: 45 },
      ice_fraction: { min: 45, max: 54.5 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 7, max: 13 },
      total_solids: { min: 31, max: 45 },
      water: { min: 57, max: 70 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: chocolate_gelato −12, locked_pinguino_internal_v0_1
    category: 'chocolate_gelato',
    temperature_c: -12,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 20 },
      npac: { min: 43, max: 52 },
      ice_fraction: { min: 46, max: 54 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 7, max: 13 },
      total_solids: { min: 31, max: 45 },
      water: { min: 56, max: 70 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: chocolate_gelato −13, locked_pinguino_v0_1 (C01 evidence)
    category: 'chocolate_gelato',
    temperature_c: -13,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 20 },
      npac: { min: 49, max: 57 },
      ice_fraction: { min: 46, max: 52 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 7, max: 13 },
      total_solids: { min: 35, max: 45 },
      water: { min: 55, max: 65 },
      alcohol: ALCOHOL_RANGE,
    },
  },

  // ── sorbet (Temperature_Regulator_SORBET.md) ──────────────────────────────
  // Dairy gates + dairy_fat_logic are DISABLED by the locked doc ("never
  // evaluated with Standard Gelato dairy gates") → those metrics are omitted.
  {
    // regulator: sorbet −11, locked_v0_1 (S01 reference)
    category: 'sorbet',
    temperature_c: -11,
    status: 'seeded',
    metrics: {
      pod: { min: 15, max: 25 },
      npac: { min: 35, max: 40 },
      ice_fraction: { min: 51, max: 59 },
      total_solids: { min: 25, max: 33 },
      water: { min: 67, max: 75 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: sorbet −12, locked_v0_1 (S02 reference)
    category: 'sorbet',
    temperature_c: -12,
    status: 'seeded',
    metrics: {
      pod: { min: 15, max: 25 },
      npac: { min: 42, max: 49 },
      ice_fraction: { min: 51, max: 59 },
      total_solids: { min: 25, max: 33 },
      water: { min: 67, max: 73 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: sorbet −13, locked_v0_1 (S03 reference)
    category: 'sorbet',
    temperature_c: -13,
    status: 'seeded',
    metrics: {
      pod: { min: 15, max: 25 },
      npac: { min: 48, max: 55 },
      ice_fraction: { min: 50, max: 58 },
      total_solids: { min: 25, max: 33 },
      water: { min: 67, max: 73 },
      alcohol: ALCOHOL_RANGE,
    },
  },

  // ── vegan_gelato (Temperature_Regulator_VEGAN.md) ─────────────────────────
  // Dairy gates are DISABLED by the locked doc ("never fails because lactose
  // or dairy protein is 0") → those metrics are omitted; fat stays (plant fat).
  {
    // regulator: vegan_gelato −11, locked_pinguino_internal_v0_1
    category: 'vegan_gelato',
    temperature_c: -11,
    status: 'seeded',
    metrics: {
      pod: { min: 13, max: 25 },
      npac: { min: 35, max: 52 },
      ice_fraction: { min: 45, max: 61 },
      fat: { min: 0, max: 12 },
      total_solids: { min: 30, max: 43 },
      water: { min: 54, max: 72 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: vegan_gelato −12, locked_pinguino_internal_v0_1
    category: 'vegan_gelato',
    temperature_c: -12,
    status: 'seeded',
    metrics: {
      pod: { min: 13, max: 25 },
      npac: { min: 44, max: 59 },
      ice_fraction: { min: 46, max: 60 },
      fat: { min: 0, max: 12 },
      total_solids: { min: 30, max: 43 },
      water: { min: 52, max: 70 },
      alcohol: ALCOHOL_RANGE,
    },
  },
  {
    // regulator: vegan_gelato −13, locked_pinguino_v0_1 (V02 anchor)
    category: 'vegan_gelato',
    temperature_c: -13,
    status: 'seeded',
    metrics: {
      pod: { min: 13, max: 25 },
      npac: { min: 50, max: 64 },
      ice_fraction: { min: 46, max: 58 },
      fat: { min: 0, max: 12 },
      total_solids: { min: 30, max: 43 },
      water: { min: 50, max: 67 },
      alcohol: ALCOHOL_RANGE,
    },
  },
];
