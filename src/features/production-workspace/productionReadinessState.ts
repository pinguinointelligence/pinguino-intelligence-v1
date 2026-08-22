import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { toppingIngredientIdentity } from '@/features/recipe-composition/labelTopping';
import {
  practicalRecipeAuditMatchesInput,
  practicalRecipeInputFingerprint,
  type PracticalRecipeSavedAudit,
  unusedZeroGramLineIds,
} from '@/features/practical-recipe/practicalRecipe';

export type ProductionRecipeLifecycleState =
  | 'TECHNICALLY_STALE'
  | 'CALCULATED_BUT_UNSAVED'
  | 'READY';

/**
 * Persistence/execution identity of the exact working version. BASE technical
 * truth is delegated to the existing practical-recipe fingerprint. This layer
 * adds only the immutable ordering, ProductBehavior bindings and final-product
 * topping vector that must be saved before Production may use a version id.
 * Commercial prices and recipe-level display metadata are intentionally absent.
 */
export function productionVersionFingerprint(
  input: RecipeInput,
  composition: RecipeCompositionMetadata,
): string {
  return JSON.stringify({
    technicalBase: practicalRecipeInputFingerprint(input),
    baseOrder: composition.baseOrder,
    productBehavior: Object.entries(composition.behaviorSnapshots ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([lineId, snapshot]) => [
        lineId,
        snapshot.productVersionId,
        snapshot.factsFingerprint,
        snapshot.behaviorBindingId,
        snapshot.behaviorBindingVersion,
        snapshot.taxonomyVersion,
        snapshot.resolverVersion,
      ]),
    toppings: composition.toppings.map((item) => [
      item.id,
      toppingIngredientIdentity(item.ingredient),
      item.planned_grams,
      item.addon_sort_order,
    ]),
  });
}

export function productionRecipeLifecycleState(input: {
  workingInput: RecipeInput;
  practicalAudit: PracticalRecipeSavedAudit | null | undefined;
  calculationStale: boolean;
  currentProductionFingerprint: string;
  savedProductionFingerprint: string | null | undefined;
  savedVersionId: string | null;
  /** One-release compatibility for drafts persisted before the explicit saved
   * fingerprint existed. It is never used once a fingerprint has been recorded. */
  legacySavedStateClean?: boolean;
}): ProductionRecipeLifecycleState {
  if (
    input.calculationStale ||
    !practicalRecipeAuditMatchesInput(input.workingInput, input.practicalAudit) ||
    // Owner zero-gram executable invariant: an explicit 0 g optional row is
    // never an executable recipe state — it must be recalculated (omitted) first.
    unusedZeroGramLineIds(input.workingInput, { byLineId: {} }).length > 0
  ) {
    return 'TECHNICALLY_STALE';
  }

  const savedVersionMatches =
    input.savedVersionId !== null &&
    (input.savedProductionFingerprint !== null && input.savedProductionFingerprint !== undefined
      ? input.savedProductionFingerprint === input.currentProductionFingerprint
      : input.legacySavedStateClean === true);

  return savedVersionMatches ? 'READY' : 'CALCULATED_BUT_UNSAVED';
}
