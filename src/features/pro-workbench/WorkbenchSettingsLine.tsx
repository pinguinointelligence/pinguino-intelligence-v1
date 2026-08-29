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
  effectiveDefaultBatchGrams,
  machineDisplayName,
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
  return (
    <section
      /* GELLATTI V2.1: ONE ivory Settings panel. The approved preview does not
         tint the whole card while settings are unconfirmed — the black confirm
         control carries that state on its own. A real CONFLICT still colours
         the card, because that is an error, not a pending step. */
      className={cn(
        'rounded-[10px] border shadow-none transition-colors',
        compact ? 'p-2.5 lg:p-4' : 'p-3',
        hardConflict
          ? 'border-status-error/45 bg-status-error/[0.035]'
          : 'border-[var(--g-line)] bg-[var(--g-ivory)]',
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
          <h3 className="text-sm font-semibold text-ink lg:text-[18px] lg:leading-[20px] lg:font-bold">
            Ustawienia
          </h3>
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
        <div className={cn(compact && 'order-2')} data-settings-cell="product-type">
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
          className={cn('flex min-w-0 items-stretch', compact ? 'order-1' : 'ml-[7.3rem]')}
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
              /* The approved control is GRAPHITE, not orange (owner §13). */
              className={cn(
                'pro-focus-ring w-full rounded-[8px] border border-[var(--g-graphite)] bg-[var(--g-graphite)] px-[10px] text-xs font-semibold whitespace-nowrap text-white shadow-none disabled:cursor-not-allowed disabled:opacity-35 lg:text-[10px]',
                compact ? 'h-11 lg:h-[46px]' : 'min-h-11',
              )}
            >
              Potwierdź ustawienia
            </button>
          ) : (
            <span
              /* Same slot, same 46 px geometry, approved palette — the confirmed
                 state is a quiet acknowledgement, never a second arrangement. */
              className={cn(
                'inline-flex w-full items-center justify-center rounded-[8px] border border-[var(--g-line)] bg-white px-2 text-xs font-semibold whitespace-nowrap text-[var(--g-text-secondary)] lg:text-[10px]',
                compact ? 'h-11 lg:h-[46px]' : 'min-h-11',
              )}
              data-testid="profile-settings-confirmed"
            >
              ✓ Ustawienia potwierdzone
            </span>
          )}
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
          className={cn(compact ? 'order-4' : 'ml-[7.3rem]')}
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
                    : `${cyclePlan.containers} cykle · ${cyclePlan.gramsPerContainer.toLocaleString('pl-PL')} g / cykl`}
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
                Partia
              </span>
              <div
                className={cn(
                  compactFinalSettingsControl,
                  'flex min-w-0 items-center justify-end gap-1.5',
                )}
                data-settings-control="batch"
              >
                <strong className="font-mono text-xs font-bold tabular-nums text-[var(--g-ink)] lg:text-[14px]">
                  {actualBatchG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}
                </strong>
                <span className="text-[10px] text-stone-400">/</span>
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
              className="profile-settings-final-card relative order-6 min-w-0"
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
              <span className="text-xs font-medium text-stone-600">Partia</span>
              <div className="flex min-w-0 items-center justify-end gap-1.5">
                <strong className="font-mono text-xs tabular-nums text-ink">
                  {actualBatchG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}
                </strong>
                <span className="text-[10px] text-stone-400">/</span>
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
              className="rounded-[12px] border border-ink/8 bg-stone-50/70 p-1.5"
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
      </div>
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
