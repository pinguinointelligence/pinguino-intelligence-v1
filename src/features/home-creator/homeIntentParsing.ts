/**
 * GELLATTI HOME — intent understanding (§19–§21, §25, §31, §33). PURE, no IO.
 *
 * THE BOUNDARY THIS MODULE RESPECTS (§22): it understands WORDS, it does not decide
 * PRODUCTS. Its output is a list of normalised search TERMS plus optional profile and
 * role hints. Turning a term into a real Gellatti identity is the Product Catalog /
 * Mapper's job, downstream — this file never guesses a SKU, never substitutes an
 * ingredient, and never invents an equivalence.
 *
 * That split is what makes §25 safe: being generous about spelling and language here
 * costs nothing, because a term that resolves to no catalogue identity simply fails
 * resolution instead of silently formulating something the user did not ask for.
 */

/** The four customer-visible profiles (§31). Raw contract values are NOT translated. */
export type IntentProfile = 'gelato' | 'sorbet' | 'protein' | 'vegan';

/** §33: a role the user stated explicitly. `null` = unstated, the recipe may decide. */
export type IntentRole = 'ingredient' | 'topping';

export interface IntentTerm {
  /** Exactly what the user said/typed, preserved for display and for correction. */
  readonly raw: string;
  /** Diacritics-stripped lowercase form used for lookup. */
  readonly normalized: string;
  /**
   * The canonical concept this term is understood as, when a lexicon entry matched.
   * `null` means "we did not recognise the word" — the term still goes to catalogue
   * search verbatim, it is simply not treated as a known concept.
   */
  readonly concept: string | null;
  /** §33: role stated by the user for THIS term. */
  readonly role: IntentRole | null;
  /** True when the concept was reached through fuzzy (typo) matching, not exactly. */
  readonly fuzzy: boolean;
}

export interface ParsedIntent {
  readonly terms: readonly IntentTerm[];
  /** §31: a profile the user stated or clearly implied; `null` → ask the four choices. */
  readonly profile: IntentProfile | null;
}

/* ── normalisation ───────────────────────────────────────────────────────── */

const DIACRITIC_MAP: Readonly<Record<string, string>> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  á: 'a',
  à: 'a',
  â: 'a',
  ä: 'a',
  ã: 'a',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ñ: 'n',
  ò: 'o',
  ô: 'o',
  ö: 'o',
  õ: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ç: 'c',
  ß: 'ss',
};

export function normalizeIntentText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźżáàâäãåéèêëíìîïñòôöõúùûüçß]/g, (ch) => DIACRITIC_MAP[ch] ?? ch)
    .replace(/[^a-z0-9\s&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── lexicon ─────────────────────────────────────────────────────────────── */

/**
 * Concept → the surface forms that mean it, across the languages the product serves.
 * These are INTENT words, not catalogue names: `strawberry` here is "the user is
 * talking about strawberries", and the Mapper decides which strawberry product.
 *
 * Multi-word forms are matched as phrases before single tokens, so "peanut butter"
 * cannot be shredded into "peanut" + "butter".
 */
const CONCEPT_LEXICON: Readonly<Record<string, readonly string[]>> = Object.freeze({
  strawberry: [
    'strawberry',
    'strawberries',
    'truskawka',
    'truskawki',
    'truskawkowe',
    'fresa',
    'fresas',
    'erdbeere',
    'erdbeeren',
    'fragola',
  ],
  raspberry: [
    'raspberry',
    'raspberries',
    'malina',
    'maliny',
    'malinowe',
    'frambuesa',
    'himbeere',
    'lampone',
  ],
  blueberry: ['blueberry', 'blueberries', 'borowka', 'jagoda', 'jagody', 'arandano', 'heidelbeere'],
  cherry: ['cherry', 'cherries', 'wisnia', 'wisnie', 'czeresnia', 'cereza', 'kirsche'],
  banana: ['banana', 'bananas', 'banan', 'banany', 'platano', 'banane'],
  mango: ['mango', 'mangos'],
  peach: ['peach', 'peaches', 'brzoskwinia', 'melocoton', 'pfirsich'],
  pear: ['pear', 'pears', 'gruszka', 'gruszki', 'pera', 'birne'],
  apple: ['apple', 'apples', 'jablko', 'jablka', 'manzana', 'apfel'],
  lemon: ['lemon', 'lemons', 'cytryna', 'cytrynowe', 'limon', 'zitrone'],
  lime: ['lime', 'limes', 'limonka', 'limonki', 'lima'],
  orange: ['orange', 'oranges', 'pomarancza', 'pomarancze', 'naranja', 'apfelsine'],
  passionfruit: ['passionfruit', 'passion fruit', 'marakuja', 'maracuya'],
  coconut: ['coconut', 'kokos', 'kokosowe', 'coco', 'kokosnuss'],
  pineapple: ['pineapple', 'ananas', 'pina'],
  watermelon: ['watermelon', 'arbuz', 'sandia', 'wassermelone'],
  chocolate: [
    'chocolate',
    'czekolada',
    'czekoladowe',
    'czekolada',
    'chocolat',
    'schokolade',
    'cioccolato',
  ],
  cocoa: ['cocoa', 'cacao', 'kakao'],
  vanilla: ['vanilla', 'wanilia', 'waniliowe', 'vainilla', 'vanille'],
  pistachio: ['pistachio', 'pistacja', 'pistacje', 'pistacho', 'pistazie'],
  hazelnut: ['hazelnut', 'orzech laskowy', 'laskowy', 'avellana', 'haselnuss'],
  almond: ['almond', 'migdal', 'migdaly', 'almendra', 'mandel'],
  peanut: ['peanut', 'orzeszki ziemne', 'cacahuete', 'erdnuss'],
  peanut_butter: ['peanut butter', 'maslo orzechowe', 'mantequilla de cacahuete', 'erdnussbutter'],
  caramel: ['caramel', 'karmel', 'karmelowe', 'caramelo', 'karamell'],
  salted_caramel: ['salted caramel', 'slony karmel'],
  coffee: ['coffee', 'kawa', 'kawowe', 'espresso', 'cafe', 'kaffee'],
  mint: ['mint', 'mieta', 'mietowe', 'menta', 'minze'],
  basil: ['basil', 'bazylia', 'albahaca'],
  oreo: ['oreo', 'oreos'],
  biscuit: ['biscuit', 'cookie', 'cookies', 'ciastko', 'ciastka', 'herbatnik', 'galleta', 'keks'],
  brownie: ['brownie', 'brownies'],
  honey: ['honey', 'miod', 'miel', 'honig'],
  yoghurt: ['yoghurt', 'yogurt', 'jogurt', 'joghurt'],
  whisky: ['whisky', 'whiskey'],
  rum: ['rum', 'ron'],
  cola: ['cola', 'coke', 'kola'],
  mojito: ['mojito', 'mochito', 'mojitto', 'mohito'],
  white_chocolate: ['white chocolate', 'biala czekolada', 'chocolate blanco', 'weisse schokolade'],
  dark_chocolate: ['dark chocolate', 'gorzka czekolada', 'ciemna czekolada'],
  cinnamon: ['cinnamon', 'cynamon', 'canela', 'zimt'],
  matcha: ['matcha'],
  tiramisu: ['tiramisu'],
  stracciatella: ['stracciatella'],
});

/** Multi-word phrases, longest first, so "peanut butter" beats "peanut". */
const PHRASE_ENTRIES: readonly (readonly [string, string])[] = Object.entries(CONCEPT_LEXICON)
  .flatMap(([concept, forms]) =>
    forms.filter((f) => f.includes(' ')).map((f) => [f, concept] as const),
  )
  .sort((a, b) => b[0].length - a[0].length);

const TOKEN_INDEX: ReadonlyMap<string, string> = new Map(
  Object.entries(CONCEPT_LEXICON).flatMap(([concept, forms]) =>
    forms.filter((f) => !f.includes(' ')).map((f) => [f, concept] as const),
  ),
);

/* ── profile + role vocabulary ───────────────────────────────────────────── */

const PROFILE_WORDS: Readonly<Record<IntentProfile, readonly string[]>> = Object.freeze({
  sorbet: ['sorbet', 'sorbetto', 'sorbete', 'szerbet'],
  vegan: [
    'vegan',
    'vegan',
    'weganskie',
    'weganski',
    'wegan',
    'vegano',
    'vegane',
    'plant based',
    'roslinne',
  ],
  protein: ['protein', 'proteinowe', 'proteinowy', 'bialkowe', 'proteina', 'high protein'],
  gelato: ['gelato', 'lody', 'ice cream', 'icecream', 'helado', 'eis', 'gelati'],
});

/** §33: words that state a role explicitly. */
const TOPPING_WORDS: readonly string[] = [
  'topping',
  'toppings',
  'posypka',
  'posypki',
  'mix-in',
  'mixin',
  'mix in',
  'na wierzch',
  'pieces at the end',
  'kawalki na koncu',
  'cobertura',
  'streusel',
];

/* ── typo tolerance ──────────────────────────────────────────────────────── */

/** Bounded Levenshtein: returns a distance, giving up as soon as it exceeds `max`. */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length] as number;
}

/**
 * How much misspelling a word of this length may carry. Short words get NO tolerance:
 * at 4 letters an edit distance of 1 turns "lime" into "line" and "rum" into "run",
 * which would be a wrong ingredient rather than a forgiving one.
 */
const toleranceFor = (length: number): number => (length >= 8 ? 2 : length >= 5 ? 1 : 0);

/** Best fuzzy concept for a token, or null. */
function fuzzyConcept(token: string): string | null {
  const tolerance = toleranceFor(token.length);
  if (tolerance === 0) return null;
  let best: { concept: string; distance: number } | null = null;
  for (const [form, concept] of TOKEN_INDEX) {
    const distance = boundedEditDistance(token, form, tolerance);
    if (distance <= tolerance && (best === null || distance < best.distance)) {
      best = { concept, distance };
    }
  }
  return best?.concept ?? null;
}

/* ── parsing ─────────────────────────────────────────────────────────────── */

/** §31: the profile stated or clearly implied by the whole utterance. */
export function detectProfile(text: string): IntentProfile | null {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  // Order matters: "vegan sorbet" is a Sorbet the user wants vegan — but a stated
  // Sorbet is the profile, and vegan/protein are their own profiles only when no
  // more specific frozen-dessert word is present. Sorbet and Protein are checked
  // before the generic gelato/"lody"/"ice cream" family for the same reason.
  const order: readonly IntentProfile[] = ['sorbet', 'protein', 'vegan', 'gelato'];
  for (const profile of order) {
    for (const word of PROFILE_WORDS[profile]) {
      const pattern = new RegExp(
        `(?:^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
      );
      if (pattern.test(normalized)) return profile;
    }
  }
  return null;
}

/** True when the utterance explicitly assigns a topping/mix-in role (§33). */
export function detectStatedRole(text: string): IntentRole | null {
  const normalized = normalizeIntentText(text);
  return TOPPING_WORDS.some((word) => normalized.includes(word)) ? 'topping' : null;
}

const STOP_WORDS = new Set([
  'i',
  'a',
  'an',
  'the',
  'and',
  'with',
  'of',
  'for',
  'to',
  'want',
  'wanna',
  'make',
  'making',
  'my',
  'me',
  'some',
  'please',
  'add',
  'plus',
  'in',
  'on',
  'at',
  'end',
  'pieces',
  'chce',
  'chcialbym',
  'zrobic',
  'lodow',
  'z',
  'i',
  'oraz',
  'do',
  'na',
  'w',
  'quiero',
  'con',
  'y',
  'ich',
  'mit',
  'und',
  'moje',
  'mojego',
]);

/**
 * Parse one utterance (typed or spoken) into terms + profile.
 *
 * Voice sentences (§20) need no separate path: "I want mango sorbet with raspberries
 * and white chocolate pieces" is the same input as three typed words, which is exactly
 * what §19 asks for.
 */
export function parseIntent(text: string): ParsedIntent {
  const normalized = normalizeIntentText(text);
  const profile = detectProfile(text);
  const statedRole = detectStatedRole(text);
  if (!normalized) return { terms: [], profile };

  const terms: IntentTerm[] = [];
  const seen = new Set<string>();
  let remaining = normalized;

  // Phrases first — longest wins, so compound concepts survive tokenisation.
  for (const [phrase, concept] of PHRASE_ENTRIES) {
    if (remaining.includes(phrase) && !seen.has(concept)) {
      seen.add(concept);
      terms.push({ raw: phrase, normalized: phrase, concept, role: statedRole, fuzzy: false });
      remaining = remaining.replace(phrase, ' ');
    }
  }

  for (const token of remaining.split(' ').filter(Boolean)) {
    if (STOP_WORDS.has(token) || token.length < 3) continue;
    // A profile word is the profile, not an ingredient.
    if (Object.values(PROFILE_WORDS).some((words) => words.includes(token))) continue;
    if (TOPPING_WORDS.includes(token)) continue;

    const exact = TOKEN_INDEX.get(token) ?? null;
    const concept = exact ?? fuzzyConcept(token);
    const key = concept ?? `raw:${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({
      raw: token,
      normalized: token,
      concept,
      role: statedRole,
      fuzzy: exact === null && concept !== null,
    });
  }

  return { terms, profile };
}
