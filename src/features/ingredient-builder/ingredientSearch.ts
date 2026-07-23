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
 * (the owner families + the canonical basics) — no hundreds of UI special cases.
 *
 * `categories` (optional) = the Mapper `ingredient_category` values the CONCEPT primarily lives in.
 * Ranking prefers rows in those categories, so „milk" surfaces dairy milk before MILK CHOCOLATE,
 * COCONUT MILK or base mixes — without ever hiding the rest.
 */
interface AliasFamily {
  readonly roots: readonly string[];
  readonly categories?: readonly string[];
}

const FRUIT = ['fruit'] as const;
const ALIAS_FAMILIES: readonly AliasFamily[] = [
  { roots: ['truskaw', 'straw', 'fragol', 'fresa', 'freson'], categories: FRUIT }, // strawberry
  { roots: ['wanil', 'wanili', 'vanil', 'vanigl', 'vanill'] }, // vanilla (forms span categories)
  { roots: ['ananas', 'pineapp', 'pina'], categories: FRUIT }, // pineapple
  { roots: ['malin', 'raspberr', 'lampon', 'frambues'], categories: FRUIT }, // raspberry
  { roots: ['banan', 'banana', 'platan'], categories: FRUIT }, // banana
  { roots: ['mango'], categories: FRUIT }, // mango
  { roots: ['jablk', 'apple', 'manzan'], categories: FRUIT }, // apple
  { roots: ['grusz', 'pear'], categories: FRUIT }, // pear
  { roots: ['brzoskwin', 'peach', 'pesca'], categories: FRUIT }, // peach
  { roots: ['morel', 'apricot', 'albicocc'], categories: FRUIT }, // apricot
  { roots: ['pomarancz', 'orange', 'aranci', 'naranja'], categories: FRUIT }, // orange
  { roots: ['borowk', 'jagod', 'blueberr', 'mirtill'], categories: FRUIT }, // blueberry
  { roots: ['jezyn', 'blackberr'], categories: FRUIT }, // blackberry
  { roots: ['wisni', 'czeresn', 'cherry', 'cilieg', 'amaren'], categories: FRUIT }, // cherry
  { roots: ['cytryn', 'lemon', 'limon'], categories: FRUIT }, // lemon
  { roots: ['limonk', 'lime'], categories: FRUIT }, // lime
  { roots: ['czekolad', 'chocolat', 'cioccolat', 'cocoa', 'kakao'], categories: ['chocolate', 'cocoa'] },
  { roots: ['pistacj', 'pistach', 'pistacchio'], categories: ['nut'] },
  { roots: ['orzech', 'laskow', 'hazelnut', 'nocciol'], categories: ['nut'] },
  { roots: ['mlek', 'milk', 'latte', 'leche'], categories: ['dairy'] }, // milk
  { roots: ['smietan', 'cream', 'crema', 'panna'], categories: ['dairy'] }, // cream
  { roots: ['bazyl', 'basil', 'basilic', 'albahac'], categories: ['botanical'] }, // basil
  { roots: ['miet', 'mint', 'menta'], categories: ['botanical'] }, // mint
  { roots: ['rozmaryn', 'rosemar', 'rosmarin', 'romero'], categories: ['botanical'] }, // rosemary
  { roots: ['tymian', 'thyme', 'timo', 'tomillo'], categories: ['botanical'] }, // thyme
  { roots: ['cukier', 'sugar', 'sacharoz', 'sucros'], categories: ['sweetener'] }, // sugar/sucrose
  { roots: ['dekstroz', 'dextros'], categories: ['sweetener'] }, // dextrose
  { roots: ['fruktoz', 'fructos'], categories: ['sweetener'] }, // fructose
  { roots: ['glukoz', 'glucos'], categories: ['sweetener'] }, // glucose
  { roots: ['lask', 'pod', 'bean', 'strak'] }, // vanilla-bean concept („laska wanilii")
  { roots: ['ekstrakt', 'extract', 'estratt'] }, // extract forms
  // rose — the ONE coverage gap: „Róża" is non-ASCII in display + absent from internal
  { roots: ['roza', 'rozy', 'rose', 'rosa'], categories: ['botanical'] },
];

const familyMatchesRoot = (family: AliasFamily, root: string): boolean =>
  family.roots.some((m) => root.startsWith(m) || (root.length >= 4 && m.startsWith(root)));

/** Alias roots for a token's stem: a family fires when the stem is a prefix of, or extends, any member. */
function familyExpansionFor(root: string): string[] {
  const out: string[] = [];
  for (const family of ALIAS_FAMILIES) {
    if (familyMatchesRoot(family, root)) out.push(...family.roots);
  }
  return out;
}

/**
 * The Mapper categories a query's CONCEPT primarily lives in (union across all
 * triggered families). Empty set → the query has no category preference.
 */
export function conceptCategoriesFor(rawQuery: string): ReadonlySet<string> {
  const categories = new Set<string>();
  const norm = normalizeSearchText(rawQuery);
  for (const token of norm.split(' ')) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    const root = stem(token);
    for (const family of ALIAS_FAMILIES) {
      if (family.categories && familyMatchesRoot(family, root)) {
        for (const category of family.categories) categories.add(category);
      }
    }
  }
  return categories;
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

/* ------------------------------------------------------------------ ranking -- */

/**
 * Natural-form ranking (owner P0): fresh/raw forms first, industrial pastes/powders/beverages
 * last. Keyed on the Mapper `ingredient_subcategory` (the „form"). Lower = ranked higher.
 */
export function formRank(form: string | null | undefined): number {
  const f = (form ?? '').toLowerCase();
  if (f === '') return 5;
  // natural / base forms first (fresh fruit, fresh herbs, plain dairy milk)
  if (f.includes('fresh') || f === 'fruit_profile' || f.includes('tropical_fruit') || f.includes('fruit_peel')) return 0;
  if (f === 'milk') return 0; // canonical plain dairy milk (MILK 3.5% …)
  if (f.includes('frozen')) return 1;
  if (f.includes('puree')) return 2;
  if (f.includes('concentrate') || f.includes('nectar') || f.includes('juice')) return 3;
  if (f === 'cream' || f.startsWith('cream_')) return 3; // plain dairy creams
  if (f.includes('dried') || f.includes('buttermilk')) return 4;
  if (f.includes('condensed')) return 6;
  if (f.includes('paste') || f.includes('variegat')) return 6;
  if (f.includes('powder') || f.includes('icing')) return 7;
  if (f.includes('syrup') || f.includes('sweetened') || f.includes('sauce')) return 7;
  if (f.includes('coconut_milk')) return 8;
  if (f.includes('aroma') || f.includes('flavour') || f.includes('flavor')) return 8;
  if (f.includes('soda') || f.includes('drink') || f.includes('beverage') || f.includes('energy')) return 9;
  return 5;
}

/**
 * How well the query matches the row's semantic NAME (normalized display +
 * internal + form):
 *   0 = the name starts with the full normalized query (exact/near-exact);
 *   1 = the name starts with the first significant token AND every token
 *       matches at a WORD start („skimmed milk powder" → SKIMMED MILK …);
 *   2 = every significant token matches at a WORD start somewhere in the name;
 *   3 = the name matches only as a substring/alias (e.g. „milk" inside BUTTERMILK);
 *   4 = the name does not match — the row matched on id/EAN/SKU/brand only.
 */
export function nameMatchQuality(normalizedName: string, rawQuery: string): 0 | 1 | 2 | 3 | 4 {
  const full = normalizeSearchText(rawQuery);
  if (full !== '' && normalizedName.startsWith(full)) return 0;
  const tokenTerms = queryTokenTerms(rawQuery);
  if (tokenTerms.length > 0) {
    const words = normalizedName.split(' ');
    const everyTokenAtWordStart = tokenTerms.every((terms) =>
      terms.some((t) => words.some((w) => w.startsWith(t))),
    );
    if (everyTokenAtWordStart) {
      const firstTokenLeads = tokenTerms[0]!.some((t) => normalizedName.startsWith(t));
      return firstTokenLeads ? 1 : 2;
    }
  }
  return haystackMatchesQuery(normalizedName, rawQuery) ? 3 : 4;
}

/** Customer-facing Polish form label for a Mapper subcategory (owner P0 — show the form). */
export function formLabelPl(form: string | null | undefined): string {
  const rank = formRank(form);
  return (
    ['Świeży owoc', 'Mrożony', 'Przecier', 'Koncentrat', 'Suszony', '', 'Pasta', 'Proszek', 'Aromat', 'Napój'][rank] ??
    ''
  );
}

export interface RankMeta {
  /** id → NORMALIZED name-only text (display + internal), for semantic-vs-SKU scoring. */
  nameIndex: ReadonlyMap<string, string>;
  /** id → Mapper subcategory (form). */
  formIndex: ReadonlyMap<string, string>;
}

/**
 * Rank filtered matches so the owner sees the NATURAL / exact form first:
 *   1. semantic NAME matches before rows that matched only on id / EAN / SKU / brand
 *      (a „banana" query must not surface white chocolate because its code contains „ban");
 *   2. then by FORM (fresh → frozen → puree → concentrate → paste → powder → aroma → beverage);
 *   3. then alphabetically; stable for equal keys.
 * An empty query keeps the incoming order (browse mode).
 */
export function rankIngredients<T extends { id: string; name: string }>(
  items: readonly T[],
  rawQuery: string,
  meta: RankMeta,
): T[] {
  if (rawQuery.trim() === '') return [...items];
  return items
    .map((item, i) => {
      const nameHay = meta.nameIndex.get(item.id) ?? normalizeSearchText(item.name);
      const nameHit = haystackMatchesQuery(nameHay, rawQuery) ? 0 : 1;
      return { item, i, nameHit, form: formRank(meta.formIndex.get(item.id)), name: item.name.toLowerCase() };
    })
    .sort(
      (a, b) => a.nameHit - b.nameHit || a.form - b.form || a.name.localeCompare(b.name) || a.i - b.i,
    )
    .map((x) => x.item);
}

/* ---------------------------------------------------- live server search -- */

/** The safe columns the live search filter runs over (never PAC/POD/composition). */
export const SEARCHABLE_DB_FIELDS = [
  'ingredient_name_display',
  'ingredient_name_internal',
  'ingredient_id',
  'brand',
  'ingredient_category',
  'ingredient_subcategory',
] as const;

/**
 * The server-side filter contract (PURE): one AND-group per significant token,
 * each an OR of that token's stem + alias roots. Terms are already normalized
 * to [a-z0-9] (PostgREST-syntax safe). Empty result = nothing to search.
 * The coverage audit replays EXACTLY these semantics over the physical rows.
 */
export function buildSearchTermGroups(rawQuery: string): string[][] {
  const groups = queryTokenTerms(rawQuery);
  if (groups.length > 0) return groups;
  const full = normalizeSearchText(rawQuery);
  return full === '' ? [] : [[full]];
}

/** One light search result row (the safe live-search payload). */
export interface IngredientSearchHit {
  id: string;
  name: string;
  /** Normalized display+internal name (semantic-match scoring). */
  nameNorm: string;
  category: string;
  form: string;
}

/**
 * Deterministic ranking of live search hits (owner P0 — ordinary basics first):
 *   1. concept category affinity — a „milk"/„mleko" query prefers dairy rows over
 *      MILK CHOCOLATE / COCONUT MILK / base mixes (never hides them);
 *   2. name-match quality — exact-prefix > word match > substring > SKU-only;
 *   3. natural form — fresh/plain milk → frozen → puree → … → paste → powder → beverage;
 *   4. alphabetical, stable.
 */
export function rankSearchHits<T extends IngredientSearchHit>(hits: readonly T[], rawQuery: string): T[] {
  if (rawQuery.trim() === '') return [...hits];
  const concept = conceptCategoriesFor(rawQuery);
  return hits
    .map((hit, i) => ({
      hit,
      i,
      affinity: concept.size === 0 ? 0 : concept.has(hit.category) ? 0 : 1,
      quality: nameMatchQuality(hit.nameNorm, rawQuery),
      form: formRank(hit.form),
      name: hit.name.toLowerCase(),
    }))
    .sort(
      (a, b) =>
        a.affinity - b.affinity ||
        a.quality - b.quality ||
        a.form - b.form ||
        a.name.localeCompare(b.name) ||
        a.i - b.i,
    )
    .map((x) => x.hit);
}
