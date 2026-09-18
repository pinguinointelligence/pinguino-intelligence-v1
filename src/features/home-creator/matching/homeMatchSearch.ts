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
 *                 inside the match oracle and arrives already satisfied. Owner
 *                 2026-09-18: ONE v2 request per idea (every requested ingredient is a
 *                 group of its approved forms); the bounded v1 enumeration only runs
 *                 while v2 does not exist on the backend.
 *
 * Nothing here scores popularity, and nothing here decides gram visibility.
 */
import {
  COMMUNITY_MATCH_V2_MAX_GROUPS,
  COMMUNITY_MATCH_V2_MAX_IDS,
} from '@/services/communityMatch';
import {
  approvedConceptOrder,
  conceptDiscoveryIndex,
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
import {
  matchCommunityTop100,
  matchCommunityTop100Groups,
  type CommunityMatch,
} from './communityMatchService';
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
  /** Customer-facing name of a product id, so a Community match can name the form it used. */
  readonly nameOf?: (piId: string) => string | null;
}

/**
 * FALLBACK ONLY (v2 not deployed): the v1 oracle proves containment for ONE id set, so an
 * AND of ORs is asked one combination at a time. The budget bounds the WORK, never the
 * MEANING: whatever was not asked is reported as such, so no result claims to be the best
 * of all matches.
 */
export const COMMUNITY_FORM_QUERY_LIMIT = 24;
/** How many of those sets are in flight at once. */
export const COMMUNITY_FORM_QUERY_CONCURRENCY = 6;

/**
 * Why a v2 search is not complete. „No Community match” is unproven in every case, so
 * §35 may not adopt automatically and a card may not claim to be the best one.
 */
export type CommunityCoverageGap =
  /** More ingredients than the oracle takes groups — nothing was sent, nothing truncated. */
  | 'too_many_ingredients'
  /** More approved forms than the oracle takes ids — nothing was sent, nothing truncated. */
  | 'too_many_forms'
  /** The oracle did not answer in time. */
  | 'oracle_timeout'
  /** The oracle failed or answered something that is not a card list. */
  | 'oracle_error'
  /** The oracle answered, but a card was dropped (quantity key, malformed, unproven). */
  | 'card_rejected';

export interface CommunitySearchCoverage {
  /** Oracle requests sent: 1 for v2, the id sets for the v1 fallback, 0 when none could be. */
  readonly asked: number;
  /** Every combination the AND of ORs has (the product of each ingredient's forms). */
  readonly combinations: number;
  /** The search did not cover every combination — nothing may claim to be the best match. */
  readonly partial: boolean;
  /**
   * Set on every partial v2 search. Absent when complete, and on the v1 fallback, whose
   * only gap is its query budget (unchanged from before v2).
   */
  readonly reason?: CommunityCoverageGap;
}

export const FULL_COMMUNITY_COVERAGE: CommunitySearchCoverage = Object.freeze({
  asked: 0,
  combinations: 0,
  partial: false,
});

export interface HomeMatchResult {
  readonly decision: MatchDecision;
  /** Kept so the popup can offer the canonical derive flow for a Community pick. */
  readonly communityMatches: readonly CommunityMatch[];
  readonly coverage: CommunitySearchCoverage;
}

/** Nothing was asked for, or nothing matched → no popup, creation continues (§35). */
export const NO_MATCH: HomeMatchResult = Object.freeze({
  decision: { kind: 'create_my_own' } as MatchDecision,
  communityMatches: [],
  coverage: FULL_COMMUNITY_COVERAGE,
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
  /** The customer-facing name of a Mapper product, for „Używa postaci: …”. */
  readonly nameOf: (piId: string) => string | null;
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
  const nameById = new Map(
    (runtime.release.mapperRows as ReadonlyArray<{ id: string; displayName?: string }>).map(
      (row) => [row.id, row.displayName ?? null],
    ),
  );
  // Owner-approved discovery links widen the SEARCH only: they are appended after the
  // frozen order and never consulted when a generic idea picks its product.
  const discovery = conceptDiscoveryIndex();
  return {
    nameOf: (piId) => nameById.get(piId) ?? null,
    matcher: (line, conceptKey) =>
      member(line.productId, conceptKey) ||
      (discovery.get(conceptKey)?.includes(line.productId) ?? false),
    formsOf: (conceptKey, scope) => {
      const decision = defaults.get(conceptKey);
      if (!decision) return [];
      const approved = approvedConceptOrder(decision, scope);
      const discovered = (discovery.get(conceptKey) ?? []).filter((id) => !approved.includes(id));
      return [...approved, ...discovered];
    },
  };
}

/**
 * The AND of ORs as groups: one group per requested ingredient — the requested identity
 * first, then its approved forms (the frozen order, then the owner-approved discovery
 * links). An exact product is a group of one. The v1 enumeration walks these same groups.
 */
export function communityFormGroups(
  resolved: readonly RequestedIngredient[],
  formsFor: HomeMatchQuery['formsFor'],
): readonly (readonly string[])[] {
  return resolved.map((item) => {
    const forms = item.conceptKey == null ? [] : (formsFor?.(item) ?? []);
    return [...new Set([item.productId, ...forms])];
  });
}

/** Why the oracle would refuse these groups, or null when it takes them whole. */
function groupLimitGap(groups: readonly (readonly string[])[]): CommunityCoverageGap | null {
  if (groups.length > COMMUNITY_MATCH_V2_MAX_GROUPS) return 'too_many_ingredients';
  const ids = groups.reduce((total, group) => total + group.length, 0);
  return ids > COMMUNITY_MATCH_V2_MAX_IDS ? 'too_many_forms' : null;
}

/**
 * v2 — the forms that answered, for „Używa postaci: …”: per ingredient, every approved
 * form the publication contains, in the approved order. An ingredient the publication
 * contains exactly as requested says nothing — the customer named that one.
 */
function answeringForms(
  groups: readonly (readonly string[])[],
  matchedIds: readonly string[],
): readonly string[] {
  const matched = new Set(matchedIds);
  const forms = new Set<string>();
  for (const group of groups) {
    const [requested] = group;
    if (requested === undefined || matched.has(requested)) continue;
    for (const id of group) if (matched.has(id)) forms.add(id);
  }
  return [...forms];
}

export interface CommunityIdSets {
  /** The combinations actually asked, the requested identities first. */
  readonly sets: readonly (readonly string[])[];
  /** Every combination the AND of ORs really has (the product of each ingredient's forms). */
  readonly combinations: number;
  /** True when the budget stopped the enumeration before it covered them all. */
  readonly partial: boolean;
}

/**
 * The AND of ORs, as id sets: (A or its approved forms) AND (B or its approved forms).
 *
 * Every requested ingredient is its own axis with the requested identity first, so the first
 * set is always the exact request. The enumeration then walks outwards by how far a
 * combination is from that request, preferring combinations that vary SEVERAL ingredients
 * over yet another form of one — otherwise one generic idea with many forms would eat the
 * whole budget and „[A puree, B puree]” would never be asked at all.
 */
export function communityIdSets(
  resolved: readonly RequestedIngredient[],
  formsFor: HomeMatchQuery['formsFor'],
  limit = COMMUNITY_FORM_QUERY_LIMIT,
): CommunityIdSets {
  const axes = communityFormGroups(resolved, formsFor);
  const combinations = axes.reduce((total, axis) => total * axis.length, 1);
  const distance = (tuple: readonly number[]) => tuple.reduce((total, index) => total + index, 0);
  const varied = (tuple: readonly number[]) => tuple.filter((index) => index > 0).length;
  const seen = new Set<string>();
  const sets: string[][] = [];
  let frontier: number[][] = [axes.map(() => 0)];
  while (frontier.length > 0 && sets.length < limit) {
    frontier.sort(
      (left, right) =>
        distance(left) - distance(right) ||
        varied(right) - varied(left) ||
        left.join().localeCompare(right.join()),
    );
    const next: number[][] = [];
    for (const tuple of frontier) {
      const key = tuple.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      sets.push(tuple.map((index, axis) => axes[axis]![index]!));
      if (sets.length >= limit) break;
      for (let axis = 0; axis < axes.length; axis += 1) {
        if (tuple[axis]! + 1 < axes[axis]!.length) {
          const grown = [...tuple];
          grown[axis] = tuple[axis]! + 1;
          next.push(grown);
        }
      }
    }
    frontier = next;
  }
  return { sets, combinations, partial: sets.length < combinations };
}

export interface CommunitySearchAnswer {
  readonly community: readonly RecipeMatch[];
  readonly communityMatches: readonly CommunityMatch[];
  readonly coverage: CommunitySearchCoverage;
}

/**
 * The Community side alone: the strict match oracle over the current Top 100.
 *
 * ONE v2 request carries the whole idea. Its outcome decides the coverage:
 *   ok          → complete (partial=false) — unless a card had to be dropped;
 *   unavailable → v2 is not deployed: the bounded v1 enumeration, unchanged;
 *   error       → partial: a failure is never „no Community match”.
 * An idea beyond the oracle's limits is not sent at all — a truncated request would be
 * a different question — and is reported as partial with the reason.
 */
export async function searchCommunityMatches(
  query: HomeMatchQuery,
): Promise<CommunitySearchAnswer> {
  const resolved = resolvedRequests(query);
  if (resolved.length === 0) {
    return { community: [], communityMatches: [], coverage: FULL_COMMUNITY_COVERAGE };
  }
  const groups = communityFormGroups(resolved, query.formsFor);
  const combinations = groups.reduce((total, group) => total * group.length, 1);
  const unanswered = (asked: number, reason: CommunityCoverageGap): CommunitySearchAnswer => ({
    community: [],
    communityMatches: [],
    coverage: { asked, combinations, partial: true, reason },
  });

  const overLimit = groupLimitGap(groups);
  if (overLimit) return unanswered(0, overLimit);

  const answer = await matchCommunityTop100Groups({ groups, profile: query.profile });
  if (answer.kind === 'unavailable') return searchCommunityMatchesV1(query, resolved);
  if (answer.kind === 'error') {
    return unanswered(1, answer.reason === 'timeout' ? 'oracle_timeout' : 'oracle_error');
  }
  const communityMatches = answer.matches;
  return {
    // The oracle already proved containment, so these are matches by construction, and
    // `alsoIncludes` is the oracle's own list of public names.
    community: communityMatches.map((match) => {
      const usedForms = answeringForms(groups, match.matchedIds)
        .map((id) => query.nameOf?.(id) ?? null)
        .filter((name): name is string => Boolean(name));
      return {
        candidate: match.candidate,
        alsoIncludes: match.alsoIncludes,
        ...(usedForms.length > 0 ? { usedForms } : {}),
      };
    }),
    communityMatches,
    coverage:
      answer.rejected > 0
        ? { asked: 1, combinations, partial: true, reason: 'card_rejected' }
        : { asked: 1, combinations, partial: false },
  };
}

/** v2 is not deployed: today's bounded v1 enumeration, one id set per request. */
async function searchCommunityMatchesV1(
  query: HomeMatchQuery,
  resolved: readonly RequestedIngredient[],
): Promise<CommunitySearchAnswer> {
  const { sets, combinations, partial } = communityIdSets(resolved, query.formsFor);
  const answers: (readonly CommunityMatch[])[] = [];
  for (let start = 0; start < sets.length; start += COMMUNITY_FORM_QUERY_CONCURRENCY) {
    answers.push(
      ...(await Promise.all(
        sets
          .slice(start, start + COMMUNITY_FORM_QUERY_CONCURRENCY)
          .map((ingredientIds) => matchCommunityTop100({ ingredientIds, profile: query.profile })),
      )),
    );
  }
  // One publication is one candidate however many forms reached it; the oracle's own
  // Top 100 rank still decides which single Community card is offered (§34).
  const byPublication = new Map<string, CommunityMatch>();
  const formsByPublication = new Map<string, readonly string[]>();
  answers.forEach((rows, index) => {
    const askedIds = sets[index] ?? [];
    for (const row of rows) {
      if (byPublication.has(row.publicationId)) continue;
      byPublication.set(row.publicationId, row);
      // Which ids answered it, when they are not the ones the customer named.
      const swapped = askedIds.filter(
        (id, axis) => resolved[axis] !== undefined && resolved[axis]!.productId !== id,
      );
      if (swapped.length > 0) formsByPublication.set(row.publicationId, swapped);
    }
  });
  const communityMatches = [...byPublication.values()];
  // The oracle already proved containment, so these are matches by construction.
  // `alsoIncludes` comes from the oracle (public names), not from a client diff of a
  // formulation the client was never given.
  return {
    community: communityMatches.map((match) => {
      const swapped = formsByPublication.get(match.publicationId) ?? [];
      const usedForms = swapped
        .map((id) => query.nameOf?.(id) ?? null)
        .filter((name): name is string => Boolean(name));
      return {
        candidate: match.candidate,
        alsoIncludes: match.alsoIncludes,
        ...(usedForms.length > 0 ? { usedForms } : {}),
      };
    }),
    communityMatches,
    coverage: { asked: sets.length, combinations, partial },
  };
}

export async function searchExistingRecipes(query: HomeMatchQuery): Promise<HomeMatchResult> {
  // §22: an unresolved chip is not a weaker constraint — it is not a constraint, and
  // matching on it would be matching on guessed text.
  if (resolvedRequests(query).length === 0) return NO_MATCH;
  const official = searchOfficialMatches(query);
  const { community, communityMatches, coverage } = await searchCommunityMatches(query);
  return {
    decision: decideMatch({ official, community, communitySearchPartial: coverage.partial }),
    communityMatches,
    coverage,
  };
}
