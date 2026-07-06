/**
 * PINGUINO Spine — Temperature Regulator CONFIG registry (Phase C Slice 4).
 *
 * Pure transcription of the four locked regulator documents:
 * Temperature_Regulator_{GELATO,SORBET,VEGAN,CHOCOLATE}.md (v0.1 FINAL).
 *
 * The Temperature Regulator is NOT a separate engine and NOT recipe math.
 * The shared Base Engine calculates recipe truth; these settings only store
 * target bands, clean centers, locked references and status interpretation
 * metadata per product × serving temperature. −11 °C Standard Gelato is the
 * zero-delta base reference. Every value below comes from the docs verbatim —
 * where a doc omits a value (e.g. G15/G11 formulas, S04's serving
 * temperature) it is left out or null with a note, never invented.
 *
 * Evaluation (status/severity/correction goals against engine results) is a
 * LATER slice — this module is config + lookup + golden fixtures only.
 */
import type { ProductProfile, ServingTemperatureC } from './types';

export type TemperatureRegulatorConfigVersion = '0.1.0';
export const TEMPERATURE_REGULATOR_CONFIG_VERSION: TemperatureRegulatorConfigVersion = '0.1.0';

/**
 * A metric target band. Field names mirror the locked docs exactly
 * (lockedReference vs fixedReference vs mediumEvidence etc.) so nothing is
 * renamed away from the source of truth.
 */
export interface MetricBand {
  band: readonly [number, number];
  cleanCenter?: readonly [number, number];
  lockedReference?: number;
  lowerCleanAnchor?: number;
  mediumEvidence?: number;
  fixedReference?: number;
  optimizedEvidence?: number;
  lowerEvidence?: number;
  hardMinimum?: number;
  visibleBenchmark?: readonly [number, number];
  overlapPrevious?: readonly [number, number];
  overlapNext?: readonly [number, number];
  notes?: readonly string[];
}

export interface TemperatureRegulatorSettings {
  productProfile: ProductProfile;
  servingTemperatureC: ServingTemperatureC;
  /** Exact status string from the locked doc. */
  status: string;
  configVersion: TemperatureRegulatorConfigVersion;

  pod?: MetricBand;
  npac?: MetricBand;
  iceFraction?: MetricBand;
  water?: MetricBand;
  solids?: MetricBand;
  fat?: MetricBand;
  lactose?: MetricBand;
  lactoseSanding?: MetricBand;
  aeratingProtein?: MetricBand;
  proteinShareInSolids?: MetricBand;
  stabilizer: { required: true };

  disabledGates: readonly string[];
  advisoryGates: readonly string[];
  notes: readonly string[];
}

/* ========================================================================== *
 * Standard Gelato (Temperature_Regulator_GELATO.md)                          *
 * ========================================================================== */

const standardGelatoMinus11: TemperatureRegulatorSettings = {
  productProfile: 'standard_gelato',
  servingTemperatureC: -11,
  status: 'locked_base_reference_zero_delta',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  npac: { band: [33, 43], cleanCenter: [39, 41], overlapNext: [42, 43] },
  iceFraction: { band: [45, 54.5] },
  pod: { band: [12, 17] },
  lactose: { band: [4, 6] },
  lactoseSanding: { band: [5, 9] },
  fat: { band: [5, 12] },
  aeratingProtein: { band: [3, 6] },
  proteinShareInSolids: { band: [9, 13] },
  solids: { band: [31, 45] },
  water: { band: [57, 70] },
  stabilizer: { required: true },
  disabledGates: [],
  advisoryGates: [],
  notes: [
    '−11 °C = base reference / zero delta — the current Base Engine is already calibrated for −11 °C',
    'NPAC alone is not enough: lactose, sanding, ice fraction, protein, solids, water and stabilizer still gate',
  ],
};

const standardGelatoMinus12: TemperatureRegulatorSettings = {
  productProfile: 'standard_gelato',
  servingTemperatureC: -12,
  status: 'locked_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  npac: {
    band: [42, 50],
    cleanCenter: [45.0, 46.2],
    lockedReference: 46.18,
    lowerCleanAnchor: 44.98,
    overlapPrevious: [42, 43],
    overlapNext: [48, 50],
  },
  iceFraction: { band: [46, 54], lockedReference: 50.34 },
  pod: { band: [12, 17], lockedReference: 15.57 },
  lactose: { band: [4, 6], lockedReference: 5.44 },
  lactoseSanding: { band: [5, 9], lockedReference: 8.62 },
  fat: { band: [5, 12], lockedReference: 6.19 },
  aeratingProtein: { band: [3, 6], lockedReference: 3.65 },
  proteinShareInSolids: { band: [9, 13], lockedReference: 9.9 },
  solids: { band: [31, 44], lockedReference: 36.82 },
  water: { band: [56, 70], lockedReference: 63.18 },
  stabilizer: { required: true },
  disabledGates: [],
  advisoryGates: [],
  notes: ['main locked reference: G17', 'lower clean anchor: G15'],
};

const standardGelatoMinus13: TemperatureRegulatorSettings = {
  productProfile: 'standard_gelato',
  servingTemperatureC: -13,
  status: 'locked_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  npac: {
    band: [48, 55],
    cleanCenter: [51.5, 53.2],
    lockedReference: 53.15,
    lowerCleanAnchor: 51.77,
    overlapPrevious: [48, 50],
  },
  iceFraction: { band: [46, 52], lockedReference: 49.69 },
  pod: { band: [12, 17], lockedReference: 16.37 },
  lactose: { band: [4, 6], lockedReference: 5.51 },
  lactoseSanding: { band: [5, 9], lockedReference: 8.78 },
  fat: { band: [5, 12], lockedReference: 5.89 },
  aeratingProtein: { band: [3, 6], lockedReference: 3.69 },
  proteinShareInSolids: { band: [9, 13], lockedReference: 9.93 },
  solids: { band: [35, 45], lockedReference: 37.22 },
  water: { band: [55, 65], lockedReference: 62.78 },
  stabilizer: { required: true },
  disabledGates: [],
  advisoryGates: [],
  notes: ['main locked reference: G18', 'lower clean anchor: G11'],
};

/* ========================================================================== *
 * Sorbet (Temperature_Regulator_SORBET.md)                                   *
 * ========================================================================== */

const SORBET_DISABLED_GATES = [
  'dairy_fat_logic',
  'lactose',
  'lactose_sanding',
  'aerating_dairy_protein',
  'dairy_protein_share_in_solids',
  'msnf_required_gate',
] as const;

const sorbetMinus11: TemperatureRegulatorSettings = {
  productProfile: 'sorbet',
  servingTemperatureC: -11,
  status: 'locked_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [15, 25], lockedReference: 19.16 },
  npac: { band: [35, 40], cleanCenter: [37, 38], lockedReference: 37.71, overlapNext: [39, 40] },
  iceFraction: { band: [51, 59], lockedReference: 57.43 },
  solids: { band: [25, 33], lockedReference: 27.85 },
  water: { band: [67, 75], lockedReference: 72.15 },
  stabilizer: { required: true },
  disabledGates: SORBET_DISABLED_GATES,
  advisoryGates: [],
  notes: ['main locked reference: S01', 'never evaluated with Standard Gelato dairy gates'],
};

const sorbetMinus12: TemperatureRegulatorSettings = {
  productProfile: 'sorbet',
  servingTemperatureC: -12,
  status: 'locked_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [15, 25], lockedReference: 19.97 },
  npac: {
    band: [42, 49],
    cleanCenter: [44, 45],
    lockedReference: 44.18,
    overlapPrevious: [39, 40],
    overlapNext: [48, 49],
  },
  iceFraction: { band: [51, 59], lockedReference: 55.95 },
  solids: { band: [25, 33], lockedReference: 29.29 },
  water: { band: [67, 73], lockedReference: 70.71 },
  stabilizer: { required: true },
  disabledGates: SORBET_DISABLED_GATES,
  advisoryGates: [],
  notes: ['main locked reference: S02'],
};

const sorbetMinus13: TemperatureRegulatorSettings = {
  productProfile: 'sorbet',
  servingTemperatureC: -13,
  status: 'locked_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [15, 25], lockedReference: 21.21 },
  npac: { band: [48, 55], cleanCenter: [51, 52.5], lockedReference: 52.22, overlapPrevious: [48, 49] },
  iceFraction: { band: [50, 58], lockedReference: 54.28 },
  solids: { band: [25, 33], lockedReference: 30.82 },
  water: { band: [67, 73], lockedReference: 69.18 },
  stabilizer: { required: true },
  disabledGates: SORBET_DISABLED_GATES,
  advisoryGates: [],
  notes: ['main locked reference: S03'],
};

/* ========================================================================== *
 * Vegan Gelato (Temperature_Regulator_VEGAN.md)                              *
 * ========================================================================== */

const VEGAN_DISABLED_GATES = [
  'lactose',
  'lactose_sanding',
  'aerating_dairy_protein',
  'dairy_protein_share_in_solids',
  'msnf_required_gate',
] as const;

const veganGelatoMinus11: TemperatureRegulatorSettings = {
  productProfile: 'vegan_gelato',
  servingTemperatureC: -11,
  status: 'locked_pinguino_internal_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [13, 25] },
  npac: { band: [35, 52], cleanCenter: [40, 47], overlapNext: [47, 52] },
  iceFraction: { band: [45, 61] },
  fat: { band: [0, 12] },
  solids: { band: [30, 43] },
  water: { band: [54, 72] },
  stabilizer: { required: true },
  disabledGates: VEGAN_DISABLED_GATES,
  advisoryGates: [],
  notes: [
    'derived from PINGUINO temperature logic — locked internal v0.1, not externally confirmed',
    'never fails because lactose or dairy protein is 0',
  ],
};

const veganGelatoMinus12: TemperatureRegulatorSettings = {
  productProfile: 'vegan_gelato',
  servingTemperatureC: -12,
  status: 'locked_pinguino_internal_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [13, 25] },
  npac: { band: [44, 59], cleanCenter: [48, 54], overlapPrevious: [44, 52], overlapNext: [54, 59] },
  iceFraction: { band: [46, 60] },
  fat: { band: [0, 12] },
  solids: { band: [30, 43] },
  water: { band: [52, 70] },
  stabilizer: { required: true },
  disabledGates: VEGAN_DISABLED_GATES,
  advisoryGates: [],
  notes: ['derived from PINGUINO temperature logic — locked internal v0.1, not externally confirmed'],
};

const veganGelatoMinus13: TemperatureRegulatorSettings = {
  productProfile: 'vegan_gelato',
  servingTemperatureC: -13,
  status: 'locked_pinguino_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [13, 25], lockedReference: 22.08, mediumEvidence: 20.58 },
  npac: { band: [50, 64], cleanCenter: [53.5, 60.0], lockedReference: 59.47, mediumEvidence: 53.75 },
  iceFraction: { band: [46, 58], lockedReference: 51.06, mediumEvidence: 51.35 },
  fat: { band: [0, 12], lockedReference: 5.08, mediumEvidence: 4.21 },
  solids: { band: [30, 43], lockedReference: 36.24, mediumEvidence: 36.17 },
  water: { band: [50, 67], lockedReference: 63.76, mediumEvidence: 63.83 },
  stabilizer: { required: true },
  disabledGates: VEGAN_DISABLED_GATES,
  advisoryGates: [],
  notes: [
    'observed calibration anchor — external calibration data directly exposed Vegan −13 °C',
    'main clean reference: V02 fixed; medium evidence: V02-AUTO',
  ],
};

/* ========================================================================== *
 * Chocolate Gelato (Temperature_Regulator_CHOCOLATE.md)                      *
 * ========================================================================== */

const CHOCOLATE_PROTEIN_SHARE: MetricBand = {
  band: [8, 13], // advisory band — cocoa solids dilute dairy protein share
  visibleBenchmark: [9, 13],
  hardMinimum: 7,
  notes: ['soft/advisory gate — never a standard-gelato hard fail when chocolate structure is good'],
};

const chocolateGelatoMinus11: TemperatureRegulatorSettings = {
  productProfile: 'chocolate_gelato',
  servingTemperatureC: -11,
  status: 'locked_pinguino_internal_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [12, 20] },
  npac: { band: [34, 45], cleanCenter: [40, 42], overlapNext: [43, 45] },
  iceFraction: { band: [45, 54.5] },
  lactose: { band: [4, 6] },
  lactoseSanding: { band: [5, 9] },
  fat: { band: [5, 12] },
  aeratingProtein: { band: [3, 6] },
  proteinShareInSolids: CHOCOLATE_PROTEIN_SHARE,
  solids: { band: [31, 45] },
  water: { band: [57, 70] },
  stabilizer: { required: true },
  disabledGates: [],
  advisoryGates: ['protein_share_in_solids'],
  notes: [
    'derived from Standard Gelato temperature logic with chocolate-specific overrides',
    'chocolate/cocoa solids dilute protein share — do not overcorrect with skimmed milk powder if lactose sanding worsens',
  ],
};

const chocolateGelatoMinus12: TemperatureRegulatorSettings = {
  productProfile: 'chocolate_gelato',
  servingTemperatureC: -12,
  status: 'locked_pinguino_internal_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [12, 20] },
  npac: { band: [43, 52], cleanCenter: [47, 49.5], overlapPrevious: [43, 45], overlapNext: [49, 52] },
  iceFraction: { band: [46, 54] },
  lactose: { band: [4, 6] },
  lactoseSanding: { band: [5, 9] },
  fat: { band: [5, 12] },
  aeratingProtein: { band: [3, 6] },
  proteinShareInSolids: CHOCOLATE_PROTEIN_SHARE,
  solids: { band: [31, 45] },
  water: { band: [56, 70] },
  stabilizer: { required: true },
  disabledGates: [],
  advisoryGates: ['protein_share_in_solids'],
  notes: [
    'derived from Standard Gelato temperature logic with chocolate-specific overrides',
    'higher/wider than typical Standard Gelato — cocoa bitterness and cocoa solids change product tolerance',
  ],
};

const chocolateGelatoMinus13: TemperatureRegulatorSettings = {
  productProfile: 'chocolate_gelato',
  servingTemperatureC: -13,
  status: 'locked_pinguino_v0_1',
  configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
  pod: { band: [12, 20], fixedReference: 18.43, optimizedEvidence: 15.8 },
  npac: {
    band: [49, 57],
    cleanCenter: [49.8, 54.1],
    fixedReference: 54.08,
    lowerEvidence: 49.8,
    overlapPrevious: [49, 52],
  },
  iceFraction: { band: [46, 52], fixedReference: 43.97, optimizedEvidence: 46.11 },
  lactose: { band: [4, 6], fixedReference: 4.61, optimizedEvidence: 5.37 },
  lactoseSanding: { band: [5, 9], fixedReference: 8.41, optimizedEvidence: 9.37 },
  fat: { band: [5, 12], fixedReference: 10.37, optimizedEvidence: 8.95 },
  aeratingProtein: { band: [3, 6], fixedReference: 3.09, optimizedEvidence: 3.59 },
  proteinShareInSolids: {
    ...CHOCOLATE_PROTEIN_SHARE,
    fixedReference: 6.84,
    optimizedEvidence: 8.42,
  },
  solids: { band: [35, 45], fixedReference: 45.12, optimizedEvidence: 42.62 },
  water: { band: [55, 65], fixedReference: 54.88, optimizedEvidence: 57.38 },
  stabilizer: { required: true },
  disabledGates: [],
  advisoryGates: ['protein_share_in_solids'],
  notes: [
    'main observed chocolate setting — C01 fixed is stress/reference evidence, C01 optimized is optimizer behavior evidence',
    'chocolate tolerates POD up to 20 — cocoa bitterness reduces perceived sweetness',
  ],
};

/* ========================================================================== *
 * Registry + lookup                                                          *
 * ========================================================================== */

const REGISTRY: Readonly<
  Record<ProductProfile, Readonly<Record<ServingTemperatureC, TemperatureRegulatorSettings>>>
> = {
  standard_gelato: { [-11]: standardGelatoMinus11, [-12]: standardGelatoMinus12, [-13]: standardGelatoMinus13 },
  sorbet: { [-11]: sorbetMinus11, [-12]: sorbetMinus12, [-13]: sorbetMinus13 },
  vegan_gelato: { [-11]: veganGelatoMinus11, [-12]: veganGelatoMinus12, [-13]: veganGelatoMinus13 },
  chocolate_gelato: { [-11]: chocolateGelatoMinus11, [-12]: chocolateGelatoMinus12, [-13]: chocolateGelatoMinus13 },
};

export const getTemperatureRegulatorSettings = (
  productProfile: ProductProfile,
  servingTemperatureC: ServingTemperatureC,
): TemperatureRegulatorSettings => REGISTRY[productProfile][servingTemperatureC];

const isActiveProfile = (value: string): value is ProductProfile =>
  value === 'standard_gelato' || value === 'sorbet' || value === 'vegan_gelato' || value === 'chocolate_gelato';

const isSupportedTemperature = (value: number): value is ServingTemperatureC =>
  value === -11 || value === -12 || value === -13;

/**
 * Untrusted lookup: unsupported product or temperature returns null —
 * NEVER a fallback to another product or another temperature.
 */
export const getTemperatureRegulatorSettingsOrNull = (
  productProfile: string,
  servingTemperatureC: number,
): TemperatureRegulatorSettings | null =>
  isActiveProfile(productProfile) && isSupportedTemperature(servingTemperatureC)
    ? REGISTRY[productProfile][servingTemperatureC]
    : null;

export const listTemperatureRegulatorSettings = (): readonly TemperatureRegulatorSettings[] =>
  Object.values(REGISTRY).flatMap((byTemperature) => Object.values(byTemperature));

/** Pure band check helper (inclusive) — for tests and later evaluation slices. */
export const isMetricInBand = (value: number, band: readonly [number, number]): boolean =>
  Number.isFinite(value) && value >= band[0] && value <= band[1];

/* ========================================================================== *
 * Golden reference fixtures (verbatim from the regulator docs)               *
 * ========================================================================== */

export interface TemperatureRegulatorGoldenFixture {
  id: string;
  productProfile: ProductProfile;
  /** null only where the locked doc assigns no serving temperature (S04). */
  servingTemperatureC: ServingTemperatureC | null;
  purpose:
    | 'clean_anchor'
    | 'lower_anchor'
    | 'medium_evidence'
    | 'optimized_evidence'
    | 'stress_reference'
    | 'negative_fixture'
    | 'fruit_specific_validation';

  /** Empty only where the locked doc documents metrics without a formula (G15, G11). */
  formulaG: readonly { ingredient: string; grams: number }[];

  expected: {
    pod?: number;
    npac?: number;
    iceFraction?: number;
    lactose?: number;
    lactoseSanding?: number;
    fat?: number;
    aeratingProtein?: number;
    proteinShareInSolids?: number;
    solids?: number;
    water?: number;
    costPerKg?: number;
    costPer80g?: number;
  };

  notes: readonly string[];
}

export const TEMPERATURE_REGULATOR_GOLDEN_FIXTURES: readonly TemperatureRegulatorGoldenFixture[] = [
  {
    id: 'G12',
    productProfile: 'standard_gelato',
    servingTemperatureC: -11,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'milk 3.5%', grams: 610 },
      { ingredient: 'cream 30%', grams: 135 },
      { ingredient: 'skimmed milk powder', grams: 45 },
      { ingredient: 'sucrose', grams: 115 },
      { ingredient: 'dextrose', grams: 40 },
      { ingredient: 'inulin', grams: 53.1 },
      { ingredient: 'tara gum', grams: 1.9 },
    ],
    expected: {
      pod: 15.65,
      npac: 39.59,
      iceFraction: 51.09,
      lactose: 5.59,
      lactoseSanding: 8.77,
      fat: 6.22,
      aeratingProtein: 3.75,
      proteinShareInSolids: 10.34,
      solids: 36.23,
      water: 63.77,
      costPerKg: 6.8,
      costPer80g: 0.54,
    },
    notes: ['clean −11 °C validation anchor — confirms the current base behavior stays stable', 'too hard for −12 °C, far too hard for −13 °C'],
  },
  {
    id: 'G17',
    productProfile: 'standard_gelato',
    servingTemperatureC: -12,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'milk 3.5%', grams: 600 },
      { ingredient: 'cream 30%', grams: 135 },
      { ingredient: 'skimmed milk powder', grams: 43 },
      { ingredient: 'sucrose', grams: 86 },
      { ingredient: 'dextrose', grams: 80 },
      { ingredient: 'inulin', grams: 54.1 },
      { ingredient: 'tara gum', grams: 1.9 },
    ],
    expected: {
      pod: 15.57,
      npac: 46.18,
      iceFraction: 50.34,
      lactose: 5.44,
      lactoseSanding: 8.62,
      fat: 6.19,
      aeratingProtein: 3.65,
      proteinShareInSolids: 9.9,
      solids: 36.82,
      water: 63.18,
      costPerKg: 6.86,
      costPer80g: 0.55,
    },
    notes: ['final clean reference for Standard Gelato −12 °C', 'too soft for −11 °C, too hard for −13 °C'],
  },
  {
    id: 'G15',
    productProfile: 'standard_gelato',
    servingTemperatureC: -12,
    purpose: 'lower_anchor',
    formulaG: [],
    expected: {
      npac: 44.98,
      iceFraction: 50.35,
      pod: 15.62,
      lactose: 5.44,
      lactoseSanding: 8.63,
      fat: 6.19,
      aeratingProtein: 3.65,
      proteinShareInSolids: 9.89,
      solids: 36.88,
      water: 63.12,
    },
    notes: ['lower / firmer clean −12 °C anchor', 'the locked doc documents metrics only — no formula, no cost'],
  },
  {
    id: 'G18',
    productProfile: 'standard_gelato',
    servingTemperatureC: -13,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'milk 3.5%', grams: 600 },
      { ingredient: 'cream 30%', grams: 125 },
      { ingredient: 'skimmed milk powder', grams: 45 },
      { ingredient: 'sucrose', grams: 72 },
      { ingredient: 'dextrose', grams: 112 },
      { ingredient: 'inulin', grams: 44.1 },
      { ingredient: 'tara gum', grams: 1.9 },
    ],
    expected: {
      pod: 16.37,
      npac: 53.15,
      iceFraction: 49.69,
      lactose: 5.51,
      lactoseSanding: 8.78,
      fat: 5.89,
      aeratingProtein: 3.69,
      proteinShareInSolids: 9.93,
      solids: 37.22,
      water: 62.78,
      costPerKg: 5.81,
      costPer80g: 0.46,
    },
    notes: ['final clean reference for Standard Gelato −13 °C', 'too soft for −12 °C, far too soft for −11 °C'],
  },
  {
    id: 'G11',
    productProfile: 'standard_gelato',
    servingTemperatureC: -13,
    purpose: 'lower_anchor',
    formulaG: [],
    expected: {
      pod: 16.21,
      npac: 51.77,
      iceFraction: 49.73,
      lactose: 5.51,
      lactoseSanding: 8.79,
      fat: 5.89,
      aeratingProtein: 3.69,
      proteinShareInSolids: 9.91,
      solids: 37.26,
      water: 62.74,
      costPerKg: 6.21,
      costPer80g: 0.5,
    },
    notes: ['lower / firmer clean −13 °C anchor', 'the locked doc documents metrics only — no formula'],
  },
  {
    id: 'S01',
    productProfile: 'sorbet',
    servingTemperatureC: -11,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'sucrose', grams: 103.8 },
      { ingredient: 'dextrose', grams: 59 },
      { ingredient: 'inulin', grams: 55.4 },
      { ingredient: 'tara gum', grams: 0.8 },
      { ingredient: 'water', grams: 181 },
      { ingredient: 'strawberries', grams: 600 },
    ],
    expected: { pod: 19.16, npac: 37.71, iceFraction: 57.43, solids: 27.85, water: 72.15, costPerKg: 8.19, costPer80g: 0.66 },
    notes: ['final clean reference for Sorbet −11 °C'],
  },
  {
    id: 'S02',
    productProfile: 'sorbet',
    servingTemperatureC: -12,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'sucrose', grams: 90 },
      { ingredient: 'dextrose', grams: 90 },
      { ingredient: 'inulin', grams: 55 },
      { ingredient: 'tara gum', grams: 0.8 },
      { ingredient: 'water', grams: 164.2 },
      { ingredient: 'strawberries', grams: 600 },
    ],
    expected: { pod: 19.97, npac: 44.18, iceFraction: 55.95, solids: 29.29, water: 70.71, costPerKg: 8.14, costPer80g: 0.65 },
    notes: ['final clean reference for Sorbet −12 °C'],
  },
  {
    id: 'S03',
    productProfile: 'sorbet',
    servingTemperatureC: -13,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'sucrose', grams: 78 },
      { ingredient: 'dextrose', grams: 125 },
      { ingredient: 'inulin', grams: 50 },
      { ingredient: 'tara gum', grams: 0.8 },
      { ingredient: 'water', grams: 146.2 },
      { ingredient: 'strawberries', grams: 600 },
    ],
    expected: { pod: 21.21, npac: 52.22, iceFraction: 54.28, solids: 30.82, water: 69.18, costPerKg: 7.63, costPer80g: 0.61 },
    notes: ['final clean reference for Sorbet −13 °C'],
  },
  {
    id: 'S04',
    productProfile: 'sorbet',
    servingTemperatureC: null,
    purpose: 'fruit_specific_validation',
    formulaG: [
      { ingredient: 'sucrose', grams: 90 },
      { ingredient: 'dextrose', grams: 90 },
      { ingredient: 'inulin', grams: 55 },
      { ingredient: 'tara gum', grams: 0.8 },
      { ingredient: 'water', grams: 264.2 },
      { ingredient: '100% mango pulp', grams: 500 },
    ],
    expected: { pod: 23.75, npac: 52.55, iceFraction: 51.37, solids: 34.51, water: 65.49, costPerKg: 6.3, costPer80g: 0.5 },
    notes: [
      'mango validation — NOT a clean locked mango reference (total solids too high, water too low)',
      'evidence that Sorbet needs fruit-specific Designer/Optimizer logic; strawberry ratios must not be forced onto mango',
      'the locked doc assigns no serving temperature to this validation run',
    ],
  },
  {
    id: 'V02_fixed',
    productProfile: 'vegan_gelato',
    servingTemperatureC: -13,
    purpose: 'clean_anchor',
    formulaG: [
      { ingredient: 'water', grams: 200 },
      { ingredient: 'oat drink', grams: 250 },
      { ingredient: 'coconut milk', grams: 250 },
      { ingredient: 'sucrose', grams: 95 },
      { ingredient: 'dextrose', grams: 150 },
      { ingredient: 'inulin', grams: 53.1 },
      { ingredient: 'tara gum', grams: 1.9 },
    ],
    expected: { pod: 22.08, npac: 59.47, iceFraction: 51.06, fat: 5.08, solids: 36.24, water: 63.76, costPerKg: 5.46, costPer80g: 0.44 },
    notes: ['clean Vegan −13 °C reference — upper / soft-side clean anchor', 'no dairy-only gate may fail this recipe'],
  },
  {
    id: 'V02_AUTO',
    productProfile: 'vegan_gelato',
    servingTemperatureC: -13,
    purpose: 'medium_evidence',
    formulaG: [
      { ingredient: 'water', grams: 233.2 },
      { ingredient: 'oat drink', grams: 253.8 },
      { ingredient: 'coconut milk', grams: 204.4 },
      { ingredient: 'sucrose', grams: 92.6 },
      { ingredient: 'dextrose', grams: 129.8 },
      { ingredient: 'inulin', grams: 84.4 },
      { ingredient: 'tara gum', grams: 1.94 },
    ],
    expected: { pod: 20.58, npac: 53.75, iceFraction: 51.35, fat: 4.21, solids: 36.17, water: 63.83, costPerKg: 8.59, costPer80g: 0.69 },
    notes: ['medium-side evidence for Vegan −13 °C — not the final locked formula (cost high due to high inulin)', 'useful for Vegan Optimizer behavior later'],
  },
  {
    id: 'V01_rejected',
    productProfile: 'vegan_gelato',
    servingTemperatureC: -13,
    purpose: 'negative_fixture',
    formulaG: [
      { ingredient: 'water', grams: 340 },
      { ingredient: 'oat drink', grams: 250 },
      { ingredient: 'coconut milk', grams: 200 },
      { ingredient: 'sucrose', grams: 90 },
      { ingredient: 'dextrose', grams: 75 },
      { ingredient: 'inulin', grams: 43.1 },
      { ingredient: 'tara gum', grams: 1.9 },
    ],
    expected: { pod: 16.08, npac: 32.91, iceFraction: 59.79, fat: 4.13, solids: 26.74, water: 73.26, costPerKg: 4.46, costPer80g: 0.36 },
    notes: ['REJECTED evidence — too hard / too low NPAC for Vegan −13 °C, too much water, too low solids', 'useful as a failure example for the Vegan Optimizer — never a clean target'],
  },
  {
    id: 'C01_fixed',
    productProfile: 'chocolate_gelato',
    servingTemperatureC: -13,
    purpose: 'stress_reference',
    formulaG: [
      { ingredient: 'milk 3.5%', grams: 520 },
      { ingredient: 'cream 30%', grams: 120 },
      { ingredient: 'skimmed milk powder', grams: 35 },
      { ingredient: 'sucrose', grams: 95 },
      { ingredient: 'dextrose', grams: 65 },
      { ingredient: 'inulin', grams: 43.1 },
      { ingredient: 'dark chocolate 70.5%', grams: 120 },
      { ingredient: 'tara gum', grams: 1.9 },
    ],
    expected: {
      pod: 18.43,
      npac: 54.08,
      iceFraction: 43.97,
      lactose: 4.61,
      lactoseSanding: 8.41,
      fat: 10.37,
      aeratingProtein: 3.09,
      proteinShareInSolids: 6.84,
      solids: 45.12,
      water: 54.88,
      costPerKg: 5.59,
      costPer80g: 0.45,
    },
    notes: [
      'chocolate stress/reference test — ice fraction too low, solids very high; NOT the best final optimized production anchor',
      'protein share low because chocolate/cocoa solids dilute dairy protein share',
    ],
  },
  {
    id: 'C01_optimized',
    productProfile: 'chocolate_gelato',
    servingTemperatureC: -13,
    purpose: 'optimized_evidence',
    formulaG: [
      { ingredient: 'milk 3.5%', grams: 597.9 },
      { ingredient: 'cream 30%', grams: 48.5 },
      { ingredient: 'skimmed milk powder', grams: 47.2 },
      { ingredient: 'sucrose', grams: 59.4 },
      { ingredient: 'dextrose', grams: 72.5 },
      { ingredient: 'inulin', grams: 41.8 },
      { ingredient: 'dark chocolate 70.5%', grams: 130.8 },
      { ingredient: 'tara gum', grams: 1.74 },
    ],
    expected: {
      pod: 15.8,
      npac: 49.8,
      iceFraction: 46.11,
      lactose: 5.37,
      lactoseSanding: 9.37,
      fat: 8.95,
      aeratingProtein: 3.59,
      proteinShareInSolids: 8.42,
      solids: 42.62,
      water: 57.38,
      costPerKg: 5.25,
      costPer80g: 0.42,
    },
    notes: [
      'optimizer behavior evidence — cleaner structure, lactose sanding slightly above 9, protein share still advisory-low',
      'treat as evidence, not a final locked formula',
    ],
  },
];

export const findTemperatureRegulatorFixture = (
  id: string,
): TemperatureRegulatorGoldenFixture | null =>
  TEMPERATURE_REGULATOR_GOLDEN_FIXTURES.find((fixture) => fixture.id === id) ?? null;
