/** Recipes library model — the destinations the approved strip names.
 *
 *  Kept out of the component file so the strip stays a pure component module
 *  (react-refresh) and so Community / Top 100 can import the model without
 *  importing the view. */
export type RecipeLibraryTab = 'pinguino' | 'mine' | 'shared';

/* OWNER 2026-09-13 (official Recipe Library): the main strip reads, in this
   exact order, `Gellatti · Moje · Udostępnione · Community`. Top 100 remains an
   existing route reached from Community, while the retired Inspiracje
   destination has no entry, panel or route any more. */
export const RECIPE_LIBRARY_TABS = [
  ['pinguino', 'Gellatti'],
  ['mine', 'Moje'],
  ['shared', 'Udostępnione'],
] as const satisfies readonly (readonly [RecipeLibraryTab, string])[];

/** Community is a real ROUTE with a public URL, not a library panel. */
export const RECIPE_LIBRARY_LINKS = [['/community', 'Community']] as const;

export const isRecipeLibraryTab = (value: string | null | undefined): value is RecipeLibraryTab =>
  RECIPE_LIBRARY_TABS.some(([id]) => id === value);

/** `/recipes?tab=pinguino` is the canonical Gellatti collection URL with no
 *  `tab` parameter, so the library link for it stays bare. */
export const recipeLibraryHref = (tab: RecipeLibraryTab): string =>
  tab === 'pinguino' ? '/recipes' : `/recipes?tab=${tab}`;
