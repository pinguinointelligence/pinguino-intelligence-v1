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
import {
  catalogueSearchTerms,
  resolveIdentity,
  type IdentityResolution,
} from './homeIdentityResolution';

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
 * The chip's canonical CONCEPT is tried BEFORE the user's raw word. The catalogue is
 * named in English (`STRAWBERRIES`) while §25 invites `truskawka` / `fresa` /
 * `Erdbeere`, so searching the raw word alone resolved nothing for every non-English
 * user — the intent was understood perfectly and then thrown away at the catalogue
 * boundary. An `unavailable` outcome short-circuits immediately: retrying a catalogue
 * outage would let it masquerade as "no such product".
 */
export async function resolveChipTerm(
  chip: { readonly label: string; readonly concept: string | null },
  signal?: AbortSignal,
): Promise<ChipResolution> {
  for (const term of catalogueSearchTerms(chip)) {
    // A wide fetch, then rank, then show at most MAX_AMBIGUITY_CANDIDATES. "strawberr"
    // matches 26 rows; taking only the first 12 in catalogue order would drop the
    // plain fruit before the plain-form preference ever got to lift it.
    const outcome = await searchCanonicalMapperIngredients({ text: term, limit: 40, signal });
    if (outcome.kind === 'unavailable') {
      return { kind: 'unavailable', reason: outcome.reason };
    }
    if (outcome.kind === 'error') return { kind: 'unavailable', reason: outcome.message };
    if (outcome.kind === 'aborted') return { kind: 'unavailable', reason: 'aborted' };

    const decision: IdentityResolution = resolveIdentity(outcome.rows, term);
    if (decision.kind === 'resolved') return { kind: 'resolved', row: decision.row };
    if (decision.kind === 'ambiguous') {
      return { kind: 'ambiguous', candidates: decision.candidates };
    }
    // Nothing under this term — fall through and try the next one.
  }
  return { kind: 'unresolved' };
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
