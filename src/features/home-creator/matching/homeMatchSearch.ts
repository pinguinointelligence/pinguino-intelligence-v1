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
  approvedConceptOrder,
  conceptMembership,
  loadMapperConceptDefaults,
  loadMapperSearchRuntime,
  type MapperConceptScope,
} from '@/features/mapper-search-runtime';
import {
  decideMatch,
  matchRecipes,
  type ConceptLineMatcher,
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
  /**
   * Central concept membership, for requests that came from a generic idea. Absent →
   * identity only (§22), which is also what every §35 decision uses.
   */
  readonly conceptMatcher?: ConceptLineMatcher;
  /**
   * The APPROVED forms of a generic request („truskawka” → the frozen SA-03 order:
   * fresh, frozen, purees, dried). Alternative forms of ONE concept are an OR; different
   * requested ingredients stay an AND. Absent → the requested identity alone.
   */
  readonly formsFor?: (item: RequestedIngredient) => readonly string[];
}

/** The Community oracle proves containment for ONE id set, so forms are asked one set at a time. */
export const COMMUNITY_FORM_QUERY_LIMIT = 6;

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
    matchRecipes(officialCandidateCache, {
      requested: resolved,
      profile: query.profile,
      conceptMatcher: query.conceptMatcher,
    }),
  );
}

export interface ConceptMatchContext {
  /**
   * Membership of a recipe line's canonical identity, from the frozen Search release
   * (PI→concept links and lineage). Never a name: a line whose product has no concept
   * link does not belong to the concept, whatever it is called.
   */
  readonly matcher: ConceptLineMatcher;
  /** The frozen approved order of the concept for this recipe scope (default first). */
  readonly formsOf: (conceptKey: string, scope: MapperConceptScope | null) => readonly string[];
}

/** One load of the central authority both sides of matching read. */
export async function loadConceptMatchContext(): Promise<ConceptMatchContext> {
  const [runtime, defaults] = await Promise.all([
    loadMapperSearchRuntime(),
    loadMapperConceptDefaults(),
  ]);
  const member = conceptMembership(runtime.release);
  return {
    matcher: (line, conceptKey) => member(line.productId, conceptKey),
    formsOf: (conceptKey, scope) => {
      const decision = defaults.get(conceptKey);
      return decision ? approvedConceptOrder(decision, scope) : [];
    },
  };
}

/**
 * The id sets to ask the Community oracle for: the requested identities, then the same
 * request with ONE ingredient swapped for another approved form of its concept. Bounded,
 * because each set is one oracle call; the requested identities are always asked first.
 */
export function communityIdSets(
  resolved: readonly RequestedIngredient[],
  formsFor: HomeMatchQuery['formsFor'],
  limit = COMMUNITY_FORM_QUERY_LIMIT,
): readonly (readonly string[])[] {
  const base = resolved.map((item) => item.productId);
  const sets: string[][] = [base];
  if (!formsFor) return sets;
  outer: for (let index = 0; index < resolved.length; index += 1) {
    const item = resolved[index]!;
    if (item.conceptKey == null) continue;
    for (const form of formsFor(item)) {
      if (form === item.productId) continue;
      const next = [...base];
      next[index] = form;
      if (sets.some((set) => set.join('|') === next.join('|'))) continue;
      sets.push(next);
      if (sets.length >= limit) break outer;
    }
  }
  return sets;
}

/** The Community side alone: the strict match oracle over the current Top 100. */
export async function searchCommunityMatches(query: HomeMatchQuery): Promise<{
  readonly community: readonly RecipeMatch[];
  readonly communityMatches: readonly CommunityMatch[];
}> {
  const resolved = resolvedRequests(query);
  if (resolved.length === 0) return { community: [], communityMatches: [] };
  const answers = await Promise.all(
    communityIdSets(resolved, query.formsFor).map((ingredientIds) =>
      matchCommunityTop100({ ingredientIds, profile: query.profile }),
    ),
  );
  // One publication is one candidate however many forms reached it; the oracle's own
  // Top 100 rank still decides which single Community card is offered (§34).
  const byPublication = new Map<string, CommunityMatch>();
  for (const rows of answers) {
    for (const row of rows)
      if (!byPublication.has(row.publicationId)) byPublication.set(row.publicationId, row);
  }
  const communityMatches = [...byPublication.values()];
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
