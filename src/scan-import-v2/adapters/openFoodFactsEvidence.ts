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
import {
  assessProductPublicationIdentity,
  type ProductPublicationIdentityEligibility,
} from '@/features/product-scanner/productPublicationEligibility';

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
  'nutrition_data_per',
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
  const nutritionBasis = str(product['nutrition_data_per']);
  if (/100\s*ml/i.test(nutritionBasis ?? '')) add('nutrition.basis', 'per_100ml');
  else if (/100\s*g/i.test(nutritionBasis ?? '')) add('nutrition.basis', 'per_100g');
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

const MEMO_TTL_MS = 5 * 60_000;

export function createOpenFoodFactsEvidencePort(
  opts: OpenFoodFactsOptions = {},
): ExternalEvidencePort {
  const base = (opts.baseUrl ?? 'https://world.openfoodfacts.org').replace(/\/$/, '');
  // one registry request per code: the flow shows the identity early and the pipeline reuses the answer
  const memo = new Map<string, { at: number; value: Promise<ExternalEvidence | null> }>();
  const lookup = async (code: string, now: number): Promise<ExternalEvidence | null> => {
    const f = opts.fetchImpl ?? globalThis.fetch;
    if (typeof f !== 'function') return null;
    const url = `${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS.join(',')}`;
    const res = await f(url, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`openfoodfacts_http_${res.status}`);
    const json = (await res.json()) as Obj;
    const product = json['product'];
    if (json['status'] !== 1 || !product || typeof product !== 'object') return null;
    return evidenceFromProduct(product as Obj, code, now, `${base}/product/${code}`);
  };
  return {
    async research(identity: CodeIdentity, ctx: RequestContext): Promise<ExternalEvidence | null> {
      const code = identity.canonicalGtin13;
      const hit = memo.get(code);
      if (hit && ctx.now - hit.at < MEMO_TTL_MS) return hit.value;
      const value = lookup(code, ctx.now).catch((error: unknown) => {
        memo.delete(code); // a failed lookup is not remembered
        throw error;
      });
      memo.set(code, { at: ctx.now, value });
      return value;
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
  /** Prefill only. It is automatic registry data and must never be sent as a customer confirmation. */
  productFields: Record<string, unknown>;
  automaticEvidence: {
    source: 'barcode_registry';
    exactGtin: string;
    sourceUrl: string | null;
    queriedAt: number;
    productFields: Record<string, unknown>;
  };
  publicationEligibility: ProductPublicationIdentityEligibility;
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
  const quantity = get('identity.quantity');
  const identity: Record<string, unknown> = { displayName };
  if (brand) identity['brand'] = brand;
  const productFields: Record<string, unknown> = { identity };
  const parsedQuantity = /(-?\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i.exec(quantity ?? '');
  if (parsedQuantity) {
    const netQuantity = Number(parsedQuantity[1]!.replace(',', '.'));
    if (Number.isFinite(netQuantity) && netQuantity > 0) {
      productFields['package'] = {
        netQuantity,
        unit: parsedQuantity[2]!.toLowerCase(),
        netQuantityText: quantity,
      };
    }
  }
  const nutrition: Record<string, unknown> = {};
  for (const { field } of NUTRIMENTS) {
    const v = get(field);
    if (v !== null && Number.isFinite(Number(v)))
      nutrition[field.replace('nutrition.', '')] = Number(v);
  }
  const basis = get('nutrition.basis');
  if (Object.keys(nutrition).length > 0) {
    // OFF's normalised `_100g` keys do not prove what the package declared. Only the registry's
    // explicit `nutrition_data_per` field may establish the basis.
    if (basis === 'per_100g' || basis === 'per_100ml') nutrition['basis'] = basis;
    productFields['nutrition'] = nutrition;
  }
  const ingredientsText = get('ingredientsText');
  if (ingredientsText) productFields['ingredientsText'] = ingredientsText;
  const allergensText = get('allergensText');
  if (allergensText) productFields['allergensText'] = allergensText;
  const sourceUrl = ev.facts[0]?.sourceUrl ?? null;
  const publicationEligibility = assessProductPublicationIdentity({
    displayName,
    brand,
    manufacturer: null,
    variant: null,
    productType: get('category.pnns') ?? get('category.tags'),
    fieldProvenance: {
      displayName: {
        source: 'barcode_registry',
        exactGtinMatch: true,
        sourceUrl,
      },
      brand: brand ? { source: 'barcode_registry', exactGtinMatch: true, sourceUrl } : undefined,
    },
  });
  return {
    displayName,
    brand,
    quantity,
    family: familyFromEvidence(ev),
    sourceUrl,
    productFields,
    automaticEvidence: {
      source: 'barcode_registry',
      exactGtin: ev.query,
      sourceUrl,
      queriedAt: ev.queriedAt,
      productFields,
    },
    publicationEligibility,
    hasNutrition:
      typeof nutrition['energyKcal'] === 'number' || typeof nutrition['fat'] === 'number',
    hasIngredients: Boolean(ingredientsText),
  };
}
