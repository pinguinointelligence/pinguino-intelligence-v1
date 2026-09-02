/**
 * §22–§24 — intent term → REAL Gellatti identity. PURE ranking; the search itself is
 * `searchCanonicalMapperIngredients`, the same canonical RPC the Pro picker uses.
 *
 * §22 is the rule this exists to enforce: recipe matching must never run against
 * guessed product text. So every term ends in exactly one of three honest states —
 *
 *   resolved   — one clear Mapper identity;
 *   ambiguous  — several materially different real products; the USER picks (§23);
 *   unresolved — nothing in the catalogue; never invented, never substituted.
 *
 * §24: `ingredient_id` IS the canonical identity. Where Gellatti already collapses
 * several SKUs onto one identity, the search returns one row and the term resolves
 * automatically — this module adds no second equivalence layer of its own.
 */
import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import { normalizeIntentText } from './homeIntentParsing';

/**
 * The catalogue search terms to try for one chip, in order.
 *
 * THE BUG THIS EXISTS TO FIX (found in browser QA, 2026-08-30): the Mapper catalogue
 * is named in ENGLISH (`STRAWBERRIES`), while §25 invites the user to type
 * `truskawka`, `fresa` or `Erdbeere`. Searching the user's raw word therefore matched
 * NOTHING for every non-English input — the intent was understood perfectly and then
 * thrown away at the catalogue boundary.
 *
 * The parser already emits a canonical `concept` for exactly this reason, so the
 * concept is tried FIRST and the raw word second. This is not a translation layer and
 * it invents no equivalence (§24): the concept is only a search string, and whatever
 * the catalogue returns still goes through the normal ranking and the §23 choice.
 */
export function catalogueSearchTerms(chip: {
  readonly label: string;
  readonly concept: string | null;
}): readonly string[] {
  const terms: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !terms.includes(trimmed)) terms.push(trimmed);
  };

  if (chip.concept !== null) {
    // Concepts are snake_case keys (`peanut_butter`); the catalogue is spaced words.
    const concept = chip.concept.replace(/_/g, ' ');
    // THE STEM GOES FIRST, and that ordering is the whole fix. The catalogue search is
    // a server-side ILIKE on the raw term, so `%strawberry%` matches 24 rows and
    // MISSES `STRAWBERRIES · Fresh Fruit` entirely, while `%strawberr%` matches 26 and
    // includes it. Client-side stemming cannot rescue a row the query never returned.
    // And because resolution stops at the first term that yields results, searching
    // the singular first would end the search before the stem was ever tried — which
    // is exactly what staging showed: a §23 list of five pastes and a beverage, with
    // the actual fruit absent.
    push(stemLastWord(concept));
    push(concept);
  }
  push(stemLastWord(chip.label));
  push(chip.label);
  return terms;
}

/** Stem only the final word — `peanut butter` → `peanut butt` would be nonsense. */
const stemLastWord = (phrase: string): string => {
  const words = phrase.trim().split(' ');
  const last = words[words.length - 1];
  if (last === undefined) return phrase;
  words[words.length - 1] = matchStem(last);
  return words.join(' ');
};

export type IdentityResolution =
  | { readonly kind: 'resolved'; readonly row: SafeMapperSearchRow; readonly exact: boolean }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly SafeMapperSearchRow[] }
  | { readonly kind: 'unresolved' };

/** How many real products a §23 choice may show before it stops being a choice. */
export const MAX_AMBIGUITY_CANDIDATES = 6;

const displayOf = (row: SafeMapperSearchRow): string =>
  normalizeIntentText(row.ingredient_name_display ?? '');

/**
 * A minimal singular/plural stem, for MATCHING ONLY.
 *
 * Found in staging QA: the concept is `strawberry` and the catalogue row is
 * `STRAWBERRIES · Fresh Fruit`. "strawberries" does not contain "strawberry", so the
 * fresh fruit scored ZERO while `CHUPA CHUPS STRAWBERRY LOLLIPOP` scored a match — the
 * plain ingredient was ranked below a novelty sweet purely on English plurals.
 *
 * Deliberately tiny and suffix-only. It is not a stemmer, not a lemmatiser and never
 * touches the stored value: both sides are stemmed to compare, and the row's real name
 * is what the user is shown and what the recipe records.
 */
export function matchStem(value: string): string {
  const word = value.toLowerCase();
  if (word.endsWith('ies')) return word.slice(0, -3);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  if (word.endsWith('y')) return word.slice(0, -1);
  return word;
}

/** Stem every word of a phrase so `strawberries fresh fruit` matches `strawberry`. */
const stemPhrase = (value: string): string => value.split(' ').map(matchStem).join(' ');

/**
 * Subcategories that represent the PLAIN form of an ingredient.
 *
 * A person who types `truskawka` means strawberries. The catalogue also contains
 * CHUPA CHUPS STRAWBERRY LOLLIPOP, FANTA STRAWBERRY and several PreGel pastes, all of
 * which match the word equally well. Offering the lollipop first is a bad list.
 *
 * This is ORDERING ONLY and never an auto-adopt: §23 still shows the choice and the
 * user still picks, so a professional who genuinely wants the paste loses nothing but
 * a scroll. It is deliberately not a substitution rule (§22) — nothing is swapped, and
 * a plain form that does not exist is simply absent from the list.
 */
const PLAIN_FORM_SUBCATEGORIES: ReadonlySet<string> = new Set(['fresh_fruit_profile']);

export const isPlainForm = (row: SafeMapperSearchRow): boolean =>
  row.ingredient_subcategory !== null && PLAIN_FORM_SUBCATEGORIES.has(row.ingredient_subcategory);

/**
 * Score one row against the searched term. Higher is better; ties keep catalogue order,
 * which is already the canonical relevance order from the RPC.
 *
 *  3 — the display name IS the term
 *  2 — the display name starts with the term ("OREO ORIGINAL" for "oreo")
 *  1 — the term appears somewhere in the name
 *  0 — matched only through the internal name / category
 */
export function scoreCandidate(row: SafeMapperSearchRow, term: string): number {
  const rawName = displayOf(row);
  const rawWanted = normalizeIntentText(term);
  if (!rawWanted) return 0;
  // Exact/prefix are judged on the literal text first, so a true exact match always
  // outranks a match that only survives stemming.
  if (rawName === rawWanted) return 3;
  if (rawName.startsWith(`${rawWanted} `) || rawName.startsWith(rawWanted)) return 2;

  const name = stemPhrase(rawName);
  const wanted = stemPhrase(rawWanted);
  if (name === wanted) return 3;
  if (name.startsWith(`${wanted} `) || name.startsWith(wanted)) return 2;
  if (name.includes(wanted)) return 1;
  return 0;
}

/**
 * Decide what one term resolved to.
 *
 * A single result is the identity. Several results are a genuine §23 choice UNLESS one
 * is an exact name match and no other is — "oreo" against `OREO` plus `OREO CRUMBS`
 * has an obvious answer, and asking anyway is the kind of friction §58 warns about.
 */
export function resolveIdentity(
  rows: readonly SafeMapperSearchRow[],
  term: string,
): IdentityResolution {
  if (rows.length === 0) return { kind: 'unresolved' };

  const scored = rows
    .map((row, index) => ({ row, index, score: scoreCandidate(row, term) }))
    // Name relevance first, then the plain form of the ingredient, then catalogue
    // order. The plain-form nudge only reorders a list the user still chooses from.
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(isPlainForm(b.row)) - Number(isPlainForm(a.row)) ||
        a.index - b.index,
    );

  const best = scored[0];
  if (!best || best.score === 0) {
    // Nothing matched by NAME. These are category/internal-name hits — real products,
    // but not something to adopt silently on the user's behalf.
    return rows.length === 1 && rows[0]
      ? { kind: 'resolved', row: rows[0], exact: false }
      : { kind: 'ambiguous', candidates: rows.slice(0, MAX_AMBIGUITY_CANDIDATES) };
  }

  const exactMatches = scored.filter((entry) => entry.score === 3);
  if (exactMatches.length === 1 && exactMatches[0]) {
    return { kind: 'resolved', row: exactMatches[0].row, exact: true };
  }

  if (rows.length === 1 && rows[0]) {
    return { kind: 'resolved', row: rows[0], exact: best.score === 3 };
  }

  return {
    kind: 'ambiguous',
    candidates: scored.slice(0, MAX_AMBIGUITY_CANDIDATES).map((entry) => entry.row),
  };
}
