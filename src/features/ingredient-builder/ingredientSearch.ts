/**
 * Natural-Polish ingredient search normalization (owner P0 — core catalogue search).
 *
 * PROVEN root cause (staging tunab): the live Mapper rows DO load for a Pro user (2,070 rows,
 * incl. truskawka×4, wanilia×7), but the old matcher used a raw `haystack.includes(rawQuery)`
 * substring test — so plural / grammatical / diacritic / cross-language forms never matched:
 *   - „truskawki" / „świeże truskawki" ≠ the stored „TRUSKAWKA";
 *   - „wanilia" is only in `ingredient_name_internal` (display is Italian „VANIGLIA");
 *   - „ananas" has NO approved row — it must alias to the 10 „pineapple" rows.
 *
 * This module is a PURE, controlled normalization + alias layer (no hundreds of UI special cases):
 *   1. lowercase, strip diacritics (świeże→swieze, ł→l), normalize punctuation/whitespace;
 *   2. drop filler stopwords („świeże", „z", „i");
 *   3. stem common Polish inflection to a search root (truskawki→truskawk, wanilii→wanili);
 *   4. expand each token through a small controlled alias dictionary (PL↔EN↔IT↔ES) so a query for
 *      one flavour concept reaches every stored language form.
 *
 * Matching stays substring-based against the SAME normalized haystack (display + internal name +
 * id + brand + category + subcategory), so it never invents a match — it only widens the query.
 */

/** Lowercase + strip diacritics (NFD combining marks + the Polish ł which does not decompose). */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Polish filler words that never identify an ingredient (already diacritic-stripped). */
const STOPWORDS: ReadonlySet<string> = new Set([
  'swieze', 'swiezy', 'swieza', 'swiezych', 'swiezej', 'mrozone', 'mrozona', 'mrozony',
  'z', 'ze', 'i', 'w', 'na', 'do', 'oraz', 'lub', 'the', 'de', 'con',
]);

/** Inflectional suffixes stripped (longest-first) to reach a Polish search root. */
const SUFFIXES = ['owych', 'owym', 'owej', 'owe', 'owy', 'owa', 'ami', 'ach', 'om', 'ow', 'ie', 'y', 'i', 'a', 'e'];

/** Reduce a (normalized) token to a search root; keeps a minimum length of 4 to avoid over-stemming. */
export function stem(token: string): string {
  for (const suf of SUFFIXES) {
    if (token.length - suf.length >= 4 && token.endsWith(suf)) {
      return token.slice(0, -suf.length);
    }
  }
  return token;
}

/**
 * Controlled alias dictionary: each family is a flat list of EQUIVALENT roots across PL/EN/IT/ES.
 * A query token belonging to a family (in ANY language) expands to every root in that family, so
 * „wanilia"/„vanilla"/„vaniglia" all reach one another. Deliberately small + flavour-concept scoped
 * (the owner families + obvious staples) — no hundreds of UI special cases.
 */
const ALIAS_FAMILIES: readonly (readonly string[])[] = [
  ['truskaw', 'straw', 'fragol', 'fresa', 'freson'], // strawberry
  ['wanil', 'wanili', 'vanil', 'vanigl', 'vanill'], // vanilla
  ['ananas', 'pineapp', 'pina'], // pineapple (no approved „ananas" row → alias to pineapple)
  ['malin', 'raspberr', 'lampon', 'frambues'], // raspberry
  ['czekolad', 'chocolat', 'cioccolat', 'cocoa', 'kakao'], // chocolate
  ['pistacj', 'pistach', 'pistacchio'], // pistachio
  ['orzech', 'laskow', 'hazelnut', 'nocciol'], // hazelnut
  ['cytryn', 'lemon', 'limon'], // lemon
];

/** Alias roots for a token's stem: a family fires when the stem is a prefix of, or extends, any member. */
function familyExpansionFor(root: string): string[] {
  const out: string[] = [];
  for (const family of ALIAS_FAMILIES) {
    if (family.some((m) => root.startsWith(m) || (root.length >= 4 && m.startsWith(root)))) {
      out.push(...family);
    }
  }
  return out;
}

/** The set of search roots a single normalized token contributes (its own stem + any alias family). */
function termsForToken(token: string): string[] {
  const root = stem(token);
  return [...new Set<string>([root, token, ...familyExpansionFor(root)])];
}

/** Per-token expansion for a raw query: one entry per significant token, each with its alias set. */
export function queryTokenTerms(rawQuery: string): string[][] {
  const norm = normalizeSearchText(rawQuery);
  if (norm === '') return [];
  return norm
    .split(' ')
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => termsForToken(t));
}

/**
 * Does a normalized haystack match a raw query?
 *  - the FULL normalized query as a substring wins first (preserves exact/id/brand matches);
 *  - otherwise EVERY significant token must match via its own root OR an alias-family root.
 * An all-stopword query (e.g. „świeże") returns false → the caller keeps the full list.
 */
export function haystackMatchesQuery(normalizedHaystack: string, rawQuery: string): boolean {
  const full = normalizeSearchText(rawQuery);
  if (full === '') return true;
  if (normalizedHaystack.includes(full)) return true;
  const tokenTerms = queryTokenTerms(rawQuery);
  // An all-stopword / too-short query carries no discriminating term → never hide everything.
  if (tokenTerms.length === 0) return true;
  return tokenTerms.every((terms) => terms.some((t) => normalizedHaystack.includes(t)));
}
