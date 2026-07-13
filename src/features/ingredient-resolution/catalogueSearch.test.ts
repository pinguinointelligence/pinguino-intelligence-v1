import { describe, expect, it } from 'vitest';
import { searchProductCatalogue, type CatalogueProduct } from './catalogueSearch';

const CATALOGUE: readonly CatalogueProduct[] = [
  { productId: 'A', displayName: 'Ciemna czekolada 70%' },
  { productId: 'B', displayName: 'Czekolada mleczna' },
  { productId: 'C', displayName: 'Whisky single malt' },
  { productId: 'D', displayName: 'Puree malinowe 100%', internalName: 'raspberry puree' },
];

describe('searchProductCatalogue — honest name search', () => {
  it('returns only real name matches (never a fabricated candidate)', () => {
    const hits = searchProductCatalogue('czekolada', CATALOGUE);
    expect(hits.map((h) => h.productId).sort()).toEqual(['A', 'B']);
    expect(hits.every((h) => h.matchedOn === 'name_contains')).toBe(true);
  });

  it('ranks an exact-name hit before name-contains hits', () => {
    const hits = searchProductCatalogue('Czekolada mleczna', CATALOGUE);
    expect(hits[0]?.productId).toBe('B');
    expect(hits[0]?.matchedOn).toBe('exact_name');
  });

  it('matches on the internal name too', () => {
    const hits = searchProductCatalogue('raspberry', CATALOGUE);
    expect(hits.map((h) => h.productId)).toEqual(['D']);
  });

  it('a blank query returns nothing (no accidental full-catalogue dump)', () => {
    expect(searchProductCatalogue('   ', CATALOGUE)).toEqual([]);
  });

  it('an unknown term returns nothing (honest empty result)', () => {
    expect(searchProductCatalogue('pistacja', CATALOGUE)).toEqual([]);
  });
});
