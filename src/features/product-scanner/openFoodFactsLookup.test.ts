/**
 * The server's FIRST source for an unknown GTIN: Open Food Facts by exact code. Verbatim facts,
 * the record's own language first, the declared basis kept (per 100 g vs per 100 ml), and the
 * scan result built from them carries the product's name and brand as registry evidence.
 */
import { describe, expect, it } from 'vitest';
import {
  lookupFactsFromOpenFoodFactsProduct,
  lookupOpenFoodFactsFacts,
} from '../../../supabase/functions/_shared/openFoodFactsLookup.ts';
import { scanResultFromLookupFacts } from '../../../supabase/functions/_shared/productScanner.ts';

const RECORD = {
  lang: 'pl',
  product_name: 'Jogurt naturalny',
  product_name_pl: 'Jogurt naturalny 3%',
  product_name_en: 'Natural yoghurt',
  brands: 'Fruvita, Biedronka',
  quantity: '400 g',
  categories_tags: ['en:dairies', 'en:fermented-foods', 'en:yogurts'],
  ingredients_text: 'mleko, żywe kultury bakterii',
  ingredients_text_pl: 'mleko pasteryzowane, żywe kultury bakterii jogurtowych',
  allergens_tags: ['en:milk'],
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 61,
    fat_100g: 3,
    'saturated-fat_100g': 2,
    carbohydrates_100g: 4.7,
    sugars_100g: 4.7,
    proteins_100g: 4.2,
    salt_100g: 0.13,
  },
};

describe('Open Food Facts exact-GTIN lookup', () => {
  it('maps a record to verbatim registry facts in the record language, basis kept', () => {
    const facts = lookupFactsFromOpenFoodFactsProduct(
      RECORD,
      '5903767004470',
      'https://world.openfoodfacts.org/product/5903767004470',
      '2026-09-06T00:00:00.000Z',
    );
    const byField = Object.fromEntries(facts.map((f) => [f.field, f.value]));
    expect(byField).toMatchObject({
      productName: 'Jogurt naturalny 3%',
      brand: 'Fruvita',
      netQuantity: '400 g',
      productCategory: 'dairies / fermented foods / yogurts',
      ingredients: 'mleko pasteryzowane, żywe kultury bakterii jogurtowych',
      allergens: 'milk',
      nutritionBasis: 'per 100 g',
      energyKcal: '61',
      fat: '3',
      carbohydrate: '4.7',
      sugars: '4.7',
      protein: '4.2',
      salt: '0.13',
    });
    expect(facts.every((f) => f.sourceAuthorityClass === 'STRUCTURED_PRODUCT_DATABASE')).toBe(true);
    expect(facts.every((f) => f.evidenceSource === 'barcode_registry')).toBe(true);
    expect(facts.every((f) => f.sourceUrl.endsWith('/product/5903767004470'))).toBe(true);
  });

  it('keeps a per-100 ml declaration as per 100 ml and drops numbers without a basis', () => {
    const drink = lookupFactsFromOpenFoodFactsProduct(
      { ...RECORD, nutrition_data_per: '100ml' },
      '5903767004470',
      'https://world.openfoodfacts.org/product/5903767004470',
    );
    expect(drink.find((f) => f.field === 'nutritionBasis')?.value).toBe('per 100 ml');
    const noBasis = lookupFactsFromOpenFoodFactsProduct(
      { ...RECORD, nutrition_data_per: 'serving' },
      '5903767004470',
      'https://world.openfoodfacts.org/product/5903767004470',
    );
    expect(noBasis.some((f) => f.field === 'fat')).toBe(false);
    expect(noBasis.some((f) => f.field === 'productName')).toBe(true);
  });

  it('builds a scan result whose identity and nutrition come from the registry evidence', () => {
    const facts = lookupFactsFromOpenFoodFactsProduct(
      RECORD,
      '5903767004470',
      'https://world.openfoodfacts.org/product/5903767004470',
    );
    const result = scanResultFromLookupFacts(facts)!;
    expect(result).not.toBeNull();
    const identity = result['identity'] as Record<string, unknown>;
    expect(identity['displayName']).toBe('Jogurt naturalny 3%');
    expect(identity['brand']).toBe('Fruvita');
    const nutrition = result['nutrition'] as Record<string, unknown>;
    expect(nutrition).toMatchObject({
      basis: 'per_100g',
      fat: 3,
      sugars: 4.7,
      protein: 4.2,
      salt: 0.13,
    });
    expect(result['ingredientsText']).toContain('mleko pasteryzowane');
    const sources = result['externalSources'] as { sourceType: string; fieldsUsed: string[] }[];
    expect(sources[0]?.sourceType).toBe('barcode_registry');
    expect(sources[0]?.fieldsUsed).toEqual(
      expect.arrayContaining([
        'identity.displayName',
        'identity.brand',
        'nutrition.fat',
        'ingredientsText',
      ]),
    );
  });

  it('answers null for an unknown code, a slow registry or a malformed record — never throws', async () => {
    const notFound = await lookupOpenFoodFactsFacts('4006381333931', {
      fetchImpl: (async () => new Response('{"status":0}', { status: 404 })) as typeof fetch,
    });
    expect(notFound).toBeNull();
    const slow = await lookupOpenFoodFactsFacts('4006381333931', {
      timeoutMs: 20,
      fetchImpl: ((_: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as typeof fetch,
    });
    expect(slow).toBeNull();
    const found = await lookupOpenFoodFactsFacts('5903767004470', {
      fetchImpl: (async () =>
        new Response(JSON.stringify({ status: 1, product: RECORD }), {
          status: 200,
        })) as typeof fetch,
    });
    expect(found?.provider).toBe('openfoodfacts');
    expect(found?.fields).toEqual(
      expect.arrayContaining(['productName', 'brand', 'fat', 'ingredients']),
    );
    const invalid = await lookupOpenFoodFactsFacts('12ab', {});
    expect(invalid).toBeNull();
  });
});
