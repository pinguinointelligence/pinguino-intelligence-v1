/**
 * Composition-sensitive Sorbet freeze-concentration model.
 *
 * Scientific authority:
 * - Chen freezing-point equation, as reproduced in Mendoza Cardoso (2017),
 *   Eq. 7, for fructose/glucose/sucrose model systems.
 * - Grajales-Lagunes et al. composition regressions for Chen E and B,
 *   Mendoza Cardoso (2017), Eqs. 9 and 10. The same regressions reproduce the
 *   paper's five real-fruit validation rows from their dry-solids sugar shares.
 *
 * The canonical public metric remains `ice_fraction_percent`, but this module
 * makes its denominator explicit: ice mass / initial total mix mass. It also
 * returns frozen initial water separately so the two quantities cannot be
 * confused.
 */
import type { EngineWarning } from './types';

export interface SorbetFreezingPhysicsInput {
  totalMixtureGrams: number;
  initialWaterGrams: number;
  totalDrySolidsGrams: number;
  sucroseGrams: number;
  glucoseGrams: number;
  /** Actual dry D-glucose mass. Commercial-product water must stay in water. */
  dextroseGrams: number;
  fructoseGrams: number;
  /**
   * Freeze-active mass outside the published F/G/S model (for example
   * lactose, polyols, alcohol, salt or an unnamed sugar). A significant value
   * fails closed; it is never assigned an invented coefficient.
   */
  unsupportedFreezeActiveSolidsGrams: number;
  temperatureCelsius: number;
}

export type SorbetFreezingUnavailableReason =
  | 'invalid_input'
  | 'mass_balance_mismatch'
  | 'unsupported_temperature'
  | 'unsupported_freeze_active_solute'
  | 'sugar_share_outside_validated_domain'
  | 'invalid_composition_regression'
  | 'equilibrium_not_reachable';

export interface SorbetFreezingCompositionParameters {
  fructoseDrySolidsFraction: number;
  glucoseDrySolidsFraction: number;
  sucroseDrySolidsFraction: number;
  modeledSugarDrySolidsFraction: number;
  chenE: number;
  chenB: number;
}

export interface SorbetFreezingAvailableResult {
  status: 'available';
  authority: 'grajales_lagunes_composition_chen';
  parameters: SorbetFreezingCompositionParameters;
  initialFreezingPointCelsius: number;
  equilibriumSerum: {
    liquidWaterGrams: number;
    dissolvedDrySolidsGrams: number;
    totalSerumGrams: number;
    waterMassFraction: number;
    drySolidsMassFraction: number;
  };
  iceMassGrams: number;
  iceMassFractionOfMix: number;
  frozenFractionOfInitialWater: number;
  massConservationResidualGrams: number;
  iterations: number;
}

export interface SorbetFreezingUnavailableResult {
  status: 'unavailable';
  authority: 'grajales_lagunes_composition_chen';
  reason: SorbetFreezingUnavailableReason;
  parameters: SorbetFreezingCompositionParameters | null;
}

export type SorbetFreezingPhysicsResult =
  | SorbetFreezingAvailableResult
  | SorbetFreezingUnavailableResult;

/** Source Eq. 7: beta / lambda_w. beta=1860 kg C/kmol; water=18.01528 kg/kmol. */
const CHEN_BETA_KG_C_PER_KMOL = 1860;
const WATER_MOLECULAR_WEIGHT_KG_PER_KMOL = 18.01528;
const CHEN_TEMPERATURE_FACTOR_C = CHEN_BETA_KG_C_PER_KMOL / WATER_MOLECULAR_WEIGHT_KG_PER_KMOL;

/** Runtime authority requested and validated for the three serving temperatures. */
export const SORBET_FREEZING_SUPPORTED_TEMPERATURE_C = Object.freeze({ min: -13, max: -11 });

/**
 * True when the composition-sensitive Sorbet solver is the DIRECT ice authority
 * at `temperatureCelsius` (−13 … −11 °C). Outside this range Sorbet has no ice
 * authority at all: it never inherits milk-gelato anchor rows, so callers must
 * fail closed rather than substitute another category's curve.
 */
export function isSorbetFreezingTemperatureSupported(temperatureCelsius: number): boolean {
  return (
    Number.isFinite(temperatureCelsius) &&
    temperatureCelsius >= SORBET_FREEZING_SUPPORTED_TEMPERATURE_C.min &&
    temperatureCelsius <= SORBET_FREEZING_SUPPORTED_TEMPERATURE_C.max
  );
}

/**
 * `calculateRecipe` reports an unavailable Sorbet solver as a
 * `composition_invalid` warning whose `context.reason` is this prefix followed
 * by the `SorbetFreezingUnavailableReason`. Consumers (Monitor status, QA)
 * must read that contract through `sorbetFreezingUnavailableReasonFromWarnings`
 * instead of ad-hoc string matching.
 */
export const SORBET_FREEZING_WARNING_REASON_PREFIX = 'sorbet_freezing_';

/** Compile-time exhaustive: adding a reason to the union without listing it here fails typecheck. */
const SORBET_FREEZING_UNAVAILABLE_REASONS = {
  invalid_input: true,
  mass_balance_mismatch: true,
  unsupported_temperature: true,
  unsupported_freeze_active_solute: true,
  sugar_share_outside_validated_domain: true,
  invalid_composition_regression: true,
  equilibrium_not_reachable: true,
} as const satisfies Record<SorbetFreezingUnavailableReason, true>;

/**
 * The Sorbet solver-unavailable reason carried by an Engine result's warnings,
 * or null when no such warning exists (i.e. the composition authority was
 * available, or the recipe is not a Sorbet). An unrecognised suffix still
 * reports `'unknown'` so a future reason can never be mistaken for authority.
 */
export function sorbetFreezingUnavailableReasonFromWarnings(
  warnings: readonly EngineWarning[],
): SorbetFreezingUnavailableReason | 'unknown' | null {
  for (const warning of warnings) {
    if (warning.code !== 'composition_invalid') continue;
    const reason = warning.context?.reason;
    if (typeof reason !== 'string' || !reason.startsWith(SORBET_FREEZING_WARNING_REASON_PREFIX)) {
      continue;
    }
    const suffix = reason.slice(SORBET_FREEZING_WARNING_REASON_PREFIX.length);
    return Object.hasOwn(SORBET_FREEZING_UNAVAILABLE_REASONS, suffix)
      ? (suffix as SorbetFreezingUnavailableReason)
      : 'unknown';
  }
  return null;
}

/**
 * The source design has F+G+S=0.95 of dry solids. Its five real-fruit
 * validation systems span 0.571..0.917. We permit exactly their combined
 * published domain and do not extrapolate to low-sugar solids or >95% sugar.
 */
const MIN_MODELED_SUGAR_DRY_SOLIDS_FRACTION = 0.571;
const MAX_MODELED_SUGAR_DRY_SOLIDS_FRACTION = 0.95;

/**
 * Canonical composition rows can carry trace mineral/salt rounding (for
 * example a mineral declaration on fruit/fibre). Below 0.05% of the mix the source data cannot
 * resolve that trace separately, so it is treated as composition precision,
 * not assigned an antifreeze coefficient. At or above this threshold the
 * unsupported solute fails closed.
 */
export const SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION = 0.0005;

const FRACTION_TOLERANCE = 1e-12;

const finiteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

const unavailable = (
  reason: SorbetFreezingUnavailableReason,
  parameters: SorbetFreezingCompositionParameters | null = null,
): SorbetFreezingUnavailableResult => ({
  status: 'unavailable',
  authority: 'grajales_lagunes_composition_chen',
  reason,
  parameters,
});

/** Published Scheffe regressions, Eqs. 9 and 10. */
export function sorbetChenCompositionParameters(input: {
  fructoseDrySolidsFraction: number;
  glucoseDrySolidsFraction: number;
  sucroseDrySolidsFraction: number;
}): SorbetFreezingCompositionParameters | null {
  const xF = input.fructoseDrySolidsFraction;
  const xG = input.glucoseDrySolidsFraction;
  const xS = input.sucroseDrySolidsFraction;
  if (![xF, xG, xS].every(finiteNonNegative)) return null;
  const modeledSugarDrySolidsFraction = xF + xG + xS;
  const chenE =
    0.081 * xF +
    0.071 * xG +
    0.064 * xS +
    0.039 * xF * xG -
    0.002 * xF * xS +
    0.074 * xG * xS +
    0.545 * xF * xG * xS;
  const chenB =
    0.172 * xF +
    0.223 * xG +
    0.114 * xS +
    0.144 * xF * xG +
    0.243 * xF * xS -
    0.106 * xG * xS -
    5.175 * xF * xG * xS;
  if (!Number.isFinite(chenE) || !Number.isFinite(chenB)) return null;
  return {
    fructoseDrySolidsFraction: xF,
    glucoseDrySolidsFraction: xG,
    sucroseDrySolidsFraction: xS,
    modeledSugarDrySolidsFraction,
    chenE,
    chenB,
  };
}

/** Source Eq. 7, returning the equilibrium melting/freezing point in Celsius. */
export function sorbetChenFreezingPointCelsius(
  drySolidsMassFraction: number,
  parameters: Pick<SorbetFreezingCompositionParameters, 'chenE' | 'chenB'>,
): number | null {
  if (
    !Number.isFinite(drySolidsMassFraction) ||
    drySolidsMassFraction <= 0 ||
    drySolidsMassFraction >= 1 ||
    !Number.isFinite(parameters.chenE) ||
    parameters.chenE <= 0 ||
    !Number.isFinite(parameters.chenB) ||
    parameters.chenB < 0
  ) {
    return null;
  }
  const waterMassFraction = 1 - drySolidsMassFraction;
  const unboundWaterTerm = waterMassFraction - parameters.chenB * drySolidsMassFraction;
  const denominator = unboundWaterTerm + parameters.chenE * drySolidsMassFraction;
  if (unboundWaterTerm <= 0 || denominator <= 0) return null;
  const value = CHEN_TEMPERATURE_FACTOR_C * Math.log(unboundWaterTerm / denominator);
  return Number.isFinite(value) ? value : null;
}

export function solveSorbetFreezingPhysics(
  input: SorbetFreezingPhysicsInput,
): SorbetFreezingPhysicsResult {
  const masses = [
    input.totalMixtureGrams,
    input.initialWaterGrams,
    input.totalDrySolidsGrams,
    input.sucroseGrams,
    input.glucoseGrams,
    input.dextroseGrams,
    input.fructoseGrams,
    input.unsupportedFreezeActiveSolidsGrams,
  ];
  if (
    !masses.every(finiteNonNegative) ||
    input.totalMixtureGrams <= 0 ||
    input.initialWaterGrams <= 0 ||
    input.totalDrySolidsGrams <= 0 ||
    !Number.isFinite(input.temperatureCelsius)
  ) {
    return unavailable('invalid_input');
  }

  const massToleranceGrams = Math.max(1e-9, input.totalMixtureGrams * 1e-9);
  if (
    Math.abs(input.initialWaterGrams + input.totalDrySolidsGrams - input.totalMixtureGrams) >
    massToleranceGrams
  ) {
    return unavailable('mass_balance_mismatch');
  }
  if (!isSorbetFreezingTemperatureSupported(input.temperatureCelsius)) {
    return unavailable('unsupported_temperature');
  }
  const unsupportedTraceToleranceGrams = Math.max(
    massToleranceGrams,
    input.totalMixtureGrams * SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION,
  );
  if (input.unsupportedFreezeActiveSolidsGrams >= unsupportedTraceToleranceGrams) {
    return unavailable('unsupported_freeze_active_solute');
  }

  const glucoseEquivalentGrams = input.glucoseGrams + input.dextroseGrams;
  const modeledSugarGrams = input.fructoseGrams + glucoseEquivalentGrams + input.sucroseGrams;
  if (modeledSugarGrams > input.totalDrySolidsGrams + massToleranceGrams) {
    return unavailable('invalid_input');
  }
  const parameters = sorbetChenCompositionParameters({
    fructoseDrySolidsFraction: input.fructoseGrams / input.totalDrySolidsGrams,
    glucoseDrySolidsFraction: glucoseEquivalentGrams / input.totalDrySolidsGrams,
    sucroseDrySolidsFraction: input.sucroseGrams / input.totalDrySolidsGrams,
  });
  if (!parameters || parameters.chenE <= 0 || parameters.chenB < 0) {
    return unavailable('invalid_composition_regression', parameters);
  }
  if (
    parameters.modeledSugarDrySolidsFraction <
      MIN_MODELED_SUGAR_DRY_SOLIDS_FRACTION - FRACTION_TOLERANCE ||
    parameters.modeledSugarDrySolidsFraction >
      MAX_MODELED_SUGAR_DRY_SOLIDS_FRACTION + FRACTION_TOLERANCE
  ) {
    return unavailable('sugar_share_outside_validated_domain', parameters);
  }

  const initialDrySolidsFraction = input.totalDrySolidsGrams / input.totalMixtureGrams;
  const initialFreezingPointCelsius = sorbetChenFreezingPointCelsius(
    initialDrySolidsFraction,
    parameters,
  );
  if (initialFreezingPointCelsius === null) {
    return unavailable('invalid_composition_regression', parameters);
  }

  let equilibriumDrySolidsFraction = initialDrySolidsFraction;
  if (input.temperatureCelsius < initialFreezingPointCelsius) {
    // Eq. 7 can be inverted exactly. With A=1+B and
    // q=exp(T/(beta/lambda_w)):
    // q=(1-A*x)/(1-(A-E)*x)
    // x=(1-q)/(A-q*(A-E)). This is deterministic, bounded and avoids
    // re-running an iterative root finder thousands of times in Direction.
    const q = Math.exp(input.temperatureCelsius / CHEN_TEMPERATURE_FACTOR_C);
    const a = 1 + parameters.chenB;
    const denominator = a - q * (a - parameters.chenE);
    const solved = (1 - q) / denominator;
    const physicalUpper = Math.min(
      1 - FRACTION_TOLERANCE,
      1 / (1 + parameters.chenB) - FRACTION_TOLERANCE,
    );
    if (
      !Number.isFinite(solved) ||
      solved < initialDrySolidsFraction - FRACTION_TOLERANCE ||
      solved > physicalUpper
    ) {
      return unavailable('equilibrium_not_reachable', parameters);
    }
    equilibriumDrySolidsFraction = Math.max(initialDrySolidsFraction, solved);
  }

  const liquidWaterGrams =
    (input.totalDrySolidsGrams * (1 - equilibriumDrySolidsFraction)) / equilibriumDrySolidsFraction;
  const iceMassGrams = input.initialWaterGrams - liquidWaterGrams;
  if (
    !Number.isFinite(liquidWaterGrams) ||
    !Number.isFinite(iceMassGrams) ||
    liquidWaterGrams < -massToleranceGrams ||
    iceMassGrams < -massToleranceGrams ||
    iceMassGrams > input.initialWaterGrams + massToleranceGrams
  ) {
    return unavailable('equilibrium_not_reachable', parameters);
  }
  const boundedLiquidWaterGrams = Math.max(0, Math.min(input.initialWaterGrams, liquidWaterGrams));
  const boundedIceMassGrams = input.initialWaterGrams - boundedLiquidWaterGrams;
  const totalSerumGrams = boundedLiquidWaterGrams + input.totalDrySolidsGrams;
  return {
    status: 'available',
    authority: 'grajales_lagunes_composition_chen',
    parameters,
    initialFreezingPointCelsius,
    equilibriumSerum: {
      liquidWaterGrams: boundedLiquidWaterGrams,
      dissolvedDrySolidsGrams: input.totalDrySolidsGrams,
      totalSerumGrams,
      waterMassFraction: boundedLiquidWaterGrams / totalSerumGrams,
      drySolidsMassFraction: input.totalDrySolidsGrams / totalSerumGrams,
    },
    iceMassGrams: boundedIceMassGrams,
    iceMassFractionOfMix: boundedIceMassGrams / input.totalMixtureGrams,
    frozenFractionOfInitialWater: boundedIceMassGrams / input.initialWaterGrams,
    massConservationResidualGrams: boundedIceMassGrams + totalSerumGrams - input.totalMixtureGrams,
    iterations: 0,
  };
}
