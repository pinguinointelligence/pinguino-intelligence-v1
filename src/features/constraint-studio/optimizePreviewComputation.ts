import type { RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  buildOptimizePreview,
  type BuildPreviewResult,
  type OptimizePreviewOptions,
} from './applyPipeline';
import {
  assessRescueIngredientAdvice,
  type RescueIngredientAdvice,
} from './rescueIngredientAdvisor';

export interface OptimizePreviewComputationRequest {
  input: RecipeInput;
  constraints: ConstraintSet;
  createdAt: string;
  options: OptimizePreviewOptions;
}

export interface OptimizePreviewComputation {
  result: BuildPreviewResult;
  rescueAdvice: RescueIngredientAdvice | null;
}

export const optimizePreviewNeedsRescueAssessment = (result: BuildPreviewResult): boolean => {
  if (!result.ok) return result.code === 'no_proposal' || result.code === 'unsafe_proposal';
  const direction = result.preview.directionAssessment;
  return (
    result.preview.diagnosticOnly === true ||
    (direction?.active === true && direction.supportedAxisCount > 0 && !direction.reached)
  );
};

export function computeOptimizePreviewResult(
  request: OptimizePreviewComputationRequest,
): BuildPreviewResult {
  return buildOptimizePreview(
    request.input,
    request.constraints,
    request.createdAt,
    request.options,
  );
}

export function computeOptimizePreviewRescueAdvice(
  request: OptimizePreviewComputationRequest,
  result: BuildPreviewResult,
): RescueIngredientAdvice | null {
  if ((request.options.rescueSimulationLineIds?.length ?? 0) > 0) return null;
  if (!optimizePreviewNeedsRescueAssessment(result)) return null;
  return assessRescueIngredientAdvice({
    input: request.input,
    set: request.constraints,
    createdAt: request.createdAt,
    options: request.options,
    bestCurrent: result.ok ? result.preview : null,
  });
}

/**
 * The canonical Optimize + rescue composition used by non-Worker fallbacks.
 * The browser Worker executes these same two canonical stages, publishing the
 * domain result before optional rescue enrichment. There is no second solver,
 * formula, policy, or approximation hidden in the runtime boundary.
 */
export function computeOptimizePreview(
  request: OptimizePreviewComputationRequest,
): OptimizePreviewComputation {
  const result = computeOptimizePreviewResult(request);
  const rescueAdvice = computeOptimizePreviewRescueAdvice(request, result);
  return { result, rescueAdvice };
}
