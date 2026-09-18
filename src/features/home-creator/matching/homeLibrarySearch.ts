/**
 * DESIGN V3.0 IX — the „Receptury” search („Smak lub składnik, np. truskawka”).
 *
 * NOT a new matcher. A typed flavour takes exactly the road an idea chip takes, through the
 * same central authorities, only without becoming a chip:
 *
 *   1. the words are parsed by HOME's intent parser (`parseIntent`);
 *   2. each element resolves through the central Search/Concept Resolver door
 *      (`resolveChipTerm`: the frozen SA-03 concept default, else the literal catalogue);
 *   3. the resolved identities go to the §32–§36 matching the suggestions layer uses —
 *      the official library (`searchOfficialMatches`, with the central concept membership
 *      for a generic flavour) and the Community Top 100 oracle (`searchCommunityMatches`,
 *      one highest-ranked match);
 *   4. the cards are the suggestions layer's own (`suggestionCards`).
 *
 * So everything the owner rules say about matching holds here unchanged: canonical ids,
 * never names (§22); every requested identity present (§32); never a Technical Base or a
 * record the customer could not open; at most one Community proposal (§34). The DESIGN's
 * flavour table (H_FLAV) is a mock of this behaviour and is deliberately not reproduced.
 */
import type { IntentChip } from '../homeDraftStore';
import { parseIntent, type IntentProfile } from '../homeIntentParsing';
import { chipTermOf, resolveChipTerm, SCOPE_BY_PROFILE } from '../homeIntentResolutionService';
import { highestRankedCommunityMatch, type RecipeMatch } from '../homeRecipeMatching';
import type { CommunityMatch } from './communityMatchService';
import { requestedFromChips } from './homeIdeaSuggestions';
import {
  loadConceptMatchContext,
  searchCommunityMatches,
  searchOfficialMatches,
  type ConceptMatchContext,
  type HomeMatchQuery,
} from './homeMatchSearch';

/** What the typed words mean, once resolved — the input of both matching sides. */
export type LibraryQuery =
  | {
      readonly kind: 'query';
      readonly requested: HomeMatchQuery['requested'];
      readonly profile: IntentProfile | null;
      /** The central concept authority, loaded only when a generic flavour asks for it. */
      readonly context: ConceptMatchContext | null;
    }
  /** Nothing in the words resolved to a canonical identity. */
  | { readonly kind: 'none' }
  /** The catalogue could not answer at all — honestly distinct from „no such recipe”. */
  | { readonly kind: 'unavailable' };

export interface LibraryCommunityAnswer {
  readonly match: RecipeMatch | null;
  /** The oracle row behind it, carrying its canonical address for the Community door. */
  readonly target: CommunityMatch | null;
  /** The bounded form search did not cover every combination (§34, FORM-OR-05). */
  readonly partial: boolean;
}

/** Steps 1–2: the typed words → canonical identities, through the central resolver. */
export async function resolveLibraryQuery(
  text: string,
  signal?: AbortSignal,
): Promise<LibraryQuery> {
  const parsed = parseIntent(text);
  if (parsed.terms.length === 0) return { kind: 'none' };
  const chips: IntentChip[] = [];
  let unavailable = 0;
  for (const [index, term] of parsed.terms.entries()) {
    const resolution = await resolveChipTerm(chipTermOf({ ...term, label: term.raw }), signal, {
      profile: parsed.profile,
    });
    if (signal?.aborted) return { kind: 'unavailable' };
    if (resolution.kind === 'unavailable') unavailable += 1;
    // §22/§23: an ambiguous or unknown word is not a weaker constraint — it is none, and
    // a search never guesses which product was meant.
    if (resolution.kind !== 'resolved') continue;
    chips.push({
      id: `library-query-${index}`,
      label: resolution.label ?? term.raw,
      concept: term.concept,
      role: term.role,
      source: 'text',
      productId: resolution.row.ingredient_id,
      productName: resolution.row.ingredient_name_display,
      ambiguous: false,
      resolvedBy: resolution.provenance
        ? {
            authority: resolution.provenance.authority,
            conceptKey: resolution.provenance.conceptKey,
            scope: resolution.provenance.scope ?? null,
          }
        : undefined,
    });
  }
  const requested = requestedFromChips(chips);
  if (requested.length === 0) {
    return unavailable === parsed.terms.length ? { kind: 'unavailable' } : { kind: 'none' };
  }
  const asksForConcept = requested.some((item) => item.conceptKey != null);
  // Unavailable release → identity matching only, exactly as the suggestions layer does.
  const context = asksForConcept ? await loadConceptMatchContext().catch(() => null) : null;
  return { kind: 'query', requested, profile: parsed.profile, context };
}

/** Step 3, official side: synchronous, closest first, never a Technical Base. */
export function officialLibraryMatches(
  query: Extract<LibraryQuery, { kind: 'query' }>,
): readonly RecipeMatch[] {
  return searchOfficialMatches({
    requested: query.requested,
    profile: query.profile,
    conceptMatcher: query.context?.matcher,
  });
}

/** Step 3, Community side: the Top 100 oracle, and only its one highest-ranked match. */
export async function communityLibraryMatch(
  query: Extract<LibraryQuery, { kind: 'query' }>,
): Promise<LibraryCommunityAnswer> {
  const { context, profile } = query;
  const answer = await searchCommunityMatches({
    requested: query.requested,
    profile,
    formsFor: (item) =>
      item.conceptKey == null || context === null
        ? []
        : context.formsOf(item.conceptKey, profile ? SCOPE_BY_PROFILE[profile] : null),
    nameOf: context?.nameOf,
  });
  const match = highestRankedCommunityMatch(answer.community);
  return {
    match,
    target:
      match === null
        ? null
        : (answer.communityMatches.find((row) => row.publicationId === match.candidate.id) ?? null),
    partial: answer.coverage.partial,
  };
}
