/**
 * App origins — PURE shared helper: which app a request came from, decided on
 * the server from a CLOSED map. No IO, no Deno APIs — vitest-tested from the
 * app suite.
 *
 * Staging and production share one Supabase project and one set of Edge
 * Functions, so the browser's Origin header is the only per-request signal of
 * which app called. The header is set by the browser, not by page script, and
 * only an EXACT match counts: a suffix, a prefix, another scheme or port, or a
 * lookalike host is unknown, and unknown is staging — a production mail marked
 * staging is noise, a staging mail marked production hides a test in a real
 * inbox. Links and redirects are built from `base`, never from the header.
 *
 * The same three rows as `APP_ORIGINS` in shop-digital-document and as
 * `public.app_origins` (migration 20260910180000); a contract test keeps them
 * equal.
 */

export type AppEnvironment = 'production' | 'staging';

export const APP_ORIGINS: Readonly<Record<string, { environment: AppEnvironment; base: string }>> = {
  'https://staging.pinguinoai.com': {
    environment: 'staging',
    base: 'https://staging.pinguinoai.com',
  },
  'https://www.gellatti.com': { environment: 'production', base: 'https://www.gellatti.com' },
  'https://gellatti.com': { environment: 'production', base: 'https://www.gellatti.com' },
};

const UNKNOWN_ORIGIN_BASE = 'https://staging.pinguinoai.com';

export interface ResolvedAppOrigin {
  readonly environment: AppEnvironment;
  readonly base: string;
  readonly matched: boolean;
}

/** Resolve an Origin header value against the closed map. */
export function resolveAppOrigin(originHeader: string | null | undefined): ResolvedAppOrigin {
  const key = (originHeader ?? '').trim().toLowerCase().replace(/\/+$/, '');
  const hit = Object.prototype.hasOwnProperty.call(APP_ORIGINS, key) ? APP_ORIGINS[key] : undefined;
  return hit
    ? { environment: hit.environment, base: hit.base, matched: true }
    : { environment: 'staging', base: UNKNOWN_ORIGIN_BASE, matched: false };
}
