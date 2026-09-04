import { calculateRecipe } from '../calculateRecipe';
import type { RecipeInput, RecipeResult } from '../types';
import { detectViolations } from './solver';
import type { CorrectionAction, CorrectionReasonCode } from './types';

const EPSILON = 1e-9;
const DEFAULT_FINE_STEP_G = 0.1;
const DEFAULT_COARSE_STEP_G = 0.5;

export type BatchRecoveryObjective = 'minimum_safe' | 'restore_original_profile';

export interface BatchRecoveryCandidate {
  input: RecipeInput;
  result: RecipeResult;
  actions: CorrectionAction[];
  additionalMassG: number;
  scaleFactor: number | null;
}

export interface BatchRecoveryTrace {
  objective: BatchRecoveryObjective;
  evaluatedCandidateCount: number;
  hardSafeCandidateCount: number;
  eligibleLineCount: number;
  uniqueHardReasonSets: CorrectionReasonCode[][];
  finalCandidateGrams: number[];
}

export interface BatchRecoveryResult {
  candidates: BatchRecoveryCandidate[];
  trace: BatchRecoveryTrace;
}

export interface BatchRecoveryRequest {
  input: RecipeInput;
  baselineInput: RecipeInput;
  objective: BatchRecoveryObjective;
  fineStepG?: number;
  coarseStepG?: number;
  maxAdditionalMassG?: number;
  /** Optional product-layer terminal gate for the exact candidate vector. */
  acceptCandidate?: (candidate: BatchRecoveryCandidate) => boolean;
}

export interface AdditiveRecoveryNeighborhoodEvaluation {
  lineId: string;
  ingredientName: string;
  additionG: number;
  finalMassG: number;
  hardSafe: boolean;
  hardReasons: CorrectionReasonCode[];
}

const effectiveGrams = (item: RecipeInput['items'][number]): number =>
  item.actual_grams ?? item.planned_grams;

const totalMass = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + effectiveGrams(item), 0);

const roundTo = (value: number, precision: number): number =>
  Math.round((value + Number.EPSILON) / precision) * precision;

const withLineAddition = (input: RecipeInput, lineId: string, additionG: number): RecipeInput => {
  const items = input.items.map((item) => {
    if (item.id !== lineId) return item;
    return item.actual_grams === null
      ? { ...item, planned_grams: item.planned_grams + additionG }
      : { ...item, actual_grams: item.actual_grams + additionG };
  });
  return { ...input, items, target_batch_grams: totalMass({ ...input, items }) };
};

/**
 * Minimum-material recovery is add-only and deliberately conservative about
 * which selected products it may use. Main, exact/percentage locks,
 * stabilizers, flavourings and alcohol are not silent dilution material.
 * Confirmed `already_added` products remain eligible because their physical
 * amount is a lower bound, not an upper bound.
 */
const minimumRecoveryLines = (input: RecipeInput) =>
  input.items.filter(
    (item) =>
      item.lock_type !== 'main' &&
      item.lock_type !== 'grams' &&
      item.lock_type !== 'percent' &&
      item.grams_constraint === undefined &&
      item.percent_constraint === undefined &&
      item.ingredient.category !== 'alcohol' &&
      item.ingredient.category !== 'flavor' &&
      item.ingredient.category !== 'stabilizer' &&
      item.ingredient.flags?.is_stabilizer !== true,
  );

const reasonsFor = (result: RecipeResult): CorrectionReasonCode[] =>
  detectViolations(result).map((violation) => violation.reason);

const reasonKey = (reasons: readonly CorrectionReasonCode[]): string =>
  [...reasons].sort().join('|');

const actionFor = (item: RecipeInput['items'][number], grams: number): CorrectionAction => ({
  type: 'add',
  ingredient_id: item.ingredient.id,
  ingredient_name: item.ingredient.name,
  ingredient_category: item.ingredient.category,
  grams,
  target_line_id: item.id,
});

/**
 * Engine-owned diagnostic for the +1 / +2.5 / +5 / +10 g Production matrix.
 * It evaluates the completed proposed batch every time; callers keep physical
 * lower bounds in `actual_grams`. No partial-vessel percentage is calculated.
 */
export function evaluateAdditiveRecoveryNeighborhood(
  input: RecipeInput,
  additionsG: readonly number[],
): AdditiveRecoveryNeighborhoodEvaluation[] {
  const rows: AdditiveRecoveryNeighborhoodEvaluation[] = [];
  for (const item of input.items) {
    for (const additionG of additionsG) {
      const candidate = withLineAddition(input, item.id, additionG);
      const result = calculateRecipe(candidate);
      const hardReasons = reasonsFor(result);
      rows.push({
        lineId: item.id,
        ingredientName: item.ingredient.name,
        additionG,
        finalMassG: result.total_batch_g,
        hardSafe: hardReasons.length === 0,
        hardReasons,
      });
    }
  }
  return rows;
}

function minimumSafeRecovery(request: BatchRecoveryRequest): BatchRecoveryResult {
  const fineStepG = Math.max(0.1, request.fineStepG ?? DEFAULT_FINE_STEP_G);
  const coarseStepG = Math.max(fineStepG, request.coarseStepG ?? DEFAULT_COARSE_STEP_G);
  const maxAdditionalMassG = Math.max(
    coarseStepG,
    request.maxAdditionalMassG ?? Math.min(500, Math.max(10, request.input.target_batch_grams / 2)),
  );
  const eligible = minimumRecoveryLines(request.input);
  const candidates: BatchRecoveryCandidate[] = [];
  const reasonSets = new Map<string, CorrectionReasonCode[]>();
  let evaluatedCandidateCount = 0;
  let hardSafeCandidateCount = 0;

  for (const item of eligible) {
    let firstCoarseSafe: number | null = null;
    for (
      let additionG = coarseStepG;
      additionG <= maxAdditionalMassG + EPSILON;
      additionG += coarseStepG
    ) {
      const roundedAddition = roundTo(additionG, fineStepG);
      const candidate = withLineAddition(request.input, item.id, roundedAddition);
      const result = calculateRecipe(candidate);
      const reasons = reasonsFor(result);
      evaluatedCandidateCount += 1;
      reasonSets.set(reasonKey(reasons), reasons);
      const candidateRecord: BatchRecoveryCandidate = {
        input: candidate,
        result,
        actions: [actionFor(item, roundedAddition)],
        additionalMassG: roundedAddition,
        scaleFactor: null,
      };
      if (reasons.length === 0) hardSafeCandidateCount += 1;
      if (reasons.length === 0 && (request.acceptCandidate?.(candidateRecord) ?? true)) {
        firstCoarseSafe = roundedAddition;
        break;
      }
    }
    if (firstCoarseSafe === null) continue;

    let bestAddition = firstCoarseSafe;
    const refinementStart = Math.max(fineStepG, firstCoarseSafe - coarseStepG + fineStepG);
    for (
      let additionG = refinementStart;
      additionG <= firstCoarseSafe + EPSILON;
      additionG += fineStepG
    ) {
      const roundedAddition = roundTo(additionG, fineStepG);
      const candidate = withLineAddition(request.input, item.id, roundedAddition);
      const result = calculateRecipe(candidate);
      const reasons = reasonsFor(result);
      evaluatedCandidateCount += 1;
      reasonSets.set(reasonKey(reasons), reasons);
      const candidateRecord: BatchRecoveryCandidate = {
        input: candidate,
        result,
        actions: [actionFor(item, roundedAddition)],
        additionalMassG: roundedAddition,
        scaleFactor: null,
      };
      if (reasons.length === 0) hardSafeCandidateCount += 1;
      if (reasons.length === 0 && (request.acceptCandidate?.(candidateRecord) ?? true)) {
        bestAddition = roundedAddition;
        break;
      }
    }

    for (const additionG of new Set([bestAddition, firstCoarseSafe])) {
      const input = withLineAddition(request.input, item.id, additionG);
      const result = calculateRecipe(input);
      const reasons = reasonsFor(result);
      if (reasons.length !== 0) continue;
      const candidateRecord: BatchRecoveryCandidate = {
        input,
        result,
        actions: [actionFor(item, additionG)],
        additionalMassG: additionG,
        scaleFactor: null,
      };
      if (!(request.acceptCandidate?.(candidateRecord) ?? true)) continue;
      candidates.push(candidateRecord);
    }
  }

  candidates.sort(
    (left, right) =>
      left.additionalMassG - right.additionalMassG ||
      left.actions[0]!.target_line_id!.localeCompare(right.actions[0]!.target_line_id!),
  );
  return {
    candidates,
    trace: {
      objective: 'minimum_safe',
      evaluatedCandidateCount,
      hardSafeCandidateCount,
      eligibleLineCount: eligible.length,
      uniqueHardReasonSets: [...reasonSets.values()],
      finalCandidateGrams: candidates.map((candidate) => candidate.result.total_batch_g),
    },
  };
}

function restoreOriginalProfile(request: BatchRecoveryRequest): BatchRecoveryResult {
  const precision = Math.max(0.1, request.fineStepG ?? DEFAULT_FINE_STEP_G);
  const coarseStepG = Math.max(precision, request.coarseStepG ?? DEFAULT_COARSE_STEP_G);
  const currentById = new Map(request.input.items.map((item) => [item.id, item]));
  let scaleFactor = 1;
  for (const baseline of request.baselineInput.items) {
    const current = currentById.get(baseline.id);
    if (!current || baseline.planned_grams <= EPSILON) continue;
    scaleFactor = Math.max(scaleFactor, effectiveGrams(current) / baseline.planned_grams);
  }
  // NO EARLY RETURN AT scaleFactor == 1. This used to bail out whenever nothing
  // in the vessel exceeded its planned amount, which is precisely the
  // UNDERWEIGHT case — and it is the one with the simplest possible answer:
  // scale 1.0 IS the original plan, so `candidateAtScale(1)` tops every short
  // line back up to its planned grams and proposes nothing else. Bailing out
  // reported „Nie mamy bezpiecznej korekty dla tej partii" for STRAWBERRIES
  // planned 217 g / weighed 206 g, where +11 g reconstructs the already-valid
  // 670 g plan exactly.
  //
  // A vessel that already matches its plan is still not a rescue: that
  // candidate has no actions, and `accepted()` below requires at least one.
  // `scaleFactor` is clamped at 1 by its own initializer, so an overweight
  // batch is unaffected (BANANA 345 / 300 keeps scaleFactor 1.15).

  const baselineById = new Map(request.baselineInput.items.map((item) => [item.id, item]));
  const currentTotal = totalMass(request.input);
  const baselineTotal = totalMass(request.baselineInput);
  const maxAdditionalMassG = Math.max(
    coarseStepG,
    request.maxAdditionalMassG ?? Math.min(500, Math.max(10, currentTotal / 2)),
  );
  const reasonSets = new Map<string, CorrectionReasonCode[]>();
  const seenVectors = new Set<string>();
  let evaluatedCandidateCount = 0;
  let hardSafeCandidateCount = 0;

  const candidateAtScale = (candidateScale: number): BatchRecoveryCandidate | null => {
    const actions: CorrectionAction[] = [];
    const items = request.input.items.map((item) => {
      const baseline = baselineById.get(item.id);
      if (!baseline) return item;
      const currentGrams = effectiveGrams(item);
      const targetGrams = Math.max(
        currentGrams,
        roundTo(baseline.planned_grams * candidateScale, precision),
      );
      const additionG = targetGrams - currentGrams;
      if (additionG > EPSILON) actions.push(actionFor(item, additionG));
      return item.actual_grams === null
        ? { ...item, planned_grams: targetGrams }
        : { ...item, actual_grams: targetGrams };
    });
    const vectorKey = items.map((item) => effectiveGrams(item).toFixed(6)).join('|');
    if (seenVectors.has(vectorKey)) return null;
    seenVectors.add(vectorKey);
    const input = {
      ...request.input,
      items,
      target_batch_grams: totalMass({ ...request.input, items }),
    };
    const result = calculateRecipe(input);
    const reasons = reasonsFor(result);
    evaluatedCandidateCount += 1;
    reasonSets.set(reasonKey(reasons), reasons);
    if (reasons.length === 0) hardSafeCandidateCount += 1;
    return {
      input,
      result,
      actions,
      additionalMassG: result.total_batch_g - currentTotal,
      scaleFactor: candidateScale,
    };
  };

  const accepted = (
    candidate: BatchRecoveryCandidate | null,
  ): candidate is BatchRecoveryCandidate =>
    candidate !== null &&
    candidate.actions.length > 0 &&
    reasonsFor(candidate.result).length === 0 &&
    candidate.additionalMassG <= maxAdditionalMassG + EPSILON &&
    (request.acceptCandidate?.(candidate) ?? true);

  let firstAccepted: BatchRecoveryCandidate | null = null;
  const minimum = candidateAtScale(scaleFactor);
  if (accepted(minimum)) {
    firstAccepted = minimum;
  } else {
    for (
      let extraScaleMassG = coarseStepG;
      extraScaleMassG <= maxAdditionalMassG + EPSILON;
      extraScaleMassG += coarseStepG
    ) {
      const candidate = candidateAtScale(scaleFactor + extraScaleMassG / baselineTotal);
      if (accepted(candidate)) {
        firstAccepted = candidate;
        const refinementStart = Math.max(precision, extraScaleMassG - coarseStepG + precision);
        for (
          let refinedMassG = refinementStart;
          refinedMassG < extraScaleMassG - EPSILON;
          refinedMassG += precision
        ) {
          const refined = candidateAtScale(scaleFactor + refinedMassG / baselineTotal);
          if (accepted(refined)) {
            firstAccepted = refined;
            break;
          }
        }
        break;
      }
    }
  }
  const candidates = firstAccepted ? [firstAccepted] : [];
  return {
    candidates,
    trace: {
      objective: 'restore_original_profile',
      evaluatedCandidateCount,
      hardSafeCandidateCount,
      eligibleLineCount: request.input.items.length,
      uniqueHardReasonSets: [...reasonSets.values()],
      finalCandidateGrams: candidates.map((candidate) => candidate.result.total_batch_g),
    },
  };
}

/**
 * Existing Engine/Rescue authority for the two Production recovery objectives.
 * This changes no band, coefficient, PAC/NPAC rule or ProductBehavior value;
 * it generates add-only candidate vectors and accepts them only after the
 * canonical Engine re-runs the completed batch.
 */
export function proposeBatchRecovery(request: BatchRecoveryRequest): BatchRecoveryResult {
  return request.objective === 'minimum_safe'
    ? minimumSafeRecovery(request)
    : restoreOriginalProfile(request);
}
