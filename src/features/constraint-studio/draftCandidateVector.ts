/**
 * THE CURRENT-DRAFT CANDIDATE VECTOR (owner CURRENT-DRAFT OPTIMIZATION P0,
 * Phase 2/3 — „not in the reference template" must never mean „not adjustable").
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * The canonical engine solver reaches an existing recipe line through exactly
 * two doors:
 *   - an ADD candidate from `DEFAULT_CORRECTION_CANDIDATES` whose id happens to
 *     be listed in the engine's `SELECTION_RULES` for the violated
 *     (metric, direction) — and even then the ADD lands on a NEW line that the
 *     pipeline has to fold back by canonical identity;
 *   - a REDUCE of the single DOMINANT contributor to a HIGH violation.
 * A manually added, unlocked line (the owner's INULIN · Specialty) is therefore
 * increasable only by coincidence and decreasable only while it dominates —
 * every other selected line is invisible to the optimizer as an adjustable
 * quantity.
 *
 * WHAT THIS MODULE IS (and is NOT)
 * --------------------------------
 * It is ORCHESTRATION: a deterministic vector of GRAM MOVES over the draft's
 * own adjustable lines, expressed as ordinary engine `CorrectionAction`s
 * (`add`/`reduce` carrying `target_line_id`) and applied through the engine's
 * OWN `applyCorrectionActions`. It contains NO science: no band, no PAC/POD, no
 * ice anchor, no target, no coefficient is read, invented or re-derived here.
 * Every move it proposes is judged EXCLUSIVELY by the engine
 * (`calculateRecipe` + `detectViolations`) in the caller's existing acceptance
 * loop, exactly like a solver-produced move. ENGINE_VERSION / CONFIG_VERSION
 * are untouched by construction.
 *
 * ADJUSTABILITY CONTRACT (mirrors the solver contract, never widens it)
 * --------------------------------------------------------------------
 *  - only `lock_type === 'unlocked'` lines with NO poured actuals participate
 *    (the engine's own `isReductionAllowed` / top-up rule re-checks this, so a
 *    held line is structurally unreachable — not merely un-proposed);
 *  - a line held by a §17 padlock (`locked` / `range`) is excluded — exact
 *    locks stay byte-exact;
 *  - a line whose ingredient the user marked unavailable/excluded may only be
 *    REDUCED, never increased (never-reintroduce, Agent R handoff);
 *  - lines at 0 g DO participate (a 0 g selected line may receive grams);
 *  - the ladder is relative to the TARGET BATCH — the only scale the pipeline
 *    owns — so it is deterministic, finite and batch-independent.
 */
import {
  applyCorrectionActions,
  type CorrectionAction,
  type CorrectionConstraints,
  type IngredientCategory,
  type RecipeInput,
} from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { isToolboxCandidateExcluded } from '@/features/formulation/toolboxCanonical';
import {
  isTemplateControlledStabilizer,
  violatesApprovedStabilizerDosage,
} from '@/features/formulation/stabilizerDosage';
import { HARD_ROLES } from '@/features/formulation/formulate';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';

/**
 * The deterministic gram ladder, as fractions of the TARGET BATCH. Six steps
 * per direction (plus the explicit „to zero" move) — a fixed, finite grid, NOT
 * a tuned constant: no band, target or coefficient informs it, and the engine
 * alone decides whether any resulting state is better.
 */
export const DRAFT_ADJUSTMENT_STEP_FRACTIONS: readonly number[] = [
  0.001,
  0.005,
  0.01,
  0.02,
  0.05,
  0.1,
];

/** Smallest move worth proposing (the engine rejects `grams <= EPSILON`). */
const MIN_MOVE_GRAMS = 0.05;

/** One adjustable line of the CURRENT draft, with its tested gram range. */
export interface DraftAdjustmentCandidate {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientCategory: IngredientCategory;
  currentGrams: number;
  /** May this line receive MORE grams? (false ⇒ excluded ingredient.) */
  increasable: boolean;
  /** Absolute gram values this line is tested at, ascending, current excluded. */
  testedGrams: number[];
}

/** One concrete move: „set `lineId` to `targetGrams`", as engine actions. */
export interface DraftAdjustmentMove {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  fromGrams: number;
  toGrams: number;
  direction: 'increase' | 'decrease';
  actions: CorrectionAction[];
}

const isHeldByConstraint = (set: ConstraintSet, lineId: string): boolean => {
  const constraint = set.byLineId[lineId];
  return constraint !== undefined && constraint.mode !== 'ai';
};

/**
 * THE CANDIDATE VECTOR of the CURRENT draft: every currently selected line the
 * optimizer is allowed to move, with the exact gram values it will be tested
 * at. Pure, deterministic, order-stable (draft line order preserved).
 */
export function buildDraftCandidateVector(
  input: RecipeInput,
  set: ConstraintSet,
  excludedIngredientIds: ReadonlySet<string> = new Set(),
): DraftAdjustmentCandidate[] {
  const batch = input.target_batch_grams;
  if (!(batch > 0)) return [];
  const candidates: DraftAdjustmentCandidate[] = [];

  // HARD-ROLE PRESERVATION (the EXISTING product contract, not new science):
  // `buildFormulationProposal` already refuses any proposal with a missing
  // HARD technological role. The same rule binds this tier: the LAST carrier
  // of a hard role may be reduced, but never emptied — an optimizer that
  // deletes the fruit from a fruit gelato is not an optimizer.
  const hardRoleCarriers = new Map<string, number>();
  for (const item of input.items) {
    if (item.planned_grams <= 0) continue;
    const role = resolveFunctionalRole(item.ingredient);
    if (!HARD_ROLES.has(role)) continue;
    hardRoleCarriers.set(role, (hardRoleCarriers.get(role) ?? 0) + 1);
  }
  const isSoleHardRoleCarrier = (item: RecipeInput['items'][number]): boolean => {
    if (item.planned_grams <= 0) return false;
    const role = resolveFunctionalRole(item.ingredient);
    return HARD_ROLES.has(role) && (hardRoleCarriers.get(role) ?? 0) <= 1;
  };

  for (const item of input.items) {
    if (item.lock_type !== 'unlocked') continue;
    if (item.actual_grams !== null) continue;
    if (isHeldByConstraint(set, item.id)) continue;
    // A dosage window is a SAFETY CLAMP, not an activity gradient. Gums and
    // stabilizer blends are template-controlled and therefore never enter the
    // generic gram-search vector. Inulin resolves to `fiber_body` and remains
    // available as the approved solids/body lever.
    if (isTemplateControlledStabilizer(item.ingredient)) continue;

    // NEVER-REINTRODUCE: an excluded ingredient may shrink, never grow.
    const increasable = !isToolboxCandidateExcluded(item.ingredient.id, excludedIngredientIds);
    const current = item.planned_grams;
    const emptiable = !isSoleHardRoleCarrier(item);
    const tested = new Set<number>();

    for (const fraction of DRAFT_ADJUSTMENT_STEP_FRACTIONS) {
      const delta = batch * fraction;
      if (delta < MIN_MOVE_GRAMS) continue;
      if (increasable) tested.add(current + delta);
      const down = current - delta;
      if (down > MIN_MOVE_GRAMS) tested.add(down);
    }
    // The explicit „to zero" move — a selected line may be optimized away,
    // unless it is the last carrier of a hard technological role.
    if (current > MIN_MOVE_GRAMS && emptiable) tested.add(0);

    const testedGrams = [...tested]
      .filter((g) => Math.abs(g - current) >= MIN_MOVE_GRAMS)
      .sort((a, b) => a - b);
    if (testedGrams.length === 0) continue;

    candidates.push({
      lineId: item.id,
      ingredientId: item.ingredient.id,
      ingredientName: item.ingredient.name,
      ingredientCategory: item.ingredient.category,
      currentGrams: current,
      increasable,
      testedGrams,
    });
  }

  return candidates;
}

/** The engine actions that realise „set this line to `targetGrams`". */
export function draftAdjustmentActions(
  candidate: DraftAdjustmentCandidate,
  targetGrams: number,
): CorrectionAction[] {
  const delta = targetGrams - candidate.currentGrams;
  if (Math.abs(delta) < MIN_MOVE_GRAMS) return [];
  return [
    delta > 0
      ? {
          type: 'add',
          ingredient_id: candidate.ingredientId,
          ingredient_name: candidate.ingredientName,
          ingredient_category: candidate.ingredientCategory,
          grams: delta,
          target_line_id: candidate.lineId,
        }
      : {
          type: 'reduce',
          ingredient_id: candidate.ingredientId,
          ingredient_name: candidate.ingredientName,
          ingredient_category: candidate.ingredientCategory,
          grams: -delta,
          target_line_id: candidate.lineId,
        },
  ];
}

/** Every move of the vector, in deterministic (line, ascending grams) order. */
export function enumerateDraftAdjustmentMoves(
  candidates: readonly DraftAdjustmentCandidate[],
): DraftAdjustmentMove[] {
  const moves: DraftAdjustmentMove[] = [];
  for (const candidate of candidates) {
    for (const toGrams of candidate.testedGrams) {
      const actions = draftAdjustmentActions(candidate, toGrams);
      if (actions.length === 0) continue;
      moves.push({
        lineId: candidate.lineId,
        ingredientId: candidate.ingredientId,
        ingredientName: candidate.ingredientName,
        fromGrams: candidate.currentGrams,
        toGrams,
        direction: toGrams > candidate.currentGrams ? 'increase' : 'decrease',
        actions,
      });
    }
  }
  return moves;
}

/**
 * Apply one move through the ENGINE's own action applier. Returns null when the
 * engine refuses it (held line, poured actuals, over-reduction) — the caller
 * never bypasses that refusal.
 */
export function applyDraftAdjustment(
  input: RecipeInput,
  move: DraftAdjustmentMove,
  constraints: CorrectionConstraints,
): RecipeInput | null {
  return applyCorrectionActions(input, move.actions, constraints, []);
}

/** Compact, QA-readable description of a move (attempted-move log rows). */
export const describeDraftAdjustment = (move: DraftAdjustmentMove): string =>
  `${move.direction === 'increase' ? 'raise' : 'lower'} ${move.ingredientId} ` +
  `${move.fromGrams.toFixed(1)} g → ${move.toGrams.toFixed(1)} g`;

/* ── one deterministic sweep over the whole vector ───────────────────────── */

/** The engine's own two-key measure of a state (lower is better). */
export interface DraftStateMeasure {
  violations: number;
  severityPoints: number;
  /** Complete effective recipe cost/kg. Null means comparison is not allowed. */
  costPerKg?: number | null;
}

export interface DraftSweepArgs {
  start: RecipeInput;
  set: ConstraintSet;
  excludedIngredientIds: ReadonlySet<string>;
  constraints: CorrectionConstraints;
  /** Canonical-identity merge + target-batch restoration (pipeline-owned). */
  normalize: (candidate: RecipeInput) => RecipeInput;
  /** ENGINE evaluation of a candidate — the ONLY judge of quality. */
  measure: (candidate: RecipeInput) => DraftStateMeasure;
  startMeasure: DraftStateMeasure;
  strategy?: FormulationStrategy;
}

export interface DraftSweepResult {
  input: RecipeInput;
  measure: DraftStateMeasure;
  moves: DraftAdjustmentMove[];
}

const SEVERITY_EPS = 1e-9;

/**
 * MATERIAL-GAIN FLOOR — the deterministic CONVERGENCE guard of this tier
 * (orchestration only; the sibling of `MAX_SOLVER_ROUNDS`, not a scientific
 * threshold and not a band).
 *
 * Per LINE the sweep accepts any strict engine improvement, so small per-line
 * gains compose. A whole SWEEP, however, is accepted only when it cuts the
 * engine's own severity by at least this fraction of the severity it started
 * from (or removes a violation outright). Without it, a hard constrained case
 * (the strawberry-700 dominant lock) can be improved by ever-smaller amounts
 * forever: the outer loop would exhaust its round cap while still „improving",
 * and an `iteration_cap` run can never be labelled best-achievable (ACCEPTANCE
 * ADDENDUM 1). With it, the search stops at the point where nothing MATERIAL
 * is left — a genuine, applicable, verified fixed point.
 */
export const DRAFT_SWEEP_MIN_RELATIVE_GAIN = 0.02;

/** Per-LINE acceptance: strictly better AND never more out-of-band metrics. */
const strictlyBetter = (next: DraftStateMeasure, current: DraftStateMeasure): boolean =>
  next.violations <= current.violations &&
  (next.violations < current.violations ||
    next.severityPoints < current.severityPoints - SEVERITY_EPS);

/**
 * Is the WHOLE sweep worth another round?
 *
 * MONOTONICITY (the second half of the convergence guard): a sweep may NEVER
 * raise the number of out-of-band metrics. The engine solver's own acceptance
 * rule (fewer violations OR lower severity) is unchanged for solver moves, but
 * a fine-grained gram search under that rule can trade a violation away for
 * severity and oscillate 3 → 4 → 3 → 4 forever. Requiring „never more
 * violations, and a material severity cut when the count is unchanged" makes
 * the sequence strictly decreasing in a well-founded order, so the tier always
 * reaches a genuine fixed point inside the round cap.
 */
const materiallyBetter = (next: DraftStateMeasure, start: DraftStateMeasure): boolean => {
  if (next.violations > start.violations) return false;
  if (next.violations < start.violations) return true;
  const floor = Math.max(SEVERITY_EPS, start.severityPoints * DRAFT_SWEEP_MIN_RELATIVE_GAIN);
  return next.severityPoints <= start.severityPoints - floor;
};

/**
 * ONE ROUND of the current-draft optimizer: a deterministic COORDINATE-DESCENT
 * SWEEP over every adjustable line, in draft order. For each line the whole
 * gram ladder is tested against the state produced by the previous lines, and
 * the engine-best strictly-improving value is kept; lines that cannot improve
 * anything are left untouched. Returns null when the FULL sweep found no
 * improvement at all — i.e. the current draft is a verified fixed point over
 * the user's OWN ingredients, not merely over the engine's ADD catalogue.
 *
 * Determinism: fixed line order, fixed ladder order, strict comparisons only.
 * A sweep (rather than a single best move) is what keeps the outer iteration
 * inside its deterministic round cap instead of chasing an asymptote.
 */
export function sweepDraftCandidateVector(args: DraftSweepArgs): DraftSweepResult | null {
  const { start, set, excludedIngredientIds, constraints, normalize, measure } = args;
  let state = start;
  let best = args.startMeasure;
  const moves: DraftAdjustmentMove[] = [];

  for (const lineId of buildDraftCandidateVector(start, set, excludedIngredientIds).map(
    (candidate) => candidate.lineId,
  )) {
    // The ladder is rebuilt against the CURRENT sweep state — the line's grams
    // may already have moved through the batch restoration of earlier lines.
    const candidate = buildDraftCandidateVector(state, set, excludedIngredientIds).find(
      (entry) => entry.lineId === lineId,
    );
    if (!candidate) continue;

    let bestForLine: {
      input: RecipeInput;
      measure: DraftStateMeasure;
      move: DraftAdjustmentMove;
    } | null = null;
    for (const toGrams of candidate.testedGrams) {
      const actions = draftAdjustmentActions(candidate, toGrams);
      if (actions.length === 0) continue;
      const move: DraftAdjustmentMove = {
        lineId: candidate.lineId,
        ingredientId: candidate.ingredientId,
        ingredientName: candidate.ingredientName,
        fromGrams: candidate.currentGrams,
        toGrams,
        direction: toGrams > candidate.currentGrams ? 'increase' : 'decrease',
        actions,
      };
      // Owner Phase 9 (approved-bounds wiring) — the SAME clamp the solver
      // rounds honor: no move may push a registered stabilizer outside its
      // approved Mapper window.
      if (violatesApprovedStabilizerDosage(state, actions[0]!)) continue;
      const applied = applyDraftAdjustment(state, move, constraints);
      if (applied === null) continue;
      const normalized = normalize(applied);
      const next = measure(normalized);
      if (!strictlyBetter(next, best)) continue;
      if (bestForLine !== null && !strictlyBetter(next, bestForLine.measure)) continue;
      bestForLine = { input: normalized, measure: next, move };
    }

    if (bestForLine !== null) {
      state = bestForLine.input;
      best = bestForLine.measure;
      moves.push(bestForLine.move);
    }
  }

  if (moves.length === 0) return null;
  // The convergence guard: a sweep that only shaved an immaterial sliver off
  // the engine's severity is NOT another round — it is the fixed point.
  if (!materiallyBetter(best, args.startMeasure)) return null;
  return { input: state, measure: best, moves };
}
