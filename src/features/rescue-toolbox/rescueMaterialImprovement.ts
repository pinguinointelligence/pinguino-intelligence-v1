/**
 * IS THIS CANDIDATE MATERIALLY BETTER? — one definition, composed from the one
 * that already exists.
 *
 * Owner decision (NAPRAWA 5): „Do not recommend new ingredients for cosmetic
 * changes." A recommendation is material when it raises the canonical score,
 * reaches a missed Direction target, removes controlled relaxation, removes a
 * real technical defect, removes a hard-but-repairable operational violation,
 * materially reduces canonical target distance, or produces a strictly better
 * profile-preserving legal result. And: „Use existing canonical score and
 * distance authorities. Do not create a second customer score."
 *
 * So this file creates none. `rescueIngredientAdvisor` already owns a considered
 * evidence rule with measured thresholds — `isMaterialRescueImprovement` for a
 * Direction request and `isMaterialOperationalImprovement` for its Direction-free
 * twin — and this COMPOSES that rule instead of forking it. What it adds is the
 * two clauses the Owner named that the older rule predates:
 *
 *   - a strict gain on the ONE canonical score (`recipeFitForInput`), which is
 *     how „Aktualny wynik: 9/10 → 10/10" is recognised on a recipe that already
 *     REACHED its target and therefore has no severity left to cut;
 *   - leaving the approved controlled envelope for the normal one at an equal
 *     result, which is how „ten sam cel w standardowym zakresie" is recognised.
 *
 * Both are guarded by the same honesty rule as the old one: an improvement that
 * introduces a NEW violated metric is not an improvement. Reaching one axis by
 * breaking something else is exactly what these thresholds exist to refuse.
 */
import { calculateRecipe, detectViolations, type RecipeInput, type RecipeResult } from '@/engine';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { relaxedOwnerRanges } from '@/features/recipe-direction/relaxableRangePolicy';
import {
  isMaterialOperationalImprovement,
  isMaterialRescueImprovement,
  measureRescueOutcome,
} from '@/features/constraint-studio/rescueIngredientAdvisor';

export interface RescueMaterialMeasure {
  readonly score: number | null;
  readonly violatedMetrics: readonly string[];
  readonly usesControlledRelaxation: boolean;
}

export function rescueMaterialMeasure(
  input: RecipeInput,
  result: RecipeResult = calculateRecipe(input),
): RescueMaterialMeasure {
  return {
    score: recipeFitForInput(input, result).score,
    violatedMetrics: detectViolations(result).map((violation) => violation.metric),
    usesControlledRelaxation: relaxedOwnerRanges(input).length > 0,
  };
}

/**
 * Did this candidate break something the draft had not already broken?
 *
 * Count alone is not enough — swapping one violated metric for another keeps the
 * count and is still a new defect — so the test is set containment.
 */
export function introducesNewViolation(
  before: RescueMaterialMeasure,
  after: RescueMaterialMeasure,
): boolean {
  const known = new Set(before.violatedMetrics);
  return after.violatedMetrics.some((metric) => !known.has(metric));
}

/**
 * THE ONE MATERIAL TEST used by every NAPRAWA 5 search stage.
 *
 * `before`/`after` are the drafts; the measures are passed in when the caller
 * already has them, because these run once per screened dose.
 */
export function isMaterialRescueGain(
  before: RecipeInput,
  after: RecipeInput,
  beforeMeasure: RescueMaterialMeasure = rescueMaterialMeasure(before),
  afterMeasure: RescueMaterialMeasure = rescueMaterialMeasure(after),
): boolean {
  // Never at the cost of a new defect. This binds before anything else.
  if (introducesNewViolation(beforeMeasure, afterMeasure)) return false;

  // 1. The canonical score rose. This is the „9/10 → 10/10" clause, and it is
  //    the ONE canonical score — no second customer score is computed here.
  if (
    afterMeasure.score !== null &&
    beforeMeasure.score !== null &&
    afterMeasure.score > beforeMeasure.score
  ) {
    return true;
  }
  // 2. The same result, reached inside NORMAL ranges instead of the approved
  //    controlled envelope. Equal score is enough: the better route is the one
  //    that needs no emergency envelope at all.
  if (
    beforeMeasure.usesControlledRelaxation &&
    !afterMeasure.usesControlledRelaxation &&
    afterMeasure.score !== null &&
    beforeMeasure.score !== null &&
    afterMeasure.score >= beforeMeasure.score
  ) {
    return true;
  }
  // 3. The repository's existing evidence rule, unchanged and still in force:
  //    a newly reached axis at no extra severity, or a measured severity cut of
  //    at least its absolute and relative margins — for a Direction request and
  //    for its Direction-free operational twin alike.
  const currentOutcome = measureRescueOutcome(before);
  const rescueOutcome = measureRescueOutcome(after);
  return (
    isMaterialRescueImprovement(currentOutcome, rescueOutcome) ||
    isMaterialOperationalImprovement(currentOutcome, rescueOutcome)
  );
}
