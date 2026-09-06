import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';

/**
 * The terminal authority for the exact 0.1 g vector that Production will
 * persist and later hydrate. Engine bands are necessary but not sufficient:
 * this also retains Main and stabilizer policy, frozen ProductBehavior and all
 * profile gates.
 */
export function evaluateProductionRescueTerminalAuthority(
  candidate: RecipeInput,
  composition: RecipeCompositionMetadata,
) {
  const candidateBatchGrams = candidate.items.reduce((sum, item) => sum + item.planned_grams, 0);
  return evaluateRecipeConstraintAuthority({
    recipe: { ...candidate, target_batch_grams: candidateBatchGrams },
    snapshots: composition.behaviorSnapshots ?? {},
    module: 'BATCH_RESCUE',
    technicalOnlyMainLineIds: composition.ownerReviewGate?.technicalOnlyMainLineIds,
  });
}
