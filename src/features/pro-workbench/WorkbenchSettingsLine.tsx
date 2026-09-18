import { useEffect, useRef, useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import type { VisibleProductType } from '@/features/studio/productType';
import { planContainerSplit } from '@/features/machine-catalog';
import {
  RecipeCustomMachineDialog,
  containerSplitNotice,
  deriveBatchGuidance,
  machineDisplayName,
  machineOnboardingCopy,
  pluralCykle,
  type AboveRecommendationChoice,
} from '@/features/machine-onboarding';
import {
  savedRecipeProfileDraftIdentity,
  showsProfessionalServing,
  useRecipeProfileStore,
} from './recipeProfileStore';
import {
  FORMULATION_STRATEGIES,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';
import { DeferredNumberInput } from '@/components/forms/DeferredNumberInput';
import { NEW_RECIPE_SERVING_MODES } from '@/features/recipes/newRecipeStarter';
import { PRO_VISIBLE_PRODUCT_TYPES } from './profileCompatibility';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import {
  requestNewRecipeProductTypeChange,
  changeProRecipeProductType,
} from '@/pages/destinations/startNewProRecipe';
import {
  signatureCoveredByAccountDefaults,
  useProSettingsAuthority,
  type ProSettingsAuthority,
} from './proSettingsAuthority';

const g = copy.studio.goal;
const batchCopy = copy.proWorkbench.batchTarget;
const panelCopy = copy.proWorkbench.settingsPanel;
const servingCopy = copy.proMachine.serving;
const professionalLabel = copy.proMachine.professionalLabel;

const STRATEGY_COPY: Record<
  FormulationStrategy,
  { label: string; description: string; tile: string }
> = {
  optimal: { label: 'OPTIMAL', description: 'Priorytet smaku.', tile: 'Priorytet smaku' },
  eco: { label: 'ECO', description: 'Priorytet kosztu.', tile: 'Priorytet kosztu' },
};
const SERVING_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'fresh', label: servingCopy.fresh },
  { id: 'temp_minus_11', label: servingCopy.minus11 },
  { id: 'temp_minus_12', label: servingCopy.minus12 },
  { id: 'temp_minus_13', label: servingCopy.minus13 },
];
/* DESIGN V3.0 correction I / Point 3 — serving is ONE segmented control:
   Miękkie · −11 °C, Klasyczne · −12 °C, Twardsze · −13 °C. „Świeże" is a
   serving the product offers today and V3 does not show; it is kept as a
   fourth segment rather than removed silently (owner decision). */
const SERVING_SEGMENT_ORDER = [
  ...NEW_RECIPE_SERVING_MODES.filter((id) => id !== 'fresh'),
  'fresh',
] as const;

/* GELLATTI V2.1 — the approved Settings field: a 46 px white cell with one
   hairline, a 9 px quiet label and an 11 px bold value, its disclosure mark on
   the right edge. Mobile keeps a 44 px touch target. */
const compactSelect =
  'h-11 min-w-0 appearance-none rounded-[9px] border border-[var(--g-line)] bg-white px-[11px] text-[13px] text-[var(--g-ink)] shadow-none transition-colors hover:border-ink/35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--g-orange-line)] lg:h-[46px] lg:text-[11px] lg:font-bold';
const compactFinalSettingsLabel =
  'block text-[9px] leading-[10px] font-normal text-[var(--g-text-field-label)]';
/* DESIGN V3.0 correction I — the panel's quiet field label above a control. */
const panelFieldLabel =
  'block text-[11px] leading-[14px] font-medium text-[var(--g-text-field-label)]';
/* The three non-blocking actions under the above-recommendation warning. Quiet
   white cells in the Settings palette — an advisory, never a primary control. */
const aboveActionClass =
  'pro-focus-ring min-h-9 rounded-[8px] border border-[var(--g-line)] bg-white px-3 text-xs font-semibold whitespace-nowrap text-ink shadow-none transition-colors hover:border-ink/35';
const TARGET_BATCH_STEP_GRAMS = 10;
/* OWNER 2026-09-12 — the batch control is a member of the DASHBOARD control
   family (`DirectNumberControl`): the same 1 px ink/12 housing, ink/18
   separators, full pill, mono semibold tabular numerals and the orange focus
   accent with its 3 px halo. `targetBatchControlFamily.test.ts` compares these
   literals with DirectNumberControl's own, so the two cannot drift apart. */
const BATCH_CONTROL_HOUSING =
  'mt-2 grid h-11 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-full border border-ink/12 bg-white transition-[border-color,box-shadow] focus-within:border-[var(--g-orange-line)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--g-orange)_15%,transparent)] min-[68.5rem]:h-8';
/* The side segments are QUIETER than the value, as the dashboard's light − / +
   glyphs are: the mass is the decision, the ±10 g steps are shortcuts. */
const BATCH_CONTROL_STEP =
  'gellatti-touch-control grid place-items-center px-3 font-mono text-[12px] font-medium whitespace-nowrap text-[var(--g-text-secondary)] tabular-nums transition-colors hover:bg-stone-100 hover:text-ink focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--g-orange-line)] disabled:cursor-not-allowed disabled:text-stone-400';
const BATCH_CONTROL_VALUE =
  'flex h-full min-w-0 items-center justify-center border-x border-ink/18 px-2';

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
  className,
  shortcutNote = null,
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
  className?: string;
  /** DESIGN V3.0 §3 Step 2 keeps its own helper line; the panel does not. */
  shortcutNote?: string | null;
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
          ? cn('profile-settings-final-card', className)
          : 'rounded-[12px] border border-ink/10 bg-white px-3 py-2',
      )}
      data-testid="profile-batch-combined"
      data-settings-cell="batch"
      data-settings-final-card="batch"
    >
      <span
        className={cn(
          compactFinalSettingsLabel,
          'max-[68.5rem]:text-[11px] max-[68.5rem]:leading-[14px] max-[68.5rem]:font-medium',
          !compact && 'text-xs font-medium text-stone-600',
        )}
        data-settings-label="batch"
      >
        {batchCopy.label}
      </span>
      <span
        className="mt-0.5 block text-[10px] leading-snug text-[var(--g-text-secondary)] max-[68.5rem]:text-[11px]"
        data-testid="workbench-batch-scope"
      >
        {batchCopy.caption}
      </span>
      {/* OWNER 2026-09-12 — ONE control family, desktop and mobile. The batch
          speaks the dashboard's own control language: a single segmented
          housing [ −10 g | value | +10 g ] with the ingredient steppers'
          hairline, separators, mono numerals and orange focus accent
          (`DirectNumberControl`; the `BATCH_CONTROL_*` literals). It supersedes
          B5's dashed whole-batch card and its two loose round chips. The side
          segments carry their unit, so the step reads without the label.
          Behaviour is unchanged: the same two ±10 g actions through the same
          handler, the same 1 g floor, and the centre is still the typed value,
          committed exactly as before. 44 px on touch widths, 32 px — the
          dashboard density — on the desktop. */}
      <div
        className={BATCH_CONTROL_HOUSING}
        data-settings-control="batch"
        data-batch-presentation="whole-batch"
        data-control-family="dashboard"
      >
        <button
          type="button"
          aria-label={`Zmniejsz partię docelową o ${TARGET_BATCH_STEP_GRAMS} g`}
          data-testid="workbench-batch-decrement"
          disabled={grams <= 1}
          onClick={() => onChange(Math.max(1, grams - TARGET_BATCH_STEP_GRAMS))}
          className={BATCH_CONTROL_STEP}
        >
          −{TARGET_BATCH_STEP_GRAMS} g
        </button>
        <label className={BATCH_CONTROL_VALUE}>
          <DeferredNumberInput
            className="w-[5ch] min-w-0 bg-transparent text-right font-mono text-sm leading-none font-semibold text-ink tabular-nums outline-none min-[68.5rem]:text-[13px]"
            value={Number.isFinite(grams) ? grams : 0}
            min={1}
            decimals={0}
            aria-label="Docelowa partia"
            data-testid="workbench-batch"
            onCommit={onChange}
          />
          <span
            aria-hidden
            className="ml-1 shrink-0 text-xs font-semibold text-stone-600 min-[68.5rem]:ml-0.5 min-[68.5rem]:text-[10px]"
          >
            g
          </span>
        </label>
        <button
          type="button"
          aria-label={`Zwiększ partię docelową o ${TARGET_BATCH_STEP_GRAMS} g`}
          data-testid="workbench-batch-increment"
          onClick={() => onChange(grams + TARGET_BATCH_STEP_GRAMS)}
          className={BATCH_CONTROL_STEP}
        >
          +{TARGET_BATCH_STEP_GRAMS} g
        </button>
      </div>
      {shortcutNote ? (
        <p
          className="mt-2 text-[11px] leading-[1.4] text-[var(--g-text-secondary)]"
          data-testid="workbench-batch-shortcut"
        >
          {shortcutNote}
        </p>
      ) : null}
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
      {/* The setup's own shortcut line already says what the professional
          helper says; a Home machine's cycle reading is always kept. */}
      {homeMachine || shortcutNote === null ? (
        <p
          className="mt-1.5 text-[10px] leading-relaxed text-[var(--g-text-secondary)]"
          data-testid={homeMachine ? 'home-machine-cycles' : undefined}
        >
          {helper}
        </p>
      ) : null}
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

/** The same batch control, bound to the settings authority, for the V3 setup's
 *  Step 2 (which keeps its own shortcut line under the pill). */
export function TargetBatchControlForSetup({
  settings,
  note,
}: {
  settings: ProSettingsAuthority;
  note: string;
}) {
  const { store } = settings;
  return (
    <TargetBatchControl
      grams={store.target_batch_grams}
      currentTotalGrams={null}
      compact
      homeMachine={!showsProfessionalServing(store.machineKind)}
      recommendedBatchGrams={settings.recommendedBatchGrams}
      cyclePlan={settings.cyclePlan}
      resizeConflict={store.batchResizeConflict !== null}
      onChange={settings.changeBatch}
      shortcutNote={note}
    />
  );
}

/** How many Settings copies are mounted — see the publishing effect in the component. */
let mountedSettingsCopies = 0;

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
  const settings = useProSettingsAuthority();
  const {
    store,
    signature,
    activeServing,
    machineValue,
    activeHomeMachines,
    recommendedBatchGrams,
    cyclePlan,
    hardConflict,
    defaultsOwner,
    pickServing,
    changeStrategy,
    changeBatch,
  } = settings;
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
  /* DESIGN V3.0 §3 — the first settings of a new recipe on a phone and iPad
     portrait are asked by the full-screen setup (`ProSetupFlow`), which
     presents THESE fields through `useProSettingsAuthority`. The B4 pager that
     used to page this box is superseded by it. */

  const toggleDisclosure = () => {
    setManualExpanded((wasOpen) => !wasOpen);
  };
  /* DESIGN V3.0 correction I — „[ ] Ustaw jako domyślne" replaces the
     „Zapisz jako domyślne" button. It is an INTENT for the existing
     confirmation: nothing is written when it is ticked, the defaults are saved
     by „Potwierdź zmiany" through the same mechanism as before. Ticking it on
     settings that are already confirmed brings that confirmation back, since
     it is the one action that saves. */
  const [asDefault, setAsDefault] = useState(false);
  const [savedDefaultsSignature, setSavedDefaultsSignature] = useState<string | null>(null);
  const [defaultsStatus, setDefaultsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [pendingBaseProfile, setPendingBaseProfile] = useState<VisibleProductType | null>(null);
  /* The user's answer to the above-recommendation warning, pinned to the exact
     amount it was given for (owner 2026-07-17: the choice is sticky per
     amount). Never persisted — it is a dismissal, not recipe data. */
  const [aboveChoice, setAboveChoice] = useState<{
    readonly grams: number;
    readonly recommendedGrams: number;
    readonly choice: AboveRecommendationChoice;
  } | null>(null);

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

  /* OWNER AUTHORITY 2026-09-02 (§8): a NEW recipe that merely inherited the
     account defaults starts CONFIRMED. `openDraft` mints a fresh draft identity
     for every draft, so the confirmation never matched and the user was asked
     to re-confirm settings they had not touched — a step with no decision in
     it. Seeding runs only when the live signature is byte-identical to the
     stored defaults for this product (`signatureCoveredByAccountDefaults`);
     the moment anything differs, the normal dirty path takes over and
     „Potwierdź zmiany" comes back. */
  useEffect(() => {
    if (activeDraftIdentity === null) return;
    if (confirmedDraftIdentity === activeDraftIdentity) return;
    if (defaultsOwner === null) return;
    if (signatureCoveredByAccountDefaults(defaultsOwner) !== signature) return;
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
  /* Below the workbench breakpoint Settings is mounted twice — the CSS-hidden desktop
     aside and the phone sheet. Closing the sheet must not clear the fact while the other
     copy is still here: its inputs are unchanged, so it would never publish again and the
     phone would forget that settings wait. Only the LAST copy to leave clears it. */
  useEffect(() => {
    mountedSettingsCopies += 1;
    return () => {
      mountedSettingsCopies -= 1;
      if (mountedSettingsCopies === 0) setSettingsConfirmed(null);
    };
  }, [setSettingsConfirmed]);

  /* No blocker-driven open/close effect. Initial attention is derived from the
     confirmed draft identity, and successful confirmation explicitly returns
     the disclosure to its collapsed resting state. */

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

  const changeProductType = (next: VisibleProductType) => {
    const result = requestNewRecipeProductTypeChange(next);
    if (result === 'no_change') return;
    if (result === 'confirmation_required') {
      setPendingBaseProfile(next);
    }
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

  /* The existing confirmation action. With the box ticked it also writes the
     defaults (see `useProSettingsAuthority().confirm`). */
  const confirmAndSeedDefaults = () => {
    if (activeDraftIdentity === null) return;
    setManualExpanded(false);
    const saving = settings.confirm(asDefault);
    if (saving === null) return;
    const savedSignature = signature;
    setDefaultsStatus('saving');
    saving
      .then(() => {
        setDefaultsStatus('saved');
        setSavedDefaultsSignature(savedSignature);
      })
      .catch(() => setDefaultsStatus('error'));
  };
  const defaultsPending = asDefault && savedDefaultsSignature !== signature;
  const showConfirm = !confirmed || hardConflict || defaultsPending;
  const professionalServing = showsProfessionalServing(store.machineKind);

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
        /* OWNER 2026-09-12 — the first row gets real air under the notched
           legend: 36 px from the border to the ring row on the desktop (was
           28), paid for at the bottom (20, was 28), so the collapsed box keeps
           its exact height. Touch widths keep `py-7`. */
        'pro-legend-box px-5 py-7 transition-colors min-[68.5rem]:pt-9 min-[68.5rem]:pb-5',
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

      {/* The band's own row: what the settings ARE, and the way in.
          DESIGN V3.0 correction I (b): on a phone the summary wraps to two
          lines and the status sits UNDER it at the right edge, so nothing is
          cut; on an iPad in portrait the status stays beside it. The desktop
          keeps its frozen single line, where the summary is the only thing
          allowed to shorten — the status and the chevron carry the decision
          and must survive every translation. */}
      <button
        type="button"
        onClick={toggleDisclosure}
        aria-expanded={open}
        data-testid="settings-grid-status"
        data-settings-cell="confirmation"
        className="pro-focus-ring group/settings grid w-full min-w-0 grid-cols-[38px_minmax(0,1fr)_15px] items-center gap-x-3 gap-y-1 bg-transparent text-left sm:flex sm:gap-4"
      >
        <span className="row-span-2 grid size-[38px] shrink-0 place-items-center rounded-full border border-[var(--g-line)] text-[var(--g-ink)]">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
            <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M10.34 2.79A9.6 9.6 0 0 1 13.66 2.79L13.88 4.86A7.35 7.35 0 0 1 15.73 5.63L17.4 4.27A9.6 9.6 0 0 1 19.73 6.6L18.37 8.27A7.35 7.35 0 0 1 19.14 10.12L21.21 10.34A9.6 9.6 0 0 1 21.21 13.66L19.14 13.88A7.35 7.35 0 0 1 18.37 15.73L19.73 17.4A9.6 9.6 0 0 1 17.4 19.73L15.73 18.37A7.35 7.35 0 0 1 13.88 19.14L13.66 21.21A9.6 9.6 0 0 1 10.34 21.21L10.12 19.14A7.35 7.35 0 0 1 8.27 18.37L6.6 19.73A9.6 9.6 0 0 1 4.27 17.4L5.63 15.73A7.35 7.35 0 0 1 4.86 13.88L2.79 13.66A9.6 9.6 0 0 1 2.79 10.34L4.86 10.12A7.35 7.35 0 0 1 5.63 8.27L4.27 6.6A9.6 9.6 0 0 1 6.6 4.27L8.27 5.63A7.35 7.35 0 0 1 10.12 4.86Z" />
              <circle cx="12" cy="12" r="2.85" />
            </g>
          </svg>
        </span>
        <span
          className="col-start-2 row-start-1 min-w-0 text-[15px] leading-[21px] font-semibold tracking-[-0.02em] text-[var(--g-ink)] sm:flex-1 min-[68.5rem]:truncate"
          data-testid="settings-summary"
        >
          {collapsedSummary}
        </span>
        <span
          className={cn(
            'col-start-2 row-start-2 flex shrink-0 items-center gap-1.5 justify-self-end text-[12.5px] font-semibold whitespace-nowrap',
            hardConflict
              ? 'text-status-error'
              : confirmed
                ? 'text-[var(--g-score-green)]'
                : 'text-[var(--g-attention-ink)]',
          )}
          data-testid="settings-status"
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
              <i aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--g-orange)]" />
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
            'col-start-3 row-span-2 row-start-1 shrink-0 text-[var(--g-text-muted)] transition-transform',
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
        /* OWNER 2026-09-12 — the fields used to start 0 px under the ring row,
           so the gear touched „Typ produktu". 16 px of air on the desktop. */
        className="mt-4"
        data-settings-surface={open ? 'expanded' : 'collapsed'}
      >
        {/* DESIGN V3.0 correction I — one column below the workbench
            breakpoint, in the design's order: Rodzaj lodów · Docelowa masa
            partii · Maszyna · Temperatura podawania · OPTIMAL / ECO. The
            desktop keeps its frozen two-column grid of 46 px fields; only the
            tiles (a full row in place of the „Tryb" list) are new there. The
            SOURCE order stays the canonical field order. */}
        <div
          className={cn(
            'profile-settings-grid flex flex-col gap-4 min-[68.5rem]:grid min-[68.5rem]:grid-cols-2 min-[68.5rem]:items-stretch min-[68.5rem]:gap-2',
          )}
          data-settings-layout={compact ? 'panel' : 'plain'}
        >
          <div className="order-1 min-w-0" data-settings-cell="product-type">
            <ProductTypeRow value={store.visibleProductType} onChange={changeProductType} />
            <div className="hidden min-[68.5rem]:block">
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
          </div>

          <div className="order-3 min-w-0 min-[68.5rem]:order-4" data-settings-cell="machine">
            <MachineSettingsField settings={settings} />
          </div>

          {professionalServing ? (
            <div
              className="order-4 min-w-0 min-[68.5rem]:order-3"
              data-testid="machine-conditional-settings"
              data-settings-cell="serving"
            >
              <div className="min-[68.5rem]:hidden">
                <span className={cn(panelFieldLabel, 'mb-1.5')}>{panelCopy.serving}</span>
                <ServingSegments value={activeServing} onPick={(id) => pickServing(id)} />
              </div>
              <div className="hidden min-[68.5rem]:block">
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
            </div>
          ) : null}

          <TargetBatchControl
            grams={store.target_batch_grams}
            currentTotalGrams={currentTotalGrams}
            compact={compact}
            homeMachine={!professionalServing}
            recommendedBatchGrams={recommendedBatchGrams}
            cyclePlan={cyclePlan}
            resizeConflict={store.batchResizeConflict !== null}
            onChange={changeBatch}
            className={cn(
              'order-2 border-b border-[var(--g-line-quiet)] pb-4 min-[68.5rem]:border-b-0 min-[68.5rem]:pb-0',
              professionalServing ? 'min-[68.5rem]:order-5' : 'min-[68.5rem]:order-3',
            )}
          />

          <div
            className="order-5 min-w-0 min-[68.5rem]:order-6 min-[68.5rem]:col-span-2"
            data-settings-cell="strategy"
          >
            <StrategyTiles
              value={store.formulation_strategy}
              onChange={changeStrategy}
              variant="panel"
            />
          </div>

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
          >
            <p className="font-semibold text-ink">{batchSplit.message}</p>
            <p className="mt-0.5">{batchSplit.detail}</p>
          </div>
        ) : null}
        {batchGuidance.kind === 'custom' ||
        (batchGuidance.kind === 'custom_above' && batchGuidance.choice === 'keep_mine') ? (
          <p className="mt-2 text-xs text-stone-600" data-testid="workbench-batch-custom-in-use">
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
        {/* DESIGN V3.0 correction I — „[ ] Ustaw jako domyślne" at the bottom of
            the box, under a hairline: a light row, no explanation and no second
            save button. It replaces „Zapisz jako domyślne" on the desktop too. */}
        <DefaultsCheckbox
          checked={asDefault}
          disabled={defaultsOwner === null}
          onChange={setAsDefault}
          className="mt-4"
        />
        {/* The confirmation stays where it has always been — INSIDE expanded
            Settings, arriving only when something is actually unconfirmed (or
            when ticked defaults still wait for it). `flex-wrap` keeps a long
            translation dropping to a second line instead of widening the card. */}
        <div
          className="mt-4 flex flex-wrap items-center gap-3 min-[68.5rem]:mt-3"
          data-settings-cell="actions"
        >
          {showConfirm ? (
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
    </section>
  );
}

/* ── DESIGN V3.0 fields ────────────────────────────────────────────────────
   Presentations of the settings above, shared by the panel and the V3 setup.
   Each one is a view of a handler from `useProSettingsAuthority`; none keeps a
   copy of a setting. */

/** Phone and iPad portrait: „Rodzaj lodów · Gelato ›", a row that opens the
 *  platform's own picker. The change still goes through the panel's
 *  confirmation (a product type is a new base). */
function ProductTypeRow({
  value,
  onChange,
}: {
  value: VisibleProductType;
  onChange: (next: VisibleProductType) => void;
}) {
  return (
    <label className="relative flex min-h-11 items-center justify-between gap-3 border-b border-[var(--g-line-quiet)] pb-3 min-[68.5rem]:hidden">
      <span className="text-[15px] leading-[1.2] font-medium text-[var(--g-ink)]">
        {panelCopy.productType}
      </span>
      <span className="relative flex min-w-0 items-center">
        <select
          className="pro-focus-ring min-w-0 appearance-none bg-transparent pr-5 text-right text-[15px] leading-[1.2] text-[var(--g-text-secondary)]"
          value={value}
          aria-label={panelCopy.productType}
          data-testid="workbench-product-type-row"
          onChange={(event) => onChange(event.currentTarget.value as VisibleProductType)}
        >
          {PRO_VISIBLE_PRODUCT_TYPES.map((option) => (
            <option key={option} value={option}>
              {g.productTypes[option]}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="pointer-events-none absolute right-0 text-[var(--g-text-secondary)]"
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
}

/**
 * The machine field. Phone and iPad portrait: the V2.1 settings field under a
 * quiet „Maszyna" label (48 px, one hairline, ▾). Desktop: the frozen stacked
 * cell. Both are the SAME catalogue the product offers today (the account
 * stores one machine preference, so the design's list of „your machines" has
 * no source yet — owner decision) and the same selection door.
 */
export function MachineSettingsField({
  settings,
  variant = 'panel',
}: {
  settings: ProSettingsAuthority;
  variant?: 'panel' | 'setup';
}) {
  const [customMachineOpen, setCustomMachineOpen] = useState(false);
  const { machineValue, machineOptions, machineLabelOf, selectMachine, selectCustom } = settings;
  const choose = (id: string) => selectMachine(id, () => setCustomMachineOpen(true));
  return (
    <>
      <label className={cn('block', variant === 'panel' && 'min-[68.5rem]:hidden')}>
        <span
          className={cn(
            variant === 'setup'
              ? 'mb-[9px] block font-mono text-[11.5px] leading-none tracking-[0.08em] text-[var(--g-text-muted)] uppercase'
              : cn(panelFieldLabel, 'mb-1.5'),
          )}
        >
          {panelCopy.machine}
        </span>
        <span className="relative block">
          <select
            className="pro-focus-ring h-12 w-full min-w-0 appearance-none rounded-[9px] border border-[var(--g-line)] bg-white pr-10 pl-[14px] text-[15px] font-semibold text-[var(--g-ink)] transition-colors hover:border-ink/35"
            value={machineValue}
            aria-label={panelCopy.machine}
            data-testid={variant === 'setup' ? 'pro-setup-machine' : 'workbench-machine-field'}
            onChange={(event) => choose(event.currentTarget.value)}
          >
            {machineOptions.map((option) => (
              <option key={option} value={option}>
                {machineLabelOf(option)}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[#5f5a52]"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </label>
      {variant === 'panel' ? (
        <div className="hidden min-[68.5rem]:block">
          <LabeledSelect
            label="Maszyna"
            value={machineValue}
            options={machineOptions}
            labelOf={machineLabelOf}
            onChange={choose}
            testid="workbench-machine"
            stacked
          />
        </div>
      ) : null}
      <RecipeCustomMachineDialog
        open={customMachineOpen}
        onClose={() => setCustomMachineOpen(false)}
        onComplete={(completion) => {
          if (selectCustom(completion)) setCustomMachineOpen(false);
        }}
      />
    </>
  );
}

/** Temperatura podawania — one segmented control, each segment the name over
 *  the temperature; the accessible name keeps „Miękkie · −11 °C". */
export function ServingSegments({
  value,
  onPick,
  testid = 'workbench-serving-segments',
}: {
  value: string;
  onPick: (id: string) => void;
  testid?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={panelCopy.serving}
      className="pro-segmented grid auto-cols-fr grid-flow-col gap-[3px] rounded-[13px] bg-[#f4f1ec] p-[3px]"
      data-testid={testid}
    >
      {SERVING_SEGMENT_ORDER.map((id) => {
        const segment = panelCopy.servingSegments[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={
              segment.temperature ? `${segment.name} · ${segment.temperature}` : segment.name
            }
            data-testid={`${testid}-${id}`}
            onClick={() => onPick(id)}
            className={cn(
              'pro-focus-ring grid min-h-11 content-center justify-items-center gap-1 rounded-[10px] px-1 py-2 text-center',
              selected && 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--g-line)]',
            )}
          >
            <b
              className={cn(
                'text-[13.5px] leading-[1.1] font-semibold',
                selected ? 'text-[var(--g-ink)]' : 'text-[#3b3833]',
              )}
            >
              {segment.name}
            </b>
            {segment.temperature ? (
              <small className="font-mono text-[11.5px] leading-none font-medium text-[var(--g-text-muted)]">
                {segment.temperature}
              </small>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** OPTIMAL / ECO as two selectable tiles, the description inside each, one
 *  selection. The panel says „Priorytet smaku / kosztu" with no „Tryb"
 *  heading; the V3 setup's Step 2 shows its longer Point 2 sentences. */
export function StrategyTiles({
  value,
  onChange,
  variant,
}: {
  value: FormulationStrategy;
  onChange: (next: FormulationStrategy) => void;
  variant: 'panel' | 'setup';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={
        variant === 'setup' ? copy.proWorkbench.setupFlow.modeLabel : panelCopy.strategyGroup
      }
      className="grid grid-cols-2 gap-2"
      data-testid={variant === 'setup' ? 'pro-setup-strategy' : 'workbench-strategy'}
      data-settings-control={variant === 'panel' ? 'strategy' : undefined}
    >
      {FORMULATION_STRATEGIES.map((strategy) => {
        const selected = value === strategy;
        return (
          <button
            key={strategy}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`${variant === 'setup' ? 'pro-setup-strategy' : 'workbench-strategy'}-${strategy}`}
            onClick={() => onChange(strategy)}
            className={cn(
              'pro-focus-ring relative grid min-h-14 content-start gap-[3px] rounded-[9px] bg-white px-[11px] py-[9px] text-left',
              selected
                ? 'shadow-[inset_0_0_0_1.5px_var(--g-ink)]'
                : 'shadow-[inset_0_0_0_1px_var(--g-line)]',
            )}
          >
            <b className="pr-3.5 text-[13px] leading-[1.2] font-bold tracking-[0.01em] text-[var(--g-ink)]">
              {STRATEGY_COPY[strategy].label}
            </b>
            <small className="text-[11px] leading-[1.35] text-[var(--g-text-secondary)]">
              {variant === 'setup'
                ? copy.proWorkbench.setupFlow.modeNotes[strategy]
                : STRATEGY_COPY[strategy].tile}
            </small>
            {selected ? (
              <i
                aria-hidden
                className="absolute top-[11px] right-[11px] size-2 rounded-full bg-[var(--g-ink)]"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** „[ ] Ustaw jako domyślne" — the label on the left, the box on the right. */
export function DefaultsCheckbox({
  checked,
  disabled = false,
  onChange,
  note = null,
  className,
  testid = 'profile-settings-default',
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  note?: string | null;
  className?: string;
  testid?: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-t border-[#efebe4] pt-3',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14.5px] leading-[1.3] font-medium text-[var(--g-ink)]">
          {panelCopy.asDefault}
        </span>
        {note ? (
          <span className="mt-px block text-[11.5px] leading-[1.35] text-[var(--g-text-muted)]">
            {note}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="pro-default-check size-5 shrink-0 cursor-pointer accent-[var(--g-ink)] disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        data-testid={testid}
      />
    </label>
  );
}
