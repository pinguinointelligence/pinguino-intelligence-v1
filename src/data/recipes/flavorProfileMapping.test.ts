/**
 * Profile-mapping + enrichment rules (pure).
 */
import { describe, expect, it } from 'vitest';
import {
  deriveFlavorTags,
  deriveFormulaStatus,
  deriveMainFlavorTag,
  enrichFlavorRecord,
  mapProductProfile,
  type FlavorCatalogueMeta,
} from './flavorProfileMapping';
import type { FlavorSourceRecord } from './flavorCatalogueTypes';

const META: FlavorCatalogueMeta = {
  sourceWorkbook: 'PINGUINO_FLAVOR_INSPIRATION_2500.xlsx',
  sourceSheet: 'TOP_2500',
  catalogueVersion: 'first-100-v1',
};

function record(partial: Partial<FlavorSourceRecord> & { productProfile: string }): FlavorSourceRecord {
  return {
    id: 'FL-000001',
    popularityRank: 1,
    flavorName: 'Chocolate Fudge with Caramel Swirl',
    mainIngredients: ['cocoa', 'dark chocolate', 'caramel swirl'],
    category: 'Chocolate',
    popularityScore: 100,
    season: 'All Year',
    tags: ['classic', 'rich', 'swirl', 'caramel'],
    worldRegion: 'Global',
    sourceRow: 2,
    image: {
      status: 'present',
      file: 'FL-000001_x.webp',
      ext: '.webp',
      width: 1200,
      height: 1200,
      hasAlpha: true,
      bytes: 1000,
      sha256: 'abc',
    },
    ...partial,
  };
}

describe('mapProductProfile', () => {
  it('Chocolate Gelato → internal chocolate, visible gelato (chocolate is never visible)', () => {
    const m = mapProductProfile('Chocolate Gelato');
    expect(m.internalProfiles).toEqual(['chocolate_gelato']);
    expect(m.primaryInternalProfile).toBe('chocolate_gelato');
    expect(m.visibleProductType).toBe('gelato');
    expect(m.supportedVisibleTypes).toEqual(['gelato']);
    expect(m.ninjaSwirlCompatible).toBe(false);
    expect(m.engineSupport).toBe('supported');
  });

  it('Chocolate Gelato / Swirl → Ninja Swirl compatible, never forces a serving mode', () => {
    const m = mapProductProfile('Chocolate Gelato / Swirl');
    expect(m.internalProfiles).toEqual(['chocolate_gelato']);
    expect(m.ninjaSwirlCompatible).toBe(true);
    expect(m.compatTags).toEqual(['Ninja Swirl compatible']);
    expect(m.visibleProductType).toBe('gelato');
  });

  it('Standard Gelato → standard_gelato, visible gelato', () => {
    const m = mapProductProfile('Standard Gelato');
    expect(m.internalProfiles).toEqual(['standard_gelato']);
    expect(m.visibleProductType).toBe('gelato');
  });

  it('Standard Gelato / Swirl → swirl compat', () => {
    const m = mapProductProfile('Standard Gelato / Swirl');
    expect(m.internalProfiles).toEqual(['standard_gelato']);
    expect(m.ninjaSwirlCompatible).toBe(true);
  });

  it('Standard Gelato / Sorbet → SUPPORTED VARIANTS, never silently one', () => {
    const m = mapProductProfile('Standard Gelato / Sorbet');
    expect(m.internalProfiles).toEqual(['standard_gelato', 'sorbet']);
    expect(m.primaryInternalProfile).toBe('standard_gelato');
    expect(m.supportedVisibleTypes).toEqual(['gelato', 'sorbet']);
    expect(m.engineSupport).toBe('supported');
  });

  it('Standard Gelato / Sorbet / Swirl → both variants + swirl', () => {
    const m = mapProductProfile('Standard Gelato / Sorbet / Swirl');
    expect(m.internalProfiles).toEqual(['standard_gelato', 'sorbet']);
    expect(m.supportedVisibleTypes).toEqual(['gelato', 'sorbet']);
    expect(m.ninjaSwirlCompatible).toBe(true);
  });

  it('Standard Gelato / Chocolate Gelato → dual internal, chocolate stays hidden (visible gelato only)', () => {
    const m = mapProductProfile('Standard Gelato / Chocolate Gelato');
    expect(m.internalProfiles).toEqual(['standard_gelato', 'chocolate_gelato']);
    expect(m.supportedVisibleTypes).toEqual(['gelato']);
    expect(m.visibleProductType).toBe('gelato');
  });

  it('Protein Gelato → visible protein, engine profile in preparation (unsupported)', () => {
    const m = mapProductProfile('Protein Gelato');
    expect(m.internalProfiles).toEqual(['protein_gelato']);
    expect(m.visibleProductType).toBe('protein');
    expect(m.engineSupport).toBe('protein_unsupported');
  });

  it('never surfaces "chocolate" as a visible customer type', () => {
    for (const profile of [
      'Chocolate Gelato',
      'Chocolate Gelato / Swirl',
      'Standard Gelato / Chocolate Gelato',
    ]) {
      const m = mapProductProfile(profile);
      expect(m.supportedVisibleTypes).not.toContain('chocolate');
      expect(m.visibleProductType).not.toBe('chocolate');
    }
  });

  it('throws loudly on an unrecognized profile string', () => {
    expect(() => mapProductProfile('Frozen Yogurt Deluxe')).toThrow(/Unrecognized Product Profile/);
  });
});

describe('deriveFormulaStatus', () => {
  it('draftable when a locked starter template exists (standard/chocolate)', () => {
    expect(deriveFormulaStatus(mapProductProfile('Standard Gelato'))).toBe('draftable');
    expect(deriveFormulaStatus(mapProductProfile('Chocolate Gelato'))).toBe('draftable');
    expect(deriveFormulaStatus(mapProductProfile('Standard Gelato / Sorbet'))).toBe('draftable');
  });

  it('metadata_only when no safe template exists (protein)', () => {
    expect(deriveFormulaStatus(mapProductProfile('Protein Gelato'))).toBe('metadata_only');
  });

  it('never returns calculated or verified in this import', () => {
    for (const profile of [
      'Chocolate Gelato',
      'Standard Gelato / Sorbet / Swirl',
      'Protein Gelato',
    ]) {
      const status = deriveFormulaStatus(mapProductProfile(profile));
      expect(status === 'calculated' || status === 'verified').toBe(false);
    }
  });
});

describe('deriveMainFlavorTag + deriveFlavorTags', () => {
  it('chocolate category → chocolate', () => {
    expect(deriveMainFlavorTag(record({ productProfile: 'Chocolate Gelato', category: 'Chocolate' }))).toBe(
      'chocolate',
    );
  });

  it('vanilla category → vanilla', () => {
    expect(
      deriveMainFlavorTag(record({ productProfile: 'Standard Gelato', category: 'Vanilla', flavorName: 'Vanilla Bean' })),
    ).toBe('vanilla');
  });

  it('fruit category → specific fruit from the name', () => {
    expect(
      deriveMainFlavorTag(
        record({ productProfile: 'Standard Gelato / Sorbet', category: 'Fruit', flavorName: 'Strawberry with Brown Sugar' }),
      ),
    ).toBe('strawberry');
  });

  it('flavor tags include the primary family, name tokens and source tags', () => {
    const r = record({ productProfile: 'Chocolate Gelato / Swirl' });
    const tags = deriveFlavorTags(r, 'chocolate');
    expect(tags).toContain('chocolate');
    expect(tags).toContain('caramel');
    expect(tags).toContain('swirl');
    // deterministic + de-duplicated (sorted)
    expect([...tags]).toEqual([...tags].sort());
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe('enrichFlavorRecord', () => {
  it('preserves the exact source name and clones arrays (source stays immutable)', () => {
    const r = record({ productProfile: 'Chocolate Gelato' });
    const entry = enrichFlavorRecord(r, META);
    expect(entry.flavorName).toBe(r.flavorName);
    expect(entry.mainIngredients).toEqual(r.mainIngredients);
    expect(entry.mainIngredients).not.toBe(r.mainIngredients);
    expect(entry.tags).not.toBe(r.tags);
    expect(entry.catalogueRecipeId).toBe('cat-fl-000001');
    expect(entry.polishName).toBeNull();
  });

  it('present image → public path; missing image → null path', () => {
    const present = enrichFlavorRecord(record({ productProfile: 'Chocolate Gelato' }), META);
    expect(present.imagePath).toBe('/recipes/FL-000001_x.webp');
    expect(present.imageStatus).toBe('present');
    const missing = enrichFlavorRecord(
      record({
        productProfile: 'Chocolate Gelato',
        image: { status: 'missing', file: null, ext: null, width: null, height: null, hasAlpha: null, bytes: null, sha256: null },
      }),
      META,
    );
    expect(missing.imagePath).toBeNull();
    expect(missing.imageStatus).toBe('missing');
  });
});
