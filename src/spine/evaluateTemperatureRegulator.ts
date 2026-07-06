/**
 * PINGUINO Spine — Temperature Regulator EVALUATION layer (Phase C Slice 5).
 *
 * The Temperature Regulator is a LAYER on top of the shared Base Engine, never
 * a replacement engine and never recipe math. The Base Engine calculates the
 * recipe truth (POD, PAC, NPAC, ice fraction, solids, water, …); this module
 * receives those already-calculated metrics as plain data and only INTERPRETS
 * them against the locked per-profile × per-temperature settings from
 * `temperatureRegulator.ts` (Slice 4):
 *
 *   Base Engine → metrics → evaluateTemperatureRegulator(settings) → status,
 *   warnings, correction goals, score.
 *
 * It changes interpretation only — never ingredient chemistry, never the Base
 * Engine, never the metrics it is handed. Gate strictness (hard / advisory /
 * disabled) is read from the Product Profile Registry, never re-declared here.
 *
 * Source of truth: the four locked docs Temperature_Regulator_{GELATO,SORBET,
 * VEGAN,CHOCOLATE}.md — result model (§12), correction goals (§13) and hard
 * rules (§14). Unsupported product or temperature is BLOCKED with a reason,
 * never silently mapped onto another profile or temperature.
 */
import {
  PRODUCT_PROFILE_REGISTRY,
  type SpineGateId,
} from './productProfiles';
import {
  getTemperatureRegulatorSettingsOrNull,
  isMetricInBand,
  type MetricBand,
  type TemperatureRegulatorConfigVersion,
  type TemperatureRegulatorSettings,
} from './temperatureRegulator';
import type { GateLevel, ProductProfile, ServingTemperatureC, TexturePreference } from './types';

export type TemperatureRegulatorEvaluationVersion = '0.1.0';
export const TEMPERATURE_REGULATOR_EVALUATION_VERSION: TemperatureRegulatorEvaluationVersion =
  '0.1.0';

/**
 * The Base Engine result the regulator evaluates. It is the OUTPUT of the
 * shared engine handed in as plain data — this module never computes it. Only
 * the fields a given profile's settings define bands for are consulted; the
 * rest are ignored (e.g. sorbet/vegan never read lactose). `stabilizerGrams`
 * is a presence signal: `undefined` means "not reported" (a warning, never a
 * fail), `<= 0` means genuinely absent (a hard fail per the locked docs).
 */
export interface BaseEngineMetrics {
  npac: number;
  pod: number;
  iceFraction: number;
  water: number;
  solids: number;
  fat?: number;
  lactose?: number;
  lactoseSanding?: number;
  aeratingProtein?: number;
  proteinShareInSolids?: number;
  stabilizerGrams?: number;
}

export interface TemperatureRegulatorEvaluationInput {
  /** Untrusted — may be an unsupported profile; blocked, never remapped. */
  productProfile: string;
  /** Untrusted — may be an unsupported temperature; blocked, never remapped. */
  servingTemperatureC: number;
  metrics: BaseEngineMetrics;
  /** Advisory only — moves the target inside the band, never overrides a gate. */
  texturePreference?: TexturePreference;
}

/** Overall texture verdict (locked doc §12 result model). */
export type TemperatureRegulatorStatus =
  | 'too_hard'
  | 'firm_side_acceptable'
  | 'optimal'
  | 'soft_side_acceptable'
  | 'too_soft'
  | 'invalid';

/** Where recipe NPAC lands relative to the temperature band (locked doc §12). */
export type NpacStatus =
  | 'below_band'
  | 'firm_side'
  | 'clean_center'
  | 'soft_side'
  | 'above_band'
  | 'invalid';

/** Why the regulator could not evaluate at all (no fallback is ever taken). */
export type TemperatureRegulatorBlockedReason =
  | 'unsupported_product_profile'
  | 'unsupported_serving_temperature';

/**
 * Correction goals — the UNION of every locked doc's §13 vocabulary. The
 * regulator hands goals to the Optimizer; it never changes grams itself. Terms
 * are kept verbatim per doc (Standard Gelato says `reduce_pod`; Sorbet/Vegan/
 * Chocolate say `decrease_pod`) so nothing is renamed away from the source.
 */
export type CorrectionGoal =
  | 'increase_npac'
  | 'decrease_npac'
  | 'increase_pod'
  | 'decrease_pod'
  | 'reduce_pod'
  | 'increase_solids'
  | 'decrease_solids'
  | 'increase_water'
  | 'decrease_water'
  | 'increase_fat'
  | 'decrease_fat'
  | 'increase_ice_fraction'
  | 'decrease_ice_fraction'
  | 'reduce_lactose_sanding'
  | 'increase_aerating_protein'
  | 'adjust_fruit_ratio'
  | 'adjust_plant_base_ratio'
  | 'adjust_chocolate_ratio'
  | 'adjust_cocoa_fat_balance'
  | 'restore_stabilizer';

export interface TemperatureRegulatorMetricEvaluation {
  gate: SpineGateId;
  metric: keyof BaseEngineMetrics;
  value: number | null;
  band: readonly [number, number] | null;
  level: 'hard' | 'advisory';
  inBand: boolean | null;
  direction: 'below' | 'in' | 'above' | 'unknown';
}

export interface TemperatureRegulatorTrace {
  evaluationVersion: TemperatureRegulatorEvaluationVersion;
  configVersion: TemperatureRegulatorConfigVersion;
  settingsStatus: string;
  npacBand: readonly [number, number] | null;
  npacCleanCenter: readonly [number, number] | null;
  texturePreference: TexturePreference;
  textureAligned: boolean;
  metricEvaluations: TemperatureRegulatorMetricEvaluation[];
  disabledGates: readonly string[];
  advisoryGates: readonly string[];
  /** Hard profile gates the regulator does NOT own (no band) — left to Designer/Optimizer. */
  structuralGatesNotEvaluated: string[];
  missingHardMetrics: SpineGateId[];
}

export interface TemperatureRegulatorEvaluation {
  productProfile: ProductProfile | null;
  servingTemperatureC: ServingTemperatureC | null;
  evaluated: boolean;
  blockedReason: TemperatureRegulatorBlockedReason | null;

  status: TemperatureRegulatorStatus;
  npacStatus: NpacStatus;
  /** True only if NPAC is inside band AND every hard gate passes (locked doc §14). */
  acceptable: boolean;

  hardGateFailures: SpineGateId[];
  advisoryFlags: string[];
  warnings: string[];
  correctionGoals: CorrectionGoal[];
  score: number;

  trace: TemperatureRegulatorTrace;
}

/* ------------------------------------------------------------------------ *
 * Metric → gate wiring                                                      *
 * ------------------------------------------------------------------------ */

interface MetricSpec {
  metric: keyof BaseEngineMetrics;
  gate: SpineGateId;
  /** The settings band field carrying this metric's target. */
  settingsKey: keyof Pick<
    TemperatureRegulatorSettings,
    | 'pod'
    | 'iceFraction'
    | 'water'
    | 'solids'
    | 'fat'
    | 'lactose'
    | 'lactoseSanding'
    | 'aeratingProtein'
    | 'proteinShareInSolids'
  >;
}

/** Non-NPAC metrics the regulator can gate (NPAC is handled separately). */
const METRIC_SPECS: readonly MetricSpec[] = [
  { metric: 'pod', gate: 'pod', settingsKey: 'pod' },
  { metric: 'iceFraction', gate: 'ice_fraction', settingsKey: 'iceFraction' },
  { metric: 'solids', gate: 'total_solids', settingsKey: 'solids' },
  { metric: 'water', gate: 'water', settingsKey: 'water' },
  { metric: 'fat', gate: 'fat', settingsKey: 'fat' },
  { metric: 'lactose', gate: 'lactose', settingsKey: 'lactose' },
  { metric: 'lactoseSanding', gate: 'lactose_sanding', settingsKey: 'lactoseSanding' },
  { metric: 'aeratingProtein', gate: 'aerating_protein', settingsKey: 'aeratingProtein' },
  {
    metric: 'proteinShareInSolids',
    gate: 'protein_share_in_solids',
    settingsKey: 'proteinShareInSolids',
  },
];

/**
 * Hard profile gates that are NOT metric bands the regulator owns — they are
 * structural / fruit / plant / cocoa gates the Designer and Optimizer decide.
 * Listed in the trace so their absence from evaluation is explicit, not silent.
 */
const STRUCTURAL_GATES: ReadonlySet<SpineGateId> = new Set([
  'alcohol',
  'fruit_water_sugar_balance',
  'plant_base_structure',
  'chocolate_cocoa_solids_behavior',
  'cost',
]);

/** Per-profile §13 correction-goal vocabulary — emitted goals are filtered to it. */
const PROFILE_GOAL_VOCAB: Readonly<Record<ProductProfile, ReadonlySet<CorrectionGoal>>> = {
  standard_gelato: new Set([
    'increase_npac',
    'decrease_npac',
    'reduce_lactose_sanding',
    'increase_solids',
    'decrease_solids',
    'increase_aerating_protein',
    'reduce_pod',
    'increase_pod',
    'restore_stabilizer',
  ]),
  sorbet: new Set([
    'increase_npac',
    'decrease_npac',
    'increase_pod',
    'decrease_pod',
    'increase_solids',
    'decrease_solids',
    'increase_water',
    'decrease_water',
    'adjust_fruit_ratio',
    'restore_stabilizer',
  ]),
  vegan_gelato: new Set([
    'increase_npac',
    'decrease_npac',
    'increase_pod',
    'decrease_pod',
    'increase_solids',
    'decrease_solids',
    'increase_water',
    'decrease_water',
    'increase_fat',
    'decrease_fat',
    'adjust_plant_base_ratio',
    'restore_stabilizer',
  ]),
  chocolate_gelato: new Set([
    'increase_npac',
    'decrease_npac',
    'increase_pod',
    'decrease_pod',
    'increase_ice_fraction',
    'decrease_ice_fraction',
    'increase_solids',
    'decrease_solids',
    'increase_water',
    'decrease_water',
    'reduce_lactose_sanding',
    'increase_aerating_protein',
    'adjust_chocolate_ratio',
    'adjust_cocoa_fat_balance',
    'restore_stabilizer',
  ]),
};

const isFiniteNumber = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

/** The correction goal for a plain band miss, or null if the profile has no term for it. */
const goalForMiss = (
  profile: ProductProfile,
  gate: SpineGateId,
  direction: 'below' | 'above',
): CorrectionGoal | null => {
  const vocab = PROFILE_GOAL_VOCAB[profile];
  const pick = (goal: CorrectionGoal): CorrectionGoal | null => (vocab.has(goal) ? goal : null);
  switch (gate) {
    case 'pod':
      // Standard Gelato's doc says `reduce_pod`; the others say `decrease_pod`.
      return direction === 'below' ? pick('increase_pod') : pick('reduce_pod') ?? pick('decrease_pod');
    case 'total_solids':
      return direction === 'below' ? pick('increase_solids') : pick('decrease_solids');
    case 'water':
      return direction === 'below' ? pick('increase_water') : pick('decrease_water');
    case 'fat':
      return direction === 'below' ? pick('increase_fat') : pick('decrease_fat');
    case 'ice_fraction':
      return direction === 'below' ? pick('increase_ice_fraction') : pick('decrease_ice_fraction');
    case 'lactose_sanding':
      // Only "too high" sanding has a goal; too-low sanding is not a doc lever.
      return direction === 'above' ? pick('reduce_lactose_sanding') : null;
    case 'aerating_protein':
      return direction === 'below' ? pick('increase_aerating_protein') : null;
    case 'protein_share_in_solids':
      // Standard Gelato hard gate: the nearest §13 lever is aerating protein.
      return direction === 'below' ? pick('increase_aerating_protein') : null;
    default:
      // lactose (no dedicated §13 goal), and any other gate: nothing to emit.
      return null;
  }
};

/* ------------------------------------------------------------------------ *
 * Evaluation                                                                *
 * ------------------------------------------------------------------------ */

const blocked = (
  reason: TemperatureRegulatorBlockedReason,
  texture: TexturePreference,
): TemperatureRegulatorEvaluation => ({
  productProfile: null,
  servingTemperatureC: null,
  evaluated: false,
  blockedReason: reason,
  status: 'invalid',
  npacStatus: 'invalid',
  acceptable: false,
  hardGateFailures: [],
  advisoryFlags: [],
  warnings: [`temperature_regulator_blocked:${reason}`],
  correctionGoals: [],
  score: 0,
  trace: {
    evaluationVersion: TEMPERATURE_REGULATOR_EVALUATION_VERSION,
    configVersion: '0.1.0',
    settingsStatus: 'blocked',
    npacBand: null,
    npacCleanCenter: null,
    texturePreference: texture,
    textureAligned: false,
    metricEvaluations: [],
    disabledGates: [],
    advisoryGates: [],
    structuralGatesNotEvaluated: [],
    missingHardMetrics: [],
  },
});

const STATUS_FOR_NPAC: Readonly<Record<NpacStatus, TemperatureRegulatorStatus>> = {
  below_band: 'too_hard',
  firm_side: 'firm_side_acceptable',
  clean_center: 'optimal',
  soft_side: 'soft_side_acceptable',
  above_band: 'too_soft',
  invalid: 'invalid',
};

const classifyNpac = (value: number, band: readonly [number, number], cleanCenter?: readonly [number, number]): NpacStatus => {
  if (value < band[0]) return 'below_band';
  if (value > band[1]) return 'above_band';
  if (!cleanCenter) return 'clean_center';
  if (value < cleanCenter[0]) return 'firm_side';
  if (value > cleanCenter[1]) return 'soft_side';
  return 'clean_center';
};

const textureAlignment = (texture: TexturePreference, npacStatus: NpacStatus): boolean =>
  (texture === 'firm' && npacStatus === 'firm_side') ||
  (texture === 'medium' && npacStatus === 'clean_center') ||
  (texture === 'soft' && npacStatus === 'soft_side');

/**
 * Pure Temperature Regulator evaluation. Reads the locked settings and profile
 * gate levels; interprets the handed-in Base Engine metrics; returns status,
 * warnings, correction goals and a score. Never mutates the input, never calls
 * the engine, never falls back to another profile or temperature.
 */
export function evaluateTemperatureRegulator(
  input: TemperatureRegulatorEvaluationInput,
): TemperatureRegulatorEvaluation {
  const texture = input.texturePreference ?? 'medium';
  const settings = getTemperatureRegulatorSettingsOrNull(input.productProfile, input.servingTemperatureC);

  if (!settings) {
    // Distinguish which axis is unsupported for an honest blocked reason.
    // Own-property check only — never match inherited keys like `toString`.
    const profileOk = Object.prototype.hasOwnProperty.call(
      PRODUCT_PROFILE_REGISTRY,
      input.productProfile,
    );
    return blocked(
      profileOk ? 'unsupported_serving_temperature' : 'unsupported_product_profile',
      texture,
    );
  }

  const profile = settings.productProfile;
  const profileDef = PRODUCT_PROFILE_REGISTRY[profile];
  const disabled = new Set<string>(profileDef.disabledGates);
  const metrics = input.metrics;

  const warnings: string[] = [];
  const advisoryFlags: string[] = [];
  const hardGateFailures: SpineGateId[] = [];
  const missingHardMetrics: SpineGateId[] = [];
  const goals: CorrectionGoal[] = [];
  const metricEvaluations: TemperatureRegulatorMetricEvaluation[] = [];
  let penalty = 0;

  const gateLevel = (gate: SpineGateId): GateLevel | undefined => profileDef.activeGates[gate];

  /* --- NPAC: drives status + npacStatus ---------------------------------- */
  const npacBandSpec = settings.npac;
  const npacBand = npacBandSpec?.band ?? null;
  const npacCleanCenter = npacBandSpec?.cleanCenter ?? null;
  let npacStatus: NpacStatus = 'invalid';

  if (npacBand && isFiniteNumber(metrics.npac)) {
    npacStatus = classifyNpac(metrics.npac, npacBand, npacCleanCenter ?? undefined);
    const inBand = npacStatus !== 'below_band' && npacStatus !== 'above_band';
    metricEvaluations.push({
      gate: 'npac',
      metric: 'npac',
      value: metrics.npac,
      band: npacBand,
      level: 'hard',
      inBand,
      direction: npacStatus === 'below_band' ? 'below' : npacStatus === 'above_band' ? 'above' : 'in',
    });
    if (npacStatus === 'below_band') {
      hardGateFailures.push('npac');
      const g = goalForMiss(profile, 'npac' as SpineGateId, 'below') ?? 'increase_npac';
      goals.push(g);
      penalty += 45 + Math.min(25, Math.round((npacBand[0] - metrics.npac) * 3));
    } else if (npacStatus === 'above_band') {
      hardGateFailures.push('npac');
      const g = goalForMiss(profile, 'npac' as SpineGateId, 'above') ?? 'decrease_npac';
      goals.push(g);
      penalty += 45 + Math.min(25, Math.round((metrics.npac - npacBand[1]) * 3));
    } else if (npacStatus === 'firm_side' || npacStatus === 'soft_side') {
      penalty += 8;
    }
  } else {
    warnings.push('npac_not_evaluable');
    missingHardMetrics.push('npac');
  }

  /* --- Other metric gates ------------------------------------------------- */
  for (const spec of METRIC_SPECS) {
    const level = gateLevel(spec.gate);
    const bandSpec: MetricBand | undefined = settings[spec.settingsKey];
    // Only evaluate a metric the profile keeps active AND the settings band for it.
    if (!bandSpec || !level || level === 'disabled' || disabled.has(spec.gate)) continue;

    const raw = metrics[spec.metric];
    const provided = isFiniteNumber(raw);
    const band = bandSpec.band;

    if (!provided) {
      // Advisory gates may be absent quietly; hard gates cannot be confirmed.
      if (level === 'hard') {
        missingHardMetrics.push(spec.gate);
        warnings.push(`metric_not_reported:${spec.metric}`);
      }
      metricEvaluations.push({
        gate: spec.gate,
        metric: spec.metric,
        value: null,
        band,
        level: level === 'hard' ? 'hard' : 'advisory',
        inBand: null,
        direction: 'unknown',
      });
      continue;
    }

    // A negative metric is invalid input (locked docs §14, "grams become negative"): flag it, but
    // let it flow through the level-aware branches below — a negative on an ADVISORY gate (e.g.
    // Chocolate protein share) must stay advisory, never escalate to a hard fail.
    if (raw < 0) warnings.push(`invalid_metric_value:${spec.metric}`);

    const inBand = isMetricInBand(raw, band);
    const direction: 'below' | 'in' | 'above' = raw < band[0] ? 'below' : raw > band[1] ? 'above' : 'in';

    if (spec.gate === 'protein_share_in_solids' && level === 'advisory') {
      // Chocolate: advisory only — cocoa solids dilute dairy protein share. Never
      // a hard fail (locked doc §6); below the hard minimum is a strong advisory.
      const hardMinimum = bandSpec.hardMinimum ?? band[0];
      const benchmark = bandSpec.visibleBenchmark ?? band;
      if (raw < hardMinimum) {
        advisoryFlags.push('protein_share_below_hard_minimum');
        const g = goalForMiss(profile, spec.gate, 'below');
        if (g) goals.push(g);
        penalty += 8;
      } else if (raw < benchmark[0]) {
        advisoryFlags.push('protein_share_below_visible_benchmark');
        penalty += 3;
      } else if (raw > benchmark[1]) {
        advisoryFlags.push('protein_share_above_visible_benchmark');
        penalty += 3;
      }
      metricEvaluations.push({ gate: spec.gate, metric: spec.metric, value: raw, band, level: 'advisory', inBand, direction });
      continue;
    }

    metricEvaluations.push({
      gate: spec.gate,
      metric: spec.metric,
      value: raw,
      band,
      level: level === 'hard' ? 'hard' : 'advisory',
      inBand,
      direction,
    });

    if (inBand) continue;

    if (level === 'hard') {
      hardGateFailures.push(spec.gate);
      penalty += 15;
      const g = goalForMiss(profile, spec.gate, direction === 'below' ? 'below' : 'above');
      if (g) goals.push(g);
    } else {
      advisoryFlags.push(`${spec.gate}_out_of_band`);
      penalty += 3;
      const g = goalForMiss(profile, spec.gate, direction === 'below' ? 'below' : 'above');
      if (g) goals.push(g);
    }
  }

  /* --- Stabilizer (required for every active v1.0 profile) ---------------- */
  const stab = metrics.stabilizerGrams;
  let stabilizerAbsent = false;
  if (stab === undefined) {
    warnings.push('stabilizer_not_reported');
  } else if (!Number.isFinite(stab) || stab <= 0) {
    stabilizerAbsent = true;
    hardGateFailures.push('stabilizer');
    goals.push('restore_stabilizer');
    penalty += 20;
  }

  /* --- Roll up ------------------------------------------------------------ */
  const npacInBand =
    npacStatus === 'firm_side' || npacStatus === 'clean_center' || npacStatus === 'soft_side';
  const acceptable =
    npacInBand &&
    hardGateFailures.length === 0 &&
    missingHardMetrics.length === 0 &&
    !stabilizerAbsent;

  penalty += missingHardMetrics.length * 6;

  const status = STATUS_FOR_NPAC[npacStatus];
  const dedupedGoals = [...new Set(goals)];

  const structuralGatesNotEvaluated = Object.entries(profileDef.activeGates)
    .filter(([gate, level]) => level !== 'disabled' && STRUCTURAL_GATES.has(gate as SpineGateId))
    .map(([gate]) => gate);

  return {
    productProfile: profile,
    servingTemperatureC: settings.servingTemperatureC,
    evaluated: true,
    blockedReason: null,
    status,
    npacStatus,
    acceptable,
    hardGateFailures,
    advisoryFlags,
    warnings,
    correctionGoals: dedupedGoals,
    score: clampScore(100 - penalty),
    trace: {
      evaluationVersion: TEMPERATURE_REGULATOR_EVALUATION_VERSION,
      configVersion: settings.configVersion,
      settingsStatus: settings.status,
      npacBand,
      npacCleanCenter,
      texturePreference: texture,
      textureAligned: textureAlignment(texture, npacStatus),
      metricEvaluations,
      disabledGates: settings.disabledGates,
      advisoryGates: settings.advisoryGates,
      structuralGatesNotEvaluated,
      missingHardMetrics,
    },
  };
}

/** The three supported serving temperatures, coldest-last, for sweeps. */
const SUPPORTED_TEMPERATURES: readonly ServingTemperatureC[] = [-11, -12, -13];

/**
 * Evaluate one recipe's metrics at every supported serving temperature — the
 * "same formula across temperatures" check (locked docs §15): the metrics stay
 * identical, only the regulator verdict changes. Returns an entry per −11/−12/
 * −13 °C. Blocks (returns an `invalid` evaluation) for an unsupported profile.
 */
export function evaluateAcrossTemperatures(
  productProfile: string,
  metrics: BaseEngineMetrics,
  texturePreference?: TexturePreference,
): Record<ServingTemperatureC, TemperatureRegulatorEvaluation> {
  const out = {} as Record<ServingTemperatureC, TemperatureRegulatorEvaluation>;
  for (const servingTemperatureC of SUPPORTED_TEMPERATURES) {
    out[servingTemperatureC] = evaluateTemperatureRegulator({
      productProfile,
      servingTemperatureC,
      metrics,
      texturePreference,
    });
  }
  return out;
}
