/**
 * BOUNDED PAIR RESCUE — only after every single candidate has failed.
 *
 * Owner decision (NAPRAWA 5): „After evaluating all single candidates: if no
 * single candidate materially solves or improves the target, allow a tightly
 * bounded two-ingredient search among the best compatible candidates." And:
 * „do not hard-code those pairs".
 *
 * So nothing here names Fructose + Inulin or any other combination. A pair is
 * whatever two admissible candidates the single-candidate stage ranked highest,
 * and the only thing this module adds is the arithmetic of combining them.
 *
 * WHY IT FITS THE PERFORMANCE CONTRACT. The expensive thing in Rescue is the
 * Preview, and this stage prices none: it works entirely in the cheap screen
 * tier that `rescueDoseSearch` established, and hands at most a couple of
 * FINALIST pairs to the caller to prove. The budget is therefore a small number
 * of `calculateRecipe` calls, not a combinatorial explosion:
 *
 *     top-K candidates          3      ->  3 unordered pairs
 *     doses carried per side    2      ->  4 combinations per pair
 *     screened vectors          <= 12
 *
 * Twelve `calculateRecipe` calls is roughly a thousandth of one Preview. The
 * bound is enforced, not merely intended: `RESCUE_PAIR_SCREEN_BUDGET` caps the
 * total and the search stops when it is spent.
 *
 * EVERY GATE STILL BINDS. A pair is built only from candidates the caller has
 * already found admissible — so profile identity, base route and the vegan
 * authority have all spoken — and a pair vector is accepted here only when it
 * introduces no new violated metric and is materially better by the ONE shared
 * material test. Hard legality is then re-proved by the Preview, as always.
 */
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import {
  directionDistance,
  requestedDirectionBands,
  type RequestedDirectionBand,
} from '@/features/recipe-direction/directionBandDistance';
import { screenedRescueVectorFor, type RescueAddition } from './rescueDoseSearch';
import {
  introducesNewViolation,
  isMaterialRescueGain,
  rescueMaterialMeasure,
} from './rescueMaterialImprovement';

/** Candidates carried into the pair stage, best first. */
export const RESCUE_PAIR_TOP_K = 3;
/** Doses carried per side. The smallest improving one and the nearest one. */
export const RESCUE_PAIR_DOSES_PER_SIDE = 2;
/** Hard cap on screened pair vectors. Measured, and enforced. */
export const RESCUE_PAIR_SCREEN_BUDGET = 12;

export interface RescuePairCandidate {
  readonly canonicalIngredientId: string;
  readonly ingredient: EngineIngredient;
  readonly lineId: string;
  /** Doses this candidate's own screen thought worth proving, smallest first. */
  readonly doses: readonly number[];
}

export interface RescuePairResult {
  readonly left: RescuePairCandidate;
  readonly right: RescuePairCandidate;
  readonly leftGrams: number;
  readonly rightGrams: number;
  readonly distance: number;
  readonly score: number | null;
}

export interface RescuePairReport {
  /** Pairs worth PROVING, best first. Never accepted on the screen alone. */
  readonly finalists: readonly RescuePairResult[];
  readonly evaluations: number;
  readonly budgetExhausted: boolean;
  /** True when the stage ran at all. False means singles already succeeded. */
  readonly attempted: boolean;
}

const NOT_ATTEMPTED: RescuePairReport = Object.freeze({
  finalists: Object.freeze([]),
  evaluations: 0,
  budgetExhausted: false,
  attempted: false,
});

export interface RescuePairArgs {
  readonly input: RecipeInput;
  /** Admissible candidates, already ranked by the single-candidate stage. */
  readonly candidates: readonly RescuePairCandidate[];
  /** Singles already found a material improvement — the stage must not run. */
  readonly singlesSucceeded: boolean;
  readonly bands?: readonly RequestedDirectionBand[];
  readonly budget?: number;
  readonly topK?: number;
  readonly dosesPerSide?: number;
}

/**
 * Search compatible PAIRS, after and only after singles have failed.
 *
 * Pure and deterministic: the same candidates in the same order always produce
 * the same finalists.
 */
export function searchRescuePairs(args: RescuePairArgs): RescuePairReport {
  // „run only after single candidates fail" — enforced here rather than trusted
  // to the caller, so no future call site can quietly reorder the stages.
  if (args.singlesSucceeded) return NOT_ATTEMPTED;
  const { input } = args;
  const bands = args.bands ?? requestedDirectionBands(input);
  if (bands.length === 0) return NOT_ATTEMPTED;
  const topK = args.topK ?? RESCUE_PAIR_TOP_K;
  const dosesPerSide = args.dosesPerSide ?? RESCUE_PAIR_DOSES_PER_SIDE;
  let budget = args.budget ?? RESCUE_PAIR_SCREEN_BUDGET;

  const pool = args.candidates.slice(0, topK).filter((candidate) => candidate.doses.length > 0);
  if (pool.length < 2) {
    return { finalists: [], evaluations: 0, budgetExhausted: false, attempted: true };
  }

  const baseResult = calculateRecipe(input);
  const baseMeasure = rescueMaterialMeasure(input, baseResult);

  const results: RescuePairResult[] = [];
  let evaluations = 0;
  let budgetExhausted = false;

  for (let i = 0; i < pool.length && !budgetExhausted; i += 1) {
    for (let j = i + 1; j < pool.length && !budgetExhausted; j += 1) {
      const left = pool[i]!;
      const right = pool[j]!;
      // A pair of the SAME canonical ingredient is one line, not two.
      if (left.canonicalIngredientId === right.canonicalIngredientId) continue;
      for (const leftGrams of left.doses.slice(0, dosesPerSide)) {
        for (const rightGrams of right.doses.slice(0, dosesPerSide)) {
          if (budget <= 0) {
            budgetExhausted = true;
            break;
          }
          budget -= 1;
          const additions: RescueAddition[] = [
            { ingredient: left.ingredient, lineId: left.lineId, grams: leftGrams },
            { ingredient: right.ingredient, lineId: right.lineId, grams: rightGrams },
          ];
          const vector = screenedRescueVectorFor(input, additions);
          if (vector === null) continue;
          evaluations += 1;
          const result = calculateRecipe(vector);
          const measure = rescueMaterialMeasure(vector, result);
          if (introducesNewViolation(baseMeasure, measure)) continue;
          if (!isMaterialRescueGain(input, vector, baseMeasure, measure)) continue;
          results.push({
            left,
            right,
            leftGrams,
            rightGrams,
            distance: directionDistance(vector, bands, result).total,
            score: measure.score,
          });
        }
        if (budgetExhausted) break;
      }
    }
  }

  // The Owner's ranking, applied to a pair: better canonical score first, then
  // nearer, then the smaller total addition — two ingredients are already one
  // more than the customer had, so the lighter hand wins ties.
  results.sort((leftResult, rightResult) => {
    const scoreDelta = (rightResult.score ?? -1) - (leftResult.score ?? -1);
    if (scoreDelta !== 0) return scoreDelta;
    const distanceDelta = leftResult.distance - rightResult.distance;
    if (Math.abs(distanceDelta) > 1e-9) return distanceDelta;
    return (
      leftResult.leftGrams +
      leftResult.rightGrams -
      (rightResult.leftGrams + rightResult.rightGrams)
    );
  });

  return {
    finalists: results.slice(0, 2),
    evaluations,
    budgetExhausted,
    attempted: true,
  };
}
