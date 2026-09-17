/**
 * §32–§40 — the one place HOME asks "does this already exist?".
 *
 * It is deliberately thin. The DECISION rules already exist and are already tested
 * (`homeRecipeMatching.ts`, 18 cases): strict identity containment, `Also includes`,
 * stated-role respect, profile filter, "at most one Community candidate, the
 * highest-ranked", and the §35 auto-adopt/popup/create-my-own verdict. This module
 * only SOURCES candidates and hands them to those rules.
 *
 * Two sources, two very different shapes, one reason:
 *   • OFFICIAL  — the Gellatti Recipe Library ships with the app, so the strict rule runs
 *                 client-side through the existing `matchRecipes`.
 *   • COMMUNITY — the public card carries no ingredients, so the strict rule runs
 *                 inside the match oracle and arrives already satisfied.
 *
 * Nothing here scores popularity, and nothing here decides gram visibility.
 */
import {
  decideMatch,
  matchRecipes,
  type MatchDecision,
  type RecipeMatch,
  type RequestedIngredient,
} from '../homeRecipeMatching';
import type { IntentProfile } from '../homeIntentParsing';
import { matchCommunityTop100, type CommunityMatch } from './communityMatchService';
import { officialCandidates } from './officialLibraryCandidates';

export interface HomeMatchQuery {
  readonly requested: readonly RequestedIngredient[];
  readonly profile: IntentProfile | null;
}

export interface HomeMatchResult {
  readonly decision: MatchDecision;
  /** Kept so the popup can offer the canonical derive flow for a Community pick. */
  readonly communityMatches: readonly CommunityMatch[];
}

/** Nothing was asked for, or nothing matched → no popup, creation continues (§35). */
export const NO_MATCH: HomeMatchResult = Object.freeze({
  decision: { kind: 'create_my_own' } as MatchDecision,
  communityMatches: [],
});

/**
 * §36: the popup lists EVERY official exact match. They come closest first — the recipes
 * that add the fewest ingredients the customer did not ask for — and ties keep library order.
 */
export function closestOfficialMatches(matches: readonly RecipeMatch[]): readonly RecipeMatch[] {
  return [...matches].sort((left, right) => left.alsoIncludes.length - right.alsoIncludes.length);
}

/** §22: only RESOLVED identities may drive matching. */
const resolvedRequests = (query: HomeMatchQuery): readonly RequestedIngredient[] =>
  query.requested.filter((item) => item.productId.trim() !== '');

let officialCandidateCache: ReturnType<typeof officialCandidates> | null = null;

/**
 * The official side alone. Synchronous (the library ships with the app), so a matching
 * Gellatti card can appear while the Community oracle is still answering.
 */
export function searchOfficialMatches(query: HomeMatchQuery): readonly RecipeMatch[] {
  const resolved = resolvedRequests(query);
  if (resolved.length === 0) return [];
  // The library is deep-frozen, so its candidates are computed once per page.
  officialCandidateCache ??= officialCandidates();
  return closestOfficialMatches(
    matchRecipes(officialCandidateCache, { requested: resolved, profile: query.profile }),
  );
}

/** The Community side alone: the strict match oracle over the current Top 100. */
export async function searchCommunityMatches(query: HomeMatchQuery): Promise<{
  readonly community: readonly RecipeMatch[];
  readonly communityMatches: readonly CommunityMatch[];
}> {
  const resolved = resolvedRequests(query);
  if (resolved.length === 0) return { community: [], communityMatches: [] };
  const communityMatches = await matchCommunityTop100({
    ingredientIds: resolved.map((item) => item.productId),
    profile: query.profile,
  });
  // The oracle already proved containment, so these are matches by construction.
  // `alsoIncludes` comes from the oracle (public names), not from a client diff of a
  // formulation the client was never given.
  return {
    community: communityMatches.map((match) => ({
      candidate: match.candidate,
      alsoIncludes: match.alsoIncludes,
    })),
    communityMatches,
  };
}

export async function searchExistingRecipes(query: HomeMatchQuery): Promise<HomeMatchResult> {
  // §22: an unresolved chip is not a weaker constraint — it is not a constraint, and
  // matching on it would be matching on guessed text.
  if (resolvedRequests(query).length === 0) return NO_MATCH;
  const official = searchOfficialMatches(query);
  const { community, communityMatches } = await searchCommunityMatches(query);
  return { decision: decideMatch({ official, community }), communityMatches };
}
