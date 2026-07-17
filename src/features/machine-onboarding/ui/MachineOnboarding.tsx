/**
 * §8 one-time Home machine onboarding — the self-contained flow component.
 *
 *   tiles („Jakiej maszyny używasz?” + search)
 *     → [model disambiguation — only when capacity differs]
 *     → [„Nie widzę mojej maszyny” → §8.3 behavior question
 *          → §8.4 custom form | honest unsupported state]
 *     → §8.5 auto-config transition (~1–2 s, reduced-motion aware)
 *     → onComplete(record + profile + derivation)
 *
 * The component does NOT persist anything and does NOT touch routing or the
 * customer shell — the orchestrator saves via a `MachinePreferenceStore` and
 * wires the flow (see INTEGRATION.md). Light-native (customer-shell tokens,
 * no dark remap).
 */
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  MACHINE_BEHAVIOR_ANSWERS,
  MACHINE_CATALOG,
  MACHINE_CATALOG_VERSION,
  buildCustomMachineProfile,
  deriveMachineSetup,
  type CustomMachineInput,
  type HomeMachineProfile,
  type MachineBehaviorAnswer,
  type MachineDerivation,
} from '@/features/machine-catalog';
import { SelectableCard } from '@/features/customer-shell/ui/SelectableCard';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import { color, type } from '@/features/customer-shell/ui/tokens';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import {
  autoConfigLines,
  buildMachineTileViews,
  machineDisplayName,
  presentBatchSuggestion,
  searchMachineTiles,
  type MachineTileView,
} from '../machineViews';
import {
  buildMachinePreferenceRecord,
  recommendedBatchGramsOf,
  withUserDefaultBatch,
  type MachinePreferenceRecord,
} from '../preferenceContracts';
import { MachineTileGrid } from './MachineTileGrid';
import { MachineBehaviorQuestion } from './MachineBehaviorQuestion';
import { CustomMachineForm, type CustomMachineFormValues } from './CustomMachineForm';
import { AutoConfigTransition } from './AutoConfigTransition';
import { MachineAdjustBatchStep } from './MachineAdjustBatchStep';

export interface MachineOnboardingCompletion {
  readonly record: MachinePreferenceRecord;
  readonly profile: HomeMachineProfile;
  readonly derivation: MachineDerivation;
}

type Screen =
  | { kind: 'tiles' }
  | { kind: 'disambiguation'; tile: MachineTileView }
  | { kind: 'behavior' }
  | { kind: 'custom'; answer: MachineBehaviorAnswer; initialValues: CustomMachineFormValues | null }
  | { kind: 'unsupported' }
  | { kind: 'configuring'; profile: HomeMachineProfile; isCustom: boolean }
  | {
      /** §4 „Dopasuj ilość” — the user sets their own default before the save. */
      kind: 'adjust';
      profile: HomeMachineProfile;
      isCustom: boolean;
      record: MachinePreferenceRecord;
    };

interface MachineOnboardingProps {
  /** Market token recorded on CUSTOM machines (catalog records carry their own). */
  market?: string;
  onComplete: (completion: MachineOnboardingCompletion) => void;
  /** Injected clock (ISO datetime) — deterministic in tests. */
  now?: () => string;
  /** Optional §8.6 entry: edit an existing custom machine (prefilled form). */
  editCustomProfile?: HomeMachineProfile | null;
  catalog?: readonly HomeMachineProfile[];
  /**
   * Label of the §4 adjust step's primary action. First-run onboarding inside
   * the recipe flow says „Zapisz i przejdź do receptury”; the profile page
   * keeps the neutral „Zapisz i przejdź dalej” (owner hotfix §3/§4).
   */
  submitLabel?: string;
}

/** Reverse of the §8.3 mapping — only for the three custom-supported technologies. */
function behaviorAnswerForTechnology(technology: string): MachineBehaviorAnswer | null {
  if (technology === 'continuous_soft_serve') return null;
  return MACHINE_BEHAVIOR_ANSWERS.find((a) => a.technology === technology) ?? null;
}

function initialFormValues(profile: HomeMachineProfile): CustomMachineFormValues {
  return {
    brand: profile.brand === '' ? null : profile.brand,
    model: profile.modelCodes[0] ?? null,
    vesselCapacity:
      profile.capacity.vesselCapacityMl !== null
        ? { value: profile.capacity.vesselCapacityMl, unit: 'ml' }
        : null,
    hasMaxFillLine: profile.capacity.maxFillDefinedByManufacturer ? true : null,
    manufacturerMaxMix:
      profile.capacity.maximumLiquidMixMl !== null
        ? { value: profile.capacity.maximumLiquidMixMl, unit: 'ml' }
        : null,
  };
}

export function MachineOnboarding({
  market = 'ES',
  onComplete,
  now = () => new Date().toISOString(),
  editCustomProfile = null,
  catalog = MACHINE_CATALOG,
  submitLabel = copy.settings.saveAndContinue,
}: MachineOnboardingProps) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (editCustomProfile !== null) {
      const answer = behaviorAnswerForTechnology(editCustomProfile.technology);
      if (answer !== null) {
        return { kind: 'custom', answer, initialValues: initialFormValues(editCustomProfile) };
      }
    }
    return { kind: 'tiles' };
  });
  const [search, setSearch] = useState('');

  const tileViews = useMemo(() => buildMachineTileViews(undefined, catalog), [catalog]);
  const visibleTiles = useMemo(
    () => searchMachineTiles(tileViews, search, catalog),
    [tileViews, search, catalog],
  );

  const startConfiguring = (profile: HomeMachineProfile, isCustom: boolean) => {
    setScreen({ kind: 'configuring', profile, isCustom });
  };

  const handleTile = (view: MachineTileView) => {
    if (!view.selectable) return;
    if (view.kind === 'not_listed') {
      setScreen({ kind: 'behavior' });
      return;
    }
    if (view.needsDisambiguation) {
      setScreen({ kind: 'disambiguation', tile: view });
      return;
    }
    const profile = view.selectableProfiles[0];
    if (profile !== undefined) startConfiguring(profile, false);
  };

  const handleBehavior = (answer: MachineBehaviorAnswer) => {
    if (answer.technology === 'continuous_soft_serve') {
      // §8.3: the dispenser answer is HONESTLY unsupported for Home — never
      // silently bent onto Ninja Swirl.
      setScreen({ kind: 'unsupported' });
      return;
    }
    setScreen({ kind: 'custom', answer, initialValues: null });
  };

  const handleCustomSubmit = (answer: MachineBehaviorAnswer, values: CustomMachineFormValues) => {
    const input: CustomMachineInput = {
      behaviorAnswerId: answer.id,
      market,
      brand: values.brand,
      model: values.model,
      vesselCapacity: values.vesselCapacity,
      hasMaxFillLine: values.hasMaxFillLine,
      manufacturerMaxMix: values.manufacturerMaxMix,
    };
    const result = buildCustomMachineProfile(input);
    if (result.outcome !== 'profile') {
      setScreen({ kind: 'unsupported' });
      return;
    }
    startConfiguring(result.profile, true);
  };

  const finishConfiguring = (profile: HomeMachineProfile, isCustom: boolean) => {
    const record = buildMachinePreferenceRecord({
      profile,
      isCustom,
      setAt: now(),
      catalogVersion: MACHINE_CATALOG_VERSION,
    });
    // A profile that reached configuring is always Home-supported; stay honest
    // if data ever drifts instead of fabricating a record.
    if (record === null) {
      setScreen({ kind: 'unsupported' });
      return;
    }
    // §4: never finalize without asking — the user adjusts the amount first.
    setScreen({ kind: 'adjust', profile, isCustom, record });
  };

  /** §4 save: the user's own default (or null = follow the recommendation). */
  const finishAdjust = (
    profile: HomeMachineProfile,
    record: MachinePreferenceRecord,
    userDefaultGrams: number | null,
  ) => {
    const stamped = now();
    const recommended = recommendedBatchGramsOf(record);
    // Typing the proposal back is not "an own setting" — it stays null so the
    // record keeps following the recommendation (honest, and restorable).
    const own = userDefaultGrams !== null && userDefaultGrams !== recommended ? userDefaultGrams : null;
    const next = withUserDefaultBatch(record, own, stamped) ?? record;
    onComplete({ record: next, profile, derivation: deriveMachineSetup(profile) });
  };

  /* ----------------------------------------------------------- screens -- */

  if (screen.kind === 'adjust') {
    const derivation = deriveMachineSetup(screen.profile);
    const batch = presentBatchSuggestion(derivation);
    return (
      <MachineAdjustBatchStep
        machineName={machineDisplayName(screen.profile)}
        containerMl={screen.profile.capacity.vesselCapacityMl}
        recommendedGrams={recommendedBatchGramsOf(screen.record)}
        estimatedNote={batch.kind === 'pinguino_grams' ? batch.note : null}
        submitLabel={submitLabel}
        onSubmit={(grams) => finishAdjust(screen.profile, screen.record, grams)}
      />
    );
  }

  if (screen.kind === 'configuring') {
    const derivation = deriveMachineSetup(screen.profile);
    const batch = presentBatchSuggestion(derivation);
    const amountDetail =
      batch.kind === 'pinguino_grams'
        ? `${batch.label}: ${batch.text}${batch.note !== null ? ` (${batch.note})` : ''}`
        : batch.text;
    return (
      <section aria-label={copy.autoConfig.ariaLabel}>
        <h1 className={cn(type.title, color.textPrimary)}>{machineDisplayName(screen.profile)}</h1>
        <AutoConfigTransition
          lines={autoConfigLines(derivation)}
          amountDetail={amountDetail}
          onDone={() => finishConfiguring(screen.profile, screen.isCustom)}
        />
      </section>
    );
  }

  if (screen.kind === 'unsupported') {
    return (
      <section>
        <h1 className={cn(type.title, color.textPrimary)}>{copy.unsupported.title}</h1>
        <p className={cn('mt-3 max-w-prose', type.secondary, color.textSecondary)}>
          {copy.unsupported.body}
        </p>
        <div className="mt-6">
          <TouchButton onClick={() => setScreen({ kind: 'tiles' })}>{copy.unsupported.back}</TouchButton>
        </div>
      </section>
    );
  }

  if (screen.kind === 'behavior') {
    return (
      <section>
        <h1 className={cn(type.title, color.textPrimary)}>{copy.behavior.title}</h1>
        <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>
          {copy.behavior.lead}
        </p>
        <div className="mt-5">
          <MachineBehaviorQuestion onPick={handleBehavior} onBack={() => setScreen({ kind: 'tiles' })} />
        </div>
      </section>
    );
  }

  if (screen.kind === 'custom') {
    return (
      <section>
        <h1 className={cn(type.title, color.textPrimary)}>{copy.custom.title}</h1>
        <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>{copy.custom.lead}</p>
        <div className="mt-5">
          <CustomMachineForm
            initialValues={screen.initialValues}
            vesselOnlyNote={
              screen.answer.technology === 'respin'
                ? copy.custom.vesselOnlyRespinNote
                : copy.custom.vesselOnlyBowlNote
            }
            onSubmit={(values) => handleCustomSubmit(screen.answer, values)}
            onBack={() => setScreen({ kind: 'behavior' })}
          />
        </div>
      </section>
    );
  }

  if (screen.kind === 'disambiguation') {
    return (
      <section>
        <h1 className={cn(type.title, color.textPrimary)}>{copy.tiles.disambiguation.title}</h1>
        <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>
          {copy.tiles.disambiguation.lead}
        </p>
        <div className="mt-5 space-y-3" role="radiogroup" aria-label={copy.tiles.disambiguation.title}>
          {screen.tile.selectableProfiles.map((profile) => (
            <SelectableCard
              key={profile.id}
              title={machineDisplayName(profile)}
              {...(profile.capacity.vesselCapacityMl !== null
                ? { description: copy.contextBar.vessel(profile.capacity.vesselCapacityMl) }
                : {})}
              onSelect={() => startConfiguring(profile, false)}
            />
          ))}
        </div>
        <div className="mt-6">
          <TouchButton variant="quiet" onClick={() => setScreen({ kind: 'tiles' })}>
            {copy.tiles.disambiguation.back}
          </TouchButton>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1 className={cn(type.display, color.textPrimary)}>{copy.intro.title}</h1>
      <p className={cn('mt-3 max-w-prose', type.secondary, color.textSecondary)}>{copy.intro.lead}</p>
      <div className="mt-6">
        <MachineTileGrid
          views={visibleTiles}
          searchValue={search}
          onSearchChange={setSearch}
          onSelect={handleTile}
        />
      </div>
    </section>
  );
}
