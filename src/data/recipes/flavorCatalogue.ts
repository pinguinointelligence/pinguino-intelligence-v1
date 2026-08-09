/**
 * Complete FLAVOR INSPIRATION CATALOGUE — runtime domain (pure, browser-safe).
 *
 * Enriches the GENERATED source manifest into the 100 customer-facing catalogue
 * entries and bridges them into the EXISTING ready-recipe matching domain
 * (`@/features/customer-flow` → `CatalogueRecipeCard` / `matchReadyRecipes`) so
 * all 2500 records feed the same matcher the shell already uses — without any XLSX
 * parser reaching the browser (only the generated manifest is imported here).
 *
 * HONESTY: these are REAL owner data but they remain flavor INSPIRATIONS. They
 * are NEVER "Gotowa receptura", never PI Verified, never Engine-calculated, never
 * an exact/optimized/machine-tested recipe. Customer wording stays honest.
 */
import type { ProductProfile } from '@/spine';
import type { CatalogueRecipeCard } from '@/features/customer-flow/readyRecipeMatching';
import type { CustomerProductType } from '@/features/customer-flow/types';
import {
  CATALOGUE_VERSION,
  FLAVOR_CATALOGUE_SOURCE,
  SOURCE_SHEET,
  SOURCE_WORKBOOK,
} from './flavorCatalogue.generated';
import type {
  CatalogueInternalProfile,
  FlavorCatalogueEntry,
} from './flavorCatalogueTypes';
import { enrichFlavorRecord, type FlavorCatalogueMeta } from './flavorProfileMapping';

const META: FlavorCatalogueMeta = {
  sourceWorkbook: SOURCE_WORKBOOK,
  sourceSheet: SOURCE_SHEET,
  catalogueVersion: CATALOGUE_VERSION,
};

/** All 2500 enriched catalogue entries, deterministically ordered by popularity rank. */
export const FLAVOR_CATALOGUE: readonly FlavorCatalogueEntry[] = FLAVOR_CATALOGUE_SOURCE.map((record) =>
  enrichFlavorRecord(record, META),
);

/* ------------------------------------------------------------------------ *
 * Selectors                                                                 *
 * ------------------------------------------------------------------------ */
export function getFlavorEntryByCode(flavorCode: string): FlavorCatalogueEntry | undefined {
  return FLAVOR_CATALOGUE.find((e) => e.flavorCode === flavorCode);
}

export function flavorEntriesWithImage(): FlavorCatalogueEntry[] {
  return FLAVOR_CATALOGUE.filter((e) => e.imageStatus === 'present');
}

export function flavorEntriesMissingImage(): FlavorCatalogueEntry[] {
  return FLAVOR_CATALOGUE.filter((e) => e.imageStatus === 'missing');
}

/* ------------------------------------------------------------------------ *
 * Honest customer wording (never "Gotowa receptura")                        *
 * ------------------------------------------------------------------------ */
export const FLAVOR_INSPIRATION_LABEL = 'Inspiracja smakowa';
export const FLAVOR_USE_AS_STARTING_POINT_LABEL = 'Użyj jako punkt wyjścia';
export const FLAVOR_CREATE_IN_PINGUINO_LABEL = 'Utwórz recepturę w PINGÜINO';
export const FLAVOR_PROTEIN_ENGINE_IN_PREPARATION_LABEL = 'Profil silnika w przygotowaniu';

export interface FlavorEntryStatusLabels {
  /** Always an inspiration — never a ready recipe. */
  kind: string;
  /** The honest primary call to action. */
  cta: string;
  /** Protein profile disclosure, or null. */
  engineNote: string | null;
}

/** Deterministic honest status wording for a catalogue entry. */
export function flavorEntryStatusLabels(entry: FlavorCatalogueEntry): FlavorEntryStatusLabels {
  const isProtein = entry.engineSupport === 'protein_unsupported';
  return {
    kind: FLAVOR_INSPIRATION_LABEL,
    cta: isProtein ? FLAVOR_PROTEIN_ENGINE_IN_PREPARATION_LABEL : FLAVOR_USE_AS_STARTING_POINT_LABEL,
    engineNote: isProtein ? FLAVOR_PROTEIN_ENGINE_IN_PREPARATION_LABEL : null,
  };
}

/** Honest short description for a catalogue card (never claims a real recipe). */
export function flavorEntryDescription(entry: FlavorCatalogueEntry): string {
  return `${FLAVOR_INSPIRATION_LABEL} — ${entry.flavorName}`;
}

/* ------------------------------------------------------------------------ *
 * Bridge into the EXISTING ready-recipe matcher (CatalogueRecipeCard)        *
 * ------------------------------------------------------------------------ */

/** Catalogue publication profiles — Protein inspirations remain gated by their entry status. */
const SPINE_PROFILES: ReadonlySet<CatalogueInternalProfile> = new Set<CatalogueInternalProfile>([
  'standard_gelato',
  'chocolate_gelato',
  'sorbet',
  'vegan_gelato',
]);

const VISIBLE_FOR_SPINE_PROFILE: Readonly<Record<ProductProfile, CustomerProductType>> = {
  standard_gelato: 'gelato',
  chocolate_gelato: 'gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan',
  protein_gelato: 'protein',
};

/**
 * Bridge one enriched entry into zero or more `CatalogueRecipeCard`s — one per
 * SUPPORTED spine profile variant (Standard/Sorbet → a gelato card AND a sorbet
 * card, never silently one). Protein entries yield NO card (the Protein Engine is
 * unsupported), so the existing matcher never offers a fake Protein recipe.
 */
export function flavorEntryToCatalogueCards(entry: FlavorCatalogueEntry): CatalogueRecipeCard[] {
  const cards: CatalogueRecipeCard[] = [];
  for (const profile of entry.internalProfiles) {
    if (!SPINE_PROFILES.has(profile)) continue;
    const spineProfile = profile as ProductProfile;
    const deviceCompatibility = entry.ninjaSwirlCompatible
      ? ['professional-machine', 'ninja-creami']
      : ['professional-machine'];
    cards.push({
      id: `${entry.catalogueRecipeId}__${spineProfile}`,
      version: entry.catalogueVersion,
      title: entry.flavorName,
      description: flavorEntryDescription(entry),
      flavorCode: entry.mainFlavorTag,
      secondaryFlavorCode: null,
      // Preserve the exact source id on the bridged card for downstream provenance.
      imageCode: entry.flavorCode,
      imagePath: entry.imagePath ?? '',
      productType: VISIBLE_FOR_SPINE_PROFILE[spineProfile],
      internalProfile: spineProfile,
      flavorTags: entry.flavorTags,
      dietaryTags: [],
      deviceCompatibility,
      servingProfile: 'catalogue-unspecified',
      availability: 'available',
      gramVisibilityEntitlement: 'exact_grams',
    });
  }
  return cards;
}

/** All inspirations flattened into ready-recipe cards for the existing matcher. */
export function flavorCatalogueToCards(): CatalogueRecipeCard[] {
  return FLAVOR_CATALOGUE.flatMap((entry) => flavorEntryToCatalogueCards(entry));
}
