/**
 * §22–§24, §56 — turn intent chips into REAL Gellatti identities, then into recipe
 * lines, using exactly the paths the Pro picker uses.
 *
 * The whole point of routing through `searchCanonicalMapperIngredients` and
 * `getEngineApprovedIngredientById` rather than anything HOME-specific is §22: a
 * recipe line must be a canonical Mapper identity with real composition, never a term
 * the user typed. If the catalogue cannot produce one, the chip stays unresolved and
 * HOME says so — it never falls back to "something similar".
 *
 * Candidate ordering is owned by the central Mapper/Search boundary. HOME consumes
 * its first legal row directly; it must not apply a second local ranker afterward.
 */
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { searchCanonicalMapperIngredients } from '@/services/productPicker/mapperSearch';
import type { EngineIngredient } from '@/engine';
import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';

/** What one chip resolved to, ready for the UI to act on. */
export type ChipResolution =
  | { readonly kind: 'resolved'; readonly row: SafeMapperSearchRow }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly SafeMapperSearchRow[] }
  | { readonly kind: 'unresolved' }
  /** The catalogue could not answer at all — honestly distinct from "no such product". */
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Resolve one intent chip against the canonical Mapper catalogue.
 *
 * The search is the SAME RPC the recipe picker and the Products page use, so HOME can
 * never see a product Pro cannot.
 *
 * The raw label is handed to the shared search boundary exactly once. That boundary
 * owns multilingual alias/concept interpretation; HOME must not apply a second,
 * competing stem or concept rewrite before the central resolver runs.
 */
export async function resolveChipTerm(
  chip: { readonly label: string; readonly concept: string | null },
  signal?: AbortSignal,
): Promise<ChipResolution> {
  const term = chip.label.trim();
  if (!term) return { kind: 'unresolved' };

  // The shared boundary expands central aliases and returns the legal candidates in
  // authoritative order. HOME's contract is to auto-select #1; PRO remains manual.
  const outcome = await searchCanonicalMapperIngredients({ text: term, limit: 40, signal });
  if (outcome.kind === 'unavailable') {
    return { kind: 'unavailable', reason: outcome.reason };
  }
  if (outcome.kind === 'error') return { kind: 'unavailable', reason: outcome.message };
  if (outcome.kind === 'aborted') return { kind: 'unavailable', reason: 'aborted' };

  const first = outcome.rows[0];
  return first ? { kind: 'resolved', row: first } : { kind: 'unresolved' };
}

/**
 * Hydrate a resolved identity into a full `EngineIngredient` with real composition.
 *
 * `getEngineApprovedIngredientById` re-reads the row fresh by stable id against the
 * Base-approved view — the same call `ServerIngredientPicker.add()` makes. A search
 * row alone is NOT enough: it carries no composition, and a recipe line built from one
 * would be an ingredient with invented science.
 */
export async function hydrateIngredient(ingredientId: string): Promise<EngineIngredient | null> {
  const row = await getEngineApprovedIngredientById(ingredientId);
  return row ? ingredientRowToEngineIngredient(row) : null;
}
