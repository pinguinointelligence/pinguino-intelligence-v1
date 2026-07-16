/**
 * Ingredient constraint model (UI/UX master spec §17, §23.2) — PURE domain types.
 *
 * Adapted to repo conventions from the spec's §23.2 sketch:
 *  - constraints are keyed by RECIPE LINE id (`RecipeItem.id`) — the stable
 *    identity the engine's own correction actions use (`target_line_id`), so
 *    two lines of the same ingredient stay independently constrainable;
 *  - feature-layer names are camelCase (matching src/features/optimization/*),
 *    while the engine keeps its snake_case types untouched;
 *  - the spec's single `suggestedAction` becomes an ordered `suggestedActions`
 *    list (§18.2 shows several honest action paths side by side); every entry
 *    is GENUINELY COMPUTED — no presentational heuristics (§18.3).
 *
 * Lock semantics (§17.2/§17.4): `locked` means the ABSOLUTE gram value is
 * preserved exactly — bit-for-bit, not "up to 0.1 g" — through apply, solve
 * and batch changes. `range` is the Pro min–max mode (§17.3). `ai` explicitly
 * returns a line to the solver.
 */
import type { TargetMetric, TargetRange } from '@/engine';

/* ── §23.2 constraint model ──────────────────────────────────────────────── */

export type IngredientConstraint =
  | { mode: 'ai' }
  | { mode: 'locked'; grams: number }
  | { mode: 'range'; minGrams: number; maxGrams: number };

/** Per-recipe constraint set, keyed by recipe line id (`RecipeItem.id`). */
export interface ConstraintSet {
  readonly byLineId: Readonly<Record<string, IngredientConstraint>>;
}

/* ── validation ──────────────────────────────────────────────────────────── */

export type ConstraintValidationCode =
  /** The constraint references a line id that is not in the recipe. */
  | 'unknown_line'
  /** grams / minGrams / maxGrams is NaN or ±Infinity. */
  | 'non_finite_grams'
  /** grams / minGrams / maxGrams is negative. */
  | 'negative_grams'
  /** range with minGrams > maxGrams. */
  | 'range_min_above_max'
  /** range whose current planned grams lie outside [minGrams, maxGrams] —
   * never silently clamped; the user must resolve it. */
  | 'current_grams_outside_range'
  /** NOTE (non-blocking): the line has `actual_grams` — physically poured
   * material is already immutable in every solver context (spec §15), so a
   * user lock adds nothing; the line is left on its engine-native lock. */
  | 'constrained_line_has_actuals';

export interface ConstraintValidationIssue {
  code: ConstraintValidationCode;
  lineId: string;
  /** 'error' blocks apply/analysis; 'note' is informational. */
  severity: 'error' | 'note';
}

export interface ConstraintValidationResult {
  /** True when no 'error'-severity issue exists (notes may still be present). */
  ok: boolean;
  issues: ConstraintValidationIssue[];
}

/* ── applyConstraintsToRecipe ────────────────────────────────────────────── */

/** How each constrained line was represented for the engine solver. */
export type AppliedConstraintNote =
  /** locked → engine `lock_type: 'grams'`, planned grams set to the exact
   * constraint value (same float64 — byte-stable). */
  | 'locked_exact'
  /** locked on a `main` line → the engine-native 'main' lock is KEPT so the
   * flavor score (engine scoring reads lock_type === 'main') is not silently
   * changed by locking; within this layer the line is still never moved
   * (`allow_main_ingredient_reduction` is never set). */
  | 'locked_main_kept'
  /** range → line held at its current grams via `lock_type: 'grams'`. The
   * engine solver has NO bounded-move support (audit: `CorrectionRequest` /
   * `CorrectionAction` carry no per-line bounds), so the range is enforced
   * conservatively for the solver and explored ONLY by the feasibility layer
   * (real engine evaluations inside [minGrams, maxGrams]). */
  | 'range_held_at_current'
  /** range on a `main` line → 'main' kept (same scoring reason as above). */
  | 'range_main_kept'
  /** ai → `lock_type: 'unlocked'` (§17.2 steps 4–6: the solver may change it
   * again on the next run). */
  | 'ai_unlocked'
  /** ai on an engine-native protected line ('main' | 'already_added' |
   * 'required') → the engine lock is KEPT (§18.1: safety/validation and the
   * engine's own protection outrank user preference). */
  | 'ai_engine_lock_kept'
  /** any constraint on a line with actual_grams → line left untouched
   * (physically added material is immutable, spec §15). */
  | 'actuals_line_untouched';

export interface AppliedConstraintLine {
  lineId: string;
  note: AppliedConstraintNote;
}

/* ── feasibility analysis (§18) ──────────────────────────────────────────── */

/** Optional target context: solve/detect against injected bands (e.g. the
 * Temperature Regulator shadow bands from src/features/optimization) without
 * touching the global engine config — the same preview-only seam the
 * optimization feature already uses (`proposeAutoFix({ targetBandOverride })`). */
export interface ConstraintTargetContext {
  targetBandOverride?: Partial<Record<TargetMetric, TargetRange>>;
  /** Engine-evaluation budget for one analysis. Default and HARD CAP 24
   * (values above the cap are clamped down, never up). */
  maxEvaluations?: number;
}

/** A violation view stripped to codes — no band numbers, no raw values, so
 * this payload is safe to pass toward Home/demo surfaces (§13.2/§22.2). */
export interface FeasibilityViolationView {
  metric: TargetMetric;
  direction: 'low' | 'high';
}

/** A genuinely computed feasibility boundary (§18.3): emitted ONLY when the
 * bisection verified BOTH sides — clean at `verifiedCleanAtGrams`, violating
 * at `verifiedViolatingAtGrams` — with the two within the convergence window. */
export interface FeasibilityBound {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  /** 'max' → "set at most X g" (§18.2); 'min' → "set at least X g". */
  boundType: 'max' | 'min';
  /** The verified-clean boundary grams, full float precision. */
  grams: number;
  /** Honest display rounding: floor for 'max', ceil for 'min' — never rounded
   * PAST the verified-clean side. When re-verification of the rounded value
   * succeeded it equals that verified value; otherwise it falls back to the
   * raw verified `grams` (displayGramsVerified false only for the rounding). */
  displayGrams: number;
  /** True when `displayGrams` itself was re-verified clean by a real engine
   * evaluation (not just implied by monotonicity). */
  displayGramsVerified: boolean;
  verifiedCleanAtGrams: number;
  verifiedViolatingAtGrams: number;
}

export type ConstraintConflictReason =
  /** sum(locked grams) + sum(range minimums) exceeds the target batch —
   * detected by pure arithmetic BEFORE any engine evaluation (§17.4). */
  | 'locked_sum_exceeds_batch'
  /** One constrained line has a verified feasibility boundary (§18.2). */
  | 'single_lock_boundary'
  /** The constrained lines JOINTLY block the golden zone: no single line has
   * a verified boundary, but releasing all of them lets the real solver reach
   * a full fix (§18.4 — never blames one line arbitrarily). */
  | 'locks_jointly_block';

/** One concrete solver change, surfaced as evidence in `multiple_changes`
 * (taken verbatim from a REAL verified engine proposal — never invented). */
export interface ConstraintChange {
  type: 'add' | 'reduce';
  ingredientName: string;
  grams: number;
  lineId?: string;
}

export type ConstraintSuggestedAction =
  | { type: 'set_max'; lineId: string; grams: number }
  | { type: 'set_min'; lineId: string; grams: number }
  | { type: 'unlock'; lineId: string }
  | { type: 'change_batch'; minimumBatchGrams?: number }
  | { type: 'multiple_changes'; changes: readonly ConstraintChange[] };

export interface ConstraintConflict {
  /** Every line that participates in the conflict — a GROUP when several
   * locks jointly block (§18.4). */
  lineIds: string[];
  reasonCode: ConstraintConflictReason;
  /** Ordered by preference (§18.3 minimal change first). Only genuinely
   * computed entries; the UI adds its own static staples ("Pozostaw bez
   * zmian", "Zmień zakres") around these. */
  suggestedActions: ConstraintSuggestedAction[];
}

export type NoReliableBoundReason =
  /** The evaluation budget ran out before a boundary converged (§18.5 —
   * honest fallback instead of false precision). */
  | 'evaluation_budget_exhausted'
  /** Even with every user constraint released, the bounded real solver found
   * no full fix — the locks are NOT reliably the cause, so no lock-targeted
   * recommendation is made. */
  | 'not_solvable_by_constraint_changes'
  /** Violations exist but the set has no locked/range lines to analyze. */
  | 'no_constraints_to_analyze';

export type ConstraintFeasibilityAnalysis =
  | {
      status: 'invalid_constraints';
      issues: ConstraintValidationIssue[];
      evaluationsUsed: 0;
    }
  | {
      status: 'feasible';
      /** True: already in the golden zone as-is. False: reachable via a
       * verified full solver fix WITHOUT touching any constraint. */
      alreadyInBand: boolean;
      viaSolverProposal: boolean;
      violationsBefore: FeasibilityViolationView[];
      evaluationsUsed: number;
    }
  | {
      status: 'infeasible_with_bound';
      bound: FeasibilityBound;
      conflict: ConstraintConflict;
      violationsBefore: FeasibilityViolationView[];
      evaluationsUsed: number;
    }
  | {
      status: 'conflict_group';
      conflict: ConstraintConflict;
      violationsBefore: FeasibilityViolationView[];
      evaluationsUsed: number;
    }
  | {
      status: 'no_reliable_bound';
      reasonCode: NoReliableBoundReason;
      /** The constrained lines the fallback message points at (§18.5). */
      lineIds: string[];
      violationsBefore: FeasibilityViolationView[];
      evaluationsUsed: number;
    };

/* ── constraint preservation check (§17.2 hard guarantee) ────────────────── */

export type ConstraintPreservationCode =
  | 'locked_grams_changed'
  | 'range_exceeded'
  | 'line_missing';

export interface ConstraintPreservationViolation {
  lineId: string;
  code: ConstraintPreservationCode;
}

export interface ConstraintPreservationResult {
  ok: boolean;
  violations: ConstraintPreservationViolation[];
}
