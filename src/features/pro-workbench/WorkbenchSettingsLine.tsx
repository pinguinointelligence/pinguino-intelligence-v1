import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { upsertUserRecipeDefault } from '@/services/userRecipeDefaults';
import { commitRecipeDefaultsAfterRemoteSave } from './accountRecipeDefaultsSave';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { PROFESSIONAL_DEFAULT_BATCH_GRAMS, useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import type { VisibleProductType } from '@/features/studio/productType';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  listActiveHomeMachines,
  planContainerSplit,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import {
  RecipeCustomMachineDialog,
  containerSplitNotice,
  deriveBatchGuidance,
  effectiveDefaultBatchGrams,
  machineDisplayName,
  machineOnboardingCopy,
  pluralCykle,
  type AboveRecommendationChoice,
  type MachineOnboardingCompletion,
} from '@/features/machine-onboarding';
import {
  profileSettingsSignature,
  savedRecipeProfileDraftIdentity,
  showsProfessionalServing,
  useRecipeProfileStore,
} from './recipeProfileStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import {
  FORMULATION_STRATEGIES,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';
import { DeferredNumberInput } from '@/components/forms/DeferredNumberInput';
import {
  isNewRecipeServingModeId,
  starterServingModeForTemperature,
} from '@/features/recipes/newRecipeStarter';
import { PRO_VISIBLE_PRODUCT_TYPES } from './profileCompatibility';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import {
  requestNewRecipeProductTypeChange,
  changeProRecipeProductType,
} from '@/pages/destinations/startNewProRecipe';

const g = copy.studio.goal;
const batchCopy = copy.proWorkbench.batchTarget;
const stepCopy = copy.proWorkbench.settingsSteps;
/** PRO MOBILE UX v2 · B4 — the first-run settings sequence on a phone. */
const PAGER_STEPS = 3;
const servingCopy = copy.proMachine.serving;
const professionalLabel = copy.proMachine.professionalLabel;

const STRATEGY_COPY: Record<FormulationStrategy, { label: string; description: string }> = {
  optimal: { label: 'OPTIMAL', description: 'Priorytet smaku.' },
  eco: { label: 'ECO', description: 'Priorytet kosztu.' },
};
const SERVING_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'fresh', label: servingCopy.fresh },
  { id: 'temp_minus_11', label: servingCopy.minus11 },
  { id: 'temp_minus_12', label: servingCopy.minus12 },
  { id: 'temp_minus_13', label: servingCopy.minus13 },
];

/* GELLATTI V2.1 — the approved Settings field: a 46 px white cell with one
   hairline, a 9 px quiet label and an 11 px bold value, its disclosure mark on
   the right edge. Mobile keeps a 44 px touch target. */
const compactSelect =
  'h-11 min-w-0 appearance-none rounded-[9px] border border-[var(--g-line)] bg-white px-[11px] text-[13px] text-[var(--g-ink)] shadow-none transition-colors hover:border-ink/35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f58a07] lg:h-[46px] lg:text-[11px] lg:font-bold';
const compactFinalSettingsLabel =
  'block text-[9px] leading-[10px] font-normal text-[var(--g-text-field-label)]';
/* The two Settings helper lines are not part of the approved 46 px field, so
   they travel in the control's accessible description instead of taking a
   third row (owner §13). No information is removed. */
const compactSettingsHelper = 'sr-only';
/* The three non-blocking actions under the above-recommendation warning. Quiet
   white cells in the Settings palette — an advisory, never a primary control. */
const aboveActionClass =
  'pro-focus-ring min-h-9 rounded-[8px] border border-[var(--g-line)] bg-white px-3 text-xs font-semibold whitespace-nowrap text-ink shadow-none transition-colors hover:border-ink/35';
const TARGET_BATCH_STEP_GRAMS = 10;

function LabeledSelect<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
  testid,
  stacked = false,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labelOf: (option: T) => string;
  onChange: (next: T) => void;
  testid: string;
  stacked?: boolean;
}) {
  return (
    <label
      className={cn(
        stacked ? 'relative block' : 'grid grid-cols-[6.8rem_minmax(0,1fr)] items-center gap-2',
      )}
    >
      <span
        className={cn(
          'text-[var(--g-text-field-label)]',
          stacked
            ? 'pointer-events-none absolute top-[11px] left-[11px] z-10 text-[9px] leading-[10px] font-normal'
            : 'text-xs font-medium text-stone-600',
        )}
      >
        {label}
      </span>
      <select
        className={cn(compactSelect, 'w-full', stacked && 'h-11 pt-[16px] pr-[30px] lg:h-[46px]')}
        value={value}
        aria-label={label}
        data-testid={testid}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelOf(option)}
          </option>
        ))}
      </select>
      {stacked ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-[11px] z-10 -translate-y-1/2 text-[14px] leading-none text-[var(--g-ink)]"
        >
          ⌄
        </span>
      ) : null}
    </label>
  );
}

function TargetBatchControl({
  grams,
  currentTotalGrams,
  compact,
  homeMachine,
  recommendedBatchGrams,
  cyclePlan,
  resizeConflict,
  onChange,
}: {
  grams: number;
  /** The recipe's current base total, from the Engine result (PRO MOBILE UX v2 · B5). */
  currentTotalGrams: number | null;
  compact: boolean;
  homeMachine: boolean;
  recommendedBatchGrams: number | null;
  cyclePlan: ReturnType<typeof planContainerSplit>;
  resizeConflict: boolean;
  onChange: (grams: number) => void;
}) {
  const helper = !homeMachine
    ? 'Ilość bazy lodowej do przygotowania.'
    : cyclePlan === null
      ? 'Brak potwierdzonej pojemności tej maszyny.'
      : cyclePlan.containers === 1
        ? 'Jedna partia = jeden cykl.'
        : `${cyclePlan.containers} ${pluralCykle(cyclePlan.containers)} · ${cyclePlan.gramsPerContainer.toLocaleString('pl-PL')} g / cykl`;

  return (
    <div
      className={cn(
        'min-w-0',
        compact
          ? cn('profile-settings-final-card', homeMachine ? 'order-3' : 'order-5')
          : 'rounded-[12px] border border-ink/10 bg-white px-3 py-2',
      )}
      data-testid="profile-batch-combined"
      data-settings-cell="batch"
      data-settings-final-card="batch"
      data-settings-step="3"
    >
      <span
        className={cn(compactFinalSettingsLabel, !compact && 'text-xs font-medium text-stone-600')}
        data-settings-label="batch"
      >
        {batchCopy.label}
      </span>
      <span
        className="mt-0.5 block text-[10px] leading-snug text-[var(--g-text-secondary)]"
        data-testid="workbench-batch-scope"
      >
        {batchCopy.caption}
      </span>
      {/* PRO MOBILE UX v2 · B5 — a parameter of the WHOLE batch, and it looks like
          one: a dashed batch card with the mass in front and two quiet adjustment
          chips, never the − value + stepper every ingredient row uses. */}
      <div
        className="mt-2 flex min-w-0 items-center gap-2 rounded-[10px] border border-dashed border-[var(--g-line-strong)] bg-[var(--g-ivory)]/55 px-2.5 py-2"
        data-settings-control="batch"
        data-batch-presentation="whole-batch"
      >
        <svg
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 text-[var(--g-ink)]"
        >
          <path
            d="M4 8h16l-1.6 10.4A2 2 0 0 1 16.42 20H7.58a2 2 0 0 1-1.98-1.6L4 8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M3 8h18M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="flex min-w-0 items-baseline gap-1">
          <DeferredNumberInput
            className="min-w-0 w-[6ch] bg-transparent text-right font-mono text-[18px] font-semibold text-[var(--g-ink)] tabular-nums outline-none"
            value={Number.isFinite(grams) ? grams : 0}
            min={1}
            decimals={0}
            aria-label="Docelowa partia"
            data-testid="workbench-batch"
            onCommit={onChange}
          />
          <span className="font-mono text-[12px] text-[var(--g-text-secondary)]">g</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`Zmniejsz partię docelową o ${TARGET_BATCH_STEP_GRAMS} g`}
            data-testid="workbench-batch-decrement"
            disabled={grams <= 1}
            onClick={() => onChange(Math.max(1, grams - TARGET_BATCH_STEP_GRAMS))}
            className="pro-focus-ring h-9 rounded-full border border-[var(--g-line)] bg-white px-2.5 font-mono text-[11px] font-semibold text-[var(--g-ink)] transition-colors hover:border-ink/35 disabled:cursor-not-allowed disabled:text-[var(--g-lock)]"
          >
            −{TARGET_BATCH_STEP_GRAMS}
          </button>
          <button
            type="button"
            aria-label={`Zwiększ partię docelową o ${TARGET_BATCH_STEP_GRAMS} g`}
            data-testid="workbench-batch-increment"
            onClick={() => onChange(grams + TARGET_BATCH_STEP_GRAMS)}
            className="pro-focus-ring h-9 rounded-full border border-[var(--g-line)] bg-white px-2.5 font-mono text-[11px] font-semibold text-[var(--g-ink)] transition-colors hover:border-ink/35"
          >
            +{TARGET_BATCH_STEP_GRAMS}
          </button>
        </span>
      </div>
      {currentTotalGrams !== null && Number.isFinite(currentTotalGrams) && currentTotalGrams > 0 ? (
        <p
          className="mt-1.5 text-[10px] leading-relaxed text-[var(--g-text-secondary)]"
          data-testid="workbench-batch-current"
        >
          {batchCopy.current(`${Math.round(currentTotalGrams).toLocaleString('pl-PL')} g`)}
          {Math.round(currentTotalGrams) !== Math.round(grams) ? (
            <span className="text-[var(--g-attention-ink)]" data-testid="workbench-batch-mismatch">
              {` · ${batchCopy.mismatch}`}
            </span>
          ) : null}
        </p>
      ) : null}
      <p
        className="mt-1.5 text-[10px] leading-relaxed text-[var(--g-text-secondary)]"
        data-testid={homeMachine ? 'home-machine-cycles' : undefined}
      >
        {helper}
      </p>
      {homeMachine ? (
        <span className="sr-only" data-testid="home-machine-capacity">
          Zalecany wsad na cykl:{' '}
          {recommendedBatchGrams === null ? 'brak danych' : `${recommendedBatchGrams} g`}
        </span>
      ) : null}
      {resizeConflict ? (
        <p
          role="alert"
          className="mt-1.5 text-xs text-status-error"
          data-testid="batch-resize-conflict"
        >
          Nie można ustawić tej partii bez naruszenia blokad receptury. Zmień blokady lub wybierz
          inną ilość.
        </p>
      ) : null}
    </div>
  );
}

export function WorkbenchSettingsLine({
  className,
  compact = false,
  currentTotalGrams = null,
}: {
  className?: string;
  compact?: boolean;
  /** PRO MOBILE UX v2 · B5 — the recipe's current base total (Engine result), shown beside the target. */
  currentTotalGrams?: number | null;
}) {
  const store = useRecipeStore();
  const resizeBatchGrams = useConstraintStudioStore((state) => state.resizeBatchGrams);
  const directionTargets = store.direction_targets;
  const directionIntents = useRecipeProfileStore((state) => state.directionIntents);
  const openedContextSeq = useRecipeProfileStore((state) => state.openedContextSeq);
  const activeDraftIdentity = useRecipeProfileStore((state) => state.activeDraftIdentity);
  const confirmedSignature = useRecipeProfileStore((state) => state.confirmedSignature);
  const confirmedDraftIdentity = useRecipeProfileStore((state) => state.confirmedDraftIdentity);
  const confirmedContextSeq = useRecipeProfileStore((state) => state.confirmedContextSeq);
  const openDraft = useRecipeProfileStore((state) => state.openDraft);
  const rebindDraftIdentity = useRecipeProfileStore((state) => state.rebindDraftIdentity);
  const confirmSettings = useRecipeProfileStore((state) => state.confirmSettings);
  /* OWNER AUTHORITY 2026-09-03: disclosure intent, initial onboarding and a
     save refusal are three different facts.

     - `manualExpanded` is the owner's disclosure choice.
     - `initialSettingsAttentionRequired` is the one authority allowed to open
       the module automatically. A successful confirmation consumes it for the
       exact draft identity.
     - the typed `preflightBlocker` remains a visible warning/Save fact, but has
       no say in disclosure state. Ingredient edits, Direction, dirty state and
       recalculation can therefore never make Settings jump open again. */
  const [manualExpanded, setManualExpanded] = useState(false);
  const preflightBlocker = useRecipeProfileStore((state) => state.preflightBlocker);
  const preflightBlocked = preflightBlocker?.action === 'settings';
  const initialSettingsAttentionRequired =
    activeDraftIdentity === null || confirmedDraftIdentity !== activeDraftIdentity;
  const open = manualExpanded || initialSettingsAttentionRequired;
  /* PRO MOBILE UX v2 · B4 — the FIRST settings a new recipe asks for come as a
     short sequence on a phone: one step at a time, with back, forward and
     „Krok n z 3". Only that first run gets it — a manually reopened or already
     confirmed Settings shows the whole grid — and CSS ignores it on desktop. */
  const pagerActive = compact && initialSettingsAttentionRequired && !manualExpanded;
  const [pagerPosition, setPagerPosition] = useState<{ identity: string | null; step: number }>({
    identity: null,
    step: 1,
  });
  const pagerStep = pagerPosition.identity === activeDraftIdentity ? pagerPosition.step : 1;
  const pagerTitleRef = useRef<HTMLParagraphElement | null>(null);
  const pagerMovedRef = useRef(false);
  const goToPagerStep = (step: number) => {
    pagerMovedRef.current = true;
    setPagerPosition({
      identity: activeDraftIdentity,
      step: Math.min(PAGER_STEPS, Math.max(1, step)),
    });
  };
  useEffect(() => {
    if (!pagerMovedRef.current) return;
    pagerMovedRef.current = false;
    pagerTitleRef.current?.focus({ preventScroll: true });
  }, [pagerStep]);

  const toggleDisclosure = () => {
    setManualExpanded((wasOpen) => !wasOpen);
  };
  const saveDefaultsLocal = useRecipeProfileStore((state) => state.saveDefaults);
  const authenticatedOwner = useAuthStore((state) => state.user?.id ?? null);
  const defaultsOwner = authenticatedOwner ?? (import.meta.env.DEV ? 'local-device' : null);
  const [defaultsStatus, setDefaultsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [pendingBaseProfile, setPendingBaseProfile] = useState<VisibleProductType | null>(null);
  const [customMachineOpen, setCustomMachineOpen] = useState(false);
  /* The user's answer to the above-recommendation warning, pinned to the exact
     amount it was given for (owner 2026-07-17: the choice is sticky per
     amount). Never persisted — it is a dismissal, not recipe data. */
  const [aboveChoice, setAboveChoice] = useState<{
    readonly grams: number;
    readonly recommendedGrams: number;
    readonly choice: AboveRecommendationChoice;
  } | null>(null);
  const activeHomeMachines = useMemo(() => listActiveHomeMachines(MACHINE_CATALOG), []);
  const selectedHome =
    store.machineKind === 'home'
      ? (activeHomeMachines.find((profile) => profile.id === store.machineId) ?? null)
      : null;

  const exactSavedRecipeIdentity = savedRecipeProfileDraftIdentity(store);
  useEffect(() => {
    if (openedContextSeq !== store.draftContextSeq || activeDraftIdentity === null) {
      openDraft(
        store.draftContextSeq,
        directionTargets,
        directionIntents,
        exactSavedRecipeIdentity,
      );
    } else if (
      exactSavedRecipeIdentity !== null &&
      activeDraftIdentity !== exactSavedRecipeIdentity
    ) {
      // Saving an already-confirmed unsaved draft gives it an immutable
      // recipe/version identity without changing its settings authority.
      rebindDraftIdentity(exactSavedRecipeIdentity);
    }
  }, [
    activeDraftIdentity,
    directionIntents,
    directionTargets,
    exactSavedRecipeIdentity,
    openDraft,
    openedContextSeq,
    rebindDraftIdentity,
    store.draftContextSeq,
  ]);

  const snapshot = profileSnapshotFromState(store, directionTargets, directionIntents);
  const signature = profileSettingsSignature(snapshot);
  /* OWNER AUTHORITY 2026-09-02 (§8): a NEW recipe that merely inherited the
     account defaults starts CONFIRMED. `openDraft` mints a fresh draft identity
     for every draft, so the confirmation never matched and the user was asked
     to re-confirm settings they had not touched — a step with no decision in
     it. Seeding runs only when the live signature is byte-identical to the
     stored defaults for this product; the moment anything differs, the normal
     dirty path takes over and „Potwierdź zmiany" comes back. */
  useEffect(() => {
    if (activeDraftIdentity === null) return;
    if (confirmedDraftIdentity === activeDraftIdentity) return;
    if (defaultsOwner === null) return;
    const stored = useRecipeProfileStore
      .getState()
      .defaultsFor(`${defaultsOwner}:${store.visibleProductType}`);
    if (!stored) return;
    if (profileSettingsSignature(stored) !== signature) return;
    confirmSettings(signature, activeDraftIdentity, store.draftContextSeq);
  }, [
    activeDraftIdentity,
    confirmSettings,
    confirmedDraftIdentity,
    defaultsOwner,
    signature,
    store.draftContextSeq,
    store.visibleProductType,
  ]);

  const setSettingsConfirmed = useRecipeProfileStore((state) => state.setSettingsConfirmed);
  const confirmed =
    activeDraftIdentity !== null &&
    confirmedDraftIdentity === activeDraftIdentity &&
    confirmedSignature === signature &&
    (activeDraftIdentity.startsWith('["saved-recipe",') ||
      confirmedContextSeq === store.draftContextSeq);
  /* Settings publishes its OWN fact — whether the live values are confirmed — and
     the workbar decides what that means for saving. This is not a second save
     gate: the module reports what it knows about itself and concludes nothing
     about Save. */
  useEffect(() => {
    setSettingsConfirmed(activeDraftIdentity === null ? null : confirmed);
  }, [activeDraftIdentity, confirmed, setSettingsConfirmed]);
  useEffect(() => () => setSettingsConfirmed(null), [setSettingsConfirmed]);

  /* No blocker-driven open/close effect. Initial attention is derived from the
     confirmed draft identity, and successful confirmation explicitly returns
     the disclosure to its collapsed resting state. */

  const hardConflict =
    !Number.isFinite(store.target_batch_grams) ||
    store.target_batch_grams <= 0 ||
    (store.machineKind === 'home' &&
      selectedHome === null &&
      !store.machineId?.startsWith('custom-')) ||
    store.batchResizeConflict !== null;

  /* PRO MOBILE UX v2 · B8 — a saved recipe reopened UNCHANGED carries the
     settings it was saved with: saving needs a current calculation, and a
     calculation needs confirmed settings, so asking again is a step with no
     decision in it. Only the clean working copy of that exact saved version
     qualifies; any edit, or a real conflict, keeps the normal confirmation. */
  const savedConfirmationHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeDraftIdentity === null || activeDraftIdentity !== exactSavedRecipeIdentity) return;
    if (confirmedDraftIdentity === activeDraftIdentity) return;
    if (savedConfirmationHandledRef.current === activeDraftIdentity) return;
    if (store.dirty || hardConflict) return;
    savedConfirmationHandledRef.current = activeDraftIdentity;
    confirmSettings(signature, activeDraftIdentity, store.draftContextSeq);
  }, [
    activeDraftIdentity,
    confirmSettings,
    confirmedDraftIdentity,
    exactSavedRecipeIdentity,
    hardConflict,
    signature,
    store.dirty,
    store.draftContextSeq,
  ]);

  const activeServing = snapshot.servingModeId;
  const customSelected = store.machineKind === 'home' && store.machineId?.startsWith('custom-');
  const machineValue = customSelected ? 'custom' : (selectedHome?.id ?? 'professional');
  const recommendedBatchGrams =
    selectedHome === null
      ? null
      : deriveMachineSetup(selectedHome, store.visibleProductType).recommendedBatchGrams;
  const cyclePlan = recommendedBatchGrams
    ? planContainerSplit(store.target_batch_grams, recommendedBatchGrams)
    : null;

  /* OWNER FINAL DECISION (2026-07-17) — the machine recommendation is a SOFT
     proposal. A recipe batch above it is legitimate and is NEVER capped, but it
     must be shown truthfully wherever the batch is edited, not only in machine
     settings. Same rule (`deriveBatchGuidance`), same copy — this surface only
     renders it in the workbench palette. Nothing here blocks anything. */
  const guidanceGrams = Number.isFinite(store.target_batch_grams) ? store.target_batch_grams : null;
  /* The choice is sticky per AMOUNT (and per recommendation): a new batch or a
     new machine is a new decision, so the warning legitimately returns. */
  const batchChoice: AboveRecommendationChoice =
    aboveChoice !== null &&
    aboveChoice.grams === guidanceGrams &&
    aboveChoice.recommendedGrams === recommendedBatchGrams
      ? aboveChoice.choice
      : 'undecided';
  /* `recommendedBatchGrams === null` (Professional, or a Home machine with no confirmed
     recommendation) already yields `kind: 'none'` — no second capacity rule. */
  const batchGuidance = deriveBatchGuidance({
    recommendedGrams: recommendedBatchGrams,
    currentGrams: guidanceGrams,
    choice: batchChoice,
  });
  const batchSplit =
    batchGuidance.kind === 'custom_above' && batchGuidance.split !== null
      ? containerSplitNotice(batchGuidance.split.totalGrams, recommendedBatchGrams)
      : null;

  const pickServing = (id: string, resetToProfessionalDefault = false) => {
    const temp = temperatureForMode(id);
    if (temp == null) return;
    const servingModeId = isNewRecipeServingModeId(id)
      ? id
      : starterServingModeForTemperature(temp);
    store.setMachineSelection({
      kind: 'professional',
      servingModeId,
      machineId: null,
      label: professionalLabel,
      temperatureC: temp,
      batchGrams: resetToProfessionalDefault ? PROFESSIONAL_DEFAULT_BATCH_GRAMS : null,
      hardCapacityGrams: null,
      ...(resetToProfessionalDefault ? { batchSource: 'PROFESSIONAL_DEFAULT' as const } : {}),
    });
  };

  const selectProfessional = () =>
    pickServing(
      isNewRecipeServingModeId(activeServing)
        ? activeServing
        : starterServingModeForTemperature(store.target_temperature_c),
      true,
    );

  const selectHome = (profile: HomeMachineProfile) => {
    const setup = deriveMachineSetup(profile, store.visibleProductType);
    if (setup.resolvedVisibleMode === null) return;
    store.setMachineSelection({
      kind: 'home',
      servingModeId: setup.resolvedVisibleMode,
      machineId: profile.id,
      label: machineDisplayName(profile),
      machineTechnology: profile.technology,
      homeFormulationModuleId: profile.homeFormulationModuleId,
      temperatureC: setup.engineTemperatureC,
      batchGrams: setup.recommendedBatchGrams,
      hardCapacityGrams: setup.hardMaximumBatchGrams,
      batchSource: 'MACHINE_DEFAULT',
    });
  };

  const selectCustom = (completion: MachineOnboardingCompletion) => {
    const batchGrams = effectiveDefaultBatchGrams(completion.record);
    const servingModeId = completion.derivation.resolvedVisibleMode;
    if (batchGrams === null || servingModeId === null) return;
    store.setMachineSelection({
      kind: 'home',
      servingModeId,
      machineId: completion.profile.id,
      label: machineDisplayName(completion.profile),
      machineTechnology: completion.profile.technology,
      homeFormulationModuleId: completion.profile.homeFormulationModuleId,
      temperatureC: completion.derivation.engineTemperatureC,
      batchGrams,
      hardCapacityGrams: completion.derivation.hardMaximumBatchGrams,
      batchSource: 'CUSTOM_MACHINE_BATCH',
    });
    setCustomMachineOpen(false);
  };

  const changeProductType = (next: VisibleProductType) => {
    const result = requestNewRecipeProductTypeChange(next);
    if (result === 'no_change') return;
    if (result === 'confirmation_required') {
      setPendingBaseProfile(next);
    }
  };

  const changeStrategy = (strategy: FormulationStrategy) => {
    store.setFormulationStrategy(strategy);
  };

  const changeBatch = (grams: number) => {
    const target = Math.round(grams);
    if (!(target > 0)) {
      return;
    }
    resizeBatchGrams(target);
  };

  const chooseAbove = (choice: AboveRecommendationChoice) => {
    if (guidanceGrams === null || recommendedBatchGrams === null) return;
    setAboveChoice({ grams: guidanceGrams, recommendedGrams: recommendedBatchGrams, choice });
  };
  /* Restore goes through the ordinary batch path, so recipe locks answer it the
     same way they answer a typed batch (a refusal surfaces as the existing
     `batchResizeConflict` line — still no block from this guidance). */
  const restoreRecommendedBatch = () => {
    if (recommendedBatchGrams === null) return;
    setAboveChoice(null);
    changeBatch(recommendedBatchGrams);
  };

  /* Collapsed summary — product type · calculation mode · machine, with the
     serving temperature appended only where the machine authority actually has
     one, so a Ninja line is not padded with a temperature it never uses. */
  const collapsedSummary = [
    g.productTypes[store.visibleProductType],
    STRATEGY_COPY[store.formulation_strategy].label,
    machineValue === 'professional'
      ? professionalLabel
      : (() => {
          const profile = activeHomeMachines.find((candidate) => candidate.id === machineValue);
          return profile ? machineDisplayName(profile) : store.machineLabel;
        })(),
    showsProfessionalServing(store.machineKind)
      ? (SERVING_OPTIONS.find((option) => option.id === activeServing)?.label ?? null)
      : null,
    // B5 — the target batch never disappears from a collapsed Settings row.
    Number.isFinite(store.target_batch_grams) && store.target_batch_grams > 0
      ? `${store.target_batch_grams.toLocaleString('pl-PL')} g`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /**
   * The FIRST-EVER confirmation also establishes the defaults.
   *
   * A brand-new user has no defaults, so every draft they start arrives
   * unconfirmed and every session asks the same question again. Their first
   * confirmation is the moment they say „these are my settings" — so that is
   * when the defaults are born, without a second button they should not have to
   * know about.
   *
   * ONLY when nothing is stored yet. After that, defaults change through
   * „Zapisz jako domyślne" and nowhere else: confirming a change for the recipe
   * in front of you must never silently rewrite what every future recipe starts
   * from.
   */
  const confirmAndSeedDefaults = () => {
    if (activeDraftIdentity === null) return;
    setManualExpanded(false);
    confirmSettings(signature, activeDraftIdentity, store.draftContextSeq);
    if (!defaultsOwner) return;
    const alreadyEstablished = useRecipeProfileStore
      .getState()
      .defaultsFor(`${defaultsOwner}:${store.visibleProductType}`);
    if (alreadyEstablished) return;
    // A failed remote write must not cost the customer their confirmation: the
    // local defaults still stand and „Zapisz jako domyślne" remains available.
    void commitRecipeDefaultsAfterRemoteSave(
      () =>
        authenticatedOwner
          ? upsertUserRecipeDefault(authenticatedOwner, store.visibleProductType, snapshot)
          : Promise.resolve(),
      () => saveDefaultsLocal(`${defaultsOwner}:${store.visibleProductType}`, snapshot),
    ).catch(() => undefined);
  };

  const saveAsDefault = () => {
    if (!defaultsOwner) return;
    setDefaultsStatus('saving');
    void commitRecipeDefaultsAfterRemoteSave(
      () =>
        authenticatedOwner
          ? upsertUserRecipeDefault(authenticatedOwner, store.visibleProductType, snapshot)
          : Promise.resolve(),
      () => saveDefaultsLocal(`${defaultsOwner}:${store.visibleProductType}`, snapshot),
    )
      .then(() => setDefaultsStatus('saved'))
      .catch(() => setDefaultsStatus('error'));
  };

  return (
    <section
      /* OWNER AUTHORITY 2026-09-03 (approved desktop reference): Settings is a
         BOX whose label is notched into its own top border — the same make as
         DOSTOSUJ RECEPTURĘ above it and WIEDZA below it. It was a band (eyebrow
         + hairline) wrapped around a second bordered button, which drew two
         nested rectangles to express one group.

         A real CONFLICT still recolours that box, because an error is exactly
         the exception a surface should be spent on. Unconfirmed stays carried
         by the control's own status text. */
      className={cn(
        'pro-legend-box px-5 py-7 transition-colors',
        hardConflict
          ? 'border-status-error/45 bg-status-error/[0.035]'
          : preflightBlocked
            ? 'settings-preflight-blocked'
            : 'bg-transparent',
        className,
      )}
      data-testid="workbench-settings-line"
      tabIndex={-1}
      data-preflight-state={
        hardConflict ? 'conflict' : confirmed ? 'confirmed' : 'needs-confirmation'
      }
      data-preflight-blocked={preflightBlocked ? 'true' : undefined}
    >
      <h3
        data-band-legend
        className="text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase"
      >
        Ustawienia
      </h3>

      {/* The band's own row: what the settings ARE, and the way in. The summary
          is the only thing allowed to shorten — the status and the chevron
          carry the decision and must survive every translation. */}
      <button
        type="button"
        onClick={toggleDisclosure}
        aria-expanded={open}
        data-testid="settings-grid-status"
        data-settings-cell="confirmation"
        className="pro-focus-ring group/settings flex w-full min-w-0 items-center gap-4 bg-transparent text-left"
      >
        <span className="grid size-[38px] shrink-0 place-items-center rounded-full border border-[var(--g-line)] text-[var(--g-ink)]">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
            <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M10.34 2.79A9.6 9.6 0 0 1 13.66 2.79L13.88 4.86A7.35 7.35 0 0 1 15.73 5.63L17.4 4.27A9.6 9.6 0 0 1 19.73 6.6L18.37 8.27A7.35 7.35 0 0 1 19.14 10.12L21.21 10.34A9.6 9.6 0 0 1 21.21 13.66L19.14 13.88A7.35 7.35 0 0 1 18.37 15.73L19.73 17.4A9.6 9.6 0 0 1 17.4 19.73L15.73 18.37A7.35 7.35 0 0 1 13.88 19.14L13.66 21.21A9.6 9.6 0 0 1 10.34 21.21L10.12 19.14A7.35 7.35 0 0 1 8.27 18.37L6.6 19.73A9.6 9.6 0 0 1 4.27 17.4L5.63 15.73A7.35 7.35 0 0 1 4.86 13.88L2.79 13.66A9.6 9.6 0 0 1 2.79 10.34L4.86 10.12A7.35 7.35 0 0 1 5.63 8.27L4.27 6.6A9.6 9.6 0 0 1 6.6 4.27L8.27 5.63A7.35 7.35 0 0 1 10.12 4.86Z" />
              <circle cx="12" cy="12" r="2.85" />
            </g>
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] leading-[21px] font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
          {collapsedSummary}
        </span>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap',
            hardConflict
              ? 'text-status-error'
              : confirmed
                ? 'text-[var(--g-score-green)]'
                : 'text-[var(--g-attention-ink)]',
          )}
        >
          {hardConflict ? (
            'Konflikt ustawień'
          ) : confirmed ? (
            <>
              <svg
                aria-hidden
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0"
              >
                <path
                  d="M4 12.5l5.5 5.5L20 7"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Zatwierdzone
            </>
          ) : (
            <>
              <i aria-hidden className="size-2 shrink-0 rounded-full bg-[#f58a07]" />
              Wymaga potwierdzenia
            </>
          )}
        </span>
        <svg
          aria-hidden
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          className={cn(
            'shrink-0 text-[var(--g-text-muted)] transition-transform',
            open && 'rotate-90',
          )}
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="profile-preflight-status"
      >
        {hardConflict
          ? 'Konflikt ustawień'
          : confirmed
            ? '✓ Ustawienia potwierdzone'
            : 'Zmiany niepotwierdzone'}
      </span>

      {/* The expanded surface stays MOUNTED and is hidden with `hidden` rather
          than unmounted. Two reasons, both real: the batch/serving cells own
          effects that reconcile the target against the machine authority, and
          unmounting them would silently change when that reconciliation runs;
          and `hidden` is the honest semantic — not relevant right now — so it
          leaves the accessibility tree and the tab order without pretending the
          settings do not exist. */}
      <div
        hidden={!open}
        data-settings-surface={open ? 'expanded' : 'collapsed'}
        data-settings-pager-scope={pagerActive ? 'on' : undefined}
        data-settings-active-step={pagerActive ? pagerStep : undefined}
      >
        {pagerActive ? (
          <div className="mb-3 min-[60rem]:hidden" data-testid="profile-settings-pager">
            <p className="text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase">
              {stepCopy.step} {pagerStep} {stepCopy.of} {PAGER_STEPS}
            </p>
            <p
              ref={pagerTitleRef}
              tabIndex={-1}
              className="mt-1 text-[16px] leading-[21px] font-semibold tracking-[-0.02em] text-[var(--g-ink)] outline-none"
              data-testid="profile-settings-pager-title"
            >
              {stepCopy.titles[pagerStep - 1]}
            </p>
            <span aria-hidden className="mt-2 flex gap-1.5">
              {Array.from({ length: PAGER_STEPS }, (_, index) => (
                <i
                  key={index}
                  className={cn(
                    'h-1 flex-1 rounded-full',
                    index < pagerStep ? 'bg-[var(--g-graphite)]' : 'bg-[var(--g-line)]',
                  )}
                />
              ))}
            </span>
          </div>
        ) : null}
        <div
          className={cn(
            compact ? 'profile-settings-grid grid grid-cols-2 items-stretch gap-2' : 'space-y-3',
          )}
        >
          <div
            className={cn(compact && 'order-1')}
            data-settings-cell="product-type"
            data-settings-step="1"
          >
            <LabeledSelect
              label={g.productTypeLabel}
              value={store.visibleProductType}
              options={PRO_VISIBLE_PRODUCT_TYPES}
              labelOf={(option) => g.productTypes[option]}
              onChange={changeProductType}
              testid="workbench-product-type"
              stacked={compact}
            />
          </div>

          <div
            className={cn(compact && 'order-4')}
            data-settings-cell="machine"
            data-settings-step="2"
          >
            <LabeledSelect
              label="Maszyna"
              value={machineValue}
              options={[
                'professional',
                ...activeHomeMachines.map((profile) => profile.id),
                'custom',
              ]}
              labelOf={(id) =>
                id === 'professional'
                  ? professionalLabel
                  : id === 'custom'
                    ? 'Własna maszyna'
                    : machineDisplayName(activeHomeMachines.find((profile) => profile.id === id)!)
              }
              onChange={(id) => {
                if (id === 'professional') selectProfessional();
                else if (id === 'custom') setCustomMachineOpen(true);
                else {
                  const profile = activeHomeMachines.find((candidate) => candidate.id === id);
                  if (profile) selectHome(profile);
                }
              }}
              testid="workbench-machine"
              stacked={compact}
            />
          </div>

          {showsProfessionalServing(store.machineKind) ? (
            <div
              className={cn(compact ? 'order-3' : 'ml-[7.3rem]')}
              data-testid="machine-conditional-settings"
              data-settings-cell="serving"
              data-settings-step="2"
            >
              <LabeledSelect
                label="Tryb serwowania"
                value={activeServing}
                options={SERVING_OPTIONS.map((option) => option.id)}
                labelOf={(id) => SERVING_OPTIONS.find((option) => option.id === id)?.label ?? id}
                onChange={(id) => pickServing(id)}
                testid="workbench-serving"
                stacked={compact}
              />
            </div>
          ) : null}

          <TargetBatchControl
            grams={store.target_batch_grams}
            currentTotalGrams={currentTotalGrams}
            compact={compact}
            homeMachine={!showsProfessionalServing(store.machineKind)}
            recommendedBatchGrams={recommendedBatchGrams}
            cyclePlan={cyclePlan}
            resizeConflict={store.batchResizeConflict !== null}
            onChange={changeBatch}
          />

          {compact ? (
            <>
              <div
                className="profile-settings-final-card relative order-2 min-w-0"
                data-settings-cell="strategy"
                data-settings-final-card="strategy"
                data-settings-step="3"
                title={STRATEGY_COPY[store.formulation_strategy].description}
              >
                <label
                  className={cn(compactFinalSettingsLabel, 'sr-only')}
                  htmlFor="workbench-strategy"
                  data-settings-label="strategy"
                >
                  Tryb
                </label>
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-[11px] left-[11px] z-10 text-[9px] leading-[10px] text-[var(--g-text-field-label)]"
                >
                  Tryb
                </span>
                <select
                  id="workbench-strategy"
                  className={cn(compactSelect, 'h-11 w-full pt-[16px] pr-[30px] lg:h-[46px]')}
                  value={store.formulation_strategy}
                  aria-label="Tryb"
                  data-testid="workbench-strategy"
                  data-settings-control="strategy"
                  onChange={(event) =>
                    changeStrategy(event.currentTarget.value as FormulationStrategy)
                  }
                >
                  {FORMULATION_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {STRATEGY_COPY[strategy].label}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-[11px] z-10 -translate-y-1/2 text-[14px] leading-none text-[var(--g-ink)]"
                >
                  ⌄
                </span>
                <p className={compactSettingsHelper} data-settings-helper="strategy">
                  {STRATEGY_COPY[store.formulation_strategy].description}
                </p>
              </div>
            </>
          ) : (
            <>
              <div
                className="rounded-[12px] border border-ink/8 bg-[var(--g-ivory)]/70 p-1.5"
                data-settings-cell="strategy"
              >
                <LabeledSelect
                  label="Tryb"
                  value={store.formulation_strategy}
                  options={FORMULATION_STRATEGIES}
                  labelOf={(strategy) => STRATEGY_COPY[strategy].label}
                  onChange={changeStrategy}
                  testid="workbench-strategy"
                />
                <p className="col-span-full text-xs text-stone-600">
                  {STRATEGY_COPY[store.formulation_strategy].description}
                </p>
              </div>
            </>
          )}

          {/* The duplicate read-only `Baza receptury` stays removed. The target
              control above owns intent; the left recipe column owns actual mass. */}
        </div>

        {/* Above the machine recommendation: warn + offer the three owner actions,
          never block (§7, owner 2026-07-17). Identical rule and copy to the
          machine settings card — only the palette is the workbench's.
          role="status" announces the warning to a screen reader (WCAG 4.1.3). */}
        {batchGuidance.kind === 'custom_above' && batchGuidance.choice === 'undecided' ? (
          <div
            className="mt-2.5 rounded-[10px] border border-status-risky/40 bg-status-risky/10 px-3 py-2.5"
            data-testid="workbench-batch-above-recommendation"
            data-settings-step="3"
          >
            <p role="status" className="text-xs leading-relaxed font-semibold text-ink">
              {machineOnboardingCopy.batch.aboveWarning}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={aboveActionClass}
                data-testid="workbench-batch-split"
                onClick={() => chooseAbove('split')}
              >
                {machineOnboardingCopy.batch.splitAction}
              </button>
              <button
                type="button"
                className={aboveActionClass}
                data-testid="workbench-batch-keep-mine"
                onClick={() => chooseAbove('keep_mine')}
              >
                {machineOnboardingCopy.batch.keepMine}
              </button>
              <button
                type="button"
                className={aboveActionClass}
                data-testid="workbench-batch-restore-recommended"
                onClick={restoreRecommendedBatch}
              >
                {machineOnboardingCopy.batch.restoreShort}
              </button>
            </div>
          </div>
        ) : null}
        {batchSplit !== null ? (
          <div
            role="status"
            className="mt-2.5 rounded-[10px] border border-ink/10 bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-700"
            data-testid="workbench-batch-split-plan"
            data-settings-step="3"
          >
            <p className="font-semibold text-ink">{batchSplit.message}</p>
            <p className="mt-0.5">{batchSplit.detail}</p>
          </div>
        ) : null}
        {batchGuidance.kind === 'custom' ||
        (batchGuidance.kind === 'custom_above' && batchGuidance.choice === 'keep_mine') ? (
          <p
            className="mt-2 text-xs text-stone-600"
            data-testid="workbench-batch-custom-in-use"
            data-settings-step="3"
          >
            {machineOnboardingCopy.batch.customInUse}
          </p>
        ) : null}
        <NewRecipeConfirmationDialog
          open={pendingBaseProfile !== null}
          onCancel={() => setPendingBaseProfile(null)}
          onConfirm={() => {
            if (pendingBaseProfile === null) return;
            changeProRecipeProductType(pendingBaseProfile);
            setPendingBaseProfile(null);
          }}
          title={`Zmienić typ receptury na ${pendingBaseProfile === null ? '' : g.productTypes[pendingBaseProfile]}?`}
          description={
            pendingBaseProfile === null
              ? null
              : store.savedRecipeId !== null
                ? `${g.productTypes[pendingBaseProfile]} korzysta z innej bazy. Bieżąca zapisana receptura pozostanie bez zmian.${store.dirty ? ' Niezapisane zmiany bieżącej wersji nie zostaną przeniesione.' : ''}`
                : `${g.productTypes[pendingBaseProfile]} korzysta z innej bazy. Niezapisane składniki bieżącego draftu zostaną zastąpione natywną bazą po potwierdzeniu.`
          }
          confirmLabel={
            pendingBaseProfile === null
              ? 'Utwórz nową wersję'
              : `Utwórz wersję ${g.productTypes[pendingBaseProfile]}`
          }
        />
        {/* Both actions live INSIDE expanded Settings (§8). „Zapisz jako
          domyślne" is permanent and holds the left edge, so it never moves;
          „Potwierdź zmiany" arrives to its right only when something is
          actually unconfirmed. `flex-wrap` is what keeps a long translation
          („Mentés alapértelmezettként" beside „Változtatások megerősítése")
          dropping to a second line instead of widening the card. */}
        {pagerActive ? (
          <div
            className="mt-4 flex items-center justify-between gap-3 min-[60rem]:hidden"
            data-testid="profile-settings-pager-nav"
          >
            <button
              type="button"
              onClick={() => goToPagerStep(pagerStep - 1)}
              disabled={pagerStep === 1}
              data-testid="profile-settings-pager-back"
              className="pro-focus-ring inline-flex h-11 items-center gap-2 rounded-full border border-[var(--g-line)] bg-white px-4 text-[13px] font-semibold text-[var(--g-ink)] disabled:invisible"
            >
              <span aria-hidden>←</span>
              {stepCopy.back}
            </button>
            {pagerStep < PAGER_STEPS ? (
              <button
                type="button"
                onClick={() => goToPagerStep(pagerStep + 1)}
                data-testid="profile-settings-pager-next"
                className="pro-focus-ring inline-flex h-11 items-center gap-2 rounded-full bg-[var(--g-graphite)] px-5 text-[13px] font-semibold text-white"
              >
                {stepCopy.next}
                <span aria-hidden>→</span>
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          className="mt-5 flex flex-wrap items-center gap-3"
          data-settings-cell="actions"
          data-settings-step="3"
        >
          <button
            type="button"
            onClick={saveAsDefault}
            disabled={defaultsOwner === null || defaultsStatus === 'saving'}
            data-testid="profile-settings-save-default"
            className="pro-focus-ring inline-flex h-11 items-center justify-center rounded-full border border-[var(--g-line)] bg-white px-5 text-[13px] font-semibold whitespace-nowrap text-[var(--g-ink)] transition-colors hover:border-ink/35 disabled:cursor-not-allowed disabled:text-[var(--g-lock)]"
          >
            {defaultsStatus === 'saving' ? 'Zapisuję…' : 'Zapisz jako domyślne'}
          </button>
          {!confirmed || hardConflict ? (
            <button
              type="button"
              disabled={hardConflict}
              onClick={confirmAndSeedDefaults}
              data-testid="profile-settings-confirm"
              className="pro-focus-ring inline-flex h-11 items-center justify-center rounded-full bg-[var(--g-graphite)] px-5 text-[13px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]"
            >
              Potwierdź zmiany
            </button>
          ) : (
            <span
              className="text-[12.5px] font-semibold text-[var(--g-text-secondary)]"
              data-testid="profile-settings-confirmed"
            >
              ✓ Ustawienia potwierdzone
            </span>
          )}
          <span role="status" aria-live="polite" className="sr-only">
            {defaultsStatus === 'saved'
              ? 'Ustawienia zapisane jako domyślne.'
              : defaultsStatus === 'error'
                ? 'Nie udało się zapisać ustawień domyślnych.'
                : ''}
          </span>
        </div>
        {defaultsStatus === 'error' ? (
          <p role="alert" className="mt-2 text-xs text-status-error">
            Nie udało się zapisać ustawień domyślnych. Spróbuj ponownie.
          </p>
        ) : null}
      </div>

      <RecipeCustomMachineDialog
        open={customMachineOpen}
        onClose={() => setCustomMachineOpen(false)}
        onComplete={selectCustom}
      />
    </section>
  );
}
