/**
 * Continuous linear relaxation for the Main objective.
 *
 * This is not a second Engine and never accepts a recipe. It only computes a
 * mathematically safe UPPER bound from necessary native Engine bands, the
 * exact batch equation, current locks and the product-layer dairy-carrier
 * minimum. A whole-gram candidate may be called an exact maximum only when an
 * exhausted deterministic integer search certifies that bound and the same
 * candidate passes the real Engine.
 */
import {
  calculateRecipe,
  technicalLinearIngredientFactors,
  type EngineIngredient,
  type RecipeInput,
  type TargetMetric,
} from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { captureMainIngredientIntent } from '@/features/formulation/mainIngredientContract';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { proteinTargetPercentBand } from '@/features/protein-gelato/proteinTarget';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import type { ConstraintSet } from '@/features/recipe-constraints';

const EPSILON = 1e-8;

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) [a, b] = [b, a % b];
  return Math.max(1, a);
};

/** Exact pairwise determinant bounds of the stable largest-remainder split.
 * Integer-normalised weights are periodic in the group total. The resulting
 * inequalities retain every approved rounded allocation but exclude stricter
 * proportional equalities that caused false lower certificates. Large or
 * non-rational metadata simply omits this tightening and stays a safe upper
 * relaxation. */
const largestRemainderPairBounds = (
  weights: readonly number[],
): Array<{ left: number; right: number; bound: number; integerWeights: number[] }> => {
  const precision = 1_000_000;
  const scaled = weights.map((weight) => Math.round(weight * precision));
  if (scaled.some((weight, index) => weight <= 0 || Math.abs(weight / precision - weights[index]!) > 1e-9)) {
    return [];
  }
  const divisor = scaled.reduce(greatestCommonDivisor);
  const integerWeights = scaled.map((weight) => weight / divisor);
  const period = integerWeights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isInteger(period) || period <= 0 || period > 4096) return [];
  const bounds = new Map<string, number>();
  for (let total = 0; total < period; total += 1) {
    const rows = integerWeights.map((weight, index) => {
      const exact = total * weight / period;
      return { index, grams: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let remainder = total - rows.reduce((sum, row) => sum + row.grams, 0);
    rows.sort((left, right) => right.fraction - left.fraction || left.index - right.index);
    for (const row of rows) {
      if (remainder <= 0) break;
      row.grams += 1;
      remainder -= 1;
    }
    rows.sort((left, right) => left.index - right.index);
    for (let left = 0; left < rows.length; left += 1) {
      for (let right = left + 1; right < rows.length; right += 1) {
        const determinant = Math.abs(
          integerWeights[right]! * rows[left]!.grams -
          integerWeights[left]! * rows[right]!.grams,
        );
        const key = `${left}:${right}`;
        bounds.set(key, Math.max(bounds.get(key) ?? 0, determinant));
      }
    }
  }
  return [...bounds.entries()].map(([key, bound]) => {
    const [left, right] = key.split(':').map(Number);
    return { left: left!, right: right!, bound, integerWeights };
  });
};

/** Deterministic two-phase simplex for max c·x subject to A·x ≤ b, x ≥ 0. */
class LinearProgram {
  private readonly m: number;
  private readonly n: number;
  private readonly basic: number[];
  private readonly nonBasic: number[];
  private readonly tableau: number[][];

  constructor(a: readonly number[][], b: readonly number[], c: readonly number[]) {
    this.m = b.length;
    this.n = c.length;
    this.basic = Array.from({ length: this.m }, (_, index) => this.n + index);
    this.nonBasic = [...Array.from({ length: this.n }, (_, index) => index), -1];
    this.tableau = Array.from({ length: this.m + 2 }, () =>
      Array.from({ length: this.n + 2 }, () => 0),
    );
    for (let row = 0; row < this.m; row += 1) {
      for (let column = 0; column < this.n; column += 1) {
        this.tableau[row]![column] = a[row]![column]!;
      }
      this.tableau[row]![this.n] = -1;
      this.tableau[row]![this.n + 1] = b[row]!;
    }
    for (let column = 0; column < this.n; column += 1) {
      this.tableau[this.m]![column] = -c[column]!;
    }
    this.tableau[this.m + 1]![this.n] = 1;
  }

  private pivot(row: number, column: number): void {
    const inverse = 1 / this.tableau[row]![column]!;
    for (let otherRow = 0; otherRow < this.m + 2; otherRow += 1) {
      if (otherRow === row) continue;
      for (let otherColumn = 0; otherColumn < this.n + 2; otherColumn += 1) {
        if (otherColumn === column) continue;
        const current = this.tableau[otherRow]![otherColumn]!;
        this.tableau[otherRow]![otherColumn] = current -
          this.tableau[row]![otherColumn]! * this.tableau[otherRow]![column]! * inverse;
      }
    }
    for (let columnIndex = 0; columnIndex < this.n + 2; columnIndex += 1) {
      if (columnIndex !== column) {
        this.tableau[row]![columnIndex] = this.tableau[row]![columnIndex]! * inverse;
      }
    }
    for (let rowIndex = 0; rowIndex < this.m + 2; rowIndex += 1) {
      if (rowIndex !== row) {
        this.tableau[rowIndex]![column] = this.tableau[rowIndex]![column]! * -inverse;
      }
    }
    this.tableau[row]![column] = inverse;
    [this.basic[row], this.nonBasic[column]] = [this.nonBasic[column]!, this.basic[row]!];
  }

  private simplex(phase: 1 | 2): boolean {
    const objectiveRow = phase === 1 ? this.m + 1 : this.m;
    while (true) {
      let entering = -1;
      for (let column = 0; column <= this.n; column += 1) {
        if (phase === 2 && this.nonBasic[column] === -1) continue;
        if (
          entering === -1 ||
          this.tableau[objectiveRow]![column]! <
            this.tableau[objectiveRow]![entering]! - EPSILON ||
          (Math.abs(
            this.tableau[objectiveRow]![column]! - this.tableau[objectiveRow]![entering]!,
          ) <= EPSILON && this.nonBasic[column]! < this.nonBasic[entering]!)
        ) entering = column;
      }
      if (entering === -1 || this.tableau[objectiveRow]![entering]! >= -EPSILON) return true;

      let leaving = -1;
      for (let row = 0; row < this.m; row += 1) {
        if (this.tableau[row]![entering]! <= EPSILON) continue;
        if (
          leaving === -1 ||
          this.tableau[row]![this.n + 1]! / this.tableau[row]![entering]! <
            this.tableau[leaving]![this.n + 1]! / this.tableau[leaving]![entering]! - EPSILON ||
          (Math.abs(
            this.tableau[row]![this.n + 1]! / this.tableau[row]![entering]! -
              this.tableau[leaving]![this.n + 1]! / this.tableau[leaving]![entering]!,
          ) <= EPSILON && this.basic[row]! < this.basic[leaving]!)
        ) leaving = row;
      }
      if (leaving === -1) return false;
      this.pivot(leaving, entering);
    }
  }

  solve(): { status: 'optimal'; value: number; solution: number[] } | { status: 'infeasible' | 'unbounded' } {
    if (this.m === 0) return { status: 'unbounded' };
    let row = 0;
    for (let candidate = 1; candidate < this.m; candidate += 1) {
      if (this.tableau[candidate]![this.n + 1]! < this.tableau[row]![this.n + 1]!) row = candidate;
    }
    if (this.tableau[row]![this.n + 1]! < -EPSILON) {
      this.pivot(row, this.n);
      if (!this.simplex(1) || this.tableau[this.m + 1]![this.n + 1]! < -EPSILON) {
        return { status: 'infeasible' };
      }
      if (Math.abs(this.tableau[this.m + 1]![this.n + 1]!) > EPSILON) {
        return { status: 'infeasible' };
      }
      const artificialRow = this.basic.indexOf(-1);
      if (artificialRow !== -1) {
        let entering = 0;
        for (let column = 1; column <= this.n; column += 1) {
          if (
            this.tableau[artificialRow]![column]! < this.tableau[artificialRow]![entering]! - EPSILON ||
            (Math.abs(
              this.tableau[artificialRow]![column]! - this.tableau[artificialRow]![entering]!,
            ) <= EPSILON && this.nonBasic[column]! < this.nonBasic[entering]!)
          ) entering = column;
        }
        this.pivot(artificialRow, entering);
      }
    }
    if (!this.simplex(2)) return { status: 'unbounded' };
    const solution = Array.from({ length: this.n }, () => 0);
    for (let rowIndex = 0; rowIndex < this.m; rowIndex += 1) {
      const variable = this.basic[rowIndex]!;
      if (variable >= 0 && variable < this.n) {
        solution[variable] = this.tableau[rowIndex]![this.n + 1]!;
      }
    }
    return { status: 'optimal', value: this.tableau[this.m]![this.n + 1]!, solution };
  }
}

interface IntegerLinearResult {
  status: 'optimal' | 'unavailable';
  value: number | null;
  solution: readonly number[] | null;
  nodes: number;
}

/** Hard deterministic computation budget for the exact whole-gram proof.
 * Exhaustion never produces a false certificate: the caller retains the
 * continuous relaxation as a safe upper bound and labels any lower explored
 * result BEST_ACHIEVABLE unless it reaches that bound. */
export const MAIN_TECHNICAL_INTEGER_NODE_BUDGET = 4096;

/** Exact branch-and-bound over whole-gram line variables. The LP relaxation at
 * every node remains a safe upper bound; `optimal` is returned only after the
 * complete deterministic tree has been exhausted. */
const solveIntegerLinearMaximum = (
  baseRows: readonly number[][],
  baseBounds: readonly number[],
  objective: readonly number[],
  maxNodes = MAIN_TECHNICAL_INTEGER_NODE_BUDGET,
): IntegerLinearResult => {
  let nodes = 0;
  let exhausted = false;
  let bestValue = -Infinity;
  let bestSolution: number[] | null = null;

  const visit = (extraRows: readonly number[][], extraBounds: readonly number[]): void => {
    if (nodes >= maxNodes) {
      exhausted = true;
      return;
    }
    nodes += 1;
    const solved = new LinearProgram(
      [...baseRows, ...extraRows],
      [...baseBounds, ...extraBounds],
      objective,
    ).solve();
    if (solved.status !== 'optimal') return;
    if (Math.floor(solved.value + EPSILON) <= bestValue + EPSILON) return;

    let branchIndex = -1;
    let branchDistance = 0;
    for (let index = 0; index < solved.solution.length; index += 1) {
      const value = solved.solution[index]!;
      const distance = Math.abs(value - Math.round(value));
      if (distance > EPSILON && distance > branchDistance + EPSILON) {
        branchIndex = index;
        branchDistance = distance;
      }
    }
    if (branchIndex === -1) {
      bestValue = Math.round(solved.value);
      bestSolution = solved.solution.map((value) => Math.max(0, Math.round(value)));
      return;
    }

    const value = solved.solution[branchIndex]!;
    const lowerRow = Array.from({ length: objective.length }, () => 0);
    lowerRow[branchIndex] = -1;
    // Explore the high branch first because the objective is a Main maximum.
    visit([...extraRows, lowerRow], [...extraBounds, -Math.ceil(value)]);
    const upperRow = Array.from({ length: objective.length }, () => 0);
    upperRow[branchIndex] = 1;
    visit([...extraRows, upperRow], [...extraBounds, Math.floor(value)]);
  };

  visit([], []);
  if (exhausted || bestSolution === null || !Number.isFinite(bestValue)) {
    return { status: 'unavailable', value: null, solution: null, nodes };
  }
  return { status: 'optimal', value: bestValue, solution: bestSolution, nodes };
};

const componentPercent = (ingredient: EngineIngredient, metric: TargetMetric): number => {
  const factors = technicalLinearIngredientFactors(ingredient);
  switch (metric) {
    case 'water': return factors.waterPercent;
    case 'total_solids': return factors.solidsPercent;
    case 'fat': return factors.fatPercent;
    case 'aerating_protein': return factors.proteinPercent;
    case 'lactose': return factors.lactosePercent;
    case 'alcohol': return factors.alcoholPercent;
    default: return 0;
  }
};

export interface MainTechnicalLinearBound {
  status: 'certified' | 'unavailable';
  continuousUpperBoundGrams: number | null;
  wholeGramUpperBound: number | null;
  continuousSolutionGrams: readonly number[] | null;
  integerSolutionCertified: boolean;
  integerSearchNodes: number;
  certificate: string[];
}

export function mainTechnicalLinearUpperBound(input: {
  recipe: RecipeInput;
  constraints: ConstraintSet;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  excludedIngredientIds?: readonly string[];
  /** Candidate rebalances only need a safe continuous vector. The frontier
   * call leaves this enabled to obtain the whole-gram maximum certificate. */
  certifyWholeGram?: boolean;
  /** Optional smaller deterministic branch-and-bound budget for fixed-Main
   * candidate vectors. Exhaustion stays fail-closed and never certifies. */
  integerNodeBudget?: number;
}): MainTechnicalLinearBound {
  const { recipe, constraints, snapshots } = input;
  const size = recipe.items.length;
  const mains = captureMainIngredientIntent(recipe);
  if (size === 0 || mains.length === 0 || !(recipe.target_batch_grams > 0)) {
    return { status: 'unavailable', continuousUpperBoundGrams: null, wholeGramUpperBound: null, continuousSolutionGrams: null, integerSolutionCertified: false, integerSearchNodes: 0, certificate: [] };
  }

  const rows: number[][] = [];
  const bounds: number[] = [];
  const rowLabels: string[] = [];
  const addUpper = (coefficients: number[], bound: number, label = 'technical_constraint'): void => {
    if (!Number.isFinite(bound) || coefficients.some((value) => !Number.isFinite(value))) return;
    // Do not report a zero-coefficient, non-negative inequality as an active
    // technical limiter (for example alcohol_min = 0 in an alcohol-free
    // recipe). It is a tautology and cannot explain the Main frontier.
    if (coefficients.every((value) => Math.abs(value) <= EPSILON) && bound >= -EPSILON) return;
    rows.push(coefficients);
    bounds.push(bound);
    rowLabels.push(label);
  };
  const addLower = (coefficients: number[], bound: number, label = 'technical_constraint'): void =>
    addUpper(coefficients.map((value) => -value), -bound, label);
  const addEquality = (coefficients: number[], value: number, label: string): void => {
    addUpper(coefficients, value, label);
    addLower(coefficients, value, label);
  };
  const coefficients = (value: (ingredient: EngineIngredient) => number): number[] =>
    recipe.items.map((item) => value(item.ingredient));

  addEquality(Array.from({ length: size }, () => 1), recipe.target_batch_grams, 'exact_batch');
  const excluded = new Set(input.excludedIngredientIds ?? []);
  recipe.items.forEach((item, index) => {
    const constraint = constraints.byLineId[item.id];
    const exact = item.lock_type === 'required'
      ? item.planned_grams
      : constraint?.mode === 'locked'
      ? constraint.grams
      : constraint?.mode === 'percent'
        ? recipe.target_batch_grams * constraint.percent / 100
        : excluded.has(canonicalIngredientId(item.ingredient))
          ? 0
          : null;
    if (exact !== null && exact !== undefined) {
      const row = Array.from({ length: size }, () => 0);
      row[index] = 1;
      addEquality(row, exact, `exact_lock:${item.id}`);
    } else if (constraint?.mode === 'range') {
      const row = Array.from({ length: size }, () => 0);
      row[index] = 1;
      addLower(row, constraint.minGrams, `range_min:${item.id}`);
      addUpper(row, constraint.maxGrams, `range_max:${item.id}`);
    }
  });

  const variableMains = mains.filter((main) => {
    const constraint = constraints.byLineId[main.lineId];
    return constraint?.mode !== 'locked' && constraint?.mode !== 'percent';
  });
  if (variableMains.length > 1) {
    const weightTotal = variableMains.reduce((sum, main) => sum + main.ratioWeight, 0);
    for (const main of variableMains) {
      const index = recipe.items.findIndex((item) => item.id === main.lineId);
      const share = main.ratioWeight / weightTotal;
      const upper = Array.from({ length: size }, () => 0);
      const lower = Array.from({ length: size }, () => 0);
      for (const member of variableMains) {
        const memberIndex = recipe.items.findIndex((item) => item.id === member.lineId);
        upper[memberIndex] = -share;
        lower[memberIndex] = share;
      }
      upper[index] = upper[index]! + 1;
      lower[index] = lower[index]! - 1;
      // `resolveMainRatioScale` materialises stable largest-remainder whole
      // grams. Each variable Main line is therefore within one gram of its
      // continuous weighted share. Strict proportional equalities would
      // wrongly reject valid 237/236/236-style allocations and could certify a
      // lower, false maximum. These inequalities are a safe integer
      // relaxation; the exact deterministic allocation is still rechecked by
      // the real Engine before any maximum can be claimed.
      addUpper(upper, 1, 'main_ratio_rounding');
      addUpper(lower, 1, 'main_ratio_rounding');
    }
    for (const pair of largestRemainderPairBounds(variableMains.map((main) => main.ratioWeight))) {
      const row = Array.from({ length: size }, () => 0);
      const leftIndex = recipe.items.findIndex((item) => item.id === variableMains[pair.left]!.lineId);
      const rightIndex = recipe.items.findIndex((item) => item.id === variableMains[pair.right]!.lineId);
      row[leftIndex] = pair.integerWeights[pair.right]!;
      row[rightIndex] = -pair.integerWeights[pair.left]!;
      addUpper(row, pair.bound, 'main_ratio_rounding');
      addLower(row, -pair.bound, 'main_ratio_rounding');
    }
  }

  const result = calculateRecipe(recipe);
  // Direction controls are accepted user intent. They never alter the Base
  // Engine, but an active POD/NPAC target narrows the admissible Main frontier
  // exactly as it narrows the existing correction solver. Without this overlay
  // a mathematically certified Main maximum could make an accepted direction
  // impossible immediately after PI solved it.
  const directionBands = buildRecipeDirectionPlan(recipe).bands;
  for (const indicator of result.indicators) {
    const band = directionBands[indicator.key as TargetMetric] ?? indicator.band;
    if (!band || indicator.key === 'ice_fraction') continue;
    if (indicator.key === 'pod') {
      const row = coefficients(
        (ingredient) => technicalLinearIngredientFactors(ingredient).podPointGramsPerGram,
      );
      addLower(row, band.min * recipe.target_batch_grams / 100, 'pod_min');
      addUpper(row, band.max * recipe.target_batch_grams / 100, 'pod_max');
      continue;
    }
    if (indicator.key === 'npac') {
      const depression = coefficients(
        (ingredient) => technicalLinearIngredientFactors(ingredient).npacPointGramsPerGram,
      );
      const water = coefficients((ingredient) => ingredient.composition.water_percent / 100);
      addLower(
        depression.map((value, index) => value - band.min / 100 * water[index]!),
        0,
        'npac_min',
      );
      addUpper(
        depression.map((value, index) => value - band.max / 100 * water[index]!),
        0,
        'npac_max',
      );
      continue;
    }
    if (indicator.key === 'protein_in_solids') {
      const row = coefficients((ingredient) => ingredient.composition.protein_percent -
        band.min / 100 * ingredient.composition.solids_percent);
      addLower(row, 0, 'protein_in_solids_min');
      const upper = coefficients((ingredient) => ingredient.composition.protein_percent -
        band.max / 100 * ingredient.composition.solids_percent);
      addUpper(upper, 0, 'protein_in_solids_max');
      continue;
    }
    if (indicator.key === 'lactose_sandiness_risk') {
      const lower = coefficients((ingredient) => ingredient.composition.lactose_percent -
        band.min / 100 * ingredient.composition.water_percent);
      addLower(lower, 0, 'lactose_sandiness_risk_min');
      const upper = coefficients((ingredient) => ingredient.composition.lactose_percent -
        band.max / 100 * ingredient.composition.water_percent);
      addUpper(upper, 0, 'lactose_sandiness_risk_max');
      continue;
    }
    if (![
      'water',
      'total_solids',
      'fat',
      'aerating_protein',
      'lactose',
      'alcohol',
    ].includes(indicator.key)) continue;
    const row = coefficients((ingredient) => componentPercent(ingredient, indicator.key as TargetMetric));
    addLower(row, band.min * recipe.target_batch_grams, `${indicator.key}_min`);
    addUpper(row, band.max * recipe.target_batch_grams, `${indicator.key}_max`);
  }

  const proteinTargetBand = proteinTargetPercentBand(recipe);
  if (proteinTargetBand) {
    const protein = coefficients((ingredient) => ingredient.composition.protein_percent);
    addLower(
      protein,
      proteinTargetBand.minPercent * recipe.target_batch_grams,
      'protein_target_min',
    );
    addUpper(
      protein,
      proteinTargetBand.maxPercent * recipe.target_batch_grams,
      'protein_target_max',
    );
  }

  const mainSnapshots = mains
    .map((main) => snapshots[main.lineId])
    .filter((snapshot): snapshot is ProductBehaviorSnapshot => snapshot !== undefined);
  const carrierFloor = mainSnapshots
    .filter((snapshot) => snapshot.requiresLiquidDairyCarrier && snapshot.liquidDairyCarrierFloorPercent !== null)
    .reduce((maximum, snapshot) => Math.max(maximum, snapshot.liquidDairyCarrierFloorPercent!), 0);
  if (carrierFloor > 0) {
    const carrierLineIds = new Set(Object.values(snapshots)
      .filter((snapshot): snapshot is ProductBehaviorSnapshot => snapshot?.approvedLiquidDairyCarrier === true)
      .map((snapshot) => snapshot.lineId));
    addLower(
      recipe.items.map((item) => carrierLineIds.has(item.id) ? 1 : 0),
      carrierFloor * recipe.target_batch_grams / 100,
      'liquid_dairy_carrier_min',
    );
  }

  const objective = recipe.items.map((item) => mains.some((main) => main.lineId === item.id) ? 1 : 0);
  const solved = new LinearProgram(rows, bounds, objective).solve();
  if (solved.status !== 'optimal' || !Number.isFinite(solved.value)) {
    return { status: 'unavailable', continuousUpperBoundGrams: null, wholeGramUpperBound: null, continuousSolutionGrams: null, integerSolutionCertified: false, integerSearchNodes: 0, certificate: [] };
  }
  const continuous = Math.max(0, solved.value);
  const integer = input.certifyWholeGram === false
    ? { status: 'unavailable' as const, value: null, solution: null, nodes: 0 }
    : solveIntegerLinearMaximum(rows, bounds, objective, input.integerNodeBudget);
  const activeRules = [
    ...new Set(rows.flatMap((row, index) => {
      const left = row.reduce(
        (sum, coefficient, variable) => sum + coefficient * solved.solution[variable]!,
        0,
      );
      return Math.abs(left - bounds[index]!) <= 1e-5 ? [rowLabels[index]!] : [];
    })),
  ];
  return {
    status: 'certified',
    continuousUpperBoundGrams: continuous,
    wholeGramUpperBound: integer.status === 'optimal'
      ? integer.value
      : Math.floor(continuous + 1e-7),
    continuousSolutionGrams: integer.status === 'optimal'
      ? integer.solution
      : solved.solution.map((grams) => Math.max(0, grams)),
    integerSolutionCertified: integer.status === 'optimal',
    integerSearchNodes: integer.nodes,
    certificate: [
      integer.status === 'optimal'
        ? 'integer_linear_relaxation'
        : 'linear_relaxation_native_bands',
      ...activeRules,
    ],
  };
}
