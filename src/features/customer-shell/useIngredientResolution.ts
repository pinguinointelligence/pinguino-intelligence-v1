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
 * The picker search is delegated to the reused `searchPickerCatalogue` (Produkty tab)
 * and to the live Mapper catalogue backend adapter (Składniki PI tab, Track F);
 * readiness is delegated to the reused gate through `pickProduct`. No engine math here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  BUNDLED_CATALOGUE_ENTRIES,
  BUNDLED_CATALOGUE_SOURCE,
  bundledCategoryForIngredient,
  createDebouncer,
  DEFAULT_PICKER_SOURCE,
  INITIAL_LIVE_SEARCH,
  ingredientPickInput,
  LIVE_SEARCH_DEBOUNCE_MS,
  liveSearchMoreStarted,
  liveSearchSettled,
  liveSearchStarted,
  searchPickerCatalogue,
  type CatalogueSource,
  type IngredientPickPhase,
  type LiveSearchState,
  type PickerSourceId,
  type ProductPickResult,
  type SafeIngredientHit,
} from '@/features/product-picker';
// The live-catalogue backend adapter (sanctioned service layer — the only IO here).
import {
  fetchIngredientEngineValues,
  searchMapperIngredients,
  MAPPER_SEARCH_DEFAULT_LIMIT,
} from '@/services/productPicker/mapperSearch';

/** The minimal recipe line the controller resolves (decoupled from view internals). */
export interface ResolvableLine {
  ingredientId: string;
  ingredientName: string;
  resolution: 'resolved' | 'needs_ingredient' | 'needs_dose';
}

/** Which panel of the open sheet is showing. */
export type ResolutionView = 'menu' | 'picker' | 'substitute' | 'intake';

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
  /** Which catalogue source tab the picker shows (Składniki PI is the default). */
  sourceTab: PickerSourceId;
  setSourceTab: (tab: PickerSourceId) => void;
  /** Live Mapper search state (Składniki PI tab; honest phases, never fake-empty). */
  liveSearch: LiveSearchState;
  /** Load the next incremental page of live results. */
  loadMore: () => void;
  /** Re-run the last live query after an error. */
  retryLiveSearch: () => void;
  /** Pick a live Mapper hit (stable PI-ING-* id → the reused readiness gate). */
  pickIngredient: (hit: SafeIngredientHit) => void;
  /** Post-selection engine-values fetch state (login/unavailable honesty). */
  ingredientPick: IngredientPickPhase;
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

/**
 * The live-catalogue IO the hook binds to — injectable so tests never touch a
 * backend. Defaults to the real backend adapter from the sanctioned service layer.
 */
export interface LiveCatalogueDeps {
  searchIngredients: typeof searchMapperIngredients;
  fetchEngineValues: typeof fetchIngredientEngineValues;
  debounceMs?: number;
}

const DEFAULT_LIVE_DEPS: LiveCatalogueDeps = {
  searchIngredients: searchMapperIngredients,
  fetchEngineValues: fetchIngredientEngineValues,
};

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
  liveDeps: LiveCatalogueDeps = DEFAULT_LIVE_DEPS,
): IngredientResolutionController {
  const [state, setState] = useState<IngredientResolutionState>(() =>
    createResolutionState({ workingRecipeId, lines: seedsFrom(lines) }),
  );
  const [view, setView] = useState<ResolutionView>('menu');
  const [query, setQuery] = useState('');
  const [substituteName, setSubstituteName] = useState('');
  const [whyOpen, setWhyOpen] = useState(false);
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});
  // Track F — two-source picker: live Mapper search (default tab) + bundled sample.
  const [sourceTab, setSourceTabState] = useState<PickerSourceId>(DEFAULT_PICKER_SOURCE);
  const [liveSearch, setLiveSearch] = useState<LiveSearchState>(INITIAL_LIVE_SEARCH);
  const [ingredientPick, setIngredientPick] = useState<IngredientPickPhase>('idle');
  const requestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const pickAbortRef = useRef<AbortController | null>(null);
  const [debouncer] = useState(() => createDebouncer(liveDeps.debounceMs ?? LIVE_SEARCH_DEBOUNCE_MS));

  // Owner decision (2026-07-17, „wire the 69 staging products now"): the picker reads a
  // REAL, verified SAMPLE of the products catalogue, bundled from staging so it works in
  // every build (including the public one, which has no live database). Matched products carry
  // their mapper_basement reference → an exact „Gotowy do przeliczenia" verdict; the rest
  // stay honestly „Wymaga danych". The source note labels it a sample, never „live".
  const entries = BUNDLED_CATALOGUE_ENTRIES;
  const catalogueAvailable = true;

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

  const seedCategory = activeLine ? bundledCategoryForIngredient(activeLine.line.ingredientName) : null;
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

  /* ---------------------------------------------------- live Mapper search -- */

  // Issue one live query (page 0 replaces, later pages append). Stale requests are
  // dropped twice over: the AbortController cancels the transport, and the pure
  // reducer ignores any settlement that is not the latest requestId.
  const runLiveSearch = useCallback(
    (text: string, offset: number, mode: 'replace' | 'append') => {
      const id = ++requestIdRef.current;
      setLiveSearch((s) => (mode === 'replace' ? liveSearchStarted(s, text, id) : liveSearchMoreStarted(s, id)));
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      void liveDeps
        .searchIngredients({ text, limit: MAPPER_SEARCH_DEFAULT_LIMIT, offset, signal: controller.signal })
        .then((outcome) => setLiveSearch((s) => liveSearchSettled(s, id, outcome, mode)));
    },
    [liveDeps],
  );

  // A blank box still searches something honest: the requirement line's own name
  // (opening „Czekolada" lists chocolate ingredients before any typing).
  const liveSeedText = activeLine ? activeLine.line.ingredientName : '';
  const liveText = query.trim() !== '' ? query.trim() : liveSeedText;

  useEffect(() => {
    if (view !== 'picker' || sourceTab !== 'pi_ingredients' || activeLineId === null) return;
    debouncer.schedule(() => runLiveSearch(liveText, 0, 'replace'));
    return () => debouncer.cancel();
  }, [view, sourceTab, activeLineId, liveText, debouncer, runLiveSearch]);

  const loadMore = () => {
    if (liveSearch.phase !== 'ready' || !liveSearch.hasMore) return;
    runLiveSearch(liveSearch.query, liveSearch.hits.length, 'append');
  };
  const retryLiveSearch = () => runLiveSearch(liveText, 0, 'replace');

  const setSourceTab = (tab: PickerSourceId) => {
    setSourceTabState(tab);
    setIngredientPick('idle');
  };

  // Pick a live Mapper hit: the stable PI-ING-* id + the rich-view engine values
  // go through the SAME reused readiness gate as a picked product. When the rich
  // read is not possible (anon / unavailable / failed) the line is NOT touched and
  // the sheet says honestly why — readiness is never faked.
  const pickIngredient = (hit: SafeIngredientHit) => {
    if (!activeLineId) return;
    const lineId = activeLineId;
    pickAbortRef.current?.abort();
    const controller = new AbortController();
    pickAbortRef.current = controller;
    setIngredientPick('fetching');
    void liveDeps.fetchEngineValues(hit.ingredientId, controller.signal).then((outcome) => {
      if (controller.signal.aborted || outcome.kind === 'aborted') return;
      if (outcome.kind === 'values' || outcome.kind === 'not_found') {
        // 'not_found' = the approved library holds no engine row for this id →
        // the reused gate yields an honest needs_data (never invented values).
        setIngredientPick('idle');
        setPickedNames((m) => ({ ...m, [lineId]: hit.displayName }));
        setState((s) =>
          pickProduct(s, lineId, ingredientPickInput(hit, outcome.kind === 'values' ? outcome.reference : null)),
        );
        return;
      }
      setIngredientPick(
        outcome.kind === 'unauthorized' ? 'login_required' : outcome.kind === 'unavailable' ? 'unavailable' : 'error',
      );
    });
  };

  /* ------------------------------------------------------------- sheet flow -- */

  const open = (lineId: string) => {
    setView('menu');
    setQuery('');
    setSubstituteName('');
    setWhyOpen(false);
    setSourceTabState(DEFAULT_PICKER_SOURCE);
    setLiveSearch(INITIAL_LIVE_SEARCH);
    setIngredientPick('idle');
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
    // Cancel any in-flight live-catalogue IO — a closed sheet must settle nothing.
    debouncer.cancel();
    searchAbortRef.current?.abort();
    pickAbortRef.current?.abort();
    setIngredientPick('idle');
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
    debouncer.cancel();
    searchAbortRef.current?.abort();
    pickAbortRef.current?.abort();
    setSourceTabState(DEFAULT_PICKER_SOURCE);
    setLiveSearch(INITIAL_LIVE_SEARCH);
    setIngredientPick('idle');
  };

  return {
    summary: ingredientResolutionSummary(state),
    source: BUNDLED_CATALOGUE_SOURCE,
    catalogueAvailable,
    activeLineId,
    activeLine,
    view,
    actions: activeLine ? availableActions(activeLine) : [],
    forms: INGREDIENT_FORMS,
    query,
    results,
    sourceTab,
    setSourceTab,
    liveSearch,
    loadMore,
    retryLiveSearch,
    pickIngredient,
    ingredientPick,
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
