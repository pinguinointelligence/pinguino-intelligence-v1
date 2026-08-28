import type { RecipeDirectionTarget, RecipeDirectionTargets, RecipeInput } from '@/engine';
import {
  buildRecipeDirectionPlan,
  hasActiveExactDirectionObjective,
  normalizeRecipeDirectionTargets,
} from '@/features/recipe-direction/recipeDirectionTargets';
import type { ConstraintSet } from '@/features/recipe-constraints';
import type { BuildPreviewResult, ConstraintPreview } from './applyPipeline';

interface NormalDirectionResult {
  ok: boolean;
  code?: string;
  preview?: ConstraintPreview;
}

export interface DirectionFallbackAttempt {
  attemptIndex: number;
  targets: RecipeDirectionTargets;
  targetReached: boolean;
  runtimeMs: number;
  preview: ConstraintPreview | null;
}

export interface DirectionFallbackReport {
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
  const adjacent: RecipeDirectionTargets = { ...requested };
  for (const axis of workingAxes) adjacent[axis] = stepTowardZero(requested[axis]);
  if (sameTargets(adjacent, requested)) return [];

  const sequence = [adjacent];
  const neutral: RecipeDirectionTargets = { ...adjacent };
  for (const axis of workingAxes) {
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
  if (!shouldRunDirectionFallback(request.input, request.normalResult)) {
    return { requestedTargets, attempts: [], best: null, totalRuntimeMs: nowMs() - started };
  }

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
    const targetReached =
      result.ok &&
      result.preview.diagnosticOnly !== true &&
      result.preview.directionAssessment?.active === true &&
      result.preview.directionAssessment.supportedAxisCount > 0 &&
      result.preview.directionAssessment.reached === true &&
      proposedTargets !== null &&
      sameTargets(proposedTargets, targets);
    const attempt: DirectionFallbackAttempt = {
      attemptIndex,
      targets: { ...targets },
      targetReached,
      runtimeMs: nowMs() - attemptStarted,
      preview: targetReached && result.ok ? result.preview : null,
    };
    attempts.push(attempt);
    if (targetReached) {
      best = attempt;
      break;
    }
  }
  return { requestedTargets, attempts, best, totalRuntimeMs: nowMs() - started };
}
