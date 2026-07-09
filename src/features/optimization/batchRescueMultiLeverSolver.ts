/**
 * IF9 MULTI-LEVER add-only rescue expansion (Spine Slice 23) — preview only.
 *
 * WHY (the Slice 20/23 audit, kept honest): after the single-lever walk, the
 * too-hard fixture stalls with npac still below band — small fractions of the
 * remaining gap fall INSIDE the intermediate band's half-width (no violation,
 * nothing to solve) while larger aims overshoot on the per-water basis and the
 * solver's own verification rejects them. Meanwhile OTHER residual gates
 * (solids/fat/pod/water/lactose) have EXACT per-total-mass solver models that
 * verify reliably. This module therefore searches a WIDER candidate space and
 * lets the REAL engine decide:
 *
 *  - per iteration it reads the CURRENT regulator evaluation's failing hard
 *    gates (the residual rescue targets), and for each solvable gate generates
 *    add-only candidates over fractions {0.125, 0.25, 0.5, 0.75, 1.0} of the
 *    remaining gap in TWO band constructions — the centered intermediate band
 *    (Slice 20 style) and the plain TRUE regulator band (the single-shot aim,
 *    worth retrying from every new state);
 *  - every candidate is applied via the REAL solver in its `actual_batch`
 *    (add-only) context and verified OUTSIDE the solver against the TRUE
 *    regulator: `verifyOptimizationRerun` must show improvement with no new or
 *    worsened hard gate (the Golden-Middle/regression stop), and the candidate
 *    must reduce the failing-gate count or move its target metric toward the
 *    TRUE band;
 *  - the BEST verified candidate wins, deterministically: fewer hard failures
 *    → larger target-distance improvement → fewer added grams → stable
 *    name/fraction tiebreak;
 *  - hard stops, all surfaced: `target_reached` (regulator ACCEPTABLE),
 *    `no_improving_candidate` (nothing verified — nothing is forced),
 *    `diminishing_returns`, `max_steps`, `max_additions_reached` (the additive
 *    burden cap, a fraction of the ORIGINAL batch mass).
 *
 * Statuses stay honest: `calculated` ONLY when the final regulator evaluation
 * is ACCEPTABLE (every hard rescue gate passes) AND the overall original→final
 * rerun proves improvement without regression; `partial_improvement` exposes
 * only regulator-verified steps; `verification_failed` exposes no grams.
 *
 * Guarantees: add-only (no reduce path exists), positive grams only, no
 * substitution, candidates only from the solver's own catalog, inputs never
 * mutated. No DB, no Mapper, no inventory, no persistence.
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
  evaluateTemperatureRegulator,
  verifyOptimizationRerun,
  type BaseEngineMetrics,
  type NormalizedRecipeIntent,
  type RerunVerification,
} from '@/spine';
import type { RescueStepAction } from './batchRescueStepSolver';

/** Regulator gate → engine metric + adapted-metrics key (solvable gates only).
 * ice_fraction is deliberately absent: the engine solves it via the NPAC proxy. */
const SOLVABLE_GATES: Readonly<
  Record<string, { engineMetric: TargetMetric; metricsKey: keyof BaseEngineMetrics }>
> = {
  npac: { engineMetric: 'npac', metricsKey: 'npac' },
  pod: { engineMetric: 'pod', metricsKey: 'pod' },
  fat: { engineMetric: 'fat', metricsKey: 'fat' },
  total_solids: { engineMetric: 'total_solids', metricsKey: 'solids' },
  water: { engineMetric: 'water', metricsKey: 'water' },
  lactose: { engineMetric: 'lactose', metricsKey: 'lactose' },
  lactose_sanding: { engineMetric: 'lactose_sandiness_risk', metricsKey: 'lactoseSanding' },
};

export interface MultiLeverStep {
  index: number;
  /** The residual regulator gate this step targeted. */
  targetGate: string;
  engineMetric: TargetMetric;
  /** Fraction of the remaining gap used for the aim (1 = the true band itself). */
  fraction: number;
  /** 'centered' intermediate band or the plain 'true_band' aim. */
  bandStyle: 'centered' | 'true_band';
  actions: RescueStepAction[];
  addedGrams: number;
  metricValueBefore: number;
  metricValueAfter: number;
  /** Distance to the TRUE regulator band (0 = inside). */
  distanceBefore: number;
  distanceAfter: number;
  hardFailuresBefore: number;
  hardFailuresAfter: number;
  regulatorDecision: RerunVerification['decision'];
}

export type MultiLeverStatus = 'calculated' | 'partial_improvement' | 'verification_failed';
export type MultiLeverStopReason =
  | 'target_reached'
  | 'no_improving_candidate'
  | 'diminishing_returns'
  | 'max_steps'
  | 'max_additions_reached';

export interface MultiLeverRescueResult {
  attempted: true;
  status: MultiLeverStatus;
  statusReason: string | null;
  stopReason: MultiLeverStopReason;
  maxSteps: number;
  steps: MultiLeverStep[];
  /** Flat concatenation of every accepted step's actions (sum = the steps). */
  cumulativeActions: RescueStepAction[];
  totalAddedG: number;
  /** Gates the multi-lever phase attempted (solvable residual gates seen). */
  leversConsidered: string[];
  /** Hard gates still failing at the end (empty when calculated). */
  residualGates: string[];
  finalAcceptable: boolean;
  /** The stepped recipe — present only for calculated / partial_improvement. */
  finalRecipe: RecipeInput | null;
  beforeMetrics: BaseEngineMetrics;
  afterMetrics: BaseEngineMetrics | null;
  /** Overall verification: the ORIGINAL batch vs the final stepped batch. */
  finalRerun: RerunVerification | null;
  warnings: string[];
}

export interface MultiLeverRescueInput {
  /** The best recipe so far (after any verified single-lever steps). */
  recipe: RecipeInput;
  /** Metrics of the ORIGINAL batch — the overall verification baseline.
   * Defaults to the entry recipe's own metrics (direct/standalone calls). */
  overallBeforeMetrics?: BaseEngineMetrics;
  intent: NormalizedRecipeIntent;
  /** The full regulator override map (Slice 14) — the TRUE rescue targets. */
  overrideBands: Partial<Record<TargetMetric, TargetRange>>;
  fractions?: readonly number[];
  maxSteps?: number;
  /** Additive burden cap as a fraction of the ORIGINAL batch mass. */
  maxAdditionFactor?: number;
}

const DEFAULT_FRACTIONS = [0.125, 0.25, 0.5, 0.75, 1] as const;
const DEFAULT_MAX_STEPS = 6;
const DEFAULT_MAX_ADDITION_FACTOR = 0.5;
/** An accepted step must reduce a failure or move ≥ this much (else stop after it). */
const MIN_MEANINGFUL_MOVE = 0.25;

const distanceToBand = (value: number, band: TargetRange): number =>
  value < band.min ? band.min - value : value > band.max ? value - band.max : 0;

const metricValue = (metrics: BaseEngineMetrics, key: keyof BaseEngineMetrics): number | null => {
  const v = metrics[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

interface Candidate {
  gate: string;
  engineMetric: TargetMetric;
  fraction: number;
  bandStyle: 'centered' | 'true_band';
  actions: RescueStepAction[];
  addedGrams: number;
  recipe: RecipeInput;
  metrics: BaseEngineMetrics;
  rerun: RerunVerification;
  metricValueBefore: number;
  metricValueAfter: number;
  distanceBefore: number;
  distanceAfter: number;
  hardFailuresBefore: number;
  hardFailuresAfter: number;
}

/**
 * Walk the residual hard gates with the best verified add-only candidate per
 * step. Pure preview: never mutates inputs, never persists, never invents
 * grams outside the solver.
 */
export function solveBatchRescueMultiLever(input: MultiLeverRescueInput): MultiLeverRescueResult {
  const fractions = input.fractions ?? DEFAULT_FRACTIONS;
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxAdditionFactor = input.maxAdditionFactor ?? DEFAULT_MAX_ADDITION_FACTOR;
  const warnings: string[] = [];
  const steps: MultiLeverStep[] = [];
  const leversConsidered = new Set<string>();

  const beforeMetrics = adaptBaseEngineResult(calculateRecipe(input.recipe)).metrics;
  const additionCapG = input.recipe.target_batch_grams * maxAdditionFactor;

  const evalAt = (metrics: BaseEngineMetrics) =>
    evaluateTemperatureRegulator({
      productProfile: input.intent.productProfile,
      servingTemperatureC: input.intent.servingTemperatureC,
      metrics,
      texturePreference: input.intent.texturePreference,
    });

  let currentRecipe = input.recipe;
  let currentMetrics = beforeMetrics;
  let totalAddedG = 0;
  let stopReason: MultiLeverStopReason = 'max_steps';

  for (let index = 0; index < maxSteps; index++) {
    const evaluation = evalAt(currentMetrics);
    if (evaluation.evaluated && evaluation.acceptable) {
      stopReason = 'target_reached';
      break;
    }
    if (totalAddedG >= additionCapG) {
      warnings.push('additive_burden_cap_reached');
      stopReason = 'max_additions_reached';
      break;
    }

    // Residual solvable gates from the TRUE regulator evaluation.
    const residual = evaluation.hardGateFailures.filter((g) => g in SOLVABLE_GATES);
    for (const g of evaluation.hardGateFailures) {
      if (!(g in SOLVABLE_GATES)) warnings.push(`gate_not_solver_addressable:${g}`);
    }
    if (residual.length === 0) {
      stopReason = 'no_improving_candidate';
      break;
    }

    // Generate + verify every candidate; the engine decides what survives.
    const candidates: Candidate[] = [];
    for (const gate of residual) {
      leversConsidered.add(gate);
      const { engineMetric, metricsKey } = SOLVABLE_GATES[gate]!;
      const trueBand = input.overrideBands[engineMetric];
      if (!trueBand) {
        warnings.push(`no_regulator_band_for_gate:${gate}`);
        continue;
      }
      const value = metricValue(currentMetrics, metricsKey);
      if (value === null) continue;
      const distance = distanceToBand(value, trueBand);
      if (distance === 0) continue; // gate fails for reasons the band cannot express
      const halfWidth = (trueBand.max - trueBand.min) / 2;
      const trueCenter = (trueBand.min + trueBand.max) / 2;

      for (const fraction of fractions) {
        const aim = value + fraction * (trueCenter - value);
        const bandVariants: { style: 'centered' | 'true_band'; band: TargetRange }[] = [
          {
            style: 'centered',
            band:
              trueCenter > value
                ? { min: aim - halfWidth, max: Math.min(aim + halfWidth, trueBand.max) }
                : { min: Math.max(aim - halfWidth, trueBand.min), max: aim + halfWidth },
          },
          // The plain true-band aim — retried from every new state (fraction 1 only,
          // to keep the candidate set deterministic and non-redundant).
          ...(fraction === 1 ? [{ style: 'true_band' as const, band: trueBand }] : []),
        ];
        for (const { style, band } of bandVariants) {
          if (distanceToBand(value, band) === 0) continue; // no violation → nothing to solve
          const proposed = proposeAutoFix({
            input: currentRecipe,
            context: 'actual_batch', // add-only by construction
            exactCorrectionGrams: true,
            focus: [engineMetric],
            targetBandOverride: { ...input.overrideBands, [engineMetric]: band },
          });
          if (proposed.redacted || proposed.proposals.length === 0) continue;
          const proposal = proposed.proposals.find(
            (p): p is CorrectionProposal =>
              'actions' in p && p.actions.length > 0 && p.actions.every((a) => a.type === 'add' && a.grams > 0),
          );
          if (!proposal) continue;
          const applied = applyAutoFix({ input: currentRecipe, proposal, context: 'actual_batch' });
          if (!applied.success) continue;
          const addedGrams = applied.actions.reduce((sum, a) => sum + a.grams, 0);
          if (totalAddedG + addedGrams > additionCapG) continue; // additive burden cap

          const stepMetrics = adaptBaseEngineResult(calculateRecipe(applied.newInput)).metrics;
          // OUTER verification vs the TRUE regulator: improvement, no regression
          // (new/worsened hard gates reject — the Golden-Middle stop).
          const stepRerun = verifyOptimizationRerun(input.intent, currentMetrics, stepMetrics);
          if (stepRerun.decision === 'impossible') continue;
          const valueAfter = metricValue(stepMetrics, metricsKey);
          if (valueAfter === null) continue;
          const distanceAfter = distanceToBand(valueAfter, trueBand);
          const failuresBefore = stepRerun.before.hardGateFailures.length;
          const failuresAfter = stepRerun.after.hardGateFailures.length;
          // A candidate must genuinely help: fewer failing gates, or its target
          // metric moved toward the TRUE band.
          if (failuresAfter >= failuresBefore && distanceAfter >= distance) continue;

          candidates.push({
            gate,
            engineMetric,
            fraction,
            bandStyle: style,
            actions: applied.actions.map((a) => ({ type: a.type, ingredient: a.ingredient_name, grams: a.grams })),
            addedGrams,
            recipe: applied.newInput,
            metrics: stepMetrics,
            rerun: stepRerun,
            metricValueBefore: value,
            metricValueAfter: valueAfter,
            distanceBefore: distance,
            distanceAfter,
            hardFailuresBefore: failuresBefore,
            hardFailuresAfter: failuresAfter,
          });
        }
      }
    }

    if (candidates.length === 0) {
      stopReason = 'no_improving_candidate';
      break;
    }

    // Best verified candidate, deterministically (spec order):
    // fewer hard failures → larger target-distance improvement → fewer grams.
    candidates.sort(
      (a, b) =>
        a.hardFailuresAfter - b.hardFailuresAfter ||
        (b.distanceBefore - b.distanceAfter) - (a.distanceBefore - a.distanceAfter) ||
        a.addedGrams - b.addedGrams ||
        a.gate.localeCompare(b.gate) ||
        a.fraction - b.fraction ||
        a.bandStyle.localeCompare(b.bandStyle),
    );
    const best = candidates[0]!;

    steps.push({
      index,
      targetGate: best.gate,
      engineMetric: best.engineMetric,
      fraction: best.fraction,
      bandStyle: best.bandStyle,
      actions: best.actions,
      addedGrams: best.addedGrams,
      metricValueBefore: best.metricValueBefore,
      metricValueAfter: best.metricValueAfter,
      distanceBefore: best.distanceBefore,
      distanceAfter: best.distanceAfter,
      hardFailuresBefore: best.hardFailuresBefore,
      hardFailuresAfter: best.hardFailuresAfter,
      regulatorDecision: best.rerun.decision,
    });
    currentRecipe = best.recipe;
    currentMetrics = best.metrics;
    totalAddedG += best.addedGrams;

    const failureDrop = best.hardFailuresBefore - best.hardFailuresAfter;
    const distanceGain = best.distanceBefore - best.distanceAfter;
    if (failureDrop <= 0 && distanceGain < MIN_MEANINGFUL_MOVE) {
      // Verified but marginal — keep the step, stop the walk honestly.
      warnings.push('diminishing_returns_step_kept_walk_stopped');
      stopReason = 'diminishing_returns';
      break;
    }
  }

  const cumulativeActions = steps.flatMap((s) => s.actions);
  const finalEvaluation = evalAt(currentMetrics);
  const residualGates = finalEvaluation.hardGateFailures;
  const finalAcceptable = finalEvaluation.evaluated && finalEvaluation.acceptable;
  if (stopReason === 'max_steps' && finalAcceptable) stopReason = 'target_reached';

  if (steps.length === 0) {
    if (finalAcceptable) {
      // The entry state already passes every hard gate — nothing to add.
      return {
        attempted: true,
        status: 'calculated',
        statusReason: 'already_acceptable_no_steps_needed',
        stopReason: 'target_reached',
        maxSteps,
        steps,
        cumulativeActions,
        totalAddedG,
        leversConsidered: [...leversConsidered],
        residualGates,
        finalAcceptable,
        finalRecipe: input.recipe,
        beforeMetrics,
        afterMetrics: beforeMetrics,
        finalRerun: null,
        warnings,
      };
    }
    return {
      attempted: true,
      status: 'verification_failed',
      statusReason: 'no_improving_candidate_verified',
      stopReason,
      maxSteps,
      steps,
      cumulativeActions,
      totalAddedG,
      leversConsidered: [...leversConsidered],
      residualGates,
      finalAcceptable,
      finalRecipe: null,
      beforeMetrics,
      afterMetrics: null,
      finalRerun: null,
      warnings,
    };
  }

  // Overall verification: the ORIGINAL batch vs the final stepped batch.
  const finalRerun = verifyOptimizationRerun(
    input.intent,
    input.overallBeforeMetrics ?? beforeMetrics,
    currentMetrics,
  );
  const improvedWithoutRegression = finalRerun.decision === 'optimized' || finalRerun.decision === 'tradeoff';

  if (!improvedWithoutRegression) {
    warnings.push('overall_verification_failed_no_grams_exposed');
    return {
      attempted: true,
      status: 'verification_failed',
      statusReason: 'overall_rerun_shows_no_genuine_improvement',
      stopReason,
      maxSteps,
      steps,
      cumulativeActions: [],
      totalAddedG,
      leversConsidered: [...leversConsidered],
      residualGates,
      finalAcceptable,
      finalRecipe: null,
      beforeMetrics,
      afterMetrics: currentMetrics,
      finalRerun,
      warnings,
    };
  }

  if (finalAcceptable) {
    // EVERY hard rescue gate passes and the overall rerun proves it.
    return {
      attempted: true,
      status: 'calculated',
      statusReason: null,
      stopReason,
      maxSteps,
      steps,
      cumulativeActions,
      totalAddedG,
      leversConsidered: [...leversConsidered],
      residualGates,
      finalAcceptable,
      finalRecipe: currentRecipe,
      beforeMetrics,
      afterMetrics: currentMetrics,
      finalRerun,
      warnings,
    };
  }

  warnings.push('not_fully_rescued_residual_gates_remain');
  return {
    attempted: true,
    status: 'partial_improvement',
    statusReason: 'residual_gates_remain',
    stopReason,
    maxSteps,
    steps,
    cumulativeActions,
    totalAddedG,
    leversConsidered: [...leversConsidered],
    residualGates,
    finalAcceptable,
    finalRecipe: currentRecipe,
    beforeMetrics,
    afterMetrics: currentMetrics,
    finalRerun,
    warnings,
  };
}
