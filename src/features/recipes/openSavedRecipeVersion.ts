import { copy } from '@/copy/en';
import { presentLoadedRecipeInHome } from '@/features/home-creator/homeLoadedRecipe';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import type {
  RecipeVersion,
  SavedRecipe as SavedRecipeAggregate,
} from '@/features/pro-core/recipeContracts';
import { readRecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { useRecipeStore } from '@/stores/recipeStore';
import { savedToRecipeInput, type SavedRecipe } from './recipePayload';

const r = copy.recipes;

export type SavedRecipeOpenSource = Pick<
  SavedRecipe,
  'id' | 'name' | 'recipe_input' | 'product_composition'
>;

export type OpenSavedRecipeVersionResult =
  | { ok: true; to: '/pro/recipe' | '/home' }
  | { ok: false; message: string };

/**
 * THE one way a saved recipe version is opened into the workbench (Moje receptury,
 * and Produkcja → Partie → „Wróć do partii”). Extracted from `MyRecipesPage` with
 * its behaviour unchanged:
 *  - the aggregate is linked so the next save appends a NEW VERSION (not a copy);
 *  - a specific historical version that cannot be read is refused, never replaced
 *    by the latest (that would show different grams than the user selected);
 *  - HOME shows the reopened recipe as its recipe, never the empty intent screen.
 *
 * It loads the recipe store and returns where to go; the caller navigates.
 */
export async function openSavedRecipeVersion(
  row: SavedRecipeOpenSource,
  requestedVersionNumber: number | null,
  { persona }: { persona: ProCorePersona },
): Promise<OpenSavedRecipeVersionResult> {
  try {
    const input = savedToRecipeInput(row.recipe_input);
    // Link to the aggregate so the next save appends a NEW VERSION (not a copy). A legacy orphan
    // row (no aggregate/meta) links only its name → the next save creates a fresh aggregate.
    let aggregate: SavedRecipeAggregate | null = null;
    let openedVersion: RecipeVersion | null = null;
    let repoReachable = true;
    try {
      const repo = resolveRecipesRepository().repository;
      aggregate = repo ? await repo.getRecipe(row.id) : null;
      const wanted = requestedVersionNumber ?? aggregate?.latestVersionNumber ?? null;
      openedVersion =
        repo && aggregate && wanted !== null ? await repo.getVersion(row.id, wanted) : null;
    } catch {
      aggregate = null;
      openedVersion = null;
      repoReachable = false;
    }
    // A specific historical version was asked for and could not be read. Opening the LATEST
    // instead would silently show different grams than the user selected, so refuse and say so.
    const askedForHistory =
      requestedVersionNumber !== null &&
      aggregate !== null &&
      requestedVersionNumber !== aggregate.latestVersionNumber;
    if (askedForHistory && !openedVersion) {
      return { ok: false, message: r.versionSelector.openFailed(requestedVersionNumber) };
    }
    if (!repoReachable && requestedVersionNumber !== null && requestedVersionNumber > 1) {
      return { ok: false, message: r.versionSelector.historyUnavailable };
    }
    const openedInput = openedVersion?.recipeInput ?? input;
    useRecipeStore.getState().loadRecipeInput(
      openedInput,
      aggregate
        ? {
            savedId: row.id,
            savedName: row.name,
            versionNumber: openedVersion?.versionNumber ?? aggregate.latestVersionNumber,
            latestVersionNumber: aggregate.latestVersionNumber,
            versionId: openedVersion?.versionId ?? null,
            versionDate: openedVersion?.createdAt ?? aggregate.updatedAt,
            composition:
              openedVersion?.productComposition ??
              readRecipeCompositionMetadata(
                row.product_composition,
                openedInput.items.map((item) => item.id),
                openedInput.items
                  .filter((item) => item.lock_type === 'main')
                  .map((item) => item.id),
              ),
          }
        : {
            savedId: null,
            savedName: row.name,
            versionNumber: null,
            versionDate: null,
            composition: readRecipeCompositionMetadata(
              row.product_composition,
              openedInput.items.map((item) => item.id),
              openedInput.items.filter((item) => item.lock_type === 'main').map((item) => item.id),
            ),
          },
    );
    // HOME shows the reopened recipe as its recipe, never the empty intent screen.
    if (persona !== 'pro') presentLoadedRecipeInHome({});
    return { ok: true, to: persona === 'pro' ? '/pro/recipe' : '/home' };
  } catch {
    return { ok: false, message: r.versionSelector.openFailedGeneric };
  }
}
