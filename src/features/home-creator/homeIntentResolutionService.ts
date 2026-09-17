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
 * Candidate ordering is owned by the central Mapper/Search boundary. A generic idea
 * („truskawka”) consumes the owner-frozen concept default (SA-03/SA-04) through
 * `selectApprovedConceptDefault`; an explicit form/brand/exact name keeps the literal
 * path, and HOME asks only when no decision applies or the stated words conflict with
 * it. HOME never substitutes the first broad hit for the product the customer named.
 */
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { materializeCanonicalToolboxIngredient } from '@/data/ingredients/canonicalToolboxIngredient';
import { prepareProductEngineIngredient } from '@/data/products/productEngineHandoff';
import { getProduct } from '@/services/products';
import { searchProducts } from '@/services/globalCatalog';
import {
  searchCanonicalMapperIngredients,
  selectApprovedConceptDefault,
} from '@/services/productPicker/mapperSearch';
import {
  engineIngredientForCatalogSelection,
  resolveCurrentMapperCatalogSelection,
  scannedProductRecipeTarget,
} from '@/features/ingredient-builder/mapperOnlyCatalog';
import type { EngineIngredient } from '@/engine';
import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import type { MapperConceptScope } from '@/features/mapper-search-runtime';
import { catalogueSearchTerms, resolveIdentity } from './homeIdentityResolution';
import { intentSegmentParts, parseIntent, type IntentProfile } from './homeIntentParsing';

/** What one chip resolved to, ready for the UI to act on. */
export interface ResolvedChipIdentity {
  readonly ingredient_id: string;
  readonly ingredient_name_display: string;
}

/** Where a resolved identity came from, for tests, QA evidence and timing marks. */
export interface ChipResolutionProvenance {
  readonly authority: 'SA03_CONCEPT_DEFAULT' | 'LITERAL_CATALOGUE';
  readonly conceptKey?: string;
  readonly decisionId?: string;
  readonly rank?: number;
  /** The frozen SA-04 scope the default was chosen for (`null` = ANY). */
  readonly scope?: string | null;
}

export type ChipResolution =
  | {
      readonly kind: 'resolved';
      readonly row: ResolvedChipIdentity;
      readonly provenance?: ChipResolutionProvenance;
      /** The customer's words for the whole product when one phrase covered several chips. */
      readonly label?: string;
    }
  /** This chip is one word of a phrase another chip of the same idea already names. */
  | { readonly kind: 'covered' }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly SafeMapperSearchRow[] }
  | { readonly kind: 'unresolved' }
  /** The catalogue could not answer at all — honestly distinct from "no such product". */
  | { readonly kind: 'unavailable'; readonly reason: string };

const LITERAL: ChipResolutionProvenance = { authority: 'LITERAL_CATALOGUE' };

/** GELATO inherits the ANY order by the SA-04 freeze, so the two are the same choice. */
export const sameConceptScope = (
  left: string | null | undefined,
  right: string | null | undefined,
): boolean =>
  (left === 'GELATO' ? null : (left ?? null)) === (right === 'GELATO' ? null : (right ?? null));

/** HOME profiles that carry a frozen SA-04 recipe scope; Protein reads the ANY order. */
export const SCOPE_BY_PROFILE: Readonly<Record<IntentProfile, MapperConceptScope | null>> = {
  gelato: 'GELATO',
  sorbet: 'SORBET',
  vegan: 'VEGAN',
  protein: null,
};

/**
 * Resolve one intent chip against the canonical Mapper catalogue.
 *
 * 1. HOME_ADD selection: the chip's own utterance element goes to the central
 *    resolver; a generic concept consumes the frozen default (first legal id in the
 *    owner order — never search page 1, never `results[0]`).
 * 2. A stated qualifier/prepared form with a decision → a real choice over the frozen
 *    order (the customer's words may contradict the default).
 * 3. Anything else (brand words, exact names, unknown concepts) → the literal
 *    catalogue path: an exact label survives, several products are a real choice.
 */
export interface ChipTerm {
  readonly label: string;
  readonly concept: string | null;
  readonly segment?: string;
  readonly utterance?: string;
  readonly segmentIndex?: number;
}

/** The words a chip was said in, as the resolution stage reads them. */
export const chipTermOf = (chip: ChipTerm): ChipTerm => ({
  label: chip.label,
  concept: chip.concept,
  segment: chip.segment,
  utterance: chip.utterance,
  segmentIndex: chip.segmentIndex,
});

/** The listed elements said right before and after the chip's own element, if known. */
function neighboursOf(chip: ChipTerm, segment: string) {
  if (chip.utterance === undefined || chip.segmentIndex === undefined) return undefined;
  const parts = intentSegmentParts(chip.utterance);
  const own = parts[chip.segmentIndex];
  if (!own || own.text !== segment) return undefined;
  const previous = parts[chip.segmentIndex - 1];
  const next = parts[chip.segmentIndex + 1];
  return {
    before:
      previous && own.separatorBefore !== null
        ? { text: previous.text, separator: own.separatorBefore }
        : null,
    after:
      next && next.separatorBefore !== null
        ? { text: next.text, separator: next.separatorBefore }
        : null,
  };
}

export async function resolveChipTerm(
  chip: ChipTerm,
  signal?: AbortSignal,
  context: { readonly profile?: IntentProfile | null } = {},
): Promise<ChipResolution> {
  const segment = chip.segment?.trim() || chip.label;
  const siblings = parseIntent(chip.utterance ?? segment).terms;
  const selection = await selectApprovedConceptDefault({
    text: segment,
    neighbours: neighboursOf(chip, segment),
    focus: {
      text: chip.label,
      hintedConceptKey: chip.concept,
      siblingTexts: siblings.map((term) => term.raw),
    },
    scope: context.profile ? SCOPE_BY_PROFILE[context.profile] : null,
    signal,
  });
  switch (selection.kind) {
    case 'selected':
      return {
        kind: 'resolved',
        row: {
          ingredient_id: selection.row.ingredient_id,
          ingredient_name_display: selection.row.ingredient_name_display,
        },
        provenance: {
          authority: 'SA03_CONCEPT_DEFAULT',
          conceptKey: selection.conceptKey,
          decisionId: selection.decisionId,
          rank: selection.rank,
          scope: selection.scope,
        },
        ...(selection.phraseText ? { label: selection.phraseText } : {}),
      };
    case 'covered':
      return { kind: 'covered' };
    case 'clarify':
      return { kind: 'ambiguous', candidates: selection.rows };
    case 'no_legal_candidate':
      // The concept is recognised and decided, but nothing is legal for it now (or for
      // the recipe scope). Honest: no substitute from a broad name search.
      return { kind: 'unresolved' };
    case 'aborted':
      return { kind: 'unavailable', reason: 'aborted' };
    case 'unavailable':
      return { kind: 'unavailable', reason: selection.reason };
    case 'error':
      return { kind: 'unavailable', reason: selection.message };
    case 'not_applicable':
      break;
  }

  const terms = catalogueSearchTerms(chip);
  if (terms.length === 0) return { kind: 'unresolved' };

  // An exact label is the strongest identity evidence and must survive the handoff
  // unchanged. Broader concept/stem searches are used only when the literal search
  // cannot establish one exact product.
  let firstAmbiguity: readonly SafeMapperSearchRow[] | null = null;
  for (const term of [chip.label.trim(), ...terms].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  )) {
    const outcome = await searchCanonicalMapperIngredients({ text: term, limit: 40, signal });
    if (outcome.kind === 'unavailable') {
      return { kind: 'unavailable', reason: outcome.reason };
    }
    if (outcome.kind === 'error') return { kind: 'unavailable', reason: outcome.message };
    if (outcome.kind === 'aborted') return { kind: 'unavailable', reason: 'aborted' };

    const resolution = resolveIdentity(outcome.rows, term);
    if (resolution.kind === 'resolved' && resolution.exact) {
      return { kind: 'resolved', row: resolution.row, provenance: LITERAL };
    }
    if (resolution.kind === 'ambiguous' && firstAmbiguity === null) {
      firstAmbiguity = resolution.candidates;
    }
    if (resolution.kind === 'resolved' && outcome.rows.length === 1) {
      return { kind: 'resolved', row: resolution.row, provenance: LITERAL };
    }
  }

  return firstAmbiguity
    ? { kind: 'ambiguous', candidates: firstAmbiguity }
    : { kind: 'unresolved' };
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
  const row = await getEngineApprovedIngredientById(ingredientId).catch(() => null);
  if (row) return ingredientRowToEngineIngredient(row);

  // HOME is available before sign-in, while the rich Mapper selection view is
  // authenticated-only. The central resolver still returns the exact legal PI id,
  // so materialise only identities covered by the existing immutable toolbox bridge.
  // This is an exact-id fallback, never a name match or a second ranking pass.
  return materializeCanonicalToolboxIngredient(ingredientId);
}

export interface ExactScannedProductIdentity {
  readonly id: string;
  readonly productCode?: string | null;
  readonly displayName: string;
  readonly entityKind: 'pi_base' | 'commercial_product';
  readonly barcode?: string | null;
}

/**
 * Hydrate a scanner-confirmed product by its exact canonical product id.
 *
 * Once Scanner has established identity, HOME must not feed its display name back
 * into search or collapse a PR/PM article to its generic Mapper slot. The existing
 * product handoff borrows the confirmed reference composition while retaining the
 * product code, UUID and display identity on the recipe line.
 */
export async function hydrateExactScannedProduct(
  scanned: ExactScannedProductIdentity,
): Promise<EngineIngredient | null> {
  const product = await getProduct(scanned.id).catch(() => null);
  if (!product || product.id !== scanned.id) return null;

  if (!product.matched_basement_id) {
    const barcode = scanned.barcode?.trim() ?? '';
    const productCode = product.product_code?.trim() ?? '';
    const scannedCode = scanned.productCode?.trim() ?? '';
    if (
      scanned.entityKind !== 'commercial_product' ||
      !barcode ||
      !productCode ||
      (scannedCode && scannedCode !== productCode)
    )
      return null;

    // This is an exact-GTIN projection reload, not a name search or a ranking pass:
    // the scanner's UUID, PR code and barcode must all identify the same row.
    const hits = await searchProducts({
      query: barcode,
      context: 'BASE',
      marketScope: 'global',
      entityKind: 'commercial_product',
      limit: 20,
    }).catch(() => []);
    const exactHits = hits.filter(
      (hit) =>
        hit.id === scanned.id && hit.productCode === productCode && hit.eans.includes(barcode),
    );
    const hit = scannedProductRecipeTarget(
      exactHits,
      { id: scanned.id, displayName: scanned.displayName, barcode },
      'BASE',
    );
    if (!hit) return null;

    const selection = await resolveCurrentMapperCatalogSelection(
      hit,
      'BASE',
      getEngineApprovedIngredientById,
    );
    if (!selection.ok || selection.kind !== 'catalog_product') return null;
    const ingredient = engineIngredientForCatalogSelection(hit, selection);
    if (!ingredient || 'kind' in ingredient || ingredient.id !== productCode) return null;
    return {
      ...ingredient,
      name: scanned.displayName.trim() || ingredient.name,
    };
  }

  const reference = await getEngineApprovedIngredientById(product.matched_basement_id).catch(
    () => null,
  );
  const handoff = prepareProductEngineIngredient(product, reference);
  if (!handoff.ready || !handoff.ingredient || handoff.blocked_by_red_flags) return null;

  return {
    ...handoff.ingredient,
    // The scanner's confirmed customer-facing identity wins over a stale display
    // projection, while stable recipe identity still comes from the exact product.
    name: scanned.displayName.trim() || handoff.ingredient.name,
  };
}
