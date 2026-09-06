/**
 * REGRESSION — §16/§42/§44: the HOME machine must survive the starter rebuild.
 *
 * Found in served QA on 2026-08-30. HOME wrote the machine through the canonical
 * `setMachineSelection`, and then generated the first recipe with
 * `rebuildNewRecipeStarter`. That call is deliberately a NEW draft: it replaces the
 * product, the category, every ingredient AND the machine/temperature with the account
 * default. So the user picked "Ninja CREAMi Deluxe", the recipe generated, and the
 * machine silently reverted to Professional — the batch and temperature were right, so
 * nothing looked broken except the label.
 *
 * The fix is ordering, not new logic: assert the machine AFTER the rebuild. This test
 * pins the ORDER, because the two calls are individually correct and only their
 * sequence is wrong.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import { useRecipeStore } from '@/stores/recipeStore';

const ninjaDeluxe = MACHINE_CATALOG.find(
  (profile) => profile.id === 'ninja-creami-deluxe-nc502eu-eu-es',
) as HomeMachineProfile;

/** Exactly what HomeCreatorPage's `applyMachineSelection` does. */
const applyMachine = (profile: HomeMachineProfile) => {
  const setup = deriveMachineSetup(profile, 'sorbet');
  const mode = setup.resolvedVisibleMode;
  const temperatureC = mode ? temperatureForMode(mode) : null;
  if (mode === null || temperatureC === null) throw new Error('machine has no resolved mode');
  useRecipeStore.getState().setMachineSelection({
    kind: 'home',
    servingModeId: mode,
    machineId: profile.id,
    label: machineDisplayName(profile),
    machineTechnology: profile.technology,
    temperatureC,
    batchGrams: setup.recommendedBatchGrams,
    hardCapacityGrams: setup.hardMaximumBatchGrams,
    batchSource: 'MACHINE_DEFAULT',
  });
  return setup;
};

const rebuild = (targetBatchGrams: number) =>
  useRecipeStore.getState().rebuildNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams,
  });

describe('the HOME machine survives the first recipe generation', () => {
  beforeEach(() => {
    useRecipeStore.getState().resetToDemo();
  });

  it('is present', () => {
    expect(ninjaDeluxe).toBeDefined();
  });

  it('REPRODUCES the defect: selecting the machine BEFORE the rebuild loses it', () => {
    const setup = applyMachine(ninjaDeluxe);
    expect(useRecipeStore.getState().machineKind).toBe('home');

    rebuild(setup.recommendedBatchGrams ?? 670);

    // This is the bug, pinned so nobody "simplifies" the ordering back.
    expect(useRecipeStore.getState().machineKind).not.toBe('home');
    expect(useRecipeStore.getState().machineLabel).toBeNull();
  });

  it('keeps the machine when it is asserted AFTER the rebuild', () => {
    const setup = deriveMachineSetup(ninjaDeluxe, 'sorbet');
    rebuild(setup.recommendedBatchGrams ?? 670);
    applyMachine(ninjaDeluxe);

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('home');
    expect(state.machineLabel).toBe(machineDisplayName(ninjaDeluxe));
    expect(state.machineId).toBe(ninjaDeluxe.id);
    // §44: the soft batch comes from machine authority; no ml figure becomes hard grams.
    expect(state.target_batch_grams).toBe(setup.recommendedBatchGrams);
    expect(state.machine_capacity_grams).toBeNull();
    expect(state.homeFormulationModuleId).toBe('FROZEN_PINT');
    expect(state.target_temperature_c).toBe(-11);
    // The starter still produced a real base — the machine did not replace it.
    expect(state.items.length).toBeGreaterThan(0);
  });

  it('leaves a real Sorbet base in place with the machine attached', () => {
    const setup = deriveMachineSetup(ninjaDeluxe, 'sorbet');
    rebuild(setup.recommendedBatchGrams ?? 670);
    applyMachine(ninjaDeluxe);
    const state = useRecipeStore.getState();
    expect(state.visibleProductType).toBe('sorbet');
    expect(state.items.every((item) => item.planned_grams >= 0)).toBe(true);
  });
});
