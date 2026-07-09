/**
 * PINGUINO Spine — Actual Batch Rescue decision branch (Integration Flow IF9,
 * Phase C Slice 17).
 *
 * A PURE, unwired router for the "I already produced (or am producing) a batch
 * and observed a problem" flow — locked Integration_Flow.md §16–§17. This is
 * NOT normal recipe optimization: the input is an OBSERVED batch problem plus
 * the batch's physical state, and the output is a rescue DECISION with
 * direction-level guidance only.
 *
 * Hard rules encoded here:
 *  - food safety is checked FIRST and never overridden — a contamination
 *    concern is always discard_or_rebatch, whatever else looks fixable;
 *  - actual-batch corrections are ADD-ONLY (locked §16: already-added material
 *    is never reduced) — every ingredient action this router emits is an
 *    addition; there is no reduce path;
 *  - NO exact grams are emitted (there is no gram field on any action) — the
 *    exact solve is a later, engine-verified step ("required next
 *    calculations" are surfaced instead), so nothing here can fake a solved
 *    rescue and nothing gram-shaped needs redaction;
 *  - a frozen/hardened batch is never pretended correctable in place: additions
 *    require an unfrozen mass; otherwise rescue REQUIRES reprocessing, and if
 *    reprocessing is declared unavailable the honest consequence is surfaced;
 *  - unsupported product profiles and problems are reported, never remapped;
 *  - no DB, no Mapper, no persistence, no recipe mutation (the recipe snapshot
 *    is opaque and echoed only through the trace flag).
 *
 * Capability note: the spine access layer already defines
 * `canUseActualBatchRescue` (demo: false, paid: true) — UI wiring gates on it.
 */
import {
  evaluateTemperatureRegulator,
  type BaseEngineMetrics,
} from './evaluateTemperatureRegulator';
import {
  PRODUCT_PROFILE_REGISTRY,
  type CorrectionFamily,
} from './productProfiles';
import {
  SPINE_CONTRACT_VERSION,
  type ProductProfile,
  type SpineContractVersion,
} from './types';

export type BatchRescueVersion = '0.1.0';
export const BATCH_RESCUE_VERSION: BatchRescueVersion = '0.1.0';

/* ------------------------------------------------------------------------ *
 * Contracts                                                                  *
 * ------------------------------------------------------------------------ */

/** The observed-problem vocabulary. v0.1 SUPPORTS the six starred cases;
 * the rest are honest members of the vocabulary that route to not_supported. */
export type BatchRescueProblem =
  | 'too_hard' // *
  | 'too_soft' // *
  | 'icy' // *
  | 'sandy' // *
  | 'too_sweet' // *
  | 'too_fatty' // *
  | 'serving_temperature_mismatch' // *
  | 'not_sweet_enough'
  | 'stabilizer_issue'
  | 'texture_differs_from_expected';

export interface BatchRescueObservation {
  problem: BatchRescueProblem;
  /** Measured serving/storage temperature of the actual batch, when known. */
  observedServingTemperatureC?: number | null;
  /** Any contamination / food-safety doubt — checked FIRST, never overridden. */
  foodSafetyConcern?: boolean;
  /** Free-text operator note — never parsed, never echoed into decisions. */
  note?: string;
}

/** The batch's physical state and what the operator can still do to it. */
export interface BatchRescueConstraints {
  /** The mass can be melted / re-pasteurized / re-churned. */
  canReprocess: boolean;
  liquidAdditionPossible: boolean;
  dryAdditionPossible: boolean;
  /** Hardened/frozen mass — additions cannot be stirred in without reprocessing. */
  batchAlreadyFrozen: boolean;
  /** Already served to customers — nothing left to rescue. */
  batchAlreadyServed?: boolean;
}

export interface BatchRescueIntent {
  /** Untrusted — an unsupported profile is blocked, never remapped. */
  productProfile: string;
  /** The recipe's intended serving temperature (the design target). */
  intendedServingTemperatureC: number;
  /** Actual batch mass in grams — REQUIRED (rescue math scales from it). */
  batchSizeG: number | null;
  /** The original recipe / snapshot — opaque to this router, never mutated. */
  recipeSnapshot?: unknown;
  /** The engine result the recipe was EXPECTED to have, when available. */
  expectedMetrics?: BaseEngineMetrics | null;
  observation: BatchRescueObservation;
  constraints: BatchRescueConstraints;
}

export type BatchRescueDecision =
  | 'rescue_possible'
  | 'rescue_with_tradeoff'
  | 'reprocess_required'
  | 'discard_or_rebatch'
  | 'blocked_missing_data'
  | 'not_supported';

/** Locked Integration_Flow.md §17 — the user-decision menu that FOLLOWS a
 * feasible rescue (volume increase needs explicit confirmation, §16). */
export type ActualBatchRescueUserDecision =
  | 'rescue_same_target_batch'
  | 'increase_final_batch_volume'
  | 'scale_remaining_recipe_to_actual_batch'
  | 'best_possible_tradeoff'
  | 'stop_batch';

export const ACTUAL_BATCH_RESCUE_USER_DECISIONS: readonly ActualBatchRescueUserDecision[] = [
  'rescue_same_target_batch',
  'increase_final_batch_volume',
  'scale_remaining_recipe_to_actual_batch',
  'best_possible_tradeoff',
  'stop_batch',
];

/** One direction-level rescue action. STRUCTURALLY gram-free: there is no
 * numeric amount field, so no exact grams can leak to any tier from here. */
export interface BatchRescueAction {
  kind: 'add_ingredients' | 'reprocess_and_rebalance' | 'temperature_adjustment';
  direction: 'increase' | 'decrease';
  /** Regulator gate id (npac/pod/fat/…) or 'serving_temperature'. */
  targetMetric: string;
  /** Allowed lever families for this profile (∩ registry); empty for temperature. */
  leverFamilies: CorrectionFamily[];
  method: 'add_dry' | 'add_liquid' | 'reprocess' | 'adjust_cabinet_temperature';
  /** Locked §16: actual-batch corrections only ever ADD — nothing is reduced. */
  addOnly: true;
  notes: string[];
}

export interface BatchRescueTrace {
  batchRescueVersion: BatchRescueVersion;
  problem: BatchRescueProblem | null;
  branch: string;
  profileSupported: boolean;
  physicalState: {
    batchAlreadyFrozen: boolean;
    batchAlreadyServed: boolean;
    canReprocess: boolean;
    liquidAdditionPossible: boolean;
    dryAdditionPossible: boolean;
  };
  leversConsidered: CorrectionFamily[];
  /** Lever families the problem needs that the profile forbids/lacks. */
  blockedFamilies: CorrectionFamily[];
  /** Regulator evaluation of the EXPECTED metrics at the intended temperature. */
  expectedEvaluation: {
    evaluated: boolean;
    blockedReason: string | null;
    status: string | null;
    acceptable: boolean | null;
    hardGateFailures: string[];
  } | null;
  recipeSnapshotProvided: boolean;
  addOnlyPolicy: 'actual_batch_add_only';
}

export interface BatchRescueResult {
  decision: BatchRescueDecision;
  recommendedActions: BatchRescueAction[];
  risks: string[];
  warnings: string[];
  /** Measurements / next CALCULATIONS required before or after acting. */
  requiredMeasurements: string[];
  blockedReason: string | null;
  /** Locked §17 menu — offered only when a rescue path exists, else empty. */
  nextUserDecisionOptions: ActualBatchRescueUserDecision[];
  trace: BatchRescueTrace;
  contractVersion: SpineContractVersion;
}

/* ------------------------------------------------------------------------ *
 * Problem → direction specs (grounded in the Optimizer goal/lever tables)    *
 * ------------------------------------------------------------------------ */

interface CompositionSpec {
  targetMetric: string;
  direction: 'increase' | 'decrease';
  /** Add-only lever families that move the metric — intersected with the profile. */
  leverFamilies: readonly CorrectionFamily[];
  /** Acceptable addition methods, in preference order. Dilution is liquid-only. */
  methods: readonly ('add_dry' | 'add_liquid')[];
  risks: readonly string[];
  requiredMeasurements: readonly string[];
  warnings?: readonly string[];
}

const SUPPORTED_COMPOSITION_PROBLEMS = [
  'too_hard',
  'too_soft',
  'icy',
  'sandy',
  'too_sweet',
  'too_fatty',
] as const;
type CompositionProblem = (typeof SUPPORTED_COMPOSITION_PROBLEMS)[number];

const RERUN_REQUIRED = 'rerun_base_engine_with_planned_addition_before_adding';

const COMPOSITION_SPECS: Readonly<Record<CompositionProblem, CompositionSpec>> = {
  // batch freezes too hard → freezing depression too low → raise NPAC (sugars).
  too_hard: {
    targetMetric: 'npac',
    direction: 'increase',
    leverFamilies: ['dextrose', 'sucrose'],
    methods: ['add_dry', 'add_liquid'],
    risks: ['sweetness_increases_with_added_sugars', 'batch_mass_increases_check_machine_capacity'],
    requiredMeasurements: [RERUN_REQUIRED],
  },
  // batch stays too soft → depression too high → dilute it with solids/water.
  too_soft: {
    targetMetric: 'npac',
    direction: 'decrease',
    leverFamilies: ['skimmed_milk_powder', 'inulin_fiber', 'water'],
    methods: ['add_dry', 'add_liquid'],
    risks: [
      'lactose_sanding_risk_with_added_milk_solids',
      'flavor_dilution',
      'batch_mass_increases_check_machine_capacity',
    ],
    requiredMeasurements: [RERUN_REQUIRED],
  },
  // large ice crystals → free water poorly bound → stabilizer/fiber direction.
  icy: {
    targetMetric: 'stabilizer',
    direction: 'increase',
    leverFamilies: ['stabilizer', 'inulin_fiber'],
    methods: ['add_dry', 'add_liquid'],
    risks: ['texture_may_not_fully_recover_after_crystallization'],
    requiredMeasurements: [
      'measure_free_water_and_stabilizer_share',
      'check_storage_temperature_stability',
      RERUN_REQUIRED,
    ],
    warnings: ['crystallization_requires_verification_before_any_addition'],
  },
  // sandiness → lactose crystallization → lower lactose share of the water phase.
  sandy: {
    targetMetric: 'lactose_sanding',
    direction: 'decrease',
    leverFamilies: ['inulin_fiber', 'water'],
    methods: ['add_dry', 'add_liquid'],
    risks: ['texture_may_not_fully_recover_after_crystallization'],
    requiredMeasurements: [
      'measure_lactose_and_water_share',
      'check_storage_temperature_stability',
      RERUN_REQUIRED,
    ],
    warnings: ['crystallization_requires_verification_before_any_addition'],
  },
  // too sweet → POD high → dilute with low-sugar liquid (never more sugar).
  too_sweet: {
    targetMetric: 'pod',
    direction: 'decrease',
    leverFamilies: ['water', 'milk', 'oat_drink', 'coconut_milk_cream'],
    methods: ['add_liquid'],
    risks: ['flavor_dilution', 'batch_mass_increases_check_machine_capacity'],
    requiredMeasurements: [RERUN_REQUIRED],
  },
  // fat out of range high → dilute with a low-fat liquid.
  too_fatty: {
    targetMetric: 'fat',
    direction: 'decrease',
    leverFamilies: ['milk', 'water', 'oat_drink'],
    methods: ['add_liquid'],
    risks: ['flavor_dilution', 'batch_mass_increases_check_machine_capacity'],
    requiredMeasurements: [RERUN_REQUIRED],
  },
};

const isSupportedProfile = (p: string): boolean =>
  Object.prototype.hasOwnProperty.call(PRODUCT_PROFILE_REGISTRY, p);

const PROBLEM_VOCABULARY: ReadonlySet<string> = new Set<BatchRescueProblem>([
  'too_hard',
  'too_soft',
  'icy',
  'sandy',
  'too_sweet',
  'too_fatty',
  'serving_temperature_mismatch',
  'not_sweet_enough',
  'stabilizer_issue',
  'texture_differs_from_expected',
]);

/* ------------------------------------------------------------------------ *
 * Router                                                                     *
 * ------------------------------------------------------------------------ */

/**
 * Route one observed-batch problem to a rescue decision. Pure, deterministic,
 * mutates nothing. Check order (fixed): food safety → profile → observation
 * vocabulary → already-served → batch size → per-problem branch (with the
 * frozen / addition-method physical gates).
 */
export function routeBatchRescue(intent: BatchRescueIntent): BatchRescueResult {
  const { observation, constraints } = intent;
  const warnings: string[] = [];
  const risks: string[] = [];
  const requiredMeasurements: string[] = [];

  const trace: BatchRescueTrace = {
    batchRescueVersion: BATCH_RESCUE_VERSION,
    problem: PROBLEM_VOCABULARY.has(observation?.problem as string)
      ? (observation.problem as BatchRescueProblem)
      : null,
    branch: 'unrouted',
    profileSupported: isSupportedProfile(intent.productProfile),
    physicalState: {
      batchAlreadyFrozen: constraints?.batchAlreadyFrozen === true,
      batchAlreadyServed: constraints?.batchAlreadyServed === true,
      canReprocess: constraints?.canReprocess === true,
      liquidAdditionPossible: constraints?.liquidAdditionPossible === true,
      dryAdditionPossible: constraints?.dryAdditionPossible === true,
    },
    leversConsidered: [],
    blockedFamilies: [],
    expectedEvaluation: null,
    recipeSnapshotProvided: intent.recipeSnapshot != null,
    addOnlyPolicy: 'actual_batch_add_only',
  };

  const result = (
    decision: BatchRescueDecision,
    branch: string,
    extra: Partial<Pick<BatchRescueResult, 'recommendedActions' | 'blockedReason' | 'nextUserDecisionOptions'>> = {},
  ): BatchRescueResult => ({
    decision,
    recommendedActions: extra.recommendedActions ?? [],
    risks,
    warnings,
    requiredMeasurements,
    blockedReason: extra.blockedReason ?? null,
    nextUserDecisionOptions: extra.nextUserDecisionOptions ?? [],
    trace: { ...trace, branch },
    contractVersion: SPINE_CONTRACT_VERSION,
  });

  // 1. Food safety — FIRST, never overridden by anything else.
  if (observation?.foodSafetyConcern === true) {
    warnings.push('food_safety_concern_never_overridden');
    risks.push('contamination_risk');
    return result('discard_or_rebatch', 'food_safety', { blockedReason: 'food_safety_concern' });
  }

  // 2. Unsupported profile — reported, never remapped.
  if (!trace.profileSupported) {
    return result('not_supported', 'unsupported_profile', { blockedReason: 'unsupported_product_profile' });
  }
  const profileDef = PRODUCT_PROFILE_REGISTRY[intent.productProfile as ProductProfile];

  // 3. Observation present and inside the vocabulary?
  if (!observation || !observation.problem) {
    requiredMeasurements.push('describe_the_observed_problem');
    return result('blocked_missing_data', 'missing_observation', { blockedReason: 'missing_observation' });
  }
  if (trace.problem === null) {
    return result('not_supported', 'unknown_problem', { blockedReason: 'unknown_problem' });
  }
  const problem = trace.problem;
  const isComposition = (SUPPORTED_COMPOSITION_PROBLEMS as readonly string[]).includes(problem);
  if (!isComposition && problem !== 'serving_temperature_mismatch') {
    // honest vocabulary members that v0.1 does not route yet
    warnings.push('problem_recognized_but_not_supported_in_v01');
    return result('not_supported', 'unsupported_problem_v01', { blockedReason: 'problem_not_supported_v01' });
  }

  // 4. Already served — nothing left to rescue.
  if (trace.physicalState.batchAlreadyServed) {
    return result('not_supported', 'already_served', { blockedReason: 'batch_already_served' });
  }

  // 5. Batch size is REQUIRED (rescue math scales from it).
  if (
    intent.batchSizeG === null ||
    intent.batchSizeG === undefined ||
    !Number.isFinite(intent.batchSizeG) ||
    intent.batchSizeG <= 0
  ) {
    requiredMeasurements.push('weigh_actual_batch_g');
    return result('blocked_missing_data', 'missing_batch_size', { blockedReason: 'missing_batch_size' });
  }

  // Intended temperature outside the profile's supported set → warn (the batch
  // is physical reality; this router still advises, but flags the design gap).
  if (!(profileDef.supportsServingTemperaturesC as readonly number[]).includes(intent.intendedServingTemperatureC)) {
    warnings.push('intended_temperature_outside_supported_range');
  }

  // Optional cross-check: evaluate the EXPECTED metrics at the intended
  // temperature through the existing pure regulator evaluation.
  if (intent.expectedMetrics) {
    const evaluation = evaluateTemperatureRegulator({
      productProfile: intent.productProfile,
      servingTemperatureC: intent.intendedServingTemperatureC,
      metrics: intent.expectedMetrics,
      texturePreference: 'medium',
    });
    trace.expectedEvaluation = {
      evaluated: evaluation.evaluated,
      blockedReason: evaluation.blockedReason,
      status: evaluation.evaluated ? evaluation.status : null,
      acceptable: evaluation.evaluated ? evaluation.acceptable : null,
      hardGateFailures: evaluation.hardGateFailures,
    };
    if (evaluation.evaluated && !evaluation.acceptable) {
      // The recipe itself was already out of band — normal optimization is the
      // right tool for the NEXT batch; rescue only patches this one.
      warnings.push('expected_metrics_already_out_of_band_recipe_correction_recommended');
    } else if (
      evaluation.evaluated &&
      isComposition &&
      typeof observation.observedServingTemperatureC === 'number' &&
      Math.abs(observation.observedServingTemperatureC - intent.intendedServingTemperatureC) >= 1
    ) {
      // Recipe fine at the intended temperature, but the batch is held at a
      // different one — the temperature may explain the observed texture.
      warnings.push('serving_temperature_divergence_may_explain_observation');
    }
  }

  // 6. Serving-temperature mismatch — non-invasive; not gated by frozen state.
  if (problem === 'serving_temperature_mismatch') {
    const observed = observation.observedServingTemperatureC;
    if (observed === null || observed === undefined || !Number.isFinite(observed)) {
      requiredMeasurements.push('measure_actual_serving_temperature_c');
      return result('blocked_missing_data', 'missing_observed_temperature', {
        blockedReason: 'missing_observed_serving_temperature',
      });
    }
    const delta = intent.intendedServingTemperatureC - observed;
    if (Math.abs(delta) < 0.25) {
      warnings.push('no_temperature_divergence_detected_verify_measurement');
      requiredMeasurements.push('re_measure_serving_temperature_c');
      return result('rescue_possible', 'temperature_no_divergence');
    }
    const action: BatchRescueAction = {
      kind: 'temperature_adjustment',
      direction: delta > 0 ? 'increase' : 'decrease', // toward the intended target
      targetMetric: 'serving_temperature',
      leverFamilies: [],
      method: 'adjust_cabinet_temperature',
      addOnly: true,
      notes: [
        'adjust_cabinet_toward_intended_temperature',
        'recheck_texture_after_stabilization',
      ],
    };
    requiredMeasurements.push('re_measure_serving_temperature_after_adjustment');
    return result('rescue_possible', 'temperature_adjustment', {
      recommendedActions: [action],
      nextUserDecisionOptions: [...ACTUAL_BATCH_RESCUE_USER_DECISIONS],
    });
  }

  // 7. Composition problems — physical-state gates, then add-only direction.
  const spec = COMPOSITION_SPECS[problem as CompositionProblem];
  const allowed = new Set(profileDef.allowedCorrectionFamilies);
  const levers = spec.leverFamilies.filter((f) => allowed.has(f));
  const blockedFamilies = spec.leverFamilies.filter((f) => !allowed.has(f));
  trace.leversConsidered = levers;
  trace.blockedFamilies = blockedFamilies;

  risks.push(...spec.risks);
  warnings.push(...(spec.warnings ?? []));
  requiredMeasurements.push(...spec.requiredMeasurements);
  if (problem === 'sandy' && profileDef.disabledGates.includes('lactose_sanding')) {
    warnings.push('observed_sandiness_but_dairy_gates_disabled_for_profile');
  }

  const methodAvailable = spec.methods.find(
    (m) =>
      (m === 'add_dry' && trace.physicalState.dryAdditionPossible) ||
      (m === 'add_liquid' && trace.physicalState.liquidAdditionPossible),
  );

  const reprocessAction = (): BatchRescueAction => ({
    kind: 'reprocess_and_rebalance',
    direction: spec.direction,
    targetMetric: spec.targetMetric,
    leverFamilies: levers,
    method: 'reprocess',
    addOnly: true,
    notes: ['melt_reprocess_then_rebalance_toward_target', 'verify_with_engine_rerun_before_refreezing'],
  });

  // Frozen/hardened: additions cannot be stirred in — rescue REQUIRES reprocessing.
  if (trace.physicalState.batchAlreadyFrozen) {
    risks.push('reprocessing_affects_texture_and_overrun');
    if (!trace.physicalState.canReprocess) {
      warnings.push('reprocessing_declared_unavailable');
      risks.push('discard_or_rebatch_may_be_required');
      return result('reprocess_required', 'frozen_no_reprocess', {
        blockedReason: 'frozen_batch_cannot_take_additions',
      });
    }
    return result('reprocess_required', 'frozen_reprocess', {
      recommendedActions: [reprocessAction()],
      nextUserDecisionOptions: [...ACTUAL_BATCH_RESCUE_USER_DECISIONS],
    });
  }

  // Unfrozen but no allowed lever for this profile (defensive) or no usable
  // addition method: reprocess if possible, otherwise the honest dead end.
  if (levers.length === 0 || !methodAvailable) {
    warnings.push(levers.length === 0 ? 'no_allowed_lever_for_profile' : 'no_addition_method_available');
    if (trace.physicalState.canReprocess) {
      return result('reprocess_required', 'no_addition_path_reprocess', {
        recommendedActions: levers.length > 0 ? [reprocessAction()] : [],
      });
    }
    return result('discard_or_rebatch', 'no_addition_path', {
      blockedReason: levers.length === 0 ? 'no_allowed_lever_for_profile' : 'no_addition_method_available',
    });
  }

  // Add-only rescue with an explicit tradeoff (additions always trade something).
  const action: BatchRescueAction = {
    kind: 'add_ingredients',
    direction: spec.direction,
    targetMetric: spec.targetMetric,
    leverFamilies: levers,
    method: methodAvailable,
    addOnly: true,
    notes: [
      'add_only_never_reduce_already_added_material',
      'confirm_final_batch_volume_before_adding',
    ],
  };
  return result('rescue_with_tradeoff', 'add_only_rescue', {
    recommendedActions: [action],
    nextUserDecisionOptions: [...ACTUAL_BATCH_RESCUE_USER_DECISIONS],
  });
}
