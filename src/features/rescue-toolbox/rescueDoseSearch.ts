/**
 * THE SMALLEST WINNING WHOLE-GRAM DOSE — bounded, deterministic, two-tier.
 *
 * Owner decision (NAPRAWA 5): „Do not limit the final search to the old probe
 * points 1 / 2 / 4 / 8 %. Those may be starting probes only. The engine must
 * find the smallest winning practical whole-gram dose, including values such as
 * 4 g, 7 g, 13 g."
 *
 * WHY THIS IS TWO TIERS AND NOT ONE LOOP. A dose is only PROVEN by a full
 * Preview — the solver rebalances the batch, re-applies every lock, hold and
 * profile authority, practicalizes to whole grams and re-verifies. Measured on
 * the owner Hardness −2 fixture, one Preview costs on the order of ten seconds,
 * so scanning 80 whole grams for each of seven candidates through Previews would
 * cost thousands of seconds. It is not affordable and it is not necessary.
 *
 * So the search SCREENS cheaply and PROVES expensively:
 *
 *   TIER 1 — the screen. For every whole gram in the permitted window, add the
 *     candidate line at that dose, absorb its mass proportionally out of the
 *     lines a solver is free to move, and price the result with one
 *     `calculateRecipe`. That is sub-millisecond, so the whole window is
 *     scanned at one-gram resolution rather than at four fixed percentages.
 *   TIER 2 — the proof. Only a handful of FINALISTS reach the real Preview, and
 *     nothing is ever accepted on the screen alone.
 *
 * THE SCREEN IS A SCREEN. It is a deterministic approximation of what the solver
 * will do, not a claim about what it will do: it holds Main and locked lines,
 * moves the rest proportionally, and never decides anything by itself. A dose it
 * likes can still fail every hard gate in tier 2, and that is the expected and
 * correct outcome — which is why the finalists always include the smallest
 * improving dose AND the nearest one, so a screen that misranks cannot silently
 * lose the answer.
 *
 * WHAT „SMALLEST WINNING" MEANS HERE, precisely. It is the smallest whole gram
 * in the permitted window whose screened result is materially nearer the
 * requested Direction than the draft itself, measured by the one canonical
 * nearest authority (`directionDistance`). It is a statement about the scanned
 * window at one-gram resolution — a bounded-space statement, not a proof of
 * global optimality.
 */
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  introducesNewViolation,
  isMaterialRescueGain,
  rescueMaterialMeasure,
} from './rescueMaterialImprovement';
import {
  compareDirectionDistance,
  directionDistance,
  requestedDirectionBands,
  type DirectionDistanceMeasure,
  type RequestedDirectionBand,
} from '@/features/recipe-direction/directionBandDistance';
import type { RescueDosageWindow } from './rescueToolboxAuthority';

/**
 * Whole grams priced per candidate by the SCREEN. The permitted window of the
 * widest candidate at a 1000 g batch is 80 g, so this never binds there; it is
 * the guard that keeps a very large batch from turning the screen into the cost
 * it exists to avoid. At 120 evaluations the screen is still roughly three
 * orders of magnitude cheaper than a single Preview.
 */
export const RESCUE_DOSE_SCREEN_BUDGET = 120;

/** Finalists handed to the expensive tier, per candidate. */
export const RESCUE_DOSE_FINALIST_LIMIT = 3;

export interface RescueDoseScreenPoint {
  readonly grams: number;
  readonly distance: DirectionDistanceMeasure;
  readonly violations: number;
  /** True when this dose is legal on the screen AND measurably nearer. */
  readonly improving: boolean;
}

export interface RescueDoseScreenOutcome {
  /** Doses to PROVE, smallest first, deduplicated. Empty when nothing improved. */
  readonly finalists: readonly number[];
  /** Smallest whole gram the screen found materially improving, or null. */
  readonly smallestImprovingGrams: number | null;
  /** The nearest dose the screen found, improving or not. */
  readonly nearestGrams: number | null;
  /** The canonical score of the draft as it stands, for the material test. */
  readonly currentScore: number | null;
  /** The best canonical score any screened dose reached. */
  readonly bestScore: number | null;
  /** Whole grams actually priced. The performance contract reads this. */
  readonly evaluations: number;
  /** True when the chosen finalists include a dose in the controlled range. */
  readonly usesControlledRange: boolean;
}

const EMPTY: RescueDoseScreenOutcome = Object.freeze({
  finalists: Object.freeze([]),
  smallestImprovingGrams: null,
  nearestGrams: null,
  currentScore: null,
  bestScore: null,
  evaluations: 0,
  usesControlledRange: false,
});

/**
 * Add `grams` of `ingredient` and absorb the mass proportionally out of the
 * lines a solver may move, so the screened vector keeps the target batch.
 *
 * Main lines, locked lines and lines carrying poured actuals are NOT touched —
 * the screen must not model a move the solver is forbidden to make. Returns null
 * when there is nothing to absorb the mass with, which is itself information:
 * that dose cannot be screened and is left to the expensive tier.
 */
export function screenedRescueVector(
  input: RecipeInput,
  ingredient: EngineIngredient,
  lineId: string,
  grams: number,
): RecipeInput | null {
  if (!(grams > 0)) return null;
  const movable = input.items.filter(
    (item) => item.lock_type === 'unlocked' && item.actual_grams === null && item.planned_grams > 0,
  );
  const movableMass = movable.reduce((sum, item) => sum + item.planned_grams, 0);
  if (!(movableMass > grams)) return null;
  const factor = (movableMass - grams) / movableMass;
  const movableIds = new Set(movable.map((item) => item.id));
  return {
    ...input,
    items: [
      ...input.items.map((item) =>
        movableIds.has(item.id)
          ? { ...item, planned_grams: item.planned_grams * factor }
          : { ...item },
      ),
      {
        id: lineId,
        ingredient,
        planned_grams: grams,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
    ],
  };
}

export interface RescueDoseScreenArgs {
  readonly input: RecipeInput;
  readonly ingredient: EngineIngredient;
  readonly lineId: string;
  readonly window: RescueDosageWindow;
  /** Bands of the REQUESTED draft. Supplied so one solve derives them once. */
  readonly bands?: readonly RequestedDirectionBand[];
  readonly budget?: number;
}

/**
 * Scan the permitted window at one-gram resolution and return the doses worth
 * proving. Pure and deterministic: the same draft and window always produce the
 * same finalists, in the same order.
 */
export function screenRescueDoses(args: RescueDoseScreenArgs): RescueDoseScreenOutcome {
  const { input, ingredient, lineId, window } = args;
  const bands = args.bands ?? requestedDirectionBands(input);
  if (bands.length === 0) return EMPTY;
  const budget = args.budget ?? RESCUE_DOSE_SCREEN_BUDGET;
  const ceiling = Math.floor(window.permitted.maxGrams + 1e-9);
  // THE FLOOR IS PART OF THE WINDOW. A published dosage authority with a
  // positive minimum — the owner Inulin band starts at 2 % of batch — means
  // doses below it are not smaller answers, they are answers the authority does
  // not permit. Scanning from 1 g there would screen 19 doses that can never be
  // proposed and could report one of them as „the smallest winning dose".
  const floorGrams = Math.max(1, Math.ceil(window.permitted.minGrams - 1e-9));
  if (!(ceiling >= floorGrams)) {
    // An EXACT product-owned dose is a point, not a window, and it is usually
    // fractional (the Gellatti Stabilizer's 2.3 g/kg). Rounding it into a scan
    // would silently change a product-owned dose, so it is passed through whole.
    const exact = window.permitted.minGrams;
    if (exact > 0 && Math.abs(window.permitted.maxGrams - exact) <= 1e-9) {
      return {
        finalists: Object.freeze([exact]),
        smallestImprovingGrams: null,
        nearestGrams: exact,
        currentScore: null,
        bestScore: null,
        evaluations: 0,
        usesControlledRange: false,
      };
    }
    return EMPTY;
  }

  const currentDistance = directionDistance(input, bands);
  // MATERIAL IMPROVEMENT IS NOT ONLY DISTANCE (Owner, NAPRAWA 5). A recipe can
  // REACH its target and still be 9/10, and „Aktualny wynik: 9/10. Dodaj 4 g
  // fruktozy, aby osiągnąć 10/10." is exactly the case the Owner asked for. So a
  // dose is improving when it is strictly nearer OR strictly better on the ONE
  // canonical score — never on a second score invented here.
  const currentScore = recipeFitForInput(input).score;
  const currentMeasure = rescueMaterialMeasure(input);
  // One-gram resolution wherever the window fits the budget; a wider window is
  // scanned on an even stride so the scan still SPANS it rather than stopping
  // half way and pretending the upper half does not exist.
  const span = ceiling - floorGrams + 1;
  const stride = Math.max(1, Math.ceil(span / budget));

  let smallestImprovingGrams: number | null = null;
  let nearestGrams: number | null = null;
  let nearest: DirectionDistanceMeasure | null = null;
  let bestScore: number | null = null;
  let evaluations = 0;

  for (let grams = floorGrams; grams <= ceiling; grams += stride) {
    const candidate = screenedRescueVector(input, ingredient, lineId, grams);
    if (candidate === null) continue;
    evaluations += 1;
    const result = calculateRecipe(candidate);
    const distance = directionDistance(candidate, bands, result);

    if (nearest === null || (compareDirectionDistance(distance, nearest) ?? 0) < 0) {
      nearest = distance;
      nearestGrams = grams;
    }
    const score = recipeFitForInput(candidate, result).score;
    if (score !== null && (bestScore === null || score > bestScore)) bestScore = score;
    // THE ONE MATERIAL TEST, shared with every other NAPRAWA 5 stage. Requiring
    // zero violations here would make a dose unable to help a draft that is
    // ALREADY out of band — which is the main case Rescue exists for — so what
    // is refused is a NEW violated metric, not a pre-existing one.
    const nearerNow = (compareDirectionDistance(distance, currentDistance) ?? 0) < 0;
    const improving =
      (nearerNow || isMaterialRescueGain(input, candidate, currentMeasure, rescueMaterialMeasure(candidate, result))) &&
      !introducesNewViolation(currentMeasure, rescueMaterialMeasure(candidate, result));
    if (improving && smallestImprovingGrams === null) smallestImprovingGrams = grams;
  }

  const finalists: number[] = [];
  const push = (grams: number | null) => {
    if (grams === null) return;
    if (finalists.includes(grams)) return;
    if (finalists.length >= RESCUE_DOSE_FINALIST_LIMIT) return;
    finalists.push(grams);
  };
  // SMALLEST FIRST — the Owner's rule is the smallest dose that wins, not the
  // strongest one. The nearest dose follows it so a screen that misranks cannot
  // lose an answer the expensive tier would have accepted.
  push(smallestImprovingGrams);
  push(nearestGrams);
  finalists.sort((left, right) => left - right);

  return {
    finalists,
    smallestImprovingGrams,
    nearestGrams,
    currentScore,
    bestScore,
    evaluations,
    usesControlledRange: finalists.some(
      (grams) => grams > window.normal.maxGrams + 1e-9,
    ),
  };
}
