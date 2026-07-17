/**
 * PINGÜINO Customer Shell — CustomerShellV1 (`/start`).
 *
 * A mobile-first, white/light premium, single-column customer surface. It drives
 * the pure conversational core (Agent B, `@/features/customer-flow`) and renders
 * it with the scoped design system (Agent C, `@/features/customer-shell/ui`).
 *
 * Honesty guarantees carried straight through from the core:
 *  - the customer never picks "Chocolate" — chocolate is routed internally and
 *    only surfaced inside the collapsed technical details;
 *  - protein is an honest, blocked gap — never a fabricated recipe, never a
 *    silent gelato fallback;
 *  - a nominal ml capacity is never turned into grams behind the scenes;
 *  - exact grams are governed ONLY by the persona-derived gram-visibility
 *    capability fed into `buildCustomerRecipeView` — Demo lines carry no grams at
 *    all in the payload, so the locked stand-in renders with no leaked number.
 *
 * Presentation only: no engine math, no IO beyond the browser's own optional
 * speech-recognition, no persistence.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createCustomerFlow,
  setProductType,
  removeFlavorChip,
  addFlavorChip,
  selectServingMode,
  setBatchGrams,
  chooseRecipePath,
  activeFlavorChips,
  resolveProductType,
  resolveBatch,
  resolveServingRoute,
  nextQuestion,
  flowStatus,
  productTypeQuestion,
  matchReadyRecipes,
  selectReadyRecipe,
  buildCustomerRecipeView,
  buildRecipeStructure,
  buildCustomerResult,
  gramVisibilityForPersona,
  SERVING_MODES,
  isNinjaMode,
  type CustomerRecipeLineInput,
  type CustomerResult,
  type CustomerFlowState,
  type CustomerPersona,
  type CustomerProductType,
  type CustomerRecipeStructureLine,
  type CatalogueRecipeCard,
  type ReadyRecipeMatch,
  type ReadyRecipeQuery,
  type ReadyRecipeWorkingDraft,
  type ServingMode,
} from '@/features/customer-flow';
import { CATALOGUE_FIXTURES } from '@/features/customer-flow/__fixtures__/catalogueFixtures';
import {
  CustomerSurface,
  CustomerSection,
  CustomerMenu,
  TouchButton,
  TextField,
  MicrophoneButton,
  SelectableCard,
  FlavorChip,
  BatchSelector,
  ReadyRecipeCard,
  IngredientRow,
  TechnicalDetails,
  StickyCta,
  EmptyStateView,
  notice,
  type MicState,
} from '@/features/customer-shell/ui';
import {
  MachineOnboarding,
  MachineContextBar,
  buildMachineContextView,
  formatGrams,
  localStorageMachinePreferenceStore,
  machineOnboardingCopy,
  useMachinePreference,
  type MachineOnboardingCompletion,
} from '@/features/machine-onboarding';
import { selectMachinePreferenceStore } from '@/services/machinePreference/machinePreferenceSelector';
import { applyMachineRecordIfUnanswered, applyMachineRecordToFlow } from './machineFlowBridge';
import { deriveBatchGuidance, type AboveRecommendationChoice } from './batchGuidance';
import { customerShellCopy as copy } from './customerShellCopy';
import { formatTemperatureC } from './temperature';
import { resolveBatchSectionView } from './batchPresentation';
import { useIngredientResolution, type ResolvableLine } from './useIngredientResolution';
import { ResolutionSheet } from './ResolutionSheet';
import { PiMonitorSection } from './PiMonitorSection';

/* ------------------------------------------------------------------ *
 * Browser speech recognition (optional, never an external service)   *
 * ------------------------------------------------------------------ */

type SpeechResultLike = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
interface MinimalRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => MinimalRecognition;

/** The browser's own recognizer, or null when the API is absent (e.g. SSR/tests). */
function getSpeechCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ------------------------------------------------------------------ *
 * Presentation helpers (pure)                                        *
 * ------------------------------------------------------------------ */

function flavorLabel(tag: string): string {
  return copy.flavors[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

/**
 * Neutral, honest customer-facing catalogue title mapped by fixture card id.
 * Never surfaces the engineering fixture title carried on the card object.
 */
function catalogueTitle(id: string, fallback: string): string {
  return copy.catalogueTitles[id] ?? fallback;
}

/** Customer copy (label + secondary) for one of the six serving / machine modes. */
const modeCopyFor = (id: ServingMode['id']) => copy.modes.options[id];

/** Readable name for a real-result line: flavor chip → flavor label; base id → Polish copy. */
function resultLineName(id: string, role: 'base' | 'flavor'): string {
  if (role === 'flavor' || id.startsWith('flavor:')) {
    return flavorLabel(id.startsWith('flavor:') ? id.slice('flavor:'.length) : id);
  }
  return copy.result.baseIngredientNames[id] ?? id;
}

function formatBatch(grams: number | null): string {
  if (grams === null) return '—';
  if (grams % 1000 === 0) return `${grams / 1000} kg`;
  return `${grams} ${copy.device.unitGrams}`;
}

/** Base-line id → the Polish ingredient-name copy key. */
const BASE_INGREDIENT_COPY_KEY: Record<string, keyof typeof copy.ingredients> = {
  milk: 'milk',
  cream: 'cream',
  'plant-milk': 'plantMilk',
  'coconut-oil': 'coconutOil',
  water: 'water',
  sugar: 'sugar',
  dextrose: 'dextrose',
  stabilizer: 'stabilizer',
};

/** Human name for a structure line: flavor chips keep their own flavor label. */
function structureLineName(line: CustomerRecipeStructureLine): string {
  if (line.role === 'flavor' && line.flavorTag !== undefined) {
    return `${flavorLabel(line.flavorTag)} ${copy.ingredients.flavorSuffix}`;
  }
  const key = BASE_INGREDIENT_COPY_KEY[line.id];
  return key !== undefined ? copy.ingredients[key] : line.id;
}

/** Polish plural of "składnik" (1 / 2–4 / 5+). */
function pluralSkladnik(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (abs === 1) return copy.result.needsRefinementNoun.one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return copy.result.needsRefinementNoun.few;
  return copy.result.needsRefinementNoun.many;
}

/**
 * Honest "recipe is almost ready — refine the intensity of N ingredients" line.
 * Never a fake total, and never a "fully calculated" claim while any dose is open.
 */
function needsRefinementText(n: number): string {
  return `${copy.result.needsRefinementPrefix} ${n} ${pluralSkladnik(n)}.`;
}

const noteText = (code: string): string => copy.tech.notes[code] ?? code;

/* ------------------------------------------------------------------ *
 * Small local presentational atoms                                   *
 * ------------------------------------------------------------------ */

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[13px] uppercase tracking-[0.12em] text-stone-500">{label}</span>
      <span className="min-w-0 text-right text-[15px] text-ink">{value}</span>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-ink/10 bg-stone-50 px-4 py-3 text-[13px] leading-relaxed text-stone-600">
      {children}
    </p>
  );
}

/**
 * The LIGHT shell root (binding owner decision — light-first, UIUX Slice A,
 * spec §21.1 / audit #4 + #30). The former scoped DARK CSS-variable remap
 * (`DarkShell` + `customerDarkVars`) is retired: the shell renders its
 * light-native classes directly against the global light theme, and the page
 * backdrop matches the `body` (`bg-paper`), so overscroll / keyboard-open never
 * flashes a mismatched colour. `min-h-[100dvh]` keeps the backdrop filling the
 * viewport.
 */
function ShellRoot({ children }: { children: ReactNode }) {
  return <div className="min-h-[100dvh] w-full bg-paper">{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Page                                                               *
 * ------------------------------------------------------------------ */

export function CustomerShellV1() {
  const [flow, setFlow] = useState<CustomerFlowState | null>(null);
  const [persona, setPersona] = useState<CustomerPersona>('demo');

  // Home-screen draft (before the flow is created).
  const [draftText, setDraftText] = useState('');

  // In-flow local input drafts.
  const [chipDraft, setChipDraft] = useState('');
  const [customBatchDraft, setCustomBatchDraft] = useState('');
  const [customBatchOpen, setCustomBatchOpen] = useState(false);
  const [forceBatchEdit, setForceBatchEdit] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ReadyRecipeWorkingDraft | null>(null);

  // Machine-first Home gate (Slice B INTEGRATION §2). The backend factory is
  // deliberately NOT wired — that is the launch gate (migration 0030 unapplied);
  // anonymous/demo sessions persist the machine on this device only.
  const machineStore = useMemo(
    () => selectMachinePreferenceStore({ localDevice: () => localStorageMachinePreferenceStore() }).store,
    [],
  );
  const machinePreference = useMachinePreference(machineStore);
  const [machineChangeOpen, setMachineChangeOpen] = useState(false);
  // A saved record whose catalog id no longer resolves (stale catalog) re-runs
  // onboarding instead of rendering a broken context bar (INTEGRATION §3).
  const machineView =
    machinePreference.record !== null ? buildMachineContextView(machinePreference.record) : null;
  const machineGate: 'off' | 'loading' | 'onboarding' | 'saved' =
    persona !== 'home'
      ? 'off'
      : machinePreference.status === 'loading'
        ? 'loading'
        : machinePreference.record === null || machineView === null || machineChangeOpen
          ? 'onboarding'
          : 'saved';
  const machineRecord = machineGate === 'saved' ? machinePreference.record : null;

  // OWNER FINAL DECISION (2026-07-17): the recommendation is a SOFT proposal.
  // `aboveChoiceFor` remembers the user's pick for the above-recommendation
  // warning FOR ONE amount — editing the grams re-opens the question.
  const [aboveChoiceFor, setAboveChoiceFor] = useState<{
    grams: number;
    choice: AboveRecommendationChoice;
  } | null>(null);
  // After a machine CHANGE the new recommendation is only PROPOSED — the
  // existing recipe amount is never rewritten without the user's confirmation
  // („Dopasuj ilość do nowej maszyny" → preview → Zastosuj).
  const [machineBatchProposal, setMachineBatchProposal] = useState<number | null>(null);
  const [proposalPreviewOpen, setProposalPreviewOpen] = useState(false);

  // §5.2 safety net, event-driven (no state-set effects): every path that can
  // put a Home user with a saved machine in front of a mode-less flow applies
  // the saved answer in its own handler — flow creation ("Dalej"), machine
  // save (handleMachineChosen) and the persona switch below. The device-local
  // store loads in a mount microtask, so a load finishing AFTER flow creation
  // is unreachable today; when the launch-gated backend adapter (network) is
  // wired, revisit this reconciliation (noted in INTEGRATION.md §2).
  const switchPersona = (next: CustomerPersona) => {
    setPersona(next);
    if (next !== 'home') return;
    const record = machinePreference.record;
    if (record === null || buildMachineContextView(record) === null) return;
    // Owner test 11: an in-progress flow is never silently rewritten.
    setFlow((prev) => (prev !== null ? applyMachineRecordIfUnanswered(prev, record) : prev));
  };

  const handleMachineChosen = (completion: MachineOnboardingCompletion) => {
    const isChange = machinePreference.record !== null;
    void machinePreference.save(completion.record);
    setMachineChangeOpen(false);
    setAboveChoiceFor(null);
    if (!isChange) {
      // First setup (§8.5): the chosen machine answers the mode and, when
      // derivable, the amount for an already-created flow.
      setMachineBatchProposal(null);
      setFlow((prev) => (prev !== null ? applyMachineRecordToFlow(prev, completion.record) : prev));
      return;
    }
    // Machine CHANGE (owner final decision): switch the mode routing, but only
    // PROPOSE the new recommended amount — never rewrite the recipe silently.
    const proposed =
      completion.record.defaultBatch.kind === 'grams' ? completion.record.defaultBatch.grams : null;
    setMachineBatchProposal(proposed);
    setProposalPreviewOpen(false);
    setFlow((prev) => {
      if (prev === null) return prev;
      if (prev.mode === null) return applyMachineRecordToFlow(prev, completion.record);
      const keptGrams = prev.explicitBatchGrams;
      let next = selectServingMode(prev, completion.record.resolvedVisibleMode);
      // selectServingMode clears a hand-set batch on Ninja modes — restore the
      // user's amount; the new machine's grams arrive only via the proposal.
      if (keptGrams !== null) next = setBatchGrams(next, keptGrams);
      return next;
    });
  };

  // Ingredient Resolution controller. Called unconditionally (before any early return);
  // its resolvable-line set is derived from the SAME structure the result view renders,
  // so tapping a generic line opens the picker without losing any recipe choice.
  const workingRecipeId = selectedDraft ? selectedDraft.sourceRecipeId : 'preview';
  // The REAL engine result for a NEW recipe (null for a ready-recipe draft — a separate
  // catalogue source). `buildCustomerResult` drives the canonical `calculateRecipe`.
  const engineResult = useMemo<CustomerResult | null>(
    () => (flow !== null && selectedDraft === null ? buildCustomerResult(flow) : null),
    [flow, selectedDraft],
  );
  const resolvableLines = useMemo<ResolvableLine[]>(() => {
    if (flow === null) return [];
    if (selectedDraft) {
      const struct = buildRecipeStructure({ productType: selectedDraft.productType, flavorTags: selectedDraft.flavorTags });
      return struct.lines.map((l) => ({ ingredientId: l.id, ingredientName: structureLineName(l), resolution: l.resolution }));
    }
    const result = engineResult ?? buildCustomerResult(flow);
    return result.lines.map((l) => ({
      ingredientId: l.id,
      ingredientName: resultLineName(l.id, l.role),
      resolution: l.resolution,
    }));
  }, [flow, selectedDraft, engineResult]);
  const resolution = useIngredientResolution(workingRecipeId, resolvableLines);

  // Speech (browser-only, optional).
  const [listening, setListening] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const recognitionRef = useRef<MinimalRecognition | null>(null);
  const speechCtor = getSpeechCtor();
  const micState: MicState = !speechCtor
    ? 'unavailable'
    : micDenied
      ? 'permission-denied'
      : listening
        ? 'listening'
        : 'idle';

  const update = (fn: (s: CustomerFlowState) => CustomerFlowState) =>
    setFlow((prev) => (prev ? fn(prev) : prev));

  const resetAll = () => {
    setFlow(null);
    setDraftText('');
    setChipDraft('');
    setCustomBatchDraft('');
    setCustomBatchOpen(false);
    setForceBatchEdit(false);
    setSelectedDraft(null);
    resolution.reset();
  };

  const handleMic = () => {
    if (!speechCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const rec = new speechCtor();
      rec.lang = 'pl-PL';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript ?? '';
        if (transcript) setDraftText((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setMicDenied(true);
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  /* -------------------------------------------------------------- Home -- */
  if (flow === null) {
    return (
      <ShellRoot>
        <CustomerSurface>
          <CustomerMenu />
          {/* Responsive hero offset: push the opening interaction ~20-25% down the
              first viewport using small-viewport height (svh, browser-chrome-aware),
              clamped so it never grows awkward on very tall or very short screens. */}
          <div style={{ paddingTop: 'clamp(2rem, 14svh, 9rem)' }}>
            <DevPersonaSelect persona={persona} onChange={switchPersona} />
            <header className="pt-2">
              <h1 className="text-[28px] font-light leading-[1.15] tracking-tight text-ink sm:text-[34px]">
                {copy.home.headline}
              </h1>
              <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-stone-600">
                {copy.home.subhead}
              </p>
            </header>

            <div className="mt-8">
              <TextField
                label={copy.home.inputLabel}
                placeholder={copy.home.placeholder}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                trailing={<MicrophoneButton state={micState} label={copy.mic[micLabelKey(micState)]} onClick={handleMic} />}
              />
              <div className="mt-3">
                <TouchButton variant="quiet" size="md" onClick={() => setDraftText(copy.home.example)}>
                  {copy.home.tryExample}
                </TouchButton>
              </div>
              <div className="mt-6">
                <TouchButton
                  block
                  size="lg"
                  disabled={draftText.trim() === ''}
                  onClick={() => {
                    const created = createCustomerFlow({ text: draftText.trim() });
                    // §5.2: a returning Home user's saved machine answers the
                    // six-mode question (and the amount when derivable) up front.
                    setFlow(
                      machineGate === 'saved' && machineRecord !== null
                        ? applyMachineRecordToFlow(created, machineRecord)
                        : created,
                    );
                  }}
                >
                  {copy.home.next}
                </TouchButton>
              </div>
            </div>
          </div>
        </CustomerSurface>
      </ShellRoot>
    );
  }

  /* -------------------------------------------------- Derived flow state -- */
  const typeRes = resolveProductType(flow);
  const batchRes = resolveBatch(flow);
  const status = flowStatus(flow);
  const nq = nextQuestion(flow);
  const chips = activeFlavorChips(flow);
  const recipePath = flow.recipePath;

  // The selected serving / machine mode (one of the six) → its supported internal
  // temperature cell. Ninja modes carry an approved preset mass + skip the batch step.
  const route = resolveServingRoute(flow);
  const selectedMode = route.mode;
  const isNinja = isNinjaMode(flow.mode);

  // OWNER FINAL DECISION (2026-07-17): the machine recommendation is a SOFT
  // starting proposal — the guidance below marks divergence, warns above the
  // recommendation and offers the OPTIONAL even split; it never blocks.
  const machineRecommendedGrams =
    machineGate === 'saved' && machineView !== null ? machineView.recommendedBatchGrams : null;
  const currentBatchGrams = batchRes.satisfied ? batchRes.batchGrams : null;
  const batchGuidance = deriveBatchGuidance({
    recommendedGrams: machineRecommendedGrams,
    currentGrams: currentBatchGrams,
    choice:
      aboveChoiceFor !== null && aboveChoiceFor.grams === currentBatchGrams
        ? aboveChoiceFor.choice
        : 'undecided',
  });

  const isResultPhase =
    recipePath === 'new_recipe' || (recipePath === 'ready_recipe' && selectedDraft !== null);
  const isReadyListPhase = recipePath === 'ready_recipe' && selectedDraft === null;
  const isConfigurePhase = typeRes.status === 'resolved' && recipePath === null;

  // Result payload (redacted at source for Demo).
  const capability = gramVisibilityForPersona(persona);
  const resultMainFlavor = selectedDraft
    ? (selectedDraft.flavorTags[0] ?? null)
    : (chips[0] ?? null);
  const resultType: CustomerProductType = selectedDraft
    ? selectedDraft.productType
    : (typeRes.userFacingType ?? 'gelato');
  const resultTitle = selectedDraft
    ? catalogueTitle(selectedDraft.sourceRecipeId, selectedDraft.title)
    : resultMainFlavor
      ? `${flavorLabel(resultMainFlavor)} · ${copy.productType.short[resultType]}`
      : `${copy.result.title} · ${copy.productType.short[resultType]}`;
  const resultRecipeId = selectedDraft ? selectedDraft.sourceRecipeId : `preview-${resultType}`;
  // The result lines: REAL engine base + flavor requirements for a new recipe; the
  // preserved structure for a ready-recipe draft. Grams (base) come from the real
  // calculateRecipe; Demo redaction happens in buildCustomerRecipeView.
  const currentResult: CustomerResult | null = selectedDraft ? null : (engineResult ?? buildCustomerResult(flow));
  const resultLineInputs: CustomerRecipeLineInput[] = selectedDraft
    ? buildRecipeStructure({ productType: selectedDraft.productType, flavorTags: selectedDraft.flavorTags }).lines.map((l) => ({
        ingredientId: l.id,
        ingredientName: structureLineName(l),
        grams: l.grams,
        resolution: l.resolution,
      }))
    : (currentResult as CustomerResult).lines.map((l) => ({
        ingredientId: l.id,
        ingredientName: resultLineName(l.id, l.role),
        grams: l.grams,
        resolution: l.resolution,
      }));
  const view = buildCustomerRecipeView(
    { recipeId: resultRecipeId, title: resultTitle, productType: resultType, lines: resultLineInputs },
    capability,
  );
  const showStickyUpgrade = isResultPhase && !view.gramsVisible;

  /* ----------------------------------------------------- Ready matches -- */
  const readyQuery: ReadyRecipeQuery = {
    ...(chips[0] !== undefined ? { mainFlavorTag: chips[0] } : {}),
    ...(chips[1] !== undefined ? { secondaryFlavorTag: chips[1] } : {}),
    ...(typeRes.userFacingType !== null ? { productType: typeRes.userFacingType } : {}),
    ...(typeRes.userFacingType === 'vegan' ? { requireVegan: true } : {}),
  };
  const matches: ReadyRecipeMatch[] = isReadyListPhase
    ? matchReadyRecipes(readyQuery, CATALOGUE_FIXTURES)
    : [];

  /* ------------------------------------------------------- Batch pieces -- */
  const presetBatchId = ((): string | undefined => {
    if (customBatchOpen) return 'custom';
    if (flow.explicitBatchGrams === 1000) return '1000';
    if (flow.explicitBatchGrams === 5000) return '5000';
    if (flow.explicitBatchGrams === 10000) return '10000';
    if (flow.explicitBatchGrams !== null) return 'custom';
    return undefined;
  })();

  const onBatchSelect = (id: string) => {
    if (id === 'custom') {
      setCustomBatchOpen(true);
      return;
    }
    setCustomBatchOpen(false);
    update((s) => setBatchGrams(s, Number(id)));
  };

  const confirmCustomBatch = () => {
    const g = Number(customBatchDraft.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) return;
    update((s) => setBatchGrams(s, g));
  };

  const renderBatchSelector = () => (
    <div className="space-y-3">
      <BatchSelector
        legend={copy.batch.legend}
        selectedId={presetBatchId}
        onSelect={onBatchSelect}
        options={[
          { id: '1000', label: copy.batch.options.oneKg },
          { id: '5000', label: copy.batch.options.fiveKg },
          { id: '10000', label: copy.batch.options.tenKg },
          { id: 'custom', label: copy.batch.options.custom },
        ]}
      />
      {customBatchOpen ? (
        <div className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label={copy.batch.customLabel}
            inputMode="numeric"
            placeholder={copy.batch.customPlaceholder}
            value={customBatchDraft}
            onChange={(e) => setCustomBatchDraft(e.target.value)}
          />
          <TouchButton onClick={confirmCustomBatch} disabled={customBatchDraft.trim() === ''}>
            {copy.batch.customConfirm}
          </TouchButton>
        </div>
      ) : null}
    </div>
  );

  // The "Zmień ilość" override editor for a home appliance (Ninja): a single
  // grams field only — never shown by default, only after the customer opens it.
  const renderCustomMassField = () => (
    <div className="flex items-end gap-2">
      <TextField
        className="flex-1"
        label={copy.batch.customLabel}
        inputMode="numeric"
        placeholder={copy.batch.customPlaceholder}
        value={customBatchDraft}
        onChange={(e) => setCustomBatchDraft(e.target.value)}
      />
      <TouchButton onClick={confirmCustomBatch} disabled={customBatchDraft.trim() === ''}>
        {copy.batch.customConfirm}
      </TouchButton>
    </div>
  );

  // How the batch step renders: a Ninja preset auto-selects the mass with no manual
  // input, offering only a secondary "Zmień ilość" override.
  const batchSection = resolveBatchSectionView({
    batch: batchRes,
    isNinja,
    overrideOpen: forceBatchEdit,
  });

  /* ------------------------------------------------------- Path toggle -- */
  const pathToggle = (
    <div className="mb-2 flex gap-2">
      <TouchButton
        variant={recipePath === 'new_recipe' ? 'primary' : 'secondary'}
        size="md"
        onClick={() => {
          setSelectedDraft(null);
          update((s) => chooseRecipePath(s, 'new_recipe'));
        }}
      >
        {copy.path.newRecipe}
      </TouchButton>
      <TouchButton
        variant={recipePath === 'ready_recipe' ? 'primary' : 'secondary'}
        size="md"
        onClick={() => {
          setSelectedDraft(null);
          update((s) => chooseRecipePath(s, 'ready_recipe'));
        }}
      >
        {copy.path.readyRecipe}
      </TouchButton>
    </div>
  );

  /* -------------------------------------------------- Technical details -- */
  const modeReadable = selectedMode ? modeCopyFor(selectedMode.id).label : '—';
  const calcTempReadable = route.temperatureC !== null ? formatTemperatureC(route.temperatureC) : '—';
  const technical = (
    <TechnicalDetails summary={copy.tech.summary}>
      <div className="pt-1">
        {typeRes.userFacingType ? (
          <SummaryRow label={copy.tech.userFacingType} value={copy.productType.short[typeRes.userFacingType]} />
        ) : null}
        {typeRes.internalProfile ? (
          <SummaryRow
            label={copy.tech.internalProfile}
            value={copy.tech.internalProfileLabels[typeRes.internalProfile] ?? typeRes.internalProfile}
          />
        ) : null}
        {typeRes.chocolateRoutedInternally ? (
          <SummaryRow label={copy.tech.previewInternalRouting} value={copy.tech.chocolateRouting} />
        ) : null}
        {selectedMode ? <SummaryRow label={copy.tech.mode} value={modeReadable} /> : null}
        <SummaryRow label={copy.tech.calcTemperature} value={calcTempReadable} />
        <SummaryRow label={copy.tech.batchSource} value={copy.batch.source[batchRes.source]} />
        {batchRes.batchGrams !== null ? (
          <SummaryRow label={copy.tech.batchGrams} value={String(batchRes.batchGrams)} />
        ) : null}
        {isResultPhase ? (
          <SummaryRow
            label={copy.tech.recipeStatus}
            value={
              view.unresolvedCount > 0
                ? needsRefinementText(view.unresolvedCount)
                : copy.result.fullyResolvedNote
            }
          />
        ) : null}

        {(() => {
          const codes = [
            ...typeRes.notes,
            ...batchRes.notes,
            ...(selectedDraft ? selectedDraft.notes : []),
          ];
          if (codes.length === 0) return null;
          return (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <p className="text-[12px] uppercase tracking-[0.12em] text-stone-500">{copy.tech.notesTitle}</p>
              <ul className="mt-2 space-y-1">
                {codes.map((code, i) => (
                  <li key={`${code}-${i}`} className="text-[13px] leading-relaxed text-stone-600">
                    {noteText(code)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Raw trace strings live ONLY in a dev-gated advanced sub-section. */}
        {import.meta.env.DEV ? (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <p className="text-[12px] uppercase tracking-[0.12em] text-stone-500">{copy.tech.advancedTitle}</p>
            {typeRes.engineCategory ? (
              <SummaryRow label={copy.tech.engineCategory} value={typeRes.engineCategory} />
            ) : null}
            {typeRes.internalProfile ? (
              <SummaryRow label={copy.tech.internalProfile} value={typeRes.internalProfile} />
            ) : null}
            {selectedMode ? (
              <SummaryRow
                label={copy.tech.mode}
                value={`${selectedMode.id} · ${formatTemperatureC(selectedMode.temperatureC)}`}
              />
            ) : null}
            {selectedDraft ? (
              <SummaryRow
                label={copy.tech.sourceRecipe}
                value={`${selectedDraft.sourceRecipeId} · ${selectedDraft.sourceVersion}`}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </TechnicalDetails>
  );

  /* ----------------------------------------------------------- Render -- */
  return (
    <ShellRoot>
      <CustomerSurface hasStickyCta={showStickyUpgrade}>
        <CustomerMenu />
        {/* §7.3 machine context bar — Home persona with a saved machine only. */}
        {machineGate === 'saved' && machineView !== null ? (
          <MachineContextBar view={machineView} onChange={() => setMachineChangeOpen(true)} />
        ) : null}
        <DevPersonaSelect persona={persona} onChange={switchPersona} />
        {/* §4.1 conscious machine change — renders above the flow; completing (or
            closing) it returns to the flow, and the new machine re-answers
            mode + amount via handleMachineChosen. */}
        {machineChangeOpen && flow !== null ? (
          <div className="pt-6">
            <MachineOnboarding onComplete={handleMachineChosen} />
            <div className="mt-4">
              <TouchButton variant="quiet" size="md" onClick={() => setMachineChangeOpen(false)}>
                {copy.resolution.close}
              </TouchButton>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between pt-4">
          <h1 className="text-[22px] font-medium tracking-tight text-ink">{copy.home.headline}</h1>
          <TouchButton variant="quiet" size="md" onClick={resetAll}>
            {copy.home.restart}
          </TouchButton>
        </div>

        {/* Flavor chips — always editable while collecting. */}
        <CustomerSection label={copy.chips.label} title={copy.chips.title} lead={copy.chips.lead}>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {chips.map((tag) => (
                <FlavorChip key={tag} label={flavorLabel(tag)} onRemove={() => update((s) => removeFlavorChip(s, tag))} />
              ))}
            </div>
          ) : (
            <p className="text-[15px] leading-relaxed text-stone-600">{copy.chips.empty}</p>
          )}
          <div className="mt-4 flex items-end gap-2">
            <TextField
              className="flex-1"
              label={copy.chips.addLabel}
              placeholder={copy.chips.addPlaceholder}
              value={chipDraft}
              onChange={(e) => setChipDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const t = chipDraft.trim();
                  if (t) {
                    update((s) => addFlavorChip(s, t));
                    setChipDraft('');
                  }
                }
              }}
            />
            <TouchButton
              variant="secondary"
              disabled={chipDraft.trim() === ''}
              onClick={() => {
                const t = chipDraft.trim();
                if (!t) return;
                update((s) => addFlavorChip(s, t));
                setChipDraft('');
              }}
            >
              {copy.chips.addButton}
            </TouchButton>
          </div>
        </CustomerSection>

        {/* Protein — honest, blocked gap (recoverable by picking another base). */}
        {typeRes.status === 'unsupported' ? (
          <CustomerSection label={copy.proteinGap.label} title={copy.proteinGap.title}>
            <Notice>{copy.proteinGap.body}</Notice>
          </CustomerSection>
        ) : null}

        {/* Product type — four visible choices, never "Chocolate". */}
        {typeRes.status === 'unknown' || typeRes.status === 'unsupported' ? (
          <CustomerSection label={copy.productType.label} title={copy.productType.title} lead={copy.productType.lead}>
            <div className="grid grid-cols-1 gap-3">
              {productTypeQuestion().choices.map((choice) => {
                const meta = copy.productType.byKey[choice.labelKey];
                return (
                  <SelectableCard
                    key={choice.value}
                    title={meta?.label ?? choice.value}
                    description={meta?.desc}
                    selected={flow.explicitType === choice.value}
                    onSelect={() => update((s) => setProductType(s, choice.value))}
                  />
                );
              })}
            </div>
          </CustomerSection>
        ) : null}

        {/* Configure: device + serving, capacity/batch, recipe-path fork. */}
        {isConfigurePhase ? (
          <>
            {/* Serving / machine step. Machine-first Home gate (Slice B, spec §8):
                - demo/pro personas keep the six-mode selector as-is;
                - a Home user WITHOUT a saved machine chooses the machine ONCE here
                  (the machine answers the mode question — the six modes never show);
                - a Home user WITH a saved machine skips this step entirely (the
                  §7.3 context bar + „Zmień" handle changes). */}
            {machineGate === 'onboarding' && !machineChangeOpen ? (
              /* Self-contained §8 flow (own headings/copy) — no section wrapper. */
              <div className="pt-10">
                <MachineOnboarding onComplete={handleMachineChosen} />
              </div>
            ) : null}
            {machineGate === 'off' ? (
              /* Serving / machine mode — EXACTLY six customer-facing choices. Each is a
                 customer-facing alias to an existing temperature-aware Engine cell. */
              <CustomerSection label={copy.modes.label} title={copy.modes.title} lead={copy.modes.lead}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {SERVING_MODES.map((m) => {
                    const c = modeCopyFor(m.id);
                    return (
                      <SelectableCard
                        key={m.id}
                        title={c.label}
                        description={c.secondary}
                        selected={flow.mode === m.id}
                        onSelect={() => update((s) => selectServingMode(s, m.id))}
                      />
                    );
                  })}
                </div>
              </CustomerSection>
            ) : null}

            {/* Batch — only once a mode is chosen. A Ninja mode auto-sets its approved
                mass (resolved; override hidden behind "Zmień ilość"); Direct / Fresh
                modes ask only when the quantity is not already known. */}
            {flow.mode !== null ? (
              <CustomerSection label={copy.batch.label} title={copy.batch.title} lead={copy.batch.lead}>
                {batchSection.mode === 'choose' ? (
                  renderBatchSelector()
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-ink/10 bg-stone-50 px-4 py-3">
                      <SummaryRow
                        label={
                          batchSection.labelKind === 'selected'
                            ? copy.batch.selectedLabel
                            : copy.batch.resolvedLabel
                        }
                        value={
                          batchSection.labelKind === 'selected'
                            ? formatBatch(batchRes.batchGrams)
                            : `${formatBatch(batchRes.batchGrams)} — ${copy.batch.source[batchRes.source]}`
                        }
                      />
                      {/* „Zalecany wsad PINGÜINO" — the machine-derived recommendation
                          (never framed as a manufacturer figure). */}
                      {machineRecommendedGrams !== null ? (
                        <p className="mt-1 text-[12px] text-stone-500">
                          {machineOnboardingCopy.batch.recommendedLabel}:{' '}
                          {formatGrams(machineRecommendedGrams)}{' '}
                          {machineOnboardingCopy.batch.recommendedUnit}
                        </p>
                      ) : null}
                    </div>

                    {/* OWNER FINAL DECISION — soft-proposal guidance (never a block). */}
                    {batchGuidance.kind === 'custom' ||
                    (batchGuidance.kind === 'custom_above' && batchGuidance.choice !== 'undecided') ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[13px] text-stone-600">
                          {machineOnboardingCopy.batch.customInUse}
                        </span>
                        <button
                          type="button"
                          className="text-[13px] text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
                          onClick={() => {
                            if (machineRecommendedGrams !== null) {
                              setAboveChoiceFor(null);
                              update((s) => setBatchGrams(s, machineRecommendedGrams));
                            }
                          }}
                        >
                          {machineOnboardingCopy.batch.restoreRecommended}
                        </button>
                      </div>
                    ) : null}
                    {batchGuidance.kind === 'custom_above' && batchGuidance.choice === 'undecided' ? (
                      <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${notice.risky} ${notice.text}`}>
                        <p className="font-medium text-ink">{machineOnboardingCopy.batch.aboveWarning}</p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <TouchButton
                            variant="secondary"
                            size="md"
                            onClick={() =>
                              currentBatchGrams !== null &&
                              setAboveChoiceFor({ grams: currentBatchGrams, choice: 'split' })
                            }
                          >
                            {machineOnboardingCopy.batch.splitAction}
                          </TouchButton>
                          <TouchButton
                            variant="quiet"
                            size="md"
                            onClick={() =>
                              currentBatchGrams !== null &&
                              setAboveChoiceFor({ grams: currentBatchGrams, choice: 'keep_mine' })
                            }
                          >
                            {machineOnboardingCopy.batch.keepMine}
                          </TouchButton>
                          <TouchButton
                            variant="quiet"
                            size="md"
                            onClick={() => {
                              if (machineRecommendedGrams !== null) {
                                setAboveChoiceFor(null);
                                update((s) => setBatchGrams(s, machineRecommendedGrams));
                              }
                            }}
                          >
                            {machineOnboardingCopy.batch.restoreShort}
                          </TouchButton>
                        </div>
                      </div>
                    ) : null}
                    {batchGuidance.kind === 'custom_above' && batchGuidance.split !== null ? (
                      <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${notice.neutral} ${notice.text}`}>
                        <p className="font-medium text-ink">
                          {machineOnboardingCopy.split.message(batchGuidance.split.containers)}
                        </p>
                        <p className="mt-0.5">
                          {machineOnboardingCopy.split.detail(
                            batchGuidance.split.containers,
                            formatGrams(batchGuidance.split.gramsPerContainer),
                          )}
                        </p>
                      </div>
                    ) : null}

                    {/* Machine change: the NEW machine's amount is only a PROPOSAL —
                        „Dopasuj ilość do nowej maszyny" previews before applying. */}
                    {machineGate === 'saved' &&
                    machineBatchProposal !== null &&
                    currentBatchGrams !== null &&
                    machineBatchProposal !== currentBatchGrams ? (
                      <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${notice.neutral} ${notice.text}`}>
                        <p>
                          {machineOnboardingCopy.batch.newRecommendedLabel}:{' '}
                          <span className="font-medium text-ink">
                            {formatGrams(machineBatchProposal)} {machineOnboardingCopy.batch.recommendedUnit}
                          </span>
                        </p>
                        {!proposalPreviewOpen ? (
                          <div className="mt-2">
                            <TouchButton variant="secondary" size="md" onClick={() => setProposalPreviewOpen(true)}>
                              {machineOnboardingCopy.batch.fitToNewMachine}
                            </TouchButton>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <p className="font-mono tabular-nums text-ink">
                              {formatBatch(currentBatchGrams)} → {formatGrams(machineBatchProposal)}{' '}
                              {machineOnboardingCopy.batch.recommendedUnit}
                            </p>
                            <div className="flex gap-2">
                              <TouchButton
                                variant="primary"
                                size="md"
                                onClick={() => {
                                  const grams = machineBatchProposal;
                                  setMachineBatchProposal(null);
                                  setProposalPreviewOpen(false);
                                  setAboveChoiceFor(null);
                                  update((s) => setBatchGrams(s, grams));
                                }}
                              >
                                {machineOnboardingCopy.batch.applyPreview}
                              </TouchButton>
                              <TouchButton variant="quiet" size="md" onClick={() => setProposalPreviewOpen(false)}>
                                {machineOnboardingCopy.batch.cancelPreview}
                              </TouchButton>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                    {batchSection.showChangeAction ? (
                      <TouchButton variant="quiet" size="md" onClick={() => setForceBatchEdit((v) => !v)}>
                        {copy.batch.change}
                      </TouchButton>
                    ) : null}
                    {batchSection.editorOpen
                      ? batchSection.editor === 'custom_mass'
                        ? renderCustomMassField()
                        : renderBatchSelector()
                      : null}
                  </div>
                )}
              </CustomerSection>
            ) : null}

            {/* Two equal paths — neither is a default. */}
            {nq === 'recipe_path' ? (
              <CustomerSection label={copy.path.label} title={copy.path.title} lead={copy.path.lead}>
                <div className="grid grid-cols-1 gap-3">
                  <TouchButton block variant="secondary" size="lg" onClick={() => update((s) => chooseRecipePath(s, 'new_recipe'))}>
                    {copy.path.newRecipe}
                  </TouchButton>
                  <TouchButton block variant="secondary" size="lg" onClick={() => update((s) => chooseRecipePath(s, 'ready_recipe'))}>
                    {copy.path.readyRecipe}
                  </TouchButton>
                </div>
              </CustomerSection>
            ) : null}
          </>
        ) : null}

        {/* Ready recipes — honest labels, missing-photo fallback is expected. */}
        {isReadyListPhase ? (
          <CustomerSection label={copy.ready.label} title={copy.ready.title} lead={copy.ready.lead}>
            {pathToggle}
            {matches.length === 0 ? (
              <EmptyStateView title={copy.ready.title} body={copy.ready.empty} />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {matches.map((match) => {
                  const card: CatalogueRecipeCard = match.card;
                  const title = catalogueTitle(card.id, card.title);
                  const select = () => setSelectedDraft(selectReadyRecipe(card));
                  return (
                    <div key={card.id} className="space-y-2">
                      <ReadyRecipeCard
                        title={title}
                        subtitle={`${copy.productType.short[card.productType]} · ${copy.ready.matchLabels[match.label]}`}
                        imageSrc={null}
                        imageAlt={title}
                        meta={copy.ready.cardMeta}
                        onOpen={select}
                      />
                      <div className="flex gap-2">
                        <TouchButton variant="secondary" size="md" onClick={select}>
                          {copy.ready.view}
                        </TouchButton>
                        <TouchButton variant="quiet" size="md" onClick={select}>
                          {copy.ready.useAsStart}
                        </TouchButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CustomerSection>
        ) : null}

        {/* Result — fixture structure, redacted at source for Demo. */}
        {isResultPhase ? (
          <CustomerSection label={copy.result.label} title={resultTitle}>
            {pathToggle}
            <div className="rounded-2xl border border-ink/10 bg-stone-50 px-4 py-3">
              <SummaryRow label={copy.result.typeLabel} value={copy.productType.short[resultType]} />
              <SummaryRow
                label={copy.result.modeLabel}
                value={selectedMode ? modeCopyFor(selectedMode.id).label : copy.result.modeNone}
              />
              <SummaryRow label={copy.result.batchLabel} value={formatBatch(batchRes.batchGrams)} />
            </div>

            {/* When any flavor line is still an open requirement, say so honestly —
                the preview is NOT a fully calculated recipe. */}
            {view.unresolvedCount > 0 ? (
              <div className="mt-4">
                <Notice>{needsRefinementText(view.unresolvedCount)}</Notice>
              </div>
            ) : null}

            <div className="mt-4">
              <Notice>
                {currentResult
                  ? currentResult.state === 'calculated'
                    ? copy.result.stateCalculated
                    : currentResult.state === 'calculated_out_of_band'
                      ? copy.result.stateOutOfBand
                      : copy.result.stateStructureOnly
                  : copy.result.fixtureNotice}
                {selectedDraft ? ` ${copy.result.draftNotice}` : ''}
              </Notice>
            </div>

            <div className="mt-5">
              <p className="text-[12px] uppercase tracking-[0.14em] text-stone-500">{copy.result.ingredientsTitle}</p>
              <div className="mt-1 divide-y divide-ink/10">
                {view.lines.map((line) => {
                  // A line that STARTED unresolved (generic requirement) is tappable — it
                  // opens the Ingredient Resolution sheet (pick a concrete product). The
                  // chip reflects the controller's live per-line progress.
                  const unresolved = line.resolution !== 'resolved';
                  const res = unresolved ? resolution.lineFor(line.ingredientId) : undefined;
                  const picked = unresolved ? resolution.pickedName(line.ingredientId) : null;
                  const chipLabel =
                    res?.state === 'resolved'
                      ? `${copy.resolution.chipResolvedPrefix}: ${picked ?? ''}`.trim()
                      : res?.state === 'needs_data'
                        ? copy.resolution.chipNeedsData
                        : copy.resolution.chipChoose;
                  return (
                    <IngredientRow
                      key={line.ingredientId}
                      name={res?.state === 'resolved' && picked ? picked : line.ingredientName}
                      locked={!unresolved && line.grams === undefined}
                      lockedLabel={copy.result.lockedInPlans}
                      amount={line.grams !== undefined ? `${line.grams} ${copy.device.unitGrams}` : undefined}
                      intensity={
                        unresolved ? { label: chipLabel, onClick: () => resolution.open(line.ingredientId) } : undefined
                      }
                      onMore={unresolved ? () => resolution.open(line.ingredientId) : undefined}
                      moreLabel={`${copy.rowActions.moreForPrefix}: ${line.ingredientName}`}
                    />
                  );
                })}
              </div>
            </div>

            <PiMonitorSection
              summary={resolution.summary}
              gramsVisible={view.gramsVisible}
              recipeInput={currentResult?.recipeInput ?? null}
              persona={persona}
            />

            <div className="mt-4">{technical}</div>
          </CustomerSection>
        ) : null}

        {/* Technical details are also available during collection. */}
        {status !== 'complete' && !isResultPhase && typeRes.status === 'resolved' ? (
          <div className="mt-2">{technical}</div>
        ) : null}
      </CustomerSurface>

      {showStickyUpgrade ? (
        <StickyCta caption={copy.upgrade.body}>
          <div className="flex gap-2">
            <TouchButton block size="lg" onClick={() => goToSubscription()}>
              {copy.upgrade.chooseHome}
            </TouchButton>
            <TouchButton block size="lg" variant="secondary" onClick={() => goToSubscription()}>
              {copy.upgrade.seePro}
            </TouchButton>
          </div>
        </StickyCta>
      ) : null}

      <ResolutionSheet controller={resolution} />
    </ShellRoot>
  );
}

/* ------------------------------------------------------------------ *
 * Local helpers bound to the component surface                       *
 * ------------------------------------------------------------------ */

function goToSubscription() {
  if (typeof window !== 'undefined') window.location.assign('/subscription');
}

function micLabelKey(state: MicState): 'idle' | 'listening' | 'unavailable' | 'permissionDenied' {
  switch (state) {
    case 'listening':
      return 'listening';
    case 'unavailable':
      return 'unavailable';
    case 'permission-denied':
      return 'permissionDenied';
    default:
      return 'idle';
  }
}

function DevPersonaSelect({
  persona,
  onChange,
}: {
  persona: CustomerPersona;
  onChange: (p: CustomerPersona) => void;
}) {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <label htmlFor="persona-select" className="text-[12px] uppercase tracking-[0.12em] text-stone-500">
        {copy.persona.label}
      </label>
      <select
        id="persona-select"
        value={persona}
        onChange={(e) => onChange(e.target.value as CustomerPersona)}
        className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-[13px] text-ink"
      >
        <option value="demo">{copy.persona.demo}</option>
        <option value="home">{copy.persona.home}</option>
        <option value="pro">{copy.persona.pro}</option>
      </select>
    </div>
  );
}
