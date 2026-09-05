/**
 * Exact-GTIN registry evidence: Open Food Facts, queried by the confirmed code only (never by text).
 *
 * This is the "strong exact-GTIN internet resolution" that runs FIRST for a code the catalogue does not
 * know (owner, 2026-09-05): when the registry identifies name + brand, that identity is used — the customer
 * is not asked to pick a generic category. Facts are returned verbatim with their source URL; nothing here
 * creates a product. The public API allows browser calls (CORS) and needs no key.
 */
import type {
  CodeIdentity,
  ExternalEvidence,
  ExternalEvidencePort,
  RequestContext,
} from '../contracts';
import type { CustomerFamily } from '../discovery/contracts';

export const OPEN_FOOD_FACTS_PROVIDER = 'openfoodfacts';

const FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'product_name_en',
  'product_name_pl',
  'product_name_de',
  'product_name_fr',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'product_quantity_unit',
  'categories_tags',
  'pnns_groups_1',
  'pnns_groups_2',
  'food_groups_tags',
  'ingredients_text',
  'ingredients_text_es',
  'ingredients_text_en',
  'ingredients_text_pl',
  'allergens_tags',
  'nutriments',
  'image_front_small_url',
];

const NUTRIMENTS: readonly { off: string; field: string }[] = [
  { off: 'energy-kcal_100g', field: 'nutrition.energyKcal' },
  { off: 'energy-kj_100g', field: 'nutrition.energyKj' },
  { off: 'fat_100g', field: 'nutrition.fat' },
  { off: 'saturated-fat_100g', field: 'nutrition.saturatedFat' },
  { off: 'carbohydrates_100g', field: 'nutrition.carbohydrate' },
  { off: 'sugars_100g', field: 'nutrition.sugars' },
  { off: 'proteins_100g', field: 'nutrition.protein' },
  { off: 'salt_100g', field: 'nutrition.salt' },
  { off: 'fiber_100g', field: 'nutrition.fibre' },
];

export interface OpenFoodFactsOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const firstStr = (o: Obj, keys: readonly string[]): string | null => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return null;
};

/** raw registry record → verbatim facts (authority 'barcode_registry'), every fact carries the source URL */
export function evidenceFromProduct(
  product: Obj,
  code: string,
  queriedAt: number,
  sourceUrl: string,
): ExternalEvidence {
  const facts: { field: string; value: string; sourceUrl: string | null; authority: string }[] = [];
  const add = (field: string, value: string | null) => {
    if (value) facts.push({ field, value, sourceUrl, authority: 'barcode_registry' });
  };
  const name = firstStr(product, [
    'product_name',
    'product_name_es',
    'product_name_en',
    'product_name_pl',
    'product_name_de',
    'product_name_fr',
    'generic_name',
  ]);
  add('identity.displayName', name);
  const brands = str(product['brands']);
  add('identity.brand', brands ? (brands.split(',')[0]?.trim() ?? null) : null);
  add('identity.quantity', str(product['quantity']));
  add('identity.servingSize', str(product['serving_size']));
  add('identity.quantityUnit', str(product['product_quantity_unit']));
  const tags = Array.isArray(product['categories_tags'])
    ? (product['categories_tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  add('category.tags', tags.length ? tags.join(';') : null);
  add('category.pnns', firstStr(product, ['pnns_groups_2', 'pnns_groups_1']));
  const groups = Array.isArray(product['food_groups_tags'])
    ? (product['food_groups_tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  add('category.foodGroups', groups.length ? groups.join(';') : null);
  add(
    'ingredientsText',
    firstStr(product, [
      'ingredients_text',
      'ingredients_text_es',
      'ingredients_text_en',
      'ingredients_text_pl',
    ]),
  );
  const allergens = Array.isArray(product['allergens_tags'])
    ? (product['allergens_tags'] as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
    : [];
  add('allergensText', allergens.length ? allergens.join(', ') : null);
  const n = (product['nutriments'] ?? {}) as Obj;
  for (const { off, field } of NUTRIMENTS) {
    const v = n[off];
    if (typeof v === 'number' && Number.isFinite(v)) add(field, String(v));
  }
  add('imageUrl', str(product['image_front_small_url']));
  const confidence = name && brands ? 0.9 : name ? 0.6 : 0.3;
  return { provider: OPEN_FOOD_FACTS_PROVIDER, queriedAt, query: code, facts, confidence };
}

export function createOpenFoodFactsEvidencePort(
  opts: OpenFoodFactsOptions = {},
): ExternalEvidencePort {
  const base = (opts.baseUrl ?? 'https://world.openfoodfacts.org').replace(/\/$/, '');
  return {
    async research(identity: CodeIdentity, ctx: RequestContext): Promise<ExternalEvidence | null> {
      const f = opts.fetchImpl ?? globalThis.fetch;
      if (typeof f !== 'function') return null;
      const code = identity.canonicalGtin13;
      const url = `${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS.join(',')}`;
      const res = await f(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`openfoodfacts_http_${res.status}`);
      const json = (await res.json()) as Obj;
      const product = json['product'];
      if (json['status'] !== 1 || !product || typeof product !== 'object') return null;
      return evidenceFromProduct(product as Obj, code, ctx.now, `${base}/product/${code}`);
    },
  };
}

/** what the registry evidence says about the product, in the shape the flow and finalize consume */
export interface ExactWebIdentity {
  displayName: string;
  brand: string | null;
  quantity: string | null;
  family: CustomerFamily | null;
  sourceUrl: string | null;
  /** finalize `confirmations.productFields` prefilled from the registry (identity, nutrition, ingredients, allergens) */
  productFields: Record<string, unknown>;
  hasNutrition: boolean;
  hasIngredients: boolean;
}

const FAMILY_RULES: readonly { test: RegExp; family: CustomerFamily }[] = [
  { test: /alcohol|beers?|wines?|spirits|liquors?/, family: 'alcohol' },
  { test: /cocoa|chocolate|cacao/, family: 'cocoa_chocolate' },
  {
    test: /nut-?butters?|nuts?\b|seeds?\b|almond|hazelnut|peanut|pistach|tahini/,
    family: 'nut_paste',
  },
  { test: /dair|milks?\b|creams?\b|yogurt|yoghurt|cheese|butter\b|kefir|whey/, family: 'dairy' },
  {
    test: /fruits?|berries|purees?|jams?|compotes?|vegetables?|citrus|banana|mango|strawberr/,
    family: 'fruit',
  },
  {
    test: /sweeteners?|sugars?\b|syrups?|honey|glucose|dextrose|fructose|molasses/,
    family: 'sweetener',
  },
  {
    test: /additives?|stabili[sz]ers?|thickeners?|emulsifiers?|gelling|pectin|guar|carrageenan|locust/,
    family: 'technical',
  },
  {
    test: /beverages?|drinks?|waters?\b|juices?|sodas?|lemonade|energy-?drink|sport/,
    family: 'beverage',
  },
];

export function familyFromEvidence(ev: ExternalEvidence): CustomerFamily | null {
  const get = (f: string) => ev.facts.find((x) => x.field === f)?.value ?? '';
  const categorical =
    `${get('category.tags')} ${get('category.pnns')} ${get('category.foodGroups')}`
      .toLowerCase()
      .trim();
  for (const rule of FAMILY_RULES)
    if (categorical && rule.test.test(categorical)) return rule.family;
  const unit =
    `${get('identity.quantityUnit')} ${get('identity.servingSize')} ${get('identity.quantity')}`.toLowerCase();
  if (/\b(ml|cl|l|litre|liter|bottle|can)\b/.test(unit)) return 'beverage';
  if (categorical) return 'other';
  const name = `${get('identity.displayName')} ${get('identity.brand')}`.toLowerCase();
  for (const rule of FAMILY_RULES) if (rule.test.test(name)) return rule.family;
  return null;
}

export function identityFromEvidence(
  ev: ExternalEvidence | null | undefined,
): ExactWebIdentity | null {
  if (!ev) return null;
  const get = (f: string) => ev.facts.find((x) => x.field === f)?.value ?? null;
  const displayName = get('identity.displayName');
  if (!displayName) return null;
  const brand = get('identity.brand');
  const identity: Record<string, unknown> = { displayName };
  if (brand) identity['brand'] = brand;
  const productFields: Record<string, unknown> = { identity };
  const nutrition: Record<string, unknown> = {};
  for (const { field } of NUTRIMENTS) {
    const v = get(field);
    if (v !== null && Number.isFinite(Number(v)))
      nutrition[field.replace('nutrition.', '')] = Number(v);
  }
  const perMl = /\b(ml|cl|l)\b/.test(
    `${get('identity.quantityUnit')} ${get('identity.quantity')}`.toLowerCase(),
  );
  if (Object.keys(nutrition).length > 0) {
    nutrition['basis'] = perMl ? 'per_100ml' : 'per_100g';
    productFields['nutrition'] = nutrition;
  }
  const ingredientsText = get('ingredientsText');
  if (ingredientsText) productFields['ingredientsText'] = ingredientsText;
  const allergensText = get('allergensText');
  if (allergensText) productFields['allergensText'] = allergensText;
  return {
    displayName,
    brand,
    quantity: get('identity.quantity'),
    family: familyFromEvidence(ev),
    sourceUrl: ev.facts[0]?.sourceUrl ?? null,
    productFields,
    hasNutrition:
      typeof nutrition['energyKcal'] === 'number' || typeof nutrition['fat'] === 'number',
    hasIngredients: Boolean(ingredientsText),
  };
}
