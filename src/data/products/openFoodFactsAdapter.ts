/**
 * Pure parser for an OpenFoodFacts (OFF) product API response. OFF is a FREE, KEYLESS public
 * composition database — this module performs NO network call (the caller fetches; this only
 * shapes the JSON), so it stays pure + testable + secret-free. The result feeds the
 * source-ranking/conflict model (`productSourceRanking`) as a `public_composition_db` source.
 *
 *   - PURE: no DB, no service, no network, no secrets. Deterministic.
 *   - HONEST: missing nutriments stay null (never a fake 0); a not-found product → found:false.
 *   - No npac_value; no PAC/POD (OFF carries label nutrition only — never engine values).
 */
import type { EnrichmentSource } from './productSourceRanking';
import { toFiniteNumber } from './productMatcher';

export interface OffNutrition {
  fat_percent: number | null;
  saturated_fat_percent: number | null;
  carbohydrate_percent: number | null;
  total_sugars_percent: number | null;
  protein_percent: number | null;
  salt_percent: number | null;
  kcal_per_100g: number | null;
}

export interface OffProduct {
  found: boolean;
  ean: string | null;
  name: string | null;
  ingredients_text: string | null;
  nutrition: OffNutrition;
  /** Always the public-DB tier for source ranking (weaker than producer/retailer). */
  source: EnrichmentSource;
}

const EMPTY_NUTRITION: OffNutrition = {
  fat_percent: null,
  saturated_fat_percent: null,
  carbohydrate_percent: null,
  total_sugars_percent: null,
  protein_percent: null,
  salt_percent: null,
  kcal_per_100g: null,
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Parse an OFF API v2 product response (`{ status, code, product: { product_name,
 * ingredients_text, nutriments: { *_100g } } }`). Defensive: any missing field → null.
 */
export function parseOpenFoodFactsProduct(json: unknown): OffProduct {
  const root = (json ?? {}) as Record<string, unknown>;
  const found = root.status === 1 || root.status === '1';
  const product = (root.product ?? {}) as Record<string, unknown>;
  const n = (product.nutriments ?? {}) as Record<string, unknown>;
  if (!found) {
    return { found: false, ean: str(root.code), name: null, ingredients_text: null, nutrition: { ...EMPTY_NUTRITION }, source: 'public_composition_db' };
  }
  return {
    found: true,
    ean: str(root.code),
    name: str(product.product_name),
    ingredients_text: str(product.ingredients_text),
    nutrition: {
      fat_percent: toFiniteNumber(n['fat_100g']),
      saturated_fat_percent: toFiniteNumber(n['saturated-fat_100g']),
      carbohydrate_percent: toFiniteNumber(n['carbohydrates_100g']),
      total_sugars_percent: toFiniteNumber(n['sugars_100g']),
      protein_percent: toFiniteNumber(n['proteins_100g']),
      salt_percent: toFiniteNumber(n['salt_100g']),
      kcal_per_100g: toFiniteNumber(n['energy-kcal_100g']),
    },
    source: 'public_composition_db',
  };
}

/** The keyless, read-only OFF product URL for an EAN (the CALLER fetches it — no fetch here). */
export function openFoodFactsUrl(ean: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean.replace(/\D+/g, ''))}.json`;
}
