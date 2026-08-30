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
 * IO lives here; the RANKING that picks between candidates is pure and lives in
 * `homeIdentityResolution.ts`, so the decision is testable without a database.
 */
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { searchCanonicalMapperIngredients } from '@/services/productPicker/mapperSearch';
import type { EngineIngredient } from '@/engine';
import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import { resolveIdentity, type IdentityResolution } from './homeIdentityResolution';

/** What one chip resolved to, ready for the UI to act on. */
export type ChipResolution =
  | { readonly kind: 'resolved'; readonly row: SafeMapperSearchRow }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly SafeMapperSearchRow[] }
  | { readonly kind: 'unresolved' }
  /** The catalogue could not answer at all — honestly distinct from "no such product". */
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Resolve one intent term against the canonical Mapper catalogue.
 *
 * `term` is the user's own word. The search is the SAME RPC the recipe picker and the
 * Products page use, so HOME can never see a product Pro cannot.
 */
export async function resolveChipTerm(term: string, signal?: AbortSignal): Promise<ChipResolution> {
  const outcome = await searchCanonicalMapperIngredients({ text: term, limit: 12, signal });
  switch (outcome.kind) {
    case 'results': {
      const decision: IdentityResolution = resolveIdentity(outcome.rows, term);
      if (decision.kind === 'resolved') return { kind: 'resolved', row: decision.row };
      if (decision.kind === 'ambiguous') {
        return { kind: 'ambiguous', candidates: decision.candidates };
      }
      return { kind: 'unresolved' };
    }
    case 'unavailable':
      return { kind: 'unavailable', reason: outcome.reason };
    case 'error':
      return { kind: 'unavailable', reason: outcome.message };
    case 'aborted':
      return { kind: 'unavailable', reason: 'aborted' };
  }
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
