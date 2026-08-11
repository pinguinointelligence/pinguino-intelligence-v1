import { useEffect, useMemo, useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useAuthStore } from '@/stores/authStore';
import { BATCH_UNITS, fromGrams, toGrams, type BatchUnit } from '@/lib/units';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { VISIBLE_PRODUCT_TYPES, type VisibleProductType } from '@/features/studio/productType';
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
  showsProfessionalServing,
  useRecipeProfileStore,
} from './recipeProfileStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import { ProteinTargetControl } from '@/features/protein-gelato/ProteinTargetControl';
import {
  FORMULATION_STRATEGIES,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';

const g = copy.studio.goal;
const servingCopy = copy.proMachine.serving;
const professionalLabel = copy.proMachine.professionalLabel;

const STRATEGY_COPY: Record<FormulationStrategy, { label: string; description: string }> = {
  optimal: { label: 'OPTIMAL', description: 'Najlepsza receptura. Koszt nie steruje składem.' },
  eco: { label: 'ECO', description: 'Najniższy koszt przy zachowaniu technologii i smaku.' },
};
const SERVING_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'fresh', label: servingCopy.fresh },
  { id: 'temp_minus_11', label: servingCopy.minus11 },
  { id: 'temp_minus_12', label: servingCopy.minus12 },
  { id: 'temp_minus_13', label: servingCopy.minus13 },
];

const compactSelect =
  'h-11 min-w-0 rounded-lg border border-ink/12 bg-white px-2 text-[11px] text-ink shadow-pro-sm transition-colors hover:border-ink/35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold lg:h-9';

function LabeledSelect<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
  testid,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labelOf: (option: T) => string;
  onChange: (next: T) => void;
  testid: string;
}) {
  return (
    <label className="grid grid-cols-[6.8rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-[10px] font-semibold tracking-[0.06em] text-stone-500 uppercase">
        {label}
      </span>
      <select
        className={`${compactSelect} w-full`}
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

function ownerPreferenceKey(): string {
  return useAuthStore.getState().user?.id ?? 'local-device';
}

export function WorkbenchSettingsLine({
  actualBatchG,
  actualProteinPercent = 0,
}: {
  actualBatchG: number;
  actualProteinPercent?: number;
}) {
  const store = useRecipeStore();
  const resizeBatchGrams = useConstraintStudioStore((state) => state.resizeBatchGrams);
  const directionTargets = store.direction_targets;
  const openedContextSeq = useRecipeProfileStore((state) => state.openedContextSeq);
  const confirmedSignature = useRecipeProfileStore((state) => state.confirmedSignature);
  const confirmedContextSeq = useRecipeProfileStore((state) => state.confirmedContextSeq);
  const openDraft = useRecipeProfileStore((state) => state.openDraft);
  const confirmSettings = useRecipeProfileStore((state) => state.confirmSettings);
  const saveDefaults = useRecipeProfileStore((state) => state.saveDefaults);
  const [unit, setUnit] = useState<BatchUnit>('g');
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const activeHomeMachines = useMemo(() => listActiveHomeMachines(MACHINE_CATALOG), []);
  const selectedHome =
    store.machineKind === 'home'
      ? (activeHomeMachines.find((profile) => profile.id === store.machineId) ?? null)
      : null;

  useEffect(() => {
    if (openedContextSeq !== store.draftContextSeq) {
      openDraft(store.draftContextSeq, directionTargets);
    }
  }, [directionTargets, openDraft, openedContextSeq, store.draftContextSeq]);

  const snapshot = profileSnapshotFromState(store, directionTargets);
  const signature = profileSettingsSignature(snapshot, store.draftContextSeq);
  const confirmed =
    confirmedSignature === signature && confirmedContextSeq === store.draftContextSeq;
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
    store.setMachineSelection({
      kind: 'professional',
      servingModeId: id,
      machineId: null,
      label: professionalLabel,
      temperatureC: temp,
    });
  };

  const selectProfessional = () => pickServing(activeServing);

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
    if (setup.recommendedBatchGrams != null) resizeBatchGrams(setup.recommendedBatchGrams);
  };

  return (
    <section
      className={cn(
        'rounded-xl border p-3 shadow-pro-sm transition-colors',
        hardConflict
          ? 'border-status-error/45 bg-status-error/[0.035]'
          : confirmed
            ? 'border-pro-line bg-white/80'
            : 'border-gold/45 bg-education-ivory/65',
      )}
      data-testid="workbench-settings-line"
      data-preflight-state={
        hardConflict ? 'conflict' : confirmed ? 'confirmed' : 'needs-confirmation'
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.08em] text-ink uppercase">
          Ustawienia receptury
        </h3>
        <span
          className={cn(
            'text-[10px] font-semibold tracking-[0.06em] uppercase',
            hardConflict ? 'text-status-error' : confirmed ? 'text-status-ideal' : 'text-attention',
          )}
          data-testid="profile-preflight-status"
        >
          {hardConflict ? 'Konflikt ustawień' : confirmed ? '✓ Potwierdzone' : 'Sprawdź ustawienia'}
        </span>
      </div>

      <div className="space-y-1.5">
        <div>
          <LabeledSelect
            label={g.productTypeLabel}
            value={store.visibleProductType}
            options={VISIBLE_PRODUCT_TYPES}
            labelOf={(option) => g.productTypes[option]}
            onChange={(next: VisibleProductType) => store.setVisibleProductType(next)}
            testid="workbench-product-type"
          />
          {store.visibleProductType === 'sorbet' ? (
            <ReadinessBadge
              className="ml-[7.3rem] mt-1"
              state="W PRZYGOTOWANIU"
              details={{
                limitation: 'Sorbet nie blokuje istniejącego nabiału.',
                calculationImpact:
                  'Profil zakresów działa, lecz zgodność składników nie jest gwarantowana.',
                remaining: 'Dodać walidację nabiału.',
              }}
            />
          ) : null}
          {store.visibleProductType === 'vegan' ? (
            <ReadinessBadge
              className="ml-[7.3rem] mt-1"
              state="CZĘŚCIOWO PODŁĄCZONE"
              details={{
                limitation:
                  'Bramka składników Vegan działa; dokładne zweryfikowane kandydaty Soy z Mapper 2088 są obsługiwane, a -11/-12 nadal wymagają walidacji produkcyjnej.',
                calculationImpact:
                  'Niezweryfikowane składniki blokują Preview i Apply; wynik natywny nie obejmuje jeszcze FP, T50 ani celów sensorycznych.',
                remaining:
                  'Zweryfikować produkcyjnie -11/-12 oraz dostarczyć zatwierdzone dane FP/T50; Direction pozostaje zablokowane do czasu pełnej, bezpiecznej ścieżki Preview/Apply.',
              }}
            />
          ) : null}
          {store.visibleProductType === 'protein' ? (
            <div className="ml-[7.3rem] mt-1">
              <ProteinTargetControl actualPercent={actualProteinPercent} />
            </div>
          ) : null}
        </div>

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
        />

        <div
          className="ml-[7.3rem] border-l border-ink/15 pl-2"
          data-testid="machine-conditional-settings"
        >
          {!showsProfessionalServing(store.machineKind) ? (
            <div className="space-y-0.5 text-[10px] text-stone-600">
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
            />
          )}
        </div>

        <div
          className={cn(
            'grid grid-cols-[6.8rem_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-1.5',
            batchMismatch ? 'border-gold/35 bg-education-ivory/55' : 'border-ink/10 bg-white',
          )}
          data-testid="profile-batch-combined"
        >
          <span className="text-[10px] font-semibold tracking-[0.06em] text-stone-500 uppercase">
            Partia
          </span>
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <strong className="font-mono text-xs tabular-nums text-ink">
              {actualBatchG.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}
            </strong>
            <span className="text-[10px] text-stone-400">/</span>
            <input
              type="number"
              min={1}
              className={cn(compactSelect, 'w-20 text-right font-mono tabular-nums')}
              value={
                Number.isFinite(batchDisplay)
                  ? Number(batchDisplay.toFixed(unit === 'g' ? 0 : 3))
                  : 0
              }
              data-testid="workbench-batch"
              aria-label="Docelowa partia"
              onChange={(event) =>
                resizeBatchGrams(
                  toGrams(event.currentTarget.valueAsNumber || 0, unit, store.category),
                )
              }
            />
            <select
              className={cn(compactSelect, 'w-14')}
              value={unit}
              aria-label="Jednostka partii"
              onChange={(event) => setUnit(event.currentTarget.value as BatchUnit)}
            >
              {BATCH_UNITS.map((batchUnit) => (
                <option key={batchUnit}>{batchUnit}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white/65 p-1.5">
          <LabeledSelect
            label="TRYB"
            value={store.formulation_strategy}
            options={FORMULATION_STRATEGIES}
            labelOf={(strategy) => STRATEGY_COPY[strategy].label}
            onChange={(strategy) => store.setFormulationStrategy(strategy)}
            testid="workbench-strategy"
          />
          <p className="ml-[7.3rem] mt-1 text-[10px] leading-relaxed text-stone-500">
            {store.formulation_strategy === 'eco'
              ? 'ECO działa w granicach twardej technologii i ochrony smaku.'
              : 'OPTIMAL dobiera technologię bez używania ceny jako celu.'}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {!confirmed || hardConflict ? (
          <button
            type="button"
            disabled={hardConflict}
            onClick={() => confirmSettings(signature, store.draftContextSeq)}
            data-testid="profile-settings-confirm"
            className="pro-focus-ring h-11 flex-1 rounded-lg bg-ink px-3 text-[11px] font-semibold text-white shadow-pro-sm disabled:cursor-not-allowed disabled:opacity-35 lg:h-9"
          >
            Potwierdź ustawienia
          </button>
        ) : (
          <span
            className="flex-1 text-[10px] text-status-ideal"
            data-testid="profile-settings-confirmed"
          >
            ✓ Ustawienia sprawdzone
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            saveDefaults(ownerPreferenceKey(), snapshot);
            setDefaultsSaved(true);
          }}
          className="pro-focus-ring h-11 rounded-lg border border-ink/15 bg-white px-2 text-[10px] text-stone-600 hover:border-ink/35 lg:h-9"
          data-testid="profile-settings-set-default"
        >
          {defaultsSaved ? '✓ Domyślne zapisane' : 'Ustaw jako domyślne'}
        </button>
      </div>
    </section>
  );
}
