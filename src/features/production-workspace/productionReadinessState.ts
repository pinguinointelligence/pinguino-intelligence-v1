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

/**
 * An immutable saved version, reopened and not edited, IS its own executable
 * evidence when every planned gram is whole.
 *
 * The practical audit exists to prove one thing: "this working input is exactly
 * the one that came out of Apply". A version that was written by Apply and is
 * being read back byte-identical satisfies that claim by identity — the saved
 * production fingerprint covers the technical base, the immutable line order,
 * the ProductBehavior bindings and the topping vector, so an equal fingerprint
 * means nothing has moved since the version was written.
 *
 * This is deliberately narrow. It does NOT relax what "executable" means: a
 * fractional gram, a pending recalculation, an unused 0 g row or any edit at
 * all still fails, and an unsaved draft has no version identity to appeal to.
 * It only stops the absence of a metadata key from outranking the recipe it
 * describes.
 */
function savedVersionIsOwnExecutableEvidence(input: {
  workingInput: RecipeInput;
  currentProductionFingerprint: string;
  savedProductionFingerprint: string | null | undefined;
  savedVersionId: string | null;
}): boolean {
  if (input.savedVersionId === null) return false;
  if (
    input.savedProductionFingerprint === null ||
    input.savedProductionFingerprint === undefined ||
    input.savedProductionFingerprint !== input.currentProductionFingerprint
  ) {
    return false;
  }
  // „Produkcja korzysta wyłącznie ze zweryfikowanej receptury wykonawczej w
  // PEŁNYCH GRAMACH" — so whole grams are checked here, not assumed.
  return input.workingInput.items.every(
    (item) => Number.isInteger(item.planned_grams) && item.planned_grams > 0,
  );
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
    // Owner zero-gram executable invariant: an explicit 0 g optional row is
    // never an executable recipe state — it must be recalculated (omitted) first.
    unusedZeroGramLineIds(input.workingInput, { byLineId: {} }).length > 0
  ) {
    return 'TECHNICALLY_STALE';
  }

  /* PC-06. Demanding a recalculation that the solver has nothing to do is a
     closed loop, not a gate: Produkcja said "najpierw przelicz", Przelicz
     answered "receptura nie została zmieniona", and ZAPISZ was disabled because
     nothing had changed. 361 of 722 saved versions on staging carry no
     practical audit, so this was reachable across half the library — and a
     Sorbet, whose recalculation legitimately has no move to make, could never
     escape it. The audit stays the primary evidence; an untouched saved version
     in whole grams is accepted as the same evidence by identity. */
  if (
    !practicalRecipeAuditMatchesInput(input.workingInput, input.practicalAudit) &&
    !savedVersionIsOwnExecutableEvidence(input)
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
