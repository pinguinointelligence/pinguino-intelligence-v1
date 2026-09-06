import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { VisibleProductType } from '@/features/studio/productType';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';
import { MACHINE_CATALOG, deriveMachineSetup } from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding';
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
}

/**
 * Confirmed product-family change from the recipe settings surface. The native
 * starter still performs the accepted full family reset, while this wrapper
 * restores the recipe's machine/batch authority afterward:
 *  - MACHINE_DEFAULT re-resolves for the new product profile;
 *  - USER_OVERRIDE and custom/professional batches keep the user's grams.
 */
export function changeProRecipeProductType(next: VisibleProductType): void {
  const previous = useRecipeStore.getState();
  const machine = MACHINE_CATALOG.find((profile) => profile.id === previous.machineId) ?? null;
  const prior = {
    kind: previous.machineKind,
    id: previous.machineId,
    label: previous.machineLabel,
    technology: previous.machineTechnology,
    homeFormulationModuleId: previous.homeFormulationModuleId,
    servingModeId: previous.servingModeId,
    temperatureC: previous.target_temperature_c,
    hardCapacityGrams: previous.machine_capacity_grams,
    batchGrams: previous.target_batch_grams,
    batchSource: previous.batch_source,
  } as const;

  startNewProRecipe(next);
  const recipe = useRecipeStore.getState();

  if (prior.kind === 'home' && machine !== null) {
    const setup = deriveMachineSetup(machine, next);
    if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) return;
    recipe.setMachineSelection({
      kind: 'home',
      servingModeId: setup.resolvedVisibleMode,
      machineId: machine.id,
      label: machineDisplayName(machine),
      machineTechnology: machine.technology,
      homeFormulationModuleId: machine.homeFormulationModuleId,
      temperatureC: setup.engineTemperatureC,
      batchGrams:
        prior.batchSource === 'MACHINE_DEFAULT' ? setup.recommendedBatchGrams : prior.batchGrams,
      hardCapacityGrams: setup.hardMaximumBatchGrams,
      batchSource: prior.batchSource,
    });
    return;
  }

  if (prior.kind === 'home' && prior.id?.startsWith('custom-')) {
    recipe.setMachineSelection({
      kind: 'home',
      servingModeId: prior.servingModeId ?? 'fresh',
      machineId: prior.id,
      label: prior.label ?? 'Własna maszyna',
      machineTechnology: prior.technology,
      homeFormulationModuleId: prior.homeFormulationModuleId,
      temperatureC: prior.temperatureC,
      batchGrams: prior.batchGrams,
      hardCapacityGrams: prior.hardCapacityGrams,
      batchSource: 'CUSTOM_MACHINE_BATCH',
    });
    return;
  }

  if (prior.kind === 'professional') {
    recipe.setMachineSelection({
      kind: 'professional',
      servingModeId: prior.servingModeId ?? 'fresh',
      machineId: null,
      label: prior.label ?? 'Maszyna profesjonalna',
      temperatureC: prior.temperatureC,
      batchGrams: prior.batchGrams,
      hardCapacityGrams: null,
      batchSource:
        prior.batchSource === 'PROFESSIONAL_DEFAULT'
          ? 'PROFESSIONAL_DEFAULT'
          : 'PROFESSIONAL_USER_BATCH',
    });
    return;
  }

  recipe.setBatchGrams(
    prior.batchGrams,
    undefined,
    prior.batchSource === 'PROFESSIONAL_DEFAULT'
      ? 'PROFESSIONAL_DEFAULT'
      : 'PROFESSIONAL_USER_BATCH',
  );
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
  return fingerprint === recipe.newRecipeStarterMaterialFingerprint && !hasRecipeSpecificSidecars();
}

export function rebuildNewProRecipeStarter(patch: NewRecipeStarterSettingsPatch): void {
  const next = { ...currentStarterKey(), ...patch };
  useRecipeStore.getState().rebuildNewRecipeStarter(next);
  useConstraintStudioStore.getState().resetDraftSession();
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
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
    // Every fresh product-family initialization starts in OPTIMAL. ECO is an
    // explicit choice made after initialization, never inherited from the
    // recipe/profile that was just replaced.
    formulationStrategy: 'optimal',
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
    hardCapacityGrams: null,
  });
}

export function requestProfessionalStarterServingChange(
  servingModeId: NewRecipeServingModeId,
  label: string,
): NewRecipeStarterSettingsChangeResult {
  const result = requestNewRecipeStarterSettingsChange(starterSettingsPatch.serving(servingModeId));
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

export type NewRecipeProductTypeChangeResult = 'confirmation_required' | 'no_change';

/**
 * A visible product-profile switch is always a structural new-working-recipe
 * request. Internal Engine family compatibility must never relabel or carry the
 * current customer vector across Gelato/Sorbet/Vegan/Protein in the UI.
 *
 * The caller presents confirmation and then invokes `startNewProRecipe(next)`,
 * which preserves the source saved aggregate while loading the target's native
 * starter through the single hard-reset lifecycle.
 */
export function requestNewRecipeProductTypeChange(
  next: VisibleProductType,
): NewRecipeProductTypeChangeResult {
  return next === useRecipeStore.getState().visibleProductType
    ? 'no_change'
    : 'confirmation_required';
}
