import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  buildRecipeDirectionPlan,
  resultWithRecipeDirectionTargets,
} from './recipeDirectionTargets';
import { directionDistance, requestedDirectionBands } from './directionBandDistance';
import { sorbetProjectionRole } from './sorbetDirectionRoles';

export { sorbetProjectionRole, type SorbetProjectionRole } from './sorbetDirectionRoles';

/**
 * MAIN-CONSTRAINED NEAREST Direction search for the canonical Sorbet scaffold
 * (owner authority 2026-08-22).
 *
 * When the exact five-step Sorbet Direction projection has no admissible
 * solution — or its whole-gram execution is refused by a hard gate — the
 * constrained optimizer must still search the remaining legal ingredients
 * with every Main held as an EQUALITY constraint, and return the best legal
 * NEAREST candidate. A fixed Main reduces the search space; it never disables
 * the search.
 *
 * Contract (mirrors the closed-form projection): Main lines, Inulin, the
 * stabilizer and every held line stay byte-exact. Only the adjustable sugar
 * lines (sucrose-dominant / freezing-control sugars, as the Engine projection
 * classifies them) move; plain water is the batch balance. The search is a
 * deterministic, bounded grid over the sugar lines followed by whole-gram
 * coordinate refinement. Every tested vector weighs exactly the target batch.
 *
 * The Engine alone judges a vector: it must carry NO native violation and no
 * critical warning; among those, the lexicographic Direction measure (fewer
 * out-of-target metrics, then lower severity) decides. The caller still passes
 * the winner through practicalization, constraints and every Preview/Apply
 * gate — this module is only a candidate generator.
 */

const EPSILON = 1e-9;
const MAX_EVALUATIONS = 8_000;

export interface SorbetNearestSearchMeasure {
  violations: number;
  severityPoints: number;
}

const MAX_WHOLE_GRAM_PROOF_CANDIDATES = 250_000;

export type SorbetWholeGramSearchFailure =
  | 'not_sorbet_direction'
  | 'non_integer_batch_or_hold'
  | 'unsupported_adjustable_space'
  | 'candidate_space_too_large'
  | 'no_legal_candidate';

export interface SorbetWholeGramProofMeasure {
  missedAxes: number;
  totalResidual: number;
}

export type SorbetWholeGramPolishResult =
  | {
      status: 'proven';
      candidate: RecipeInput;
      measure: SorbetWholeGramProofMeasure;
      adjustableLineIds: string[];
      completeCandidateSpace: true;
      evaluatedCandidates: number;
      legalCandidates: number;
    }
  | {
      status: 'search_failed';
      reason: SorbetWholeGramSearchFailure;
      adjustableLineIds: string[];
      completeCandidateSpace: false;
      evaluatedCandidates: number;
      legalCandidates: number;
    };

export interface PolishSorbetWholeGramDirectionArgs {
  /** The continuous projection (or the bounded Sorbet seed when no projection exists). */
  exactInput: RecipeInput;
  /** The ordinary practicalizer's result. Used only as a deterministic tie anchor. */
  initialExecutable: RecipeInput;
  /** The exact set of lines the Sorbet projection is allowed to move. */
  isAdjustable: (item: RecipeInput['items'][number]) => boolean;
  /** All native/product/constraint gates. The Engine result is computed once per vector. */
  isLegal: (candidate: RecipeInput, result: ReturnType<typeof calculateRecipe>) => boolean;
  maxCandidates?: number;
}

const integerWithinEpsilon = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value - Math.round(value)) <= EPSILON;

const positiveCompositionCount = (total: number, parts: number): number => {
  if (parts < 1 || total < parts) return 0;
  // C(total - 1, parts - 1), evaluated multiplicatively to avoid factorials.
  const choose = parts - 1;
  let count = 1;
  for (let index = 1; index <= choose; index += 1) {
    count = (count * (total - index)) / index;
    if (!Number.isSafeInteger(count)) return Number.POSITIVE_INFINITY;
  }
  return count;
};

/**
 * Complete Sorbet whole-gram lattice proof.
 *
 * Every non-adjustable line is an equality hold. Every adjustable projection
 * line remains present at a positive integer gram amount, and their sum is the
 * exact remaining batch budget. The complete finite composition space is
 * enumerated; therefore a returned `proven` candidate is globally minimal
 * under the existing Direction ordering (fewer missed axes, then minimum
 * summed residual). No bounded/heuristic result can receive that status.
 */
export function polishSorbetWholeGramDirectionCandidate(
  args: PolishSorbetWholeGramDirectionArgs,
): SorbetWholeGramPolishResult {
  const { exactInput, initialExecutable, isAdjustable, isLegal } = args;
  const maxCandidates = args.maxCandidates ?? MAX_WHOLE_GRAM_PROOF_CANDIDATES;
  if (exactInput.category !== 'sorbet' || exactInput.goals?.direction_targets_active !== true) {
    return {
      status: 'search_failed',
      reason: 'not_sorbet_direction',
      adjustableLineIds: [],
      completeCandidateSpace: false,
      evaluatedCandidates: 0,
      legalCandidates: 0,
    };
  }

  const requested = requestedDirectionBands(exactInput);
  const adjustable = exactInput.items.filter(
    (item) => sorbetProjectionRole(item) !== null && isAdjustable(item),
  );
  const adjustableLineIds = adjustable.map((item) => item.id);
  const roles = new Set(adjustable.map((item) => sorbetProjectionRole(item)));
  if (
    requested.length === 0 ||
    adjustable.length < 2 ||
    !roles.has('water') ||
    (!roles.has('sweetener_sucrose') && !roles.has('sugar_freezing_control'))
  ) {
    return {
      status: 'search_failed',
      reason: 'unsupported_adjustable_space',
      adjustableLineIds,
      completeCandidateSpace: false,
      evaluatedCandidates: 0,
      legalCandidates: 0,
    };
  }

  const adjustableIds = new Set(adjustableLineIds);
  const fixed = exactInput.items.filter((item) => !adjustableIds.has(item.id));
  if (
    !integerWithinEpsilon(exactInput.target_batch_grams) ||
    fixed.some((item) => !integerWithinEpsilon(item.planned_grams))
  ) {
    return {
      status: 'search_failed',
      reason: 'non_integer_batch_or_hold',
      adjustableLineIds,
      completeCandidateSpace: false,
      evaluatedCandidates: 0,
      legalCandidates: 0,
    };
  }

  const fixedMass = fixed.reduce((sum, item) => sum + Math.round(item.planned_grams), 0);
  const budget = Math.round(exactInput.target_batch_grams) - fixedMass;
  const candidateCount = positiveCompositionCount(budget, adjustable.length);
  if (!(candidateCount > 0) || candidateCount > maxCandidates) {
    return {
      status: 'search_failed',
      reason:
        candidateCount > maxCandidates ? 'candidate_space_too_large' : 'non_integer_batch_or_hold',
      adjustableLineIds,
      completeCandidateSpace: false,
      evaluatedCandidates: 0,
      legalCandidates: 0,
    };
  }

  const initialById = new Map(
    initialExecutable.items.map((item) => [item.id, item.planned_grams] as const),
  );
  let evaluatedCandidates = 0;
  let legalCandidates = 0;
  let best: {
    candidate: RecipeInput;
    measure: SorbetWholeGramProofMeasure;
    tieDistance: number;
    tieVector: string;
  } | null = null;

  const consider = (grams: readonly number[]): void => {
    const gramsById = new Map(adjustable.map((item, index) => [item.id, grams[index]!] as const));
    const candidate: RecipeInput = {
      ...exactInput,
      items: exactInput.items.map((item) => {
        const next = gramsById.get(item.id);
        return next === undefined ? item : { ...item, planned_grams: next };
      }),
    };
    evaluatedCandidates += 1;
    const result = calculateRecipe(candidate);
    if (!isLegal(candidate, result)) return;
    legalCandidates += 1;
    const distance = directionDistance(candidate, requested, result);
    const measure = { missedAxes: distance.missedAxes, totalResidual: distance.total };
    const tieDistance = adjustable.reduce(
      (sum, item, index) => sum + Math.abs(grams[index]! - (initialById.get(item.id) ?? 0)),
      0,
    );
    const tieVector = grams.map((value) => value.toString().padStart(12, '0')).join('|');
    if (
      best === null ||
      measure.missedAxes < best.measure.missedAxes ||
      (measure.missedAxes === best.measure.missedAxes &&
        (measure.totalResidual < best.measure.totalResidual - EPSILON ||
          (Math.abs(measure.totalResidual - best.measure.totalResidual) <= EPSILON &&
            (tieDistance < best.tieDistance - EPSILON ||
              (Math.abs(tieDistance - best.tieDistance) <= EPSILON &&
                tieVector < best.tieVector)))))
    ) {
      best = { candidate, measure, tieDistance, tieVector };
    }
  };

  const enumerate = (index: number, remaining: number, prefix: number[]): void => {
    if (index === adjustable.length - 1) {
      if (remaining >= 1) consider([...prefix, remaining]);
      return;
    }
    const remainingLines = adjustable.length - index - 1;
    for (let grams = 1; grams <= remaining - remainingLines; grams += 1) {
      enumerate(index + 1, remaining - grams, [...prefix, grams]);
    }
  };
  enumerate(0, budget, []);

  if (evaluatedCandidates !== candidateCount || best === null) {
    return {
      status: 'search_failed',
      reason: best === null ? 'no_legal_candidate' : 'unsupported_adjustable_space',
      adjustableLineIds,
      completeCandidateSpace: false,
      evaluatedCandidates,
      legalCandidates,
    };
  }
  const winner = best as {
    candidate: RecipeInput;
    measure: SorbetWholeGramProofMeasure;
  };
  return {
    status: 'proven',
    candidate: winner.candidate,
    measure: winner.measure,
    adjustableLineIds,
    completeCandidateSpace: true,
    evaluatedCandidates,
    legalCandidates,
  };
}

export interface SorbetNearestSearchResult {
  candidate: RecipeInput;
  measure: SorbetNearestSearchMeasure;
  startMeasure: SorbetNearestSearchMeasure;
  evaluations: number;
  /** Line ids the search was allowed to move (water balance included). */
  adjustableLineIds: string[];
}

export interface SorbetNearestSearchArgs {
  input: RecipeInput;
  /** May this line move at all (unlocked, no poured actuals, not held by a constraint)? */
  isAdjustable: (item: RecipeInput['items'][number]) => boolean;
  /**
   * Additional adjustable line ids searched as free dimensions regardless of
   * their projection role (the rescue advisor's ONE simulated candidate line).
   * Never Main, never a held line; the caller guarantees adjustability.
   */
  extraAdjustableLineIds?: readonly string[];
  maxEvaluations?: number;
}

const gridStepForDimensions = (sugarLines: number): number =>
  sugarLines <= 1 ? 1 : sugarLines === 2 ? 5 : sugarLines === 3 ? 20 : 25;

/**
 * Deterministic Main-constrained nearest search. Returns null when the scaffold
 * is not searchable (no adjustable water balance / no adjustable sugar line,
 * actuals poured, Direction inactive) or when no legal vector improves the
 * Direction measure of the input.
 */
export function searchSorbetNearestDirectionCandidate(
  args: SorbetNearestSearchArgs,
): SorbetNearestSearchResult | null {
  const { input, isAdjustable } = args;
  const maxEvaluations = args.maxEvaluations ?? MAX_EVALUATIONS;
  if (input.category !== 'sorbet' || input.goals?.direction_targets_active !== true) return null;
  if (input.items.some((item) => item.actual_grams !== null)) return null;
  const plan = buildRecipeDirectionPlan(input);
  if (!plan.bands.pod && !plan.bands.npac) return null;

  const waterLine = input.items.find(
    (item) => sorbetProjectionRole(item) === 'water' && isAdjustable(item),
  );
  const extra = new Set(args.extraAdjustableLineIds ?? []);
  const sugarLines = input.items.filter((item) => {
    const role = sorbetProjectionRole(item);
    return (
      item.id !== waterLine?.id &&
      item.lock_type !== 'main' &&
      isAdjustable(item) &&
      (role === 'sweetener_sucrose' || role === 'sugar_freezing_control' || extra.has(item.id))
    );
  });
  if (!waterLine || sugarLines.length === 0 || sugarLines.length > 4) return null;

  const fixedMass = input.items
    .filter((item) => item.id !== waterLine.id && !sugarLines.some((line) => line.id === item.id))
    .reduce((sum, item) => sum + item.planned_grams, 0);
  const budget = input.target_batch_grams - fixedMass;
  if (!(budget > 0)) return null;

  let evaluations = 0;
  const measure = (candidate: RecipeInput): SorbetNearestSearchMeasure | null => {
    evaluations += 1;
    const result = calculateRecipe(candidate);
    if (detectViolations(result).length > 0) return null;
    if (result.warnings.some((warning) => warning.severity === 'critical')) return null;
    const directed = detectViolations(resultWithRecipeDirectionTargets(result, plan));
    return {
      violations: directed.length,
      severityPoints: directed.reduce((sum, violation) => sum + violation.severity_points, 0),
    };
  };
  const better = (next: SorbetNearestSearchMeasure, current: SorbetNearestSearchMeasure): boolean =>
    next.violations < current.violations ||
    (next.violations === current.violations &&
      next.severityPoints < current.severityPoints - EPSILON);

  const vectorToInput = (sugars: readonly number[]): RecipeInput | null => {
    const water = budget - sugars.reduce((sum, grams) => sum + grams, 0);
    if (water < -EPSILON) return null;
    const gramsById = new Map<string, number>(
      sugarLines.map((line, index) => [line.id, sugars[index]!] as const),
    );
    gramsById.set(waterLine.id, Math.max(0, water));
    return {
      ...input,
      items: input.items.map((item) => {
        const grams = gramsById.get(item.id);
        return grams === undefined ? item : { ...item, planned_grams: grams };
      }),
    };
  };

  // The start measure is the Engine's own view of the unchanged input; an
  // input that already violates a native band is not a searchable fixed point
  // for THIS tier (the native corrector owns it), so report "no candidate".
  const startMeasure = measure(input);
  if (startMeasure === null) return null;

  let best: { sugars: number[]; measure: SorbetNearestSearchMeasure } | null = null;
  const consider = (sugars: readonly number[]): void => {
    if (evaluations >= maxEvaluations) return;
    const candidate = vectorToInput(sugars);
    if (candidate === null) return;
    const next = measure(candidate);
    if (next === null) return;
    if (best === null ? better(next, startMeasure) : better(next, best.measure)) {
      best = { sugars: [...sugars], measure: next };
    }
  };

  // 1. Deterministic coarse grid over the sugar lines (water balances).
  const step = gridStepForDimensions(sugarLines.length);
  const enumerate = (index: number, prefix: number[], remaining: number): void => {
    if (evaluations >= maxEvaluations) return;
    if (index === sugarLines.length) {
      consider(prefix);
      return;
    }
    for (let grams = 0; grams <= remaining + EPSILON; grams += step) {
      enumerate(index + 1, [...prefix, grams], remaining - grams);
    }
  };
  enumerate(0, [], budget);
  // The input's own sugar vector is a grid point of the search too.
  consider(sugarLines.map((line) => line.planned_grams));
  if (best === null) return null;

  // 2. Whole-gram coordinate refinement around the best grid vertex.
  const deltas =
    step > 1
      ? [-step + 1, -Math.floor(step / 2), -4, -2, -1, 1, 2, 4, Math.floor(step / 2), step - 1]
      : [-1, 1];
  for (let pass = 0; pass < 6 && evaluations < maxEvaluations; pass += 1) {
    const before = best as { sugars: number[]; measure: SorbetNearestSearchMeasure };
    for (let index = 0; index < sugarLines.length; index += 1) {
      for (const delta of deltas) {
        if (delta === 0) continue;
        const sugars = [...(best as { sugars: number[] }).sugars];
        sugars[index] = Math.max(0, sugars[index]! + delta);
        consider(sugars);
      }
    }
    if (best === before) break;
  }

  const winner = best as { sugars: number[]; measure: SorbetNearestSearchMeasure };
  const candidate = vectorToInput(winner.sugars);
  if (candidate === null) return null;
  return {
    candidate,
    measure: winner.measure,
    startMeasure,
    evaluations,
    adjustableLineIds: [waterLine.id, ...sugarLines.map((line) => line.id)],
  };
}
