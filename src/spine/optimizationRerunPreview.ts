/**
 * PINGUINO Spine — Optimizer ↔ real solver + Base Engine rerun preview seam
 * (Phase C Slice 8).
 *
 * A PURE, unwired preview that connects the Optimizer routing layer (Slice 7) to
 * the REAL correction solver (src/engine/corrections/*) and the REAL Base Engine
 * (`calculateRecipe`) — WITHOUT importing them. Spine files may import only from
 * within src/spine, so the engine/solver are supplied as an INJECTED pure
 * function (`rerunCorrection`): the caller (or a test) builds the corrected
 * recipe with the real solver, re-runs the real Base Engine, and hands back the
 * result; this seam then adapts it (`adaptBaseEngineResult`) and verifies the
 * before/after through the Temperature Regulator (`verifyOptimizationRerun`).
 *
 * Guarantees (task Phase 1/4 rules): pure preview only — it never saves a recipe,
 * never mutates its inputs, never calls a DB / Supabase / Mapper, never writes
 * ingredient data, and NEVER reports `optimized` unless the rerun verification
 * proves a genuine unacceptable→acceptable improvement. When no `rerunCorrection`
 * is injected, it honestly returns the `rerun_not_connected` state and leaves the
 * decision at `tradeoff` — it does not fake a solved recipe.
 */
import {
  adaptBaseEngineResult,
  type BaseEngineResultLike,
} from './baseEngineMetricsAdapter';
import type { DesignerOptimizerConstraints } from './designRecipe';
import type { BaseEngineMetrics } from './evaluateTemperatureRegulator';
import {
  verifyOptimizationRerun,
  type CorrectionPlan,
  type OptimizationDecision,
  type OptimizationFlowResult,
  type RejectedCorrection,
  type RerunVerification,
} from './optimizationFlowRouter';
import {
  SPINE_CONTRACT_VERSION,
  type NormalizedRecipeIntent,
  type SpineContractVersion,
} from './types';

export type OptimizationRerunPreviewVersion = '0.1.0';
export const OPTIMIZATION_RERUN_PREVIEW_VERSION: OptimizationRerunPreviewVersion = '0.1.0';

/** A single applied gram adjustment — echoed for display, never a write. */
export interface AppliedAdjustment {
  type: 'add' | 'reduce' | string;
  ingredient: string;
  grams: number;
}

/** Context handed to the injected real solver + Base Engine rerun. */
export interface RerunCorrectionContext {
  intent: NormalizedRecipeIntent;
  plans: readonly CorrectionPlan[];
  /** The current recipe draft (the engine's `RecipeInput`) — opaque to the Spine. */
  recipeDraft: unknown;
  optimizerConstraints: DesignerOptimizerConstraints;
}

/**
 * Outcome of the injected rerun. `applied: true` carries the corrected recipe and
 * the real Base Engine result to adapt; `applied: false` means the solver found no
 * safe correction (never faked). The Spine never builds this itself.
 */
export type RerunCorrectionOutcome =
  | {
      applied: true;
      correctedRecipe: unknown;
      correctedResult: BaseEngineResultLike;
      appliedAdjustments: readonly AppliedAdjustment[];
    }
  | { applied: false; reason: string };

export type RerunCorrectionFn = (ctx: RerunCorrectionContext) => RerunCorrectionOutcome;

export interface OptimizationRerunPreviewInput {
  intent: NormalizedRecipeIntent;
  /** The current Base Engine metrics (the rerun-verification "before"). */
  beforeMetrics: BaseEngineMetrics;
  /** The current recipe draft, passed through to the injected solver; echoed only. */
  recipeDraft?: unknown;
  /** The Optimizer routing result (from `routeOptimizationFlow`). */
  optimization: OptimizationFlowResult;
  optimizerConstraints: DesignerOptimizerConstraints;
  /** Injected real solver + Base Engine rerun. Absent → `rerun_not_connected`. */
  rerunCorrection?: RerunCorrectionFn;
}

export type OptimizationRerunState =
  | 'not_needed' // already ready/warning — nothing to solve
  | 'blocked' // upstream blocked — cannot evaluate
  | 'no_feasible_plan' // optimizer found no feasible correction plan
  | 'rerun_not_connected' // tradeoff, but no real solver/engine injected (pure preview)
  | 'solver_no_correction' // the solver produced no safe correction
  | 'rerun_incomplete' // the corrected Base Engine result is missing core metrics
  | 'rerun_complete'; // solver corrected + Base Engine re-ran + regulator re-verified

export interface OptimizationRerunPreviewTrace {
  previewVersion: OptimizationRerunPreviewVersion;
  optimizerDecision: OptimizationDecision;
  rerunState: OptimizationRerunState;
  /** True only when the injected solver/engine actually ran. */
  solverInvoked: boolean;
  verified: boolean;
}

export interface OptimizationRerunPreviewResult {
  decision: OptimizationDecision;
  rerunState: OptimizationRerunState;

  selectedPlan: CorrectionPlan | null;
  proposedAdjustments: readonly AppliedAdjustment[];
  /** The hypothetical corrected recipe draft (opaque) — never saved. */
  hypotheticalCorrectedRecipe: unknown | null;
  /** The adapter-ready corrected Base Engine result. */
  correctedBaseEngineResult: BaseEngineResultLike | null;

  /** Before/after Temperature Regulator evaluations + verdict (null until the rerun runs). */
  rerun: RerunVerification | null;

  /** Correction plans carried from the optimizer — surfaced, never hidden. */
  proposedCorrections: readonly CorrectionPlan[];
  rejectedCorrections: readonly RejectedCorrection[];

  warnings: string[];
  hardBlockers: string[];

  trace: OptimizationRerunPreviewTrace;
  contractVersion: SpineContractVersion;
}

/**
 * Run the pure optimizer→solver→rerun preview. Deterministic; mutates nothing.
 * Only calls the injected `rerunCorrection` when the optimizer decision is
 * `tradeoff` (a feasible plan exists) — ready/warning/blocked/impossible never
 * touch the solver. The final decision is the rerun verdict when the rerun runs,
 * and otherwise faithfully mirrors the optimizer decision (never upgraded to a
 * fake `optimized`).
 */
export function runOptimizationRerunPreview(
  input: OptimizationRerunPreviewInput,
): OptimizationRerunPreviewResult {
  const { optimization } = input;
  const warnings: string[] = [...optimization.warnings];
  const hardBlockers: string[] = [];

  const build = (
    decision: OptimizationDecision,
    rerunState: OptimizationRerunState,
    extra: Partial<
      Pick<
        OptimizationRerunPreviewResult,
        | 'selectedPlan'
        | 'proposedAdjustments'
        | 'hypotheticalCorrectedRecipe'
        | 'correctedBaseEngineResult'
        | 'rerun'
      >
    > = {},
    solverInvoked = false,
  ): OptimizationRerunPreviewResult => ({
    decision,
    rerunState,
    selectedPlan: extra.selectedPlan ?? null,
    proposedAdjustments: extra.proposedAdjustments ?? [],
    hypotheticalCorrectedRecipe: extra.hypotheticalCorrectedRecipe ?? null,
    correctedBaseEngineResult: extra.correctedBaseEngineResult ?? null,
    rerun: extra.rerun ?? null,
    proposedCorrections: optimization.proposedCorrections,
    rejectedCorrections: optimization.rejectedCorrections,
    warnings,
    hardBlockers,
    trace: {
      previewVersion: OPTIMIZATION_RERUN_PREVIEW_VERSION,
      optimizerDecision: optimization.decision,
      rerunState,
      solverInvoked,
      verified: extra.rerun != null,
    },
    contractVersion: SPINE_CONTRACT_VERSION,
  });

  // Short-circuits — the solver is never called (task Phase 5 #1/#2).
  if (optimization.decision === 'no_action_needed') return build('no_action_needed', 'not_needed');
  if (optimization.decision === 'blocked') {
    hardBlockers.push('optimizer_blocked');
    return build('blocked', 'blocked');
  }
  if (optimization.decision === 'impossible') {
    // The optimizer already proved there is no feasible correction plan.
    return build('impossible', 'no_feasible_plan');
  }
  // Defensive: an already-optimized upstream decision needs no further rerun.
  if (optimization.decision === 'optimized') return build('optimized', 'not_needed');

  // optimization.decision === 'tradeoff' — a feasible plan exists; a rerun is needed.
  const selectedPlan = optimization.proposedCorrections[0] ?? null;

  if (!input.rerunCorrection) {
    // The seam exists but the real solver/engine is not injected — honest unwired state.
    warnings.push('rerun_not_connected');
    return build('tradeoff', 'rerun_not_connected', { selectedPlan });
  }

  const outcome = input.rerunCorrection({
    intent: input.intent,
    plans: optimization.proposedCorrections,
    recipeDraft: input.recipeDraft,
    optimizerConstraints: input.optimizerConstraints,
  });

  if (!outcome.applied) {
    // The solver found no safe correction — never faked as success (Optimizer.md §11/§23).
    warnings.push(`solver_no_correction:${outcome.reason}`);
    return build('impossible', 'solver_no_correction', { selectedPlan }, true);
  }

  // Adapt the real corrected Base Engine result; a missing core metric blocks (missing data).
  const adaptation = adaptBaseEngineResult(outcome.correctedResult);
  warnings.push(...adaptation.warnings);
  if (!adaptation.complete) {
    hardBlockers.push('missing_base_engine_metrics', ...adaptation.missingFields.map((f) => `missing:${f}`));
    return build(
      'blocked',
      'rerun_incomplete',
      {
        selectedPlan,
        proposedAdjustments: outcome.appliedAdjustments,
        hypotheticalCorrectedRecipe: outcome.correctedRecipe,
        correctedBaseEngineResult: outcome.correctedResult,
      },
      true,
    );
  }

  // Re-evaluate before/after through the Temperature Regulator (the verification of record).
  const rerun = verifyOptimizationRerun(input.intent, input.beforeMetrics, adaptation.metrics);
  return build(
    rerun.decision,
    'rerun_complete',
    {
      selectedPlan,
      proposedAdjustments: outcome.appliedAdjustments,
      hypotheticalCorrectedRecipe: outcome.correctedRecipe,
      correctedBaseEngineResult: outcome.correctedResult,
      rerun,
    },
    true,
  );
}
