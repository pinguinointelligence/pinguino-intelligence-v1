/**
 * Research-only Sorbet ice calibration harness.
 *
 * This module is deliberately not exported from the Engine and is not used by
 * calculateRecipe.  It makes candidate-model units explicit while the
 * composition-sensitive multi-solute authority is still being established.
 * In particular, an ideal-solution result must never be promoted to runtime
 * Sorbet truth merely because it is finite.
 */

export type CalibratedSugar = 'sucrose' | 'glucose' | 'dextrose' | 'fructose';

export interface OtherColligativeSolute {
  id: string;
  grams: number;
  molecularWeightGramsPerMol: number;
  /** Defaults to 1. Use only when the molecular form is known. */
  vanT_HoffFactor?: number;
}

export interface SorbetCalibrationMixture {
  waterGrams: number;
  sucroseGrams?: number;
  glucoseGrams?: number;
  dextroseGrams?: number;
  fructoseGrams?: number;
  /** Counted as solids, but not assigned an invented colligative coefficient. */
  inulinGrams?: number;
  /** Counted as solids, but not assigned an invented colligative coefficient. */
  otherNonColligativeSolidsGrams?: number;
  otherColligativeSolutes?: readonly OtherColligativeSolute[];
  temperatureCelsius: number;
}

export type SorbetCalibrationModel =
  | 'ideal_colligative_baseline'
  | 'pongsawatmanit_binary_phase_diagram';

export interface EquilibriumSerumComposition {
  liquidWaterGrams: number;
  dissolvedSolidsGrams: number;
  totalSerumGrams: number;
  waterMassFraction: number;
  solidsMassFraction: number;
}

export interface SorbetIceCalibrationResult {
  model: SorbetCalibrationModel;
  authority: 'research_baseline_only' | 'published_binary_only';
  initialWaterGrams: number;
  totalSolidsGrams: number;
  totalMixtureGrams: number;
  freezableWaterGrams: null;
  boundWaterGrams: null;
  initialFreezingPointCelsius: number | null;
  equilibriumSerum: EquilibriumSerumComposition | null;
  iceMassGrams: number | null;
  iceMassFractionOfMix: number | null;
  frozenFractionOfInitialWater: number | null;
  frozenFractionOfFreezableWater: null;
  massConservationResidualGrams: number | null;
  convergence: {
    converged: boolean;
    iterations: number;
    reason:
      | 'equilibrium_solved'
      | 'above_initial_freezing_point'
      | 'pure_water_limit'
      | 'unsupported_model_domain';
  };
  uncertainty: readonly string[];
}

/** CODATA-compatible values used by the cited thermodynamic equations. */
const GAS_CONSTANT_J_PER_MOL_K = 8.314;
const PURE_WATER_FREEZING_K = 273.15;
/** Pongsawatmanit & Miyawaki (1993), Eq. 1: ΔHf = 6003 J/mol near Tf. */
const WATER_FUSION_ENTHALPY_J_PER_MOL = 6003;
const WATER_MOLECULAR_WEIGHT_G_PER_MOL = 18.01528;

/** Standard molar masses; recipe input must already express actual dry sugar mass. */
const SUGAR_MOLECULAR_WEIGHT_G_PER_MOL: Readonly<Record<CalibratedSugar, number>> = {
  sucrose: 342.2965,
  glucose: 180.156,
  dextrose: 180.156,
  fructose: 180.156,
};

/**
 * Pongsawatmanit & Miyawaki (1993), Eq. 5 and text beneath Eq. 7.
 * Units: kelvin. Fitted to the authors' binary phase diagrams (roughly
 * 0–70 % w/w, 0 to about −30 °C for glucose; 0–70 % w/w, 0 to about −20 °C
 * for sucrose). The paper publishes no fructose or multi-solute coefficient.
 */
const PONGSAWATMANIT_ALPHA_K: Readonly<Partial<Record<CalibratedSugar, number>>> = {
  glucose: 836,
  dextrose: 836,
  sucrose: 1800,
};

const ROOT_TOLERANCE_GRAMS = 1e-9;
const TEMPERATURE_TOLERANCE_K = 1e-10;
const MAX_ROOT_ITERATIONS = 200;

const finiteNonNegative = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative mass`);
  }
};

const sugarMasses = (input: SorbetCalibrationMixture): Record<CalibratedSugar, number> => ({
  sucrose: input.sucroseGrams ?? 0,
  glucose: input.glucoseGrams ?? 0,
  dextrose: input.dextroseGrams ?? 0,
  fructose: input.fructoseGrams ?? 0,
});

const validateInput = (input: SorbetCalibrationMixture): void => {
  finiteNonNegative(input.waterGrams, 'waterGrams');
  for (const [name, grams] of Object.entries(sugarMasses(input))) {
    finiteNonNegative(grams, `${name}Grams`);
  }
  finiteNonNegative(input.inulinGrams ?? 0, 'inulinGrams');
  finiteNonNegative(input.otherNonColligativeSolidsGrams ?? 0, 'otherNonColligativeSolidsGrams');
  if (!Number.isFinite(input.temperatureCelsius) || input.temperatureCelsius <= -273.15) {
    throw new RangeError('temperatureCelsius must be finite and above absolute zero');
  }
  for (const solute of input.otherColligativeSolutes ?? []) {
    finiteNonNegative(solute.grams, `${solute.id}.grams`);
    if (
      !Number.isFinite(solute.molecularWeightGramsPerMol) ||
      solute.molecularWeightGramsPerMol <= 0
    ) {
      throw new RangeError(`${solute.id}.molecularWeightGramsPerMol must be positive`);
    }
    if (
      solute.vanT_HoffFactor !== undefined &&
      (!Number.isFinite(solute.vanT_HoffFactor) || solute.vanT_HoffFactor <= 0)
    ) {
      throw new RangeError(`${solute.id}.vanT_HoffFactor must be positive`);
    }
  }
};

const totalSolids = (input: SorbetCalibrationMixture): number =>
  Object.values(sugarMasses(input)).reduce((sum, grams) => sum + grams, 0) +
  (input.inulinGrams ?? 0) +
  (input.otherNonColligativeSolidsGrams ?? 0) +
  (input.otherColligativeSolutes ?? []).reduce((sum, solute) => sum + solute.grams, 0);

const colligativeParticleMoles = (input: SorbetCalibrationMixture): number => {
  const sugars = sugarMasses(input);
  const sugarMoles = (Object.keys(sugars) as CalibratedSugar[]).reduce(
    (sum, sugar) => sum + sugars[sugar] / SUGAR_MOLECULAR_WEIGHT_G_PER_MOL[sugar],
    0,
  );
  return (
    sugarMoles +
    (input.otherColligativeSolutes ?? []).reduce(
      (sum, solute) =>
        sum + (solute.grams / solute.molecularWeightGramsPerMol) * (solute.vanT_HoffFactor ?? 1),
      0,
    )
  );
};

const logIdealWaterActivity = (liquidWaterGrams: number, particleMoles: number): number => {
  const waterMoles = liquidWaterGrams / WATER_MOLECULAR_WEIGHT_G_PER_MOL;
  return Math.log(waterMoles / (waterMoles + particleMoles));
};

const logEquilibriumWaterActivity = (temperatureK: number): number =>
  (-WATER_FUSION_ENTHALPY_J_PER_MOL / GAS_CONSTANT_J_PER_MOL_K) *
  (1 / temperatureK - 1 / PURE_WATER_FREEZING_K);

const equilibriumTemperatureFromLogActivity = (logWaterActivity: number): number =>
  1 /
  (1 / PURE_WATER_FREEZING_K -
    (GAS_CONSTANT_J_PER_MOL_K / WATER_FUSION_ENTHALPY_J_PER_MOL) * logWaterActivity);

const activePublishedBinarySugar = (
  input: SorbetCalibrationMixture,
): { sugar: CalibratedSugar; grams: number; alphaK: number } | null => {
  if ((input.otherColligativeSolutes?.length ?? 0) > 0) return null;
  const active = (Object.entries(sugarMasses(input)) as [CalibratedSugar, number][]).filter(
    ([, grams]) => grams > 0,
  );
  if (active.length !== 1) return null;
  const [sugar, grams] = active[0]!;
  const alphaK = PONGSAWATMANIT_ALPHA_K[sugar];
  return alphaK === undefined ? null : { sugar, grams, alphaK };
};

const logBinaryWaterActivity = (
  liquidWaterGrams: number,
  soluteGrams: number,
  sugar: CalibratedSugar,
  alphaK: number,
  temperatureK: number,
): number => {
  const waterMoles = liquidWaterGrams / WATER_MOLECULAR_WEIGHT_G_PER_MOL;
  const soluteMoles = soluteGrams / SUGAR_MOLECULAR_WEIGHT_G_PER_MOL[sugar];
  const waterMoleFraction = waterMoles / (waterMoles + soluteMoles);
  // Eq. 5: ln(gamma_w) = -(alpha'/T)(1-X_w)^2.
  return Math.log(waterMoleFraction) - (alphaK / temperatureK) * (1 - waterMoleFraction) ** 2;
};

const solveInitialFreezingPoint = (
  logActivityAtTemperature: (temperatureK: number) => number,
): { celsius: number; iterations: number } => {
  let lowerK = 223.15;
  let upperK = PURE_WATER_FREEZING_K;
  let iterations = 0;
  while (iterations < MAX_ROOT_ITERATIONS && upperK - lowerK > TEMPERATURE_TOLERANCE_K) {
    const middleK = (lowerK + upperK) / 2;
    const residual = logActivityAtTemperature(middleK) - logEquilibriumWaterActivity(middleK);
    if (residual > 0) lowerK = middleK;
    else upperK = middleK;
    iterations += 1;
  }
  return { celsius: (lowerK + upperK) / 2 - 273.15, iterations };
};

const unsupported = (
  input: SorbetCalibrationMixture,
  model: SorbetCalibrationModel,
): SorbetIceCalibrationResult => {
  const solids = totalSolids(input);
  return {
    model,
    authority:
      model === 'ideal_colligative_baseline' ? 'research_baseline_only' : 'published_binary_only',
    initialWaterGrams: input.waterGrams,
    totalSolidsGrams: solids,
    totalMixtureGrams: input.waterGrams + solids,
    freezableWaterGrams: null,
    boundWaterGrams: null,
    initialFreezingPointCelsius: null,
    equilibriumSerum: null,
    iceMassGrams: null,
    iceMassFractionOfMix: null,
    frozenFractionOfInitialWater: null,
    frozenFractionOfFreezableWater: null,
    massConservationResidualGrams: null,
    convergence: { converged: false, iterations: 0, reason: 'unsupported_model_domain' },
    uncertainty: [
      'The published non-ideal coefficient is binary-only and does not authorize fructose or mixtures.',
    ],
  };
};

export function runSorbetIceCalibration(
  input: SorbetCalibrationMixture,
  model: SorbetCalibrationModel = 'ideal_colligative_baseline',
): SorbetIceCalibrationResult {
  validateInput(input);
  const solids = totalSolids(input);
  const total = input.waterGrams + solids;
  const targetK = input.temperatureCelsius + 273.15;
  const binary =
    model === 'pongsawatmanit_binary_phase_diagram' ? activePublishedBinarySugar(input) : null;
  if (model === 'pongsawatmanit_binary_phase_diagram' && binary === null) {
    return unsupported(input, model);
  }

  const particles = colligativeParticleMoles(input);
  if (particles === 0) {
    const ice = input.temperatureCelsius < 0 ? input.waterGrams : 0;
    const liquid = input.waterGrams - ice;
    return {
      model,
      authority:
        model === 'ideal_colligative_baseline' ? 'research_baseline_only' : 'published_binary_only',
      initialWaterGrams: input.waterGrams,
      totalSolidsGrams: solids,
      totalMixtureGrams: total,
      freezableWaterGrams: null,
      boundWaterGrams: null,
      initialFreezingPointCelsius: 0,
      equilibriumSerum: {
        liquidWaterGrams: liquid,
        dissolvedSolidsGrams: solids,
        totalSerumGrams: liquid + solids,
        waterMassFraction: liquid + solids > 0 ? liquid / (liquid + solids) : 0,
        solidsMassFraction: liquid + solids > 0 ? solids / (liquid + solids) : 0,
      },
      iceMassGrams: ice,
      iceMassFractionOfMix: total > 0 ? ice / total : 0,
      frozenFractionOfInitialWater: input.waterGrams > 0 ? ice / input.waterGrams : 0,
      frozenFractionOfFreezableWater: null,
      massConservationResidualGrams: ice + liquid + solids - total,
      convergence: { converged: true, iterations: 0, reason: 'pure_water_limit' },
      uncertainty: ['Bound/freezable water is not modeled.'],
    };
  }

  const logActivity = (liquidWaterGrams: number, temperatureK: number): number =>
    binary
      ? logBinaryWaterActivity(
          liquidWaterGrams,
          binary.grams,
          binary.sugar,
          binary.alphaK,
          temperatureK,
        )
      : logIdealWaterActivity(liquidWaterGrams, particles);

  const initialFreezing = binary
    ? solveInitialFreezingPoint((temperatureK) => logActivity(input.waterGrams, temperatureK))
    : {
        celsius:
          equilibriumTemperatureFromLogActivity(logActivity(input.waterGrams, targetK)) - 273.15,
        iterations: 0,
      };

  let liquidWater = input.waterGrams;
  let iterations = initialFreezing.iterations;
  let reason: SorbetIceCalibrationResult['convergence']['reason'] = 'above_initial_freezing_point';
  if (input.temperatureCelsius < initialFreezing.celsius && input.waterGrams > 0) {
    let lower = Math.min(ROOT_TOLERANCE_GRAMS, input.waterGrams / 2);
    let upper = input.waterGrams;
    while (iterations < MAX_ROOT_ITERATIONS && upper - lower > ROOT_TOLERANCE_GRAMS) {
      const middle = (lower + upper) / 2;
      const residual = logActivity(middle, targetK) - logEquilibriumWaterActivity(targetK);
      if (residual > 0) upper = middle;
      else lower = middle;
      iterations += 1;
    }
    liquidWater = (lower + upper) / 2;
    reason = 'equilibrium_solved';
  }

  const ice = input.waterGrams - liquidWater;
  const serum = liquidWater + solids;
  return {
    model,
    authority:
      model === 'ideal_colligative_baseline' ? 'research_baseline_only' : 'published_binary_only',
    initialWaterGrams: input.waterGrams,
    totalSolidsGrams: solids,
    totalMixtureGrams: total,
    freezableWaterGrams: null,
    boundWaterGrams: null,
    initialFreezingPointCelsius: initialFreezing.celsius,
    equilibriumSerum: {
      liquidWaterGrams: liquidWater,
      dissolvedSolidsGrams: solids,
      totalSerumGrams: serum,
      waterMassFraction: serum > 0 ? liquidWater / serum : 0,
      solidsMassFraction: serum > 0 ? solids / serum : 0,
    },
    iceMassGrams: ice,
    iceMassFractionOfMix: total > 0 ? ice / total : 0,
    frozenFractionOfInitialWater: input.waterGrams > 0 ? ice / input.waterGrams : 0,
    frozenFractionOfFreezableWater: null,
    massConservationResidualGrams: ice + liquidWater + solids - total,
    convergence: { converged: true, iterations, reason },
    uncertainty:
      model === 'ideal_colligative_baseline'
        ? [
            'Ideal water activity is a baseline, not production authority.',
            'Bound/freezable water, inulin grade, fruit acids and non-ideal mixture interactions are not modeled.',
          ]
        : [
            'Published authority covers only one binary sugar-water system.',
            'Bound/freezable water is not modeled.',
          ],
  };
}

/**
 * Arellano Salazar (2012), Fig. 3.1 polynomial fitted to the DSC equilibrium
 * freeze-concentration curve for the published lemon Sorbet, restricted by the
 * source to −13..0 °C. w0=0.252 is the source's initial sweetener mass fraction.
 * This is a dataset-specific validation oracle, not a transferable recipe model.
 */
export function publishedLemonSorbetDscState(temperatureCelsius: number): {
  equilibriumSweetenerMassFraction: number;
  iceMassFractionOfMix: number;
} {
  if (!Number.isFinite(temperatureCelsius) || temperatureCelsius < -13 || temperatureCelsius > 0) {
    throw new RangeError('Published lemon Sorbet polynomial is restricted to −13..0 °C');
  }
  const t = temperatureCelsius;
  const equilibriumSweetenerMassFraction =
    -0.137 * t - 0.0202 * t ** 2 - 0.00167 * t ** 3 - 0.0000529 * t ** 4;
  const initialSweetenerMassFraction = 0.252;
  const iceMassFractionOfMix = Math.max(
    0,
    1 - initialSweetenerMassFraction / equilibriumSweetenerMassFraction,
  );
  return { equilibriumSweetenerMassFraction, iceMassFractionOfMix };
}
