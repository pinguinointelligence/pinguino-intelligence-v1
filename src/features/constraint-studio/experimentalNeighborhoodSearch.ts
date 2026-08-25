/**
 * EVIDENCE-PROMOTED SOLVER SEARCH — bounded multi-path neighborhood search.
 *
 * This began as an isolated A/B experiment. After the frozen 136-recipe
 * benchmark proved lower x_user drift at equal hard validity, the no-Main,
 * complete-vector segment was promoted into Preview/Apply. Crown/Multi-Main
 * remains on its certified frontier. The module owns no food science: every
 * state is judged by existing Engine/product authorities and every distance is
 * measured against the original user vector.
 */
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { BATCH_SUM_TOLERANCE_G, type ConstraintSet } from '@/features/recipe-constraints';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import {
  captureMainIngredientIntent,
  verifyMainIngredientIdentity,
} from '@/features/formulation/mainIngredientContract';
import { normalizedLineDrift } from '@/features/formulation/userLineIntent';
import { HARD_ROLES } from '@/features/formulation/formulate';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { internalStabilizerProfileIssues } from '@/features/formulation/stabilizerDosage';
import { ownerInulinPolicyIssues } from '@/features/product-intelligence/ownerInulinPolicy';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { veganProfileConstraintIssues } from '@/features/formulation/veganProfileConstraints';
import { assessProteinFormulation } from '@/features/protein-gelato/proteinAuthority';
import {
  canonicalIngredientId,
  canonicalIngredientIdFromSourceId,
} from '@/data/ingredients/canonicalIngredientIdentity';
import {
  applyEffectiveCustomerPrices,
  type CustomerPriceIndex,
} from '@/features/pro-core/effectiveRecipePricing';
import {
  normalizeFormulationStrategy,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';

const EPSILON = 1e-9;

export interface ExperimentalSearchOptions {
  beamWidth: number;
  evaluationBudget: number;
  /** Composing expansions at one precision before refining the step. */
  iterationsPerStep?: number;
  /** Optional already-verified vectors to polish against the original x_user.
   * Seeds never replace the baseline authority: every one is re-evaluated by
   * the same hard gates and target/proximity comparator before entering the
   * beam. */
  seedInputs?: readonly RecipeInput[];
  excludedIngredientIds?: readonly string[];
  effectivePriceOverrides?: CustomerPriceIndex;
  /** Optional read-only ProductBehavior/stage authority supplied by a harness. */
  externalHardGate?: (candidate: RecipeInput) => boolean;
}

export interface ExperimentalCandidateMeasure {
  structurallyAdmissible: boolean;
  hardViolationCount: number;
  hardSeverityPoints: number;
  explicitTargetViolationCount: number;
  explicitTargetSeverityPoints: number;
  crownGrams: number;
  absoluteTotalMovementGrams: number;
  normalizedDistanceFromUser: number;
  maximumSingleLineDeltaGrams: number;
  maximumFoldChange: number;
  changedIngredientCount: number;
  introducedIngredientCount: number;
  optimalSecondaryScore: number | null;
  ecoSecondaryCostPerKg: number | null;
}

export interface ExperimentalSearchDiagnostics {
  beamWidth: number;
  stepScheduleGrams: number[];
  iterations: number;
  candidateEvaluations: number;
  uniqueCandidates: number;
  budgetExhausted: boolean;
  elapsedMs: number;
}

export interface ExperimentalSearchResult {
  status: 'no_change' | 'candidate' | 'nearest' | 'refused';
  input: RecipeInput;
  measure: ExperimentalCandidateMeasure;
  diagnostics: ExperimentalSearchDiagnostics;
}

const plannedSum = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);

const hardRolePresencePreserved = (baseline: RecipeInput, candidate: RecipeInput): boolean => {
  const required = new Set(
    baseline.items
      .filter((item) => item.planned_grams > 0)
      .map((item) => resolveFunctionalRole(item.ingredient))
      .filter((role) => HARD_ROLES.has(role)),
  );
  for (const role of required) {
    if (
      !candidate.items.some(
        (item) => item.planned_grams > 0 && resolveFunctionalRole(item.ingredient) === role,
      )
    ) {
      return false;
    }
  }
  return true;
};

const vectorDiagnostics = (baseline: RecipeInput, candidate: RecipeInput) => {
  const proposedByLine = new Map(candidate.items.map((item) => [item.id, item.planned_grams]));
  const baselinePositiveIds = new Set(
    baseline.items.filter((item) => item.planned_grams > 0).map((item) => item.id),
  );
  let absoluteTotalMovementGrams = 0;
  let normalizedDistanceFromUser = 0;
  let maximumSingleLineDeltaGrams = 0;
  let maximumFoldChange = 1;
  let changedIngredientCount = 0;
  for (const item of baseline.items) {
    const proposed = proposedByLine.get(item.id) ?? 0;
    const delta = Math.abs(proposed - item.planned_grams);
    absoluteTotalMovementGrams += delta;
    normalizedDistanceFromUser += normalizedLineDrift(
      item.planned_grams,
      proposed,
      baseline.target_batch_grams,
    );
    maximumSingleLineDeltaGrams = Math.max(maximumSingleLineDeltaGrams, delta);
    if (delta > EPSILON) changedIngredientCount += 1;
    if (item.planned_grams > 0 && proposed > 0) {
      maximumFoldChange = Math.max(
        maximumFoldChange,
        proposed / item.planned_grams,
        item.planned_grams / proposed,
      );
    } else if (item.planned_grams > 0 && proposed <= 0) {
      maximumFoldChange = Number.POSITIVE_INFINITY;
    }
  }
  const introducedIngredientCount = candidate.items.filter(
    (item) => item.planned_grams > 0 && !baselinePositiveIds.has(item.id),
  ).length;
  return {
    absoluteTotalMovementGrams,
    normalizedDistanceFromUser,
    maximumSingleLineDeltaGrams,
    maximumFoldChange,
    changedIngredientCount,
    introducedIngredientCount,
  };
};

export function evaluateExperimentalCandidate(
  baseline: RecipeInput,
  candidate: RecipeInput,
  set: ConstraintSet,
  options: Pick<ExperimentalSearchOptions, 'externalHardGate' | 'effectivePriceOverrides'> = {},
): ExperimentalCandidateMeasure {
  const pricedCandidate = applyEffectiveCustomerPrices(
    candidate,
    options.effectivePriceOverrides ?? {},
  );
  const result = calculateRecipe(pricedCandidate);
  const nativeViolations = detectViolations(result);
  const direction = recipeDirectionViolations(candidate);
  const protein = assessProteinFormulation(candidate, result);
  const mainIntent = captureMainIngredientIntent(baseline);
  const candidateByLine = new Map(candidate.items.map((item) => [item.id, item.planned_grams]));
  const crownGrams = mainIntent.reduce(
    (sum, main) => sum + (candidateByLine.get(main.lineId) ?? 0),
    0,
  );
  const profileViolationCount =
    ownerInulinPolicyIssues(candidate).length +
    internalStabilizerProfileIssues(candidate).length +
    (candidate.category === 'vegan_gelato'
      ? veganRecipeEligibilityIssues(candidate.items).length +
        veganProfileConstraintIssues(candidate).length
      : 0) +
    (protein.applicable && !protein.qualification.qualified ? 1 : 0) +
    result.warnings.filter((warning) => warning.severity === 'critical').length;
  const structurallyAdmissible =
    new Set(candidate.items.map((item) => item.id)).size === candidate.items.length &&
    !candidate.items.some((item) => {
      const base = baseline.items.find((entry) => entry.id === item.id);
      return (
        !Number.isInteger(item.planned_grams) ||
        item.planned_grams <= 0 ||
        (base ? item.actual_grams !== base.actual_grams : item.actual_grams !== null)
      );
    }) &&
    Math.abs(plannedSum(candidate) - baseline.target_batch_grams) <= BATCH_SUM_TOLERANCE_G &&
    verifyMainIngredientIdentity(baseline, candidate, set.byLineId).ok &&
    hardRolePresencePreserved(baseline, candidate) &&
    (options.externalHardGate?.(candidate) ?? true);
  const cost = result.costs?.complete === true ? result.costs.cost_per_kg : null;
  return {
    structurallyAdmissible,
    hardViolationCount: nativeViolations.length + profileViolationCount,
    hardSeverityPoints:
      nativeViolations.reduce((sum, violation) => sum + violation.severity_points, 0) +
      profileViolationCount,
    explicitTargetViolationCount: direction.length,
    explicitTargetSeverityPoints: direction.reduce(
      (sum, violation) => sum + violation.severity_points,
      0,
    ),
    crownGrams,
    ...vectorDiagnostics(baseline, candidate),
    optimalSecondaryScore: result.scores?.overall ?? null,
    ecoSecondaryCostPerKg: cost,
  };
}

const compareNumber = (left: number, right: number): number =>
  Math.abs(left - right) <= EPSILON ? 0 : left < right ? -1 : 1;

/** Negative means `left` is preferred. The order mirrors the product brief. */
export function compareExperimentalCandidateMeasures(
  left: ExperimentalCandidateMeasure,
  right: ExperimentalCandidateMeasure,
  strategy: FormulationStrategy,
): number {
  if (left.structurallyAdmissible !== right.structurallyAdmissible) {
    return left.structurallyAdmissible ? -1 : 1;
  }
  let compared = compareNumber(left.hardViolationCount, right.hardViolationCount);
  if (compared !== 0) return compared;
  compared = compareNumber(left.hardSeverityPoints, right.hardSeverityPoints);
  if (compared !== 0) return compared;
  compared = compareNumber(left.explicitTargetViolationCount, right.explicitTargetViolationCount);
  if (compared !== 0) return compared;
  compared = compareNumber(left.explicitTargetSeverityPoints, right.explicitTargetSeverityPoints);
  if (compared !== 0) return compared;
  // Crown is an explicit user request and therefore precedes proximity.
  compared = compareNumber(right.crownGrams, left.crownGrams);
  if (compared !== 0) return compared;
  compared = compareNumber(left.normalizedDistanceFromUser, right.normalizedDistanceFromUser);
  if (compared !== 0) return compared;
  if (strategy === 'eco') {
    const leftCost = left.ecoSecondaryCostPerKg ?? Number.POSITIVE_INFINITY;
    const rightCost = right.ecoSecondaryCostPerKg ?? Number.POSITIVE_INFINITY;
    compared = compareNumber(leftCost, rightCost);
    if (compared !== 0) return compared;
  } else {
    const leftScore = left.optimalSecondaryScore ?? Number.NEGATIVE_INFINITY;
    const rightScore = right.optimalSecondaryScore ?? Number.NEGATIVE_INFINITY;
    compared = compareNumber(rightScore, leftScore);
    if (compared !== 0) return compared;
  }
  compared = compareNumber(left.absoluteTotalMovementGrams, right.absoluteTotalMovementGrams);
  if (compared !== 0) return compared;
  return compareNumber(left.maximumSingleLineDeltaGrams, right.maximumSingleLineDeltaGrams);
}

/** Existing batch-relative ladder, refined to executable whole-gram precision. */
export function deriveExperimentalStepSchedule(targetBatchGrams: number): number[] {
  return [
    ...new Set(
      [0.05, 0.02, 0.01, 0.005, 0.002, 0.001].map((fraction) =>
        Math.max(1, Math.round(targetBatchGrams * fraction)),
      ),
    ),
  ].sort((left, right) => right - left);
}

const candidateKey = (input: RecipeInput): string =>
  input.items.map((item) => `${item.id}:${item.planned_grams}`).join('|');

const withExchange = (
  input: RecipeInput,
  donorLineId: string,
  receiverLineId: string,
  delta: number,
): RecipeInput => ({
  ...input,
  items: input.items.map((item) =>
    item.id === donorLineId
      ? { ...item, planned_grams: item.planned_grams - delta }
      : item.id === receiverLineId
        ? { ...item, planned_grams: item.planned_grams + delta }
        : item,
  ),
});

const distributeWholeGrams = (total: number, weights: readonly number[]): number[] => {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const allocated = exact.map(Math.floor);
  let remaining = total - allocated.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    allocated[index]! += 1;
    remaining -= 1;
  }
  return allocated;
};

const withMainGroupIncrease = (
  input: RecipeInput,
  mainLineIds: readonly string[],
  donorLineId: string,
  delta: number,
): RecipeInput => {
  const gramsById = new Map(input.items.map((item) => [item.id, item.planned_grams]));
  const allocations = distributeWholeGrams(
    delta,
    mainLineIds.map((lineId) => gramsById.get(lineId) ?? 0),
  );
  const additionById = new Map(mainLineIds.map((lineId, index) => [lineId, allocations[index]!]));
  return {
    ...input,
    items: input.items.map((item) =>
      item.id === donorLineId
        ? { ...item, planned_grams: item.planned_grams - delta }
        : additionById.has(item.id)
          ? { ...item, planned_grams: item.planned_grams + additionById.get(item.id)! }
          : item,
    ),
  };
};

interface SearchState {
  input: RecipeInput;
  measure: ExperimentalCandidateMeasure;
}

export function experimentalNeighborhoodSearch(
  baseline: RecipeInput,
  set: ConstraintSet,
  options: ExperimentalSearchOptions,
): ExperimentalSearchResult {
  const started = performance.now();
  const beamWidth = Math.max(1, Math.floor(options.beamWidth));
  const evaluationBudget = Math.max(0, Math.floor(options.evaluationBudget));
  const iterationsPerStep = Math.max(1, Math.floor(options.iterationsPerStep ?? 3));
  const strategy = normalizeFormulationStrategy(
    baseline.goals?.formulation_strategy ?? baseline.mode,
  );
  const stepScheduleGrams = deriveExperimentalStepSchedule(baseline.target_batch_grams);
  const initial = evaluateExperimentalCandidate(baseline, baseline, set, options);
  const mainIntent = captureMainIngredientIntent(baseline);
  const hasExplicitDirection = recipeDirectionViolations(baseline).length > 0;
  const diagnostics = (overrides: Partial<ExperimentalSearchDiagnostics> = {}) => ({
    beamWidth,
    stepScheduleGrams,
    iterations: 0,
    candidateEvaluations: 0,
    uniqueCandidates: 1,
    budgetExhausted: false,
    elapsedMs: performance.now() - started,
    ...overrides,
  });

  if (strategy === 'eco' && initial.ecoSecondaryCostPerKg === null) {
    return { status: 'refused', input: baseline, measure: initial, diagnostics: diagnostics() };
  }

  // Strongest baseline: valid + no unsatisfied request + no Crown means no-op.
  if (
    strategy !== 'eco' &&
    initial.structurallyAdmissible &&
    initial.hardViolationCount === 0 &&
    !hasExplicitDirection &&
    mainIntent.length === 0
  ) {
    return { status: 'no_change', input: baseline, measure: initial, diagnostics: diagnostics() };
  }

  const excluded = new Set(
    (options.excludedIngredientIds ?? []).map(canonicalIngredientIdFromSourceId),
  );
  const mainLineIds = mainIntent.map((main) => main.lineId);
  const seen = new Set<string>([candidateKey(baseline)]);
  let candidateEvaluations = 0;
  let iterations = 0;
  let budgetExhausted = false;
  const seeded: SearchState[] = [{ input: baseline, measure: initial }];
  for (const seed of options.seedInputs ?? []) {
    if (candidateEvaluations >= evaluationBudget) {
      budgetExhausted = true;
      break;
    }
    const key = candidateKey(seed);
    if (seen.has(key)) continue;
    seen.add(key);
    candidateEvaluations += 1;
    const measure = evaluateExperimentalCandidate(baseline, seed, set, options);
    if (measure.structurallyAdmissible) seeded.push({ input: seed, measure });
  }
  seeded.sort((left, right) =>
    compareExperimentalCandidateMeasures(left.measure, right.measure, strategy),
  );
  let beam = seeded.slice(0, beamWidth);
  let best = beam[0]!;

  const consider = (candidate: RecipeInput, pool: SearchState[]) => {
    if (candidateEvaluations >= evaluationBudget) {
      budgetExhausted = true;
      return;
    }
    const key = candidateKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    candidateEvaluations += 1;
    const measure = evaluateExperimentalCandidate(baseline, candidate, set, options);
    if (!measure.structurallyAdmissible) return;
    pool.push({ input: candidate, measure });
  };

  for (const step of stepScheduleGrams) {
    for (let pass = 0; pass < iterationsPerStep; pass += 1) {
      if (budgetExhausted) break;
      iterations += 1;
      const pool: SearchState[] = [...beam];
      for (const state of beam) {
        const adjustable = state.input.items.filter(
          (item) =>
            item.actual_grams === null &&
            (item.lock_type === 'unlocked' || item.lock_type === 'main') &&
            (set.byLineId[item.id] === undefined || set.byLineId[item.id]?.mode === 'ai'),
        );
        const donors = adjustable.filter(
          (item) => item.lock_type === 'unlocked' && item.planned_grams > 0,
        );
        const receivers = adjustable.filter(
          (item) =>
            item.lock_type === 'unlocked' && !excluded.has(canonicalIngredientId(item.ingredient)),
        );
        for (const donor of donors) {
          const relativeStep = Math.max(1, Math.round(donor.planned_grams * 0.1));
          const deltas = [...new Set([step, Math.min(step, relativeStep)])].filter(
            (delta) => delta > 0 && delta <= donor.planned_grams,
          );
          for (const delta of deltas) {
            for (const receiver of receivers) {
              if (receiver.id === donor.id) continue;
              consider(withExchange(state.input, donor.id, receiver.id, delta), pool);
              if (budgetExhausted) break;
            }
            if (mainLineIds.length > 0 && !mainLineIds.includes(donor.id)) {
              consider(withMainGroupIncrease(state.input, mainLineIds, donor.id, delta), pool);
            }
            if (budgetExhausted) break;
          }
          if (budgetExhausted) break;
        }
        if (budgetExhausted) break;
      }
      pool.sort((left, right) =>
        compareExperimentalCandidateMeasures(left.measure, right.measure, strategy),
      );
      const nextBeam = pool.slice(0, beamWidth);
      const nextBest = nextBeam[0] ?? best;
      if (compareExperimentalCandidateMeasures(nextBest.measure, best.measure, strategy) < 0) {
        best = nextBest;
      }
      const unchanged =
        nextBeam.length === beam.length &&
        nextBeam.every(
          (state, index) => candidateKey(state.input) === candidateKey(beam[index]!.input),
        );
      beam = nextBeam;
      if (unchanged) break;
    }
    if (budgetExhausted) break;
  }

  const finalDiagnostics = diagnostics({
    iterations,
    candidateEvaluations,
    uniqueCandidates: seen.size,
    budgetExhausted,
    elapsedMs: performance.now() - started,
  });
  const changed = candidateKey(best.input) !== candidateKey(baseline);
  const hardSafe = best.measure.structurallyAdmissible && best.measure.hardViolationCount === 0;
  const targetReached = best.measure.explicitTargetViolationCount === 0;
  const startingMain = initial.crownGrams;
  const mainImproved = mainIntent.length === 0 || best.measure.crownGrams > startingMain + EPSILON;
  if (!changed) {
    return {
      status: hardSafe && targetReached ? 'no_change' : 'refused',
      input: baseline,
      measure: initial,
      diagnostics: finalDiagnostics,
    };
  }
  if (!hardSafe) {
    return { status: 'refused', input: baseline, measure: initial, diagnostics: finalDiagnostics };
  }
  if (!mainImproved && mainIntent.length > 0) {
    return {
      status: 'no_change',
      input: baseline,
      measure: initial,
      diagnostics: finalDiagnostics,
    };
  }
  if (targetReached) {
    return {
      status: 'candidate',
      input: best.input,
      measure: best.measure,
      diagnostics: finalDiagnostics,
    };
  }
  const directionImproved =
    best.measure.explicitTargetViolationCount < initial.explicitTargetViolationCount ||
    (best.measure.explicitTargetViolationCount === initial.explicitTargetViolationCount &&
      best.measure.explicitTargetSeverityPoints < initial.explicitTargetSeverityPoints - EPSILON);
  return directionImproved
    ? { status: 'nearest', input: best.input, measure: best.measure, diagnostics: finalDiagnostics }
    : { status: 'refused', input: baseline, measure: initial, diagnostics: finalDiagnostics };
}
