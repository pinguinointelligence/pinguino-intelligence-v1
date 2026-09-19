/**
 * THE one way a recipe from somewhere else becomes the customer's working copy — an official
 * Gellatti recipe, a Community publication or a direct share.
 *
 * The source is only READ. The copy is loaded as an unsaved draft with no saved link, so the
 * first save creates the customer's own recipe (with its provenance) and the original can
 * never be written through it. The recipe-specific sidecars of the previous draft are
 * cleared the same way an explicit new recipe clears them.
 */
import type { RecipeInput } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { useRecipeStore } from '@/stores/recipeStore';
import { attachRecipeProvenance, type RecipeProvenance } from './recipeProvenance';

export interface WorkingCopySource {
  readonly input: RecipeInput;
  readonly name: string;
  readonly composition: RecipeCompositionMetadata | null;
  readonly provenance: RecipeProvenance;
}

export function adoptWorkingCopy(copy: WorkingCopySource): void {
  useRecipeStore.getState().loadRecipeInput(attachRecipeProvenance(copy.input, copy.provenance), {
    savedId: null,
    savedName: copy.name,
    versionNumber: null,
    versionDate: null,
    composition: copy.composition,
  });
  useConstraintStudioStore.getState().resetDraftSession();
  useConstraintStudioStore.setState({ proCoreRecipeId: null, lastSavedVersion: null });
  useProductionSessionStore.getState().clear();
}
