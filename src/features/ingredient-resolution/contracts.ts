/**
 * PINGÜINO Ingredient Resolution — shared contracts (types + honest Polish copy).
 *
 * This layer lets a customer resolve a GENERIC recipe requirement line ("Czekolada",
 * "Whisky", "Rum", "Puree malinowe", "Bazylia") to a CONCRETE product/variant. It runs
 * and GATES before any exact PI recalculation (the sibling PI Monitor consumes only the
 * pure summary selector — never these internals).
 *
 * HARD SCOPE (test-pinned):
 *  - PURE: no IO, no DOM, no clock, no randomness, no engine math — every reducer returns
 *    NEW state;
 *  - HONEST: no PAC/POD/dose/composition is ever invented (unknown stays null); no form
 *    carries a fabricated dose; Product statuses are never written; PI Verified is never
 *    auto-granted (the reused status policy owns that);
 *  - Polish-only customer copy — no English/fixture/"verified"/placeholder label ships.
 */
import type { EngineValueProvenance } from '@/data/products/productEngineResolver';
import type { CustomerSubstitutionIntent, SubstitutionReason } from '@/features/customer-flow';

/* ------------------------------------------------------------------------ *
 * Bottom-sheet actions (exact Polish labels, matching the shipped shell)    *
 * ------------------------------------------------------------------------ */

/** The actions offered when a customer taps an unresolved requirement line. */
export type ResolutionActionId =
  | 'choose_candidate' // Wybierz produkt   — pick from an already-attached candidate list
  | 'search_catalogue' // Wyszukaj w katalogu — search the existing products catalogue
  | 'scan_label' // Skanuj etykietę    — delegate to OCR intake
  | 'add_manually' // Dodaj produkt ręcznie — delegate to manual intake
  | 'dont_have' // Nie mam tego składnika
  | 'substitute' // Zastąp składnik
  | 'why'; // Po co jest ten składnik?

export interface ResolutionActionDef {
  id: ResolutionActionId;
  /** Honest Polish label (identical wording to the shipped customer shell). */
  label: string;
}

/** The ordered action list rendered on the resolution sheet. Stable order. */
export const RESOLUTION_ACTIONS: readonly ResolutionActionDef[] = [
  { id: 'choose_candidate', label: 'Wybierz produkt' },
  { id: 'search_catalogue', label: 'Wyszukaj w katalogu' },
  { id: 'scan_label', label: 'Skanuj etykietę' },
  { id: 'add_manually', label: 'Dodaj produkt ręcznie' },
  { id: 'dont_have', label: 'Nie mam tego składnika' },
  { id: 'substitute', label: 'Zastąp składnik' },
  { id: 'why', label: 'Po co jest ten składnik?' },
];

/** Map the three substitution-style actions onto the REUSED customer-flow reason. */
export const ACTION_TO_SUBSTITUTION_REASON: Partial<Record<ResolutionActionId, SubstitutionReason>> = {
  dont_have: 'i_dont_have_this',
  substitute: 'replace_with',
  why: 'why_is_this_here',
};

/* ------------------------------------------------------------------------ *
 * Fresh / herb form selection (no dose ever invented)                       *
 * ------------------------------------------------------------------------ */

/** Fresh/culinary ingredient forms — the customer picks one FIRST. ASCII ids, Polish labels. */
export type IngredientForm = 'swieza' | 'mrozona' | 'puree' | 'pasta' | 'suszona' | 'ekstrakt' | 'napar';

export interface IngredientFormDef {
  id: IngredientForm;
  label: string;
}

/** The offered forms, in stable display order. NONE carries a dose. */
export const INGREDIENT_FORMS: readonly IngredientFormDef[] = [
  { id: 'swieza', label: 'świeża' },
  { id: 'mrozona', label: 'mrożona' },
  { id: 'puree', label: 'puree' },
  { id: 'pasta', label: 'pasta' },
  { id: 'suszona', label: 'suszona' },
  { id: 'ekstrakt', label: 'ekstrakt' },
  { id: 'napar', label: 'napar' },
];

const FORM_IDS: ReadonlySet<string> = new Set(INGREDIENT_FORMS.map((f) => f.id));

/** True when a string is one of the five known forms. */
export function isIngredientForm(value: string): value is IngredientForm {
  return FORM_IDS.has(value);
}

/**
 * Fresh/culinary concepts that must offer a FORM step first — herbs (bazylia/mięta) AND
 * fruit (malina/truskawka…), which a customer buys as świeża / mrożona / puree / etc.
 * Accent- and case-insensitive stem matching is done in `requiresFormSelection`. Deliberately
 * conservative: it only asks a form question, it never fabricates a dose or a product.
 */
const FORM_CONCEPTS: readonly string[] = [
  // herbs
  'bazyli', // bazylia
  'mieta', // mięta
  'melis',
  'rozmaryn',
  'tymianek',
  'szalwia', // szałwia
  'oregano',
  'kolendr',
  'natka',
  'pietruszk',
  'lawend',
  'estragon',
  'majeranek',
  'werben',
  'trawa cytrynowa',
  'lemongrass',
  'basil',
  'mint',
  'thyme',
  'rosemary',
  'sage',
  'coriander',
  'cilantro',
  'parsley',
  'lavender',
  'tarragon',
  // fruit (bought as fresh / frozen / purée / …)
  'malin', // malina / maliny / malinowe
  'truskaw', // truskawka
  'jagod', // jagoda / jagody
  'borowk', // borówka
  'porzeczk', // porzeczka
  'wisni', // wiśnia
  'czeresn', // czereśnia
  'mango',
  'brzoskwin', // brzoskwinia
  'morel', // morela
  'raspberry',
  'strawberry',
  'blueberry',
  'cherry',
  'peach',
  'apricot',
];

/** lowercase + strip diacritics (so "mięta"/"szałwia" match the accent-free concept). */
function normHerb(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * True when this ingredient name is a fresh/culinary ingredient (herb or fruit) that must
 * pick a FORM (świeża / mrożona / puree / pasta / suszona / ekstrakt / napar) before a
 * product is chosen. Pure.
 */
export function requiresFormSelection(ingredientName: string): boolean {
  const n = normHerb(ingredientName);
  if (n === '') return false;
  return FORM_CONCEPTS.some((h) => n === h || n.includes(h));
}

/* ------------------------------------------------------------------------ *
 * The single honest not-ready message                                       *
 * ------------------------------------------------------------------------ */

/** Shown verbatim when a picked product is NOT engine-ready for exact calculation. */
export const NOT_ENGINE_READY_MESSAGE =
  'Ten produkt wymaga uzupełnienia danych przed dokładnym przeliczeniem.';

/* ------------------------------------------------------------------------ *
 * Requirement lines + per-line resolution state                             *
 * ------------------------------------------------------------------------ */

/** The unresolved requirement kinds a line can start from (mirrors recipeStructure). */
export type RequirementKind = 'needs_ingredient' | 'needs_dose';

/** One GENERIC requirement line the customer resolves to a concrete product. */
export interface IngredientRequirementLine {
  lineId: string;
  /** The customer-visible ingredient name, e.g. "Czekolada", "Bazylia". */
  ingredientName: string;
  role: 'base' | 'flavor';
  requirementKind: RequirementKind;
  /** Product ids already attached to this line (source of the `Wybierz produkt` action). */
  candidateProductIds: readonly string[];
  /** True when the customer must pick a FORM first (fresh/herb). */
  requiresForm: boolean;
}

/** How far along one requirement line's resolution is. Only `resolved` clears the gate. */
export type LineResolutionState =
  | 'unresolved' // needs the customer to act
  | 'choosing_form' // fresh/herb: pick a form first
  | 'searching' // catalogue / candidate list open
  | 'substituting' // entering a substitute name (Zastąp składnik)
  | 'awaiting_intake' // delegated to scan / manual intake, awaiting the save return
  | 'needs_data' // a product was picked but it is NOT engine-ready (stays UNRESOLVED)
  | 'resolved'; // an engine-ready product is attached

/** The resolved engine values attached to a line (only ever present when resolved). */
export interface AttachedEngineValues {
  pac_value: number;
  pod_value: number;
  provenance: EngineValueProvenance;
  not_independently_measured: boolean;
}

/** Where an intake delegation should go. No OCR runs here — the caller launches it. */
export interface IntakeHandoff {
  lineId: string;
  mode: 'scan' | 'manual';
  ingredientName: string;
  /** Honest instruction; the caller runs the EXISTING intake session, not this module. */
  note: string;
}

/** One candidate product surfaced by a catalogue search (honest — no fabricated %). */
export interface ProductCandidate {
  productId: string;
  displayName: string;
  /** The concrete, enumerable reason this candidate matched. */
  matchedOn: 'exact_name' | 'name_contains';
}

export interface LineResolution {
  line: IngredientRequirementLine;
  state: LineResolutionState;
  /** Selected fresh/herb form, else null. Never carries a dose. */
  form: IngredientForm | null;
  /** The attached product id (resolved OR blocked-needs-data), else null. */
  attachedProductId: string | null;
  /** Engine values — present ONLY when `state === 'resolved'`. */
  engineValues: AttachedEngineValues | null;
  /** The honest Polish not-ready message when blocked, else null. */
  message: string | null;
  /** Substitution intent from dont_have / substitute / why, else null. */
  substitutionIntent: CustomerSubstitutionIntent | null;
  /** Intake handoff descriptor while delegating, else null. */
  intakeHandoff: IntakeHandoff | null;
  /** Transient catalogue/candidate search results, else null. */
  searchResults: readonly ProductCandidate[] | null;
}

/** The whole resolution state for one recipe (always an editable WORKING COPY). */
export interface IngredientResolutionState {
  /** The working-copy id — NEVER the source recipe id. */
  workingRecipeId: string;
  /** The source recipe id when cloned from a ready catalogue recipe, else null. */
  sourceRecipeId: string | null;
  lines: readonly LineResolution[];
  /** The line whose sheet is open, else null. */
  activeLineId: string | null;
  /**
   * Increments each time a line transitions INTO `resolved`. The recipe watches this
   * token to re-run its Engine pass — this module never runs the Engine itself.
   */
  engineRerunToken: number;
}

/** The small, stable output the sibling PI Monitor consumes (no internals). */
export interface IngredientResolutionSummary {
  allResolved: boolean;
  unresolvedCount: number;
  unresolvedNames: string[];
}
