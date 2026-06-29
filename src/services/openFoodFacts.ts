/**
 * Read-only, KEYLESS OpenFoodFacts lookup. The ONLY place a network call is made for OFF
 * enrichment; it delegates all shaping to the pure `parseOpenFoodFactsProduct` adapter.
 *
 * Boundaries: GET only; no API key / secret / auth header; never writes anything (no Supabase,
 * no product mutation). A 404 (unknown product) resolves to a found:false result, not an error.
 */
import {
  openFoodFactsUrl,
  parseOpenFoodFactsProduct,
  type OffProduct,
} from '@/data/products/openFoodFactsAdapter';

export async function fetchOpenFoodFactsProduct(ean: string): Promise<OffProduct> {
  const res = await fetch(openFoodFactsUrl(ean), { headers: { Accept: 'application/json' } });
  if (res.status === 404) return parseOpenFoodFactsProduct({ status: 0, code: ean });
  if (!res.ok) throw new Error(`OpenFoodFacts lookup failed (${res.status}).`);
  return parseOpenFoodFactsProduct(await res.json());
}
