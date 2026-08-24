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
  violatesInternalStabilizerProfileAuthority,
} from '@/features/formulation/stabilizerDosage';
import { HARD_ROLES } from '@/features/formulation/formulate';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { flavourHeldLineIds } from '@/features/formulation/flavourMutationAuthority';
import {
  userLineBaselineGrams,
  materialDeviationFloorGrams,
  isMaterialUserIntentDeviation,
  USER_INTENT_DRIFT_EPS,
  type UserLineIntent,
} from '@/features/formulation/userLineIntent';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';

/**
 * The deterministic gram ladder, as fractions of the TARGET BATCH. Six steps
 * per direction (plus the explicit „to zero" move) — a fixed, finite grid, NOT
 * a tuned constant: no band, target or coefficient informs it, and the engine
 * alone decides whether any resulting state is better.
 */
export const DRAFT_ADJUSTMENT_STEP_FRACTIONS: readonly number[] = [
  0.001, 0.005, 0.01, 0.02, 0.05, 0.1,
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
  /** Original user-entered positive Standard amount — the USER-INTENT BASELINE
   * of this line. It remains stable while candidate sweeps move currentGrams. */
  anchorGrams: number | null;
  /** Lowest amount this line may reach WITHOUT becoming a material user-intent
   * deviation (owner §7/§9). Null when the line carries no user intent. Values
   * below it stay in the candidate set but may only be taken after the
   * preserving pass has failed, and they require explicit consent. */
  materialFloorGrams: number | null;
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
  const flavourHeld = flavourHeldLineIds(input);

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
    // FLAVOUR MUTATION AUTHORITY (owner P1-B): a secondary flavour accent may
    // shrink, but nothing in the recipe authorises the optimizer to RAISE it —
    // residual batch mass must never be parked in lemon juice, an extract or a
    // liqueur just because the row happens to be unlocked.
    const increasable =
      !isToolboxCandidateExcluded(item.ingredient.id, excludedIngredientIds) &&
      !flavourHeld.has(item.id);
    const current = item.planned_grams;
    // THE canonical user-intent authority (owner §6): ONE concept for „the user
    // gave this line a positive amount", covering an explicit add, a typed gram
    // amount and an adopted/imported recipe alike. The ladder no longer reads
    // the `user_intent_anchor_grams` sidecar directly, so a line can never
    // carry intent for the presence rule but not for the soft hold.
    const anchorGrams = userLineBaselineGrams(item, set);
    const materialFloorGrams =
      anchorGrams === null ? null : materialDeviationFloorGrams(anchorGrams, batch);
    const emptiable = anchorGrams === null && !isSoleHardRoleCarrier(item);
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
    // USER-INTENT SOFT HOLD (owner GLOBAL SOFT-HOLD 2026-08-23).
    //
    // This rung used to be a literal `tested.add(1)`: for exactly the lines
    // that carry user intent, the ladder handed the search a move straight
    // down to the PRESENCE FLOOR. That is how a 40 g dried egg yolk became
    // 1 g — the search did not discover the collapse, it was offered it, and
    // the number 1 came from the „no 0 g rows" invariant rather than from any
    // technical need (owner §25).
    //
    // Two rungs replace it. The MATERIAL FLOOR is the largest reduction that
    // is still ordinary optimization, so the search can still shrink the line
    // hard without deleting it. The presence floor stays reachable — §12
    // requires that a genuinely necessary large change remain POSSIBLE — but
    // it is now a material deviation, so the sweep may only take it after the
    // preserving pass has failed, and Preview must then say so out loud.
    if (materialFloorGrams !== null && materialFloorGrams > MIN_MOVE_GRAMS) {
      tested.add(Math.round(materialFloorGrams * 100) / 100);
    }
    if (anchorGrams !== null && Math.abs(current - 1) >= MIN_MOVE_GRAMS) tested.add(1);

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
      anchorGrams,
      materialFloorGrams,
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
  /**
   * Σ weight × normalized drift of every soft-held user line, measured against
   * the USER BASELINE (owner §8/§9). Ranks strictly BELOW hard legality and
   * the engine's own severity and strictly ABOVE cost. Absent ⇒ the caller
   * supplied no baseline and ranking is byte-identical to before.
   */
  userIntentDrift?: number;
}

export interface DraftSweepArgs {
  /**
   * Owner P1-A: true when the ONLY thing still out of band is a Direction axis
   * — the recipe is otherwise engine-perfect and the search is purely chasing a
   * preference. Supplied by the caller (which owns the Direction plan) so this
   * module keeps no Direction dependency. Absent → the paired-exchange pass
   * never runs, and behaviour is byte-identical to before.
   */
  directionOnlyResidual?: boolean;
  start: RecipeInput;
  set: ConstraintSet;
  /**
   * THE USER-INTENT BASELINE of this solve (owner §9): the amounts the user
   * stands behind, captured ONCE at solve entry and never re-derived from an
   * intermediate candidate. Absent ⇒ no soft-hold authority participates and
   * the sweep behaves exactly as it did before.
   */
  userIntentBaseline?: ReadonlyMap<string, UserLineIntent>;
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
  /**
   * TRUE when this sweep could only improve the recipe by materially deviating
   * from a positive user line — i.e. the preserving pass was tried first and
   * failed (owner §12). The caller turns this into an explicit consent state;
   * it must never be presented as an ordinary correction.
   */
  materialUserIntentDeviation?: boolean;
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

/**
 * Cost ceiling for ONE paired-exchange pass (owner P1-A). Orchestration only —
 * not a band, not science. It bounds the pass at a fixed number of priced
 * candidates so a Direction round can never grow with recipe size.
 */
export const PAIRED_EXCHANGE_EVALUATION_BUDGET = 400;

/** How many composing passes one Direction round may run. Orchestration only. */
export const PAIRED_EXCHANGE_MAX_PASSES = 12;

/**
 * Per-LINE acceptance: strictly better AND never more out-of-band metrics.
 *
 * LEXICOGRAPHIC ORDER (owner §8). Hard legality and the engine's own severity
 * decide first and are UNCHANGED. Only when the engine cannot tell two
 * candidates apart — same violation count, same severity within epsilon — does
 * user-intent drift break the tie, and it breaks it toward the candidate that
 * keeps more of what the user asked for. This is the whole behavioural
 * contract of §8: „when two candidates are equally hard-valid and equally
 * satisfy the requested technical target, prefer the lower drift."
 */
const strictlyBetter = (next: DraftStateMeasure, current: DraftStateMeasure): boolean =>
  next.violations <= current.violations &&
  (next.violations < current.violations ||
    next.severityPoints < current.severityPoints - SEVERITY_EPS);

/**
 * The §8 TIE-BREAK: `left` keeps strictly more of what the user asked for than
 * `right`. Consulted ONLY between candidates the engine cannot tell apart, so
 * it can never overturn hard legality, severity, locks, Main or Direction — it
 * decides only which of two equally-valid recipes is proposed.
 *
 * Deliberately NOT folded into `strictlyBetter`. Making drift an ACCEPTANCE
 * key promotes moves the engine had rejected as no-gain, which changes accepted
 * search trajectories far from any user line (measured: the Kiwi-700
 * ProductBehavior fixture lost its auto-added Inulin row). Ranking is a
 * comparison, not a licence to move.
 */
const lowerUserIntentDrift = (left: DraftStateMeasure, right: DraftStateMeasure): boolean =>
  left.userIntentDrift !== undefined &&
  right.userIntentDrift !== undefined &&
  left.userIntentDrift < right.userIntentDrift - USER_INTENT_DRIFT_EPS;

const sameMeasure = (left: DraftStateMeasure, right: DraftStateMeasure): boolean =>
  left.violations === right.violations &&
  Math.abs(left.severityPoints - right.severityPoints) <= SEVERITY_EPS &&
  (left.costPerKg === undefined ||
    right.costPerKg === undefined ||
    left.costPerKg === null ||
    right.costPerKg === null ||
    Math.abs(left.costPerKg - right.costPerKg) <= SEVERITY_EPS);

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
  // NOTE: the ROUND gate deliberately stays on (violations, severity) ONLY.
  // User-intent drift decides WHICH candidate a round takes (`strictlyBetter`),
  // never WHETHER another round is worth running: promoting a drift-only gain
  // to „another round" would spend rounds from the SAME `MAX_SOLVER_ROUNDS`
  // budget that owner §30 fixes, and measurably changed accepted trajectories
  // on the Kiwi-700 ProductBehavior fixture.
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
  const batch = start.target_batch_grams;
  let state = start;
  let best = args.startMeasure;
  const moves: DraftAdjustmentMove[] = [];
  let materialDeviationTaken = false;

  /**
   * Is setting `candidate` to `toGrams` a MATERIAL deviation from the amount
   * the user asked for? Only lines that carry user intent can be — a PI-added
   * support line has no baseline and is therefore never restricted here.
   */
  const isDeviating = (candidate: DraftAdjustmentCandidate, toGrams: number): boolean =>
    candidate.anchorGrams !== null &&
    isMaterialUserIntentDeviation(candidate.anchorGrams, toGrams, batch);

  for (const lineId of buildDraftCandidateVector(start, set, excludedIngredientIds).map(
    (candidate) => candidate.lineId,
  )) {
    // The ladder is rebuilt against the CURRENT sweep state — the line's grams
    // may already have moved through the batch restoration of earlier lines.
    const candidate = buildDraftCandidateVector(state, set, excludedIngredientIds).find(
      (entry) => entry.lineId === lineId,
    );
    if (!candidate) continue;

    /**
     * ONE pass over a SUBSET of the ladder. Returns the engine-best strictly
     * improving value in that subset, or null.
     */
    const searchRungs = (
      rungs: readonly number[],
    ): { input: RecipeInput; measure: DraftStateMeasure; move: DraftAdjustmentMove } | null => {
      let bestForLine: {
        input: RecipeInput;
        measure: DraftStateMeasure;
        move: DraftAdjustmentMove;
      } | null = null;
      for (const toGrams of rungs) {
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
        if (violatesInternalStabilizerProfileAuthority(state, actions[0]!)) continue;
        const applied = applyDraftAdjustment(state, move, constraints);
        if (applied === null) continue;
        const normalized = normalize(applied);
        const next = measure(normalized);
        if (!strictlyBetter(next, best)) continue;
        if (bestForLine !== null && !strictlyBetter(next, bestForLine.measure)) {
          // ENGINE-EQUAL CANDIDATES ONLY. Among rungs the engine scores the
          // same, take the one that keeps more of the user's recipe (owner §8).
          const anchor = candidate.anchorGrams;
          const engineEqual = sameMeasure(next, bestForLine.measure);
          const preferable =
            engineEqual &&
            (lowerUserIntentDrift(next, bestForLine.measure) ||
              (anchor !== null &&
                !lowerUserIntentDrift(bestForLine.measure, next) &&
                Math.abs(toGrams - anchor) < Math.abs(bestForLine.move.toGrams - anchor)));
          if (!preferable) continue;
        }
        bestForLine = { input: normalized, measure: next, move };
      }
      return bestForLine;
    };

    // ── PRESERVE FIRST, DEVIATE ONLY WHEN PROVEN NECESSARY (owner §8 + §12).
    //
    // The ladder is partitioned, not shortened: every rung the search had
    // before is still reachable. What changed is the ORDER OF PROOF. The
    // preserving rungs are searched on their own; the rungs that would
    // materially collapse a positive user line are reached only when the
    // preserving ones leave the recipe out of band, and their result is kept
    // ONLY when it makes the recipe fully LEGAL.
    //
    // Anything weaker was measured to reproduce the owner's defect: accepting
    // a deviation merely for FEWER violations put the dried yolk back at 1 g
    // in cases that ended 4 → 1 violations — PI deleted the ingredient AND
    // still handed back an out-of-band recipe. A 97.5 % reduction that does
    // not even reach a legal recipe is never "necessary"; the honest outcome
    // is the preserved line plus the truthful residual the pipeline already
    // reports.
    //
    // That is the owner's decisive counterexample: a 40 g / Score 10
    // candidate existed, so the 1 g candidate must never have been reachable
    // as ordinary optimization — not because 1 g is forbidden, but because it
    // was never proven necessary.
    const preservingRungs: number[] = [];
    const deviatingRungs: number[] = [];
    for (const toGrams of candidate.testedGrams) {
      (isDeviating(candidate, toGrams) ? deviatingRungs : preservingRungs).push(toGrams);
    }
    let bestForLine = searchRungs(preservingRungs);
    const preservingViolations = bestForLine?.measure.violations ?? best.violations;
    if (deviatingRungs.length > 0 && preservingViolations > 0) {
      const deviating = searchRungs(deviatingRungs);
      if (deviating !== null && deviating.measure.violations === 0) {
        bestForLine = deviating;
        materialDeviationTaken = true;
      }
    }

    if (bestForLine !== null) {
      state = bestForLine.input;
      best = bestForLine.measure;
      moves.push(bestForLine.move);
    }
  }

  if (materiallyBetter(best, args.startMeasure)) {
    return {
      input: state,
      measure: best,
      moves,
      materialUserIntentDeviation: materialDeviationTaken,
    };
  }

  // ── PAIRED (MASS-NEUTRAL) EXCHANGE PASS ────────────────────────────────────
  //
  // Owner P1-A: the single-line pass above is a strict COORDINATE DESCENT, and
  // its batch restoration hands every freed gram to ONE line. That makes whole
  // legal regions unreachable: lowering POD by cutting sucrose pushes the freed
  // mass into milk, which raises lactose past its band, so the total-severity
  // test rejects the move even though POD moved decisively toward the requested
  // Direction band. Measured on the owner Fior di Latte at Sweetness −2:
  // sucrose 89→79 reaches POD 14.67 (from 15.67) but scores severity 6.54 vs
  // 5.33 because a `lactose` violation appears — so the sweep reported a fixed
  // point at 15.67 while engine-legal candidates existed down to POD 12.000.
  //
  // The legal lower region is reached by EXCHANGES — sucrose↓ with dextrose↑,
  // milk↓ with cream↑ — never by a single line moving alone. This pass proposes
  // exactly that: move `delta` grams from one adjustable line to another. It is
  // mass-neutral by construction, so the batch stays exact and the restoration
  // cannot distort the candidate.
  //
  // BOUNDED, not brute force: |lines|² × |ladder| candidates, evaluated once,
  // and only when the single-line pass already failed. Every existing gate is
  // reused unchanged — the ladder, the §17 padlocks, the stabilizer dosage
  // clamp, `increasable` (which carries the P1-B flavour authority: a held
  // flavour accent is never a receiver), and the same engine measure.
  const exchange = sweepPairedExchange(args, state, best);
  if (exchange !== null) {
    return {
      input: exchange.input,
      measure: exchange.measure,
      moves: [...moves, ...exchange.moves],
      materialUserIntentDeviation: materialDeviationTaken,
    };
  }

  if (moves.length === 0) return null;
  // The convergence guard: a sweep that only shaved an immaterial sliver off
  // the engine's severity is NOT another round — it is the fixed point.
  if (!materiallyBetter(best, args.startMeasure)) return null;
  return {
    input: state,
    measure: best,
    moves,
    materialUserIntentDeviation: materialDeviationTaken,
  };
}

/**
 * One bounded pass of mass-neutral two-line exchanges. Returns the best
 * materially-improving exchange, or null when none exists (the honest fixed
 * point). Pure and deterministic: candidates are generated in draft order and
 * ties keep the first.
 */
function sweepPairedExchange(
  args: DraftSweepArgs,
  startState: RecipeInput,
  startBest: DraftStateMeasure,
): DraftSweepResult | null {
  const { set, excludedIngredientIds, constraints, normalize, measure } = args;
  // SCOPE GATE: this pass exists for the Direction defect and costs extra
  // engine evaluations, so it runs ONLY while an exact Direction contract is
  // being chased. Every non-Direction flow — the engine authenticity fixtures,
  // ECO cost sweeps, plain corrections — keeps its previous candidate set and
  // its previous cost byte-for-byte.
  if (startState.goals?.direction_targets_active !== true) return null;
  // Fire ONLY when a Direction preference is the sole remaining residual. That
  // is exactly the coordinate-descent trap this pass exists for, and it keeps
  // every other search — hard-band repair, Main envelopes, stabilizer contracts,
  // ECO cost sweeps — on its previous candidate set and its previous cost.
  if (args.directionOnlyResidual !== true) return null;

  const batch = startState.target_batch_grams;
  // LARGEST EXCHANGE FIRST: the big exchanges are the ones that clear the
  // coordinate-descent trap, and taking them early means the pass converges
  // inside the EXISTING round budget instead of demanding more rounds.
  const deltas = [...DRAFT_ADJUSTMENT_STEP_FRACTIONS]
    .map((fraction) => batch * fraction)
    .filter((grams) => grams >= MIN_MOVE_GRAMS)
    .sort((left, right) => right - left);

  let state = startState;
  let best = startBest;
  const moves: DraftAdjustmentMove[] = [];
  // DETERMINISTIC EVALUATION BUDGET — orchestration only, not a band and not
  // science. It bounds one pass to a fixed number of priced candidates so a
  // Direction round can never grow with recipe size.
  let evaluations = 0;

  // COMPOSING sweep, REPEATED to convergence inside this single round.
  //
  // Each donor contributes its own best exchange and the next donor starts from
  // the improved state, exactly like the single-line sweep composes across
  // lines; the whole thing then repeats while it keeps gaining. This is the
  // deliberate design point: a stronger search must NOT need more rounds, or it
  // would push previously-solvable recipes into `iteration_cap` (measured: the
  // owner 2:1 Multi-Main fixture at Sweetness −2 / Hardness −2). Concentrating
  // the work here keeps MAX_SOLVER_ROUNDS untouched and the owner's cap
  // semantics intact.
  for (let pass = 0; pass < PAIRED_EXCHANGE_MAX_PASSES; pass += 1) {
    if (evaluations >= PAIRED_EXCHANGE_EVALUATION_BUDGET) break;
    const movesBefore = moves.length;
    runComposingPass();
    if (moves.length === movesBefore) break;
  }

  function runComposingPass(): void {
    for (const donorSeed of buildDraftCandidateVector(state, set, excludedIngredientIds)) {
      if (evaluations >= PAIRED_EXCHANGE_EVALUATION_BUDGET) break;
      const vector = buildDraftCandidateVector(state, set, excludedIngredientIds);
      const donor = vector.find((entry) => entry.lineId === donorSeed.lineId);
      if (!donor) continue;

      let bestForDonor: DraftSweepResult | null = null;
      let bestForDonorMeasure = best;

      for (const receiver of vector) {
        if (receiver.lineId === donor.lineId) continue;
        // The receiver must be allowed to GROW. `increasable` is false for an
        // excluded ingredient and for a P1-B held flavour accent, so neither can
        // absorb exchanged mass here.
        if (!receiver.increasable) continue;

        for (const delta of deltas) {
          if (evaluations >= PAIRED_EXCHANGE_EVALUATION_BUDGET) break;
          if (donor.currentGrams - delta < 0) continue;

          const donorMove: DraftAdjustmentMove = {
            lineId: donor.lineId,
            ingredientId: donor.ingredientId,
            ingredientName: donor.ingredientName,
            fromGrams: donor.currentGrams,
            toGrams: donor.currentGrams - delta,
            direction: 'decrease',
            actions: draftAdjustmentActions(donor, donor.currentGrams - delta),
          };
          if (donorMove.actions.length === 0) continue;
          if (violatesInternalStabilizerProfileAuthority(state, donorMove.actions[0]!)) continue;
          const afterDonor = applyDraftAdjustment(state, donorMove, constraints);
          if (afterDonor === null) continue;

          const receiverNow = buildDraftCandidateVector(
            afterDonor,
            set,
            excludedIngredientIds,
          ).find((entry) => entry.lineId === receiver.lineId);
          if (!receiverNow) continue;
          const receiverMove: DraftAdjustmentMove = {
            lineId: receiverNow.lineId,
            ingredientId: receiverNow.ingredientId,
            ingredientName: receiverNow.ingredientName,
            fromGrams: receiverNow.currentGrams,
            toGrams: receiverNow.currentGrams + delta,
            direction: 'increase',
            actions: draftAdjustmentActions(receiverNow, receiverNow.currentGrams + delta),
          };
          if (receiverMove.actions.length === 0) continue;
          if (violatesInternalStabilizerProfileAuthority(afterDonor, receiverMove.actions[0]!))
            continue;
          const exchanged = applyDraftAdjustment(afterDonor, receiverMove, constraints);
          if (exchanged === null) continue;

          evaluations += 1;
          const normalized = normalize(exchanged);
          const next = measure(normalized);
          if (!strictlyBetter(next, bestForDonorMeasure)) continue;
          bestForDonorMeasure = next;
          bestForDonor = { input: normalized, measure: next, moves: [donorMove, receiverMove] };
        }
      }

      if (bestForDonor !== null) {
        state = bestForDonor.input;
        best = bestForDonor.measure;
        moves.push(...bestForDonor.moves);
      }
    }
  }

  if (moves.length === 0) return null;
  return materiallyBetter(best, args.startMeasure) ? { input: state, measure: best, moves } : null;
}
