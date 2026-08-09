/**
 * Complete flavor RECOMMENDATION — pure and deterministic.
 *
 * `Pokaż pasujące gotowe receptury` returns at most 6 inspirations, ranked
 * deterministically from existing metadata only (requested main + secondary
 * flavors, visible product type, internal chocolate intent, protein, Ninja Swirl
 * compat, ingredient overlap, popularity). There is NO fabricated match
 * percentage and NO fake scoring model — only honest, enumerable criteria.
 *
 * A vanilla query prioritizes vanilla; chocolate prioritizes chocolate;
 * chocolate + caramel prioritizes entries with BOTH. Unrelated records are never
 * returned just because their popularity is high — a flavored query only returns
 * entries that actually match a signal.
 */
import type { CustomerProductType } from '@/features/customer-flow/types';
import { FLAVOR_CATALOGUE } from './flavorCatalogue';
import type { FlavorCatalogueEntry } from './flavorCatalogueTypes';

export interface FlavorRecommendationQuery {
  /** Requested primary flavor (e.g. `chocolate`, `vanilla`, `strawberry`). */
  mainFlavor?: string;
  /** Requested secondary flavor (e.g. `caramel`). */
  secondaryFlavor?: string;
  /** Any additional requested flavors. */
  extraFlavors?: readonly string[];
  /** Visible product type the customer chose (`gelato` | `sorbet` | `vegan` | `protein`). */
  productType?: CustomerProductType;
  /** Internal chocolate intent (chocolate is never a visible customer type). */
  chocolateIntent?: boolean;
  /** Customer is targeting the Ninja Swirl device / serving mode. */
  ninjaSwirl?: boolean;
  /** Ingredients the customer mentioned — used for honest "similar ingredients" matches. */
  mainIngredients?: readonly string[];
}

/** Honest match labels — the customer-facing Polish wording, no percentages. */
export type FlavorRecommendationLabel =
  | 'closest_idea'
  | 'similar_flavor_profile'
  | 'matches_swirl'
  | 'chocolate_version'
  | 'similar_ingredients'
  | 'popular_inspiration';

/** Polish display strings for each honest label. */
export const FLAVOR_RECOMMENDATION_LABEL_PL: Readonly<Record<FlavorRecommendationLabel, string>> = {
  closest_idea: 'Najbliższa Twojemu pomysłowi',
  similar_flavor_profile: 'Podobny profil smakowy',
  matches_swirl: 'Pasuje do Ninja Swirl',
  chocolate_version: 'Wersja czekoladowa',
  similar_ingredients: 'Podobne składniki',
  popular_inspiration: 'Popularna inspiracja',
};

export interface FlavorRecommendation {
  entry: FlavorCatalogueEntry;
  label: FlavorRecommendationLabel;
  /** Concrete, enumerable reasons this entry matched — honest, never a score. */
  matchedOn: string[];
}

/** Max inspirations returned (the "5–6, max 6" rule). */
export const MAX_FLAVOR_RECOMMENDATIONS = 6;

const norm = (s: string): string => s.trim().toLowerCase();

interface ScoredEntry {
  entry: FlavorCatalogueEntry;
  score: number;
  matchedOn: string[];
}

function scoreEntry(query: FlavorRecommendationQuery, entry: FlavorCatalogueEntry): ScoredEntry {
  let score = 0;
  const matchedOn: string[] = [];
  const tags = new Set(entry.flavorTags);

  const main = query.mainFlavor !== undefined ? norm(query.mainFlavor) : undefined;
  if (main !== undefined && (tags.has(main) || entry.mainFlavorTag === main)) {
    score += 6;
    matchedOn.push('main_flavor');
  }
  if (query.secondaryFlavor !== undefined && tags.has(norm(query.secondaryFlavor))) {
    score += 3;
    matchedOn.push('secondary_flavor');
  }
  for (const extra of query.extraFlavors ?? []) {
    if (tags.has(norm(extra))) {
      score += 2;
      matchedOn.push(`extra_flavor:${norm(extra)}`);
    }
  }
  if (query.productType !== undefined && entry.supportedVisibleTypes.includes(query.productType)) {
    score += 2;
    matchedOn.push('product_type');
  }
  if (query.chocolateIntent === true && entry.internalProfiles.includes('chocolate_gelato')) {
    score += 3;
    matchedOn.push('chocolate_intent');
  }
  if (query.ninjaSwirl === true && entry.ninjaSwirlCompatible) {
    score += 2;
    matchedOn.push('swirl');
  }
  const ingredientSet = new Set(entry.mainIngredients.map(norm));
  for (const ingredient of query.mainIngredients ?? []) {
    if (ingredientSet.has(norm(ingredient))) {
      score += 1;
      matchedOn.push(`ingredient:${norm(ingredient)}`);
    }
  }
  return { entry, score, matchedOn };
}

/** True when the query carries at least one concrete matching signal. */
function queryHasSignal(query: FlavorRecommendationQuery): boolean {
  return (
    query.mainFlavor !== undefined ||
    query.secondaryFlavor !== undefined ||
    (query.extraFlavors !== undefined && query.extraFlavors.length > 0) ||
    query.productType !== undefined ||
    query.chocolateIntent === true ||
    query.ninjaSwirl === true ||
    (query.mainIngredients !== undefined && query.mainIngredients.length > 0)
  );
}

function labelFor(rankIndex: number, matchedOn: readonly string[]): FlavorRecommendationLabel {
  if (rankIndex === 0 && matchedOn.length > 0) return 'closest_idea';
  if (matchedOn.includes('swirl')) return 'matches_swirl';
  const flavorMatched = matchedOn.includes('main_flavor') || matchedOn.includes('secondary_flavor');
  if (matchedOn.includes('chocolate_intent') && !flavorMatched) return 'chocolate_version';
  if (flavorMatched || matchedOn.some((m) => m.startsWith('extra_flavor:'))) return 'similar_flavor_profile';
  if (matchedOn.some((m) => m.startsWith('ingredient:'))) return 'similar_ingredients';
  return 'popular_inspiration';
}

/**
 * Deterministic ordering: score desc, then popularity score desc, then popularity
 * rank asc, then flavor code asc. Fully stable, no randomness.
 */
function compareScored(a: ScoredEntry, b: ScoredEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.entry.popularityScore !== a.entry.popularityScore) {
    return b.entry.popularityScore - a.entry.popularityScore;
  }
  if (a.entry.popularityRank !== b.entry.popularityRank) {
    return a.entry.popularityRank - b.entry.popularityRank;
  }
  return a.entry.flavorCode.localeCompare(b.entry.flavorCode);
}

/**
 * Return up to 6 honest flavor inspirations for a query. When the query carries a
 * signal, only entries that actually match are returned (never padded with
 * unrelated popular records). An empty query returns the most popular
 * inspirations, honestly labelled `popular_inspiration`.
 */
export function recommendFlavorRecipes(
  query: FlavorRecommendationQuery,
  catalogue: readonly FlavorCatalogueEntry[] = FLAVOR_CATALOGUE,
): FlavorRecommendation[] {
  const hasSignal = queryHasSignal(query);
  const scored = catalogue
    .map((entry) => scoreEntry(query, entry))
    .filter((s) => (hasSignal ? s.score > 0 : true))
    .sort(compareScored)
    .slice(0, MAX_FLAVOR_RECOMMENDATIONS);

  return scored.map((s, index) => ({
    entry: s.entry,
    label: labelFor(index, s.matchedOn),
    matchedOn: s.matchedOn,
  }));
}
