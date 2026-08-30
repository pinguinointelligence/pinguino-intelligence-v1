/**
 * §34/§110 — the Community side of matching.
 *
 * A thin call onto `gellatti_match_community_top100_v1`, the SECURITY DEFINER match
 * oracle. The strict §32 rule (every requested canonical identity present) is decided
 * INSIDE the database, because the public Community card carries no ingredients and
 * the owner is explicit that a title cannot be the sole proof.
 *
 * GRAM BOUNDARY: the oracle returns public card data and ingredient NAMES. Recipe
 * composition is public in Gellatti; exact grams are not, and no gram, ratio or
 * mass ordering crosses this boundary. Gram visibility remains entirely the existing
 * entitlement authority's business — nothing here decides it.
 *
 * RANKING: `rank` is the position the existing `gellatti_top_recipes_v1` gave the
 * publication. It is carried through untouched; this module scores nothing.
 */
import { matchCommunityTop100Rows, type CommunityMatchRow } from '@/services/communityMatch';
import type { IntentProfile } from '../homeIntentParsing';
import type { RecipeCandidate } from '../homeRecipeMatching';

/** How the profile is spelled in `community_publications.category`. */
const CATEGORY_BY_PROFILE: Readonly<Record<IntentProfile, string>> = {
  gelato: 'Gelato',
  sorbet: 'Sorbet',
  protein: 'Protein',
  vegan: 'Vegan',
};

export interface CommunityMatch {
  readonly candidate: RecipeCandidate;
  /** §36 — public ingredient names the user did not ask for. Never a quantity. */
  readonly alsoIncludes: readonly string[];
  readonly slug: string;
  readonly publicationId: string;
  /** The creator handle — needed to address the canonical derivation source. */
  readonly handle: string;
  readonly title: string;
  readonly creatorDisplayName: string;
}

/**
 * Map the oracle's public rows into the feature's candidate shape.
 * The IO itself lives in `@/services/communityMatch`; the boundary guard keeps every
 * backend client out of `features/**`, so this module is pure mapping.
 */
export async function matchCommunityTop100(input: {
  readonly ingredientIds: readonly string[];
  readonly profile: IntentProfile | null;
  readonly limit?: number;
}): Promise<readonly CommunityMatch[]> {
  const rows = await matchCommunityTop100Rows({
    ingredientIds: input.ingredientIds,
    category: input.profile === null ? null : CATEGORY_BY_PROFILE[input.profile],
    limit: input.limit,
  });

  return rows.map((row: CommunityMatchRow) => ({
    publicationId: row.publication_id,
    slug: row.slug,
    handle: row.creator?.handle ?? '',
    title: row.title,
    creatorDisplayName: row.creator?.display_name ?? '',
    alsoIncludes: row.also_includes ?? [],
    candidate: {
      id: row.publication_id,
      title: row.title,
      source: 'community',
      // The oracle already filtered by category when a profile was known.
      profile: input.profile ?? 'gelato',
      // The oracle proved containment server-side; the requested identities are
      // present by construction, so the client re-states them rather than
      // re-deriving a list it was deliberately not given.
      ingredients: input.ingredientIds.map((productId) => ({
        productId,
        role: 'ingredient' as const,
        displayName: productId,
      })),
      imageUrl: row.image_url,
      authorName: row.creator?.display_name ?? null,
      rank: row.rank,
      // §38: the ORIGINAL creator, straight from the canonical card authority.
      originalCreatorName: row.based_on?.creator_display_name ?? null,
    },
  }));
}
