/**
 * HOME shows a recipe that was loaded elsewhere — an official Gellatti recipe, a Community
 * recipe or one of the customer's own from „Moje receptury" — as ITS recipe: the idea is
 * closed, the profile is the recipe's own and the recipe stage is open.
 *
 * Nothing is generated over it: HOME's generate step only runs while no recipe is ready, so
 * marking it ready is exactly what keeps the loaded grams intact.
 */
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeDraftStore } from './homeDraftStore';
import { intentProfileFor } from './homeProfileMapping';

export function presentLoadedRecipeInHome(source: {
  /** A short human label of the source, for the attribution line. */
  readonly label?: string | null;
  readonly officialRecipeId?: string | null;
  readonly publicationId?: string | null;
  /** Keep the customer's typed idea (a match chosen in HOME); otherwise start a fresh draft. */
  readonly keepIdea?: boolean;
}): void {
  const home = useHomeDraftStore.getState();
  if (!source.keepIdea) home.startNew();
  const visible = useRecipeStore.getState().visibleProductType;
  if (visible) home.setProfile(intentProfileFor(visible));
  home.submitIntent();
  home.setDerivation({
    officialRecipeId: source.officialRecipeId ?? null,
    publicationId: source.publicationId ?? null,
    label: source.label ?? null,
  });
  home.markRecipeReady(true);
}
