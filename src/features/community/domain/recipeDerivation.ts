/**
 * „Użyj tej receptury" / „Stwórz moją wersję" — the PURE decision layer (§20–§22).
 *
 * The wiring around this is unavoidably impure (read the source, save a recipe,
 * stamp lineage, navigate). This module holds the parts that are decisions
 * rather than IO, so the rules can be tested without a database:
 *
 *   * what a copy and a remix are NAMED and how they differ;
 *   * which title a derived recipe gets, and that it never silently
 *     impersonates the original;
 *   * that the derived recipe is built from the SOURCE VERSION's payload and
 *     nothing of the current user's draft leaks into it;
 *   * the ordered plan of an end-to-end derivation, including the fact that
 *     the source is never written to.
 */
import type { LineageRelation } from './lineage';

export type DerivationSource =
  | { readonly kind: 'publication'; readonly publicationId: string; readonly handle: string; readonly slug: string }
  | { readonly kind: 'share'; readonly shareLinkId: string };

export interface DerivationInput {
  readonly relation: LineageRelation;
  readonly source: DerivationSource;
  /** The immutable source version's payload, exactly as the server returned it. */
  readonly recipeInput: unknown;
  readonly sourceTitle: string;
  readonly sourceCreatorDisplayName: string;
  /** Engine/config provenance of the SOURCE snapshot, carried forward. */
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly totalBatchG: number;
}

export type DerivationRefusal =
  | 'not_entitled'
  | 'source_unavailable'
  | 'missing_recipe_input'
  | 'already_in_flight';

/**
 * The title a derived recipe gets.
 *
 * A copy keeps the original name — it IS that recipe, in your library.
 * A remix is renamed, because a remix that silently carries the original's
 * name would misrepresent somebody else's work as the version you then edit.
 * Attribution is stored separately and cannot be edited away (§22); this is
 * only about not creating avoidable confusion in a recipe list.
 */
export function derivedTitle(relation: LineageRelation, sourceTitle: string): string {
  const base = sourceTitle.trim() || 'Receptura';
  if (relation === 'copy') return base;
  return `${base} — moja wersja`.slice(0, 120);
}

/** One ordered step of a derivation, for tests and for the report. */
export type DerivationStep =
  | 'read_source'
  | 'create_independent_recipe'
  | 'stamp_lineage_and_usage'
  | 'open_in_editor';

/**
 * The plan, in order. `create_independent_recipe` goes through the EXISTING
 * recipe-persistence path (`RecipesRepository.createRecipe` →
 * `create_recipe_with_v1`), which is why recipe saving, versioning and the
 * Engine needed no changes for any of this.
 *
 * Note what is absent: there is no step that writes to the source. A
 * derivation reads the source once and never touches it again.
 */
export const DERIVATION_PLAN: readonly DerivationStep[] = [
  'read_source',
  'create_independent_recipe',
  'stamp_lineage_and_usage',
  'open_in_editor',
];

/**
 * Build the payload for the new independent recipe.
 *
 * It is built ONLY from the source snapshot the server returned. The current
 * user's Studio draft, their machine profile and their goals are deliberately
 * not inputs — copying somebody's recipe must produce THEIR recipe, not a
 * blend of theirs and whatever happened to be open.
 */
export interface DerivedRecipePayload {
  readonly title: string;
  readonly notes: string;
  readonly recipeInput: unknown;
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly totalBatchG: number;
}

export function buildDerivedRecipe(input: DerivationInput): DerivedRecipePayload {
  return {
    title: derivedTitle(input.relation, input.sourceTitle),
    // A human-readable trace in the recipe itself. The AUTHORITATIVE
    // attribution is the recipe_lineage row, which the user cannot edit —
    // this note is a courtesy, never the record.
    notes:
      input.relation === 'remix'
        ? `Na podstawie „${input.sourceTitle}" — ${input.sourceCreatorDisplayName}`
        : `Źródło: „${input.sourceTitle}" — ${input.sourceCreatorDisplayName}`,
    recipeInput: input.recipeInput,
    engineVersion: input.engineVersion,
    configVersion: input.configVersion,
    totalBatchG: input.totalBatchG,
  };
}

/** The arguments the lineage RPC needs, derived from the source shape. */
export function derivationRpcArgs(
  source: DerivationSource,
  relation: LineageRelation,
  derivedRecipeId: string,
): {
  readonly derivedRecipeId: string;
  readonly relation: LineageRelation;
  readonly publicationId: string | null;
  readonly shareLinkId: string | null;
} {
  return {
    derivedRecipeId,
    relation,
    publicationId: source.kind === 'publication' ? source.publicationId : null,
    shareLinkId: source.kind === 'share' ? source.shareLinkId : null,
  };
}

/**
 * Can this derivation start? Entitlement is re-checked by the server on the
 * read, so this is only about not showing a button that cannot work and not
 * firing twice on a double click (§21: a retry is not a second use).
 */
export function canDerive(state: {
  readonly isEntitled: boolean;
  readonly inFlight: boolean;
  readonly sourceAvailable: boolean;
}): { readonly ok: true } | { readonly ok: false; readonly reason: DerivationRefusal } {
  if (state.inFlight) return { ok: false, reason: 'already_in_flight' };
  if (!state.sourceAvailable) return { ok: false, reason: 'source_unavailable' };
  if (!state.isEntitled) return { ok: false, reason: 'not_entitled' };
  return { ok: true };
}
