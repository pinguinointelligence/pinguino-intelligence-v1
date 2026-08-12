import { useRecipeStore } from '@/stores/recipeStore';

/**
 * Explicit customer entry into a new Pro draft. This never mutates a saved
 * recipe aggregate: it detaches the workbench from the previous saved link,
 * loads the canonical starter and applies the account/product defaults through
 * the store's single reset path.
 */
export function startNewProRecipe(): void {
  useRecipeStore.getState().resetToDemo();
}
