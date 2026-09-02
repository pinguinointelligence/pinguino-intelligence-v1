/**
 * Share journey continuation (§14, §19, §29) — PURE, no IO.
 *
 * THE FAILURE THIS PREVENTS: Katarzyna opens a recipe somebody sent her, signs
 * up, verifies her email, pays — and lands on a generic dashboard with no idea
 * where her recipe went. The whole conversion argument („zobaczyłam recepturę →
 * kupiłam → mogę ją zrobić") dies at that one lost redirect.
 *
 * So the share context is carried as an explicit, validated token through every
 * hop: view → login/signup → email verification → Demo → checkout → return.
 *
 * SECURITY: the continuation is a return ADDRESS, never a permission. It can
 * only ever encode an in-app path plus the share token the visitor already
 * had. It cannot name an external origin (open-redirect), it cannot carry an
 * entitlement claim, and re-entering the share still re-runs the server-side
 * entitlement check — the continuation just decides WHERE the user lands.
 */

/** Where a journey may resume. A closed set — never a free-form URL. */
export type ContinuationTarget =
  | { readonly kind: 'share'; readonly token: string }
  | { readonly kind: 'publication'; readonly handle: string; readonly slug: string }
  | { readonly kind: 'recipes' };

/** Query parameter carrying the continuation across auth and checkout. */
export const CONTINUATION_PARAM = 'continue';

/** Session-storage key for the hop where a query string cannot survive. */
export const CONTINUATION_STORAGE_KEY = 'gellatti.share.continuation';

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The in-app path a target resolves to. */
export function pathForTarget(target: ContinuationTarget): string {
  switch (target.kind) {
    case 'share':
      return `/share/${target.token}`;
    case 'publication':
      return `/@${target.handle}/${target.slug}`;
    case 'recipes':
      return '/recipes';
  }
}

/** Serialize a target for a URL. Opaque to the user, cheap to validate. */
export function encodeContinuation(target: ContinuationTarget): string {
  switch (target.kind) {
    case 'share':
      return `s:${target.token}`;
    case 'publication':
      return `p:${target.handle}:${target.slug}`;
    case 'recipes':
      return 'r';
  }
}

/**
 * Parse a continuation. Anything that is not EXACTLY one of the three known
 * shapes returns null — no fallback parsing, no partial acceptance. That is
 * what makes an injected `//evil.example` or `https://…` value inert rather
 * than merely discouraged.
 */
export function decodeContinuation(raw: string | null | undefined): ContinuationTarget | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  if (value === 'r') return { kind: 'recipes' };

  if (value.startsWith('s:')) {
    const token = value.slice(2);
    return SHARE_TOKEN_PATTERN.test(token) ? { kind: 'share', token } : null;
  }
  if (value.startsWith('p:')) {
    const [handle, slug, ...rest] = value.slice(2).split(':');
    if (rest.length > 0) return null;
    if (!handle || !slug) return null;
    if (!HANDLE_PATTERN.test(handle) || !SLUG_PATTERN.test(slug)) return null;
    return { kind: 'publication', handle, slug };
  }
  return null;
}

/**
 * The path to resume at, or `/recipes` when nothing valid was carried. Never
 * throws and never returns an absolute URL, so a caller cannot turn a bad
 * continuation into an off-site redirect by accident.
 */
export function resumePath(raw: string | null | undefined): string {
  const target = decodeContinuation(raw);
  return pathForTarget(target ?? { kind: 'recipes' });
}

/** Append a continuation to an in-app path (login, signup, subscription …). */
export function withContinuation(path: string, target: ContinuationTarget): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${CONTINUATION_PARAM}=${encodeURIComponent(encodeContinuation(target))}`;
}

/**
 * The checkout success URL for a share journey (§19).
 *
 * `origin` MUST be the app's own origin — the caller passes `window.location
 * .origin`, and the Edge Function independently enforces
 * `BILLING_REDIRECT_URL_ALLOWLIST`. Two checks, because a redirect that
 * survives payment is exactly the thing worth checking twice.
 */
export function checkoutReturnUrls(
  origin: string,
  target: ContinuationTarget,
): { readonly successUrl: string; readonly cancelUrl: string } {
  const encoded = encodeURIComponent(encodeContinuation(target));
  return {
    successUrl: `${origin}/subscription?checkout=success&${CONTINUATION_PARAM}=${encoded}`,
    cancelUrl: `${origin}/subscription?checkout=cancelled&${CONTINUATION_PARAM}=${encoded}`,
  };
}

/**
 * After a successful checkout the user goes back to THE RECIPE, not to a
 * dashboard (§19). Returns null when there was no journey to resume, which is
 * the only case where the generic destination is the honest answer.
 */
export function postCheckoutDestination(
  search: string,
  outcome: 'success' | 'cancelled' | null,
): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const target = decodeContinuation(params.get(CONTINUATION_PARAM));
  if (!target) return null;
  // A cancelled checkout also returns to the recipe: the user came to see it,
  // and dropping them somewhere else would punish them for not buying yet.
  return outcome === null ? null : pathForTarget(target);
}
