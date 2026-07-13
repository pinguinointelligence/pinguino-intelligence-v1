import { describe, expect, it } from 'vitest';
import {
  searchPickerCatalogue,
  evaluatePickerReadiness,
  readableStatusLabel,
} from './productSearch';
import { SAMPLE_CATALOGUE, sampleCategoryForIngredient } from './sampleCatalogue';
import type { PickerCatalogueEntry } from './productPickerContracts';

const entry = (over: Partial<PickerCatalogueEntry>): PickerCatalogueEntry => ({
  productId: 'P1',
  productCode: 'P1',
  displayName: 'Product One',
  internalName: null,
  brand: null,
  ean: null,
  category: 'czekolada',
  packageSize: null,
  imageUrl: null,
  status: 'draft',
  readiness: { pac_value: null, pod_value: null, mapper_status: null, matched_basement_id: null },
  reference: null,
  ...over,
});

describe('product-picker search', () => {
  const catalogue = [
    entry({ productId: 'P-choc', displayName: 'Lindt Excellence 70%', brand: 'Lindt', ean: '3046920022606', category: 'czekolada' }),
    entry({ productId: 'P-whisky', displayName: 'Jameson Irish Whiskey', brand: 'Jameson', ean: '5011007003234', category: 'whisky' }),
  ];

  it('matches by product name (contains)', () => {
    const r = searchPickerCatalogue({ text: 'lindt' }, catalogue);
    expect(r.map((x) => x.entry.productId)).toContain('P-choc');
  });

  it('matches by brand', () => {
    const r = searchPickerCatalogue({ text: 'jameson' }, catalogue);
    expect(r[0]?.entry.productId).toBe('P-whisky');
  });

  it('matches by EAN (normalized exact) and ranks it above a name-contains hit', () => {
    const r = searchPickerCatalogue({ text: '3046920022606' }, catalogue);
    expect(r[0]?.entry.productId).toBe('P-choc');
    expect(r[0]?.matchedOn).toBe('ean');
  });

  it('matches by internal product id (exact only)', () => {
    const r = searchPickerCatalogue({ text: 'P-whisky' }, catalogue);
    expect(r[0]?.matchedOn).toBe('product_id');
  });

  it('a blank text query with a category browses that category', () => {
    const r = searchPickerCatalogue({ text: '', category: 'whisky' }, catalogue);
    expect(r).toHaveLength(1);
    expect(r[0]?.entry.productId).toBe('P-whisky');
  });

  it('a blank text query with NO category returns nothing (never dumps everything)', () => {
    expect(searchPickerCatalogue({ text: '' }, catalogue)).toEqual([]);
  });
});

describe('product-picker readiness (honest)', () => {
  it('every sample-catalogue product is honestly NOT exact-ready (no invented pac/pod)', () => {
    for (const e of SAMPLE_CATALOGUE) {
      const r = evaluatePickerReadiness(e);
      expect(r.exactReady).toBe(false);
      expect(r.badge).toBe('Wymaga danych');
      expect(r.message).toBeTruthy();
    }
  });

  it('an OWN-measured product (real pac + pod, clean text, no red flag) is exact-ready', () => {
    const ready = entry({
      productId: 'P-ready',
      displayName: 'Owner-measured base',
      readiness: { pac_value: 190, pod_value: 100, mapper_status: null, matched_basement_id: null, product_name_display: 'Owner-measured base' },
    });
    const r = evaluatePickerReadiness(ready);
    expect(r.exactReady).toBe(true);
    expect(r.badge).toBe('Gotowy do przeliczenia');
    expect(r.message).toBeNull();
  });

  it('a red-flagged product (sweetener) is never exact-ready even with own values', () => {
    const flagged = entry({
      productId: 'P-flag',
      displayName: 'Chocolate sin azúcar',
      readiness: { pac_value: 190, pod_value: 100, product_name_display: 'Chocolate sin azúcar' },
    });
    expect(evaluatePickerReadiness(flagged).exactReady).toBe(false);
  });
});

describe('product-picker readable labels + category seeding', () => {
  it('maps lifecycle status to a readable Polish label (never the raw enum)', () => {
    expect(readableStatusLabel('pi_verified')).toBe('Zweryfikowany przez PI');
    expect(readableStatusLabel('pi_generated')).toBe('Wygenerowany przez PI');
    expect(readableStatusLabel('draft')).toBeNull();
  });

  it('seeds the right sample category from a generic ingredient name', () => {
    expect(sampleCategoryForIngredient('Czekolada')).toBe('czekolada');
    expect(sampleCategoryForIngredient('Puree malinowe')).toBe('owoce');
    expect(sampleCategoryForIngredient('Bazylia')).toBe('zioła');
    expect(sampleCategoryForIngredient('PI Stabilizer')).toBe('stabilizator');
  });
});
