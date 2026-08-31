import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  PRODUCT_PICKER_SEGMENT_LABELS,
  buildProductPickerSegments,
  canonicalCatalogProductId,
  catalogDataConfidencePercent,
  formatDataConfidencePercent,
  normalizeDataConfidencePercent,
  uniqueCatalogProductCount,
} from './productPickerCatalogPresentation';

const hit = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'catalog-product',
  currentVersionId: 'version-1',
  entityKind: 'pi_base',
  status: 'pi_base',
  provenance: 'mapper',
  displayName: 'Product',
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

const product = (
  canonicalId: string,
  overrides: Partial<{ favorite: boolean; recent: boolean; category: string }> = {},
) => ({ canonicalId, favorite: false, recent: false, category: 'other', ...overrides });

describe('neutral catalog data presentation', () => {
  it('A/B uses the same canonical ID and neutral confidence format for every source type', () => {
    const verified = hit({
      mappedIngredientId: 'PI-ING-000180',
      verificationMethod: 'mapper_verified',
      publicData: { sourceConfidence: 98, verificationSource: 'verified_db' },
    });
    const estimated = hit({
      mappedIngredientId: 'PI-ING-000345',
      verificationMethod: 'mapper_estimated',
      publicData: { sourceConfidence: 92, verificationSource: 'ai_estimated' },
    });

    expect([
      [
        canonicalCatalogProductId(verified),
        formatDataConfidencePercent(catalogDataConfidencePercent(verified)),
      ],
      [
        canonicalCatalogProductId(estimated),
        formatDataConfidencePercent(catalogDataConfidencePercent(estimated)),
      ],
    ]).toEqual([
      ['PI-ING-000180', '98%'],
      ['PI-ING-000345', '92%'],
    ]);
  });

  it('D always renders a percentage, keeps 100%, and clamps display-only values', () => {
    expect(normalizeDataConfidencePercent(undefined)).toBeNull();
    expect(formatDataConfidencePercent(null)).toBe('0%');
    expect(normalizeDataConfidencePercent(0)).toBe(0);
    expect(formatDataConfidencePercent(0)).toBe('0%');
    expect(normalizeDataConfidencePercent(-4)).toBe(0);
    expect(normalizeDataConfidencePercent(101.2)).toBe(100);
    expect(normalizeDataConfidencePercent(91.6)).toBe(92);
    expect(formatDataConfidencePercent(100)).toBe('100%');
    expect(
      catalogDataConfidencePercent(
        hit({
          publicData: { productAccuracy: 96, sourceConfidence: 41 },
        }),
      ),
    ).toBe(96);
  });

  it('keeps an unbound product existing catalog root instead of inventing an ID', () => {
    expect(
      canonicalCatalogProductId(hit({ id: 'existing-product-root', mappedIngredientId: null })),
    ).toBe('existing-product-root');
  });

  it('keeps the commercial product code primary and never substitutes its Mapper binding', () => {
    expect(
      canonicalCatalogProductId(
        hit({
          id: '0cfa39a9-e683-4dea-b4b9-7f732a7c9c08',
          entityKind: 'commercial_product',
          productCode: 'PR-ING-006308',
          mappedIngredientId: 'PI-ING-000091',
          displayName: 'Baitz Baton choco cocos',
        }),
      ),
    ).toBe('PR-ING-006308');
  });
});

describe('stable catalog segments', () => {
  it('E deduplicates a favorite+recent product into the first segment only', () => {
    const segments = buildProductPickerSegments([
      product('PI-ING-000345'),
      product('PI-ING-000345', { favorite: true, recent: true }),
      product('PI-ING-000180'),
    ]);

    expect(segments.map((segment) => segment.label)).toEqual([
      PRODUCT_PICKER_SEGMENT_LABELS.recent,
      PRODUCT_PICKER_SEGMENT_LABELS.all,
    ]);
    expect(segments[0]?.items.map((item) => item.canonicalId)).toEqual(['PI-ING-000345']);
    expect(segments[0]?.items[0]).toMatchObject({ favorite: true, recent: true });
    expect(segments[1]?.items.map((item) => item.canonicalId)).toEqual(['PI-ING-000180']);
  });

  it('F renders exactly the two accepted headings and never PINGÜINO Base', () => {
    // A favourite leads only while a query is active — that is what makes it a
    // MATCHING favourite rather than an unrelated one.
    const labels = buildProductPickerSegments(
      [product('favorite', { favorite: true }), product('ordinary')],
      { activeQuery: true },
    ).map((segment) => segment.label);
    expect(labels).toEqual(['ULUBIONE', 'POZOSTAŁE SKŁADNIKI']);
    expect(labels).not.toContain('PINGÜINO Base');
  });

  it('G uses one SKŁADNIKI segment when featured products are absent', () => {
    expect(buildProductPickerSegments([product('one'), product('two')])).toEqual([
      {
        id: 'ingredients',
        label: 'SKŁADNIKI',
        items: [product('one'), product('two')],
      },
    ]);
  });

  it('H segments only the already-filtered Pasty result set', () => {
    const filtered = [
      product('paste-favorite', { favorite: true, category: 'paste' }),
      product('paste-rest', { category: 'paste' }),
      product('fruit-hidden', { category: 'fruit' }),
    ].filter((item) => item.category === 'paste');
    const segments = buildProductPickerSegments(filtered, { activeQuery: true });
    expect(
      segments.flatMap((segment) => segment.items).every((item) => item.category === 'paste'),
    ).toBe(true);
    expect(segments).toHaveLength(2);
  });

  it('I keeps at most two headings across a long interleaved paginated result set', () => {
    const batches = Array.from({ length: 240 }, (_, index) =>
      product(`PI-ING-${String(index).padStart(6, '0')}`, {
        favorite: index % 7 === 0,
        recent: index % 11 === 0,
      }),
    );
    const withRepeatedPageEdges = [
      ...batches.slice(0, 100),
      batches[99]!,
      ...batches.slice(100, 200),
      batches[199]!,
      ...batches.slice(200),
    ];
    const segments = buildProductPickerSegments(withRepeatedPageEdges);

    expect(segments.length).toBeLessThanOrEqual(2);
    expect(segments.map((segment) => segment.label)).toEqual([
      'OSTATNIO UŻYWANE',
      'WSZYSTKIE SKŁADNIKI',
    ]);
    expect(uniqueCatalogProductCount(segments)).toBe(240);
  });

  it('J counts unique IDs, not favorites, recents, duplicates, or headings', () => {
    const segments = buildProductPickerSegments(
      [product('same', { favorite: true }), product('same', { recent: true }), product('other')],
      { activeQuery: true },
    );
    expect(uniqueCatalogProductCount(segments)).toBe(2);
  });
});
