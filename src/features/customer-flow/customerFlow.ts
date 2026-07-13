/**
 * PINGÜINO Customer Flow — the PURE, deterministic conversational state machine
 * (Agent B). It collects a customer's natural-language intent, resolves the
 * visible product type (with INTERNAL chocolate routing and an honest protein
 * gap), handles device presets + batch, and offers the new-vs-ready fork.
 *
 * REUSE, don't duplicate: all flavor / profile detection and the internal
 * chocolate routing come from the locked spine parser `normalizeRecipeIntent`
 * (`@/spine`). This layer only adds the customer-facing type mapping, the
 * editable flavor chips, the honest gap for unsupported intents, and the
 * missing-information logic. No engine math, no grams, no IO, no clock, no
 * randomness — every function returns NEW state.
 */
import { normalizeRecipeIntent } from '@/spine';
import type { NormalizedRecipeIntent, ProductProfile, RawRecipeIntentInput } from '@/spine';
import type { ProductCategory } from '@/engine';
import {
  CHOCOLATE_FLAVOR_TAGS,
  CUSTOMER_PRODUCT_TYPE_CHOICES,
  CUSTOMER_TYPE_TO_SPINE_PROFILE_INPUT,
  SPINE_PROFILE_TO_ENGINE_CATEGORY,
  type CustomerFlowQuestionId,
  type CustomerProductType,
  type RecipePath,
} from './types';
import { parseBatchFromText } from './naturalLanguageBatch';
import { detectPolishFlavorTags } from './polishFlavorSynonyms';
import {
  approvedMassForMode,
  isNinjaMode,
  servingModeById,
  temperatureForMode,
  type ServingMode,
  type ServingModeId,
  type SupportedTemperatureC,
} from './servingMode';

/** De-duplicate a tag list while preserving first-seen order. */
const dedupe = (tags: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
};

/* ------------------------------------------------------------------------ *
 * State                                                                     *
 * ------------------------------------------------------------------------ */

export interface CustomerFlowState {
  /** The customer's natural-language intent, captured verbatim. */
  rawText: string;
  /** Flavor tags the customer removed (corrections to the parsed chips). */
  removedFlavorTags: readonly string[];
  /** Flavor tags the customer added by hand (corrections to the parsed chips). */
  addedFlavorTags: readonly string[];
  /** The visible product type the customer explicitly chose, or null. */
  explicitType: CustomerProductType | null;
  /** The selected serving / machine mode (one of the six), or null. */
  mode: ServingModeId | null;
  /** A batch size the customer set directly, in grams, or null. */
  explicitBatchGrams: number | null;
  /** The chosen recipe path (new vs ready), or null. */
  recipePath: RecipePath | null;
}

export interface CreateCustomerFlowInput {
  text?: string;
}

/** Fresh flow state from an optional opening natural-language message. */
export function createCustomerFlow(input: CreateCustomerFlowInput = {}): CustomerFlowState {
  return {
    rawText: (input.text ?? '').trim(),
    removedFlavorTags: [],
    addedFlavorTags: [],
    explicitType: null,
    mode: null,
    explicitBatchGrams: null,
    recipePath: null,
  };
}

/* ------------------------------------------------------------------------ *
 * Reducers (each returns a NEW state)                                       *
 * ------------------------------------------------------------------------ */

export function setProductType(state: CustomerFlowState, type: CustomerProductType): CustomerFlowState {
  return { ...state, explicitType: type };
}

/** Remove a parsed flavor chip (correction). Idempotent. */
export function removeFlavorChip(state: CustomerFlowState, tag: string): CustomerFlowState {
  if (state.removedFlavorTags.includes(tag)) return state;
  return {
    ...state,
    removedFlavorTags: [...state.removedFlavorTags, tag],
    // A re-removed tag can never be simultaneously added.
    addedFlavorTags: state.addedFlavorTags.filter((t) => t !== tag),
  };
}

/** Add a corrected flavor chip by hand. Idempotent. */
export function addFlavorChip(state: CustomerFlowState, tag: string): CustomerFlowState {
  const clean = tag.trim().toLowerCase();
  if (clean === '') return state;
  const alreadyActive = activeFlavorChips(state).includes(clean);
  const next: CustomerFlowState = {
    ...state,
    // Adding a tag cancels a prior removal of the same tag.
    removedFlavorTags: state.removedFlavorTags.filter((t) => t !== clean),
    addedFlavorTags: alreadyActive ? state.addedFlavorTags : dedupe([...state.addedFlavorTags, clean]),
  };
  return next;
}

/**
 * Select one of the six serving / machine modes. When a Ninja mode is involved
 * (either the old or the new one), any hand-set batch is cleared so the owner-
 * approved preset mass applies — so Ninja Gelato → Ninja Swirl re-derives 700 → 480.
 * For direct/fresh ↔ direct/fresh switches a hand-typed batch is kept.
 */
export function selectServingMode(state: CustomerFlowState, mode: ServingModeId): CustomerFlowState {
  if (mode === state.mode) return state;
  const ninjaInvolved = isNinjaMode(mode) || isNinjaMode(state.mode);
  return { ...state, mode, ...(ninjaInvolved ? { explicitBatchGrams: null } : {}) };
}

export function setBatchGrams(state: CustomerFlowState, grams: number): CustomerFlowState {
  if (!Number.isFinite(grams) || grams <= 0) return state;
  return { ...state, explicitBatchGrams: Math.round(grams) };
}

export function chooseRecipePath(state: CustomerFlowState, path: RecipePath): CustomerFlowState {
  return { ...state, recipePath: path };
}

/* ------------------------------------------------------------------------ *
 * Flavor chips                                                              *
 * ------------------------------------------------------------------------ */

/** Parse the raw text through the locked spine parser (detection only). */
function spineIntent(state: CustomerFlowState): NormalizedRecipeIntent {
  const input: RawRecipeIntentInput = {
    ...(state.rawText !== '' ? { flavorText: state.rawText } : {}),
    ...(state.explicitType !== null
      ? { productProfile: CUSTOMER_TYPE_TO_SPINE_PROFILE_INPUT[state.explicitType] }
      : {}),
  };
  return normalizeRecipeIntent({ input });
}

/**
 * The flavor tags detected from the raw text (parse only): the locked spine
 * parse PLUS the customer-flow Polish synonym pass, so inflected Polish words
 * (e.g. "maliną", "czekoladą") are not silently dropped before retention runs.
 * Spine tags keep their detection order; synonym-only tags are appended.
 */
export function detectedFlavorTags(state: CustomerFlowState): string[] {
  return dedupe([...spineIntent(state).flavorTags, ...detectPolishFlavorTags(state.rawText)]);
}

/**
 * The customer-editable flavor chips: detected tags (spine + Polish synonyms)
 * minus the ones the customer removed, plus the ones the customer added.
 * Deterministic order: surviving detected tags first (in detection order),
 * then added tags.
 */
export function activeFlavorChips(state: CustomerFlowState): string[] {
  const detectedRaw = dedupe([
    ...spineIntent(state).flavorTags,
    ...detectPolishFlavorTags(state.rawText),
  ]);
  const detected = detectedRaw.filter((t) => !state.removedFlavorTags.includes(t));
  return dedupe([...detected, ...state.addedFlavorTags]);
}

/**
 * True when the locked spine flavor parser RECOGNIZES this tag as a known flavor
 * (e.g. 'chocolate', 'raspberry', 'whisky'). A hand-typed tag the parser does not
 * know (e.g. 'basil', 'mint') is NOT recognized. Pure — same tag, same answer.
 * Used only to pick an honest unresolved status; it never fabricates a dose.
 */
export function isRecognizedFlavorTag(tag: string): boolean {
  const clean = tag.trim().toLowerCase();
  if (clean === '') return false;
  return normalizeRecipeIntent({ input: { flavorText: clean } }).flavorTags.includes(clean);
}

/* ------------------------------------------------------------------------ *
 * Product-type resolution (visible type + internal engine profile)          *
 * ------------------------------------------------------------------------ */

export type ProductTypeStatus =
  | 'resolved' // we know the visible type + internal engine profile
  | 'unknown' // ask the Gelato/Sorbet/Vegan/Protein question
  | 'unsupported'; // honest gap (e.g. protein has no engine profile)

export interface ProductTypeResolution {
  status: ProductTypeStatus;
  /** The visible customer type, or null when still unknown. */
  userFacingType: CustomerProductType | null;
  /** The internal spine engine profile, or null when unknown/unsupported. */
  internalProfile: ProductProfile | null;
  /** The engine ProductCategory, or null when unknown/unsupported. */
  engineCategory: ProductCategory | null;
  /** True when chocolate was routed INTERNALLY (customer still sees Gelato). */
  chocolateRoutedInternally: boolean;
  /** The unsupported intent code when status is 'unsupported' (e.g. 'protein'). */
  unsupported: string | null;
  /** Structured note codes — never fabricated user text. */
  notes: string[];
}

/** Did the spine flag this input as unsupported for the given raw value? */
function unsupportedInput(intent: NormalizedRecipeIntent, value: string): boolean {
  return intent.warnings.some(
    (w) => w.code === 'unsupported_product_profile' && w.context?.input === value,
  );
}

/**
 * Resolve the visible product type and the internal engine profile.
 *
 * The customer NEVER chooses "Chocolate": a chocolate intent keeps the visible
 * type Gelato while the internal profile becomes `chocolate_gelato`. Protein has
 * no supported engine profile, so it resolves to an honest 'unsupported' gap
 * instead of silently becoming Standard Gelato.
 */
export function resolveProductType(state: CustomerFlowState): ProductTypeResolution {
  const intent = spineIntent(state);
  const notes: string[] = [];

  // Honest gap: explicit protein choice, or protein detected in the text.
  const proteinUnsupported =
    state.explicitType === 'protein' || unsupportedInput(intent, 'protein');
  if (proteinUnsupported) {
    notes.push('customer_flow.protein_unsupported');
    return {
      status: 'unsupported',
      userFacingType: 'protein',
      internalProfile: null,
      engineCategory: null,
      chocolateRoutedInternally: false,
      unsupported: 'protein',
      notes,
    };
  }

  const chocolateActive = activeFlavorChips(state).some((t) => CHOCOLATE_FLAVOR_TAGS.has(t));

  const resolved = (
    internalProfile: ProductProfile,
    userFacingType: CustomerProductType,
    chocolateRouted: boolean,
  ): ProductTypeResolution => ({
    status: 'resolved',
    userFacingType,
    internalProfile,
    engineCategory: SPINE_PROFILE_TO_ENGINE_CATEGORY[internalProfile],
    chocolateRoutedInternally: chocolateRouted,
    unsupported: null,
    notes,
  });

  // Explicit visible choice wins for the customer-facing type.
  if (state.explicitType === 'sorbet') {
    if (chocolateActive) notes.push('customer_flow.chocolate_sorbet_kept_as_sorbet');
    return resolved('sorbet', 'sorbet', false);
  }
  if (state.explicitType === 'vegan') {
    return resolved('vegan_gelato', 'vegan', false);
  }
  if (state.explicitType === 'gelato') {
    if (chocolateActive) notes.push('customer_flow.chocolate_routed_internally');
    return chocolateActive
      ? resolved('chocolate_gelato', 'gelato', true)
      : resolved('standard_gelato', 'gelato', false);
  }

  // No explicit choice — derive from the spine parse of the text.
  // Vegan / sorbet come straight from the spine; chocolate is chip-gated so a
  // corrected chip is honored; a plain gelato with no product word stays unknown.
  if (intent.productProfile === 'vegan_gelato') {
    return resolved('vegan_gelato', 'vegan', false);
  }
  if (intent.productProfile === 'sorbet') {
    return resolved('sorbet', 'sorbet', false);
  }
  if (chocolateActive) {
    notes.push('customer_flow.chocolate_routed_internally');
    return resolved('chocolate_gelato', 'gelato', true);
  }

  return {
    status: 'unknown',
    userFacingType: null,
    internalProfile: null,
    engineCategory: null,
    chocolateRoutedInternally: false,
    unsupported: null,
    notes,
  };
}

/* ------------------------------------------------------------------------ *
 * Batch resolution (device auto-set + confirm-once + text batch)            *
 * ------------------------------------------------------------------------ */

export type BatchSource =
  | 'user' // set directly by the customer
  | 'text' // recognized in the natural-language intent
  | 'mode_ninja' // owner-approved Ninja preset mass (auto-set, skip the question)
  | 'none'; // nothing supplied yet

export interface BatchResolution {
  batchGrams: number | null;
  /** True when the batch question can be SKIPPED (already known reliably). */
  satisfied: boolean;
  source: BatchSource;
  /** True when the batch question should still be asked. */
  askBatch: boolean;
  notes: string[];
}

/**
 * Resolve the batch. Priority: an explicit customer batch, then a batch stated in
 * the text, then a Ninja machine mode's OWNER-APPROVED preset mass (auto-set, skip
 * the question — never derived from ml), else nothing (ask).
 *
 * "Never ask twice": a batch already known reliably (user / text / Ninja preset)
 * sets `askBatch = false`. Direct / Fresh modes carry no preset mass, so they ask
 * the batch question only when it is not already known.
 */
export function resolveBatch(state: CustomerFlowState): BatchResolution {
  const notes: string[] = [];

  if (state.explicitBatchGrams !== null) {
    return { batchGrams: state.explicitBatchGrams, satisfied: true, source: 'user', askBatch: false, notes };
  }

  const textBatch = parseBatchFromText(state.rawText);
  if (textBatch.grams !== null) {
    notes.push('customer_flow.batch_recognized_from_text');
    return { batchGrams: textBatch.grams, satisfied: true, source: 'text', askBatch: false, notes };
  }
  if (textBatch.volumeStatedMl !== null) {
    // A volume was stated but we never equate ml with grams — capture, don't guess.
    notes.push('customer_flow.batch_volume_needs_density');
  }

  // A Ninja machine mode carries an owner-approved recipe mass → auto-set, skip the
  // batch question. These grams are approved presets, NEVER derived from container ml.
  const ninjaMass = approvedMassForMode(state.mode);
  if (ninjaMass !== null && ninjaMass > 0) {
    notes.push('customer_flow.batch_from_ninja_mode');
    return { batchGrams: ninjaMass, satisfied: true, source: 'mode_ninja', askBatch: false, notes };
  }

  return { batchGrams: null, satisfied: false, source: 'none', askBatch: true, notes };
}

/* ------------------------------------------------------------------------ *
 * Serving / machine mode routing (visible mode → supported Engine cell)     *
 * ------------------------------------------------------------------------ */

export interface ServingRouteResolution {
  /** The selected mode, or null when none is chosen yet. */
  mode: ServingMode | null;
  /** The existing temperature-aware Engine cell this mode routes to, or null. */
  temperatureC: SupportedTemperatureC | null;
}

/**
 * Resolve the internal temperature route for the selected mode. `Świeże`,
 * `Ninja Gelato` and `Ninja Swirl` are customer-facing ALIASES to existing Engine
 * cells (−11 / −13 / −11) — no new Engine is created here. The product PROFILE is
 * resolved separately by `resolveProductType` (chocolate stays internal).
 */
export function resolveServingRoute(state: CustomerFlowState): ServingRouteResolution {
  return {
    mode: servingModeById(state.mode),
    temperatureC: temperatureForMode(state.mode),
  };
}

/* ------------------------------------------------------------------------ *
 * Missing-information logic / flow status                                   *
 * ------------------------------------------------------------------------ */

export type CustomerFlowStatus =
  | 'validation_required' // an unsupported intent blocks progress (honest gap)
  | 'collecting' // still has at least one pending question
  | 'complete'; // type + batch resolved and a recipe path chosen

/**
 * The ordered pending questions. Deterministic. An unsupported product type
 * returns an EMPTY list (the flow is blocked at a validation gap, not asking a
 * normal question). A question is never listed for information already known
 * reliably (e.g. a batch recognized from the text).
 */
export function pendingQuestions(state: CustomerFlowState): CustomerFlowQuestionId[] {
  const type = resolveProductType(state);
  if (type.status === 'unsupported') return [];

  const questions: CustomerFlowQuestionId[] = [];
  if (type.status === 'unknown') questions.push('product_type');

  // The serving / machine mode comes before the batch. A Ninja mode auto-sets its
  // approved mass (batch never asked); Direct / Fresh modes ask batch only if unknown.
  if (state.mode === null) {
    questions.push('serving_mode');
  } else if (resolveBatch(state).askBatch) {
    questions.push('batch');
  }

  if (state.recipePath === null) questions.push('recipe_path');
  return questions;
}

/** The next question to ask, or null when blocked (unsupported) or complete. */
export function nextQuestion(state: CustomerFlowState): CustomerFlowQuestionId | null {
  return pendingQuestions(state)[0] ?? null;
}

export function flowStatus(state: CustomerFlowState): CustomerFlowStatus {
  if (resolveProductType(state).status === 'unsupported') return 'validation_required';
  return pendingQuestions(state).length === 0 ? 'complete' : 'collecting';
}

/* ------------------------------------------------------------------------ *
 * The visible product-type question                                         *
 * ------------------------------------------------------------------------ */

export interface CustomerChoice {
  value: CustomerProductType;
  labelKey: string;
}

export interface ProductTypeQuestion {
  id: 'product_type';
  choices: readonly CustomerChoice[];
}

/**
 * The visible product-type question — exactly the four customer choices, never
 * "Chocolate". Labels are copy KEYS (no long user-facing text in core logic).
 */
export function productTypeQuestion(): ProductTypeQuestion {
  return {
    id: 'product_type',
    choices: CUSTOMER_PRODUCT_TYPE_CHOICES.map((value) => ({
      value,
      labelKey: `customer_flow.product_type.${value}`,
    })),
  };
}
