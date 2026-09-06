/**
 * Open Food Facts by exact GTIN — the FIRST source the server consults for a code the
 * catalogue does not know (owner direction 2026-09-06: "najpierw pobierz z internetu i
 * dostępnych źródeł wszystko, co da się znaleźć").
 *
 * A structured registry answers in well under a second, needs no key and no model, and
 * its record names the product, the brand, the ingredient list and the nutrition table
 * with its own basis (per 100 g or per 100 ml). Everything it returns is a verbatim fact
 * carrying the record URL and the registry authority class; nothing is inferred here.
 * The model-driven web research then runs only for what the registry did not carry.
 */

import {
  allergensFromIngredients,
  looksLikeIngredientList,
} from '../../../src/features/product-intelligence/labelStatements.ts';

export { allergensFromIngredients, looksLikeIngredientList };

export const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org';

/** the registry fields the lookup asks for — bounded on purpose */
export const OPEN_FOOD_FACTS_FIELDS = [
  'code',
  'lang',
  'product_name',
  'product_name_pl',
  'product_name_en',
  'product_name_de',
  'product_name_es',
  'product_name_fr',
  'product_name_it',
  'generic_name',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'categories_tags',
  'ingredients_text',
  'ingredients_text_pl',
  'ingredients_text_en',
  'ingredients_text_de',
  'ingredients_text_es',
  'ingredients_text_fr',
  'ingredients_text_it',
  'allergens_tags',
  'nutrition_data_per',
  'nutriments',
] as const;

/** one lookup fact in exactly the shape the scanner's research already returns */
export interface RegistryLookupFact {
  field: string;
  value: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE';
  evidenceSource: 'barcode_registry';
  retrievedAt: string;
}

export interface RegistryLookup {
  provider: 'openfoodfacts';
  sourceUrl: string;
  facts: RegistryLookupFact[];
  /** which lookup fields the record carried */
  fields: string[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const firstStr = (o: Obj, keys: readonly string[]): string | null => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return null;
};

const NUTRIMENTS: readonly { off: string; field: string }[] = [
  { off: 'energy-kj_100g', field: 'energyKj' },
  { off: 'energy-kcal_100g', field: 'energyKcal' },
  { off: 'fat_100g', field: 'fat' },
  { off: 'saturated-fat_100g', field: 'saturatedFat' },
  { off: 'carbohydrates_100g', field: 'carbohydrate' },
  { off: 'sugars_100g', field: 'sugars' },
  { off: 'fiber_100g', field: 'fiber' },
  { off: 'proteins_100g', field: 'protein' },
  { off: 'salt_100g', field: 'salt' },
];

/** the record's own language first (a Polish pack is described in Polish), then the fallbacks */
const localized = (product: Obj, base: string): string | null => {
  const lang = str(product['lang']);
  const keys = [
    ...(lang ? [`${base}_${lang}`] : []),
    base,
    `${base}_pl`,
    `${base}_en`,
    `${base}_de`,
    `${base}_es`,
    `${base}_fr`,
    `${base}_it`,
  ];
  return firstStr(product, keys);
};

/** raw registry record → lookup facts; every fact cites the record URL */
export function lookupFactsFromOpenFoodFactsProduct(
  product: Obj,
  code: string,
  sourceUrl: string,
  retrievedAt: string = new Date().toISOString(),
): RegistryLookupFact[] {
  const facts: RegistryLookupFact[] = [];
  const add = (field: string, value: string | null) => {
    if (!value) return;
    facts.push({
      field,
      value,
      sourceUrl,
      sourceDomain: 'world.openfoodfacts.org',
      sourceTitle: `Open Food Facts · ${code}`,
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
      evidenceSource: 'barcode_registry',
      retrievedAt,
    });
  };
  add('productName', localized(product, 'product_name') ?? str(product['generic_name']));
  const brands = str(product['brands']);
  add('brand', brands ? (brands.split(',')[0]?.trim() ?? null) : null);
  const quantity = str(product['quantity']);
  const productQuantity = product['product_quantity'];
  const unit = str(product['product_quantity_unit']);
  add(
    'netQuantity',
    quantity ??
      (typeof productQuantity === 'number' && Number.isFinite(productQuantity) && unit
        ? `${productQuantity} ${unit}`
        : null),
  );
  const tags = Array.isArray(product['categories_tags'])
    ? (product['categories_tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  if (tags.length > 0) {
    // the most specific registry categories, as words ("en:dark-chocolates" → "dark chocolates")
    add(
      'productCategory',
      tags
        .slice(-3)
        .map((t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
        .join(' / '),
    );
  }
  const ingredients = localized(product, 'ingredients_text');
  const ingredientsUsable = looksLikeIngredientList(ingredients);
  add('ingredients', ingredientsUsable ? ingredients : null);
  const allergens = Array.isArray(product['allergens_tags'])
    ? (product['allergens_tags'] as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
    : [];
  // the registry's allergen tags first; otherwise the allergens the ingredient list itself names
  add(
    'allergens',
    allergens.length > 0
      ? allergens.join(', ')
      : ingredientsUsable
        ? allergensFromIngredients(ingredients)
        : null,
  );
  const nutriments = obj(product['nutriments']);
  const numbers = NUTRIMENTS.filter(({ off }) => {
    const v = nutriments[off];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  });
  if (numbers.length > 0) {
    // OFF's `_100g` nutriments follow the record's declared basis: per 100 g or per 100 ml.
    // Without a declared basis the numbers are not a measurement and are not returned.
    const per = str(product['nutrition_data_per'])?.toLowerCase().replace(/\s+/g, '') ?? '100g';
    const basis = per.includes('100ml') ? 'per 100 ml' : per.includes('100g') ? 'per 100 g' : null;
    if (basis) {
      add('nutritionBasis', basis);
      for (const { off, field } of numbers) add(field, String(nutriments[off]));
    }
  }
  return facts;
}

export interface OpenFoodFactsLookupOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** a registry that does not answer quickly must not hold the customer; default 2.5 s */
  timeoutMs?: number;
}

/** exact GTIN → registry facts, or null when the registry has no record (or does not answer in time) */
export async function lookupOpenFoodFactsFacts(
  gtin: string,
  options: OpenFoodFactsLookupOptions = {},
): Promise<RegistryLookup | null> {
  const code = gtin.replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(code)) return null;
  const f = options.fetchImpl ?? globalThis.fetch;
  if (typeof f !== 'function') return null;
  const base = (options.baseUrl ?? OPEN_FOOD_FACTS_BASE_URL).replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);
  try {
    const url = `${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OPEN_FOOD_FACTS_FIELDS.join(',')}`;
    const res = await f(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Gellatti-Scanner/1.0 (staging)' },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = obj(await res.json());
    const product = json['product'];
    if (json['status'] !== 1 || !product || typeof product !== 'object') return null;
    const sourceUrl = `${base}/product/${code}`;
    const facts = lookupFactsFromOpenFoodFactsProduct(product as Obj, code, sourceUrl);
    if (facts.length === 0) return null;
    return {
      provider: 'openfoodfacts',
      sourceUrl,
      facts,
      fields: [...new Set(facts.map((fact) => fact.field))],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
