/**
 * Official Gellatti Recipe Library — source record types.
 *
 * One record per recipe of the owner workbook GELLATTI_RECEPTURY.xlsx
 * (sheets 01_RECEPTURY + 03_SKLAD_RECEPTUR). A record is the IMMUTABLE
 * canonical formula:
 *  - recipe identity is the source `recipeId` (e.g. `classic-dark-chocolate`)
 *    together with the source number 1…177 and its Foto ID GEL-001…GEL-177;
 *  - ingredient identity is the canonical Mapper PI (`PI-ING-######`), never a
 *    name. The workbook's historical "Exact Mapper name" is deliberately not
 *    carried: the current name always comes from the Mapper runtime by PI;
 *  - a source `BRAK` line stays unresolved (label and grams kept, no PI), and
 *    the Sorbet scaffold Main is a dynamic template slot, not a missing product.
 *
 * Library visibility is separate from Engine, Processing and Production
 * readiness. Nothing in these records claims any of them.
 */

export const OFFICIAL_COLLECTION_IDS = [
  'classics',
  'icons',
  'cocktails_spirits',
  'lost_legendary',
  'technical_bases',
] as const;
export type OfficialCollectionId = (typeof OFFICIAL_COLLECTION_IDS)[number];

/** Verbatim `Status źródłowy` values. The source state survives the import. */
export const OFFICIAL_RECIPE_SOURCE_STATUSES = [
  'NEW_TO_ENGINE',
  'ENGINE_BASE_VALID_BLOCKED',
  'CORRECTION_TO_ENGINE',
  'VERIFIED_EXISTING',
  'SCAFFOLD_RECALC_BY_MAIN',
] as const;
export type OfficialRecipeSourceStatus = (typeof OFFICIAL_RECIPE_SOURCE_STATUSES)[number];

/** Verbatim `Etap` values. A process stage is not a role: LATE ADD is not TOPPING. */
export const OFFICIAL_RECIPE_STAGES = [
  'MIX',
  'LATE ADD',
  'SWIRL',
  'CHOCOLATE THIRD',
  'VANILLA THIRD',
  'STRAWBERRY THIRD',
] as const;
export type OfficialRecipeStage = (typeof OFFICIAL_RECIPE_STAGES)[number];

/** Verbatim `Typ produktu` values. */
export const OFFICIAL_PRODUCT_TYPES = [
  'Standard Gelato',
  'Chocolate Gelato',
  'Sorbet',
  'Vegan Gelato',
  'Cocktail Sorbet',
  'Spirit Gelato',
  'Heritage Gelato / Sorbet',
  'Technical Base',
] as const;
export type OfficialProductType = (typeof OFFICIAL_PRODUCT_TYPES)[number];

export type OfficialRecipeLineIdentity =
  /** `ID status = OK`: the canonical Mapper PI is the whole identity. */
  | { readonly kind: 'mapped'; readonly mapperIngredientId: string }
  /** `ID status = BRAK`: no confirmed canonical ingredient/form exists yet. */
  | { readonly kind: 'unresolved'; readonly sourceIdStatus: 'BRAK' }
  /** `SCAFFOLD_RECALC_BY_MAIN` template slot: the user's chosen Main fruit. */
  | { readonly kind: 'dynamic_main'; readonly sourceIdStatus: 'BRAK' };

export interface OfficialRecipeLine {
  /** 1-based order inside the recipe (source `Linia`). */
  readonly line: number;
  /** Source row number in 03_SKLAD_RECEPTUR (`Nr wiersza`, 1…1510). */
  readonly sourceRow: number;
  /** Source ingredient label (`Składnik`), shown to the customer. */
  readonly label: string;
  readonly stage: OfficialRecipeStage;
  /** Grams in the 1000 g source formula (`g / 1000g`). */
  readonly grams: number;
  readonly identity: OfficialRecipeLineIdentity;
  /** `Audyt rynku?`: `NIE — SUROWIEC LOKALNY` marks a local raw material. */
  readonly marketAudit: 'required' | 'local_raw_material';
  /** Line-level `Ostrzeżenie procesowe`, verbatim. */
  readonly processWarning: string | null;
  /** The source says the public display stays generic for this line: the
   * customer sees the source label, never the exact Mapper product name. */
  readonly publicLabelOnly: boolean;
  /** Line-level `Uwagi linii`, verbatim. */
  readonly note: string | null;
}

export interface OfficialRecipe {
  /** Stable source identity (`Recipe ID`). */
  readonly recipeId: string;
  /** Source number 1…177 (`Nr`); the image number is this number. */
  readonly number: number;
  /** `Foto ID`, GEL-001…GEL-177. */
  readonly photoId: string;
  readonly name: string;
  readonly collection: OfficialCollectionId;
  readonly subcategory: string;
  /** `Pochodzenie`; the source placeholder `—` becomes null. */
  readonly origin: string | null;
  /** `Kontynent`; the source placeholder `—` becomes null. */
  readonly continent: string | null;
  readonly productType: OfficialProductType;
  readonly sourceStatus: OfficialRecipeSourceStatus;
  /** `Suma g` — the canonical formula total (1000 g for every recipe). */
  readonly sourceTotalGrams: number;
  /** `Odgazowanie = TAK`. */
  readonly degassingRequired: boolean;
  /** `Komunikat procesowy`, verbatim. Not a production instruction. */
  readonly processNotice: string | null;
  /** Source row in 01_RECEPTURY (1-based sheet row). */
  readonly sourceRow: number;
  readonly lines: readonly OfficialRecipeLine[];
}
