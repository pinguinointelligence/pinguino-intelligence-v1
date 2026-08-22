import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  buildRecipeDirectionPlan,
  resultWithRecipeDirectionTargets,
} from './recipeDirectionTargets';

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

export type SorbetProjectionRole = 'water' | 'sweetener_sucrose' | 'sugar_freezing_control';

/** Same classification the Engine's closed-form projection uses (mirror). */
export function sorbetProjectionRole(
  item: RecipeInput['items'][number],
): SorbetProjectionRole | null {
  const composition = item.ingredient.composition;
  const controlSugar =
    composition.dextrose_percent + composition.glucose_percent + composition.fructose_percent;
  if (composition.water_percent >= 99 && composition.solids_percent <= 1) return 'water';
  if (item.ingredient.category !== 'sugar') return null;
  if (composition.sucrose_percent > controlSugar) return 'sweetener_sucrose';
  if (controlSugar > composition.sucrose_percent) return 'sugar_freezing_control';
  return null;
}

export interface SorbetNearestSearchMeasure {
  violations: number;
  severityPoints: number;
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
