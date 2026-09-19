/**
 * share-photo — the request/response contract, PURE (no Deno APIs, no network),
 * so vitest pins it and the Edge entrypoint stays a thin wire.
 *
 * Owner decisions 2026-09-17: a guest holding a valid share token sees the
 * sharer's attached photograph; a share id alone gives nothing; a revoked or
 * expired link refuses EVERY new request — so bytes are served per request,
 * never through a signed URL, and never cached anywhere on the way.
 */

/** What a caller may present. Exactly one of the two, well-formed. */
export type SharePhotoAccess =
  | { readonly by: 'token'; readonly token: string }
  | { readonly by: 'share_link_id'; readonly shareLinkId: string };

/** Tokens are base64url of 32 random bytes (43 chars); accept a sane band only. */
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSharePhotoRequest(body: unknown): SharePhotoAccess | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const { token, shareLinkId } = body as Record<string, unknown>;
  const hasToken = token !== undefined && token !== null;
  const hasId = shareLinkId !== undefined && shareLinkId !== null;
  if (hasToken === hasId) return null;
  if (hasToken)
    return typeof token === 'string' && TOKEN.test(token) ? { by: 'token', token } : null;
  return typeof shareLinkId === 'string' && UUID.test(shareLinkId)
    ? { by: 'share_link_id', shareLinkId }
    : null;
}

export type SharePhotoRefusal = 'not_found' | 'revoked' | 'expired';

/** gellatti_share_photo_v1 answers with one of these. */
export type SharePhotoDecision =
  | { readonly ok: true; readonly share_link_id: string; readonly has_own_photo: boolean }
  | { readonly ok: false; readonly reason?: string };

export function refusalOf(decision: SharePhotoDecision): SharePhotoRefusal {
  if (decision.ok) throw new Error('not a refusal');
  return decision.reason === 'revoked' || decision.reason === 'expired'
    ? decision.reason
    : 'not_found';
}

/** 410 for a link that existed and is switched off; 404 for everything else, so nothing is enumerable. */
export const refusalStatus = (refusal: SharePhotoRefusal): 404 | 410 =>
  refusal === 'not_found' ? 404 : 410;

/**
 * The link must STILL be servable when the bytes are read: a revoke landing
 * between the decision and the read wins.
 */
export function linkRefusalAt(
  link: { readonly status?: string | null; readonly expires_at?: string | null } | null | undefined,
  now: Date,
): SharePhotoRefusal | null {
  if (!link) return 'not_found';
  if (link.status !== 'active') return 'revoked';
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) return 'expired';
  return null;
}

export const SHARE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const photoTypeOf = (type: string | null | undefined): string =>
  (SHARE_PHOTO_TYPES as readonly string[]).includes(type ?? '')
    ? (type as string)
    : 'application/octet-stream';

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-share-photo-type',
};

/** A private photograph is never stored by a browser, proxy or CDN. */
export const PRIVATE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
