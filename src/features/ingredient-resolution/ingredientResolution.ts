/**
 * PINGÜINO Ingredient Resolution — the PURE, deterministic state machine (Agent A).
 *
 * A recipe's GENERIC requirement lines ("Czekolada", "Whisky", "Bazylia") each carry a
 * per-line resolution state. Tapping an unresolved line opens a sheet whose actions
 * (Polish) resolve it to a CONCRETE product/variant, gated on Engine-readiness BEFORE any
 * exact PI recalculation. Fresh/herb lines pick a FORM first. This module produces the
 * resolution RESULT and an `engineRerunToken` signal; it never runs the Engine, never
 * imports the sibling PI Monitor, never mutates a source recipe/catalogue.
 *
 * Every reducer returns NEW state — no mutation, no IO, no clock, no randomness.
 */
import { buildSubstitutionIntent, type SubstitutionReason } from '@/features/customer-flow';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';
import {
  evaluateProductReadiness,
  type ReadinessProductInput,
  type ProductReadiness,
} from './engineReadinessGate';
import { searchProductCatalogue, type CatalogueProduct } from './catalogueSearch';
import {
  ACTION_TO_SUBSTITUTION_REASON,
  requiresFormSelection,
  type IngredientForm,
  type IngredientRequirementLine,
  type IngredientResolutionState,
  type IngredientResolutionSummary,
  type LineResolution,
  type ProductCandidate,
  type ResolutionActionId,
} from './contracts';

/* ------------------------------------------------------------------------ *
 * Construction (always a working copy — the source is never mutated)        *
 * ------------------------------------------------------------------------ */

/** The seed shape for one requirement line (candidate ids + form flag optional). */
export interface RequirementLineSeed {
  lineId: string;
  ingredientName: string;
  role?: 'base' | 'flavor';
  requirementKind: 'needs_ingredient' | 'needs_dose';
  candidateProductIds?: readonly string[];
  /** Force the fresh/herb form step. When omitted it is auto-detected from the name. */
  requiresForm?: boolean;
}

function freshLine(seed: RequirementLineSeed): LineResolution {
  const requiresForm = seed.requiresForm ?? requiresFormSelection(seed.ingredientName);
  const line: IngredientRequirementLine = {
    lineId: seed.lineId,
    ingredientName: seed.ingredientName,
    role: seed.role ?? 'flavor',
    requirementKind: seed.requirementKind,
    candidateProductIds: [...(seed.candidateProductIds ?? [])],
    requiresForm,
  };
  return {
    line,
    state: 'unresolved',
    form: null,
    attachedProductId: null,
    engineValues: null,
    message: null,
    substitutionIntent: null,
    intakeHandoff: null,
    searchResults: null,
  };
}

export interface CreateResolutionInput {
  workingRecipeId: string;
  sourceRecipeId?: string | null;
  lines: readonly RequirementLineSeed[];
}

/** Build a fresh resolution state (every line starts unresolved). Deep-copies seeds. */
export function createResolutionState(input: CreateResolutionInput): IngredientResolutionState {
  return {
    workingRecipeId: input.workingRecipeId,
    sourceRecipeId: input.sourceRecipeId ?? null,
    lines: input.lines.map(freshLine),
    activeLineId: null,
    engineRerunToken: 0,
  };
}

/**
 * Clone a READY catalogue recipe's requirement lines into a SEPARATE editable working copy.
 * The source id is preserved for provenance but never referenced for mutation — the caller's
 * source recipe/catalogue is never touched.
 */
export function createResolutionWorkingCopy(args: {
  sourceRecipeId: string;
  workingRecipeId: string;
  lines: readonly RequirementLineSeed[];
}): IngredientResolutionState {
  return createResolutionState({
    workingRecipeId: args.workingRecipeId,
    sourceRecipeId: args.sourceRecipeId,
    lines: args.lines,
  });
}

/* ------------------------------------------------------------------------ *
 * Internal helpers                                                          *
 * ------------------------------------------------------------------------ */

function lineOf(state: IngredientResolutionState, lineId: string): LineResolution | undefined {
  return state.lines.find((l) => l.line.lineId === lineId);
}

/** Replace one line via an updater; other lines and the token stay identical. */
function withLine(
  state: IngredientResolutionState,
  lineId: string,
  update: (l: LineResolution) => LineResolution,
): IngredientResolutionState {
  let changed = false;
  const lines = state.lines.map((l) => {
    if (l.line.lineId !== lineId) return l;
    changed = true;
    return update(l);
  });
  return changed ? { ...state, lines } : state;
}

/** A clean per-line resolution reset (keeps the requirement line + chosen form). */
function clearedTransient(l: LineResolution): LineResolution {
  return {
    ...l,
    searchResults: null,
    intakeHandoff: null,
    substitutionIntent: null,
    message: null,
  };
}

/* ------------------------------------------------------------------------ *
 * Sheet open/close + form selection                                         *
 * ------------------------------------------------------------------------ */

/**
 * Open the resolution sheet for a line. A fresh/herb line that has not yet picked a form
 * enters `choosing_form` first; every other unresolved/blocked line shows the actions.
 * Opening a resolved line simply focuses it (no state regression).
 */
export function openSheet(state: IngredientResolutionState, lineId: string): IngredientResolutionState {
  const l = lineOf(state, lineId);
  if (!l) return state;
  const next = withLine(state, lineId, (line) => {
    if (line.state === 'resolved') return line;
    if (line.line.requiresForm && line.form === null) {
      return { ...clearedTransient(line), state: 'choosing_form' };
    }
    if (line.state === 'choosing_form' || line.state === 'searching' || line.state === 'substituting') {
      return line; // already mid-flow — don't disturb it
    }
    return { ...clearedTransient(line), state: 'unresolved' };
  });
  return { ...next, activeLineId: lineId };
}

/** Close whichever sheet is open. Per-line state is preserved. */
export function closeSheet(state: IngredientResolutionState): IngredientResolutionState {
  return state.activeLineId === null ? state : { ...state, activeLineId: null };
}

/**
 * Pick a fresh/herb FORM (świeża / suszona / pasta / ekstrakt / napar). Records the choice
 * and moves to the action list. NO dose is ever attached to a form.
 */
export function selectForm(
  state: IngredientResolutionState,
  lineId: string,
  form: IngredientForm,
): IngredientResolutionState {
  return withLine(state, lineId, (line) =>
    line.state === 'resolved' ? line : { ...clearedTransient(line), form, state: 'unresolved' },
  );
}

/* ------------------------------------------------------------------------ *
 * Action dispatch                                                           *
 * ------------------------------------------------------------------------ */

/** Which sheet actions are available for a line (form step hides them until a form is set). */
export function availableActions(line: LineResolution): ResolutionActionId[] {
  if (line.state === 'choosing_form') return [];
  const actions: ResolutionActionId[] = [];
  if (line.line.candidateProductIds.length > 0) actions.push('choose_candidate');
  actions.push('search_catalogue', 'scan_label', 'add_manually', 'dont_have', 'substitute', 'why');
  return actions;
}

/** Show the candidate list already attached to this line (`Wybierz produkt`). */
export function showAttachedCandidates(
  state: IngredientResolutionState,
  lineId: string,
  candidates: readonly ProductCandidate[],
): IngredientResolutionState {
  return withLine(state, lineId, (line) =>
    line.state === 'resolved' ? line : { ...clearedTransient(line), state: 'searching', searchResults: [...candidates] },
  );
}

/** Search the EXISTING products catalogue (`Wyszukaj w katalogu`) — honest name search. */
export function searchCatalogue(
  state: IngredientResolutionState,
  lineId: string,
  query: string,
  catalogue: readonly CatalogueProduct[],
): IngredientResolutionState {
  const results = searchProductCatalogue(query, catalogue);
  return withLine(state, lineId, (line) =>
    line.state === 'resolved' ? line : { ...clearedTransient(line), state: 'searching', searchResults: results },
  );
}

/**
 * Delegate to the OCR / manual PRODUCT INTAKE session (`Skanuj etykietę` / `Dodaj produkt
 * ręcznie`). This module runs NO OCR — it emits an `IntakeHandoff` the caller uses to launch
 * the EXISTING intake session. The line waits in `awaiting_intake` until the save returns.
 */
export function beginIntake(
  state: IngredientResolutionState,
  lineId: string,
  mode: 'scan' | 'manual',
): IngredientResolutionState {
  return withLine(state, lineId, (line) => {
    if (line.state === 'resolved') return line;
    return {
      ...clearedTransient(line),
      state: 'awaiting_intake',
      intakeHandoff: {
        lineId,
        mode,
        ingredientName: line.line.ingredientName,
        note:
          mode === 'scan'
            ? 'Uruchom istniejący skan etykiety (OCR). Po zapisaniu produktu wróć do tej receptury.'
            : 'Uruchom istniejące ręczne dodanie produktu. Po zapisaniu produktu wróć do tej receptury.',
      },
    };
  });
}

/** Abandon an intake delegation and return the line to the action list. */
export function cancelIntake(state: IngredientResolutionState, lineId: string): IngredientResolutionState {
  return withLine(state, lineId, (line) =>
    line.state !== 'awaiting_intake' ? line : { ...clearedTransient(line), state: 'unresolved' },
  );
}

/**
 * Record a substitution-style action (`Nie mam tego składnika` / `Zastąp składnik` /
 * `Po co jest ten składnik?`) via the REUSED customer-flow intent builder. `substitute`
 * carries the requested name; the line stays UNRESOLVED (a substitution does not attach a
 * product — downstream handling / the Engine deal with it). Pure.
 */
export function recordSubstitutionAction(
  state: IngredientResolutionState,
  lineId: string,
  actionId: 'dont_have' | 'substitute' | 'why',
  requestedSubstituteName?: string,
): IngredientResolutionState {
  const reason: SubstitutionReason = ACTION_TO_SUBSTITUTION_REASON[actionId]!;
  return withLine(state, lineId, (line) => {
    if (line.state === 'resolved') return line;
    const intent = buildSubstitutionIntent({
      lineId,
      ingredientName: line.line.ingredientName,
      reason,
      ...(requestedSubstituteName !== undefined ? { requestedSubstituteName } : {}),
    });
    // `substitute` with no name yet parks in `substituting` so the UI can collect one.
    const state_: LineResolution['state'] =
      actionId === 'substitute' && intent.requestedSubstituteName === undefined ? 'substituting' : 'unresolved';
    return { ...clearedTransient(line), state: state_, substitutionIntent: intent };
  });
}

/* ------------------------------------------------------------------------ *
 * Product selection → the Engine-readiness gate                             *
 * ------------------------------------------------------------------------ */

/** The picked product + its matched reference, fed to the readiness gate. */
export interface PickProductInput {
  productId: string;
  /** The fields the readiness gate reads (engine values + red-flag text). */
  product: ReadinessProductInput;
  /** The matched `mapper_basement` reference the caller looked up (or null). */
  reference: ReferenceEngineValues | null;
}

/** Apply a readiness result to a line; bump the token only on a fresh resolve. */
function applyReadiness(
  state: IngredientResolutionState,
  lineId: string,
  productId: string,
  readiness: ProductReadiness,
): IngredientResolutionState {
  const before = lineOf(state, lineId);
  const wasResolved = before?.state === 'resolved';
  const next = withLine(state, lineId, (line) => {
    if (readiness.readyForExact && readiness.pac_value !== null && readiness.pod_value !== null) {
      return {
        ...clearedTransient(line),
        state: 'resolved',
        attachedProductId: productId,
        engineValues: {
          pac_value: readiness.pac_value,
          pod_value: readiness.pod_value,
          provenance: readiness.provenance,
          not_independently_measured: readiness.not_independently_measured,
        },
        message: null,
      };
    }
    // Picked, but NOT engine-ready: keep the line UNRESOLVED with the honest message.
    return {
      ...clearedTransient(line),
      state: 'needs_data',
      attachedProductId: productId,
      engineValues: null,
      message: readiness.message,
    };
  });
  const nowResolved = lineOf(next, lineId)?.state === 'resolved';
  return nowResolved && !wasResolved ? { ...next, engineRerunToken: next.engineRerunToken + 1 } : next;
}

/**
 * Pick a concrete product for a line and run the Engine-readiness gate. If ready-for-exact,
 * the line becomes RESOLVED (product id + engine values attached) and the rerun token bumps.
 * If not (needs-review / missing pac-pod / red-flagged), the line stays UNRESOLVED in
 * `needs_data` with exactly the honest Polish message.
 */
export function pickProduct(
  state: IngredientResolutionState,
  lineId: string,
  input: PickProductInput,
): IngredientResolutionState {
  if (!lineOf(state, lineId)) return state;
  const readiness = evaluateProductReadiness(input.product, input.reference);
  return applyReadiness(state, lineId, input.productId, readiness);
}

/**
 * Return from a successful OCR / manual intake save: attach the NEW Product ID and re-run the
 * SAME Engine-readiness gate. Identical policy to `pickProduct` — a freshly-intaken product is
 * never trusted more (OCR grants no PI Verified, invents no PAC/POD). All prior state on other
 * lines is preserved.
 */
export function completeIntakeReturn(
  state: IngredientResolutionState,
  lineId: string,
  input: PickProductInput,
): IngredientResolutionState {
  const l = lineOf(state, lineId);
  if (!l) return state;
  const readiness = evaluateProductReadiness(input.product, input.reference);
  return applyReadiness(state, lineId, input.productId, readiness);
}

/* ------------------------------------------------------------------------ *
 * The PI-Monitor-facing summary (small + stable)                            *
 * ------------------------------------------------------------------------ */

/**
 * The ONLY selector the sibling PI Monitor consumes: it gates exact recalculation on
 * `allResolved` WITHOUT importing any of this module's internals. A line counts as resolved
 * only in the `resolved` state (an attached-but-not-ready product does NOT clear the gate).
 */
export function ingredientResolutionSummary(
  state: IngredientResolutionState,
): IngredientResolutionSummary {
  const unresolved = state.lines.filter((l) => l.state !== 'resolved');
  return {
    allResolved: unresolved.length === 0,
    unresolvedCount: unresolved.length,
    unresolvedNames: unresolved.map((l) => l.line.ingredientName),
  };
}

/** Convenience read: the resolution for a single line (or undefined). */
export function resolutionForLine(
  state: IngredientResolutionState,
  lineId: string,
): LineResolution | undefined {
  return lineOf(state, lineId);
}
