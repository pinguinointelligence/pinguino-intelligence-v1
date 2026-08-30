/**
 * §32–§36, §40 — strict recipe matching. PURE: no IO, no ranking formula of its own.
 *
 * THE STRICT RULE (§32): a candidate matches only if EVERY requested ingredient
 * IDENTITY is present in it. "Similar" is not a category — a Mojito recipe without
 * lime is not a worse Mojito match, it is not a match. Extra ingredients are fine and
 * are surfaced as `alsoIncludes` (§32), because the user should see what they are also
 * agreeing to make.
 *
 * §33: a role the user STATED is part of the identity to match. "Oreo as topping" does
 * not match a recipe that blends Oreo into the base. A role the user did NOT state is
 * left to the recipe.
 *
 * §34/§110: the Community side searches ONLY the Top 100 and this module never scores
 * anything — it receives candidates already ordered by the existing ranking authority
 * and simply takes the highest-ranked exact match. There is deliberately no second
 * ranking formula here.
 */
import type { IntentProfile, IntentRole } from './homeIntentParsing';

export type RecipeCandidateSource = 'official' | 'community';

/** One ingredient of a candidate recipe, by canonical identity. */
export interface CandidateIngredient {
  readonly productId: string;
  /** The role the recipe assigns. */
  readonly role: IntentRole;
  readonly displayName: string;
}

export interface RecipeCandidate {
  readonly id: string;
  readonly title: string;
  readonly source: RecipeCandidateSource;
  readonly profile: IntentProfile;
  readonly ingredients: readonly CandidateIngredient[];
  readonly imageUrl: string | null;
  /** Community only: the publishing creator's display name. */
  readonly authorName?: string | null;
  /** Community only: current Top 100 position, from the existing ranking authority. */
  readonly rank?: number | null;
  /** Community only: the ORIGINAL creator of the family, for the §38 byline. */
  readonly originalCreatorName?: string | null;
}

/** What the user asked for, after identity resolution (§22). */
export interface RequestedIngredient {
  readonly productId: string;
  /** §33: only a role the user STATED. `null` → the recipe may decide. */
  readonly statedRole: IntentRole | null;
  readonly displayName: string;
}

export interface RecipeMatch {
  readonly candidate: RecipeCandidate;
  /** §32: the candidate's ingredients that the user did not ask for. */
  readonly alsoIncludes: readonly string[];
}

/**
 * Does this candidate satisfy EVERY requested identity, with a stated role respected?
 */
export function candidateMatches(
  candidate: RecipeCandidate,
  requested: readonly RequestedIngredient[],
): boolean {
  return requested.every((wanted) =>
    candidate.ingredients.some(
      (ingredient) =>
        ingredient.productId === wanted.productId &&
        // §33: an unstated role imposes nothing; a stated role must be honoured.
        (wanted.statedRole === null || ingredient.role === wanted.statedRole),
    ),
  );
}

/** §32: the extra ingredients to show as `Also includes: …`. */
export function extraIngredientsOf(
  candidate: RecipeCandidate,
  requested: readonly RequestedIngredient[],
): readonly string[] {
  const asked = new Set(requested.map((item) => item.productId));
  const extras: string[] = [];
  for (const ingredient of candidate.ingredients) {
    if (!asked.has(ingredient.productId) && !extras.includes(ingredient.displayName)) {
      extras.push(ingredient.displayName);
    }
  }
  return extras;
}

export interface MatchQuery {
  readonly requested: readonly RequestedIngredient[];
  /** §40: when known, only candidates of this profile are considered. */
  readonly profile: IntentProfile | null;
}

/**
 * Filter and annotate. `candidates` must already be in the caller's authoritative
 * order — official library order for official, Top 100 rank order for Community.
 */
export function matchRecipes(
  candidates: readonly RecipeCandidate[],
  query: MatchQuery,
): readonly RecipeMatch[] {
  if (query.requested.length === 0) return [];
  return candidates
    .filter((candidate) => query.profile === null || candidate.profile === query.profile)
    .filter((candidate) => candidateMatches(candidate, query.requested))
    .map((candidate) => ({
      candidate,
      alsoIncludes: extraIngredientsOf(candidate, query.requested),
    }));
}

/* ── §35 the decision ────────────────────────────────────────────────────── */

export type MatchDecision =
  /** Exactly one official match and no Community match → adopt it, show a brief note. */
  | { readonly kind: 'auto_adopt_official'; readonly match: RecipeMatch }
  /** Show the popup: several official, or ANY Community result. */
  | {
      readonly kind: 'show_popup';
      readonly official: readonly RecipeMatch[];
      /** §34: at most ONE Community candidate — the highest-ranked exact match. */
      readonly community: RecipeMatch | null;
    }
  /** Nothing matched → straight to Create my own. */
  | { readonly kind: 'create_my_own' };

/**
 * §34: reduce the Community matches to the single highest-ranked one.
 * Ties and missing ranks fall back to the caller's order, which is already the
 * ranking authority's order — no re-scoring here.
 */
export function highestRankedCommunityMatch(matches: readonly RecipeMatch[]): RecipeMatch | null {
  let best: RecipeMatch | null = null;
  for (const match of matches) {
    if (best === null) {
      best = match;
      continue;
    }
    const bestRank = best.candidate.rank;
    const rank = match.candidate.rank;
    if (typeof rank === 'number' && (typeof bestRank !== 'number' || rank < bestRank)) {
      best = match;
    }
  }
  return best;
}

/**
 * §35 — the whole decision, in one place.
 *
 *   1 official, 0 community  → adopt automatically
 *   >1 official              → popup
 *   any community            → popup (§35: a Community recipe is NEVER auto-adopted)
 *   nothing                  → Create my own
 */
export function decideMatch(input: {
  readonly official: readonly RecipeMatch[];
  readonly community: readonly RecipeMatch[];
}): MatchDecision {
  const community = highestRankedCommunityMatch(input.community);
  const official = input.official;

  if (official.length === 0 && community === null) return { kind: 'create_my_own' };
  if (official.length === 1 && community === null && official[0]) {
    return { kind: 'auto_adopt_official', match: official[0] };
  }
  return { kind: 'show_popup', official, community };
}
