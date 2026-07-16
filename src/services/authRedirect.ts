/**
 * OAuth redirect helpers (Google sign-in) — two small, pure concerns:
 *
 *  1. `allowedOAuthRedirectOrigin` — the open-redirect guard for the OAuth
 *     `redirectTo` value. Only the app's own origins are ever passed through;
 *     anything else returns `undefined` so the auth backend falls back to its
 *     dashboard-configured Site URL. Callers can never inject a URL.
 *
 *  2. `parseOAuthRedirectError` / `stripOAuthErrorParams` — after a failed or
 *     cancelled OAuth redirect the provider appends `error`, `error_code` and
 *     `error_description` to our URL (query or hash, depending on flow). The
 *     parser classifies them (user-cancelled vs real failure) and the stripper
 *     removes ONLY those params so a refresh does not re-announce a stale error.
 *
 * `consumeOAuthRedirectError` is the one impure convenience wrapper used at app
 * boot; everything else is pure and unit-tested in `authRedirect.test.ts`.
 */

/** The complete set of origins this app is ever served from. Closed by default. */
const APP_ORIGINS: ReadonlySet<string> = new Set([
  'https://staging.pinguinoai.com',
  'https://pinguinoai.com',
  'https://www.pinguinoai.com',
  'http://localhost:5173',
]);

/**
 * Returns the origin unchanged when it is one of the app's own origins,
 * otherwise `undefined` (exact string match — scheme, host and port all count).
 */
export function allowedOAuthRedirectOrigin(
  origin: string | null | undefined,
): string | undefined {
  if (!origin) return undefined;
  return APP_ORIGINS.has(origin) ? origin : undefined;
}

export interface OAuthRedirectError {
  /** `cancelled` = the user backed out at the provider (calm copy, not an error). */
  kind: 'cancelled' | 'failed';
  /** Provider-supplied human-readable description, when present. */
  description: string | null;
}

const readParams = (raw: string, prefix: '?' | '#'): URLSearchParams =>
  new URLSearchParams(raw.startsWith(prefix) ? raw.slice(1) : raw);

/**
 * Detects OAuth error params in a URL's search string and/or hash fragment.
 * Pure: pass `window.location.search` and `window.location.hash`. Returns
 * `null` when there is no error (including successful token redirects).
 */
export function parseOAuthRedirectError(
  search: string,
  hash: string,
): OAuthRedirectError | null {
  const fromSearch = readParams(search, '?');
  const fromHash = readParams(hash, '#');
  const source =
    fromSearch.get('error') !== null
      ? fromSearch
      : fromHash.get('error') !== null
        ? fromHash
        : null;
  if (!source) return null;
  const error = source.get('error') ?? '';
  const description = source.get('error_description')?.trim() ?? '';
  return {
    kind: error === 'access_denied' ? 'cancelled' : 'failed',
    description: description !== '' ? description : null,
  };
}

const OAUTH_ERROR_KEYS = ['error', 'error_code', 'error_description'] as const;

/**
 * Returns the href with OAuth error params removed from the query string and —
 * only when the hash itself carries an `error` — from the hash fragment. All
 * other params, the path and any non-error hash are preserved. Pure; returns
 * the input unchanged when it is not an absolute URL or has nothing to strip.
 */
export function stripOAuthErrorParams(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  for (const key of OAUTH_ERROR_KEYS) url.searchParams.delete(key);
  if (url.hash.length > 1) {
    const hashParams = readParams(url.hash, '#');
    if (hashParams.get('error') !== null) {
      for (const key of OAUTH_ERROR_KEYS) hashParams.delete(key);
      const rest = hashParams.toString();
      url.hash = rest ? `#${rest}` : '';
    }
  }
  return url.toString();
}

/**
 * Boot-time consumer: reads the current URL, and when it carries OAuth error
 * params returns the parsed error AND scrubs those params from the address bar
 * (so refresh/back does not replay a stale error). No-op (`null`) in non-browser
 * environments and on every ordinary page load.
 */
export function consumeOAuthRedirectError(): OAuthRedirectError | null {
  if (typeof window === 'undefined') return null;
  const parsed = parseOAuthRedirectError(window.location.search, window.location.hash);
  if (!parsed) return null;
  const cleaned = stripOAuthErrorParams(window.location.href);
  if (cleaned !== window.location.href) {
    window.history.replaceState(window.history.state, '', cleaned);
  }
  return parsed;
}
