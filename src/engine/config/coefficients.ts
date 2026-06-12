/**
 * Coefficient tables (spec §7–§8). ALL coefficients live here — never inline in
 * calculation code. Any change bumps CONFIG_VERSION (spec §17) and must keep all
 * golden + active MyGelato calibration fixtures passing together (spec §16).
 */
import type {
  CoefficientConfig,
  NpacCoefficients,
  NpacNormalization,
  PolyolCoefficients,
  PolyolName,
  SugarCoefficients,
  SyrupDeAnchor,
} from '../types';

/** POD — relative sweetening power, sucrose = 1.00 (spec §7).
 * Defaults sit inside the spec's configurable ranges:
 * dextrose/glucose 0.70–0.75 · fructose 1.70–1.75 · lactose 0.15–0.20. */
export const POD_COEFFICIENTS: SugarCoefficients = {
  sucrose: 1.0,
  dextrose: 0.74,
  glucose: 0.74,
  fructose: 1.73,
  lactose: 0.16,
  invert: 1.25,
};

/** PAC — anti-freezing power of the sugar spectrum, sucrose = 1.00 (spec §8).
 * Dextrose/glucose and fructose must exceed sucrose (required). */
export const PAC_COEFFICIENTS: SugarCoefficients = {
  sucrose: 1.0,
  dextrose: 1.9,
  glucose: 1.9,
  fructose: 1.9,
  lactose: 1.0,
  invert: 1.9,
};

/** NPAC — net total freezing depression incl. alcohol and salt (spec §8 working
 * definition, calibration-pending). Alcohol must strongly increase freezing
 * depression. Salt default is flagged calibration-sensitive: sources disagree. */
export const NPAC_COEFFICIENTS: NpacCoefficients = {
  sucrose: 1.0,
  dextrose: 1.9,
  glucose: 1.9,
  fructose: 1.9,
  lactose: 1.0,
  invert: 1.9,
  alcohol: 7.4,
  salt: 11.7,
};

/** Spec §8 calibration assumptions box: `per_total_mass` is and remains the
 * canonical default until MyGelato fixtures are entered and verified;
 * `per_water_mass` is documented strictly as a candidate calibration mode. */
export const NPAC_NORMALIZATION: NpacNormalization = 'per_total_mass';

/**
 * DE → (pod, pac) anchors for glucose syrups known only by DE value (spec §8).
 * Data only — interpolation logic arrives with pac.ts (4C).
 * CALIBRATION-PENDING estimates: the 39 DE anchor in particular will be
 * validated/corrected by the `dry-glucose-syrup-39de` MyGelato fixture.
 * Stored ingredient pod/pac/npac values always win over these anchors.
 */
export const SYRUP_DE_ANCHORS: readonly SyrupDeAnchor[] = [
  { de: 20, pod: 0.1, pac: 0.45 },
  { de: 39, pod: 0.23, pac: 0.62 },
  { de: 60, pod: 0.5, pac: 0.85 },
  { de: 100, pod: 0.74, pac: 1.9 },
];

/** Per-polyol defaults (spec §7–§8: polyols are ingredient-specific).
 * CALIBRATION-PENDING estimates; stored ingredient values always win. */
export const POLYOL_COEFFICIENTS: Record<PolyolName, PolyolCoefficients> = {
  erythritol: { pod: 0.65, pac: 2.8 },
  sorbitol: { pod: 0.6, pac: 1.9 },
  maltitol: { pod: 0.9, pac: 1.0 },
  xylitol: { pod: 1.0, pac: 2.25 },
  glycerol: { pod: 0.6, pac: 3.7 },
};

/** Assembled coefficient config consumed via EngineConfig. */
export const COEFFICIENTS: CoefficientConfig = {
  pod: POD_COEFFICIENTS,
  pac: PAC_COEFFICIENTS,
  npac: NPAC_COEFFICIENTS,
  npac_normalization: NPAC_NORMALIZATION,
  syrup_de_anchors: SYRUP_DE_ANCHORS,
  polyols: POLYOL_COEFFICIENTS,
};
