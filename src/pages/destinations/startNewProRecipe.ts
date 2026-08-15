import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { VisibleProductType } from '@/features/studio/productType';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  isNewRecipeServingModeId,
  newRecipeStarterMaterialFingerprint,
  starterServingModeForTemperature,
  starterTemperatureForServingMode,
  type NewRecipeStarterKey,
  type NewRecipeServingModeId,
} from '@/features/recipes/newRecipeStarter';

const hasRecipeSpecificSidecars = (): boolean => {
  const studio = useConstraintStudioStore.getState();
  const ingredientUx = useIngredientTableUxStore.getState();
  return (
    Object.keys(studio.constraints.byLineId).length > 0 ||
    studio.preview !== null ||
    studio.previewIssue !== null ||
    studio.substitutionConsent !== null ||
    studio.substitutionAuthorization !== null ||
    studio.suggestedFixAuthorization !== null ||
    studio.directionBestCandidate !== null ||
    studio.directionConsent !== null ||
    studio.blocked !== null ||
    studio.feasibility !== null ||
    studio.history.length > 0 ||
    studio.recalculationTerminal !== null ||
    useProductionSessionStore.getState().session !== null ||
    useMasterLabelStore.getState().label !== null ||
    Object.keys(ingredientUx.metaByLineId).length > 0 ||
    Object.keys(ingredientUx.unresolvedRequiredByLineId).length > 0 ||
    useRecipeProfileStore.getState().awaitingRecalculation
  );
};

/** Material state that would be discarded by an explicit new-draft action. */
export function hasUnsavedProRecipeChanges(nameChanged = false): boolean {
  const recipe = useRecipeStore.getState();
  return nameChanged || recipe.dirty || hasRecipeSpecificSidecars();
}

/**
 * Explicit customer entry into a new Pro draft. This never mutates a saved
 * recipe aggregate: it detaches the workbench from the previous saved link,
 * loads the canonical starter and applies the account/product defaults through
 * the store's single reset path.
 */
export function startNewProRecipe(requestedVisible?: VisibleProductType): void {
  useRecipeStore.getState().startNewRecipe(requestedVisible);
  useConstraintStudioStore.getState().resetDraftSession();
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
  useMasterLabelStore.getState().clear();
}

export type NewRecipeStarterSettingsPatch = Partial<
  Pick<
    NewRecipeStarterKey,
    'visibleProductType' | 'servingModeId' | 'formulationStrategy' | 'targetBatchGrams'
  >
>;

export type NewRecipeStarterSettingsChangeResult =
  | 'starter_replaced'
  | 'confirmation_required'
  | 'existing_recipe';

const currentStarterKey = (): NewRecipeStarterKey => {
  const recipe = useRecipeStore.getState();
  const stored = recipe.newRecipeStarterKey;
  return {
    visibleProductType: stored?.visibleProductType ?? recipe.visibleProductType,
    servingModeId:
      stored?.servingModeId ??
      (isNewRecipeServingModeId(recipe.servingModeId)
        ? recipe.servingModeId
        : starterServingModeForTemperature(recipe.target_temperature_c)),
    formulationStrategy: stored?.formulationStrategy ?? recipe.formulation_strategy,
    targetBatchGrams: stored?.targetBatchGrams ?? recipe.target_batch_grams,
  };
};

/** Material identity only. Generic `dirty` deliberately does not participate:
 * an account-private ECO price invalidates a Preview but does not edit grams,
 * products, toppings, locks or availability of the starter. */
export function isUntouchedNewRecipeStarter(): boolean {
  const recipe = useRecipeStore.getState();
  if (
    typeof recipe.newRecipeStarterTemplateId !== 'string' ||
    recipe.newRecipeStarterKey === null ||
    recipe.newRecipeStarterMaterialFingerprint === null
  ) {
    return false;
  }
  const fingerprint = newRecipeStarterMaterialFingerprint({
    items: recipe.items,
    toppings: recipe.toppings,
    excludedIngredientIds: recipe.excludedIngredientIds,
    unavailableMainIngredientIds: recipe.unavailableMainIngredientIds,
  });
  return (
    fingerprint === recipe.newRecipeStarterMaterialFingerprint &&
    !hasRecipeSpecificSidecars()
  );
}

export function rebuildNewProRecipeStarter(patch: NewRecipeStarterSettingsPatch): void {
  const next = { ...currentStarterKey(), ...patch };
  useRecipeStore.getState().rebuildNewRecipeStarter(next);
  useConstraintStudioStore.getState().resetDraftSession();
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
  useMasterLabelStore.getState().clear();
}

export function requestNewRecipeStarterSettingsChange(
  patch: NewRecipeStarterSettingsPatch,
): NewRecipeStarterSettingsChangeResult {
  if (useRecipeStore.getState().newRecipeStarterKey === null) return 'existing_recipe';
  if (!isUntouchedNewRecipeStarter()) return 'confirmation_required';
  rebuildNewProRecipeStarter(patch);
  return 'starter_replaced';
}

export const starterSettingsPatch = {
  product: (visibleProductType: VisibleProductType): NewRecipeStarterSettingsPatch => ({
    visibleProductType,
  }),
  serving: (servingModeId: NewRecipeServingModeId): NewRecipeStarterSettingsPatch => ({
    servingModeId,
  }),
  strategy: (formulationStrategy: FormulationStrategy): NewRecipeStarterSettingsPatch => ({
    formulationStrategy,
  }),
  batch: (targetBatchGrams: number): NewRecipeStarterSettingsPatch => ({ targetBatchGrams }),
};

/** Machine context is part of the requested setting, not a side effect that a
 * starter rebuild may infer. In particular, Home → Professional at the same
 * temperature must not be swallowed by the rebuild's Home-preservation rule. */
export function applyProfessionalStarterMachineSelection(
  servingModeId: NewRecipeServingModeId,
  label: string,
): void {
  useRecipeStore.getState().setMachineSelection({
    kind: 'professional',
    servingModeId,
    machineId: null,
    label,
    temperatureC: starterTemperatureForServingMode(servingModeId),
    batchGrams: null,
    capacityGrams: null,
  });
}

export function requestProfessionalStarterServingChange(
  servingModeId: NewRecipeServingModeId,
  label: string,
): NewRecipeStarterSettingsChangeResult {
  const result = requestNewRecipeStarterSettingsChange(
    starterSettingsPatch.serving(servingModeId),
  );
  if (result !== 'confirmation_required') {
    applyProfessionalStarterMachineSelection(servingModeId, label);
    if (result === 'starter_replaced') {
      // `setMachineSelection` advances the universal draft revision, whose
      // subscriber correctly invalidates ordinary edits. Here the Engine-ready
      // starter has already been rebuilt for the final machine context, so no
      // second PI click is required merely to clear that subscriber signal.
      useRecipeProfileStore.getState().acknowledgeRecalculation();
    }
  }
  return result;
}

export type NewRecipeProductTypeChangeResult =
  | 'starter_replaced'
  | 'confirmation_required'
  | 'recipe_profile_changed';

/**
 * Product switches may replace only an explicit new-draft scaffold. Opened
 * saved/history/library recipes keep their exact lines and use the existing
 * profile-only transition.
 */
export function requestNewRecipeProductTypeChange(
  next: VisibleProductType,
): NewRecipeProductTypeChangeResult {
  const recipe = useRecipeStore.getState();
  if (recipe.newRecipeStarterKey === null) {
    recipe.setVisibleProductType(next);
    return 'recipe_profile_changed';
  }
  const result = requestNewRecipeStarterSettingsChange({ visibleProductType: next });
  return result === 'existing_recipe' ? 'recipe_profile_changed' : result;
}
