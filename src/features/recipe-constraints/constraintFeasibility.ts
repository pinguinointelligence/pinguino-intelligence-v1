/**
 * Constraint-solver feasibility analysis (UI/UX master spec §18) — PURE,
 * deterministic, ENGINE-EVALUATION-BASED. No parallel engine, no new recipe
 * math: every judgement comes from repeated REAL `calculateRecipe` runs and
 * the engine's own exported `detectViolations` / `proposeAutoFix`, all through
 * the public `@/engine` barrel (studioBoundary-compliant).
 *
 * Outcomes (§18.2–§18.5):
 *  - `feasible` — the golden zone holds as-is, or the REAL solver has a
 *    verified full fix WITHOUT touching any constraint;
 *  - `infeasible_with_bound` — one constrained line has a GENUINELY COMPUTED
 *    boundary ("Truskawki zablokowane na 700 g → aby wejść w zakres, maks.
 *    612 g"): found by bisection on that line's grams, emitted ONLY when both
 *    sides are engine-verified (clean at the bound, violating within the
 *    convergence window past it) — never a presentational heuristic (§18.3);
 *  - `conflict_group` — several locks JOINTLY block: no single line has a
 *    boundary, but releasing all of them lets the real solver fully fix, so
 *    the whole group is reported with per-line unlock options and the
 *    solver's own verified change set as evidence (§18.4 — no arbitrary
 *    blame);
 *  - `no_reliable_bound` — the honest §18.5 fallback: budget exhausted before
 *    convergence, or not solvable by constraint changes at all. NEVER a
 *    guessed number.
 *
 * Evaluation budget: hard cap 24 units per analysis. A direct
 * `calculateRecipe` costs 1 unit; a `proposeAutoFix` run is charged a FLAT
 * `PROPOSE_EVALUATION_COST` (a deterministic accounting constant for the
 * solver's own internally-bounded search — not a measurement). When the
 * budget cannot cover the next verification, the analysis stops with the
 * honest fallback instead of emitting an unverified number.
 *
 * Minimal-change preference (§18.3): when several lines yield verified
 * boundaries within budget, the one with the smallest gram change from its
 * current value wins; lines are visited in recipe order (deterministic).
 */
import {
  calculateRecipe,
  detectViolations,
  proposeAutoFix,
  type CorrectionProposal,
  type CorrectionResult,
  type RecipeInput,
  type RecipeItem,
  type RecipeResult,
  type TargetMetric,
  type TargetRange,
} from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  applyConstraintsToRecipe,
  BATCH_SUM_TOLERANCE_G,
  constrainedLineIds,
  constrainedMinimumGrams,
  validateConstraintSet,
} from './constraintSet';
import type {
  ConstraintChange,
  ConstraintConflict,
  ConstraintFeasibilityAnalysis,
  ConstraintSet,
  ConstraintSuggestedAction,
  ConstraintTargetContext,
  FeasibilityBound,
  FeasibilityViolationView,
  IngredientConstraint,
} from './constraintTypes';

/* ── deterministic analysis parameters (settings, not calibration data) ──── */

/** Hard cap on evaluation units per analysis (task/§18.5 honesty rule). */
export const EVALUATION_BUDGET_CAP = 24;
/** Flat accounting charge for one `proposeAutoFix` run (see module header). */
export const PROPOSE_EVALUATION_COST = 8;
/** Bisection convergence window — the clean and violating sides must end up
 * within this many grams for a bound to be emitted (display shows integers). */
export const CONVERGENCE_GRAMS = 0.5;
/** Safety rail on bisection iterations (the budget is the primary limit). */
const MAX_BISECTION_STEPS = 16;

/* ── small pure helpers ──────────────────────────────────────────────────── */

interface EvaluationBudget {
  used: number;
  budget: number;
}

const canSpend = (b: EvaluationBudget, cost: number): boolean => b.used + cost <= b.budget;
const spend = (b: EvaluationBudget, cost: number): void => {
  b.used += cost;
};

/**
 * Immutable per-metric band override on a RecipeResult COPY — the same
 * preview-only seam the optimization feature uses (solverTargetInjection):
 * the engine's `detectViolations` reads bands only from `indicators[].band`,
 * so replacing them on a copy re-targets detection without touching the
 * engine config or the original result.
 */
function withBandOverride(
  result: RecipeResult,
  override: Partial<Record<TargetMetric, TargetRange>> | undefined,
): RecipeResult {
  if (!override) return result;
  const indicators = result.indicators.map((indicator) => {
    const band = override[indicator.key as TargetMetric];
    return band ? { ...indicator, band: { ...band } } : indicator;
  });
  return { ...result, indicators };
}

const toViolationViews = (result: RecipeResult, ctx?: ConstraintTargetContext): FeasibilityViolationView[] =>
  detectViolations(withBandOverride(result, ctx?.targetBandOverride)).map((violation) => ({
    metric: violation.metric,
    direction: violation.direction,
  }));

/** "Clean" = golden zone: zero violations under the (possibly overridden)
 * bands AND no critical engine warning (e.g. machine capacity exceeded). */
function isClean(result: RecipeResult, ctx?: ConstraintTargetContext): boolean {
  if (result.warnings.some((warning) => warning.severity === 'critical')) return false;
  return detectViolations(withBandOverride(result, ctx?.targetBandOverride)).length === 0;
}

const withLineGrams = (input: RecipeInput, lineId: string, grams: number): RecipeInput => ({
  ...input,
  items: input.items.map((item) => (item.id === lineId ? { ...item, planned_grams: grams } : item)),
});

/** One budgeted engine evaluation. Returns null when the budget cannot cover it. */
function evaluateClean(
  input: RecipeInput,
  ctx: ConstraintTargetContext | undefined,
  budget: EvaluationBudget,
): boolean | null {
  if (!canSpend(budget, 1)) return null;
  spend(budget, 1);
  return isClean(calculateRecipe(input), ctx);
}

/**
 * A verified full solver fix: a non-redacted 'correction' proposal with
 * confidence 'high' (engine definition: every violation resolved, no
 * residuals — verified by the solver's own full `calculateRecipe` re-run)
 * that also RESPECTS the constraint intent at the INGREDIENT level: §17 reads
 * "mam dokładnie tyle tego składnika" — so a proposal that ADDS a new line of
 * an ingredient the user locked/ranged (the engine's line-level lock cannot
 * prevent parallel lines) does not count as a fix that leaves the constraints
 * untouched.
 */
function findFullFixProposal(
  result: CorrectionResult,
  constrainedIngredientIds: ReadonlySet<string>,
): CorrectionProposal | null {
  if (result.redacted) return null;
  return (
    result.proposals.find(
      (proposal) =>
        proposal.kind === 'correction' &&
        proposal.confidence === 'high' &&
        proposal.actions.every(
          (action) => action.type !== 'add' || !constrainedIngredientIds.has(action.ingredient_id),
        ),
    ) ?? null
  );
}

/* ── single-line boundary search (§18.2/§18.3) ───────────────────────────── */

interface BisectionOutcome {
  converged: boolean;
  cleanSide: number;
  dirtySide: number;
}

/**
 * Bisection with a maintained BOTH-SIDES-VERIFIED invariant: `cleanSide` has
 * an engine-verified clean evaluation and `dirtySide` an engine-verified
 * violating one at every step. Assumes a single clean/dirty crossing inside
 * the bracket (monotone response); if the response is non-monotone the result
 * is still honest — the returned clean side IS a verified clean point whose
 * verified-violating neighbour lies within the convergence window.
 */
function bisectBoundary(
  makeInput: (grams: number) => RecipeInput,
  cleanStart: number,
  dirtyStart: number,
  ctx: ConstraintTargetContext | undefined,
  budget: EvaluationBudget,
): BisectionOutcome {
  let cleanSide = cleanStart;
  let dirtySide = dirtyStart;
  for (let step = 0; step < MAX_BISECTION_STEPS; step += 1) {
    if (Math.abs(cleanSide - dirtySide) <= CONVERGENCE_GRAMS) {
      return { converged: true, cleanSide, dirtySide };
    }
    const mid = (cleanSide + dirtySide) / 2;
    const clean = evaluateClean(makeInput(mid), ctx, budget);
    if (clean === null) return { converged: false, cleanSide, dirtySide }; // budget
    if (clean) cleanSide = mid;
    else dirtySide = mid;
  }
  return {
    converged: Math.abs(cleanSide - dirtySide) <= CONVERGENCE_GRAMS,
    cleanSide,
    dirtySide,
  };
}

interface LineSearchResult {
  bound: FeasibilityBound | null;
  outOfBudget: boolean;
}

/**
 * Deterministic anchor ladder for one search direction. The clean region
 * along a single ingredient's gram axis is typically an INTERVAL (both "too
 * little" and "too much" violate — engine evidence in the tests), so probing
 * only the far endpoint misses interior clean windows. The ladder probes, in
 * order: the bracket midpoint, the point nearer to the current grams, then
 * the far limit — the first verified-clean anchor seeds the bisection.
 * Points closer than the convergence window to the current grams or to each
 * other are dropped (they could not carry a distinct verified bound).
 */
function anchorLadder(current: number, limit: number): number[] {
  const mid = (current + limit) / 2;
  const nearerCurrent = current + (limit - current) * 0.25;
  const points: number[] = [];
  for (const candidate of [mid, nearerCurrent, limit]) {
    if (Math.abs(candidate - current) <= CONVERGENCE_GRAMS) continue;
    if (points.some((kept) => Math.abs(kept - candidate) <= CONVERGENCE_GRAMS)) continue;
    points.push(candidate);
  }
  return points;
}

/**
 * Search one constrained line for a verified boundary. Downward first (the
 * §18.2 canonical over-locked case, boundType 'max'), then upward within the
 * honest limits (range max, or the batch headroom for a plain lock).
 */
function searchLineBoundary(
  solverInput: RecipeInput,
  line: RecipeItem,
  constraint: IngredientConstraint,
  baseTotalBatchG: number,
  ctx: ConstraintTargetContext | undefined,
  budget: EvaluationBudget,
): LineSearchResult {
  const current = line.planned_grams;
  const makeInput = (grams: number): RecipeInput => withLineGrams(solverInput, line.id, grams);

  const finishBound = (
    boundType: 'max' | 'min',
    outcome: BisectionOutcome,
    lowLimit: number,
    highLimit: number,
  ): LineSearchResult => {
    if (!outcome.converged) return { bound: null, outOfBudget: true };
    const raw = outcome.cleanSide;
    // Honest display rounding: never past the verified-clean side and never
    // outside the constraint's own limits; the rounded value is re-verified by
    // a real evaluation or the raw verified value is used instead. Every
    // emitted number has an engine evaluation behind it.
    let displayGrams = boundType === 'max' ? Math.floor(raw) : Math.ceil(raw);
    if (displayGrams < lowLimit || displayGrams > highLimit) displayGrams = raw;
    if (displayGrams !== raw) {
      const verified = evaluateClean(makeInput(displayGrams), ctx, budget);
      if (verified !== true) displayGrams = raw; // budget out or (non-monotone) dirty
    }
    return {
      bound: {
        lineId: line.id,
        ingredientId: line.ingredient.id,
        ingredientName: line.ingredient.name,
        boundType,
        grams: raw,
        displayGrams,
        displayGramsVerified: true,
        verifiedCleanAtGrams: raw,
        verifiedViolatingAtGrams: outcome.dirtySide,
      },
      outOfBudget: false,
    };
  };

  /** Probe the ladder toward `limit`; on the first clean anchor, bisect
   * between it (verified clean) and the current grams (verified violating by
   * the base evaluation). */
  const searchDirection = (
    limit: number,
    boundType: 'max' | 'min',
  ): LineSearchResult | null => {
    if (Math.abs(current - limit) <= CONVERGENCE_GRAMS) return null;
    for (const anchor of anchorLadder(current, limit)) {
      const clean = evaluateClean(makeInput(anchor), ctx, budget);
      if (clean === null) return { bound: null, outOfBudget: true };
      if (clean) {
        const lowLimit = boundType === 'max' ? Math.min(limit, current) : Math.min(current, limit);
        const highLimit = boundType === 'max' ? current : Math.max(current, limit);
        return finishBound(
          boundType,
          bisectBoundary(makeInput, anchor, current, ctx, budget),
          lowLimit,
          highLimit,
        );
      }
    }
    return null;
  };

  // DOWN → 'max' ("set at most X g")
  const lowLimit = constraint.mode === 'range' ? constraint.minGrams : 0;
  const down = searchDirection(lowLimit, 'max');
  if (down) return down;

  // UP → 'min' ("set at least X g"); a plain lock is capped by the batch
  // headroom so the recommendation never silently blows the target batch.
  const headroom = Math.max(0, solverInput.target_batch_grams - baseTotalBatchG);
  const highLimit = constraint.mode === 'range' ? constraint.maxGrams : current + headroom;
  const up = searchDirection(highLimit, 'min');
  if (up) return up;

  return { bound: null, outOfBudget: false };
}

/* ── the analysis entry point ────────────────────────────────────────────── */

/**
 * Deterministic feasibility analysis of a recipe under its constraint set.
 * Pure: never mutates inputs, never persists, same input ⇒ same output.
 * See the module header for the outcome contract and the honesty rules.
 */
export function analyzeConstraintFeasibility(
  input: RecipeInput,
  set: ConstraintSet,
  ctx?: ConstraintTargetContext,
): ConstraintFeasibilityAnalysis {
  const validation = validateConstraintSet(input, set);
  if (!validation.ok) {
    return { status: 'invalid_constraints', issues: validation.issues, evaluationsUsed: 0 };
  }

  // §17.4 locked-sum sanity — pure arithmetic, no engine evaluation needed.
  const minimumGrams = constrainedMinimumGrams(set);
  if (minimumGrams > input.target_batch_grams + BATCH_SUM_TOLERANCE_G) {
    const conflict: ConstraintConflict = {
      lineIds: constrainedLineIds(set),
      reasonCode: 'locked_sum_exceeds_batch',
      suggestedActions: [{ type: 'change_batch', minimumBatchGrams: minimumGrams }],
    };
    return {
      status: 'conflict_group',
      conflict,
      violationsBefore: [],
      evaluationsUsed: 0,
    };
  }

  const appliedResult = applyConstraintsToRecipe(input, set);
  if (!appliedResult.ok) {
    // unreachable after validateConstraintSet, kept as an honest guard
    return { status: 'invalid_constraints', issues: appliedResult.issues, evaluationsUsed: 0 };
  }
  const solverInput = appliedResult.input;

  const requestedBudget = Number.isFinite(ctx?.maxEvaluations)
    ? (ctx?.maxEvaluations as number)
    : EVALUATION_BUDGET_CAP;
  const budget: EvaluationBudget = {
    used: 0,
    budget: Math.max(1, Math.min(requestedBudget, EVALUATION_BUDGET_CAP)),
  };

  // Base evaluation (always affordable: budget ≥ 1).
  spend(budget, 1);
  const baseResult = calculateRecipe(solverInput);
  const violationsBefore = toViolationViews(baseResult, ctx);

  if (violationsBefore.length === 0 && !baseResult.warnings.some((w) => w.severity === 'critical')) {
    return {
      status: 'feasible',
      alreadyInBand: true,
      viaSolverProposal: false,
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }

  // The lines this layer may honestly vary (locked | range, no actuals).
  const adjustableNotes = new Set([
    'locked_exact',
    'locked_main_kept',
    'range_held_at_current',
    'range_main_kept',
  ]);
  const adjustableLineIds = appliedResult.applied
    .filter((entry) => adjustableNotes.has(entry.note))
    .map((entry) => entry.lineId);
  const lineByIdForIngredients = new Map(solverInput.items.map((item) => [item.id, item]));
  const ingredientIdsOf = (lineIds: readonly string[]): ReadonlySet<string> =>
    new Set(
      lineIds
        .map((lineId) => lineByIdForIngredients.get(lineId)?.ingredient.id)
        .filter((id): id is string => id !== undefined),
    );
  const constrainedIngredientIds = ingredientIdsOf(adjustableLineIds);

  // Solver probe WITH constraints in place: if the real solver already has a
  // verified full fix, the constraints are NOT the blocker (§18.2 requires the
  // reported cause to be genuine) — feasible, nothing to blame.
  if (!canSpend(budget, PROPOSE_EVALUATION_COST)) {
    return {
      status: 'no_reliable_bound',
      reasonCode: 'evaluation_budget_exhausted',
      lineIds: adjustableLineIds,
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }
  spend(budget, PROPOSE_EVALUATION_COST);
  const withLocksProbe = proposeAutoFix({
    input: solverInput,
    context: recipeContext(solverInput),
    exactCorrectionGrams: true,
    targetBandOverride: ctx?.targetBandOverride,
  });
  if (findFullFixProposal(withLocksProbe, constrainedIngredientIds)) {
    return {
      status: 'feasible',
      alreadyInBand: false,
      viaSolverProposal: true,
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }

  if (adjustableLineIds.length === 0) {
    return {
      status: 'no_reliable_bound',
      reasonCode: 'no_constraints_to_analyze',
      lineIds: [],
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }

  // Single-line boundary search, recipe order, minimal-change preference.
  const lineById = new Map(solverInput.items.map((item) => [item.id, item]));
  let bestBound: FeasibilityBound | null = null;
  let ranOutOfBudget = false;
  for (const lineId of adjustableLineIds) {
    const line = lineById.get(lineId);
    const constraint = set.byLineId[lineId];
    if (!line || !constraint || constraint.mode === 'ai') continue;
    const { bound, outOfBudget } = searchLineBoundary(
      solverInput,
      line,
      constraint,
      baseResult.total_batch_g,
      ctx,
      budget,
    );
    if (outOfBudget) {
      ranOutOfBudget = true;
      break;
    }
    if (bound) {
      const change = Math.abs(line.planned_grams - bound.grams);
      const bestChange = bestBound
        ? Math.abs((lineById.get(bestBound.lineId)?.planned_grams ?? 0) - bestBound.grams)
        : Number.POSITIVE_INFINITY;
      if (change < bestChange) bestBound = bound;
    }
  }

  if (bestBound) {
    const suggestedActions: ConstraintSuggestedAction[] = [
      bestBound.boundType === 'max'
        ? { type: 'set_max', lineId: bestBound.lineId, grams: bestBound.displayGrams }
        : { type: 'set_min', lineId: bestBound.lineId, grams: bestBound.displayGrams },
      { type: 'unlock', lineId: bestBound.lineId },
    ];
    return {
      status: 'infeasible_with_bound',
      bound: bestBound,
      conflict: {
        lineIds: [bestBound.lineId],
        reasonCode: 'single_lock_boundary',
        suggestedActions,
      },
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }

  // No single-line boundary. Group probe: release every user constraint that
  // was actually holding a line and let the REAL solver try a full fix.
  const releasableNotes = new Set(['locked_exact', 'range_held_at_current']);
  const releasableLineIds = new Set(
    appliedResult.applied
      .filter((entry) => releasableNotes.has(entry.note))
      .map((entry) => entry.lineId),
  );
  if (ranOutOfBudget || !canSpend(budget, PROPOSE_EVALUATION_COST) || releasableLineIds.size === 0) {
    return {
      status: 'no_reliable_bound',
      reasonCode:
        ranOutOfBudget || !canSpend(budget, PROPOSE_EVALUATION_COST)
          ? 'evaluation_budget_exhausted'
          : 'not_solvable_by_constraint_changes',
      lineIds: adjustableLineIds,
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }
  spend(budget, PROPOSE_EVALUATION_COST);
  const releasedInput: RecipeInput = {
    ...solverInput,
    items: solverInput.items.map((item) =>
      releasableLineIds.has(item.id) ? { ...item, lock_type: 'unlocked' } : item,
    ),
  };
  const releasedProbe = proposeAutoFix({
    input: releasedInput,
    context: recipeContext(releasedInput),
    exactCorrectionGrams: true,
    targetBandOverride: ctx?.targetBandOverride,
  });
  // The released evidence presupposes unlocking the released lines, so only
  // the ingredients of constraints that REMAIN in force are filtered here.
  const releasedIngredientIds = ingredientIdsOf([...releasableLineIds]);
  const remainingConstrainedIngredientIds = new Set(
    [...constrainedIngredientIds].filter((ingredientId) => !releasedIngredientIds.has(ingredientId)),
  );
  const releasedFix = findFullFixProposal(releasedProbe, remainingConstrainedIngredientIds);
  if (releasedFix) {
    const changes: ConstraintChange[] = releasedFix.actions.map((action) => ({
      type: action.type,
      ingredientName: action.ingredient_name,
      grams: action.grams,
      ...(action.target_line_id !== undefined ? { lineId: action.target_line_id } : {}),
    }));
    const groupLineIds = [...releasableLineIds];
    return {
      status: 'conflict_group',
      conflict: {
        lineIds: groupLineIds,
        reasonCode: 'locks_jointly_block',
        suggestedActions: [
          ...groupLineIds.map((lineId): ConstraintSuggestedAction => ({ type: 'unlock', lineId })),
          { type: 'multiple_changes', changes },
        ],
      },
      violationsBefore,
      evaluationsUsed: budget.used,
    };
  }

  return {
    status: 'no_reliable_bound',
    reasonCode: 'not_solvable_by_constraint_changes',
    lineIds: adjustableLineIds,
    violationsBefore,
    evaluationsUsed: budget.used,
  };
}
