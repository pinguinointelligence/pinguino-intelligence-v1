/**
 * Customer-shell — Ingredient Resolution controller hook.
 *
 * Binds Agent A's PURE resolution state machine (`@/features/ingredient-resolution`)
 * and the READ-only Product Picker (`@/features/product-picker`) to the customer
 * result screen. It owns only local React state — nothing is persisted, no product
 * is written, no gram is produced here. The recipe's other choices (flavors, device,
 * batch, product type, selected draft, Monitor settings) live in CustomerShellV1 and
 * are never touched, so resolving a line never loses them.
 *
 * The picker search is delegated to the reused `searchPickerCatalogue`; readiness is
 * delegated to the reused gate through `pickProduct`. This hook adds no engine math.
 */
import { useMemo, useState } from 'react';
import {
  createResolutionState,
  openSheet,
  closeSheet,
  selectForm as selectFormReducer,
  beginIntake,
  cancelIntake,
  recordSubstitutionAction,
  pickProduct,
  ingredientResolutionSummary,
  resolutionForLine,
  availableActions,
  INGREDIENT_FORMS,
  type IngredientForm,
  type IngredientResolutionState,
  type IngredientResolutionSummary,
  type LineResolution,
  type RequirementLineSeed,
  type ResolutionActionId,
} from '@/features/ingredient-resolution';
import {
  CATALOGUE_UNAVAILABLE,
  searchPickerCatalogue,
  sampleCategoryForIngredient,
  type CatalogueSource,
  type PickerCatalogueEntry,
  type ProductPickResult,
} from '@/features/product-picker';

/** The minimal recipe line the controller resolves (decoupled from view internals). */
export interface ResolvableLine {
  ingredientId: string;
  ingredientName: string;
  resolution: 'resolved' | 'needs_ingredient' | 'needs_dose';
}

/** Which panel of the open sheet is showing. */
export type ResolutionView = 'menu' | 'picker' | 'substitute' | 'intake';

const EMPTY_ENTRIES: readonly PickerCatalogueEntry[] = [];

export interface IngredientResolutionController {
  summary: IngredientResolutionSummary;
  source: CatalogueSource;
  /** False when no approved catalogue backend is connected (honest unavailable). */
  catalogueAvailable: boolean;
  /** The line whose sheet is open, else null. */
  activeLineId: string | null;
  activeLine: LineResolution | null;
  view: ResolutionView;
  actions: ResolutionActionId[];
  forms: typeof INGREDIENT_FORMS;
  query: string;
  results: ProductPickResult[];
  substituteName: string;
  whyOpen: boolean;
  open: (lineId: string) => void;
  close: () => void;
  chooseForm: (form: IngredientForm) => void;
  runAction: (action: ResolutionActionId) => void;
  setQuery: (q: string) => void;
  pick: (result: ProductPickResult) => void;
  setSubstituteName: (s: string) => void;
  confirmSubstitute: () => void;
  toggleWhy: () => void;
  /** The current resolution for a recipe line (drives the row chip), or undefined. */
  lineFor: (lineId: string) => LineResolution | undefined;
  /** The display name of the product picked for a line (resolved or needs-data), or null. */
  pickedName: (lineId: string) => string | null;
  reset: () => void;
}

/** Seeds for the pure state, from the currently-unresolved recipe lines. */
function seedsFrom(lines: readonly ResolvableLine[]): RequirementLineSeed[] {
  return lines
    .filter((l) => l.resolution !== 'resolved')
    .map((l) => ({
      lineId: l.ingredientId,
      ingredientName: l.ingredientName,
      role: l.ingredientId.startsWith('flavor:') ? ('flavor' as const) : ('base' as const),
      requirementKind: l.resolution === 'needs_dose' ? ('needs_dose' as const) : ('needs_ingredient' as const),
    }));
}

/** A stable signature of the unresolved-line SET (id order-independent). */
function signatureOf(lines: readonly ResolvableLine[]): string {
  return seedsFrom(lines)
    .map((s) => s.lineId)
    .sort()
    .join('|');
}

/**
 * Rebuild the resolution state for a changed line set, PRESERVING the progress of any
 * line that still exists (so adding/removing one flavor never resets the others).
 */
function reseed(
  prev: IngredientResolutionState | null,
  workingRecipeId: string,
  lines: readonly ResolvableLine[],
): IngredientResolutionState {
  const fresh = createResolutionState({ workingRecipeId, lines: seedsFrom(lines) });
  if (!prev) return fresh;
  const priorById = new Map(prev.lines.map((l) => [l.line.lineId, l] as const));
  return {
    ...fresh,
    engineRerunToken: prev.engineRerunToken,
    lines: fresh.lines.map((l) => priorById.get(l.line.lineId) ?? l),
  };
}

export function useIngredientResolution(
  workingRecipeId: string,
  lines: readonly ResolvableLine[],
): IngredientResolutionController {
  const [state, setState] = useState<IngredientResolutionState>(() =>
    createResolutionState({ workingRecipeId, lines: seedsFrom(lines) }),
  );
  const [view, setView] = useState<ResolutionView>('menu');
  const [query, setQuery] = useState('');
  const [substituteName, setSubstituteName] = useState('');
  const [whyOpen, setWhyOpen] = useState(false);
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});

  // No approved products/ingredients backend is connected in this environment, so the
  // catalogue is honestly UNAVAILABLE (no sample fallback — never fake products). The real
  // backend catalogue adapters (product + Mapper-Basement ingredient) swap in once an
  // approved environment is connected; then `entries` is populated and real results show.
  const entries: readonly PickerCatalogueEntry[] = EMPTY_ENTRIES;
  const catalogueAvailable = false;

  // Keep the resolvable line SET in sync with the recipe, preserving progress.
  // Adjusted DURING render (the recommended pattern) rather than in an effect, so a
  // changed flavor set reseeds without cascading renders.
  const signature = signatureOf(lines);
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setState((prev) => reseed(prev, workingRecipeId, lines));
  }

  const activeLineId = state.activeLineId;
  const activeLine = activeLineId ? (resolutionForLine(state, activeLineId) ?? null) : null;

  const seedCategory = activeLine ? sampleCategoryForIngredient(activeLine.line.ingredientName) : null;
  const results = useMemo(() => {
    if (view !== 'picker' || !activeLine) return [];
    const trimmed = query.trim();
    // Blank query BROWSES the seeded category (Czekolada → the chocolate rows). Once the
    // customer types, it becomes a free text search (name / brand / EAN) across categories.
    return searchPickerCatalogue(
      { text: trimmed, category: trimmed === '' ? seedCategory : null },
      entries,
    );
  }, [view, activeLine, query, seedCategory, entries]);

  const open = (lineId: string) => {
    setView('menu');
    setQuery('');
    setSubstituteName('');
    setWhyOpen(false);
    setState((s) => openSheet(s, lineId));
  };
  const chooseForm = (form: IngredientForm) => {
    if (!activeLineId) return;
    setState((s) => selectFormReducer(s, activeLineId, form));
    setView('menu');
  };
  const runAction = (action: ResolutionActionId) => {
    if (!activeLineId) return;
    switch (action) {
      case 'choose_candidate':
      case 'search_catalogue':
        setQuery('');
        setView('picker');
        break;
      case 'scan_label':
        setState((s) => beginIntake(s, activeLineId, 'scan'));
        setView('intake');
        break;
      case 'add_manually':
        setState((s) => beginIntake(s, activeLineId, 'manual'));
        setView('intake');
        break;
      case 'dont_have':
        setState((s) => recordSubstitutionAction(s, activeLineId, 'dont_have'));
        setView('menu');
        break;
      case 'substitute':
        setSubstituteName('');
        setState((s) => recordSubstitutionAction(s, activeLineId, 'substitute'));
        setView('substitute');
        break;
      case 'why':
        setWhyOpen((v) => !v);
        break;
    }
  };
  const pick = (result: ProductPickResult) => {
    if (!activeLineId) return;
    setPickedNames((m) => ({ ...m, [activeLineId]: result.entry.displayName }));
    setState((s) =>
      pickProduct(s, activeLineId, {
        productId: result.entry.productId,
        product: result.entry.readiness,
        reference: result.entry.reference,
      }),
    );
    // Stay on the picker panel — the line now shows its resolved / needs-data outcome.
  };
  const confirmSubstitute = () => {
    if (!activeLineId) return;
    const name = substituteName.trim();
    if (name === '') return;
    setState((s) => recordSubstitutionAction(s, activeLineId, 'substitute', name));
    setView('menu');
  };
  /** Close the sheet, abandoning any in-flight intake delegation cleanly. */
  const handleClose = () => {
    const abandonIntake = activeLine?.state === 'awaiting_intake' && activeLineId !== null;
    setWhyOpen(false);
    setState((s) => {
      const closed = closeSheet(s);
      return abandonIntake && activeLineId ? cancelIntake(closed, activeLineId) : closed;
    });
  };
  const reset = () => {
    setState(createResolutionState({ workingRecipeId, lines: seedsFrom(lines) }));
    setView('menu');
    setQuery('');
    setSubstituteName('');
    setWhyOpen(false);
    setPickedNames({});
  };

  return {
    summary: ingredientResolutionSummary(state),
    source: CATALOGUE_UNAVAILABLE,
    catalogueAvailable,
    activeLineId,
    activeLine,
    view,
    actions: activeLine ? availableActions(activeLine) : [],
    forms: INGREDIENT_FORMS,
    query,
    results,
    substituteName,
    whyOpen,
    open,
    close: handleClose,
    chooseForm,
    runAction,
    setQuery,
    pick,
    setSubstituteName,
    confirmSubstitute,
    toggleWhy: () => setWhyOpen((v) => !v),
    lineFor: (lineId: string) => resolutionForLine(state, lineId),
    pickedName: (lineId: string) => pickedNames[lineId] ?? null,
    reset,
  };
}
