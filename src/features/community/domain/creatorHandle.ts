/**
 * Creator handles (§6) — PURE, no IO.
 *
 * A handle is a public identity that appears in a URL (`/@marysia`), so it
 * must be unique case-insensitively, URL-safe, and unable to collide with an
 * application route. `RESERVED_HANDLES` is kept in LOCKSTEP with the
 * `public.creator_reserved_handles` seed in migration
 * 20260823140000_community_creators_sharing_v1.sql — a source test pins the
 * two lists together so a route added to one can never be claimable in the
 * other.
 *
 * The client validates for a fast, honest error message; the database
 * validates again because the client is not an authority.
 */

/**
 * Letters that Unicode NFD does NOT decompose into base + combining mark, so
 * `normalize('NFD')` alone would drop them. Polish `ł` is the one that
 * matters most here — „Zażółć" must become „zazolc", not „zazo-c" — but the
 * rest of the Latin-extended set is included so a European creator name never
 * degrades into hyphens.
 */
const NON_DECOMPOSING_LATIN: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u0142\u0141]/g, 'l'], // ł Ł
  [/[\u00f8\u00d8]/g, 'o'], // ø Ø
  [/[\u0111\u0110\u00f0\u00d0]/g, 'd'], // đ Đ ð Ð
  [/[\u00e6\u00c6]/g, 'ae'], // æ Æ
  [/[\u0153\u0152]/g, 'oe'], // œ Œ
  [/[\u00df]/g, 'ss'], // ß
  [/[\u00fe\u00de]/g, 'th'], // þ Þ
  [/[\u0131]/g, 'i'], // ı
];

/** Lower-case, strip accents, and transliterate the letters NFD cannot. */
const toAsciiLatin = (value: string): string => {
  let result = (value ?? '').toLowerCase();
  for (const [pattern, replacement] of NON_DECOMPOSING_LATIN) {
    result = result.replace(pattern, replacement);
  }
  return result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/** Canonical (stored) form: lower-case, trimmed. */
export const canonicalHandle = (raw: string): string => raw.trim().toLowerCase();

/**
 * Handle grammar, identical to the SQL CHECK constraint:
 * 3–30 chars, starts alphanumeric, then alphanumerics, `_` or `-`.
 */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/**
 * Reserved words. Three groups, all of them route-collision or
 * impersonation risks: application routes, brand words, and role words that
 * would let a handle imply an authority it does not have.
 */
export const RESERVED_HANDLES: readonly string[] = [
  'admin', 'administrator', 'account', 'api', 'app', 'billing',
  'community', 'creator', 'creators', 'dev', 'demo', 'gellatti',
  'help', 'home', 'login', 'logout', 'machine', 'mapper',
  'moderation', 'official', 'partner', 'partners', 'pinguino',
  'pro', 'production', 'products', 'profile', 'recipe', 'recipes',
  'root', 'settings', 'share', 'shop', 'signup', 'start',
  'studio', 'subscription', 'support', 'system', 'top100', 'user',
  'users', 'www',
];

const RESERVED = new Set(RESERVED_HANDLES);

export type HandleRefusal =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'invalid_characters'
  | 'reserved';

export type HandleValidation =
  | { readonly ok: true; readonly handle: string }
  | { readonly ok: false; readonly reason: HandleRefusal };

/** Validate a candidate handle. Refusals are typed so the UI can explain them. */
export function validateHandle(raw: string): HandleValidation {
  const handle = canonicalHandle(raw ?? '');
  if (handle.length === 0) return { ok: false, reason: 'empty' };
  if (handle.length < 3) return { ok: false, reason: 'too_short' };
  if (handle.length > 30) return { ok: false, reason: 'too_long' };
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, reason: 'invalid_characters' };
  if (RESERVED.has(handle)) return { ok: false, reason: 'reserved' };
  return { ok: true, handle };
}

/** Suggest a handle from a display name — never returns a reserved word. */
export function suggestHandle(displayName: string): string | null {
  const base = toAsciiLatin(canonicalHandle(displayName ?? ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  if (base.length < 3) return null;
  return RESERVED.has(base) ? `${base}-gellatti`.slice(0, 30) : base;
}

/** URL slug for a published recipe title (§8). Mirrors the SQL CHECK. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function slugifyTitle(title: string): string | null {
  const slug = toAsciiLatin((title ?? '').trim())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * `/@handle` path-segment helpers.
 *
 * React Router params own a whole segment, so the public handle namespace is
 * routed as `/:handle` and the leading `@` is validated here instead. Keeping
 * these two functions in the domain module (rather than next to the route)
 * avoids a cycle: the route component imports the pages, and the pages need
 * this logic.
 */

/** `@marysia` → true; `marysia`, `@admin`, `@ab` → false. */
export function isHandlePath(segment: string): boolean {
  if (!segment.startsWith('@')) return false;
  return validateHandle(segment.slice(1)).ok;
}

/** The canonical handle inside a `/@handle` segment, or null. */
export function handleFromPath(segment: string): string | null {
  if (!segment.startsWith('@')) return null;
  const validation = validateHandle(segment.slice(1));
  return validation.ok ? validation.handle : null;
}
