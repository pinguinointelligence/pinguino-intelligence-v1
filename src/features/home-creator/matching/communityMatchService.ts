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
import { supabase } from '@/lib/supabase/client';
import type { IntentProfile } from '../homeIntentParsing';
import type { RecipeCandidate } from '../homeRecipeMatching';

/** How the profile is spelled in `community_publications.category`. */
const CATEGORY_BY_PROFILE: Readonly<Record<IntentProfile, string>> = {
  gelato: 'Gelato',
  sorbet: 'Sorbet',
  protein: 'Protein',
  vegan: 'Vegan',
};

interface MatchOracleRow {
  publication_id: string;
  slug: string;
  title: string;
  image_url: string | null;
  category: string | null;
  rank: number;
  all_requested_present: boolean;
  also_includes: string[] | null;
  creator: { display_name?: string | null; handle?: string | null } | null;
  based_on: { creator_display_name?: string | null } | null;
}

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
 * Ask the oracle which Top 100 publications satisfy EVERY requested identity.
 * Returns `[]` on any failure — a matching outage must never block creation (§35:
 * no trustworthy match simply means no popup).
 */
export async function matchCommunityTop100(input: {
  readonly ingredientIds: readonly string[];
  readonly profile: IntentProfile | null;
  readonly limit?: number;
}): Promise<readonly CommunityMatch[]> {
  if (!supabase) return [];
  if (input.ingredientIds.length === 0) return [];

  const { data, error } = await supabase.rpc('gellatti_match_community_top100_v1', {
    p_ingredient_ids: [...input.ingredientIds],
    p_category: input.profile === null ? null : CATEGORY_BY_PROFILE[input.profile],
    p_limit: input.limit ?? 10,
  });
  if (error || !Array.isArray(data)) return [];

  return (data as MatchOracleRow[]).map((row) => ({
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
