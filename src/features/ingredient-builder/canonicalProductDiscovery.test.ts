import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  PRODUCT_DISCOVERY_TOP_FILTERS,
  availableContextualSubfilters,
  canonicalReplaceContext,
  matchesProductDiscoveryFilter,
  projectCatalogHitsForDiscovery,
  resolveInitialProductDiscoveryFilter,
} from './canonicalProductDiscovery';

const hit = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'catalog-root',
  currentVersionId: 'version-1',
  entityKind: 'pi_base',
  status: 'pi_base',
  provenance: 'mapper',
  displayName: 'PRODUCT',
  originalName: null,
  originalLanguage: null,
  brand: null,
  canonicalFamily: null,
  category: 'other',
  productForm: 'other',
  mappedIngredientId: 'PI-ING-000001',
  markets: [],
  retailers: [],
  eans: [],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  mainAllowed: false,
  usableAsTopping: true,
  blockedReason: null,
  relevance: 1,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'mapper_verified',
  publicData: {},
  ...overrides,
});

describe('canonical product-discovery filters', () => {
  it('keeps the owner-locked top-level order and excludes form/role dimensions', () => {
    expect(PRODUCT_DISCOVERY_TOP_FILTERS).toEqual([
      'favorites',
      'all',
      'fruit',
      'dairy',
      'nuts',
      'chocolate',
      'technical',
    ]);
    expect(PRODUCT_DISCOVERY_TOP_FILTERS).not.toContain('fresh');
    expect(PRODUCT_DISCOVERY_TOP_FILTERS).not.toContain('paste');
    expect(PRODUCT_DISCOVERY_TOP_FILTERS).not.toContain('topping');
  });

  it('defaults to Favorites only when the account actually has favorites', () => {
    expect(resolveInitialProductDiscoveryFilter(2)).toBe('favorites');
    expect(resolveInitialProductDiscoveryFilter(0)).toBe('all');
  });

  it('keeps nut paste under Nuts and technical families under Technical', () => {
    expect(matchesProductDiscoveryFilter(hit({ category: 'nut_paste' }), 'nuts')).toBe(true);
    expect(
      matchesProductDiscoveryFilter(
        hit({ category: 'paste', productForm: 'nut_paste', displayName: 'ALMOND PASTE' }),
        'nuts',
      ),
    ).toBe(true);
    expect(matchesProductDiscoveryFilter(hit({ category: 'sugar' }), 'technical')).toBe(true);
    expect(matchesProductDiscoveryFilter(hit({ category: 'stabilizer' }), 'technical')).toBe(true);
    expect(
      matchesProductDiscoveryFilter(
        hit({ displayName: 'INULIN', category: 'fiber', canonicalFamily: 'inulin' }),
        'technical',
      ),
    ).toBe(true);
  });

  it('derives only useful contextual Fruit and Technical subfilters from real hits', () => {
    const fruit = [
      hit({ id: 'fresh', category: 'fruit', productForm: 'fresh_fruit' }),
      hit({ id: 'puree', category: 'fruit', productForm: 'fruit_puree' }),
    ];
    expect(availableContextualSubfilters(fruit, 'fruit')).toEqual(['all', 'fresh', 'puree']);

    const technical = [
      hit({ id: 'dextrose', displayName: 'DEXTROSE', category: 'sweetener' }),
      hit({ id: 'tara', displayName: 'TARA GUM', category: 'stabilizer' }),
      hit({ id: 'gellatti', displayName: 'GELLATTI STABILIZER', category: 'stabilizer' }),
      hit({ id: 'inulin', displayName: 'INULIN', category: 'fiber' }),
    ];
    expect(availableContextualSubfilters(technical, 'technical')).toEqual([
      'all',
      'sugars',
      'stabilizers',
      'inulin',
    ]);
  });
});

describe('canonical technological slot projection', () => {
  const milk15 = hit({
    id: 'milk-15',
    displayName: 'MILK 1.5% · Milk · Chilled',
    canonicalFamily: 'milk',
    category: 'dairy',
    productForm: 'milk',
    mappedIngredientId: 'PI-ING-000234',
  });
  const milk36 = hit({
    id: 'milk-36',
    displayName: 'MILK 3.6% · Milk · Chilled',
    canonicalFamily: 'milk',
    category: 'dairy',
    productForm: 'milk',
    mappedIngredientId: 'PI-ING-000236',
  });
  const milk20 = hit({
    id: 'milk-20',
    displayName: 'MILK 2.0% · Milk · Chilled',
    canonicalFamily: 'milk',
    category: 'dairy',
    productForm: 'milk',
    mappedIngredientId: 'PI-ING-000235',
  });
  const localMilk36A = hit({
    id: 'sku-a',
    entityKind: 'commercial_product',
    productCode: 'PR-ING-000101',
    status: 'verified',
    verificationMethod: 'human',
    displayName: 'Hacendado Leche Entera',
    brand: 'Hacendado',
    canonicalFamily: 'milk',
    category: 'dairy',
    productForm: 'milk',
    mappedIngredientId: 'PI-ING-000236',
    markets: ['ES'],
    publicData: { technicalComposition: { fat: 3.6 } },
  });
  const localMilk36B = hit({
    ...localMilk36A,
    id: 'sku-b',
    productCode: 'PR-ING-000102',
    displayName: 'Central Lechera Milk',
    brand: 'Central Lechera',
  });

  it('collapses commercial duplicates for generic milk intent and sorts percentage numerically', () => {
    const projected = projectCatalogHitsForDiscovery({
      hits: [milk36, localMilk36A, milk15, localMilk36B],
      query: 'mleko',
    });
    expect(projected.map((item) => item.primaryName)).toEqual(['MILK 1.5%', 'MILK 3.6%']);
    expect(projected.map((item) => item.variantPercent)).toEqual([1.5, 3.6]);
  });

  it('keeps one canonical row and shows the resolved exact SKU only as secondary text', () => {
    const resolved = {
      ...milk36,
      resolvedExactProduct: localMilk36A,
      resolutionSource: 'COUNTRY_PRIMARY_DEFAULT' as const,
      resolutionCountry: 'ES',
    };
    const projected = projectCatalogHitsForDiscovery({
      hits: [resolved, localMilk36A, localMilk36B],
      query: 'mleko',
    });
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      primaryName: 'MILK 3.6%',
      secondaryText: 'Hacendado · Hacendado Leche Entera',
      hit: { entityKind: 'pi_base', resolvedExactProduct: { id: 'sku-a' } },
    });
  });

  it('keeps the canonical one-decimal Milk title even for whole numeric values', () => {
    expect(projectCatalogHitsForDiscovery({ hits: [milk20], query: 'milk' })[0]?.primaryName).toBe(
      'MILK 2.0%',
    );
  });

  it('keeps new percentages data-driven and orders cream by its own family contract', () => {
    const cream = (value: number) =>
      hit({
        id: `cream-${value}`,
        displayName: `CREAM ${value}% · Chilled`,
        canonicalFamily: 'cream',
        category: 'dairy',
        productForm: 'cream',
        mappedIngredientId: `PI-ING-${String(Math.round(value * 10)).padStart(6, '0')}`,
      });
    expect(
      projectCatalogHitsForDiscovery({
        hits: [cream(30), cream(3.7), cream(18)],
        query: 'cream',
      }).map((item) => item.variantPercent),
    ).toEqual([3.7, 18, 30]);
  });

  it('preserves canonical server relevance order for Sugars and Stabilizers', () => {
    const sugarHits = [
      hit({
        id: 'dextrose',
        displayName: 'DEXTROSE',
        category: 'sweetener',
        mappedIngredientId: 'PI-ING-000410',
        favorite: false,
        recentlyUsedAt: null,
      }),
      hit({
        id: 'sucrose',
        displayName: 'SUCROSE',
        category: 'sugar',
        mappedIngredientId: 'PI-ING-000411',
        favorite: true,
        recentlyUsedAt: '2026-09-03T08:00:00.000Z',
      }),
    ];
    const stabilizerHits = [
      hit({
        id: 'tara',
        displayName: 'TARA GUM',
        category: 'stabilizer',
        mappedIngredientId: 'PI-ING-000420',
        favorite: false,
        recentlyUsedAt: null,
      }),
      hit({
        id: 'gellatti',
        displayName: 'GELLATTI STABILIZER',
        category: 'stabilizer',
        mappedIngredientId: 'PI-ING-000421',
        favorite: true,
        recentlyUsedAt: '2026-09-03T09:00:00.000Z',
      }),
    ];

    expect(
      projectCatalogHitsForDiscovery({ hits: sugarHits, query: 'sugar' }).map(
        (item) => item.hit.id,
      ),
    ).toEqual(['dextrose', 'sucrose']);
    expect(
      projectCatalogHitsForDiscovery({ hits: stabilizerHits, query: 'stabilizer' }).map(
        (item) => item.hit.id,
      ),
    ).toEqual(['tara', 'gellatti']);
  });

  it('preserves explicit brand, EAN and article searches as exact commercial discovery', () => {
    for (const query of ['Hacendado', '8410000000001', 'PR-ING-000101']) {
      const projected = projectCatalogHitsForDiscovery({ hits: [localMilk36A], query });
      expect(projected).toHaveLength(1);
      expect(projected[0]?.primaryName).toBe('Hacendado Leche Entera');
      expect(projected[0]?.hit.id).toBe('sku-a');
    }
  });

  it('does not invent a generic winner when several commercial SKUs have no canonical reference', () => {
    expect(
      projectCatalogHitsForDiscovery({
        hits: [localMilk36A, localMilk36B],
        query: 'milk',
      }),
    ).toEqual([]);
  });
});

describe('contextual Replace routing contract', () => {
  it('keeps Milk and Cream inside the Dairy top-level filter', () => {
    expect(
      matchesProductDiscoveryFilter(
        hit({ displayName: 'MILK 3.5%', category: 'dairy', canonicalFamily: 'milk' }),
        'dairy',
      ),
    ).toBe(true);
    expect(
      matchesProductDiscoveryFilter(
        hit({ displayName: 'CREAM 30%', category: 'dairy', canonicalFamily: 'cream' }),
        'dairy',
      ),
    ).toBe(true);
  });

  it.each([
    [
      hit({ displayName: 'DEXTROSE', category: 'sweetener' }),
      { filter: 'technical', subfilter: 'sugars', family: null },
    ],
    [
      hit({ displayName: 'TARA GUM', category: 'stabilizer' }),
      { filter: 'technical', subfilter: 'stabilizers', family: null },
    ],
    [
      hit({ displayName: 'GELLATTI STABILIZER', category: 'stabilizer' }),
      { filter: 'technical', subfilter: 'stabilizers', family: null },
    ],
    [
      hit({ displayName: 'INULIN', category: 'fiber' }),
      { filter: 'technical', subfilter: 'inulin', family: null },
    ],
    [
      hit({
        displayName: 'MILK 3.5%',
        category: 'dairy',
        canonicalFamily: 'milk',
        productForm: 'milk',
      }),
      { filter: 'dairy', subfilter: 'all', family: 'milk' },
    ],
    [
      hit({
        displayName: 'CREAM 30%',
        category: 'dairy',
        canonicalFamily: 'cream',
        productForm: 'cream',
      }),
      { filter: 'dairy', subfilter: 'all', family: 'cream' },
    ],
  ])('routes %s through its canonical family context', (product, expected) => {
    expect(canonicalReplaceContext(product)).toEqual(expected);
  });
});
