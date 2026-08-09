/**
 * Complete FLAVOR INSPIRATION CATALOGUE — shared pure types.
 *
 * The workbook `PINGUINO_FLAVOR_INSPIRATION_2500.xlsx` (sheet `TOP_2500`) holds
 * flavor INSPIRATION metadata — NOT recipes. There are no ingredient product ids,
 * no grams, no procedure, no verified doses and no Engine-ready RecipeInput. So
 * every catalogue entry is an inspiration, never a "ready recipe".
 *
 * TWO SHAPES:
 *  - `FlavorSourceRecord` — the exact, immutable source row + a deterministic
 *    image audit. This is what the GENERATED manifest stores (verbatim source,
 *    never a derived business value).
 *  - `FlavorCatalogueEntry` — the enriched runtime entry. Derivations (profile
 *    mapping, flavor tags, formula/image status, image path) are computed PURELY
 *    in TypeScript from the source record, so the mapping rules have exactly one
 *    home and can never silently drift inside the generated file.
 *
 * HONESTY: `formulaStatus` is only ever `metadata_only` or `draftable` in this
 * import. `calculated` / `verified` are reserved for entries backed by a complete
 * real RecipeInput + a canonical Engine calculation — which this import does NOT
 * produce. Never label a metadata-only/draftable entry "Gotowa receptura".
 */
import type { ProductProfile } from '@/spine';
import type { CustomerProductType } from '@/features/customer-flow/types';

/**
 * Internal engine profile a catalogue entry maps to. Extends the four locked
 * spine profiles with `protein_gelato` — a CATALOGUE-ONLY marker for the Protein
 * Engine, which is not a supported spine profile (its cards are shown as honest
 * "Engine profile in preparation", never faked as a Standard Gelato recipe).
 */
export type CatalogueInternalProfile = ProductProfile | 'protein_gelato';

/** Honest formula lifecycle — never `calculated`/`verified` in this metadata import. */
export type FlavorFormulaStatus = 'metadata_only' | 'draftable' | 'calculated' | 'verified';

/** Whether a matching source photo exists for the entry's `FL-xxxxxx` id. */
export type FlavorImageStatus = 'present' | 'missing';

/** Engine support for the entry's internal profile(s). */
export type FlavorEngineSupport = 'supported' | 'protein_unsupported';

/**
 * Deterministic per-image audit recorded at build time. `status: 'missing'` when
 * no `FL-xxxxxx`-prefixed photo exists — the fields are null, never invented and
 * never borrowed from another flavor's photo.
 */
export interface FlavorImageAuditRecord {
  status: FlavorImageStatus;
  /** Exact source file name (e.g. `FL-000001_chocolate_fudge_with_brown_sugar.webp`). */
  file: string | null;
  /** File extension incl. dot (e.g. `.webp`). */
  ext: string | null;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  bytes: number | null;
  /** SHA-256 of the image bytes — used to detect duplicate photos. */
  sha256: string | null;
}

/**
 * The GENERATED, immutable source record for one flavor. Mirrors the workbook
 * columns verbatim (English source names are canonical and never overwritten)
 * plus the image audit. Contains NO derived business value.
 */
export interface FlavorSourceRecord {
  /** Exact source id, e.g. `FL-000001`. */
  id: string;
  /** Source `Popularity Rank` (1..100 for this import). */
  popularityRank: number;
  /** Exact source `Flavor Name` (English, canonical). */
  flavorName: string;
  /** Parsed from `Main Ingredients` — inspiration only, NEVER doses or product ids. */
  mainIngredients: string[];
  /** Exact source `Category` (e.g. `Chocolate` | `Vanilla` | `Fruit`). Internal metadata. */
  category: string;
  /** Exact source `Popularity Score`. */
  popularityScore: number;
  /** Exact source `Product Profile` string (e.g. `Standard Gelato / Sorbet / Swirl`). */
  productProfile: string;
  /** Exact source `Season`. */
  season: string;
  /** Parsed from source `Tags`. */
  tags: string[];
  /** Exact source `World Region`. */
  worldRegion: string;
  /** 1-based row number in the sheet including the header row (data starts at row 2). */
  sourceRow: number;
  image: FlavorImageAuditRecord;
}

/** Result of mapping a source `Product Profile` string to visible + internal profiles. */
export interface FlavorProfileMapping {
  /** Primary visible customer product type (never `chocolate`). */
  visibleProductType: CustomerProductType;
  /** ALL visible product types this entry supports (Standard/Sorbet → gelato + sorbet). */
  supportedVisibleTypes: CustomerProductType[];
  /** Internal engine profiles this entry maps to (variants preserved, never silently dropped). */
  internalProfiles: CatalogueInternalProfile[];
  /** Deterministic primary internal profile (first source token). */
  primaryInternalProfile: CatalogueInternalProfile;
  /** `Swirl` in the source profile → Ninja Swirl compatible (never auto-forces a serving mode). */
  ninjaSwirlCompatible: boolean;
  /** Compatibility tags (e.g. `Ninja Swirl compatible`). */
  compatTags: string[];
  engineSupport: FlavorEngineSupport;
}

/**
 * The enriched runtime catalogue entry (one per source row). Source fields are
 * preserved verbatim; the remaining fields are PURE derivations of the source.
 */
export interface FlavorCatalogueEntry {
  /** Stable catalogue id, e.g. `cat-fl-000001`. */
  catalogueRecipeId: string;
  /** Exact source flavor id, e.g. `FL-000001` (the `FL-xxxxxx` code). */
  flavorCode: string;
  popularityRank: number;
  /** Canonical English source name — never overwritten. */
  flavorName: string;
  /** Reserved slot for a future Polish translation layer. Never auto-invented → always null here. */
  polishName: string | null;
  mainIngredients: string[];
  /** Source category — INTERNAL metadata, never surfaced as a visible customer product type. */
  category: string;
  popularityScore: number;
  sourceProductProfile: string;
  season: string;
  tags: string[];
  worldRegion: string;
  /** Public delivery path (`/recipes/<file>`) or null when the photo is missing. */
  imagePath: string | null;
  imageAlt: string;
  imageStatus: FlavorImageStatus;
  imageWidth: number | null;
  imageHeight: number | null;
  formulaStatus: FlavorFormulaStatus;
  sourceWorkbook: string;
  sourceSheet: string;
  sourceRow: number;
  catalogueVersion: string;
  // --- derived profile mapping ---
  visibleProductType: CustomerProductType;
  supportedVisibleTypes: readonly CustomerProductType[];
  internalProfiles: readonly CatalogueInternalProfile[];
  primaryInternalProfile: CatalogueInternalProfile;
  ninjaSwirlCompatible: boolean;
  compatTags: readonly string[];
  engineSupport: FlavorEngineSupport;
  // --- derived matching helpers ---
  /** Primary flavor family (`chocolate` | `vanilla` | `strawberry` | ...). */
  mainFlavorTag: string;
  /** Normalized flavor descriptors used for deterministic recommendation matching. */
  flavorTags: readonly string[];
}
