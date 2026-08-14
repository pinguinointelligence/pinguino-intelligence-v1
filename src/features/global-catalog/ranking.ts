import type { CatalogMarketPreferences, CatalogProductSearchHit } from './contracts';
import { canonicalFamilyFor, normalizeCatalogText } from './normalization';

export type CatalogPickerContext = 'base' | 'topping';

export interface RankedCatalogHit extends CatalogProductSearchHit {
  relevance: number;
  group:
    | 'favorites_recent'
    | 'pi_base'
    | 'verified_markets'
    | 'manual'
    | 'global'
    | 'blocked';
}

function relevanceFor(hit: CatalogProductSearchHit, query: string, context: CatalogPickerContext): number {
  const normalized = normalizeCatalogText(query);
  if (!normalized) return 1;
  const family = canonicalFamilyFor(query);
  const fields = [hit.displayName, hit.originalName, hit.brand, hit.canonicalFamily, hit.category, ...hit.aliases, ...hit.eans]
    .map((value) => normalizeCatalogText(value ?? ''));
  let score = 0;
  if (fields.some((value) => value === normalized)) score = 100;
  else if (family && hit.canonicalFamily === family) score = 92;
  else if (fields.some((value) => value.startsWith(normalized))) score = 80;
  else if (fields.some((value) => value.includes(normalized))) score = 65;
  // Context can order relevant matches, but it must never make an unrelated
  // favourite/product appear for a non-empty query.
  if (score > 0 && context === 'base') {
    if (hit.entityKind === 'pi_base') score += 18;
    if (hit.usableInBase) score += 10;
    if (/soda|candy|beverage|drink|decoration/.test(normalizeCatalogText(`${hit.category ?? ''} ${hit.displayName}`))) score -= 30;
  } else if (score > 0 && context === 'topping' && hit.usableAsTopping) score += 8;
  return Math.max(0, score);
}

export function catalogGroupFor(hit: CatalogProductSearchHit, preferences: CatalogMarketPreferences): RankedCatalogHit['group'] {
  if (hit.status === 'blocked') return 'blocked';
  if (hit.favorite || hit.recentlyUsedAt) return 'favorites_recent';
  if (hit.entityKind === 'pi_base') return 'pi_base';
  const markets = new Set([preferences.primaryMarket, ...preferences.additionalMarkets].filter(Boolean));
  if (hit.status === 'verified' && hit.markets.some((market) => markets.has(market))) return 'verified_markets';
  if (hit.status === 'manual_unverified') return 'manual';
  return 'global';
}

/** The server RPC is the relevance authority. This presentation adapter only
 * attaches headings and preserves the exact server order; it never drops or
 * re-ranks multilingual/typo hits. */
export function preserveServerProductRank(
  hits: readonly CatalogProductSearchHit[],
  preferences: CatalogMarketPreferences,
): RankedCatalogHit[] {
  return hits.map((hit) => ({
    ...hit,
    relevance: hit.relevance ?? 0,
    group: catalogGroupFor(hit, preferences),
  }));
}

export function rankCatalogHits(input: {
  hits: readonly CatalogProductSearchHit[];
  query: string;
  context: CatalogPickerContext;
  preferences: CatalogMarketPreferences;
  favoritesOnly?: boolean;
  selectedMarkets?: readonly string[];
  retailer?: string | null;
}): RankedCatalogHit[] {
  const selected = new Set(input.selectedMarkets ?? []);
  const marketPriority = (hit: CatalogProductSearchHit): number => {
    if (input.preferences.primaryMarket && hit.markets.includes(input.preferences.primaryMarket)) return 2;
    if (hit.markets.some((market) => input.preferences.additionalMarkets.includes(market))) return 1;
    return 0;
  };
  const retailerPriority = (hit: CatalogProductSearchHit): number =>
    hit.retailers.some((retailer) => input.preferences.preferredRetailers.includes(retailer)) ? 1 : 0;
  return input.hits
    .filter((hit) => !input.favoritesOnly || hit.favorite)
    // PINGÜINO Base references are global scientific identities. They never
    // disappear because an account selected a commercial market.
    .filter((hit) => hit.entityKind === 'pi_base' || selected.size === 0 || hit.markets.some((market) => selected.has(market)))
    .filter((hit) => !input.retailer || hit.retailers.includes(input.retailer))
    .map((hit) => ({ ...hit, relevance: relevanceFor(hit, input.query, input.context), group: catalogGroupFor(hit, input.preferences) }))
    .filter((hit) => hit.relevance > 0)
    .sort((a, b) =>
      b.relevance - a.relevance ||
      Number(b.favorite) - Number(a.favorite) ||
      Number(Boolean(b.recentlyUsedAt)) - Number(Boolean(a.recentlyUsedAt)) ||
      marketPriority(b) - marketPriority(a) ||
      retailerPriority(b) - retailerPriority(a) ||
      Number(b.status === 'verified') - Number(a.status === 'verified') ||
      a.displayName.localeCompare(b.displayName),
    );
}
