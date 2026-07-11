/**
 * Redirect-URL allowlist — PURE shared helper for the billing Edge Functions
 * (checkout success/cancel URLs, portal return URL, Connect return/refresh
 * URLs). No IO, no Deno APIs — vitest-tested from the app suite.
 *
 * Policy: the allowlist env (comma-separated ORIGINS, e.g.
 * "https://app.example.com,http://localhost:5173") is the only authority; a
 * redirect target must parse as an absolute http(s) URL, carry no
 * credentials, and match an allowlisted origin EXACTLY (scheme + host +
 * port). Anything else is refused — an open redirect in a payment flow is a
 * phishing primitive.
 */

/** Parse the comma-separated allowlist env value into normalized origins. */
export function parseUrlAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const origins: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      origins.push(url.origin);
    } catch {
      // Malformed allowlist entries are dropped, never trusted.
    }
  }
  return [...new Set(origins)];
}

/**
 * True only when `candidate` is an absolute, credential-free http(s) URL
 * whose origin is on the allowlist. An EMPTY allowlist allows nothing
 * (unconfigured → closed, mirroring the price-allowlist stance).
 */
export function isAllowedRedirectUrl(
  candidate: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!candidate || allowlist.length === 0) return false;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return allowlist.includes(url.origin);
}
