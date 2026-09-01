import { useEffect, useMemo, useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import {
  PROFESSIONAL_DEFAULT_BATCH_GRAMS,
  useRecipeStore,
} from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { BATCH_UNITS, fromGrams, toGrams, type BatchUnit } from '@/lib/units';
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
import { ReadinessBadge } from '@/features/design-review/ReadinessMarker';
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
const compactFinalSettingsCard =
  'profile-settings-final-card relative min-w-0 rounded-[9px] border px-[11px] py-[6px]';
const compactFinalSettingsLabel =
  'block text-[9px] leading-[10px] font-normal text-[var(--g-text-field-label)]';
/* The two Settings helper lines are not part of the approved 46 px field, so
   they travel in the control's accessible description instead of taking a
   third row (owner §13). No information is removed. */
const compactSettingsHelper = 'sr-only';
const compactFinalSettingsControl = 'h-11 lg:h-[29px]';
/* The three non-blocking actions under the above-recommendation warning. Quiet
   white cells in the Settings palette — an advisory, never a primary control. */
const aboveActionClass =
  'pro-focus-ring min-h-9 rounded-[8px] border border-[var(--g-line)] bg-white px-3 text-xs font-semibold whitespace-nowrap text-ink shadow-none transition-colors hover:border-ink/35';

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

export function WorkbenchSettingsLine({
  actualBatchG,
  className,
  compact = false,
}: {
  actualBatchG: number;
  className?: string;
  compact?: boolean;
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
  const [unit, setUnit] = useState<BatchUnit>('g');
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
  const confirmed =
    activeDraftIdentity !== null &&
    confirmedDraftIdentity === activeDraftIdentity &&
    confirmedSignature === signature &&
    (activeDraftIdentity.startsWith('["saved-recipe",') ||
      confirmedContextSeq === store.draftContextSeq);
  const hardConflict =
    !Number.isFinite(store.target_batch_grams) ||
    store.target_batch_grams <= 0 ||
    (store.machineKind === 'home' && selectedHome === null && !store.machineId?.startsWith('custom-')) ||
    store.batchResizeConflict !== null;

  const activeServing = snapshot.servingModeId;
  const customSelected = store.machineKind === 'home' && store.machineId?.startsWith('custom-');
  const machineValue = customSelected ? 'custom' : (selectedHome?.id ?? 'professional');
  const batchDisplay = fromGrams(store.target_batch_grams, unit, store.category);
  const batchMismatch = Math.abs(actualBatchG - store.target_batch_grams) > 0.1;
  const capacity = store.machineKind === 'home' ? store.machine_capacity_grams : null;
  const cyclePlan = capacity ? planContainerSplit(store.target_batch_grams, capacity) : null;

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
    aboveChoice.recommendedGrams === capacity
      ? aboveChoice.choice
      : 'undecided';
  /* `capacity === null` (Professional, or a Home machine with no confirmed
     recommendation) already yields `kind: 'none'` — no second capacity rule. */
  const batchGuidance = deriveBatchGuidance({
    recommendedGrams: capacity,
    currentGrams: guidanceGrams,
    choice: batchChoice,
  });
  const batchSplit =
    batchGuidance.kind === 'custom_above' && batchGuidance.split !== null
      ? containerSplitNotice(batchGuidance.split.totalGrams, capacity)
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
      capacityGrams: null,
      ...(resetToProfessionalDefault
        ? { batchSource: 'PROFESSIONAL_DEFAULT' as const }
        : {}),
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
    const temp = temperatureForMode(setup.resolvedVisibleMode);
    if (temp === null) return;
    store.setMachineSelection({
      kind: 'home',
      servingModeId: setup.resolvedVisibleMode,
      machineId: profile.id,
      label: machineDisplayName(profile),
      machineTechnology: profile.technology,
      temperatureC: temp,
      batchGrams: setup.recommendedBatchGrams,
      capacityGrams: setup.recommendedBatchGrams,
      batchSource: 'MACHINE_DEFAULT',
    });
  };

  const selectCustom = (completion: MachineOnboardingCompletion) => {
    const batchGrams = effectiveDefaultBatchGrams(completion.record);
    const servingModeId = completion.derivation.resolvedVisibleMode;
    if (batchGrams === null || servingModeId === null) return;
    const temperatureC = temperatureForMode(servingModeId);
    if (temperatureC === null) return;
    store.setMachineSelection({
      kind: 'home',
      servingModeId,
      machineId: completion.profile.id,
      label: machineDisplayName(completion.profile),
      machineTechnology: completion.profile.technology,
      temperatureC,
      batchGrams,
      capacityGrams: batchGrams,
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
    if (guidanceGrams === null || capacity === null) return;
    setAboveChoice({ grams: guidanceGrams, recommendedGrams: capacity, choice });
  };
  /* Restore goes through the ordinary batch path, so recipe locks answer it the
     same way they answer a typed batch (a refusal surfaces as the existing
     `batchResizeConflict` line — still no block from this guidance). */
  const restoreRecommendedBatch = () => {
    if (capacity === null) return;
    setAboveChoice(null);
    changeBatch(capacity);
  };
  return (
    <section
      /* OWNER FROZEN PRO VISUAL: Settings is a BAND in the display column, not
         an ivory panel sitting on it. At rest it carries no surface at all —
         the eyebrow and the field grid are the whole treatment.

         A real CONFLICT still takes a surface, because that is an error rather
         than a pending step, and an error is exactly the exception a surface
         should be spent on. Unconfirmed remains carried by the control alone. */
      className={cn(
        'transition-colors',
        hardConflict
          ? 'rounded-[10px] border border-status-error/45 bg-status-error/[0.035] p-2.5 lg:p-3'
          : 'border-0 bg-transparent p-0',
        className,
      )}
      data-testid="workbench-settings-line"
      tabIndex={-1}
      data-preflight-state={
        hardConflict ? 'conflict' : confirmed ? 'confirmed' : 'needs-confirmation'
      }
    >
      <div className="mb-2 flex min-h-6 items-center">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-[11px] leading-[16px] font-semibold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
            Ustawienia
          </h3>
        <span aria-hidden className="h-px flex-1 bg-[var(--g-line)]" />
        {/* OWNER FROZEN PRO VISUAL: the confirmation is the BAND's action, not
            a seventh tile in a 2x3 grid. It keeps its handler, its disabled
            rule and both testids — only its home and its weight changed. */}
        <span
          className="flex shrink-0 items-center gap-1.5"
          data-testid="settings-grid-status"
          data-settings-cell="confirmation"
        >
          {!confirmed || hardConflict ? (
            <button
              type="button"
              disabled={hardConflict}
              onClick={() => {
                if (activeDraftIdentity !== null) {
                  confirmSettings(signature, activeDraftIdentity, store.draftContextSeq);
                }
              }}
              data-testid="profile-settings-confirm"
              className="pro-focus-ring inline-flex h-7 items-center rounded-full border border-[var(--g-graphite)] bg-transparent px-3 text-[11.5px] font-semibold whitespace-nowrap text-[var(--g-graphite)] enabled:hover:bg-[var(--g-graphite)] enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Potwierdź ustawienia
            </button>
          ) : (
            <span
              /* The settled step is the quietest thing in the band. */
              className="text-[11.5px] font-semibold whitespace-nowrap text-[var(--g-text-secondary)]"
              data-testid="profile-settings-confirmed"
            >
              ✓ Ustawienia potwierdzone
            </span>
          )}
        </span>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              'sr-only text-xs font-semibold',
              hardConflict
                ? 'text-status-error'
                : confirmed
                  ? 'text-status-ideal'
                  : 'text-attention',
            )}
            data-testid="profile-preflight-status"
          >
            {hardConflict
              ? 'Konflikt ustawień'
              : confirmed
                ? '✓ Ustawienia potwierdzone'
                : 'Zmiany niepotwierdzone'}
          </span>
        </div>
      </div>

      <div
        className={cn(
          compact ? 'profile-settings-grid grid grid-cols-2 items-stretch gap-2' : 'space-y-3',
        )}
      >
        <div className={cn(compact && 'order-1')} data-settings-cell="product-type">
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

        <div className={cn(compact && 'order-3')} data-settings-cell="machine">
          <LabeledSelect
            label="Maszyna"
            value={machineValue}
            options={['professional', ...activeHomeMachines.map((profile) => profile.id), 'custom']}
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

        <div
          className={cn(compact ? 'order-2' : 'ml-[7.3rem]')}
          data-testid="machine-conditional-settings"
          data-settings-cell="serving"
        >
          {!showsProfessionalServing(store.machineKind) ? (
            <div className="space-y-0.5 text-xs text-stone-600">
              <p data-testid="home-machine-capacity">
                Zalecany wsad na cykl:{' '}
                <strong className="font-mono text-ink">
                  {capacity === null ? '—' : `${capacity.toLocaleString('pl-PL')} g`}
                </strong>
              </p>
              {cyclePlan ? (
                <p data-testid="home-machine-cycles">
                  {cyclePlan.containers === 1
                    ? 'Jedna partia mieści się w jednym cyklu.'
                    : `${cyclePlan.containers} ${pluralCykle(cyclePlan.containers)} · ${cyclePlan.gramsPerContainer.toLocaleString('pl-PL')} g / cykl`}
                </p>
              ) : (
                <ReadinessBadge
                  state="W PRZYGOTOWANIU"
                  details={{
                    limitation: 'Brak potwierdzonej pojemności tej maszyny.',
                    calculationImpact: 'Liczba cykli nie jest wyliczana.',
                    remaining: 'Potwierdzić pojemność modelu.',
                  }}
                />
              )}
              {store.batchResizeConflict !== null ? (
                <p role="alert" className="text-status-error" data-testid="batch-resize-conflict">
                  Nie można ustawić tej partii bez naruszenia blokad receptury. Zmień blokady lub
                  wybierz inną ilość.
                </p>
              ) : null}
            </div>
          ) : (
            <LabeledSelect
              label="Tryb serwowania"
              value={activeServing}
              options={SERVING_OPTIONS.map((option) => option.id)}
              labelOf={(id) => SERVING_OPTIONS.find((option) => option.id === id)?.label ?? id}
              onChange={(id) => pickServing(id)}
              testid="workbench-serving"
              stacked={compact}
            />
          )}
        </div>

        {compact ? (
          /* GELLATTI V2.1 §13 — Batch and Tryb are the THIRD ROW of the one
             Settings grid, two ordinary 46 px fields side by side. The former
             three-row sub-grid (label / control / helper) is gone: it made the
             last row taller than the two above it. */
          <>
            <div
              className={cn(
                compactFinalSettingsCard,
                'order-5 lg:flex lg:h-[46px] lg:flex-col lg:justify-center lg:py-0',
                batchMismatch
                  ? 'border-gold/35 bg-education-ivory/55'
                  : 'border-[var(--g-line)] bg-white',
              )}
              data-testid="profile-batch-combined"
              data-settings-cell="batch"
              data-settings-final-card="batch"
              title="Baza lodowa bez toppingu"
            >
              <span className={compactFinalSettingsLabel} data-settings-label="batch">
                Partia docelowa
              </span>
              {/* ONE editable batch field (owner UX correction). The recipe's
                  current Base is read-only information and lives under the
                  grid — never a second box that reads as an input. */}
              <div
                className={cn(
                  compactFinalSettingsControl,
                  'flex min-w-0 items-center justify-end gap-1.5',
                )}
                data-settings-control="batch"
              >
                <DeferredNumberInput
                  className={cn(
                    compactSelect,
                    'h-7 w-20 rounded-[6px] border-transparent bg-transparent px-1 text-right font-mono font-bold tabular-nums lg:h-[29px] lg:text-[14px]',
                  )}
                  value={
                    Number.isFinite(batchDisplay)
                      ? Number(batchDisplay.toFixed(unit === 'g' ? 0 : 3))
                      : 0
                  }
                  min={fromGrams(1, unit, store.category)}
                  decimals={unit === 'g' ? 0 : 3}
                  data-testid="workbench-batch"
                  aria-label="Docelowa partia"
                  title="Baza lodowa bez toppingu"
                  onCommit={(next) => changeBatch(toGrams(next, unit, store.category))}
                />
                {/* The unit stays a real control (g / kg / l is genuine
                    functionality) but wears the preview's plain unit mark. */}
                <select
                  className={cn(
                    compactSelect,
                    'h-7 w-auto border-transparent bg-transparent px-0 text-[var(--g-ink)] lg:h-[29px] lg:text-[11px]',
                  )}
                  value={unit}
                  aria-label="Jednostka partii"
                  onChange={(event) => setUnit(event.currentTarget.value as BatchUnit)}
                >
                  {BATCH_UNITS.map((batchUnit) => (
                    <option key={batchUnit}>{batchUnit}</option>
                  ))}
                </select>
              </div>
              <p className={compactSettingsHelper} data-settings-helper="batch">
                Baza lodowa bez toppingu
              </p>
            </div>

            <div
              className="profile-settings-final-card relative order-4 min-w-0"
              data-settings-cell="strategy"
              data-settings-final-card="strategy"
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
              className={cn(
                'grid grid-cols-[6.8rem_minmax(0,1fr)] items-center gap-2 rounded-[12px] border px-3 py-2',
                batchMismatch ? 'border-gold/35 bg-education-ivory/55' : 'border-ink/10 bg-white',
              )}
              data-testid="profile-batch-combined"
              data-settings-cell="batch"
            >
              <span className="text-xs font-medium text-stone-600">Partia docelowa</span>
              {/* ONE editable batch field — see the compact branch. */}
              <div className="flex min-w-0 items-center justify-end gap-1.5">
                <DeferredNumberInput
                  className={cn(compactSelect, 'w-20 text-right font-mono tabular-nums')}
                  value={
                    Number.isFinite(batchDisplay)
                      ? Number(batchDisplay.toFixed(unit === 'g' ? 0 : 3))
                      : 0
                  }
                  min={fromGrams(1, unit, store.category)}
                  decimals={unit === 'g' ? 0 : 3}
                  data-testid="workbench-batch"
                  aria-label="Docelowa partia"
                  onCommit={(next) => changeBatch(toGrams(next, unit, store.category))}
                />
                <select
                  className={cn(compactSelect, 'w-16')}
                  value={unit}
                  aria-label="Jednostka partii"
                  onChange={(event) => setUnit(event.currentTarget.value as BatchUnit)}
                >
                  {BATCH_UNITS.map((batchUnit) => (
                    <option key={batchUnit}>{batchUnit}</option>
                  ))}
                </select>
              </div>
              <p className="col-span-full text-xs text-stone-600">Baza lodowa bez toppingu</p>
            </div>

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

        {/* The recipe's CURRENT base, read-only (owner UX correction). It answers
            "what does the recipe weigh right now" beside "what do I want to
            make" — deliberately NOT a second input, and never editable. A grid
            child so it stays directly under the batch field it reports on: full
            width under the 2-column row, and re-ordered ahead of Tryb when the
            grid collapses to one column (see `profile-settings-base-readout`). */}
        <p
          className="profile-settings-base-readout order-6 min-w-0 text-xs text-stone-600"
          data-testid="workbench-recipe-base"
          data-settings-readonly="base"
        >
          Baza receptury:{' '}
          <span className="font-mono tabular-nums text-ink">
            {actualBatchG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
          </span>
        </p>
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
      <RecipeCustomMachineDialog
        open={customMachineOpen}
        onClose={() => setCustomMachineOpen(false)}
        onComplete={selectCustom}
      />
    </section>
  );
}
