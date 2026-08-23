/**
 * The three recipe visibility states (§4) — PURE.
 *
 * These are not three flags on one row; they are three different facts about
 * a recipe, and conflating them is exactly the mistake this module exists to
 * prevent:
 *
 *   PRIVATE    the default. Every recipe that already existed before the
 *              Community shipped is private and STAYS private — migration
 *              creates no publication and no share for any existing row.
 *   UNLISTED   a direct share exists. Reachable by token, never searchable,
 *              never ranked, always `noindex`.
 *   PUBLISHED  the owner explicitly published it to the Community.
 *
 * A recipe can be BOTH unlisted and published (a creator may share a link to
 * their own public recipe), which is why `visibilityOf` takes both facts and
 * why `isCommunityContent` is asked separately from `isLinkAccessible`.
 */

export type RecipeVisibility = 'private' | 'unlisted' | 'published';

export interface VisibilityFacts {
  /** At least one share link on this recipe is currently active. */
  readonly hasActiveShare: boolean;
  /** A community_publications row for this recipe is currently `published`. */
  readonly hasLivePublication: boolean;
}

/**
 * The strongest state that applies. Published outranks unlisted because a
 * published recipe is already discoverable — its share links add reach, not
 * exposure.
 */
export function visibilityOf(facts: VisibilityFacts): RecipeVisibility {
  if (facts.hasLivePublication) return 'published';
  if (facts.hasActiveShare) return 'unlisted';
  return 'private';
}

/** Only published recipes are Community content — sharing NEVER publishes (§11). */
export const isCommunityContent = (visibility: RecipeVisibility): boolean =>
  visibility === 'published';

/** Only published recipes may appear in rankings, search or a public feed (§11). */
export const isDiscoverable = (visibility: RecipeVisibility): boolean =>
  visibility === 'published';

/**
 * Robots policy (§11, §46). Direct-share pages are `noindex` unconditionally:
 * they are unlisted, they carry somebody's private work, and a search engine
 * that indexed one would turn a private send into a public leak.
 */
export type RobotsPolicy = 'index,follow' | 'noindex,nofollow';

export function robotsPolicyFor(surface: 'community_publication' | 'creator_profile' | 'direct_share'): RobotsPolicy {
  return surface === 'direct_share' ? 'noindex,nofollow' : 'index,follow';
}

/** Only Community surfaces belong in a sitemap. */
export const belongsInSitemap = (
  surface: 'community_publication' | 'creator_profile' | 'direct_share',
): boolean => surface !== 'direct_share';
