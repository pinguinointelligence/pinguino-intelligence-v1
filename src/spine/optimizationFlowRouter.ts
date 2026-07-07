/**
 * PINGUINO Spine — Optimizer routing over the Integration Flow tradeoff branch
 * (Phase C Slice 7).
 *
 * A PURE, unwired routing layer that sits between the Integration Flow Router
 * (Slice 6) and the real deterministic gram solver (src/engine/corrections/*,
 * which this module never imports and never replaces). It:
 *   1. consumes the router decision + the correction goals the Temperature
 *      Regulator surfaced,
 *   2. turns each HARD-gate goal into a deterministic, profile-gated correction
 *      plan (target metric, direction, allowed ingredient classes, Golden Middle
 *      priority, feasibility) — rejecting any goal with no allowed lever,
 *   3. optionally VERIFIES a hypothetical corrected-metric set by re-evaluating
 *      it through the Temperature Regulator (the rerun-verification seam), and
 *   4. returns one decision: optimized / tradeoff / impossible / blocked /
 *      no_action_needed.
 *
 * It never mutates its inputs, never recalculates the recipe (the real Base
 * Engine re-run is later wiring), never calls a DB / Supabase / Mapper, and
 * never writes ingredient data. Correction families come from the Designer's
 * `DesignerOptimizerConstraints`; the priority order and the "advisory is a
 * warning, never a hard correction" rule come from the locked Optimizer.md
 * (§10 Golden Middle, §11 hard safety, §12 idempotence, §13 verification).
 */
import type { RecipeDesignPlan, DesignerOptimizerConstraints } from './designRecipe';
import {
  evaluateTemperatureRegulator,
  type BaseEngineMetrics,
  type CorrectionGoal,
  type TemperatureRegulatorEvaluation,
} from './evaluateTemperatureRegulator';
import type { IntegrationFlowResult } from './integrationFlowRouter';
import type { CorrectionFamily } from './productProfiles';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type SpineContractVersion,
} from './types';

export type OptimizationFlowVersion = '0.1.0';
export const OPTIMIZATION_FLOW_VERSION: OptimizationFlowVersion = '0.1.0';

/** The five decisions this routing layer produces (Optimizer.md §8 subset). */
export type OptimizationDecision =
  | 'optimized'
  | 'tradeoff'
  | 'impossible'
  | 'blocked'
  | 'no_action_needed';

export type CorrectionDirection = 'increase' | 'decrease' | 'move_into_band' | 'restore';

/** A deterministic, profile-gated correction plan — direction only, never grams. */
export interface CorrectionPlan {
  goal: CorrectionGoal;
  targetMetric: string;
  direction: CorrectionDirection;
  /** Allowed lever families for this goal ∩ the profile's allowed families. */
  affectedIngredientClasses: CorrectionFamily[];
  /** Golden Middle priority (Optimizer.md §10) — lower = more important. */
  goldenMiddleRank: number;
  feasibility: 'feasible' | 'approximate';
  constraintReason: string;
  warnings: string[];
}

export type RejectedCorrectionReason =
  | 'no_allowed_lever'
  | 'advisory_only'
  | 'unsupported_goal';

export interface RejectedCorrection {
  goal: CorrectionGoal;
  targetMetric: string;
  reason: RejectedCorrectionReason;
  /** The lever families this goal needs that the profile does not allow. */
  blockedFamilies: CorrectionFamily[];
}

/** Pure rerun-verification seam output (Optimizer.md §13 — verify by re-evaluation). */
export interface RerunVerification {
  before: {
    acceptable: boolean;
    status: TemperatureRegulatorEvaluation['status'];
    hardGateFailures: string[];
    score: number;
  };
  after: {
    acceptable: boolean;
    status: TemperatureRegulatorEvaluation['status'];
    hardGateFailures: string[];
    score: number;
  };
  improvementDetected: boolean;
  /** Hard gates that FAILED after the correction but not before (a regression). */
  newFailures: string[];
  /** Hard gates that were already failing and are now FURTHER out of band (a regression). */
  worsenedFailures: string[];
  decision: 'optimized' | 'tradeoff' | 'impossible';
}

export interface OptimizationFlowInput {
  /** The Integration Flow Router result (decision + correction goals + evaluation). */
  flow: IntegrationFlowResult;
  /** Normalized intent — for re-evaluating the hypothetical corrected metrics. */
  intent: NormalizedRecipeIntent;
  /** The Designer's optimizer constraints — allowed/forbidden correction families. */
  optimizerConstraints: DesignerOptimizerConstraints;
  /** The metrics that produced `flow` (needed for the rerun-verification "before"). */
  beforeMetrics?: BaseEngineMetrics;
  /** A hypothetical corrected-metric set to verify — the caller/solver proposes it. */
  proposedCorrectedMetrics?: BaseEngineMetrics;
  /** Optional Designer plan for context (hero policy, notes). */
  designerPlan?: RecipeDesignPlan;
}

export interface OptimizationFlowTrace {
  optimizationFlowVersion: OptimizationFlowVersion;
  routerDecision: IntegrationFlowResult['decision'];
  hardGoals: CorrectionGoal[];
  advisoryGoals: CorrectionGoal[];
  allowedFamilies: CorrectionFamily[];
  forbiddenFamilies: CorrectionFamily[];
  verified: boolean;
}

export interface OptimizationFlowResult {
  decision: OptimizationDecision;
  proposedCorrections: CorrectionPlan[];
  rejectedCorrections: RejectedCorrection[];
  reason: string;
  rerun: RerunVerification | null;
  warnings: string[];
  trace: OptimizationFlowTrace;
  contractVersion: SpineContractVersion;
}

/* ------------------------------------------------------------------------ *
 * Goal → lever mapping (grounded in Optimizer.md §17/§21)                   *
 * ------------------------------------------------------------------------ */

interface GoalSpec {
  gate: string;
  targetMetric: string;
  direction: CorrectionDirection;
  /** Families whose adjustment moves this metric — intersected with allowed families. */
  leverFamilies: readonly CorrectionFamily[];
  approximate?: boolean;
  note?: string;
}

const GOAL_SPECS: Readonly<Record<CorrectionGoal, GoalSpec>> = {
  increase_npac: { gate: 'npac', targetMetric: 'npac', direction: 'increase', leverFamilies: ['dextrose', 'sucrose'] },
  decrease_npac: { gate: 'npac', targetMetric: 'npac', direction: 'decrease', leverFamilies: ['dextrose', 'sucrose', 'skimmed_milk_powder', 'inulin_fiber', 'water'] },
  increase_pod: { gate: 'pod', targetMetric: 'pod', direction: 'increase', leverFamilies: ['sucrose', 'dextrose'] },
  decrease_pod: { gate: 'pod', targetMetric: 'pod', direction: 'decrease', leverFamilies: ['water', 'milk', 'oat_drink', 'coconut_milk_cream'] },
  reduce_pod: { gate: 'pod', targetMetric: 'pod', direction: 'decrease', leverFamilies: ['water', 'milk', 'oat_drink', 'coconut_milk_cream'] },
  increase_solids: { gate: 'total_solids', targetMetric: 'total_solids', direction: 'increase', leverFamilies: ['skimmed_milk_powder', 'inulin_fiber', 'plant_protein', 'cocoa_powder'] },
  decrease_solids: { gate: 'total_solids', targetMetric: 'total_solids', direction: 'decrease', leverFamilies: ['water'] },
  increase_water: { gate: 'water', targetMetric: 'water', direction: 'increase', leverFamilies: ['water'] },
  decrease_water: { gate: 'water', targetMetric: 'water', direction: 'decrease', leverFamilies: ['skimmed_milk_powder', 'inulin_fiber', 'sucrose', 'dextrose', 'plant_protein'] },
  increase_fat: { gate: 'fat', targetMetric: 'fat', direction: 'increase', leverFamilies: ['cream', 'coconut_milk_cream', 'plant_fat'] },
  decrease_fat: { gate: 'fat', targetMetric: 'fat', direction: 'decrease', leverFamilies: ['milk', 'water', 'oat_drink'] },
  increase_ice_fraction: { gate: 'ice_fraction', targetMetric: 'ice_fraction', direction: 'increase', leverFamilies: ['sucrose', 'dextrose'], approximate: true, note: 'ice fraction is coupled to NPAC — verify by rerun' },
  decrease_ice_fraction: { gate: 'ice_fraction', targetMetric: 'ice_fraction', direction: 'decrease', leverFamilies: ['dextrose', 'sucrose'], approximate: true, note: 'ice fraction is coupled to NPAC — verify by rerun' },
  reduce_lactose_sanding: { gate: 'lactose_sanding', targetMetric: 'lactose_sanding', direction: 'decrease', leverFamilies: ['inulin_fiber', 'water', 'milk'], note: 'reduce skimmed milk powder / use inulin-fiber solids' },
  increase_aerating_protein: { gate: 'aerating_protein', targetMetric: 'aerating_protein', direction: 'increase', leverFamilies: ['skimmed_milk_powder', 'milk'] },
  restore_stabilizer: { gate: 'stabilizer', targetMetric: 'stabilizer', direction: 'restore', leverFamilies: ['stabilizer'] },
  adjust_fruit_ratio: { gate: 'fruit_water_sugar_balance', targetMetric: 'fruit_water_sugar_balance', direction: 'move_into_band', leverFamilies: ['fruit', 'water', 'sucrose', 'dextrose'], approximate: true },
  adjust_plant_base_ratio: { gate: 'plant_base_structure', targetMetric: 'plant_base_structure', direction: 'move_into_band', leverFamilies: ['oat_drink', 'soy_drink', 'almond_drink', 'rice_drink', 'coconut_milk_cream', 'plant_fat', 'plant_protein', 'water'], approximate: true },
  adjust_chocolate_ratio: { gate: 'chocolate_cocoa_solids_behavior', targetMetric: 'chocolate_cocoa_solids_behavior', direction: 'move_into_band', leverFamilies: ['dark_chocolate', 'milk_chocolate', 'cocoa_powder', 'cocoa_mass', 'cocoa_butter', 'chocolate_paste'], approximate: true },
  adjust_cocoa_fat_balance: { gate: 'chocolate_cocoa_solids_behavior', targetMetric: 'cocoa_fat_balance', direction: 'move_into_band', leverFamilies: ['cocoa_butter', 'cocoa_powder', 'dark_chocolate'], approximate: true },
};

/**
 * Gates that can EMIT each goal (for the advisory-vs-hard test). Most goals have a single
 * source gate (`spec.gate`); `increase_aerating_protein` is emitted by the regulator from EITHER
 * the aerating_protein gate OR a protein_share_in_solids miss (a HARD gate for standard gelato),
 * so a genuine protein-share hard failure must not be misread as advisory-only.
 */
const GOAL_SOURCE_GATES: Partial<Record<CorrectionGoal, readonly string[]>> = {
  increase_aerating_protein: ['aerating_protein', 'protein_share_in_solids'],
};

/** Golden Middle priority (Optimizer.md §10), mapped from a gate to its rank. */
const GOLDEN_MIDDLE_RANK: Readonly<Record<string, number>> = {
  stabilizer: 0, // 0 g stabilizer is a feasibility/safety blocker (§11.10, §18)
  ice_fraction: 1, // freezing_stability
  npac: 2, // npac_pac
  pod: 3, // pod
  water: 4, // water_solids
  total_solids: 4, // water_solids
  fat: 5, // fat
  aerating_protein: 6, // protein
  lactose_sanding: 7, // lactose_sandiness
};
const STRUCTURAL_RANK = 9; // flavor_priority band for fruit/plant/chocolate structural goals

const intersect = (a: readonly CorrectionFamily[], allowed: ReadonlySet<CorrectionFamily>): CorrectionFamily[] =>
  a.filter((f) => allowed.has(f));

/* ------------------------------------------------------------------------ *
 * Rerun-verification seam (pure, Temperature Regulator only)                *
 * ------------------------------------------------------------------------ */

const snapshot = (e: TemperatureRegulatorEvaluation): RerunVerification['before'] => ({
  acceptable: e.acceptable,
  status: e.status,
  hardGateFailures: e.hardGateFailures,
  score: e.score,
});

/** Per-gate out-of-band distance (0 when in band) from the evaluation's metric trace. */
const outOfBandDistances = (e: TemperatureRegulatorEvaluation): Map<string, number> => {
  const distances = new Map<string, number>();
  for (const m of e.trace.metricEvaluations) {
    if (m.inBand === false && m.band && typeof m.value === 'number') {
      const dist = m.direction === 'below' ? m.band[0] - m.value : m.value - m.band[1];
      if (Number.isFinite(dist)) distances.set(m.gate, Math.max(0, dist));
    }
  }
  return distances;
};

/**
 * Verify a hypothetical correction by RE-EVALUATING before/after metrics through
 * the Temperature Regulator (Optimizer.md §13). Pure — it never recalculates the
 * recipe; the corrected metrics are supplied by the caller (the real Base Engine
 * re-run is later wiring). A correction is `optimized` only if the recipe becomes
 * acceptable; a strict improvement with no new hard failure is `tradeoff`; no gain
 * or any regression on a higher-priority gate is `impossible`.
 */
export function verifyOptimizationRerun(
  intent: NormalizedRecipeIntent,
  beforeMetrics: BaseEngineMetrics,
  afterMetrics: BaseEngineMetrics,
): RerunVerification {
  const evalOf = (metrics: BaseEngineMetrics): TemperatureRegulatorEvaluation =>
    evaluateTemperatureRegulator({
      productProfile: intent.productProfile,
      servingTemperatureC: intent.servingTemperatureC,
      metrics,
      texturePreference: intent.texturePreference,
    });

  const before = evalOf(beforeMetrics);
  const after = evalOf(afterMetrics);
  const beforeFailures = new Set<string>(before.hardGateFailures);

  // A gate newly failing, OR a still-failing gate now further out of band, is a regression.
  // Optimizer.md §10/§13.6: never worsen a metric to fix another — such a correction is rejected.
  const newFailures = after.hardGateFailures.filter((g) => !beforeFailures.has(g));
  const beforeDist = outOfBandDistances(before);
  const afterDist = outOfBandDistances(after);
  const worsenedFailures = after.hardGateFailures.filter(
    (g) => beforeFailures.has(g) && (afterDist.get(g) ?? 0) > (beforeDist.get(g) ?? 0) + 1e-9,
  );
  const regression = newFailures.length > 0 || worsenedFailures.length > 0;

  const fewerFailures = after.hardGateFailures.length < before.hardGateFailures.length;
  const higherScore = after.score > before.score;
  // A real gain requires an actual transition/improvement — an already-acceptable recipe that did
  // not change is NOT an optimization (Optimizer.md §13 "reject if target does not improve").
  const gain = (!before.acceptable && after.acceptable) || fewerFailures || higherScore;
  const improvementDetected = !regression && gain;

  let decision: RerunVerification['decision'];
  if (!before.acceptable && after.acceptable && !regression) {
    decision = 'optimized'; // a genuine unacceptable → acceptable transition
  } else if (improvementDetected) {
    decision = 'tradeoff'; // improved, but residual gates remain
  } else {
    decision = 'impossible'; // no gain, or a regression on a higher-priority gate (§10/§13)
  }

  return {
    before: snapshot(before),
    after: snapshot(after),
    improvementDetected,
    newFailures,
    worsenedFailures,
    decision,
  };
}

/* ------------------------------------------------------------------------ *
 * Optimizer routing                                                         *
 * ------------------------------------------------------------------------ */

/**
 * Route the Integration Flow tradeoff branch through the pure Optimizer layer.
 * Deterministic; mutates nothing. ready/warning → no_action_needed (idempotence,
 * §12); blocked → blocked; impossible with no goals → impossible; tradeoff (or
 * impossible with goals) → build profile-gated correction plans and, when a
 * hypothetical corrected-metric set is supplied, verify it via re-evaluation.
 */
export function routeOptimizationFlow(input: OptimizationFlowInput): OptimizationFlowResult {
  const { flow, optimizerConstraints } = input;
  const warnings: string[] = [];
  const allowed = new Set(optimizerConstraints.allowedIngredientFamilies);
  const forbidden = new Set(optimizerConstraints.forbiddenIngredientFamilies);
  const evaluation = flow.temperatureRegulatorEvaluation;
  const hardFailures = new Set<string>(evaluation.hardGateFailures);

  const baseTrace: Omit<OptimizationFlowTrace, 'hardGoals' | 'advisoryGoals' | 'verified'> = {
    optimizationFlowVersion: OPTIMIZATION_FLOW_VERSION,
    routerDecision: flow.decision,
    allowedFamilies: [...allowed],
    forbiddenFamilies: [...forbidden],
  };

  const done = (
    decision: OptimizationDecision,
    reason: string,
    extra?: Partial<Pick<OptimizationFlowResult, 'proposedCorrections' | 'rejectedCorrections' | 'rerun'>>,
    goals?: { hard: CorrectionGoal[]; advisory: CorrectionGoal[]; verified: boolean },
  ): OptimizationFlowResult => ({
    decision,
    proposedCorrections: extra?.proposedCorrections ?? [],
    rejectedCorrections: extra?.rejectedCorrections ?? [],
    reason,
    rerun: extra?.rerun ?? null,
    warnings,
    trace: {
      ...baseTrace,
      hardGoals: goals?.hard ?? [],
      advisoryGoals: goals?.advisory ?? [],
      verified: goals?.verified ?? false,
    },
    contractVersion: SPINE_CONTRACT_VERSION,
  });

  // Idempotence + short-circuits (Optimizer.md §12; task Phase 1 rules).
  if (flow.decision === 'ready' || flow.decision === 'warning') {
    return done('no_action_needed', `router_${flow.decision}_no_correction_needed`);
  }
  if (flow.decision === 'blocked') {
    warnings.push(...flow.hardBlockers);
    return done('blocked', 'router_blocked_cannot_optimize');
  }
  if (flow.decision === 'impossible' && flow.correctionGoals.length === 0) {
    warnings.push(...flow.hardBlockers);
    return done('impossible', 'router_impossible_no_correction_goals');
  }

  // tradeoff (or the defensive impossible-with-goals case): build profile-gated plans.
  const hardGoals: CorrectionGoal[] = [];
  const advisoryGoals: CorrectionGoal[] = [];
  const proposedCorrections: CorrectionPlan[] = [];
  const rejectedCorrections: RejectedCorrection[] = [];

  for (const goal of flow.correctionGoals) {
    const spec = GOAL_SPECS[goal];
    if (!spec) {
      rejectedCorrections.push({ goal, targetMetric: 'unknown', reason: 'unsupported_goal', blockedFamilies: [] });
      continue;
    }
    // A goal whose originating gate(s) did NOT hard-fail came from an advisory flag → warning
    // only, never a hard correction (task Phase 3; chocolate protein-share stays advisory).
    const sourceGates = GOAL_SOURCE_GATES[goal] ?? [spec.gate];
    if (!sourceGates.some((g) => hardFailures.has(g))) {
      advisoryGoals.push(goal);
      warnings.push(`advisory_goal:${goal}`);
      rejectedCorrections.push({ goal, targetMetric: spec.targetMetric, reason: 'advisory_only', blockedFamilies: [] });
      continue;
    }
    hardGoals.push(goal);
    const levers = intersect(spec.leverFamilies, allowed);
    if (levers.length === 0) {
      // No allowed lever (e.g. dairy correction for a sorbet/vegan) — reject, never remap.
      const blockedFamilies = spec.leverFamilies.filter((f) => !allowed.has(f));
      rejectedCorrections.push({ goal, targetMetric: spec.targetMetric, reason: 'no_allowed_lever', blockedFamilies });
      continue;
    }
    const planWarnings = spec.note ? [spec.note] : [];
    proposedCorrections.push({
      goal,
      targetMetric: spec.targetMetric,
      direction: spec.direction,
      affectedIngredientClasses: levers,
      goldenMiddleRank: GOLDEN_MIDDLE_RANK[spec.gate] ?? STRUCTURAL_RANK,
      feasibility: spec.approximate ? 'approximate' : 'feasible',
      constraintReason: 'levers within the profile allowed families; forbidden families excluded',
      warnings: planWarnings,
    });
  }

  // Golden Middle priority — most important metric first (Optimizer.md §10).
  proposedCorrections.sort((a, b) => a.goldenMiddleRank - b.goldenMiddleRank);

  // No feasible plan for any hard goal → no safe correction exists (§20/§23).
  if (proposedCorrections.length === 0) {
    return done(
      'impossible',
      'no_allowed_correction_lever_for_any_hard_goal',
      { rejectedCorrections },
      { hard: hardGoals, advisory: advisoryGoals, verified: false },
    );
  }

  // Verify a hypothetical corrected-metric set if the caller supplied one (§13).
  if (input.proposedCorrectedMetrics && input.beforeMetrics) {
    const rerun = verifyOptimizationRerun(input.intent, input.beforeMetrics, input.proposedCorrectedMetrics);
    const reason =
      rerun.decision === 'optimized'
        ? 'correction_verified_recipe_now_acceptable'
        : rerun.decision === 'tradeoff'
          ? 'correction_improves_but_residual_gates_remain'
          : 'correction_does_not_improve_or_regresses';
    return done(rerun.decision, reason, { proposedCorrections, rejectedCorrections, rerun }, { hard: hardGoals, advisory: advisoryGoals, verified: true });
  }

  // Plans proposed but not yet verified — the real Base Engine re-run is later wiring.
  return done(
    'tradeoff',
    'correction_plan_proposed_pending_rerun_verification',
    { proposedCorrections, rejectedCorrections },
    { hard: hardGoals, advisory: advisoryGoals, verified: false },
  );
}
