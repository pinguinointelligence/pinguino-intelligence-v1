/**
 * The server's FIRST source for an unknown GTIN: Open Food Facts by exact code. Verbatim facts,
 * the record's own language first, the declared basis kept (per 100 g vs per 100 ml), and the
 * scan result built from them carries the product's name and brand as registry evidence.
 */
import { describe, expect, it } from 'vitest';
import {
  allergensFromIngredients,
  looksLikeIngredientList,
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
    const result = scanResultFromLookupFacts(facts as unknown as Record<string, unknown>[])!;
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

describe('registry ingredient quality and allergen reading', () => {
  it('refuses a nutrition-table OCR posing as an ingredient list and keeps a real list', () => {
    expect(
      looksLikeIngredientList(
        '100 g proizvoda:/ 1 oo g bF6dÜkÈttzturvërtïba:/ Energiasisaldus:/ Energijska vrednost : Rasvad/ millest küllastunud rasvhapped/ od tega nasičene 2,1 g',
      ),
    ).toBe(false);
    expect(
      looksLikeIngredientList('Energia 1004 kJ / 240 kcal, tłuszcz 12 g, węglowodany 31 g'),
    ).toBe(false);
    expect(
      looksLikeIngredientList(
        'płatki owsiane 45%, cukier, olej rzepakowy, orzechy laskowe 8%, miód, sól, aromat',
      ),
    ).toBe(true);
    expect(looksLikeIngredientList('Składniki: mleko pasteryzowane, żywe kultury bakterii')).toBe(
      true,
    );
    expect(looksLikeIngredientList('n/a')).toBe(false);
  });

  it('reads the EU allergens the ingredient list names, in the label market language', () => {
    expect(
      allergensFromIngredients(
        'płatki owsiane 45%, cukier, olej rzepakowy, orzechy laskowe 8%, mleko w proszku, lecytyna sojowa, może zawierać sezam',
      ),
    ).toBe('mleko, gluten (jeczmien/zyto/owies), soja, orzechy, sezam');
    expect(
      allergensFromIngredients('sugar, cocoa butter, skimmed MILK powder, hazelnuts, wheat flour'),
    ).toBe('mleko, gluten (pszenica), orzechy');
    expect(allergensFromIngredients('woda, cukier, kwas cytrynowy, aromat')).toBeNull();
    expect(allergensFromIngredients(null)).toBeNull();
  });

  it('a record with a garbage ingredient text yields no ingredients and no allergens; tags still win when present', () => {
    const garbage = lookupFactsFromOpenFoodFactsProduct(
      {
        ...RECORD,
        ingredients_text_pl: undefined,
        ingredients_text:
          '100 g proizvoda:/ Energiasisaldus:/ Rasvad 12 g / od tega nasičene 2,1 g',
        allergens_tags: [],
      },
      '5900617002228',
      'https://world.openfoodfacts.org/product/5900617002228',
    );
    expect(garbage.some((f) => f.field === 'ingredients')).toBe(false);
    expect(garbage.some((f) => f.field === 'allergens')).toBe(false);
    const derived = lookupFactsFromOpenFoodFactsProduct(
      { ...RECORD, allergens_tags: [] },
      '5903767004470',
      'https://world.openfoodfacts.org/product/5903767004470',
    );
    expect(derived.find((f) => f.field === 'allergens')?.value).toBe('mleko');
  });
});
