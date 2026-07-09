/**
 * IF9 multi-step ADD-ONLY rescue solver (Spine Slice 20) — preview only.
 *
 * WHY THIS EXISTS (the Slice 19 finding, kept honest): the correction solver
 * sizes NPAC moves with a per-batch model while real NPAC is per-water-mass, so
 * a single-shot solve aimed at a far regulator band overshoots and the solver's
 * own Golden-Middle verification rejects it (`solver_found_no_safe_add_only_
 * correction`). The engine is right to refuse; the fix is NOT to bypass it but
 * to ask it for SMALLER, individually-verified steps.
 *
 * HOW: per step, an INTERMEDIATE target band is derived by moving the band
 * center a fraction of the REMAINING gap toward the true regulator center
 * (fractions tried smallest-first: 25% → 50% → 75% → 100%). The band is handed
 * to the REAL solver through the Slice-14 `targetBandOverride` — the solver
 * still picks candidates from its own catalog, sizes exact grams, applies them
 * add-only (`actual_batch` context), and re-verifies internally. The applied
 * step is then verified OUTSIDE the solver against the TRUE regulator
 * (`verifyOptimizationRerun` at the intended serving temperature): a step is
 * kept only when the regulator confirms genuine improvement with no new or
 * worsened hard-gate failure.
 *
 * Hard stops (all surfaced in `stopReason`):
 *  - target_reached        — the targeted metric entered its TRUE regulator band;
 *  - no_improving_step     — no fraction produced a solver-valid, regulator-
 *                            verified improvement (stop; nothing is forced);
 *  - diminishing_returns   — the accepted step moved the metric less than the
 *                            minimum meaningful distance (kept, then stopped);
 *  - max_steps             — the bounded step budget is spent.
 *
 * Guarantees: add-only (no reduce action can exist — `actual_batch` context +
 * an explicit all-`add` filter), no negative grams, no substitution, no invented
 * compositions (candidates only from the solver catalog), inputs never mutated,
 * `calculated` only when the final rerun PROVES the targeted metric is in band
 * with improvement and no regression. No DB, no Mapper, no inventory, no save.
 */
import {
  applyAutoFix,
  calculateRecipe,
  proposeAutoFix,
  type CorrectionProposal,
  type RecipeInput,
  type TargetMetric,
  type TargetRange,
} from '@/engine';
import {
  adaptBaseEngineResult,
  verifyOptimizationRerun,
  type BaseEngineMetrics,
  type NormalizedRecipeIntent,
  type RerunVerification,
} from '@/spine';

export interface RescueStepAction {
  type: string;
  ingredient: string;
  grams: number;
}

export interface RescueStep {
  index: number;
  /** Fraction of the remaining gap this step's intermediate target used. */
  fraction: number;
  intermediateBand: TargetRange;
  actions: RescueStepAction[];
  metricValueBefore: number;
  metricValueAfter: number;
  /** Distance to the TRUE regulator band (0 = inside). */
  distanceBefore: number;
  distanceAfter: number;
  /** Per-step TRUE-regulator verification decision (optimized | tradeoff). */
  regulatorDecision: RerunVerification['decision'];
  scoreBefore: number;
  scoreAfter: number;
}

export type MultiStepRescueStatus = 'calculated' | 'partial_improvement' | 'verification_failed';
export type MultiStepStopReason =
  | 'target_reached'
  | 'no_improving_step'
  | 'diminishing_returns'
  | 'max_steps';

export interface MultiStepRescueResult {
  attempted: true;
  status: MultiStepRescueStatus;
  statusReason: string | null;
  stopReason: MultiStepStopReason;
  maxSteps: number;
  fractions: readonly number[];
  steps: RescueStep[];
  /** Flat concatenation of every accepted step's actions (sum = the steps). */
  cumulativeActions: RescueStepAction[];
  /** The stepped recipe — present only for calculated / partial_improvement. */
  finalRecipe: RecipeInput | null;
  beforeMetrics: BaseEngineMetrics;
  /** Metrics after each accepted step (the last one = afterMetrics). */
  intermediateMetrics: BaseEngineMetrics[];
  afterMetrics: BaseEngineMetrics | null;
  /** Overall verification: original batch vs the final stepped batch. */
  finalRerun: RerunVerification | null;
  warnings: string[];
}

export interface MultiStepRescueInput {
  recipe: RecipeInput;
  intent: NormalizedRecipeIntent;
  /** The engine metric being rescued (focus of every step's solve). */
  engineMetric: TargetMetric;
  /** The rescue action's direction — every step must move the metric this way. */
  direction: 'increase' | 'decrease';
  /** The adapted-metrics key carrying that metric's value. */
  metricsKey: keyof BaseEngineMetrics;
  /** The TRUE regulator band for the metric (the target of the whole rescue). */
  trueBand: TargetRange;
  /** The full regulator override map (Slice 14) — other metrics keep their bands. */
  overrideBands: Partial<Record<TargetMetric, TargetRange>>;
  /** Fractions of the remaining gap tried per step, smallest first. */
  fractions?: readonly number[];
  maxSteps?: number;
}

const DEFAULT_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;
const DEFAULT_MAX_STEPS = 4;
/** An accepted step must move the metric at least this much (else stop after it). */
const MIN_MEANINGFUL_MOVE = 0.25;

const distanceToBand = (value: number, band: TargetRange): number =>
  value < band.min ? band.min - value : value > band.max ? value - band.max : 0;

const metricValue = (metrics: BaseEngineMetrics, key: keyof BaseEngineMetrics): number | null => {
  const v = metrics[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Walk the gap in solver-sized, regulator-verified add-only steps. Pure preview:
 * never mutates the input recipe (every step re-applies onto a fresh engine
 * apply result), never persists, never invents grams outside the solver.
 */
export function solveBatchRescueSteps(input: MultiStepRescueInput): MultiStepRescueResult {
  const fractions = input.fractions ?? DEFAULT_FRACTIONS;
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const warnings: string[] = [];
  const steps: RescueStep[] = [];
  const intermediateMetrics: BaseEngineMetrics[] = [];

  const beforeMetrics = adaptBaseEngineResult(calculateRecipe(input.recipe)).metrics;
  const halfWidth = (input.trueBand.max - input.trueBand.min) / 2;
  const trueCenter = (input.trueBand.min + input.trueBand.max) / 2;

  let currentRecipe = input.recipe;
  let currentMetrics = beforeMetrics;
  let stopReason: MultiStepStopReason = 'max_steps';

  const startValue = metricValue(beforeMetrics, input.metricsKey);
  if (startValue === null) {
    return {
      attempted: true,
      status: 'verification_failed',
      statusReason: 'metric_value_unavailable',
      stopReason: 'no_improving_step',
      maxSteps,
      fractions,
      steps,
      cumulativeActions: [],
      finalRecipe: null,
      beforeMetrics,
      intermediateMetrics,
      afterMetrics: null,
      finalRerun: null,
      warnings,
    };
  }

  for (let index = 0; index < maxSteps; index++) {
    const value = metricValue(currentMetrics, input.metricsKey);
    if (value === null) {
      warnings.push('metric_value_lost_mid_walk');
      stopReason = 'no_improving_step';
      break;
    }
    const distance = distanceToBand(value, input.trueBand);
    if (distance === 0) {
      stopReason = 'target_reached';
      break;
    }
    // The walk only ever moves in the rescue action's declared direction.
    const gapSignMatchesDirection = input.direction === 'increase' ? trueCenter > value : trueCenter < value;
    if (!gapSignMatchesDirection) {
      warnings.push('direction_mismatch_walk_refused');
      stopReason = 'no_improving_step';
      break;
    }

    // Try fractions smallest-first: the SMALLEST verified improvement wins.
    let accepted: RescueStep | null = null;
    let acceptedRecipe: RecipeInput | null = null;
    let acceptedMetrics: BaseEngineMetrics | null = null;

    for (const fraction of fractions) {
      const gap = trueCenter - value;
      const intermediateCenter = value + fraction * gap;
      // Intermediate band: true width, centered on the fractional target, never
      // extending past the true band on the far side (no overshoot invitation).
      const intermediateBand: TargetRange =
        gap > 0
          ? { min: intermediateCenter - halfWidth, max: Math.min(intermediateCenter + halfWidth, input.trueBand.max) }
          : { min: Math.max(intermediateCenter - halfWidth, input.trueBand.min), max: intermediateCenter + halfWidth };

      // The current value must be OUTSIDE the intermediate band for the solver
      // to see a violation; otherwise this fraction is too small — try larger.
      if (distanceToBand(value, intermediateBand) === 0) continue;

      const proposed = proposeAutoFix({
        input: currentRecipe,
        context: 'actual_batch', // add-only by construction
        exactCorrectionGrams: true,
        focus: [input.engineMetric],
        targetBandOverride: { ...input.overrideBands, [input.engineMetric]: intermediateBand },
      });
      if (proposed.redacted || proposed.proposals.length === 0) continue;
      const proposal = proposed.proposals.find(
        (p): p is CorrectionProposal =>
          'actions' in p && p.actions.length > 0 && p.actions.every((a) => a.type === 'add' && a.grams > 0),
      );
      if (!proposal) continue;

      const applied = applyAutoFix({ input: currentRecipe, proposal, context: 'actual_batch' });
      if (!applied.success) continue;

      const stepMetrics = adaptBaseEngineResult(calculateRecipe(applied.newInput)).metrics;
      // TRUE-regulator verification of this single step: improvement, no regression.
      const stepRerun = verifyOptimizationRerun(input.intent, currentMetrics, stepMetrics);
      if (stepRerun.decision === 'impossible') continue; // worsens or no gain — try another fraction

      const valueAfter = metricValue(stepMetrics, input.metricsKey);
      if (valueAfter === null) continue;
      const distanceAfter = distanceToBand(valueAfter, input.trueBand);
      if (distanceAfter >= distance) continue; // must move TOWARD the true band
      const movedInDirection = input.direction === 'increase' ? valueAfter > value : valueAfter < value;
      if (!movedInDirection) continue; // must move the DECLARED way, never opposite

      accepted = {
        index,
        fraction,
        intermediateBand,
        actions: applied.actions.map((a) => ({ type: a.type, ingredient: a.ingredient_name, grams: a.grams })),
        metricValueBefore: value,
        metricValueAfter: valueAfter,
        distanceBefore: distance,
        distanceAfter,
        regulatorDecision: stepRerun.decision,
        scoreBefore: stepRerun.before.score,
        scoreAfter: stepRerun.after.score,
      };
      acceptedRecipe = applied.newInput;
      acceptedMetrics = stepMetrics;
      break; // smallest verified fraction taken
    }

    if (!accepted || !acceptedRecipe || !acceptedMetrics) {
      stopReason = 'no_improving_step';
      break;
    }

    steps.push(accepted);
    intermediateMetrics.push(acceptedMetrics);
    currentRecipe = acceptedRecipe;
    currentMetrics = acceptedMetrics;

    if (distanceToBand(accepted.metricValueAfter, input.trueBand) === 0) {
      stopReason = 'target_reached';
      break;
    }
    if (accepted.distanceBefore - accepted.distanceAfter < MIN_MEANINGFUL_MOVE) {
      // Verified but marginal — keep the step, stop the walk honestly.
      warnings.push('diminishing_returns_step_kept_walk_stopped');
      stopReason = 'diminishing_returns';
      break;
    }
  }

  const cumulativeActions = steps.flatMap((s) => s.actions);

  if (steps.length === 0) {
    return {
      attempted: true,
      status: 'verification_failed',
      statusReason: 'no_step_candidate_verified',
      stopReason,
      maxSteps,
      fractions,
      steps,
      cumulativeActions,
      finalRecipe: null,
      beforeMetrics,
      intermediateMetrics,
      afterMetrics: null,
      finalRerun: null,
      warnings,
    };
  }

  // Overall verification: the ORIGINAL batch vs the final stepped batch.
  const afterMetrics = currentMetrics;
  const finalRerun = verifyOptimizationRerun(input.intent, beforeMetrics, afterMetrics);
  const finalValue = metricValue(afterMetrics, input.metricsKey);
  const finalDistance = finalValue === null ? Number.POSITIVE_INFINITY : distanceToBand(finalValue, input.trueBand);
  const improvedWithoutRegression = finalRerun.decision === 'optimized' || finalRerun.decision === 'tradeoff';

  if (finalDistance === 0 && improvedWithoutRegression) {
    return {
      attempted: true,
      status: 'calculated',
      statusReason: null,
      stopReason,
      maxSteps,
      fractions,
      steps,
      cumulativeActions,
      finalRecipe: currentRecipe,
      beforeMetrics,
      intermediateMetrics,
      afterMetrics,
      finalRerun,
      warnings,
    };
  }

  if (!improvedWithoutRegression) {
    // Defensive: every step verified individually, but the overall rerun must
    // ALSO prove it — otherwise no grams are exposed (steps stay in the trace).
    warnings.push('overall_verification_failed_no_grams_exposed');
    return {
      attempted: true,
      status: 'verification_failed',
      statusReason: 'overall_rerun_shows_no_genuine_improvement',
      stopReason,
      maxSteps,
      fractions,
      steps,
      cumulativeActions: [],
      finalRecipe: null,
      beforeMetrics,
      intermediateMetrics,
      afterMetrics,
      finalRerun,
      warnings,
    };
  }

  warnings.push('not_fully_rescued_residual_gates_remain');
  return {
    attempted: true,
    status: 'partial_improvement',
    statusReason: 'targeted_metric_still_outside_band',
    stopReason,
    maxSteps,
    fractions,
    steps,
    cumulativeActions,
    finalRecipe: currentRecipe,
    beforeMetrics,
    intermediateMetrics,
    afterMetrics,
    finalRerun,
    warnings,
  };
}
