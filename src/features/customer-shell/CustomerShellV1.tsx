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
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
  deriveBatchGuidance,
  formatGrams,
  localStorageMachinePreferenceStore,
  userScopedMachineKey,
  machineOnboardingCopy,
  recommendedBatchGramsOf,
  useMachinePreference,
  withUserDefaultBatch,
  type AboveRecommendationChoice,
  type MachineOnboardingCompletion,
  type MachinePreferenceRecord,
} from '@/features/machine-onboarding';
import { selectMachinePreferenceStore } from '@/services/machinePreference/machinePreferenceSelector';
import { applyMachineRecordIfUnanswered, applyMachineRecordToFlow } from './machineFlowBridge';
import { customerShellCopy as copy } from './customerShellCopy';
import { isMonitorTuningApproved } from '@/features/pi-monitor';
import { useAuthStore } from '@/stores/authStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { fromPriceCompact } from '@/billing/catalog/offerDisplay';
import { resolveActiveOfferFlags } from '@/billing/catalog/offerFlags';
import { compactRecipeContext, resultStatus, showTechnicalDetails } from './resultPresentation';
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
  // Persona comes from the REAL entitlement chain (resolveProCorePersona → the
  // account-access EffectiveAccess, DEV override in development), never a hardcoded
  // 'demo' (owner P0 2026-07-18). CustomerPersona and ProCorePersona are the same
  // 'demo'|'home'|'pro' union. In production without a wired EffectiveAccess this
  // resolves to 'demo' — honest, never an invented paid scope.
  const persona = useProCorePersona() as CustomerPersona;
  const setDevPersona = useProCoreAccessStore((s) => s.setDevPersona);
  // The authenticated user id scopes device-local state so nothing leaks between
  // accounts on the same browser (owner P0: Pro must not inherit Home's machine).
  const authUserId = useAuthStore((s) => (s.status === 'authed' ? (s.user?.id ?? null) : null));

  // Home-screen draft (before the flow is created).
  const [draftText, setDraftText] = useState('');

  // In-flow local input drafts.
  const [chipDraft, setChipDraft] = useState('');
  const [customBatchDraft, setCustomBatchDraft] = useState('');
  const [customBatchOpen, setCustomBatchOpen] = useState(false);
  const [forceBatchEdit, setForceBatchEdit] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ReadyRecipeWorkingDraft | null>(null);

  // Owner UX correction §9: the fixed paywall must never overlap content. Its
  // real height varies with caption wrapping (desktop vs mobile), so we MEASURE
  // the bar and reserve exactly that much clearance. A callback ref keeps these
  // hooks unconditional — the shell early-returns before the result render, so a
  // useRef/useEffect placed near that render would break the Rules of Hooks.
  const [stickyReservePx, setStickyReservePx] = useState<number | null>(null);
  const stickyObserverRef = useRef<ResizeObserver | null>(null);
  const measureStickyCta = useCallback((el: HTMLDivElement | null) => {
    stickyObserverRef.current?.disconnect();
    stickyObserverRef.current = null;
    if (el === null) {
      setStickyReservePx(null);
      return;
    }
    const measure = () => setStickyReservePx(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      stickyObserverRef.current = ro;
    }
  }, []);

  // Machine-first Home gate (Slice B INTEGRATION §2). The backend factory is
  // deliberately NOT wired — that is the launch gate (migration 0030 unapplied);
  // anonymous/demo sessions persist the machine on this device only.
  const machineStore = useMemo(
    () =>
      selectMachinePreferenceStore({
        // Device fallback keyed by the signed-in user, so switching accounts on the
        // same browser loads the correct account's machine (never the previous one).
        localDevice: () => localStorageMachinePreferenceStore(undefined, userScopedMachineKey(authUserId)),
      }).store,
    [authUserId],
  );
  const machinePreference = useMachinePreference(machineStore);
  const [machineChangeOpen, setMachineChangeOpen] = useState(false);

  /**
   * TWO SEPARATE machine levels (owner correction 2026-07-17):
   *  - the PROFILE default machine — `machinePreference.record`, persisted;
   *  - the RECIPE-only override — `recipeMachineRecord`, session state, never
   *    written to the profile unless the user explicitly promotes it.
   * The recipe surface uses the EFFECTIVE machine = override ?? profile default.
   */
  const [recipeMachineRecord, setRecipeMachineRecord] = useState<MachinePreferenceRecord | null>(null);
  // One-time notice right after a recipe-scope machine change.
  const [recipeMachineNotice, setRecipeMachineNotice] = useState(false);
  // „Domyślna maszyna została zmieniona na …” confirmation (profile promotion).
  const [defaultChangedName, setDefaultChangedName] = useState<string | null>(null);

  // A saved record whose catalog id no longer resolves (stale catalog) re-runs
  // onboarding instead of rendering a broken context bar (INTEGRATION §3).
  const profileContextView =
    machinePreference.record !== null ? buildMachineContextView(machinePreference.record) : null;
  /**
   * Machine-first gate (owner hotfix 2026-07-17 §7/§8 — P0 regression).
   *
   * It keys off the FLOW, not off an account: the public customer flow IS Home
   * (production serves every visitor as `demo` — there is no persona selector
   * there), so gating on `persona === 'home'` made machine-first unreachable in
   * production and put the six engine modes back in front of everyone. Only
   * `pro` opts out (§9: a professional picks a serving temperature, never a
   * device). An anonymous visitor whose machine lives in localStorage is
   * respected exactly like a signed-in one. The gate keys off the PROFILE
   * record — a recipe override never sends a machine-owning user back to
   * onboarding.
   */
  const machineGate: 'off' | 'loading' | 'onboarding' | 'saved' =
    persona === 'pro'
      ? 'off'
      : machinePreference.status === 'loading'
        ? 'loading'
        : machinePreference.record === null || profileContextView === null || machineChangeOpen
          ? 'onboarding'
          : 'saved';
  const profileMachineRecord = machineGate === 'saved' ? machinePreference.record : null;
  // The machine the CURRENT recipe uses (override wins over the profile default).
  const machineRecord =
    machineGate === 'saved' ? (recipeMachineRecord ?? profileMachineRecord) : null;
  const usingRecipeOverride = machineGate === 'saved' && recipeMachineRecord !== null;
  const profileMachineView =
    profileMachineRecord !== null ? buildMachineContextView(profileMachineRecord) : null;
  // The context view of the machine the CURRENT recipe uses (override or default).
  const machineView = machineRecord !== null ? buildMachineContextView(machineRecord) : null;

  // OWNER FINAL DECISION (2026-07-17): the recommendation is a SOFT proposal.
  // `aboveChoiceFor` remembers the user's pick for the above-recommendation
  // warning FOR ONE amount — editing the grams re-opens the question.
  const [aboveChoiceFor, setAboveChoiceFor] = useState<{
    grams: number;
    choice: AboveRecommendationChoice;
  } | null>(null);
  // Honest save-failure surface (owner §2/§3): a blocked/quota-full device
  // store must tell the user, not silently swallow the machine.
  const [machineSaveFailed, setMachineSaveFailed] = useState(false);
  // §6: a per-recipe amount NEVER rewrites the profile — saving it as the
  // default is an explicit, separate action with its own confirmation.
  const [savedAsDefaultGrams, setSavedAsDefaultGrams] = useState<number | null>(null);

  // §5.2 safety net, event-driven (no state-set effects): every path that can
  // put a Home user with a saved machine in front of a mode-less flow applies
  // the EFFECTIVE machine (override or default) in its own handler. The
  // device-local store loads in a mount microtask, so a load finishing AFTER
  // flow creation is unreachable today; revisit when the launch-gated backend
  // adapter (network) is wired (noted in INTEGRATION.md §2).
  const switchPersona = (next: CustomerPersona) => {
    // DEV-only override (the selector renders only in development); production
    // persona always comes from the real entitlement via useProCorePersona.
    // CustomerPersona and ProCorePersona are the same literal union.
    setDevPersona(next);
    if (next === 'pro') return;
    const record = recipeMachineRecord ?? machinePreference.record;
    if (record === null || buildMachineContextView(record) === null) return;
    // An in-progress flow is never silently rewritten.
    setFlow((prev) => (prev !== null ? applyMachineRecordIfUnanswered(prev, record) : prev));
  };

  /**
   * FIRST-TIME machine setup (no profile default yet): this DOES set the
   * profile default and applies it to the flow. Called from the onboarding
   * gate — never from the recipe-scope „Zmień dla tej receptury”.
   */
  const handleMachineFirstSetup = (completion: MachineOnboardingCompletion) => {
    void machinePreference.save(completion.record).then((ok) => {
      if (!ok) setMachineSaveFailed(true);
    });
    setMachineChangeOpen(false);
    setRecipeMachineRecord(null);
    setRecipeMachineNotice(false);
    setAboveChoiceFor(null);
    setSavedAsDefaultGrams(null);
    setFlow((prev) => (prev !== null ? applyMachineRecordToFlow(prev, completion.record) : prev));
  };

  /**
   * RECIPE-SCOPE machine change („Zmień dla tej receptury”): sets a SESSION
   * override, applies it to THIS recipe (mode + effective default grams), and
   * NEVER writes the profile (owner correction §2). A one-time notice explains
   * the scope; the profile default is unchanged.
   */
  const handleRecipeMachineChange = (completion: MachineOnboardingCompletion) => {
    setMachineChangeOpen(false);
    setRecipeMachineRecord(completion.record);
    setRecipeMachineNotice(true);
    setAboveChoiceFor(null);
    setSavedAsDefaultGrams(null);
    setFlow((prev) => (prev !== null ? applyMachineRecordToFlow(prev, completion.record) : prev));
  };

  /** „Wróć do domyślnej”: drop the override, return the recipe to the profile default. */
  const revertToDefaultMachine = () => {
    setRecipeMachineRecord(null);
    setRecipeMachineNotice(false);
    setAboveChoiceFor(null);
    setSavedAsDefaultGrams(null);
    if (profileMachineRecord !== null) {
      const record = profileMachineRecord;
      setFlow((prev) => (prev !== null ? applyMachineRecordToFlow(prev, record) : prev));
    }
  };

  /**
   * „Ustaw również jako domyślną”: the CONSCIOUS promotion — persist the recipe
   * override to the profile, then clear the override (it now IS the default)
   * and confirm the change (owner correction §2/§7).
   */
  const promoteRecipeMachineToDefault = () => {
    const record = recipeMachineRecord;
    if (record === null) return;
    const view = buildMachineContextView(record);
    void machinePreference.save(record).then((ok) => {
      if (!ok) {
        setMachineSaveFailed(true);
        return;
      }
      setRecipeMachineRecord(null);
      setRecipeMachineNotice(false);
      setDefaultChangedName(view?.name ?? null);
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

  /**
   * Start the flow from the home field (owner hotfix §4 — P0). Enter must do
   * exactly what „Dalej” does: the text is never silently dropped.
   */
  const startFlowFromDraft = () => {
    const text = draftText.trim();
    if (text === '') return;
    const created = createCustomerFlow({ text });
    // A NEW recipe always starts from the PROFILE default (owner correction §5):
    // any recipe-scope override from a previous recipe is dropped here.
    setRecipeMachineRecord(null);
    setRecipeMachineNotice(false);
    setDefaultChangedName(null);
    setFlow(
      machineGate === 'saved' && profileMachineRecord !== null
        ? applyMachineRecordToFlow(created, profileMachineRecord)
        : created,
    );
  };

  /**
   * Commit whatever is typed in the flavour field (owner hotfix §4B): text the
   * user entered but did not confirm is folded in BEFORE the next step instead
   * of being silently dropped. `addFlavorChip` trims + de-duplicates, so an
   * empty or repeated value is a no-op.
   */
  const withPendingChip = (state: CustomerFlowState): CustomerFlowState => {
    const pending = chipDraft.trim();
    return pending === '' ? state : addFlavorChip(state, pending);
  };

  const commitChipDraft = () => {
    if (chipDraft.trim() === '') return;
    update(withPendingChip);
    setChipDraft('');
  };

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
    // Starting over drops any recipe-scope machine override (the profile
    // default is untouched — it lives in machinePreference).
    setRecipeMachineRecord(null);
    setRecipeMachineNotice(false);
    setDefaultChangedName(null);
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
                // §4: Enter (incl. NumpadEnter — both report key 'Enter') and the
                // mobile Go/Done key start the flow, exactly like „Dalej”. The IME
                // guard keeps composition (e.g. a mid-word suggestion) from
                // submitting a half-typed idea.
                enterKeyHint="go"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  startFlowFromDraft();
                }}
                trailing={<MicrophoneButton state={micState} label={copy.mic[micLabelKey(micState)]} onClick={handleMic} />}
              />
              <div className="mt-3">
                <TouchButton variant="quiet" size="md" onClick={() => setDraftText(copy.home.example)}>
                  {copy.home.tryExample}
                </TouchButton>
              </div>
              <div className="mt-6">
                <TouchButton block size="lg" disabled={draftText.trim() === ''} onClick={startFlowFromDraft}>
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
    machineGate === 'saved' && machineRecord !== null ? recommendedBatchGramsOf(machineRecord) : null;
  /** The profile's effective default — what a NEW recipe starts from (§5). */
  const machineProfileDefaultGrams =
    machineGate === 'saved' && machineRecord !== null
      ? (machineRecord.userDefaultBatchGrams ?? machineRecommendedGrams)
      : null;
  const currentBatchGrams = batchRes.satisfied ? batchRes.batchGrams : null;
  const batchGuidance = deriveBatchGuidance({
    recommendedGrams: machineRecommendedGrams,
    currentGrams: currentBatchGrams,
    choice:
      aboveChoiceFor !== null && aboveChoiceFor.grams === currentBatchGrams
        ? aboveChoiceFor.choice
        : 'undecided',
  });

  /**
   * The serving step reaches this render ONLY for `pro` (machineGate 'off') —
   * every other persona is machine-first. Owner hotfix §9: a professional picks
   * a SERVING TEMPERATURE (−11/−12/−13) and never a home device, so the Ninja /
   * Świeże machine aliases are not offered in the same group.
   */
  const proServingModes = SERVING_MODES.filter((m) => m.id.startsWith('temp_minus_'));

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
  // Entry prices for the paywall CTAs, from the canonical offer catalogue (never
  // hardcoded). Home is paid — a price always shows; Demo is the only free tier.
  const offerFlags = resolveActiveOfferFlags();
  const homeFromPrice = fromPriceCompact('home', offerFlags);
  const proFromPrice = fromPriceCompact('pro', offerFlags);
  // Owner UX correction §3/§10: the Home/Demo customer never sees the internal
  // serving mode („Świeże”) or the „Dane techniczne” disclosure — those belong
  // to the professional (and Expert Mode) view only.
  const showTechnical = showTechnicalDetails(persona);
  // Owner UX correction §11: ONE unambiguous recipe status (never „prawie gotowa”
  // and „wyliczona przez silnik” side by side).
  const statusView = resultStatus({
    // The LIVE remaining count from the resolution controller — so once the
    // customer picks a real product for every open line, the status flips from
    // „Wymaga wyboru N produktów” to ready (Track A: the recipe reflects the pick),
    // matching the Monitor's recalc gate which already keys off the same state.
    unresolvedCount: resolution.summary.unresolvedCount,
    gramsVisible: view.gramsVisible,
    outOfBand: currentResult?.state === 'calculated_out_of_band',
    // A structure-only card (unsupported profile) or a catalogue draft has no
    // engine numbers — it is a preview, never „ready to recalculate”.
    calculated: currentResult !== null && currentResult.state !== 'structure_only',
    // Track G: don't send the customer to Monitor tuning at a serving temperature
    // where tuning is honestly unavailable (pending scientific approval).
    tuningAvailable:
      currentResult?.recipeInput == null ||
      isMonitorTuningApproved(
        currentResult.recipeInput.category,
        currentResult.recipeInput.target_temperature_c,
      ),
  });

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
          // Owner §11: the Pro diagnostic mirrors the SAME single status shown
          // above — never the old „prawie gotowa” phrasing beside it.
          <SummaryRow label={copy.tech.recipeStatus} value={statusView.label} />
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
      <CustomerSurface hasStickyCta={showStickyUpgrade} stickyReservePx={stickyReservePx}>
        <CustomerMenu />
        {/* §7.3 machine context bar. Shows the machine the CURRENT recipe uses;
            an override adds the „Domyślna maszyna: X” line + revert / promote
            actions. „Zmień dla tej receptury” is recipe-scope only. */}
        {machineGate === 'saved' && machineView !== null ? (
          <MachineContextBar
            view={machineView}
            onChange={() => {
              setMachineSaveFailed(false);
              setMachineChangeOpen(true);
            }}
            override={
              usingRecipeOverride && profileMachineView !== null
                ? {
                    defaultName: profileMachineView.name,
                    onRevert: revertToDefaultMachine,
                    onSetAsDefault: promoteRecipeMachineToDefault,
                  }
                : null
            }
          />
        ) : null}
        {/* One-time notice right after a recipe-scope machine change (§2). */}
        {recipeMachineNotice && usingRecipeOverride && machineView !== null && profileMachineView !== null ? (
          <div className={`mt-3 rounded-xl px-4 py-3 text-[13px] leading-relaxed ${notice.neutral} ${notice.text}`}>
            <p className="text-ink">
              {machineOnboardingCopy.recipeMachine.onlyThisRecipe(machineView.name, profileMachineView.name)}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <TouchButton variant="secondary" size="md" onClick={() => setRecipeMachineNotice(false)}>
                {machineOnboardingCopy.recipeMachine.continueForRecipe}
              </TouchButton>
              <TouchButton variant="quiet" size="md" onClick={promoteRecipeMachineToDefault}>
                {machineOnboardingCopy.recipeMachine.alsoSetAsDefault}
              </TouchButton>
              <TouchButton variant="quiet" size="md" onClick={revertToDefaultMachine}>
                {machineOnboardingCopy.recipeMachine.backToDefault}
              </TouchButton>
            </div>
          </div>
        ) : null}
        {/* „Domyślna maszyna została zmieniona na …” confirmation (profile promoted). */}
        {defaultChangedName !== null ? (
          <p role="status" className={`mt-3 rounded-xl px-4 py-3 text-[13px] ${notice.ideal} ${notice.text}`}>
            ✓ {machineOnboardingCopy.recipeMachine.defaultChanged(defaultChangedName)}
          </p>
        ) : null}
        {/* Honest save-failure surface (owner §2/§3) — never a silent swallow. */}
        {machineSaveFailed ? (
          <p role="alert" className={`mt-3 rounded-xl px-4 py-3 text-[13px] ${notice.error} ${notice.text}`}>
            {machineOnboardingCopy.settings.saveFailed}
          </p>
        ) : null}
        <DevPersonaSelect persona={persona} onChange={switchPersona} />
        {/* Recipe-scope machine change („Zmień dla tej receptury”) — renders above
            the flow; completing it sets a SESSION override (the profile default
            is untouched), closing it returns to the flow unchanged. */}
        {machineChangeOpen && flow !== null ? (
          <div className="pt-6">
            <MachineOnboarding onComplete={handleRecipeMachineChange} />
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
        {/* §5: once a flavour is confirmed the step asks about ANOTHER one — it
            must never read like a fresh request for the flavour just given. */}
        <CustomerSection
          label={copy.chips.label}
          title={copy.chips.title}
          lead={chips.length > 0 ? copy.chips.leadMore : copy.chips.lead}
        >
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
              // §4C: Enter / NumpadEnter (both report 'Enter') and the mobile
              // Go/Done key confirm the flavour; the IME guard prevents a
              // composition Enter from adding a half-composed word.
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                commitChipDraft();
              }}
            />
            <TouchButton variant="secondary" disabled={chipDraft.trim() === ''} onClick={commitChipDraft}>
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
                    // §4B: an unconfirmed flavour is folded in before advancing.
                    onSelect={() => {
                      update((s) => setProductType(withPendingChip(s), choice.value));
                      setChipDraft('');
                    }}
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
                <MachineOnboarding
                  onComplete={handleMachineFirstSetup}
                  submitLabel={machineOnboardingCopy.settings.saveAndGoToRecipe}
                />
              </div>
            ) : null}
            {machineGate === 'off' ? (
              /* Serving / machine mode — EXACTLY six customer-facing choices. Each is a
                 customer-facing alias to an existing temperature-aware Engine cell. */
              <CustomerSection label={copy.modes.label} title={copy.modes.title} lead={copy.modes.lead}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {proServingModes.map((m) => {
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

                    {/* (The old „Dopasuj ilość do nowej maszyny" preview flow was
                        removed with the owner correction 2026-07-17: a recipe
                        machine change now applies the new machine's effective
                        default directly, and the context bar carries the
                        revert / promote-to-default actions.) */}
                    {/* §6: this recipe's amount differs from the saved profile
                        default — offer to make it the default, EXPLICITLY. The
                        confirmation outlives the offer (once saved, the amount
                        EQUALS the default, so the offer's own condition stops
                        holding — the user must still see that it worked). */}
                    {machineGate === 'saved' && machineRecord !== null && currentBatchGrams !== null ? (
                      savedAsDefaultGrams === currentBatchGrams ? (
                        <p role="status" className="text-[13px] text-status-ideal">
                          ✓ {machineOnboardingCopy.recipeAmount.savedAsDefault}
                        </p>
                      ) : machineProfileDefaultGrams !== null &&
                        currentBatchGrams !== machineProfileDefaultGrams ? (
                        <button
                          type="button"
                          className="text-left text-[13px] text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
                          onClick={() => {
                            const next = withUserDefaultBatch(
                              machineRecord,
                              currentBatchGrams,
                              new Date().toISOString(),
                            );
                            if (next === null) return;
                            void machinePreference.save(next).then((ok) => {
                              if (ok) setSavedAsDefaultGrams(currentBatchGrams);
                            });
                          }}
                        >
                          {machineOnboardingCopy.recipeAmount.saveAsDefault(formatGrams(currentBatchGrams))}
                        </button>
                      ) : null
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
            {/* Owner UX correction §4/§5: ONE compact context line — kind of ice
                cream + amount. The machine is already shown in the bar above, and
                the internal serving mode („Świeże”) is never shown to the customer.
                „Zmień ilość” re-opens the amount editor inline. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-ink/10 bg-stone-50 px-4 py-3">
              <span className="text-[15px] text-ink">{compactRecipeContext(resultType, batchRes.batchGrams)}</span>
              <TouchButton variant="quiet" size="md" onClick={() => setForceBatchEdit((v) => !v)}>
                {copy.batch.change}
              </TouchButton>
            </div>
            {forceBatchEdit ? (
              <div className="mt-3">{isNinja ? renderCustomMassField() : renderBatchSelector()}</div>
            ) : null}

            {/* Owner UX correction §11: exactly ONE status, with optional one-line
                guidance (required-products, or the out-of-band Monitor hint). */}
            <div className="mt-4">
              <Notice>{statusView.label}</Notice>
              {statusView.guidance ? (
                <p className="mt-2 text-[13px] leading-relaxed text-stone-600">{statusView.guidance}</p>
              ) : null}
              {selectedDraft ? (
                <p className="mt-2 text-[13px] leading-relaxed text-stone-600">{copy.result.draftNotice}</p>
              ) : null}
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
              machineContext={
                machineGate === 'saved' && machineView !== null
                  ? { name: machineView.name, batchFit: batchGuidance.kind }
                  : null
              }
            />

            {/* Owner §10: „Dane techniczne” is a professional / Expert-Mode
                surface — never part of the simplified Home view. */}
            {showTechnical ? <div className="mt-4">{technical}</div> : null}
          </CustomerSection>
        ) : null}

        {/* Technical details are also available during collection — Pro only. */}
        {showTechnical && status !== 'complete' && !isResultPhase && typeRes.status === 'resolved' ? (
          <div className="mt-2">{technical}</div>
        ) : null}
      </CustomerSurface>

      {showStickyUpgrade ? (
        <StickyCta caption={copy.upgrade.body} innerRef={measureStickyCta}>
          <div className="flex gap-2">
            {/* Prices come from the canonical offer catalogue — a customer sees the
                entry price on the button, not after another click (owner P0). */}
            <TouchButton block size="lg" onClick={() => goToSubscription()}>
              <span className="flex flex-col leading-tight">
                <span>{copy.upgrade.chooseHome}</span>
                {homeFromPrice ? (
                  <span className="text-[11px] font-normal opacity-80">{homeFromPrice}</span>
                ) : null}
              </span>
            </TouchButton>
            <TouchButton block size="lg" variant="secondary" onClick={() => goToSubscription()}>
              <span className="flex flex-col leading-tight">
                <span>{copy.upgrade.seePro}</span>
                {proFromPrice ? (
                  <span className="text-[11px] font-normal opacity-80">{proFromPrice}</span>
                ) : null}
              </span>
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
