/**
 * Official Gellatti Recipe Library — the runtime authority over the immutable
 * workbook baseline plus explicit, versioned package overlays.
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
  OFFICIAL_RECIPE_LIBRARY_VERSION as OFFICIAL_BASELINE_LIBRARY_VERSION,
  OFFICIAL_RECIPE_SOURCE,
  OFFICIAL_RECIPE_SOURCE_SHA256 as OFFICIAL_BASELINE_SOURCE_SHA256,
  OFFICIAL_RECIPE_SOURCE_WORKBOOK,
} from './officialRecipeLibrary.generated';
import {
  GELLATTI_PACK_01_02_ADDITIONS,
  GELLATTI_PACK_01_02_REPLACEMENT_039,
} from './officialRecipePack0102';
import {
  GELLATTI_PACK_03_ADDITIONS,
  GELLATTI_PACK_03_REPLACEMENT_164,
} from './officialRecipePack03';
import type {
  OfficialCollectionId,
  OfficialRecipe,
  OfficialRecipeLine,
} from './officialRecipeTypes';

export * from './officialRecipeTypes';
export { OFFICIAL_RECIPE_SOURCE_WORKBOOK };

/** The generated workbook baseline remains separately addressable and unchanged. */
export const OFFICIAL_BASELINE_RECIPES: readonly OfficialRecipe[] =
  Object.freeze(OFFICIAL_RECIPE_SOURCE);
export const OFFICIAL_BASELINE_RECIPE_LIBRARY_VERSION = OFFICIAL_BASELINE_LIBRARY_VERSION;
export const OFFICIAL_BASELINE_RECIPE_SOURCE_SHA256 = OFFICIAL_BASELINE_SOURCE_SHA256;

/** Current runtime registry/provenance authority after packages 01 + 02 + 03. */
export const OFFICIAL_RECIPE_LIBRARY_VERSION = 'official-188-v4';
/** SHA-256 of the baseline and package SHA values, joined by LF in application order. */
export const OFFICIAL_RECIPE_SOURCE_SHA256 =
  'd5066c2bd94404b880866c11207c494bb3f6cfc561c219baa546f0f643e4efb1';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const currentRecipes = [
  ...OFFICIAL_RECIPE_SOURCE.filter((entry) => entry.number !== 77).map((entry) => {
    if (entry.number === 39) return GELLATTI_PACK_01_02_REPLACEMENT_039;
    if (entry.number === 164) return GELLATTI_PACK_03_REPLACEMENT_164;
    return entry;
  }),
  ...GELLATTI_PACK_01_02_ADDITIONS.filter((entry) => entry.number !== 180).map((entry) =>
    entry.number === 178 || entry.number === 181
      ? { ...entry, collection: 'lost_legendary' as const }
      : entry,
  ),
  ...GELLATTI_PACK_03_ADDITIONS,
];
if (
  currentRecipes.length !== 188 ||
  new Set(currentRecipes.map((entry) => entry.number)).size !== currentRecipes.length ||
  new Set(currentRecipes.map((entry) => entry.recipeId)).size !== currentRecipes.length
) {
  throw new Error('Invalid GELLATTI runtime registry: package identity collision.');
}

/** Every current official recipe, frozen. The generated 177-row baseline is untouched. */
export const OFFICIAL_RECIPES: readonly OfficialRecipe[] = deepFreeze(currentRecipes);

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
const OWNER_COLLECTION_TAILS: Partial<Readonly<Record<OfficialCollectionId, readonly number[]>>> = {
  cocktails_spirits: [179, 164, 189, 190],
  lost_legendary: [165, 178, 185, 181],
};
const COLLECTION_MEMBERSHIP_EXCLUSIONS: Partial<
  Readonly<Record<OfficialCollectionId, ReadonlySet<string>>>
> = {
  lost_legendary: new Set([
    'lost-gb-rum-raisin',
    'heritage-irish-stout-brown-bread',
    'heritage-cafayate-cabernet-sauvignon',
    'heritage-vin-santo-cantucci',
  ]),
};

export function isOfficialCollectionId(
  value: string | null | undefined,
): value is OfficialCollectionId {
  return typeof value === 'string' && COLLECTION_BY_ID.has(value as OfficialCollectionId);
}

export function officialCollectionById(id: OfficialCollectionId): OfficialCollection {
  return COLLECTION_BY_ID.get(id)!;
}

export function officialRecipesInCollection(id: OfficialCollectionId): readonly OfficialRecipe[] {
  const excludedRecipeIds = COLLECTION_MEMBERSHIP_EXCLUSIONS[id];
  const recipes = OFFICIAL_RECIPES.filter(
    (recipe) => recipe.collection === id && !excludedRecipeIds?.has(recipe.recipeId),
  );
  const ownerTail = OWNER_COLLECTION_TAILS[id];
  if (!ownerTail) return recipes;
  const tailNumbers = new Set<number>(ownerTail);
  const tail = ownerTail.map((number) => recipes.find((recipe) => recipe.number === number));
  if (tail.some((recipe) => !recipe)) {
    throw new Error(`Invalid owner collection tail for ${id}.`);
  }
  return [
    ...recipes.filter((recipe) => !tailNumbers.has(recipe.number)),
    ...(tail as OfficialRecipe[]),
  ];
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

/** A package card never emits a guessed image URL while its artwork is pending. */
export function officialRecipeHasImage(recipe: OfficialRecipe): boolean {
  return recipe.photoStatus !== 'pending';
}

export function officialRecipeVersion(recipe: OfficialRecipe): number {
  return recipe.recipeVersion ?? 1;
}

export function officialRecipeLineScope(line: OfficialRecipeLine): 'MAIN' | 'TOPPING' {
  return line.scope ?? 'MAIN';
}

export function officialRecipeBaseLines(recipe: OfficialRecipe): readonly OfficialRecipeLine[] {
  return recipe.lines.filter((line) => officialRecipeLineScope(line) === 'MAIN');
}

export function officialRecipeAddonLines(recipe: OfficialRecipe): readonly OfficialRecipeLine[] {
  return recipe.lines.filter((line) => officialRecipeLineScope(line) === 'TOPPING');
}

const lineTotal = (lines: readonly OfficialRecipeLine[]) =>
  Number(lines.reduce((total, line) => total + line.grams, 0).toFixed(6));

export function officialRecipeBaseTotal(recipe: OfficialRecipe): number {
  return lineTotal(officialRecipeBaseLines(recipe));
}

export function officialRecipeAddonTotal(recipe: OfficialRecipe): number {
  return lineTotal(officialRecipeAddonLines(recipe));
}

export function officialRecipeFinalTotal(recipe: OfficialRecipe): number {
  return officialRecipeBaseTotal(recipe) + officialRecipeAddonTotal(recipe);
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
