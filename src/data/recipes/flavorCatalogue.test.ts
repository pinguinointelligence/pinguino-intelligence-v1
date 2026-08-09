/**
 * Complete 2500-row catalogue invariants — validated against the committed generated
 * manifest (no source workbook / images required at test time).
 */
import { describe, expect, it } from 'vitest';
import {
  FLAVOR_CATALOGUE,
  flavorCatalogueToCards,
  flavorEntriesMissingImage,
  flavorEntriesWithImage,
  flavorEntryStatusLabels,
  flavorEntryToCatalogueCards,
  getFlavorEntryByCode,
} from './flavorCatalogue';
import {
  CATALOGUE_VERSION,
  FLAVOR_CATALOGUE_SOURCE,
  SOURCE_SHA256,
  SOURCE_SHEET,
  SOURCE_WORKBOOK,
  SPREADSHEET_ROW_COUNT,
} from './flavorCatalogue.generated';

describe('source manifest metadata', () => {
  it('records the source workbook, sheet, checksum and spreadsheet size', () => {
    expect(SOURCE_WORKBOOK).toBe('PINGUINO_FLAVOR_INSPIRATION_2500.xlsx');
    expect(SOURCE_SHEET).toBe('TOP_2500');
    expect(SOURCE_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(SPREADSHEET_ROW_COUNT).toBe(2500);
    expect(CATALOGUE_VERSION).toBe('inspiration-2500-v1');
  });
});

describe('complete selection + no renumbering', () => {
  it('has exactly 2500 entries', () => {
    expect(FLAVOR_CATALOGUE).toHaveLength(2500);
    expect(FLAVOR_CATALOGUE_SOURCE).toHaveLength(2500);
  });

  it('selects exactly FL-000001..FL-002500 with matching ranks 1..2500 (no renumber)', () => {
    FLAVOR_CATALOGUE.forEach((entry, i) => {
      const expectedId = `FL-${String(i + 1).padStart(6, '0')}`;
      expect(entry.flavorCode).toBe(expectedId);
      expect(entry.popularityRank).toBe(i + 1);
      expect(entry.catalogueRecipeId).toBe(`cat-fl-${String(i + 1).padStart(6, '0')}`);
    });
  });

  it('first id is FL-000001 and last id is FL-002500', () => {
    expect(FLAVOR_CATALOGUE[0]?.flavorCode).toBe('FL-000001');
    expect(FLAVOR_CATALOGUE[2499]?.flavorCode).toBe('FL-002500');
  });

  it('is deterministically ordered by popularity rank ascending', () => {
    const ranks = FLAVOR_CATALOGUE.map((e) => e.popularityRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('has no duplicate ids', () => {
    const ids = FLAVOR_CATALOGUE.map((e) => e.flavorCode);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('exact source-column preservation', () => {
  it('preserves FL-000001 verbatim (canonical English name never overwritten)', () => {
    const e = getFlavorEntryByCode('FL-000001');
    expect(e?.flavorName).toBe('Chocolate Fudge with Brown Sugar');
    expect(e?.category).toBe('Chocolate');
    expect(e?.popularityScore).toBe(100);
    expect(e?.sourceProductProfile).toBe('Chocolate Gelato');
    expect(e?.season).toBe('All Year');
    expect(e?.worldRegion).toBe('Global');
    expect(e?.mainIngredients).toEqual(['cocoa', 'dark chocolate', 'brown sugar']);
    expect(e?.tags).toEqual(['classic', 'rich', 'brown sugar', 'caramel']);
    expect(e?.sourceRow).toBe(2);
  });

  it('preserves FL-000100 verbatim', () => {
    const e = getFlavorEntryByCode('FL-000100');
    expect(e?.flavorName).toBe('Chocolate Fudge with Yogurt Tang');
    expect(e?.popularityScore).toBe(98);
    expect(e?.sourceRow).toBe(101);
  });
});

describe('image mapping by FL id prefix', () => {
  it('maps the 80 completed images and marks the remaining rows missing', () => {
    expect(flavorEntriesWithImage()).toHaveLength(80);
    expect(flavorEntriesMissingImage()).toHaveLength(2420);
  });

  it('keeps the completed image ranges and never borrows an image for the rest', () => {
    const present = new Set(flavorEntriesWithImage().map((entry) => entry.flavorCode));
    expect(present.has('FL-000001')).toBe(true);
    expect(present.has('FL-000010')).toBe(true);
    expect(present.has('FL-000011')).toBe(false);
    expect(present.has('FL-000021')).toBe(true);
    expect(present.has('FL-000040')).toBe(true);
    expect(present.has('FL-000051')).toBe(true);
    expect(present.has('FL-000100')).toBe(true);
    expect(present.has('FL-000101')).toBe(false);
    expect(present.has('FL-002500')).toBe(false);
  });

  it('present images carry a public path + stable 1200x1200 dimensions; missing carry null', () => {
    for (const e of FLAVOR_CATALOGUE) {
      if (e.imageStatus === 'present') {
        expect(e.imagePath?.startsWith(`/recipes/${e.flavorCode}_`)).toBe(true);
        expect(e.imagePath?.endsWith('.webp')).toBe(true);
        expect(e.imageWidth).toBe(1200);
        expect(e.imageHeight).toBe(1200);
      } else {
        expect(e.imagePath).toBeNull();
        expect(e.imageWidth).toBeNull();
      }
    }
  });

  it('no duplicate image files or hashes among present entries', () => {
    const files = FLAVOR_CATALOGUE_SOURCE.filter((r) => r.image.status === 'present').map((r) => r.image.file);
    const hashes = FLAVOR_CATALOGUE_SOURCE.filter((r) => r.image.status === 'present').map((r) => r.image.sha256);
    expect(new Set(files).size).toBe(files.length);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe('honest status — inspirations, not recipes', () => {
  it('formulaStatus is only metadata_only or draftable (never calculated/verified)', () => {
    for (const e of FLAVOR_CATALOGUE) {
      expect(['metadata_only', 'draftable']).toContain(e.formulaStatus);
    }
  });

  it('formulaStatus distribution reflects safe starter support across all 2500 rows', () => {
    const metadataOnly = FLAVOR_CATALOGUE.filter((e) => e.formulaStatus === 'metadata_only');
    const draftable = FLAVOR_CATALOGUE.filter((e) => e.formulaStatus === 'draftable');
    expect(metadataOnly).toHaveLength(554);
    expect(draftable).toHaveLength(1946);
    expect(FLAVOR_CATALOGUE.filter((e) => e.engineSupport === 'protein_unsupported').every((e) => e.formulaStatus === 'metadata_only' || e.formulaStatus === 'draftable')).toBe(true);
  });

  it('never invents grams or an engine recipe (no dose/recipe fields on any entry)', () => {
    for (const e of FLAVOR_CATALOGUE) {
      const keys = Object.keys(e);
      expect(keys).not.toContain('grams');
      expect(keys).not.toContain('doses');
      expect(keys).not.toContain('recipeInput');
      // mainIngredients are inspiration strings, never numeric doses.
      expect(e.mainIngredients.every((x) => typeof x === 'string')).toBe(true);
    }
  });

  it('protein entries surface an honest engine-in-preparation note', () => {
    const protein = FLAVOR_CATALOGUE.filter((e) => e.visibleProductType === 'protein');
    expect(protein.length).toBe(152);
    for (const e of protein) {
      const labels = flavorEntryStatusLabels(e);
      expect(labels.engineNote).toBe('Profil silnika w przygotowaniu');
      expect(labels.kind).toBe('Inspiracja smakowa');
    }
  });
});

describe('profile-mapping distribution across all 2500 rows', () => {
  it('matches the source profile distribution', () => {
    const count = (pred: (e: (typeof FLAVOR_CATALOGUE)[number]) => boolean) => FLAVOR_CATALOGUE.filter(pred).length;
    expect(count((e) => e.internalProfiles.includes('chocolate_gelato'))).toBe(432);
    expect(count((e) => e.internalProfiles.includes('sorbet'))).toBe(596);
    expect(count((e) => e.internalProfiles.includes('vegan_gelato'))).toBe(664);
    expect(count((e) => e.ninjaSwirlCompatible)).toBe(788);
    expect(count((e) => e.engineSupport === 'protein_unsupported')).toBe(210);
    expect(count((e) => e.supportedVisibleTypes.includes('sorbet'))).toBe(596);
  });

  it('chocolate never appears as a visible customer product type', () => {
    for (const e of FLAVOR_CATALOGUE) {
      expect(e.supportedVisibleTypes).not.toContain('chocolate');
      expect(['gelato', 'sorbet', 'vegan', 'protein']).toContain(e.visibleProductType);
    }
  });
});

describe('catalogue source immutability', () => {
  it('enriched entries do not share array references with the source records', () => {
    const source = FLAVOR_CATALOGUE_SOURCE[0]!;
    const entry = FLAVOR_CATALOGUE[0]!;
    expect(entry.mainIngredients).not.toBe(source.mainIngredients);
    entry.mainIngredients.push('__mutation__');
    expect(source.mainIngredients).not.toContain('__mutation__');
    entry.mainIngredients.pop();
  });
});

describe('bridge into the existing ready-recipe matcher', () => {
  it('protein entries yield no CatalogueRecipeCard (engine unsupported, never faked)', () => {
    const protein = FLAVOR_CATALOGUE.find((e) => e.visibleProductType === 'protein')!;
    expect(flavorEntryToCatalogueCards(protein)).toHaveLength(0);
  });

  it('Standard/Sorbet entries yield BOTH a gelato and a sorbet card (variants preserved)', () => {
    const dual = FLAVOR_CATALOGUE.find((e) => e.sourceProductProfile === 'Standard Gelato / Sorbet')!;
    const cards = flavorEntryToCatalogueCards(dual);
    const types = cards.map((c) => c.productType).sort();
    expect(types).toEqual(['gelato', 'sorbet']);
    // the exact source id is preserved on the bridged card
    expect(cards.every((c) => c.imageCode === dual.flavorCode)).toBe(true);
  });

  it('produces a non-empty, id-unique set of cards feeding the existing matcher', () => {
    const cards = flavorCatalogueToCards();
    expect(cards.length).toBeGreaterThan(100); // multi-variant entries add cards
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(cards.every((c) => c.gramVisibilityEntitlement === 'exact_grams')).toBe(true);
  });
});
