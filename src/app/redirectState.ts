export const legacyDestinationRedirectTo = (
  pathname: string,
  search: string,
  forcedSearch: Readonly<Record<string, string>> = {},
  hash = '',
): { pathname: string; search: string; hash: string } => {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(forcedSearch)) params.set(key, value);
  const serialized = params.toString();
  return { pathname, search: serialized ? `?${serialized}` : '', hash };
};

/**
 * The ONE canonical customer HOME address (owner decision, 2026-09-18).
 *
 * `/` and `/home` both render the HOME Creator (HOME Creator V1 §9 — unchanged).
 * `/start`, `/classic`, `/demo` and `/customer-v1` are redirects INTO `/home`,
 * so `/start` is no longer a separate flow and `CustomerShellV1` is no longer
 * reachable by any user entrypoint.
 *
 * Declared here rather than in `router.tsx` so nav tables and deep-link builders
 * can import the canonical path without an import cycle through the route table.
 */
export const CUSTOMER_HOME_PATH = '/home';
