/**
 * Constraint set validation + application (UI/UX master spec §17) — PURE.
 *
 * REUSE (audit evidence, no parallel engine):
 *  - the engine ALREADY enforces "the solver never touches a non-unlocked
 *    line": `isReductionAllowed` returns true only for `lock_type:
 *    'unlocked'` (src/engine/corrections/verify.ts) and top-ups are rejected
 *    for any non-'unlocked' line (`applyCorrectionActions`); solver ADD
 *    actions only ever create NEW lines. So `lock_type: 'grams'` is the
 *    existing, engine-native representation of the §17 lock — this module
 *    only maps constraints onto it and never re-implements the rule;
 *  - the engine NEVER rescales items to `target_batch_grams` (audit:
 *    calculateRecipe uses it only for the `batch_mass_mismatch` info
 *    warning), so §17.4 "batch change must not silently rescale locked
 *    grams" is enforced here, in the one place that performs batch scaling.
 *
 * Exact-precision rule (§17.2): a locked constraint's grams value is copied
 * verbatim (same float64) into `planned_grams`; nothing in this module or the
 * engine's immutable apply path ever recomputes it, so the value survives
 * apply + solve + re-solve bit-for-bit. `verifyConstraintsPreserved` is the
 * checkable guarantee (Object.is, not an epsilon).
 */
import type { RecipeInput, RecipeItem } from '@/engine';
import type {
  AppliedConstraintLine,
  ConstraintPreservationResult,
  ConstraintPreservationViolation,
  ConstraintSet,
  ConstraintValidationIssue,
  ConstraintValidationResult,
  IngredientConstraint,
} from './constraintTypes';

/** Engine-native protected locks the constraint layer never overrides (§18.1:
 * the engine's own safety/protection outranks user preference). */
const ENGINE_PROTECTED_LOCKS: ReadonlySet<RecipeItem['lock_type']> = new Set([
  'main',
  'already_added',
  'required',
]);

/** Spec §6 display precision — the same tolerance the engine's batch-mismatch
 * warning uses. Used ONLY for sum-vs-batch sanity, never for lock precision. */
export const BATCH_SUM_TOLERANCE_G = 0.1;

const isFiniteNonNegative = (g: number): boolean => Number.isFinite(g) && g >= 0;

/* ── validation ──────────────────────────────────────────────────────────── */

/**
 * Structural validation of a constraint set against a recipe. Never throws.
 * 'error' issues block apply/analysis; 'note' issues are informational.
 */
export function validateConstraintSet(
  input: RecipeInput,
  set: ConstraintSet,
): ConstraintValidationResult {
  const issues: ConstraintValidationIssue[] = [];
  const lineById = new Map(input.items.map((item) => [item.id, item]));

  for (const [lineId, constraint] of Object.entries(set.byLineId)) {
    const line = lineById.get(lineId);
    if (!line) {
      issues.push({ code: 'unknown_line', lineId, severity: 'error' });
      continue;
    }

    if (constraint.mode === 'locked') {
      if (!Number.isFinite(constraint.grams)) {
        issues.push({ code: 'non_finite_grams', lineId, severity: 'error' });
      } else if (constraint.grams < 0) {
        issues.push({ code: 'negative_grams', lineId, severity: 'error' });
      }
    } else if (constraint.mode === 'range') {
      if (!Number.isFinite(constraint.minGrams) || !Number.isFinite(constraint.maxGrams)) {
        issues.push({ code: 'non_finite_grams', lineId, severity: 'error' });
      } else if (constraint.minGrams < 0 || constraint.maxGrams < 0) {
        issues.push({ code: 'negative_grams', lineId, severity: 'error' });
      } else if (constraint.minGrams > constraint.maxGrams) {
        issues.push({ code: 'range_min_above_max', lineId, severity: 'error' });
      } else if (
        line.planned_grams < constraint.minGrams ||
        line.planned_grams > constraint.maxGrams
      ) {
        // Never silently clamp (§17.2 "no silent change") — the user resolves it.
        issues.push({ code: 'current_grams_outside_range', lineId, severity: 'error' });
      }
    }

    if (line.actual_grams !== null && constraint.mode !== 'ai') {
      // Physically poured material is already immutable (spec §15) — note only.
      issues.push({ code: 'constrained_line_has_actuals', lineId, severity: 'note' });
    }
  }

  return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
}

/* ── locked-sum sanity (§17.4) ───────────────────────────────────────────── */

/** Sum of the mass the constraints force into the batch: locked grams plus
 * range minimums. Pure arithmetic — no engine evaluation. */
export function constrainedMinimumGrams(set: ConstraintSet): number {
  let sum = 0;
  for (const constraint of Object.values(set.byLineId)) {
    if (constraint.mode === 'locked') sum += constraint.grams;
    else if (constraint.mode === 'range') sum += constraint.minGrams;
  }
  return sum;
}

/** The line ids of user-adjustable constraints (locked | range). */
export function constrainedLineIds(set: ConstraintSet): string[] {
  return Object.entries(set.byLineId)
    .filter(([, constraint]) => constraint.mode !== 'ai')
    .map(([lineId]) => lineId);
}

/* ── apply (§17.1–§17.3) ─────────────────────────────────────────────────── */

export type ApplyConstraintsResult =
  | { ok: true; input: RecipeInput; applied: AppliedConstraintLine[] }
  | { ok: false; issues: ConstraintValidationIssue[] };

/**
 * Produce a solver-safe `RecipeInput` copy with the constraints mapped onto
 * the engine's EXISTING `lock_type` mechanism (see module header). Immutable:
 * the given input and items are never mutated. Locked grams are byte-stable —
 * the constraint's float64 is assigned verbatim.
 */
export function applyConstraintsToRecipe(
  input: RecipeInput,
  set: ConstraintSet,
): ApplyConstraintsResult {
  const validation = validateConstraintSet(input, set);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  const applied: AppliedConstraintLine[] = [];
  const items = input.items.map((item): RecipeItem => {
    const constraint: IngredientConstraint | undefined = set.byLineId[item.id];
    if (!constraint) return item; // no entry → line untouched

    if (item.actual_grams !== null && constraint.mode !== 'ai') {
      // Already-poured line: immutable in every solver context (spec §15).
      applied.push({ lineId: item.id, note: 'actuals_line_untouched' });
      return item;
    }

    if (constraint.mode === 'ai') {
      if (ENGINE_PROTECTED_LOCKS.has(item.lock_type)) {
        applied.push({ lineId: item.id, note: 'ai_engine_lock_kept' });
        return item;
      }
      applied.push({ lineId: item.id, note: 'ai_unlocked' });
      return item.lock_type === 'unlocked' ? item : { ...item, lock_type: 'unlocked' };
    }

    if (constraint.mode === 'locked') {
      if (item.lock_type === 'main') {
        // Keep 'main' so the flavor score (engine reads lock_type === 'main')
        // is not silently changed by locking; the line is still never moved
        // within this layer (allow_main_ingredient_reduction is never set).
        applied.push({ lineId: item.id, note: 'locked_main_kept' });
        return { ...item, planned_grams: constraint.grams };
      }
      applied.push({ lineId: item.id, note: 'locked_exact' });
      return { ...item, planned_grams: constraint.grams, lock_type: 'grams' };
    }

    // range: hold at current grams for the solver (the engine has no bounded
    // moves — audit evidence in the module header); the feasibility layer
    // explores [minGrams, maxGrams] with real engine evaluations.
    if (item.lock_type === 'main') {
      applied.push({ lineId: item.id, note: 'range_main_kept' });
      return item;
    }
    applied.push({ lineId: item.id, note: 'range_held_at_current' });
    return item.lock_type === 'grams' ? item : { ...item, lock_type: 'grams' };
  });

  return { ok: true, input: { ...input, items }, applied };
}

/* ── batch change (§17.4) ────────────────────────────────────────────────── */

export type RescaleBatchResult =
  | { ok: true; input: RecipeInput; scaleFactor: number }
  | {
      ok: false;
      reason:
        | 'invalid_constraints'
        | 'actuals_present'
        | 'no_scalable_lines'
        | 'locked_sum_exceeds_batch';
      issues?: ConstraintValidationIssue[];
      /** For 'locked_sum_exceeds_batch': the smallest batch that fits the
       * preserved lines (exact sum; display may ceil it). */
      minimumBatchGrams?: number;
    };

/** Is this line's mass preserved exactly under a batch change? */
function isPreservedUnderBatchChange(item: RecipeItem, set: ConstraintSet): boolean {
  const constraint = set.byLineId[item.id];
  if (constraint && constraint.mode !== 'ai') return true; // locked | range (§17.4)
  if (!constraint && item.lock_type === 'grams') return true; // pre-existing direct gram lock
  return false;
}

/**
 * Change the target batch WITHOUT rescaling locked grams (§17.4): locked and
 * range lines keep their exact gram values (same float64 — the item objects
 * are reused untouched); only the remaining lines scale, by one factor, to
 * reach the new batch. Refuses (honest codes, never silent):
 *  - when any line has actual_grams (batch scaling is a planning operation —
 *    physically poured mass cannot be scaled);
 *  - when nothing is scalable, or the preserved mass alone exceeds the new
 *    batch (→ 'locked_sum_exceeds_batch' with the genuinely computed minimum).
 */
export function rescaleBatchToTarget(
  input: RecipeInput,
  set: ConstraintSet,
  newBatchGrams: number,
): RescaleBatchResult {
  const validation = validateConstraintSet(input, set);
  if (!validation.ok) {
    return { ok: false, reason: 'invalid_constraints', issues: validation.issues };
  }
  if (!isFiniteNonNegative(newBatchGrams)) {
    return { ok: false, reason: 'invalid_constraints', issues: [] };
  }
  if (input.items.some((item) => item.actual_grams !== null)) {
    return { ok: false, reason: 'actuals_present' };
  }

  let preservedSum = 0;
  let scalableSum = 0;
  for (const item of input.items) {
    if (isPreservedUnderBatchChange(item, set)) preservedSum += item.planned_grams;
    else scalableSum += item.planned_grams;
  }

  if (preservedSum > newBatchGrams + BATCH_SUM_TOLERANCE_G) {
    return {
      ok: false,
      reason: 'locked_sum_exceeds_batch',
      minimumBatchGrams: preservedSum,
    };
  }
  if (scalableSum <= 0) {
    return { ok: false, reason: 'no_scalable_lines' };
  }

  const scaleFactor = (newBatchGrams - preservedSum) / scalableSum;
  const items = input.items.map((item) =>
    isPreservedUnderBatchChange(item, set)
      ? item // SAME object — planned_grams provably untouched
      : { ...item, planned_grams: item.planned_grams * scaleFactor },
  );

  return {
    ok: true,
    input: { ...input, items, target_batch_grams: newBatchGrams },
    scaleFactor,
  };
}

/* ── preservation check (§17.2 hard guarantee) ───────────────────────────── */

/**
 * Verify that a (possibly solver-modified) recipe still honors the constraint
 * set: locked lines carry the EXACT grams (Object.is — no epsilon), range
 * lines stay inside [minGrams, maxGrams]. Solver-added lines are ignored
 * (they carry no constraint). Usable as a final apply-gate by UI flows.
 */
export function verifyConstraintsPreserved(
  set: ConstraintSet,
  after: RecipeInput,
): ConstraintPreservationResult {
  const violations: ConstraintPreservationViolation[] = [];
  const lineById = new Map(after.items.map((item) => [item.id, item]));

  for (const [lineId, constraint] of Object.entries(set.byLineId)) {
    if (constraint.mode === 'ai') continue;
    const line = lineById.get(lineId);
    if (!line) {
      violations.push({ lineId, code: 'line_missing' });
      continue;
    }
    if (constraint.mode === 'locked') {
      if (!Object.is(line.planned_grams, constraint.grams)) {
        violations.push({ lineId, code: 'locked_grams_changed' });
      }
    } else if (
      line.planned_grams < constraint.minGrams ||
      line.planned_grams > constraint.maxGrams
    ) {
      violations.push({ lineId, code: 'range_exceeded' });
    }
  }

  return { ok: violations.length === 0, violations };
}
