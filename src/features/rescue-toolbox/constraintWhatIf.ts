/**
 * CONSTRAINT WHAT-IF RESCUE — a simulation, never a mutation.
 *
 * Owner decision (NAPRAWA 5): „The real solve must always respect the customer's
 * current constraints. A customer lock remains hard until the customer
 * explicitly agrees to change it. However, Rescue may run a separate
 * counterfactual simulation showing what would become possible if one
 * customer-owned constraint changed."
 *
 *   „Przy blokadzie dekstrozy na 20 g najlepszy wynik to 8/10.
 *    Pozwól zwiększyć ją do 24 g, aby osiągnąć 10/10."
 *
 * THE TWO RULES THIS MODULE EXISTS TO KEEP APART.
 *
 * 1. NOTHING HERE TOUCHES LIVE STATE. Every function is pure and returns a
 *    PROPOSAL. The shadow vector it measures is never the vector anyone gets:
 *    after the customer consents, the caller applies the change through the
 *    canonical constraint action, runs a FRESH normal Preview and verifies the
 *    promised result. A simulation result is never copied into live state, which
 *    is why nothing in this file returns one.
 *
 * 2. ONLY A CUSTOMER-OWNED CONSTRAINT MAY BE PROPOSED FOR CHANGE. Safety,
 *    structural and calibration limits, machine and process limits, profile
 *    identity, ProductBehavior and physical validity are never offered for
 *    relaxation — not at a lower rank, not at all. The discriminator is
 *    authority, not value: a `structural` range is owned by verified formulation
 *    science, a solver-projected hold is orchestration state that the customer
 *    never set, and `main` / `required` / `already_added` lines are not
 *    preferences. What remains — a grams lock, a percent lock, a range the
 *    customer drew, and an ingredient the customer excluded — is theirs, and
 *    only theirs is proposed.
 *
 * MAIN / CROWN IS DIAGNOSED, NEVER PROPOSED. When a materially better result
 * would need Main or Crown authority changed, that is recorded as a finding and
 * carried to the open-question package. This module will not offer it.
 */
import { calculateRecipe, type RecipeInput, type RecipeItem } from '@/engine';
import {
  isMaterialRescueGain,
  rescueMaterialMeasure,
} from './rescueMaterialImprovement';
import type { ConstraintSet, IngredientConstraint } from '@/features/recipe-constraints';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  directionDistance,
  requestedDirectionBands,
  type RequestedDirectionBand,
} from '@/features/recipe-direction/directionBandDistance';

/** The kinds of customer-owned rule a what-if may address. */
export type ConstraintWhatIfKind =
  | 'grams_lock'
  | 'percent_lock'
  | 'customer_range'
  | 'excluded_ingredient';

/** Why a line was NOT offered, so „we did not look" is never mistaken for
 *  „there is nothing there". */
export type ConstraintWhatIfSkipReason =
  | 'not_customer_owned'
  | 'structural_limit'
  | 'main_or_crown_authority'
  | 'physically_added'
  | 'no_better_value_found';

export interface ConstraintWhatIfProposal {
  readonly lineId: string;
  readonly canonicalIngredientId: string;
  readonly namePl: string;
  readonly kind: ConstraintWhatIfKind;
  /** The customer's rule as it stands today, verbatim. */
  readonly current: IngredientConstraint;
  /** The rule being proposed. Applied only after explicit consent. */
  readonly proposed: IngredientConstraint;
  readonly currentGrams: number;
  readonly proposedGrams: number;
  readonly scoreBefore: number | null;
  readonly scoreAfter: number | null;
  readonly distanceBefore: number;
  readonly distanceAfter: number;
  readonly targetReachedBefore: boolean;
  readonly targetReachedAfter: boolean;
  /** Direction axes the change actually moves, for truthful copy. */
  readonly affectedAxes: readonly string[];
}

export interface ConstraintWhatIfSkip {
  readonly lineId: string;
  readonly reason: ConstraintWhatIfSkipReason;
}

export interface ConstraintWhatIfReport {
  /** Ranked best first. Empty is a truthful answer, not a failure. */
  readonly proposals: readonly ConstraintWhatIfProposal[];
  readonly skipped: readonly ConstraintWhatIfSkip[];
  /** Whole shadow vectors priced. The performance contract reads this. */
  readonly evaluations: number;
  /** True when a materially better result would need Main or Crown changed.
   *  Diagnosed and recorded; never proposed. */
  readonly blockedByMainAuthority: boolean;
}

/** Shadow values priced per constrained line. Bounded and deterministic. */
export const CONSTRAINT_WHAT_IF_STEPS = 12;

const EPS = 1e-9;

/**
 * Is this line's rule the CUSTOMER'S to change?
 *
 * A constraint reaches here only from the set the caller passes in, which is the
 * persisted §17 customer set — solver-projected holds live in a separate set
 * that is never persisted and never arrives here. On top of that: a `structural`
 * range is owned by formulation science, and a Main, required or already-added
 * line is not a preference at all.
 */
export function customerOwnedConstraint(
  item: RecipeItem,
  constraint: IngredientConstraint | undefined,
): { owned: false; reason: ConstraintWhatIfSkipReason } | { owned: true; kind: ConstraintWhatIfKind } {
  if (item.actual_grams !== null) return { owned: false, reason: 'physically_added' };
  if (item.lock_type === 'main' || item.lock_type === 'required') {
    return { owned: false, reason: 'main_or_crown_authority' };
  }
  if (item.lock_type === 'already_added') return { owned: false, reason: 'physically_added' };
  if (constraint === undefined || constraint.mode === 'ai') {
    return { owned: false, reason: 'not_customer_owned' };
  }
  if (constraint.mode === 'range' && constraint.structural === true) {
    return { owned: false, reason: 'structural_limit' };
  }
  if (constraint.mode === 'locked') return { owned: true, kind: 'grams_lock' };
  if (constraint.mode === 'percent') return { owned: true, kind: 'percent_lock' };
  return { owned: true, kind: 'customer_range' };
}

/** The grams a constraint pins this line to today, or null when it is a window. */
const constrainedGrams = (
  constraint: IngredientConstraint,
  batchGrams: number,
  plannedGrams: number,
): number => {
  if (constraint.mode === 'locked') return constraint.grams;
  if (constraint.mode === 'percent') return (constraint.percent / 100) * batchGrams;
  return plannedGrams;
};

/** The rule that would replace the customer's, expressed in their own vocabulary. */
const proposedConstraint = (
  current: IngredientConstraint,
  grams: number,
  batchGrams: number,
): IngredientConstraint => {
  if (current.mode === 'locked') return { mode: 'locked', grams };
  if (current.mode === 'percent') return { mode: 'percent', percent: (grams / batchGrams) * 100 };
  if (current.mode === 'range') {
    return {
      mode: 'range',
      minGrams: Math.min(current.minGrams, grams),
      maxGrams: Math.max(current.maxGrams, grams),
    };
  }
  return current;
};

/**
 * The shadow vector: this one line moved to `grams`, the mass absorbed
 * proportionally out of the lines a solver may move. Main, locked, poured and
 * otherwise constrained lines are held — a what-if changes exactly ONE customer
 * rule, never several at once.
 */
export function shadowConstraintVector(
  input: RecipeInput,
  set: ConstraintSet,
  lineId: string,
  grams: number,
): RecipeInput | null {
  const target = input.items.find((item) => item.id === lineId);
  if (target === undefined || !(grams >= 0)) return null;
  const delta = grams - target.planned_grams;
  if (Math.abs(delta) < EPS) return null;
  const movable = input.items.filter(
    (item) =>
      item.id !== lineId &&
      item.lock_type === 'unlocked' &&
      item.actual_grams === null &&
      item.planned_grams > 0 &&
      (set.byLineId[item.id] === undefined || set.byLineId[item.id]!.mode === 'ai'),
  );
  const movableMass = movable.reduce((sum, item) => sum + item.planned_grams, 0);
  if (!(movableMass > delta)) return null;
  const factor = (movableMass - delta) / movableMass;
  if (!(factor > 0)) return null;
  const movableIds = new Set(movable.map((item) => item.id));
  return {
    ...input,
    items: input.items.map((item) => {
      if (item.id === lineId) return { ...item, planned_grams: grams };
      if (movableIds.has(item.id)) {
        return { ...item, planned_grams: item.planned_grams * factor };
      }
      return { ...item };
    }),
  };
}

export interface ConstraintWhatIfArgs {
  readonly input: RecipeInput;
  readonly set: ConstraintSet;
  readonly bands?: readonly RequestedDirectionBand[];
  readonly steps?: number;
  /** Upper bound a shadow value may reach, as a multiple of the current value.
   *  Bounded on purpose: a what-if suggests a nearby change a customer would
   *  recognise, never a different recipe. */
  readonly spread?: number;
}

const DEFAULT_SPREAD = 1.5;

/**
 * Simulate what ONE customer-owned constraint change would make possible.
 *
 * Pure. Returns proposals ranked best first. Nothing is applied, nothing is
 * mutated, and the caller must obtain explicit consent and then re-solve
 * normally before any of this becomes real.
 */
export function simulateConstraintWhatIf(args: ConstraintWhatIfArgs): ConstraintWhatIfReport {
  const { input, set } = args;
  const bands = args.bands ?? requestedDirectionBands(input);
  const steps = args.steps ?? CONSTRAINT_WHAT_IF_STEPS;
  const spread = args.spread ?? DEFAULT_SPREAD;
  const batch = input.target_batch_grams;
  const baseResult = calculateRecipe(input);
  const baseDistance = directionDistance(input, bands, baseResult);
  const baseScore = recipeFitForInput(input, baseResult).score;
  const baseMeasure = rescueMaterialMeasure(input, baseResult);
  const baseReached = bands.length > 0 && baseDistance.missedAxes === 0;

  const proposals: ConstraintWhatIfProposal[] = [];
  const skipped: ConstraintWhatIfSkip[] = [];
  let evaluations = 0;
  let blockedByMainAuthority = false;

  for (const item of input.items) {
    const constraint = set.byLineId[item.id];
    const ownership = customerOwnedConstraint(item, constraint);
    if (!ownership.owned) {
      // Only record a skip for a line that actually carries a rule — an
      // unconstrained line is simply ordinary optimization, not a what-if.
      if (constraint !== undefined && constraint.mode !== 'ai') {
        skipped.push({ lineId: item.id, reason: ownership.reason });
        if (ownership.reason === 'main_or_crown_authority') blockedByMainAuthority = true;
      }
      continue;
    }
    const current = constraint!;
    const currentGrams = constrainedGrams(current, batch, item.planned_grams);
    const ceiling = currentGrams * spread;
    const floor = currentGrams / spread;
    if (!(ceiling > floor)) continue;

    let best: ConstraintWhatIfProposal | null = null;
    for (let step = 0; step <= steps; step += 1) {
      const raw = floor + ((ceiling - floor) * step) / steps;
      const grams = Math.round(raw);
      if (Math.abs(grams - currentGrams) < 1) continue;
      const shadow = shadowConstraintVector(input, set, item.id, grams);
      if (shadow === null) continue;
      evaluations += 1;
      const result = calculateRecipe(shadow);
      const distance = directionDistance(shadow, bands, result);
      const score = recipeFitForInput(shadow, result).score;
      // THE ONE MATERIAL TEST. It refuses anything that introduces a new
      // violated metric, and otherwise accepts exactly what the Owner listed:
      // a canonical score gain, the same result inside normal ranges instead of
      // the controlled envelope, or the repository's existing measured evidence
      // rule. A draft that is ALREADY out of band is not thereby beyond help —
      // requiring zero violations here made every proposal on such a draft
      // impossible, which is the opposite of what Rescue is for.
      if (!isMaterialRescueGain(input, shadow, baseMeasure, rescueMaterialMeasure(shadow, result))) {
        continue;
      }
      const candidate: ConstraintWhatIfProposal = {
        lineId: item.id,
        canonicalIngredientId: canonicalIngredientId(item.ingredient),
        namePl: item.ingredient.name,
        kind: ownership.kind,
        current,
        proposed: proposedConstraint(current, grams, batch),
        currentGrams,
        proposedGrams: grams,
        scoreBefore: baseScore,
        scoreAfter: score,
        distanceBefore: baseDistance.total,
        distanceAfter: distance.total,
        targetReachedBefore: baseReached,
        targetReachedAfter: bands.length > 0 && distance.missedAxes === 0,
        affectedAxes: distance.perAxis
          .filter((axis, index) => axis.distance !== baseDistance.perAxis[index]?.distance)
          .map((axis) => axis.axis),
      };
      if (best === null || betterProposal(candidate, best)) best = candidate;
    }
    if (best === null) {
      skipped.push({ lineId: item.id, reason: 'no_better_value_found' });
      continue;
    }
    proposals.push(best);
  }

  proposals.sort((left, right) => (betterProposal(left, right) ? -1 : 1));
  return { proposals, skipped, evaluations, blockedByMainAuthority };
}

/**
 * Which of two proposals is the better ASK of the customer.
 *
 * The same order the Owner set for candidates, applied to a constraint change:
 * target reached, then canonical score, then canonical distance — and only then,
 * as the tie-break that matters here, the SMALLEST change to the customer's own
 * rule. Asking for 24 g instead of 20 g is a better ask than asking for 30 g
 * when both reach the same result.
 */
function betterProposal(left: ConstraintWhatIfProposal, right: ConstraintWhatIfProposal): boolean {
  if (left.targetReachedAfter !== right.targetReachedAfter) return left.targetReachedAfter;
  const leftScore = left.scoreAfter ?? -1;
  const rightScore = right.scoreAfter ?? -1;
  if (leftScore !== rightScore) return leftScore > rightScore;
  if (Math.abs(left.distanceAfter - right.distanceAfter) > EPS) {
    return left.distanceAfter < right.distanceAfter;
  }
  const leftAsk = Math.abs(left.proposedGrams - left.currentGrams);
  const rightAsk = Math.abs(right.proposedGrams - right.currentGrams);
  if (Math.abs(leftAsk - rightAsk) > EPS) return leftAsk < rightAsk;
  return left.lineId < right.lineId;
}
