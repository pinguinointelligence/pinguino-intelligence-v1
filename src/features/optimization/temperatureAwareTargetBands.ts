/**
 * Temperature-aware SHADOW target bands (Spine Slice 12) — a pure, non-live
 * preview of what the correction solver WOULD target if it used the locked
 * Temperature Regulator bands, compared against the current engine `TARGET_BANDS`.
 *
 * SAFETY: this changes NOTHING live. It reads the engine's selected band via the
 * public `selectTargetBand` (read-only — never mutates `TARGET_BANDS`, never
 * touches `calculateRecipe`) and reads the regulator bands via the Slice 11
 * `temperatureRegulatorTarget`. The shadow source is labelled
 * `temperature_regulator_shadow`; it is not wired into the solver or the engine.
 * Its only job is visibility: show engine-band-vs-regulator-band divergence and
 * whether the solver currently targets the correct band, so a future live
 * `TARGET_BANDS` update can be made with evidence.
 *
 * No external DB, no Mapper, no persistence, no mutation.
 */
import { selectTargetBand, type ProductCategory, type TargetMetric } from '@/engine';
import {
  ACTIVE_PRODUCT_PROFILES,
  type ProductProfile,
  type ServingTemperatureC,
} from '@/spine';
import { temperatureRegulatorTarget } from './temperatureAwareCorrectionTargets';

export const SHADOW_BAND_SOURCE = 'temperature_regulator_shadow' as const;

export interface ShadowTargetBands {
  source: typeof SHADOW_BAND_SOURCE;
  productProfile: ProductProfile;
  servingTemperatureC: ServingTemperatureC;
  regulatorProfile: string;
  npacBand: readonly [number, number];
  npacCleanCenter: readonly [number, number] | null;
  /** Regulator bands keyed by profile-registry gate id. */
  metricBands: Record<string, readonly [number, number]>;
  hardGates: string[];
  advisoryGates: string[];
}

export type ShadowComparisonStatus =
  | 'aligned'
  | 'divergent'
  | 'missing_engine_band'
  | 'missing_shadow_band'
  | 'unsupported_profile'
  | 'unsupported_temperature';

export interface MetricBandComparison {
  /** Regulator gate id (e.g. 'npac', 'total_solids', 'lactose_sanding'). */
  metric: string;
  engineMetric: TargetMetric | null;
  engineBand: readonly [number, number] | null;
  shadowBand: readonly [number, number] | null;
  centerDelta: number | null;
  aligned: boolean;
}

export interface EngineVsShadowComparison {
  productProfile: string;
  servingTemperatureC: number;
  status: ShadowComparisonStatus;
  shadowSource: typeof SHADOW_BAND_SOURCE;
  /** The engine category the solver's band actually comes from (profile→category map). */
  engineCategory: ProductCategory | null;
  engineTemperatureFallback: boolean;
  engineCategoryFallback: boolean;
  comparisons: MetricBandComparison[];
  /** True only when every band matches AND the engine used no fallback. */
  solverTargetsCorrectBand: boolean;
  /** Target-only simulation: the regulator NPAC clean-center the solver WOULD aim at. */
  wouldTargetNpacCenter: number | null;
  warnings: string[];
}

/** Engine product category the solver's band comes from, per spine product profile. */
const PROFILE_TO_ENGINE_CATEGORY: Readonly<Record<ProductProfile, ProductCategory>> = {
  standard_gelato: 'milk_gelato',
  chocolate_gelato: 'chocolate_gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan_gelato',
};

/** Regulator gate id → engine `TargetMetric` (names differ for two metrics). */
const GATE_TO_ENGINE_METRIC: Readonly<Record<string, TargetMetric>> = {
  npac: 'npac',
  pod: 'pod',
  ice_fraction: 'ice_fraction',
  total_solids: 'total_solids',
  water: 'water',
  fat: 'fat',
  lactose: 'lactose',
  lactose_sanding: 'lactose_sandiness_risk',
  aerating_protein: 'aerating_protein',
  protein_share_in_solids: 'protein_in_solids',
};

const isSupportedProfile = (p: string): boolean =>
  (ACTIVE_PRODUCT_PROFILES as readonly string[]).includes(p);
const center = (b: readonly [number, number]): number => (b[0] + b[1]) / 2;
const sameBand = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] === b[0] && a[1] === b[1];

/** The regulator shadow bands for one product × serving temperature (null if unsupported). */
export function shadowTargetBands(
  productProfile: string,
  servingTemperatureC: number,
): ShadowTargetBands | null {
  const t = temperatureRegulatorTarget(productProfile, servingTemperatureC);
  if (!t) return null;
  return {
    source: SHADOW_BAND_SOURCE,
    productProfile: t.productProfile,
    servingTemperatureC: t.servingTemperatureC,
    regulatorProfile: t.regulatorProfile,
    npacBand: t.npacBand,
    npacCleanCenter: t.npacCleanCenter,
    metricBands: t.metricBands,
    hardGates: t.hardGates,
    advisoryGates: t.advisoryGates,
  };
}

/**
 * Compare the current engine target band (what the solver targets today) against
 * the regulator shadow band, per product × serving temperature. Pure: reads
 * `selectTargetBand` (config, read-only) and the regulator settings; mutates
 * nothing. Unsupported profile/temperature is reported, never remapped.
 */
export function compareEngineVsShadowBands(
  productProfile: string,
  servingTemperatureC: number,
): EngineVsShadowComparison {
  const base: EngineVsShadowComparison = {
    productProfile,
    servingTemperatureC,
    status: 'unsupported_profile',
    shadowSource: SHADOW_BAND_SOURCE,
    engineCategory: null,
    engineTemperatureFallback: false,
    engineCategoryFallback: false,
    comparisons: [],
    solverTargetsCorrectBand: false,
    wouldTargetNpacCenter: null,
    warnings: [],
  };

  if (!isSupportedProfile(productProfile)) {
    return { ...base, status: 'unsupported_profile', warnings: ['unsupported_product_profile'] };
  }
  const shadow = shadowTargetBands(productProfile, servingTemperatureC);
  if (!shadow) {
    return { ...base, status: 'unsupported_temperature', warnings: ['unsupported_serving_temperature'] };
  }

  const engineCategory = PROFILE_TO_ENGINE_CATEGORY[productProfile as ProductProfile];
  const selection = selectTargetBand(engineCategory, servingTemperatureC);
  if (!selection) {
    return { ...base, engineCategory, status: 'missing_engine_band', warnings: ['missing_engine_band'] };
  }

  // Compare NPAC first, then every metric the shadow band defines.
  const shadowBands: Record<string, readonly [number, number]> = { npac: shadow.npacBand, ...shadow.metricBands };
  const comparisons: MetricBandComparison[] = [];
  for (const [gate, shadowBand] of Object.entries(shadowBands)) {
    const engineMetric = GATE_TO_ENGINE_METRIC[gate] ?? null;
    const engineRange = engineMetric ? selection.band.metrics[engineMetric] : undefined;
    const engineBand: readonly [number, number] | null = engineRange
      ? [engineRange.min, engineRange.max]
      : null;
    comparisons.push({
      metric: gate,
      engineMetric,
      engineBand,
      shadowBand,
      centerDelta: engineBand ? Math.abs(center(engineBand) - center(shadowBand)) : null,
      aligned: engineBand ? sameBand(engineBand, shadowBand) : false,
    });
  }

  // Headline alignment = the engine selected the recipe's ACTUAL profile×temperature band
  // (no fallback), consistent with the Slice 11 notion. Per-metric `centerDelta` still exposes any
  // residual spec difference (e.g. the engine −11 npac [33,42] vs the regulator −11 [33,43]).
  const noFallback = !selection.temperature_fallback && !selection.category_fallback;
  const solverTargetsCorrectBand = noFallback;

  const warnings: string[] = [];
  if (selection.temperature_fallback) warnings.push('engine_uses_temperature_fallback_band');
  if (selection.category_fallback) warnings.push('engine_uses_category_fallback_band');
  if (!solverTargetsCorrectBand) warnings.push('solver_not_targeting_regulator_band');

  return {
    productProfile,
    servingTemperatureC,
    status: solverTargetsCorrectBand ? 'aligned' : 'divergent',
    shadowSource: SHADOW_BAND_SOURCE,
    engineCategory,
    engineTemperatureFallback: selection.temperature_fallback,
    engineCategoryFallback: selection.category_fallback,
    comparisons,
    solverTargetsCorrectBand,
    // Target-only simulation (the solver is NOT connected to this): the regulator clean-center
    // the solver would aim at if the shadow band were live.
    wouldTargetNpacCenter: shadow.npacCleanCenter ? center(shadow.npacCleanCenter) : center(shadow.npacBand),
    warnings,
  };
}
