/**
 * Solver-injected regulator targets (Spine Slice 13) — a PURE preview seam that
 * lets the optimizer preview see what the correction solver WOULD target if it
 * aimed at the locked Temperature Regulator bands, WITHOUT changing the global
 * engine `TARGET_BANDS`, `calculateRecipe`, or the solver.
 *
 * How it works (the smallest safe seam, no engine edits):
 *  - the correction solver reads its target bands ONLY from a `RecipeResult`'s
 *    `indicators[].band` (via the engine's own exported, pure `detectViolations`);
 *  - so this adapter runs the REAL `calculateRecipe`, then builds an IMMUTABLE
 *    COPY of the result whose HARD-gate indicator bands are replaced by the
 *    regulator bands (values, keys and engine fallback flags preserved), and
 *    re-runs `detectViolations` on the copy;
 *  - the engine-seeded violations vs the regulator-shadow violations are compared
 *    to show whether the solver's target (and therefore the correction it would
 *    pursue) changes under the regulator bands.
 *
 * SAFETY / honest scope:
 *  - the original `RecipeResult` and the global engine config are NEVER mutated;
 *  - ONLY HARD-gate bands are injected — advisory gates (e.g. chocolate
 *    protein-share) keep the engine band, so an advisory is never turned hard;
 *  - an unsupported profile / serving temperature is BLOCKED, never remapped;
 *  - this re-targets the solver's VIOLATION DETECTION only. It does NOT re-run
 *    the exact-gram solve against the injected bands (the gram solver recomputes
 *    `calculateRecipe` internally and would need the global-config change or a
 *    solver-API target override — the documented next decision). No fabricated
 *    gram correction is produced here.
 *  - No external DB, no Mapper, no persistence, no recipe save.
 */
import {
  calculateRecipe,
  detectViolations,
  type CorrectionViolation,
  type Indicator,
  type RecipeInput,
  type RecipeResult,
  type TargetMetric,
  type TargetRange,
} from '@/engine';
import { ACTIVE_PRODUCT_PROFILES } from '@/spine';
import { temperatureRegulatorTarget } from './temperatureAwareCorrectionTargets';

export const INJECTED_TARGET_SOURCE = 'temperature_regulator_shadow' as const;

/** Which target the preview emphasises: today's engine-seeded band, or the injected regulator band. */
export type SolverTargetMode = 'engine_seeded' | 'regulator_shadow';

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
const centerOf = (b: readonly [number, number]): number => (b[0] + b[1]) / 2;
/**
 * A band-center move below this (in metric points) is treated as "same target" — it
 * would not meaningfully move the solver's grams. It keeps near-aligned cells (e.g.
 * −11, engine npac center 37.5 vs regulator 38 = 0.5) honestly reported as unchanged,
 * while genuine divergences (−12/−13, Δ ≥ 8) and any violation-SET change still flag.
 */
const RETARGET_TOLERANCE = 1;

/** One regulator band mapped to an engine metric, with its gate level. */
export interface InjectedSolverTargetBand {
  /** Regulator gate id (e.g. 'npac', 'lactose_sanding'). */
  gate: string;
  metric: TargetMetric;
  band: readonly [number, number];
  gateLevel: 'hard' | 'advisory';
}

/**
 * The injected-target contract: the regulator bands the solver WOULD target for
 * one product × serving temperature, split into the HARD bands that get injected
 * and the ADVISORY bands that are deliberately left on the engine band.
 */
export interface InjectedSolverTarget {
  source: typeof INJECTED_TARGET_SOURCE;
  productProfile: string;
  servingTemperatureC: number;
  /** True when the regulator target exists and can be injected. */
  active: boolean;
  /** Why the injection is inactive (unsupported profile/temperature), else null. */
  fallbackReason: string | null;
  regulatorProfile: string | null;
  /** HARD-gate regulator bands — the ones this seam injects into the solver's view. */
  hardTargetBands: InjectedSolverTargetBand[];
  /** ADVISORY-gate regulator bands — kept for trace; NEVER injected (advisory stays advisory). */
  advisoryTargetBands: InjectedSolverTargetBand[];
  /** The engine metrics whose band gets replaced (hard gates only). */
  injectedMetrics: TargetMetric[];
}

/**
 * Build the injected-target contract from the locked regulator settings.
 * Unsupported profile/temperature → `active: false` (blocked, never remapped).
 */
export function buildInjectedSolverTarget(
  productProfile: string,
  servingTemperatureC: number,
): InjectedSolverTarget {
  const base: InjectedSolverTarget = {
    source: INJECTED_TARGET_SOURCE,
    productProfile,
    servingTemperatureC,
    active: false,
    fallbackReason: null,
    regulatorProfile: null,
    hardTargetBands: [],
    advisoryTargetBands: [],
    injectedMetrics: [],
  };

  if (!isSupportedProfile(productProfile)) {
    return { ...base, fallbackReason: 'unsupported_product_profile' };
  }
  const target = temperatureRegulatorTarget(productProfile, servingTemperatureC);
  if (!target) {
    return { ...base, fallbackReason: 'unsupported_serving_temperature' };
  }

  const hardGates = new Set(target.hardGates);
  const advisoryGates = new Set(target.advisoryGates);
  const allBands: Record<string, readonly [number, number]> = { npac: target.npacBand, ...target.metricBands };

  const hardTargetBands: InjectedSolverTargetBand[] = [];
  const advisoryTargetBands: InjectedSolverTargetBand[] = [];
  for (const [gate, band] of Object.entries(allBands)) {
    const metric = GATE_TO_ENGINE_METRIC[gate];
    if (!metric) continue; // no engine metric for this gate (e.g. structural/cost) — skip
    if (hardGates.has(gate)) {
      hardTargetBands.push({ gate, metric, band, gateLevel: 'hard' });
    } else if (advisoryGates.has(gate)) {
      advisoryTargetBands.push({ gate, metric, band, gateLevel: 'advisory' });
    }
    // a gate that is neither hard nor advisory for this profile is not active → skip
  }

  return {
    ...base,
    active: true,
    regulatorProfile: target.regulatorProfile,
    hardTargetBands,
    advisoryTargetBands,
    injectedMetrics: hardTargetBands.map((b) => b.metric),
  };
}

/**
 * Return an IMMUTABLE COPY of `result` whose HARD-gate indicator bands are
 * replaced by the injected regulator bands. The original result is never mutated
 * (indicators and their band objects are cloned). Only bands for metrics in
 * `target.hardTargetBands` change; every other indicator (value, key, status,
 * engine fallback flags) is copied verbatim. Advisory bands are NOT applied.
 */
export function injectRegulatorBands(
  result: RecipeResult,
  target: InjectedSolverTarget,
): RecipeResult {
  const bandByMetric = new Map<TargetMetric, readonly [number, number]>();
  if (target.active) {
    for (const b of target.hardTargetBands) bandByMetric.set(b.metric, b.band);
  }

  const indicators: Indicator[] = result.indicators.map((indicator) => {
    const injected = bandByMetric.get(indicator.key as TargetMetric);
    const band: TargetRange | null | undefined = injected
      ? { min: injected[0], max: injected[1] } // fresh object — never shares the engine band
      : indicator.band
        ? { ...indicator.band }
        : indicator.band;
    return { ...indicator, band };
  });

  return { ...result, indicators };
}

/** A compact view of one solver violation (metric, direction, value, target band + center). */
export interface InjectedViolationView {
  metric: TargetMetric;
  direction: 'low' | 'high';
  value: number | null;
  band: readonly [number, number] | null;
  targetCenter: number | null;
}

/** Per-metric engine-seeded vs regulator-shadow comparison for one injected metric. */
export interface SolverTargetMetricComparison {
  metric: TargetMetric;
  value: number | null;
  engineBand: readonly [number, number] | null;
  /** Always present — a comparison exists only for an injected hard-gate regulator band. */
  regulatorBand: readonly [number, number];
  /** Out of band under the engine-seeded band? */
  engineViolation: boolean;
  /** Out of band under the injected regulator band? */
  shadowViolation: boolean;
  engineTargetCenter: number | null;
  shadowTargetCenter: number | null;
  targetCenterDelta: number | null;
  /** Violation status or target center differs between the two modes. */
  changed: boolean;
}

export interface SolverTargetInjectionAnalysis {
  source: typeof INJECTED_TARGET_SOURCE;
  productProfile: string;
  servingTemperatureC: number;
  /** The mode the caller selected for display (both results are always computed). */
  mode: SolverTargetMode;
  /** True when the regulator-shadow target could be injected. */
  active: boolean;
  blockedReason: string | null;
  regulatorProfile: string | null;
  injectedMetrics: TargetMetric[];
  /** What the REAL solver targets today (engine-seeded bands). */
  engineSeededViolations: InjectedViolationView[];
  /** What the solver WOULD target under the injected regulator bands (detection re-run only). */
  regulatorShadowViolations: InjectedViolationView[];
  comparisons: SolverTargetMetricComparison[];
  /** Metrics that violate under the regulator band but not the engine band. */
  newViolationsUnderRegulator: TargetMetric[];
  /** Metrics that violate under the engine band but not the regulator band. */
  resolvedViolationsUnderRegulator: TargetMetric[];
  /** True when the injected target would change what the solver corrects. */
  correctionChanged: boolean;
  warnings: string[];
  trace: {
    engineSeededCount: number;
    regulatorShadowCount: number;
    regulatorProfile: string | null;
  };
}

const toView = (v: CorrectionViolation): InjectedViolationView => ({
  metric: v.metric,
  direction: v.direction,
  value: v.value,
  band: v.band ? [v.band.min, v.band.max] : null,
  targetCenter: v.band ? (v.band.min + v.band.max) / 2 : null,
});

const violationKeys = (vs: readonly CorrectionViolation[]): Set<string> =>
  new Set(vs.map((v) => `${v.metric}_${v.direction}`));

export interface SolverTargetInjectionInput {
  recipe: RecipeInput;
  productProfile: string;
  servingTemperatureC: number;
  mode?: SolverTargetMode;
}

/**
 * Compare what the correction solver targets today (engine-seeded bands) against
 * what it WOULD target under the injected regulator bands. Pure and deterministic:
 * runs the real `calculateRecipe` + exported `detectViolations`, mutates nothing,
 * persists nothing. When the profile/temperature is unsupported, the regulator
 * side is blocked (never remapped) and only the engine-seeded result is returned.
 */
export function analyzeSolverTargetInjection(
  input: SolverTargetInjectionInput,
): SolverTargetInjectionAnalysis {
  const { recipe, productProfile, servingTemperatureC, mode = 'engine_seeded' } = input;

  const engineResult = calculateRecipe(recipe);
  const engineViolations = detectViolations(engineResult);
  const engineSeededViolations = engineViolations.map(toView);

  const target = buildInjectedSolverTarget(productProfile, servingTemperatureC);

  const baseWarnings: string[] = [];
  if (!target.active) baseWarnings.push(`injected_target_blocked:${target.fallbackReason}`);

  if (!target.active) {
    return {
      source: INJECTED_TARGET_SOURCE,
      productProfile,
      servingTemperatureC,
      mode,
      active: false,
      blockedReason: target.fallbackReason,
      regulatorProfile: null,
      injectedMetrics: [],
      engineSeededViolations,
      regulatorShadowViolations: [],
      comparisons: [],
      newViolationsUnderRegulator: [],
      resolvedViolationsUnderRegulator: [],
      correctionChanged: false,
      warnings: baseWarnings,
      trace: {
        engineSeededCount: engineViolations.length,
        regulatorShadowCount: 0,
        regulatorProfile: null,
      },
    };
  }

  const injectedResult = injectRegulatorBands(engineResult, target);
  const shadowViolations = detectViolations(injectedResult);
  const regulatorShadowViolations = shadowViolations.map(toView);

  const engineByMetric = new Map(engineViolations.map((v) => [v.metric, v] as const));
  const shadowByMetric = new Map(shadowViolations.map((v) => [v.metric, v] as const));
  const engineBandByMetric = new Map<TargetMetric, readonly [number, number]>();
  for (const ind of engineResult.indicators) {
    if (ind.band) engineBandByMetric.set(ind.key as TargetMetric, [ind.band.min, ind.band.max]);
  }

  const comparisons: SolverTargetMetricComparison[] = [];
  const newViolationsUnderRegulator: TargetMetric[] = [];
  const resolvedViolationsUnderRegulator: TargetMetric[] = [];

  for (const { metric, band: regulatorBand } of target.hardTargetBands) {
    const engineViolation = engineByMetric.has(metric);
    const shadowViolation = shadowByMetric.has(metric);
    const engineBand = engineBandByMetric.get(metric) ?? null;
    const value =
      shadowByMetric.get(metric)?.value ??
      engineByMetric.get(metric)?.value ??
      engineResult.indicators.find((i) => i.key === metric)?.value ??
      null;
    const engineTargetCenter = engineBand ? centerOf(engineBand) : null;
    const shadowTargetCenter = centerOf(regulatorBand);
    const targetCenterDelta =
      engineTargetCenter !== null ? Math.abs(engineTargetCenter - shadowTargetCenter) : null;
    const changed =
      engineViolation !== shadowViolation ||
      (targetCenterDelta !== null && targetCenterDelta > RETARGET_TOLERANCE);

    comparisons.push({
      metric,
      value,
      engineBand,
      regulatorBand,
      engineViolation,
      shadowViolation,
      engineTargetCenter,
      shadowTargetCenter,
      targetCenterDelta,
      changed,
    });

    if (shadowViolation && !engineViolation) newViolationsUnderRegulator.push(metric);
    if (engineViolation && !shadowViolation) resolvedViolationsUnderRegulator.push(metric);
  }

  const engineKeys = violationKeys(engineViolations);
  const shadowKeys = violationKeys(shadowViolations);
  const violationSetChanged =
    engineKeys.size !== shadowKeys.size || [...shadowKeys].some((k) => !engineKeys.has(k));
  const retargeted = comparisons.some(
    (c) =>
      (c.engineViolation || c.shadowViolation) &&
      c.targetCenterDelta !== null &&
      c.targetCenterDelta > RETARGET_TOLERANCE,
  );
  const correctionChanged = violationSetChanged || retargeted;

  const warnings = [...baseWarnings];
  if (correctionChanged) warnings.push('regulator_shadow_target_changes_correction');
  if (newViolationsUnderRegulator.length > 0) warnings.push('regulator_reveals_new_violations');

  return {
    source: INJECTED_TARGET_SOURCE,
    productProfile,
    servingTemperatureC,
    mode,
    active: true,
    blockedReason: null,
    regulatorProfile: target.regulatorProfile,
    injectedMetrics: target.injectedMetrics,
    engineSeededViolations,
    regulatorShadowViolations,
    comparisons,
    newViolationsUnderRegulator,
    resolvedViolationsUnderRegulator,
    correctionChanged,
    warnings,
    trace: {
      engineSeededCount: engineViolations.length,
      regulatorShadowCount: shadowViolations.length,
      regulatorProfile: target.regulatorProfile,
    },
  };
}
