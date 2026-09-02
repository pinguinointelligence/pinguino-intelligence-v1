/**
 * Product-profile mapping + entry enrichment — PURE and deterministic.
 *
 * The single home for the rules that turn a raw `FlavorSourceRecord` into an
 * enriched `FlavorCatalogueEntry`. The generated manifest stores ONLY verbatim
 * source + image audit; every derivation lives here, so there is exactly one
 * source of truth and nothing can silently drift inside the generated file.
 *
 * PROFILE MAPPING (from the workbook `Product Profile` string):
 *  - `Chocolate Gelato`        → internal chocolate_gelato, visible Gelato
 *  - `Standard Gelato`         → internal standard_gelato, visible Gelato
 *  - `Sorbet`                  → internal sorbet, visible Sorbet (a SUPPORTED variant)
 *  - `Vegan Gelato`            → internal vegan_gelato, visible Vegan
 *  - `Swirl`                   → not a profile: Ninja Swirl compatible (never forces a serving mode)
 *  - `Protein Gelato`          → internal protein_gelato, visible Protein, engine profile in preparation
 *  Combinations keep ALL variants (e.g. `Standard Gelato / Sorbet` supports both
 *  gelato and sorbet — never silently picks one). Chocolate is an INTERNAL
 *  profile only — it is NEVER a visible customer category.
 */
import type { CustomerProductType } from '@/features/customer-flow/types';
import type {
  CatalogueInternalProfile,
  FlavorCatalogueEntry,
  FlavorFormulaStatus,
  FlavorProfileMapping,
  FlavorSourceRecord,
} from './flavorCatalogueTypes';

/** Immutable catalogue metadata that is identical for every entry in one import. */
export interface FlavorCatalogueMeta {
  sourceWorkbook: string;
  sourceSheet: string;
  catalogueVersion: string;
}

const CHOCOLATE_TOKEN = 'Chocolate Gelato';
const STANDARD_TOKEN = 'Standard Gelato';
const SORBET_TOKEN = 'Sorbet';
const VEGAN_TOKEN = 'Vegan Gelato';
const SWIRL_TOKEN = 'Swirl';
const PROTEIN_TOKEN = 'Protein Gelato';

/** Which internal profiles have a SAFE locked starter template (→ `draftable`). */
const DRAFTABLE_INTERNAL_PROFILES: ReadonlySet<CatalogueInternalProfile> = new Set<CatalogueInternalProfile>([
  'standard_gelato',
  'chocolate_gelato',
]);

const VISIBLE_TYPE_FOR_INTERNAL: Readonly<Record<CatalogueInternalProfile, CustomerProductType>> = {
  standard_gelato: 'gelato',
  // chocolate is shown to the customer as Gelato — never "Chocolate".
  chocolate_gelato: 'gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan',
  protein_gelato: 'protein',
};

/** Split a `Product Profile` string into its trimmed, non-empty tokens. */
function profileTokens(productProfile: string): string[] {
  return productProfile
    .split('/')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Map a source `Product Profile` string to visible + internal profiles. Pure and
 * deterministic; preserves every variant in source order and never invents a
 * profile that is not present in the string.
 */
export function mapProductProfile(productProfile: string): FlavorProfileMapping {
  const tokens = profileTokens(productProfile);
  const internalProfiles: CatalogueInternalProfile[] = [];
  let ninjaSwirlCompatible = false;

  for (const token of tokens) {
    if (token === SWIRL_TOKEN) {
      ninjaSwirlCompatible = true;
      continue;
    }
    let profile: CatalogueInternalProfile | null = null;
    if (token === CHOCOLATE_TOKEN) profile = 'chocolate_gelato';
    else if (token === STANDARD_TOKEN) profile = 'standard_gelato';
    else if (token === SORBET_TOKEN) profile = 'sorbet';
    else if (token === VEGAN_TOKEN) profile = 'vegan_gelato';
    else if (token === PROTEIN_TOKEN) profile = 'protein_gelato';
    if (profile !== null && !internalProfiles.includes(profile)) {
      internalProfiles.push(profile);
    }
  }

  const primaryInternalProfile = internalProfiles[0];
  if (primaryInternalProfile === undefined) {
    // Unknown/unexpected profile string — fail loudly rather than guess.
    throw new Error(`Unrecognized Product Profile: "${productProfile}"`);
  }
  const supportedVisibleTypes: CustomerProductType[] = [];
  for (const profile of internalProfiles) {
    const visible = VISIBLE_TYPE_FOR_INTERNAL[profile];
    if (!supportedVisibleTypes.includes(visible)) supportedVisibleTypes.push(visible);
  }

  const engineSupport = internalProfiles.includes('protein_gelato') ? 'protein_unsupported' : 'supported';
  const compatTags = ninjaSwirlCompatible ? ['Ninja Swirl compatible'] : [];

  return {
    visibleProductType: VISIBLE_TYPE_FOR_INTERNAL[primaryInternalProfile],
    supportedVisibleTypes,
    internalProfiles,
    primaryInternalProfile,
    ninjaSwirlCompatible,
    compatTags,
    engineSupport,
  };
}

/**
 * Honest formula status for this import. `draftable` ONLY where the deterministic
 * starter-template builder (standard_gelato / chocolate_gelato) could safely start
 * the recipe; otherwise `metadata_only`. NEVER `calculated`/`verified` here.
 */
export function deriveFormulaStatus(mapping: FlavorProfileMapping): FlavorFormulaStatus {
  const hasDraftableProfile = mapping.internalProfiles.some((p) => DRAFTABLE_INTERNAL_PROFILES.has(p));
  return hasDraftableProfile ? 'draftable' : 'metadata_only';
}

const NAME_STOPWORDS: ReadonlySet<string> = new Set(['with', 'and', 'of', 'the', 'a', 'style']);

/** Known fruit families that can be the PRIMARY flavor of a `Fruit` category row. */
const FRUIT_KEYWORDS: readonly string[] = [
  'strawberry',
  'raspberry',
  'blueberry',
  'blackberry',
  'cherry',
  'mango',
  'lemon',
  'lime',
  'orange',
  'passion',
  'peach',
  'apricot',
  'banana',
  'coconut',
  'pineapple',
  'melon',
];

/** Lowercase alphabetic tokens from a free-text string, minus grammatical stopwords. */
function nameTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t));
}

/**
 * Primary flavor family. Chocolate/Vanilla come from the source category; a
 * `Fruit` row resolves to its specific fruit from the name, falling back to `fruit`.
 */
export function deriveMainFlavorTag(record: FlavorSourceRecord): string {
  const category = record.category.toLowerCase();
  if (category === 'chocolate') return 'chocolate';
  if (category === 'vanilla') return 'vanilla';
  const nameLower = record.flavorName.toLowerCase();
  for (const fruit of FRUIT_KEYWORDS) {
    if (nameLower.includes(fruit)) return fruit;
  }
  return category.length > 0 ? category : 'fruit';
}

/**
 * Deterministic, de-duplicated, sorted set of flavor descriptors used for
 * recommendation matching: the primary flavor family + name tokens + source tags.
 * Order does not affect matching; sorting keeps the derived value stable.
 */
export function deriveFlavorTags(record: FlavorSourceRecord, mainFlavorTag: string): string[] {
  const set = new Set<string>();
  set.add(mainFlavorTag);
  for (const token of nameTokens(record.flavorName)) set.add(token);
  for (const tag of record.tags) {
    const normalized = tag.trim().toLowerCase();
    if (normalized.length > 0) set.add(normalized);
  }
  return [...set].sort();
}

/** `cat-fl-000001` from `FL-000001` (stable, lower-cased). */
export function catalogueRecipeIdFor(flavorCode: string): string {
  return `cat-${flavorCode.toLowerCase()}`;
}

/** Public delivery path for a present image, else null. */
function imagePathFor(record: FlavorSourceRecord): string | null {
  return record.image.status === 'present' && record.image.file !== null
    ? `/recipes/${record.image.file}`
    : null;
}

/**
 * Enrich one immutable source record into a full catalogue entry. PURE — never
 * mutates the source, never performs IO. All customer-visible derivations happen
 * here so the generated manifest stays raw source + audit only.
 */
export function enrichFlavorRecord(
  record: FlavorSourceRecord,
  meta: FlavorCatalogueMeta,
): FlavorCatalogueEntry {
  const mapping = mapProductProfile(record.productProfile);
  const mainFlavorTag = deriveMainFlavorTag(record);
  const flavorTags = deriveFlavorTags(record, mainFlavorTag);
  const formulaStatus = deriveFormulaStatus(mapping);

  return {
    catalogueRecipeId: catalogueRecipeIdFor(record.id),
    flavorCode: record.id,
    popularityRank: record.popularityRank,
    flavorName: record.flavorName,
    polishName: null,
    mainIngredients: [...record.mainIngredients],
    category: record.category,
    popularityScore: record.popularityScore,
    sourceProductProfile: record.productProfile,
    season: record.season,
    tags: [...record.tags],
    worldRegion: record.worldRegion,
    imagePath: imagePathFor(record),
    imageAlt: record.flavorName,
    imageStatus: record.image.status,
    imageWidth: record.image.width,
    imageHeight: record.image.height,
    formulaStatus,
    sourceWorkbook: meta.sourceWorkbook,
    sourceSheet: meta.sourceSheet,
    sourceRow: record.sourceRow,
    catalogueVersion: meta.catalogueVersion,
    visibleProductType: mapping.visibleProductType,
    supportedVisibleTypes: mapping.supportedVisibleTypes,
    internalProfiles: mapping.internalProfiles,
    primaryInternalProfile: mapping.primaryInternalProfile,
    ninjaSwirlCompatible: mapping.ninjaSwirlCompatible,
    compatTags: mapping.compatTags,
    engineSupport: mapping.engineSupport,
    mainFlavorTag,
    flavorTags,
  };
}
