import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useMasterLabelStore } from '@/features/master-label/masterLabelStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import type { VisibleProductType } from '@/features/studio/productType';

/** Material state that would be discarded by an explicit new-draft action. */
export function hasUnsavedProRecipeChanges(nameChanged = false): boolean {
  const recipe = useRecipeStore.getState();
  const studio = useConstraintStudioStore.getState();
  return (
    nameChanged ||
    recipe.dirty ||
    Object.keys(studio.constraints.byLineId).length > 0 ||
    studio.preview !== null ||
    studio.previewIssue !== null ||
    studio.history.length > 0 ||
    useProductionSessionStore.getState().session !== null ||
    useMasterLabelStore.getState().label !== null
  );
}

/**
 * Explicit customer entry into a new Pro draft. This never mutates a saved
 * recipe aggregate: it detaches the workbench from the previous saved link,
 * loads the canonical starter and applies the account/product defaults through
 * the store's single reset path.
 */
export function startNewProRecipe(requestedVisible?: VisibleProductType): void {
  const visibleProductType = requestedVisible ?? useRecipeStore.getState().visibleProductType;
  useRecipeStore.getState().startNewRecipe(visibleProductType);
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
  useMasterLabelStore.getState().clear();
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
  if (typeof recipe.newRecipeStarterTemplateId !== 'string') {
    recipe.setVisibleProductType(next);
    return 'recipe_profile_changed';
  }
  if (hasUnsavedProRecipeChanges()) return 'confirmation_required';
  startNewProRecipe(next);
  return 'starter_replaced';
}
