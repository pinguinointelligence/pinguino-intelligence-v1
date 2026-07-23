/**
 * Structured recalculation-failure diagnosis (owner P0, 2026-07-22).
 *
 * A failed „Przelicz z PI" must PROVE its cause before naming it. This pure module inspects the
 * ACTUAL recipe input + constraint set and classifies the failure into the owner's taxonomy:
 *
 *   no_active_locks · locked_constraints_conflict · recipe_input_incomplete ·
 *   temperature_route_mismatch · ingredient_not_engine_ready · optimizer_no_solution ·
 *   constraint_verification_failed · backend_failure
 *
 * Hard rules encoded here:
 *  - a failure is NEVER labelled a lock conflict unless ≥1 real active lock is present and the
 *    verified lock list is returned with it;
 *  - „all ingredients locked" gets its own explicit message, never a generic impossibility;
 *  - every failure message is accompanied by „Receptura nie została zmieniona." (the caller
 *    renders it — the preview pipeline never touched the recipe, which stays true by §19.2);
 *  - poured actuals (§15 add-only rescue) are surfaced explicitly — they are the least obvious
 *    "lock" a recipe can inherit from a saved version.
 *
 * Adjustability mirrors the solver contract exactly: the engine solver never touches a line
 * whose `lock_type !== 'unlocked'`, never changes poured material (`actual_grams !== null`),
 * and the §17 padlock layer holds `locked`/`range` constraint entries at their grams.
 */
import type { RecipeInput, RecipeItem } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import type { PreviewIssue } from './constraintStudioStore';

export type RecalcFailureCode =
  | 'no_active_locks'
  | 'locked_constraints_conflict'
  | 'recipe_input_incomplete'
  | 'temperature_route_mismatch'
  | 'ingredient_not_engine_ready'
  | 'optimizer_no_solution'
  | 'constraint_verification_failed'
  | 'backend_failure';

export type LockStateId =
  | 'unlocked'
  | 'grams'
  | 'range'
  | 'main'
  | 'required'
  | 'already_added'
  | 'poured';

export type LockSourceId =
  | 'user_padlock'
  | 'saved_recipe'
  | 'engine_lock'
  | 'poured_actual'
  | 'none';

export interface LockReportRow {
  lineId: string;
  name: string;
  plannedGrams: number;
  actualGrams: number | null;
  lockState: LockStateId;
  source: LockSourceId;
  /** True when the lock was set by an explicit user action (padlock / main selection). */
  userSet: boolean;
  /** True when the SOLVER may change this line (the exact solver contract). */
  adjustable: boolean;
}

export interface RecalcDiagnosis {
  code: RecalcFailureCode;
  /** Every ingredient with its verified lock state (always complete, never sampled). */
  lockReport: LockReportRow[];
  lockedCount: number;
  totalCount: number;
  /** Lines with poured actuals — the §15 add-only rescue context indicator. */
  pouredCount: number;
  /** optimizer_no_solution proof: the exact engine metrics that stayed out of band. */
  violatedMetrics?: string[];
  /** optimizer_no_solution proof: how many times the solver was really invoked. */
  solverInvocations?: number;
}

/* ------------------------------------------------------------------ rows -- */

function rowFor(item: RecipeItem, constraints: ConstraintSet): LockReportRow {
  const constraint = constraints.byLineId[item.id];
  const hasPadlock = constraint !== undefined && constraint.mode !== 'ai';

  // Poured material is immutable regardless of any other flag (§15).
  if (item.actual_grams !== null) {
    return {
      lineId: item.id,
      name: item.ingredient.name,
      plannedGrams: item.planned_grams,
      actualGrams: item.actual_grams,
      lockState: 'poured',
      source: 'poured_actual',
      userSet: false,
      adjustable: false,
    };
  }

  let lockState: LockStateId;
  let source: LockSourceId;
  let userSet = false;
  if (hasPadlock) {
    lockState = constraint.mode === 'range' ? 'range' : 'grams';
    source = 'user_padlock';
    userSet = true;
  } else if (item.lock_type === 'grams') {
    // A grams-lock WITHOUT a session padlock entry was inherited (saved recipe / reload).
    lockState = 'grams';
    source = 'saved_recipe';
    userSet = true; // it was user-set originally; the session just didn't set it now
  } else if (item.lock_type === 'main' || item.lock_type === 'required' || item.lock_type === 'already_added') {
    lockState = item.lock_type;
    source = 'engine_lock';
    userSet = item.lock_type === 'main';
  } else {
    lockState = 'unlocked';
    source = 'none';
  }

  return {
    lineId: item.id,
    name: item.ingredient.name,
    plannedGrams: item.planned_grams,
    actualGrams: null,
    lockState,
    source,
    userSet,
    // The solver contract: only a fully unlocked line may change.
    adjustable: lockState === 'unlocked',
  };
}

/** The complete, verified lock report for the current working state. */
export function buildLockReport(input: RecipeInput, constraints: ConstraintSet): LockReportRow[] {
  return input.items.map((item) => rowFor(item, constraints));
}

/* ------------------------------------------------------------ classify ---- */

export interface DiagnoseArgs {
  input: RecipeInput;
  constraints: ConstraintSet;
  issue: PreviewIssue;
  /** The recipe's routed serving mode (recipeStore.servingModeId), or null. */
  servingModeId: string | null;
}

/**
 * Classify a failed preview build. `already_clean` is NOT a failure — callers keep rendering it
 * as the friendly "nothing to fix" note and must not pass it here.
 */
export function diagnoseRecalcFailure(args: DiagnoseArgs): RecalcDiagnosis {
  const { input, constraints, issue, servingModeId } = args;
  const lockReport = buildLockReport(input, constraints);
  const lockedRows = lockReport.filter((row) => !row.adjustable);
  const base = {
    lockReport,
    lockedCount: lockedRows.length,
    totalCount: lockReport.length,
    pouredCount: lockReport.filter((row) => row.lockState === 'poured').length,
  };

  // 1. Route integrity first: a serving mode whose Engine cell disagrees with the recipe's
  //    temperature makes every downstream number ambiguous.
  if (servingModeId !== null) {
    const routed = temperatureForMode(servingModeId);
    if (routed !== null && routed !== input.target_temperature_c) {
      return { code: 'temperature_route_mismatch', ...base };
    }
  }

  // 2. Structural completeness.
  if (input.items.length === 0 || !(input.target_batch_grams > 0)) {
    return { code: 'recipe_input_incomplete', ...base };
  }

  // 3. Issue-specific classification.
  switch (issue.code) {
    case 'invalid_constraints':
    case 'line_missing':
    case 'apply_failed':
      return { code: 'constraint_verification_failed', ...base };
    case 'unsafe_proposal':
      // A candidate was PRODUCED but rejected (no improvement / batch-only
      // rescale of an out-of-band draft). Classified as the safety check
      // stopping the proposal; the panel renders the exact rejection sentence.
      return {
        code: 'constraint_verification_failed',
        ...base,
        violatedMetrics: issue.violatedMetrics ?? [],
        solverInvocations: issue.solverInvocations ?? 0,
      };
    case 'no_proposal': {
      if (lockedRows.length === lockReport.length) {
        // Every single ingredient is non-adjustable — the explicit all-locked state.
        return { code: 'locked_constraints_conflict', ...base };
      }
      if (lockedRows.length > 0) {
        // ≥1 verified active lock — a lock conflict may be claimed, WITH the proof list.
        return { code: 'locked_constraints_conflict', ...base };
      }
      // ZERO locks: never blame locks. Owner P0 (Przelicz z PI): the auto-balance
      // pipeline now attaches PROOF (solver invocations + the exact violated
      // metrics) — classify as the optimizer honestly finding no solution and
      // carry the proof forward, never one generic sentence for every input.
      return {
        code: 'optimizer_no_solution',
        ...base,
        violatedMetrics: issue.violatedMetrics ?? [],
        solverInvocations: issue.solverInvocations ?? 0,
      };
    }
    default:
      // rescale_* codes cannot come from the optimize path; treat anything else honestly
      // as the optimizer finding no solution.
      return { code: 'optimizer_no_solution', ...base };
  }
}

/** True when the all-locked message must be used instead of the generic lock-conflict one. */
export function isAllLocked(diagnosis: RecalcDiagnosis): boolean {
  return diagnosis.totalCount > 0 && diagnosis.lockedCount === diagnosis.totalCount;
}
