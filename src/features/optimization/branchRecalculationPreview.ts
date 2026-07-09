/**
 * IF9/IF10 exact-recalculation PREVIEW (Spine Slice 19) — the NON-spine
 * orchestration that connects the pure batch-rescue (IF9) and stock-shortage
 * (IF10) routers to the REAL engine, preview-only.
 *
 * Exact numbers are attempted ONLY where they can be verified safely:
 *  - IF9: a feasible, ADD-ONLY compositional rescue (unfrozen, addition method
 *    available, no outstanding physical measurements) is solved by the REAL
 *    correction solver in its `actual_batch` context (add-only by construction)
 *    with the Slice-14 `targetBandOverride` aiming at the Temperature Regulator
 *    band for the recipe's profile × temperature; the corrected recipe is
 *    re-run through the REAL `calculateRecipe` and verified through the
 *    Temperature Regulator (`verifyOptimizationRerun`). If verification fails,
 *    NO grams are exposed and nothing claims "rescued".
 *  - IF10: a scale-down is previewed exactly because uniform scaling is safe
 *    linear math (all composition percentages — hence all band verdicts — are
 *    unchanged); the scaled snapshot is STILL verified by re-running the real
 *    engine and comparing regulator evaluations. Substitution exact solves are
 *    NOT attempted in v0.1 (the shortage contract carries safety flags, not a
 *    verified composition) — reported as `not_attempted` with the required
 *    next calculation, never faked.
 *
 * Anything else — frozen batches, food-safety concerns, temperature
 * adjustments, purchase/reformulation strategies, safety-blocked substitutes —
 * never produces numbers: the status says why.
 *
 * Pure preview: no external DB, no Mapper, no inventory read/write, no recipe
 * save, no input mutation. Nothing here applies anything.
 */
import {
  applyAutoFix,
  calculateRecipe,
  proposeAutoFix,
  type CorrectionProposal,
  type RecipeInput,
  type TargetMetric,
} from '@/engine';
import {
  adaptBaseEngineResult,
  evaluateTemperatureRegulator,
  routeBatchRescue,
  routeStockShortage,
  verifyOptimizationRerun,
  type BaseEngineMetrics,
  type BatchRescueIntent,
  type BatchRescueResult,
  type ProductProfile,
  type RerunVerification,
  type ServingTemperatureC,
  type StockShortageIntent,
  type StockShortageResult,
} from '@/spine';
import { studioIntentFromRecipe } from './optimizationPreviewRunner';
import { regulatorTargetOverride } from './solverTargetInjection';

export type ExactPreviewStatus =
  | 'not_attempted'
  | 'calculated'
  | 'blocked_missing_data'
  | 'unsafe'
  | 'verification_failed'
  | 'not_supported';

export interface ExactPreviewAction {
  type: string;
  ingredient: string;
  grams: number;
}

export interface BranchRecalculationPreview {
  branch: 'actual_batch_rescue' | 'stock_shortage';
  /** The pure branch router's decision (IF9 or IF10) — authoritative. */
  routeDecision: string;
  batchRescue: BatchRescueResult | null;
  stockShortage: StockShortageResult | null;

  exactStatus: ExactPreviewStatus;
  exactStatusReason: string | null;
  /** Solver-verified add-only actions (IF9). Present ONLY when `calculated`. */
  exactActions: readonly ExactPreviewAction[];
  /** Deterministic batch scale ratio (IF10). Present ONLY when `calculated`. */
  scaleFactor: number | null;
  /** The corrected/scaled recipe (opaque preview, never saved) — ONLY when `calculated`. */
  proposedRecipeSnapshot: unknown | null;

  beforeMetrics: BaseEngineMetrics | null;
  afterMetrics: BaseEngineMetrics | null;
  /** IF9: the Temperature Regulator before/after verification of the solve. */
  rerun: RerunVerification | null;
  /** IF10: scaled metrics matched and the regulator verdict was preserved. */
  scaleVerified: boolean | null;

  warnings: string[];
  trace: {
    solverInvoked: boolean;
    targetOverrideActive: boolean;
    injectedMetrics: readonly string[];
  };
}

/* ------------------------------------------------------------------------ *
 * Shared helpers                                                             *
 * ------------------------------------------------------------------------ */

/** Rescue gate id → engine target metric (only compositional gates map). */
const GATE_TO_ENGINE_METRIC: Readonly<Record<string, TargetMetric>> = {
  npac: 'npac',
  pod: 'pod',
  fat: 'fat',
  total_solids: 'total_solids',
  water: 'water',
  lactose_sanding: 'lactose_sandiness_risk',
};

/** The one requiredMeasurement that IS this preview (the engine rerun). */
const RERUN_MEASUREMENT = 'rerun_base_engine_with_planned_addition_before_adding';

/** IF10 substitution block reasons that make the shortage UNSAFE (vs merely infeasible). */
const SAFETY_BLOCK_REASONS: ReadonlySet<string> = new Set([
  'dairy_substitute_forbidden_for_profile',
  'allergen_substitution_requires_explicit_approval',
  'alcohol_substitution_requires_explicit_approval',
  'sweetener_polyol_his_substitution_requires_supported_rule',
  'substitute_data_not_verified',
]);

const emptyTrace = () => ({ solverInvoked: false, targetOverrideActive: false, injectedMetrics: [] as string[] });

/* ------------------------------------------------------------------------ *
 * IF9 — Actual Batch Rescue exact preview                                    *
 * ------------------------------------------------------------------------ */

export interface BatchRescueRecalculationInput {
  rescueIntent: BatchRescueIntent;
  /** The actual batch expressed as the engine's RecipeInput — never mutated. */
  actualRecipe: RecipeInput;
}

export function previewBatchRescueRecalculation(
  input: BatchRescueRecalculationInput,
): BranchRecalculationPreview {
  const route = routeBatchRescue(input.rescueIntent);
  const warnings: string[] = [];

  const base: BranchRecalculationPreview = {
    branch: 'actual_batch_rescue',
    routeDecision: route.decision,
    batchRescue: route,
    stockShortage: null,
    exactStatus: 'not_attempted',
    exactStatusReason: null,
    exactActions: [],
    scaleFactor: null,
    proposedRecipeSnapshot: null,
    beforeMetrics: null,
    afterMetrics: null,
    rerun: null,
    scaleVerified: null,
    warnings,
    trace: emptyTrace(),
  };
  const done = (status: ExactPreviewStatus, reason: string | null, extra: Partial<BranchRecalculationPreview> = {}) => ({
    ...base,
    ...extra,
    exactStatus: status,
    exactStatusReason: reason,
  });

  // Route-level outcomes that must never produce numbers.
  if (route.decision === 'blocked_missing_data') return done('blocked_missing_data', route.blockedReason);
  if (route.decision === 'not_supported') return done('not_supported', route.blockedReason);
  if (route.decision === 'discard_or_rebatch') {
    return route.blockedReason === 'food_safety_concern'
      ? done('unsafe', 'food_safety_never_calculated')
      : done('not_attempted', 'no_rescue_path_nothing_to_calculate');
  }
  if (route.decision === 'reprocess_required') {
    // Frozen / no addition path — additions cannot be stirred in; grams here would be fake.
    return done('not_attempted', 'reprocess_required_no_addition_grams');
  }

  const action = route.recommendedActions[0];
  if (!action) return done('not_attempted', 'no_action_recommended');
  if (action.kind !== 'add_ingredients') {
    // e.g. temperature adjustment — non-compositional; the action itself is the answer.
    return done('not_attempted', 'non_compositional_action');
  }
  const outstanding = route.requiredMeasurements.filter((m) => m !== RERUN_MEASUREMENT);
  if (outstanding.length > 0) {
    // icy/sandy demand physical measurements BEFORE any addition — never precompute.
    return done('not_attempted', 'physical_measurements_required_first');
  }
  const engineMetric = GATE_TO_ENGINE_METRIC[action.targetMetric];
  if (!engineMetric) return done('not_attempted', 'no_engine_metric_for_gate');

  // Solve with the REAL solver: actual_batch context (add-only by construction),
  // focused on the rescue metric, aiming at the regulator band via Slice 14.
  const override = regulatorTargetOverride(
    input.rescueIntent.productProfile,
    input.rescueIntent.intendedServingTemperatureC,
  );
  const trace = {
    solverInvoked: true,
    targetOverrideActive: override.active,
    injectedMetrics: override.injectedMetrics as readonly string[],
  };
  const proposed = proposeAutoFix({
    input: input.actualRecipe,
    context: 'actual_batch',
    exactCorrectionGrams: true,
    focus: [engineMetric],
    targetBandOverride: override.active ? override.bands : undefined,
  });
  if (proposed.redacted) return done('not_attempted', 'solver_redacted', { trace });
  if (proposed.proposals.length === 0) {
    return done('not_attempted', 'no_violation_detected_for_target_metric', { trace });
  }
  const proposal = proposed.proposals.find(
    (p): p is CorrectionProposal =>
      'actions' in p && p.actions.length > 0 && p.actions.every((a) => a.type === 'add'),
  );
  if (!proposal) return done('not_attempted', 'solver_found_no_safe_add_only_correction', { trace });

  const applied = applyAutoFix({ input: input.actualRecipe, proposal, context: 'actual_batch' });
  if (!applied.success) return done('not_attempted', `apply_failed:${applied.reason}`, { trace });

  const before = calculateRecipe(input.actualRecipe);
  const after = calculateRecipe(applied.newInput);
  const beforeMetrics = adaptBaseEngineResult(before).metrics;
  const afterMetrics = adaptBaseEngineResult(after).metrics;

  // Verify through the Temperature Regulator at the INTENDED serving temperature.
  const intent = {
    ...studioIntentFromRecipe(input.actualRecipe),
    productProfile: input.rescueIntent.productProfile as ProductProfile,
    servingTemperatureC: input.rescueIntent.intendedServingTemperatureC as ServingTemperatureC,
  };
  const rerun = verifyOptimizationRerun(intent, beforeMetrics, afterMetrics);

  if (rerun.decision === 'impossible') {
    // The solve did not genuinely improve the batch — NO grams are exposed and
    // nothing claims rescued; the rerun is kept for transparency.
    warnings.push('rescue_verification_failed_no_grams_exposed');
    return done('verification_failed', 'rerun_shows_no_genuine_improvement', {
      beforeMetrics,
      afterMetrics,
      rerun,
      trace,
    });
  }

  return done('calculated', null, {
    exactActions: applied.actions.map((a) => ({ type: a.type, ingredient: a.ingredient_name, grams: a.grams })),
    proposedRecipeSnapshot: applied.newInput,
    beforeMetrics,
    afterMetrics,
    rerun,
    trace,
  });
}

/* ------------------------------------------------------------------------ *
 * IF10 — Stock Shortage exact preview                                        *
 * ------------------------------------------------------------------------ */

export interface StockShortageRecalculationInput {
  shortageIntent: StockShortageIntent;
  /** The PLANNED recipe (no actual grams) — never mutated. */
  plannedRecipe: RecipeInput;
}

const CLOSENESS = 0.05; // percentage-point tolerance for ratio metrics under scaling

export function previewStockShortageRecalculation(
  input: StockShortageRecalculationInput,
): BranchRecalculationPreview {
  const route = routeStockShortage(input.shortageIntent);
  const warnings: string[] = [];

  const base: BranchRecalculationPreview = {
    branch: 'stock_shortage',
    routeDecision: route.decision,
    batchRescue: null,
    stockShortage: route,
    exactStatus: 'not_attempted',
    exactStatusReason: null,
    exactActions: [],
    scaleFactor: null,
    proposedRecipeSnapshot: null,
    beforeMetrics: null,
    afterMetrics: null,
    rerun: null,
    scaleVerified: null,
    warnings,
    trace: emptyTrace(),
  };
  const done = (status: ExactPreviewStatus, reason: string | null, extra: Partial<BranchRecalculationPreview> = {}) => ({
    ...base,
    ...extra,
    exactStatus: status,
    exactStatusReason: reason,
  });

  if (route.decision === 'blocked_missing_data') return done('blocked_missing_data', route.blockedReason);
  if (route.decision === 'not_supported') return done('not_supported', route.blockedReason);
  if (route.decision === 'production_blocked') {
    const safetyBlocked = route.trace.lineAssessments.some((a) =>
      a.substitutionBlockedReasons.some((r) => SAFETY_BLOCK_REASONS.has(r)),
    );
    return safetyBlocked
      ? done('unsafe', 'substitution_safety_blocked_never_calculated')
      : done('not_attempted', 'no_feasible_strategy_nothing_to_calculate');
  }
  if (route.decision === 'substitution_possible') {
    // The v0.1 shortage contract carries safety FLAGS, not a verified composition —
    // an exact substitute solve without the composition would be fake.
    return done('not_attempted', 'substitute_composition_not_in_contract_v01');
  }
  if (route.decision === 'purchase_required' || route.decision === 'reformulation_required') {
    return done('not_attempted', 'nothing_to_calculate_for_strategy');
  }

  // scale_down_possible — deterministic uniform scaling, then VERIFY it.
  const action = route.recommendedActions.find((a) => a.kind === 'scale_batch_down');
  if (!action || action.scaleFactor === null || !(action.scaleFactor > 0)) {
    return done('not_attempted', 'no_scale_factor_available');
  }
  if (input.plannedRecipe.items.some((i) => i.actual_grams !== null)) {
    // A batch with actual grams is PRODUCTION — that is IF9's territory.
    return done('not_attempted', 'actual_batch_present_use_batch_rescue');
  }

  const factor = action.scaleFactor;
  const scaled: RecipeInput = {
    ...input.plannedRecipe,
    items: input.plannedRecipe.items.map((item) => ({ ...item, planned_grams: item.planned_grams * factor })),
    target_batch_grams: input.plannedRecipe.target_batch_grams * factor,
  };

  const before = calculateRecipe(input.plannedRecipe);
  const after = calculateRecipe(scaled);
  const beforeMetrics = adaptBaseEngineResult(before).metrics;
  const afterMetrics = adaptBaseEngineResult(after).metrics;

  // Uniform scaling must keep every ratio metric (and the regulator verdict) unchanged.
  const ratioKeys: (keyof BaseEngineMetrics)[] = ['npac', 'pod', 'iceFraction', 'water', 'solids'];
  const metricsClose = ratioKeys.every((k) => {
    const b = beforeMetrics[k];
    const a = afterMetrics[k];
    return typeof b === 'number' && typeof a === 'number' && Math.abs(b - a) <= CLOSENESS;
  });
  const evalAt = (metrics: BaseEngineMetrics) =>
    evaluateTemperatureRegulator({
      productProfile: input.shortageIntent.productProfile,
      servingTemperatureC: input.plannedRecipe.target_temperature_c,
      metrics,
      texturePreference: 'medium',
    });
  const evalBefore = evalAt(beforeMetrics);
  const evalAfter = evalAt(afterMetrics);
  const verdictPreserved =
    evalBefore.status === evalAfter.status && evalBefore.acceptable === evalAfter.acceptable;
  const scaleVerified = metricsClose && verdictPreserved;

  if (!scaleVerified) {
    warnings.push('scale_verification_failed_no_snapshot_exposed');
    return done('verification_failed', 'scaled_metrics_or_verdict_diverged', {
      beforeMetrics,
      afterMetrics,
      scaleVerified: false,
    });
  }

  return done('calculated', null, {
    scaleFactor: factor,
    proposedRecipeSnapshot: scaled,
    beforeMetrics,
    afterMetrics,
    scaleVerified: true,
  });
}
