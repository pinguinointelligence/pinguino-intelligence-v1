import { describe, expect, it } from 'vitest';
import { scanResultFromLookupFacts } from '../../../supabase/functions/_shared/productScanner';
import { openFoodFactsApiUrl, openFoodFactsFactsForExactEan } from './openFoodFactsDirectLookup';

const HACENDADO_EAN = '8480000804884';
const KNOWN_EAN = '3017620422003';

const hacendadoPayload = {
  status: 1,
  code: HACENDADO_EAN,
  product: {
    generic_name: 'Crema de Pistacho',
    brands: 'Hacendado',
    quantity: '200 g',
    categories: 'Pistachio butters',
    ingredients_text: 'Pistácio 45%, açúcar, leite em pó, soro de leite em pó, gorduras vegetais.',
    allergens: 'milk, nuts, soybeans',
    countries: 'Portugal',
    nutrition_data_per: '100g',
    nutriments: {
      'energy-kj_100g': 2387,
      'energy-kcal_100g': 573,
      fat_100g: 38,
      'saturated-fat_100g': 9.3,
      carbohydrates_100g: 46.4,
      sugars_100g: 44.6,
      fiber_100g: 3,
      proteins_100g: 9.7,
      salt_100g: 0.23,
    },
  },
};

describe('direct OpenFoodFacts exact-EAN acquisition', () => {
  it('SCN-GTIN-DIRECT-001 acquires the Hacendado pistachio product with registry provenance', () => {
    const result = openFoodFactsFactsForExactEan(
      hacendadoPayload,
      HACENDADO_EAN,
      '2026-09-12T12:00:00.000Z',
    );

    expect(result.outcome).toBe('found');
    expect(result.returnedBarcode).toBe(HACENDADO_EAN);
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'productName', value: 'Crema de Pistacho' }),
        expect.objectContaining({ field: 'brand', value: 'Hacendado' }),
        expect.objectContaining({ field: 'netQuantity', value: '200 g' }),
        expect.objectContaining({
          field: 'ingredients',
          value: expect.stringContaining('Pistácio 45%'),
        }),
        expect.objectContaining({ field: 'nutritionBasis', value: 'per 100 g' }),
        expect.objectContaining({ field: 'energyKcal', value: '573 kcal' }),
        expect.objectContaining({ field: 'fat', value: '38 g' }),
        expect.objectContaining({ field: 'sugars', value: '44.6 g' }),
        expect.objectContaining({ field: 'protein', value: '9.7 g' }),
        expect.objectContaining({ field: 'salt', value: '0.23 g' }),
      ]),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
          evidenceSource: 'barcode_registry',
          sourceStatedEan: HACENDADO_EAN,
          sourceEanConfirmationMethod: 'url',
          sourceEanConfirmedAt: '2026-09-12T12:00:00.000Z',
          sourceUrl: `https://world.openfoodfacts.org/api/v2/product/${HACENDADO_EAN}.json`,
        }),
      ]),
    );

    const scanResult = scanResultFromLookupFacts(result.facts)!;
    expect(scanResult.identity).toMatchObject({
      displayName: 'Crema de Pistacho',
      brand: 'Hacendado',
      category: 'Pistachio butters',
    });
    expect(scanResult.package).toMatchObject({ netQuantity: 200, unit: 'g' });
    expect(scanResult.nutrition).toMatchObject({
      basis: 'per_100g',
      energyKcal: 573,
      fat: 38,
      sugars: 44.6,
      protein: 9.7,
      salt: 0.23,
    });
    expect(scanResult.externalSources).toEqual([
      expect.objectContaining({
        sourceType: 'barcode_registry',
        sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
        sourceStatedEan: HACENDADO_EAN,
      }),
    ]);
  });

  it('SCN-GTIN-DIRECT-002 accepts a known product only under its exact returned EAN', () => {
    const result = openFoodFactsFactsForExactEan(
      {
        status: 1,
        code: KNOWN_EAN,
        product: {
          product_name: 'Nutella',
          brands: 'Ferrero',
          quantity: '400 g',
          nutrition_data_per: '100g',
          nutriments: { 'energy-kcal_100g': 539 },
        },
      },
      KNOWN_EAN,
      '2026-09-12T12:00:00.000Z',
    );

    expect(result.outcome).toBe('found');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'productName', value: 'Nutella' }),
        expect.objectContaining({ field: 'brand', value: 'Ferrero' }),
      ]),
    );
  });

  it('SCN-GTIN-DIRECT-003 rejects every fact when OFF returns a different barcode', () => {
    const result = openFoodFactsFactsForExactEan(
      { ...hacendadoPayload, code: '8480000804891' },
      HACENDADO_EAN,
      '2026-09-12T12:00:00.000Z',
    );

    expect(result).toMatchObject({ outcome: 'barcode_mismatch', facts: [] });
  });

  it('SCN-GTIN-DIRECT-004 keeps a genuinely unknown EAN fail-closed', () => {
    const result = openFoodFactsFactsForExactEan(
      { status: 0, code: '2900000000007', product: {} },
      '2900000000007',
      '2026-09-12T12:00:00.000Z',
    );

    expect(result).toMatchObject({
      outcome: 'not_found',
      returnedBarcode: '2900000000007',
      facts: [],
    });
  });

  it('SCN-GTIN-DIRECT-005 builds only the exact keyless OFF product endpoint', () => {
    expect(openFoodFactsApiUrl(' 8480-0008 04884 ')).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${HACENDADO_EAN}.json`,
    );
  });
});
