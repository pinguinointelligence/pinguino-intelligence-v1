import {
  calculateRecipe,
  type RecipeDirectionTarget,
  type RecipeDirectionTargets,
  type RecipeInput,
} from '@/engine';
import {
  buildRecipeDirectionPlan,
  hasActiveExactDirectionObjective,
  normalizeRecipeDirectionTargets,
} from '@/features/recipe-direction/recipeDirectionTargets';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import type { ConstraintSet } from '@/features/recipe-constraints';
import type { BuildPreviewResult, ConstraintPreview } from './applyPipeline';

interface NormalDirectionResult {
  ok: boolean;
  code?: string;
  preview?: ConstraintPreview;
  failureKind?: 'SEARCH_FAILED';
}

export interface DirectionFallbackAttempt {
  attemptIndex: number;
  targets: RecipeDirectionTargets;
  targetReached: boolean;
  runtimeMs: number;
  preview: ConstraintPreview | null;
  originalTargetScore: number | null;
  preservedOriginallySatisfiedAxes: boolean;
}

export interface DirectionFallbackReport {
  profile: RecipeInput['category'];
  failureKind: 'SEARCH_FAILED' | null;
  requestedTargets: RecipeDirectionTargets;
  attempts: DirectionFallbackAttempt[];
  best: DirectionFallbackAttempt | null;
  totalRuntimeMs: number;
}

export interface DirectionFallbackBuildInput {
  input: RecipeInput;
  set: ConstraintSet;
  createdAt: string;
  normalResult: NormalDirectionResult;
  evaluateCandidate: (input: {
    fallbackInput: RecipeInput;
    targets: RecipeDirectionTargets;
    attemptIndex: number;
  }) => BuildPreviewResult;
}

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const stepTowardZero = (target: RecipeDirectionTarget): RecipeDirectionTarget =>
  target === 0 ? 0 : ((target + (target < 0 ? 1 : -1)) as RecipeDirectionTarget);

const sameTargets = (left: RecipeDirectionTargets, right: RecipeDirectionTargets): boolean =>
  left.sweetness === right.sweetness &&
  left.softness === right.softness &&
  left.creaminess === right.creaminess &&
  left.flavor === right.flavor;

/**
 * The owner-approved Direction fallback is deliberately tiny: only supported,
 * non-neutral axes move one selector position toward zero. A second neutral
 * attempt exists only when the first step was still non-neutral. No other
 * sibling level is generated and this function never mutates the recipe.
 */
export function directionFallbackTargetSequence(input: RecipeInput): RecipeDirectionTargets[] {
  if (!hasActiveExactDirectionObjective(input)) return [];
  const requested = normalizeRecipeDirectionTargets(input.goals?.direction_targets);
  const workingAxes = new Set(
    buildRecipeDirectionPlan(input)
      .axes.filter((axis) => axis.status === 'working')
      .map((axis) => axis.axis),
  );
  // Only Vegan adopts the corrected fallback contract in this task. A target
  // axis the current recipe already reaches is held at the ORIGINAL requested
  // level; only missed axes are allowed to step toward neutral. This keeps the
  // shared fallback behavior byte-compatible for every other product profile.
  const satisfiedVeganAxes =
    input.category === 'vegan_gelato'
      ? new Set(
          assessRecipeDirection(input, calculateRecipe(input))
            .residuals.filter((residual) => residual.reached)
            .map((residual) => residual.axis),
        )
      : new Set<keyof RecipeDirectionTargets>();
  const relaxableAxes = new Set([...workingAxes].filter((axis) => !satisfiedVeganAxes.has(axis)));
  const adjacent: RecipeDirectionTargets = { ...requested };
  for (const axis of relaxableAxes) adjacent[axis] = stepTowardZero(requested[axis]);
  if (sameTargets(adjacent, requested)) return [];

  const sequence = [adjacent];
  const neutral: RecipeDirectionTargets = { ...adjacent };
  for (const axis of relaxableAxes) {
    if (requested[axis] !== 0) neutral[axis] = 0;
  }
  if (!sameTargets(neutral, adjacent)) sequence.push(neutral);
  return sequence;
}

/** Exact current-ingredient Direction always owns the first attempt. */
export function shouldRunDirectionFallback(
  input: RecipeInput,
  normalResult: NormalDirectionResult,
): boolean {
  if (directionFallbackTargetSequence(input).length === 0) return false;
  if (normalResult.ok) {
    const assessment = normalResult.preview?.directionAssessment;
    return (
      normalResult.preview?.diagnosticOnly === true ||
      (assessment?.active === true &&
        assessment.supportedAxisCount > 0 &&
        assessment.reached !== true)
    );
  }
  return (
    normalResult.code === 'no_proposal' ||
    normalResult.code === 'unsafe_proposal' ||
    normalResult.code === 'best_safe_result'
  );
}

/**
 * Executes at most two same-ingredient checks and stops at the first verified
 * achieved level. The evaluator owns Engine verification; this orchestration
 * accepts only a non-diagnostic Preview whose proposed goal is exactly the
 * level it asked for.
 */
export function buildDirectionFallback(
  request: DirectionFallbackBuildInput,
): DirectionFallbackReport {
  const started = nowMs();
  const requestedTargets = normalizeRecipeDirectionTargets(request.input.goals?.direction_targets);
  const profile = request.input.category;
  const failureKind =
    profile === 'vegan_gelato' &&
    request.normalResult.ok === false &&
    request.normalResult.code === 'no_proposal' &&
    request.normalResult.failureKind === 'SEARCH_FAILED'
      ? 'SEARCH_FAILED'
      : null;
  if (!shouldRunDirectionFallback(request.input, request.normalResult)) {
    return {
      profile,
      failureKind,
      requestedTargets,
      attempts: [],
      best: null,
      totalRuntimeMs: nowMs() - started,
    };
  }

  const originalAssessment = assessRecipeDirection(request.input, calculateRecipe(request.input));
  const originallySatisfiedAxes = new Set(
    originalAssessment.residuals
      .filter((residual) => residual.reached)
      .map((residual) => residual.axis),
  );
  const attempts: DirectionFallbackAttempt[] = [];
  let best: DirectionFallbackAttempt | null = null;
  for (const [attemptIndex, targets] of directionFallbackTargetSequence(request.input).entries()) {
    const attemptStarted = nowMs();
    const fallbackInput: RecipeInput = {
      ...request.input,
      goals: {
        ...request.input.goals,
        direction_targets_active: true,
        direction_targets: { ...targets },
      },
    };
    const result = request.evaluateCandidate({ fallbackInput, targets, attemptIndex });
    const proposedTargets = result.ok
      ? normalizeRecipeDirectionTargets(result.preview.proposedInput.goals?.direction_targets)
      : null;
    const fallbackTargetReached =
      result.ok &&
      result.preview.diagnosticOnly !== true &&
      result.preview.directionAssessment?.active === true &&
      result.preview.directionAssessment.supportedAxisCount > 0 &&
      result.preview.directionAssessment.reached === true &&
      proposedTargets !== null &&
      sameTargets(proposedTargets, targets);
    const originalTargetAssessment = result.ok
      ? assessRecipeDirection(
          {
            ...result.preview.proposedInput,
            goals: {
              ...result.preview.proposedInput.goals,
              direction_targets_active: true,
              direction_targets: { ...requestedTargets },
            },
          },
          calculateRecipe(result.preview.proposedInput),
        )
      : null;
    const preservedOriginallySatisfiedAxes =
      originalTargetAssessment !== null &&
      [...originallySatisfiedAxes].every(
        (axis) =>
          originalTargetAssessment.residuals.find((residual) => residual.axis === axis)?.reached ===
          true,
      );
    const originalTargetNotWorse =
      originalTargetAssessment !== null &&
      originalTargetAssessment.reachedAxisCount >= originalAssessment.reachedAxisCount;
    const targetReached =
      fallbackTargetReached &&
      (profile !== 'vegan_gelato' || (preservedOriginallySatisfiedAxes && originalTargetNotWorse));
    const attempt: DirectionFallbackAttempt = {
      attemptIndex,
      targets: { ...targets },
      targetReached,
      runtimeMs: nowMs() - attemptStarted,
      preview: targetReached && result.ok ? result.preview : null,
      originalTargetScore: originalTargetAssessment?.score ?? null,
      preservedOriginallySatisfiedAxes,
    };
    attempts.push(attempt);
    if (targetReached) {
      best = attempt;
      break;
    }
  }
  return {
    profile,
    failureKind,
    requestedTargets,
    attempts,
    best,
    totalRuntimeMs: nowMs() - started,
  };
}
