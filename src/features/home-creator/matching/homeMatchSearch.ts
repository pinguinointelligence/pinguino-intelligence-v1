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
 *   • OFFICIAL  — client-side templates, so the strict rule runs client-side through
 *                 the existing `matchRecipes`.
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
import { officialCandidatesFor } from './officialLibraryCandidates';

export interface HomeMatchQuery {
  readonly requested: readonly RequestedIngredient[];
  readonly profile: IntentProfile | null;
  /** From the SAME authority that guards opening an owner-review template. */
  readonly canOpenOwnerReview: boolean;
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

export async function searchExistingRecipes(query: HomeMatchQuery): Promise<HomeMatchResult> {
  // §22: only RESOLVED identities may drive matching. An unresolved chip is not a
  // weaker constraint — it is not a constraint, and matching on it would be matching
  // on guessed text.
  const resolved = query.requested.filter((item) => item.productId.trim() !== '');
  if (resolved.length === 0) return NO_MATCH;

  const official: readonly RecipeMatch[] = matchRecipes(
    officialCandidatesFor(query.canOpenOwnerReview),
    { requested: resolved, profile: query.profile },
  );

  const communityMatches = await matchCommunityTop100({
    ingredientIds: resolved.map((item) => item.productId),
    profile: query.profile,
  });

  // The oracle already proved containment, so these are matches by construction.
  // `alsoIncludes` comes from the oracle (public names), not from a client diff of a
  // formulation the client was never given.
  const community: readonly RecipeMatch[] = communityMatches.map((match) => ({
    candidate: match.candidate,
    alsoIncludes: match.alsoIncludes,
  }));

  return { decision: decideMatch({ official, community }), communityMatches };
}
