/**
 * Temperature-aware correction targets (Spine Slice 11) — a PURE seam that derives
 * the Temperature Regulator's target for the selected product × serving temperature
 * and reports whether the REAL correction solver actually aims at it.
 *
 * Honest scope: the engine's correction solver targets the Base Engine seeded band
 * (`TARGET_BANDS` has only `milk_gelato @ −11`; every other category/temperature
 * falls back to it, flagged `temperature_fallback` / `category_fallback`). The
 * regulator, by contrast, has distinct bands per profile × temperature. This module
 * does NOT change the solver or the engine — it exposes the regulator target and
 * DETECTS the divergence, surfacing `temperature_target_not_connected` when the
 * solver is still on the −11 fallback. So the pipeline is TARGET-AWARE / instrumented,
 * not yet truly temperature-aware. Never remaps an unsupported profile/temperature.
 *
 * No engine import (reads the engine result's fallback flags structurally), no DB,
 * no Mapper, no persistence.
 */
import {
  ACTIVE_PRODUCT_PROFILES,
  getTemperatureRegulatorSettingsOrNull,
  PRODUCT_PROFILE_REGISTRY,
  type NormalizedRecipeIntent,
  type ProductProfile,
  type ServingTemperatureC,
  type TemperatureRegulatorSettings,
} from '@/spine';

/** The regulator's correction target for one product × serving temperature. */
export interface TemperatureAwareCorrectionTarget {
  productProfile: ProductProfile;
  servingTemperatureC: ServingTemperatureC;
  regulatorProfile: string;
  regulatorStatus: string;
  npacBand: readonly [number, number];
  npacCleanCenter: readonly [number, number] | null;
  /** Regulator metric bands keyed by the profile-registry gate id. */
  metricBands: Record<string, readonly [number, number]>;
  hardGates: string[];
  advisoryGates: string[];
  safeAdjustmentFamilies: string[];
  forbiddenAdjustmentFamilies: string[];
}

/**
 * Where the solver's ACTUAL target comes from:
 * - `base_engine_seeded`: the engine band matches the recipe's profile×temperature
 *   (only `milk_gelato @ −11`, which coincides with the regulator −11 band);
 * - `not_connected`: the engine fell back to the seeded band (a different temperature
 *   and/or category), so the solver is NOT aiming at the regulator target;
 * - `temperature_regulator`: reserved — emitted only once the solver consumes the
 *   regulator band directly (a future slice); never emitted here.
 */
export type SolverTargetSource = 'base_engine_seeded' | 'temperature_regulator' | 'not_connected';

/** The engine-result fields this seam reads (a structural subset — no engine import). */
export interface EngineTargetSignalLike {
  indicators: ReadonlyArray<{
    key: string;
    band?: { min: number; max: number } | null;
    temperature_fallback?: boolean;
    category_fallback?: boolean;
  }>;
}

export interface TemperatureAwareTargetGuidance {
  target: TemperatureAwareCorrectionTarget | null;
  /** True only when the solver's fixed target is aligned with the regulator target. */
  solverTargetAligned: boolean;
  solverTargetSource: SolverTargetSource;
  /** |engine NPAC band center − regulator NPAC band center|, when both are known. */
  npacTargetDivergence: number | null;
  warnings: string[];
  blocked: boolean;
  blockedReason: string | null;
}

const METRIC_BAND_KEYS: ReadonlyArray<[keyof TemperatureRegulatorSettings, string]> = [
  ['pod', 'pod'],
  ['iceFraction', 'ice_fraction'],
  ['solids', 'total_solids'],
  ['water', 'water'],
  ['fat', 'fat'],
  ['lactose', 'lactose'],
  ['lactoseSanding', 'lactose_sanding'],
  ['aeratingProtein', 'aerating_protein'],
  ['proteinShareInSolids', 'protein_share_in_solids'],
];

const isSupportedProfile = (p: string): boolean =>
  (ACTIVE_PRODUCT_PROFILES as readonly string[]).includes(p);

const center = (b: readonly [number, number]): number => (b[0] + b[1]) / 2;

/** The regulator's correction target, or null for an unsupported profile/temperature. */
export function temperatureRegulatorTarget(
  productProfile: string,
  servingTemperatureC: number,
): TemperatureAwareCorrectionTarget | null {
  const settings = getTemperatureRegulatorSettingsOrNull(productProfile, servingTemperatureC);
  if (!settings || !settings.npac) return null;
  const def = PRODUCT_PROFILE_REGISTRY[settings.productProfile];

  const metricBands: Record<string, readonly [number, number]> = {};
  for (const [field, gate] of METRIC_BAND_KEYS) {
    const band = (settings[field] as { band?: readonly [number, number] } | undefined)?.band;
    if (band) metricBands[gate] = band;
  }

  const hardGates = Object.entries(def.activeGates)
    .filter(([, level]) => level === 'hard')
    .map(([gate]) => gate);
  const advisoryGates = Object.entries(def.activeGates)
    .filter(([, level]) => level === 'advisory' || level === 'soft')
    .map(([gate]) => gate);

  return {
    productProfile: settings.productProfile,
    servingTemperatureC: settings.servingTemperatureC,
    regulatorProfile: def.temperatureRegulator,
    regulatorStatus: settings.status,
    npacBand: settings.npac.band,
    npacCleanCenter: settings.npac.cleanCenter ?? null,
    metricBands,
    hardGates,
    advisoryGates,
    safeAdjustmentFamilies: [...def.allowedCorrectionFamilies],
    forbiddenAdjustmentFamilies: [...def.forbiddenCorrectionFamilies],
  };
}

/**
 * Derive the temperature-aware target guidance from the intent + the Base Engine
 * result's band-selection flags. Pure; mutates nothing. An unsupported profile or
 * temperature is BLOCKED (never remapped). When the engine fell back to the seeded
 * band, `solverTargetAligned` is false and `temperature_target_not_connected` is
 * warned — the solver is honestly NOT aiming at the regulator target.
 */
export function deriveTemperatureAwareTarget(
  intent: NormalizedRecipeIntent,
  engine: EngineTargetSignalLike,
): TemperatureAwareTargetGuidance {
  const blockedResult = (reason: string): TemperatureAwareTargetGuidance => ({
    target: null,
    solverTargetAligned: false,
    solverTargetSource: 'not_connected',
    npacTargetDivergence: null,
    warnings: [`temperature_target_blocked:${reason}`],
    blocked: true,
    blockedReason: reason,
  });

  if (!isSupportedProfile(intent.productProfile)) return blockedResult('unsupported_product_profile');
  const target = temperatureRegulatorTarget(intent.productProfile, intent.servingTemperatureC);
  if (!target) return blockedResult('unsupported_serving_temperature');

  const temperatureFallback = engine.indicators.some((i) => i.temperature_fallback === true);
  const categoryFallback = engine.indicators.some((i) => i.category_fallback === true);
  const engineNpacBand = engine.indicators.find((i) => i.key === 'npac')?.band ?? null;
  const npacTargetDivergence = engineNpacBand
    ? Math.abs(center([engineNpacBand.min, engineNpacBand.max]) - center(target.npacBand))
    : null;

  const aligned = !temperatureFallback && !categoryFallback;
  const warnings: string[] = [];
  if (!aligned) warnings.push('temperature_target_not_connected');
  if (temperatureFallback) warnings.push('solver_uses_temperature_fallback_band');
  if (categoryFallback) warnings.push('solver_uses_category_fallback_band');

  return {
    target,
    solverTargetAligned: aligned,
    // The solver never consumes the regulator band yet, so it is always the seeded band
    // (aligned only at milk_gelato −11) or a fallback (not connected).
    solverTargetSource: aligned ? 'base_engine_seeded' : 'not_connected',
    npacTargetDivergence,
    warnings,
    blocked: false,
    blockedReason: null,
  };
}
