/**
 * §34/§110 — the Community side of matching.
 *
 * A thin call onto the SECURITY DEFINER match oracles: `gellatti_match_community_top100_v2`
 * (one request per idea — every requested ingredient is a group of its approved forms)
 * and, while v2 is not deployed, `…_v1` (one id set per request). The strict §32 rule
 * (every requested canonical identity present) is decided INSIDE the database, because
 * the public Community card carries no ingredients and the owner is explicit that a
 * title cannot be the sole proof.
 *
 * GRAM BOUNDARY: the oracle returns public card data and ingredient NAMES. Recipe
 * composition is public in Gellatti; exact grams are not, and no gram, ratio or
 * mass ordering crosses this boundary. Gram visibility remains entirely the existing
 * entitlement authority's business — nothing here decides it.
 *
 * RANKING: `rank` is the position the existing `gellatti_top_recipes_v1` gave the
 * publication. It is carried through untouched; this module scores nothing.
 */
import {
  matchCommunityTop100GroupRows,
  matchCommunityTop100Rows,
  type CommunityMatchRow,
} from '@/services/communityMatch';
import type { IntentProfile } from '../homeIntentParsing';
import type { RecipeCandidate } from '../homeRecipeMatching';

/** How the profile is spelled in `community_publications.category`. */
const CATEGORY_BY_PROFILE: Readonly<Record<IntentProfile, string>> = {
  gelato: 'Gelato',
  sorbet: 'Sorbet',
  protein: 'Protein',
  vegan: 'Vegan',
};

const categoryOf = (profile: IntentProfile | null): string | null =>
  profile === null ? null : CATEGORY_BY_PROFILE[profile];

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
 * One oracle row in the feature's candidate shape. `ingredientIds` are the requested
 * identities the oracle proved present — re-stated, never re-derived.
 */
function toCommunityMatch(
  row: CommunityMatchRow,
  profile: IntentProfile | null,
  ingredientIds: readonly string[],
): CommunityMatch {
  return {
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
      profile: profile ?? 'gelato',
      // The oracle proved containment server-side; the requested identities are
      // present by construction, so the client re-states them rather than
      // re-deriving a list it was deliberately not given.
      ingredients: ingredientIds.map((productId) => ({
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
  };
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
    category: categoryOf(input.profile),
    limit: input.limit,
  });

  return rows.map((row: CommunityMatchRow) =>
    toCommunityMatch(row, input.profile, input.ingredientIds),
  );
}

/** A v2 match: which of the requested ids (of any group) the publication contains. */
export interface CommunityFormMatch extends CommunityMatch {
  /** In request order: group by group, each group in its approved order. */
  readonly matchedIds: readonly string[];
}

export type CommunityFormSearch =
  /** The oracle answered the WHOLE request. `rejected` answered cards were not rendered. */
  | {
      readonly kind: 'ok';
      readonly matches: readonly CommunityFormMatch[];
      readonly rejected: number;
    }
  /** v2 does not exist here yet — the caller may ask v1 instead. */
  | { readonly kind: 'unavailable' }
  /** Nothing is known about the match: never „no match”. */
  | { readonly kind: 'error'; readonly reason: 'timeout' | 'failed' };

/**
 * ONE oracle request for a whole idea: AND between `groups`, OR inside a group.
 *
 * A card whose `matched_ids` leave a group unanswered is not a proven §32 match and is
 * rejected like any other malformed card — never rendered, and never silently lost:
 * `rejected` tells the caller that what it can show is not the whole answer.
 */
export async function matchCommunityTop100Groups(input: {
  readonly groups: readonly (readonly string[])[];
  readonly profile: IntentProfile | null;
  readonly limit?: number;
}): Promise<CommunityFormSearch> {
  const outcome = await matchCommunityTop100GroupRows({
    groups: input.groups,
    category: categoryOf(input.profile),
    limit: input.limit,
  });
  if (outcome.kind === 'unavailable') return { kind: 'unavailable' };
  if (outcome.kind === 'error') {
    return { kind: 'error', reason: outcome.reason === 'timeout' ? 'timeout' : 'failed' };
  }
  let rejected = outcome.rejected;
  const matches: CommunityFormMatch[] = [];
  for (const row of outcome.rows) {
    const contained = new Set(row.matched_ids);
    // Per group, the first approved form the publication contains — the form that answered.
    const answered = input.groups.map((group) => group.find((id) => contained.has(id)));
    if (answered.some((id) => id === undefined)) {
      rejected += 1;
      console.warn('[GELLATTI] communityMatch.v2: card dropped — a group has no matched id');
      continue;
    }
    matches.push({
      ...toCommunityMatch(row, input.profile, answered as string[]),
      matchedIds: [...new Set(input.groups.flat().filter((id) => contained.has(id)))],
    });
  }
  return { kind: 'ok', matches, rejected };
}
