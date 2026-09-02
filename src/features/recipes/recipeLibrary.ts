/** Recipes library model — the six destinations the approved strip names.
 *
 *  Kept out of the component file so the strip stays a pure component module
 *  (react-refresh) and so Community / Top 100 can import the model without
 *  importing the view. */
export type RecipeLibraryTab = 'mine' | 'shared' | 'pinguino' | 'inspiration';

/* GELLATTI V2.1 §5: one sentence of six destinations in sentence case —
   `Moje · Udostępnione mi · Gellatti · Inspiracje · Community · Top 100`. */
export const RECIPE_LIBRARY_TABS = [
  ['mine', 'Moje'],
  ['shared', 'Udostępnione mi'],
  ['pinguino', 'Gellatti'],
  ['inspiration', 'Inspiracje'],
] as const satisfies readonly (readonly [RecipeLibraryTab, string])[];

/** Community and TOP 100 are real ROUTES with public URLs, not panels. */
export const RECIPE_LIBRARY_LINKS = [
  ['/community', 'Community'],
  ['/top100', 'Top 100'],
] as const;

/** `/recipes?tab=pinguino` is the canonical Gellatti collection URL with no
 *  `tab` parameter, so the library link for it stays bare. */
export const recipeLibraryHref = (tab: RecipeLibraryTab): string =>
  tab === 'pinguino' ? '/recipes' : `/recipes?tab=${tab}`;
