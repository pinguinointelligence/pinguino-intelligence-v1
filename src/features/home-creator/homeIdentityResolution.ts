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

export type IdentityResolution =
  | { readonly kind: 'resolved'; readonly row: SafeMapperSearchRow; readonly exact: boolean }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly SafeMapperSearchRow[] }
  | { readonly kind: 'unresolved' };

/** How many real products a §23 choice may show before it stops being a choice. */
export const MAX_AMBIGUITY_CANDIDATES = 6;

const displayOf = (row: SafeMapperSearchRow): string =>
  normalizeIntentText(row.ingredient_name_display ?? '');

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
  const name = displayOf(row);
  const wanted = normalizeIntentText(term);
  if (!wanted) return 0;
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
    .sort((a, b) => b.score - a.score || a.index - b.index);

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
