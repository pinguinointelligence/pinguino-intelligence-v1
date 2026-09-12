/**
 * Official Gellatti Recipe Library — the one runtime authority over the 177
 * imported source recipes (GELLATTI_RECEPTURY.xlsx, see the generated module).
 *
 * The registry is deep-frozen: the canonical 1000 g formula can be read but
 * never changed. Anything that becomes a working recipe starts from
 * `officialRecipeWorkingCopy`, a detached clone, so a user's edits, a country
 * product or a recalculation can never reach the source.
 *
 * Recipe → image is by source NUMBER only: recipe #NNN uses GEL-NNN.
 */
import type { VisibleProductType } from '@/features/studio/productType';
import {
  OFFICIAL_RECIPE_LIBRARY_VERSION,
  OFFICIAL_RECIPE_SOURCE,
  OFFICIAL_RECIPE_SOURCE_SHA256,
  OFFICIAL_RECIPE_SOURCE_WORKBOOK,
} from './officialRecipeLibrary.generated';
import type {
  OfficialCollectionId,
  OfficialRecipe,
  OfficialRecipeLine,
} from './officialRecipeTypes';

export * from './officialRecipeTypes';
export {
  OFFICIAL_RECIPE_LIBRARY_VERSION,
  OFFICIAL_RECIPE_SOURCE_SHA256,
  OFFICIAL_RECIPE_SOURCE_WORKBOOK,
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Every official recipe in source order (#001 → #177). Frozen. */
export const OFFICIAL_RECIPES: readonly OfficialRecipe[] = deepFreeze(OFFICIAL_RECIPE_SOURCE);

export interface OfficialCollection {
  readonly id: OfficialCollectionId;
  /** The source collection name, shown as-is. */
  readonly name: string;
  readonly firstNumber: number;
  readonly lastNumber: number;
  /** Owner collection hero, 1672 × 941 source. */
  readonly heroImage: { readonly small: string; readonly large: string };
}

const hero = (id: OfficialCollectionId) => ({
  small: `/recipes/official/collections/${id}-960.webp`,
  large: `/recipes/official/collections/${id}-1672.webp`,
});

/** The five official collections, in the owner's order. */
export const OFFICIAL_COLLECTIONS: readonly OfficialCollection[] = deepFreeze([
  { id: 'classics', name: 'Classics', firstNumber: 1, lastNumber: 77, heroImage: hero('classics') },
  { id: 'icons', name: 'Icons', firstNumber: 78, lastNumber: 102, heroImage: hero('icons') },
  {
    id: 'cocktails_spirits',
    name: 'Cocktails & Spirits',
    firstNumber: 103,
    lastNumber: 150,
    heroImage: hero('cocktails_spirits'),
  },
  {
    id: 'lost_legendary',
    name: 'Lost & Legendary',
    firstNumber: 151,
    lastNumber: 165,
    heroImage: hero('lost_legendary'),
  },
  {
    id: 'technical_bases',
    name: 'Technical Bases',
    firstNumber: 166,
    lastNumber: 177,
    heroImage: hero('technical_bases'),
  },
]);

const RECIPE_BY_ID = new Map(OFFICIAL_RECIPES.map((recipe) => [recipe.recipeId, recipe]));
const COLLECTION_BY_ID = new Map(OFFICIAL_COLLECTIONS.map((entry) => [entry.id, entry]));

export function isOfficialCollectionId(
  value: string | null | undefined,
): value is OfficialCollectionId {
  return typeof value === 'string' && COLLECTION_BY_ID.has(value as OfficialCollectionId);
}

export function officialCollectionById(id: OfficialCollectionId): OfficialCollection {
  return COLLECTION_BY_ID.get(id)!;
}

export function officialRecipesInCollection(id: OfficialCollectionId): readonly OfficialRecipe[] {
  return OFFICIAL_RECIPES.filter((recipe) => recipe.collection === id);
}

/** The frozen canonical record, for reading and display. */
export function officialRecipeById(recipeId: string | null | undefined): OfficialRecipe | null {
  return recipeId ? (RECIPE_BY_ID.get(recipeId) ?? null) : null;
}

/** A detached, mutable copy for building a working recipe. The registry is untouched. */
export function officialRecipeWorkingCopy(recipeId: string): OfficialRecipe | null {
  const recipe = officialRecipeById(recipeId);
  return recipe ? structuredClone(recipe) : null;
}

export const OFFICIAL_RECIPE_IMAGE_WIDTHS = { card: 480, detail: 960 } as const;

/** Image path by source number: recipe #NNN → GEL-NNN (never by name). */
export function officialRecipeImage(recipe: Pick<OfficialRecipe, 'number'>): {
  card: string;
  detail: string;
} {
  const photoId = `GEL-${String(recipe.number).padStart(3, '0')}`;
  return {
    card: `/recipes/official/${photoId}-${OFFICIAL_RECIPE_IMAGE_WIDTHS.card}.webp`,
    detail: `/recipes/official/${photoId}-${OFFICIAL_RECIPE_IMAGE_WIDTHS.detail}.webp`,
  };
}

/** Lines that have no confirmed canonical identity (source BRAK, not a Main slot). */
export function officialUnresolvedLines(recipe: OfficialRecipe): readonly OfficialRecipeLine[] {
  return recipe.lines.filter((line) => line.identity.kind === 'unresolved');
}

export type OfficialRecipeUseState =
  | { readonly kind: 'ready' }
  /** A BRAK line: the recipe stays browsable, but it cannot become a working recipe. */
  | { readonly kind: 'unresolved_identity'; readonly lines: readonly OfficialRecipeLine[] }
  /** SCAFFOLD_RECALC_BY_MAIN: the dynamic Main must be chosen before any calculation. */
  | { readonly kind: 'dynamic_main_required'; readonly line: OfficialRecipeLine };

/** Whether a recipe can be turned into a working recipe now. Never guesses a line. */
export function officialRecipeUseState(recipe: OfficialRecipe): OfficialRecipeUseState {
  const unresolved = officialUnresolvedLines(recipe);
  if (unresolved.length > 0) return { kind: 'unresolved_identity', lines: unresolved };
  const dynamicMain = recipe.lines.find((line) => line.identity.kind === 'dynamic_main');
  if (dynamicMain) return { kind: 'dynamic_main_required', line: dynamicMain };
  return { kind: 'ready' };
}

export type OfficialServingModeId = 'temp_minus_11' | 'temp_minus_12' | 'temp_minus_13';

export interface OfficialRecipeWorkingProfile {
  /** Null only for `Heritage Gelato / Sorbet`: the existing Gelato derivation
   * decides from the real composition (fruit without dairy is a Sorbet). */
  readonly visibleProductType: VisibleProductType | null;
  /** Only Technical Bases carry a source temperature; others use the user's mode. */
  readonly servingModeId: OfficialServingModeId | null;
}

const TECHNICAL_BASE_ID = /^tech-(gelato|sorbet|vegan|protein)-(11|12|13)(?:-v\d+)?$/;

/** The working-recipe profile a source record states. Pure; no guessing from names. */
export function officialRecipeWorkingProfile(recipe: OfficialRecipe): OfficialRecipeWorkingProfile {
  if (recipe.productType === 'Technical Base') {
    const match = TECHNICAL_BASE_ID.exec(recipe.recipeId);
    if (!match) throw new Error(`Technical Base ${recipe.recipeId} has no profile identity.`);
    return {
      visibleProductType: match[1] as VisibleProductType,
      servingModeId: `temp_minus_${match[2]}` as OfficialServingModeId,
    };
  }
  switch (recipe.productType) {
    case 'Standard Gelato':
    case 'Chocolate Gelato':
    case 'Spirit Gelato':
      return { visibleProductType: 'gelato', servingModeId: null };
    case 'Sorbet':
    case 'Cocktail Sorbet':
      return { visibleProductType: 'sorbet', servingModeId: null };
    case 'Vegan Gelato':
      return { visibleProductType: 'vegan', servingModeId: null };
    case 'Heritage Gelato / Sorbet':
      return { visibleProductType: null, servingModeId: null };
  }
}

/** Stable working-recipe line id for an official line. */
export const officialRecipeLineId = (
  recipe: Pick<OfficialRecipe, 'recipeId'>,
  line: OfficialRecipeLine,
) => `${recipe.recipeId}-line-${line.line}`;

/** PRO entry for a working copy. The official source is never opened for editing. */
export function officialRecipeUseHref(recipeId: string, returnTo = '/recipes'): string {
  const params = new URLSearchParams({
    source: 'official_recipe',
    officialRecipe: recipeId,
    returnTo,
  });
  return `/pro/recipe?${params.toString()}`;
}

/** The same one-shot handoff for HOME: the HOME creator opens the working copy. */
export function officialRecipeHomeHref(recipeId: string): string {
  const params = new URLSearchParams({ source: 'official_recipe', officialRecipe: recipeId });
  return `/home?${params.toString()}`;
}

/** Library deep link for a collection or a recipe inside the Gellatti tab. */
export function officialLibraryHref(
  target: { collection: OfficialCollectionId } | { recipeId: string } | null = null,
): string {
  if (target === null) return '/recipes';
  const params = new URLSearchParams(
    'collection' in target ? { collection: target.collection } : { recipe: target.recipeId },
  );
  return `/recipes?${params.toString()}`;
}
