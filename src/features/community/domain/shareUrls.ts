/**
 * Share URLs and public addresses (§8, §10, §45, §46) — PURE.
 *
 * One module owns every Community/Sharing URL so a path can never drift
 * between the card that links to it, the router that serves it, and the
 * metadata that declares its canonical form.
 */

/** The canonical public address of a Community recipe: /@marysia/pistachio. */
export const publicationPath = (handle: string, slug: string): string => `/@${handle}/${slug}`;

/** The canonical public address of a creator: /@marysia. */
export const creatorPath = (handle: string): string => `/@${handle}`;

/** The unlisted address of a direct share: /share/<token>. */
export const sharePath = (token: string): string => `/share/${token}`;

/**
 * Reopening a share from „Udostępnione mi": /received/<share_link_id>.
 * A share id is NOT a credential — this route is gated by the recipient row
 * the first token open created, not by the id being hard to guess.
 */
export const receivedSharePath = (shareLinkId: string): string => `/received/${shareLinkId}`;

/** Absolute URL for copy-to-clipboard and the Web Share API. */
export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface SocialMetadata {
  readonly title: string;
  readonly description: string;
  readonly canonical: string | null;
  readonly image: string | null;
  readonly robots: 'index,follow' | 'noindex,nofollow';
  readonly creator: string | null;
}

/**
 * Metadata for a public Community recipe (§46). Shareable on purpose: a
 * canonical URL, an OG image, and the creator's name — none of which reveals a
 * formulation.
 */
export function publicationMetadata(input: {
  readonly origin: string;
  readonly handle: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string | null;
  readonly imageUrl?: string | null;
  readonly creatorDisplayName: string;
}): SocialMetadata {
  return {
    title: `${input.title} · ${input.creatorDisplayName} · Gellatti`,
    description:
      input.description?.trim() ||
      `Receptura ${input.title} autorstwa ${input.creatorDisplayName} w Gellatti Community.`,
    canonical: absoluteUrl(input.origin, publicationPath(input.handle, input.slug)),
    image: input.imageUrl ?? null,
    robots: 'index,follow',
    creator: input.creatorDisplayName,
  };
}

/**
 * Metadata for a DIRECT SHARE (§11, §45, §46).
 *
 * Everything specific is stripped: no canonical URL (an unlisted page has no
 * public address), no preview image, no description of the recipe, and
 * `noindex,nofollow`. A link pasted into a chat still renders a tasteful card
 * — it just does not tell the world what somebody privately sent.
 */
export function directShareMetadata(): SocialMetadata {
  return {
    title: 'Receptura udostępniona w Gellatti',
    description: 'Ktoś udostępnił Ci recepturę w Gellatti.',
    canonical: null,
    image: null,
    robots: 'noindex,nofollow',
    creator: null,
  };
}

/** Whether the Web Share API is usable here; callers fall back to copy-link. */
export const canWebShare = (nav: Pick<Navigator, 'share'> | undefined): boolean =>
  typeof nav?.share === 'function';
