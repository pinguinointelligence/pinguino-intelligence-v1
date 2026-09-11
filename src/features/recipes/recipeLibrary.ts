/** Recipes library model — the destinations the approved strip names.
 *
 *  Kept out of the component file so the strip stays a pure component module
 *  (react-refresh) and so Community / Top 100 can import the model without
 *  importing the view. */
export type RecipeLibraryTab = 'pinguino' | 'mine' | 'shared';

/* OWNER 2026-09-11 (official Recipe Library): the strip reads, in this exact
   order, `Gellatti · Moje · Udostępnione · Community · Top 100`. Gellatti is the
   official library, „Udostępnione mi" became „Udostępnione", and the retired
   Inspiracje destination has no entry, panel or route any more. */
export const RECIPE_LIBRARY_TABS = [
  ['pinguino', 'Gellatti'],
  ['mine', 'Moje'],
  ['shared', 'Udostępnione'],
] as const satisfies readonly (readonly [RecipeLibraryTab, string])[];

/** Community and TOP 100 are real ROUTES with public URLs, not panels. */
export const RECIPE_LIBRARY_LINKS = [
  ['/community', 'Community'],
  ['/top100', 'Top 100'],
] as const;

export const isRecipeLibraryTab = (value: string | null | undefined): value is RecipeLibraryTab =>
  RECIPE_LIBRARY_TABS.some(([id]) => id === value);

/** `/recipes?tab=pinguino` is the canonical Gellatti collection URL with no
 *  `tab` parameter, so the library link for it stays bare. */
export const recipeLibraryHref = (tab: RecipeLibraryTab): string =>
  tab === 'pinguino' ? '/recipes' : `/recipes?tab=${tab}`;
