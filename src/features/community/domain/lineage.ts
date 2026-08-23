/**
 * Recipe lineage — copies and remixes (§21, §22, §23) — PURE, no IO.
 *
 * The one distinction this module exists to protect:
 *
 *   AUTHORSHIP travels DOWN the family tree and is never transferable. If
 *   Marysia created it, every remix of it — at any depth, by anyone — still
 *   says „Na podstawie … Marysia". No later editor, sharer or partner can
 *   overwrite that.
 *
 *   COMMERCIAL ATTRIBUTION does not travel at all. It belongs to whoever
 *   generated the sale, is decided per acquisition, and lives in
 *   `partnerShareAttribution.ts`. It is deliberately in a different file so
 *   nobody ever accidentally reads one as the other.
 */

/** A copy takes the recipe; a remix declares an intent to change it. */
export type LineageRelation = 'copy' | 'remix';

/** The lineage facts already stamped on the PARENT recipe, if it has any. */
export interface ParentLineage {
  readonly rootPublicationId: string | null;
  readonly rootCreatorUserId: string | null;
  readonly depth: number;
}

export interface DerivationRequest {
  readonly derivedRecipeId: string;
  readonly derivedUserId: string;
  readonly relation: LineageRelation;
  /** The publication being derived from (Community path). */
  readonly parentPublicationId?: string | null;
  /** The share link being derived from (direct-share path). */
  readonly parentShareLinkId?: string | null;
  /** The immutable version the parent means — never „latest" (§5). */
  readonly parentRecipeVersionId: string;
  readonly parentCreatorUserId: string;
  /** The recipe the parent publication itself points at, for the cycle check. */
  readonly parentRecipeId?: string | null;
  readonly parentLineage?: ParentLineage | null;
}

export interface LineageStamp {
  readonly recipeId: string;
  readonly derivedUserId: string;
  readonly relation: LineageRelation;
  readonly parentPublicationId: string | null;
  readonly parentShareLinkId: string | null;
  readonly parentRecipeVersionId: string;
  readonly parentCreatorUserId: string;
  readonly rootPublicationId: string | null;
  /** The ORIGINAL author of the family — the name a remix must always show. */
  readonly rootCreatorUserId: string;
  readonly depth: number;
}

/** Hard cap, mirrored by the SQL CHECK on recipe_lineage.depth. */
export const MAX_LINEAGE_DEPTH = 64;

export type LineageRefusal =
  | 'source_required'
  | 'circular_lineage'
  | 'lineage_too_deep'
  | 'self_derivation';

export type LineageDecision =
  | { readonly ok: true; readonly stamp: LineageStamp }
  | { readonly ok: false; readonly reason: LineageRefusal };

/**
 * Resolve the lineage stamp for one derivation.
 *
 * Root resolution is ONE hop, never a walk: because every derivation stamps
 * its root at creation time, the parent already knows the family's origin.
 * That keeps the write O(1) and makes an unbounded ancestor query impossible.
 */
export function resolveLineage(request: DerivationRequest): LineageDecision {
  const hasSource =
    Boolean(request.parentPublicationId) || Boolean(request.parentShareLinkId);
  if (!hasSource) return { ok: false, reason: 'source_required' };

  // §22: a recipe can never be its own parent, directly or through the
  // publication that points at it.
  if (request.parentRecipeId && request.parentRecipeId === request.derivedRecipeId) {
    return { ok: false, reason: 'circular_lineage' };
  }

  const parentDepth = request.parentLineage?.depth ?? 0;
  const depth = parentDepth + 1;
  if (depth > MAX_LINEAGE_DEPTH) return { ok: false, reason: 'lineage_too_deep' };

  // Authorship: the family's ROOT creator, falling back to the direct parent's
  // creator when this is a depth-1 derivation. Never the deriving user.
  const rootCreatorUserId =
    request.parentLineage?.rootCreatorUserId ?? request.parentCreatorUserId;

  return {
    ok: true,
    stamp: {
      recipeId: request.derivedRecipeId,
      derivedUserId: request.derivedUserId,
      relation: request.relation,
      parentPublicationId: request.parentPublicationId ?? null,
      parentShareLinkId: request.parentShareLinkId ?? null,
      parentRecipeVersionId: request.parentRecipeVersionId,
      parentCreatorUserId: request.parentCreatorUserId,
      rootPublicationId:
        request.parentLineage?.rootPublicationId ?? request.parentPublicationId ?? null,
      rootCreatorUserId,
      depth,
    },
  };
}

/** What a public remix must display (§22). Non-optional by design. */
export interface AttributionLine {
  readonly kind: 'original' | 'remix';
  readonly creatorDisplayName: string;
  readonly basedOnTitle?: string;
  readonly basedOnCreatorDisplayName?: string;
}

/**
 * Build the attribution line. A remix ALWAYS names its source; there is no
 * argument combination that produces a remix line without one, which is how
 * „attribution cannot be removed" is enforced rather than merely intended.
 */
export function attributionLine(input: {
  readonly creatorDisplayName: string;
  readonly parent?: { readonly title: string; readonly creatorDisplayName: string } | null;
}): AttributionLine {
  if (!input.parent) {
    return { kind: 'original', creatorDisplayName: input.creatorDisplayName };
  }
  return {
    kind: 'remix',
    creatorDisplayName: input.creatorDisplayName,
    basedOnTitle: input.parent.title,
    basedOnCreatorDisplayName: input.parent.creatorDisplayName,
  };
}

/**
 * A source that has been unpublished or whose creator's account is gone (§53,
 * §55). The derived recipe stays valid and keeps working; only the link to
 * the source degrades. Nothing is deleted, nothing breaks.
 */
export type SourceAvailability = 'available' | 'unpublished' | 'creator_unavailable';

export function sourceLabel(
  availability: SourceAvailability,
  creatorDisplayName: string | null,
): string {
  if (availability === 'creator_unavailable' || !creatorDisplayName) {
    return 'Twórca niedostępny';
  }
  if (availability === 'unpublished') return `${creatorDisplayName} (receptura wycofana)`;
  return creatorDisplayName;
}
