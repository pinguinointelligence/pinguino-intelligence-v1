import { useMemo } from 'react';
import { copy } from '@/copy/en';
import { useAuthStore } from '@/stores/authStore';
import { PROFESSIONAL_DEFAULT_BATCH_GRAMS, useRecipeStore } from '@/stores/recipeStore';
import { upsertUserRecipeDefault } from '@/services/userRecipeDefaults';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  listActiveHomeMachines,
  planContainerSplit,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import {
  effectiveDefaultBatchGrams,
  machineDisplayName,
  type MachineOnboardingCompletion,
} from '@/features/machine-onboarding';
import {
  isNewRecipeServingModeId,
  starterServingModeForTemperature,
} from '@/features/recipes/newRecipeStarter';
import { commitRecipeDefaultsAfterRemoteSave } from './accountRecipeDefaultsSave';
import { profileSettingsSignature, useRecipeProfileStore } from './recipeProfileStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';

const professionalLabel = copy.proMachine.professionalLabel;

/** Who owns account defaults here: the signed-in account, or — in a DEV build
 *  only — this device. Production without an account has no defaults owner. */
export const settingsDefaultsOwner = (authenticatedOwner: string | null): string | null =>
  authenticatedOwner ?? (import.meta.env.DEV ? 'local-device' : null);

/**
 * THE rule for „valid saved defaults" (OWNER AUTHORITY 2026-09-02 §8, with the
 * GEL-P0-022 resolution behind `defaultsFor`): the live settings of the open
 * draft are byte-identical to the defaults stored for this product. The panel
 * uses it to confirm an inherited draft by itself; the V3 setup uses the same
 * rule to skip its Steps 2–3. There is no second definition of „valid".
 *
 * Returns the live settings signature when the stored defaults of `owner`
 * (`settingsDefaultsOwner`) cover it — the value `confirmSettings` takes — and
 * null otherwise.
 */
export function signatureCoveredByAccountDefaults(owner: string | null): string | null {
  if (owner === null) return null;
  const recipe = useRecipeStore.getState();
  const profile = useRecipeProfileStore.getState();
  const stored = profile.defaultsFor(`${owner}:${recipe.visibleProductType}`);
  if (!stored) return null;
  const live = profileSettingsSignature(
    profileSnapshotFromState(recipe, recipe.direction_targets, profile.directionIntents),
  );
  return profileSettingsSignature(stored) === live ? live : null;
}

/**
 * The settings AUTHORITY of the open recipe — every handler the settings panel
 * has always used, in one place, so the V3 setup (`ProSetupFlow`) presents the
 * very same fields without a second store, a second write path or a second
 * defaults mechanism. It owns no effects: the draft lifecycle (openDraft,
 * inherited-default confirmation, the published confirmation fact) stays in
 * `WorkbenchSettingsLine`, which is always mounted with the Receptura module.
 */
export function useProSettingsAuthority() {
  const store = useRecipeStore();
  const resizeBatchGrams = useConstraintStudioStore((state) => state.resizeBatchGrams);
  const directionIntents = useRecipeProfileStore((state) => state.directionIntents);
  const confirmSettings = useRecipeProfileStore((state) => state.confirmSettings);
  const saveDefaultsLocal = useRecipeProfileStore((state) => state.saveDefaults);
  const authenticatedOwner = useAuthStore((state) => state.user?.id ?? null);
  const defaultsOwner = settingsDefaultsOwner(authenticatedOwner);
  const activeHomeMachines = useMemo(() => listActiveHomeMachines(MACHINE_CATALOG), []);
  const selectedHome =
    store.machineKind === 'home'
      ? (activeHomeMachines.find((profile) => profile.id === store.machineId) ?? null)
      : null;

  const directionTargets = store.direction_targets;
  const snapshot = profileSnapshotFromState(store, directionTargets, directionIntents);
  const signature = profileSettingsSignature(snapshot);
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

  const hardConflict =
    !Number.isFinite(store.target_batch_grams) ||
    store.target_batch_grams <= 0 ||
    (store.machineKind === 'home' &&
      selectedHome === null &&
      !store.machineId?.startsWith('custom-')) ||
    store.batchResizeConflict !== null;

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

  /** Returns whether the custom machine was taken, so the caller can close its dialog. */
  const selectCustom = (completion: MachineOnboardingCompletion): boolean => {
    const batchGrams = effectiveDefaultBatchGrams(completion.record);
    const servingModeId = completion.derivation.resolvedVisibleMode;
    if (batchGrams === null || servingModeId === null) return false;
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
    return true;
  };

  const machineOptions = [
    'professional',
    ...activeHomeMachines.map((profile) => profile.id),
    'custom',
  ] as const;
  const machineLabelOf = (id: string) =>
    id === 'professional'
      ? professionalLabel
      : id === 'custom'
        ? 'Własna maszyna'
        : machineDisplayName(activeHomeMachines.find((profile) => profile.id === id)!);
  /** The one machine selection door; „Własna maszyna" asks its own dialog first. */
  const selectMachine = (id: string, openCustom: () => void) => {
    if (id === 'professional') selectProfessional();
    else if (id === 'custom') openCustom();
    else {
      const profile = activeHomeMachines.find((candidate) => candidate.id === id);
      if (profile) selectHome(profile);
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

  /** The existing defaults mechanism: remote first, then the local copy. */
  const saveDefaults = () =>
    commitRecipeDefaultsAfterRemoteSave(
      () =>
        authenticatedOwner
          ? upsertUserRecipeDefault(authenticatedOwner, store.visibleProductType, snapshot)
          : Promise.resolve(),
      () => saveDefaultsLocal(`${defaultsOwner}:${store.visibleProductType}`, snapshot),
    );

  /**
   * THE confirmation of the open draft's settings (`confirmSettings`), with the
   * defaults it may carry:
   *
   * - „Ustaw jako domyślne" checked (DESIGN V3.0 correction I / Point 3): the
   *   confirmed settings also become the account defaults for this product,
   *   through the one existing defaults mechanism. The returned promise is
   *   that save.
   * - unchecked: the FIRST-EVER confirmation still establishes the defaults.
   *   A brand-new user has no defaults, so every draft they start arrives
   *   unconfirmed and every session asks the same question again. Their first
   *   confirmation is the moment they say „these are my settings" — so that is
   *   when the defaults are born, without a second control they should not have
   *   to know about. ONLY when nothing is stored yet: confirming a change for
   *   the recipe in front of you must never silently rewrite what every future
   *   recipe starts from. A failed remote write must not cost the customer
   *   their confirmation: the local defaults still stand.
   */
  const confirm = (asDefault: boolean): Promise<void> | null => {
    const identity = useRecipeProfileStore.getState().activeDraftIdentity;
    if (identity === null) return null;
    confirmSettings(signature, identity, store.draftContextSeq);
    if (!defaultsOwner) return null;
    if (asDefault) return saveDefaults();
    const alreadyEstablished = useRecipeProfileStore
      .getState()
      .defaultsFor(`${defaultsOwner}:${store.visibleProductType}`);
    if (alreadyEstablished) return null;
    void saveDefaults().catch(() => undefined);
    return null;
  };

  return {
    store,
    snapshot,
    signature,
    activeServing,
    machineValue,
    machineOptions,
    machineLabelOf,
    activeHomeMachines,
    selectedHome,
    recommendedBatchGrams,
    cyclePlan,
    hardConflict,
    defaultsOwner,
    pickServing,
    selectMachine,
    selectCustom,
    changeStrategy,
    changeBatch,
    confirm,
  };
}

export type ProSettingsAuthority = ReturnType<typeof useProSettingsAuthority>;
