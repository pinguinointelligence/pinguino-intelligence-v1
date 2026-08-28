import { useEffect, useMemo, useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
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
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
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
  startNewProRecipe,
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

const compactSelect =
  'h-11 min-w-0 rounded-[10px] border border-ink/12 bg-white px-3 text-[13px] text-ink shadow-pro-e0 transition-colors hover:border-ink/35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f58a07] lg:h-10 lg:text-xs';
const compactFinalSettingsCard = 'profile-settings-final-card min-w-0 rounded-[12px] border p-1.5';
const compactFinalSettingsLabel = 'px-1 text-[10px] font-medium leading-tight text-stone-600';
const compactSettingsHelper = 'px-1 text-[10px] leading-tight text-stone-600';
const compactFinalSettingsControl = 'h-[52px] lg:h-10 2xl:h-[43px]';

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
          'font-medium text-stone-600',
          stacked ? 'pointer-events-none absolute left-3 top-1.5 z-10 text-[10px]' : 'text-xs',
        )}
      >
        {label}
      </span>
      <select
        className={cn(compactSelect, 'w-full', stacked && 'h-[52px] pt-4 lg:h-10 2xl:h-[43px]')}
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
    (store.machineKind === 'home' && selectedHome === null);

  const activeServing = snapshot.servingModeId;
  const machineValue = selectedHome?.id ?? 'professional';
  const batchDisplay = fromGrams(store.target_batch_grams, unit, store.category);
  const batchMismatch = Math.abs(actualBatchG - store.target_batch_grams) > 0.1;
  const capacity = store.machineKind === 'home' ? store.machine_capacity_grams : null;
  const cyclePlan = capacity ? planContainerSplit(store.target_batch_grams, capacity) : null;

  const pickServing = (id: string) => {
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
      batchGrams: null,
      capacityGrams: null,
    });
  };

  const selectProfessional = () =>
    pickServing(
      isNewRecipeServingModeId(activeServing)
        ? activeServing
        : starterServingModeForTemperature(store.target_temperature_c),
    );

  const selectHome = (profile: HomeMachineProfile) => {
    const setup = deriveMachineSetup(profile);
    if (setup.resolvedVisibleMode === null) return;
    const temp = temperatureForMode(setup.resolvedVisibleMode);
    if (temp === null) return;
    store.setMachineSelection({
      kind: 'home',
      servingModeId: setup.resolvedVisibleMode,
      machineId: profile.id,
      label: machineDisplayName(profile),
      temperatureC: temp,
      // Batch ownership stays in the canonical §17 resize path below so an
      // older rehydrated Main/Required percent sidecar is honoured too.
      batchGrams: null,
      capacityGrams: setup.recommendedBatchGrams,
    });
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
      className={cn(
        'rounded-[14px] border shadow-pro-e0 transition-colors',
        compact ? 'p-2.5 lg:p-2' : 'p-3',
        hardConflict
          ? 'border-status-error/45 bg-status-error/[0.035]'
          : confirmed
            ? 'border-ink/10 bg-white'
            : 'border-[#f58a07]/35 bg-[#fffaf3]',
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
          <h3 className="text-sm font-semibold text-ink">Ustawienia</h3>
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
        <div data-settings-cell="product-type">
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
          className={cn('flex min-w-0 items-stretch', !compact && 'ml-[7.3rem]')}
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
              className={cn(
                'pro-focus-ring w-full rounded-[10px] bg-ink px-3 text-xs font-semibold text-white shadow-pro-sm disabled:cursor-not-allowed disabled:opacity-35',
                compact ? 'h-[52px] lg:h-10 2xl:h-[43px]' : 'min-h-11',
              )}
            >
              Potwierdź ustawienia
            </button>
          ) : (
            <span
              className={cn(
                'inline-flex w-full items-center justify-center px-2 text-xs font-semibold text-status-ideal',
                compact ? 'h-[52px] lg:h-10 2xl:h-[43px]' : 'min-h-11',
              )}
              data-testid="profile-settings-confirmed"
            >
              ✓ Ustawienia potwierdzone
            </span>
          )}
        </div>

        <div data-settings-cell="machine">
          <LabeledSelect
            label="Maszyna"
            value={machineValue}
            options={['professional', ...activeHomeMachines.map((profile) => profile.id)]}
            labelOf={(id) =>
              id === 'professional'
                ? professionalLabel
                : machineDisplayName(activeHomeMachines.find((profile) => profile.id === id)!)
            }
            onChange={(id) => {
              if (id === 'professional') selectProfessional();
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
          className={cn(!compact && 'ml-[7.3rem]')}
          data-testid="machine-conditional-settings"
          data-settings-cell="serving"
        >
          {!showsProfessionalServing(store.machineKind) ? (
            <div className="space-y-0.5 text-xs text-stone-600">
              <p data-testid="home-machine-capacity">
                Pojemność jednego cyklu:{' '}
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
            </div>
          ) : (
            <LabeledSelect
              label="Tryb serwowania"
              value={activeServing}
              options={SERVING_OPTIONS.map((option) => option.id)}
              labelOf={(id) => SERVING_OPTIONS.find((option) => option.id === id)?.label ?? id}
              onChange={pickServing}
              testid="workbench-serving"
              stacked={compact}
            />
          )}
        </div>

        {compact ? (
          <div className="profile-settings-final-row col-span-full">
            <div
              className={cn(
                compactFinalSettingsCard,
                batchMismatch ? 'border-gold/35 bg-education-ivory/55' : 'border-ink/10 bg-white',
              )}
              data-testid="profile-batch-combined"
              data-settings-cell="batch"
              data-settings-final-card="batch"
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
                <strong className="font-mono text-xs tabular-nums text-ink">
                  {actualBatchG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}
                </strong>
                <span className="text-[10px] text-stone-400">/</span>
                <DeferredNumberInput
                  className={cn(
                    compactSelect,
                    compactFinalSettingsControl,
                    'w-20 text-right font-mono tabular-nums',
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
                  onCommit={(next) => changeBatch(toGrams(next, unit, store.category))}
                />
                <select
                  className={cn(compactSelect, compactFinalSettingsControl, 'w-16')}
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
              className={cn(compactFinalSettingsCard, 'border-ink/8 bg-stone-50/70')}
              data-settings-cell="strategy"
              data-settings-final-card="strategy"
            >
              <label
                className={compactFinalSettingsLabel}
                htmlFor="workbench-strategy"
                data-settings-label="strategy"
              >
                Tryb
              </label>
              <select
                id="workbench-strategy"
                className={cn(compactSelect, compactFinalSettingsControl, 'w-full')}
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
              <p className={compactSettingsHelper} data-settings-helper="strategy">
                {STRATEGY_COPY[store.formulation_strategy].description}
              </p>
            </div>
          </div>
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
          startNewProRecipe(pendingBaseProfile);
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
    </section>
  );
}
