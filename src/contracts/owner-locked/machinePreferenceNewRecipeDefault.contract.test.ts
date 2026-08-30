/**
 * OWNER-LOCKED — the account's saved machine is the default for a NEW recipe.
 *
 * Two authorities described the same intent and never met. `/machine` writes a
 * `MachinePreferenceRecord`; `startNewRecipe` reads `useRecipeProfileStore`
 * (backed by `user_recipe_defaults`). An account that had only ever set its
 * machine had no recipe default at all, so every new recipe fell through to
 * Professional 1000 g and the saved machine was never consulted.
 *
 * These tests drive the REAL stores and the REAL machine registry end to end.
 * No machine id and no batch figure is written by hand: the expected machine is
 * looked up in `MACHINE_CATALOG` and its expected grams come from
 * `deriveMachineSetup`, so the contract cannot drift away from the catalogue
 * while still passing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MACHINE_CATALOG, deriveMachineSetup } from '@/features/machine-catalog';
import { buildMachinePreferenceRecord } from '@/features/machine-onboarding/preferenceContracts';
import { machineAccountDefaultSnapshot } from '@/features/pro-workbench/machineAccountDefault';
import { machineEducationForSelection } from '@/features/education';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore, PROFESSIONAL_DEFAULT_BATCH_GRAMS } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { VisibleProductType } from '@/features/studio/productType';

const OWNER = 'owner-machine-default';

const catalogProfile = (id: string) => {
  const profile = MACHINE_CATALOG.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`machine ${id} is no longer in the catalogue`);
  return profile;
};

const DELUXE_ID = 'ninja-creami-deluxe-nc502eu-eu-es';
const OTHER_HOME_ID = 'ninja-creami-nc302eu-eu-es';

const recordFor = (machineId: string) => {
  const record = buildMachinePreferenceRecord({
    profile: catalogProfile(machineId),
    isCustom: false,
    setAt: '2026-08-30T09:00:00.000Z',
    catalogVersion: 'test',
  });
  if (record === null) throw new Error(`${machineId} cannot be a home machine preference`);
  return record;
};

/** What the registry says this machine should propose for this product. */
const expectedGrams = (machineId: string, product: VisibleProductType): number => {
  const grams = deriveMachineSetup(catalogProfile(machineId), product).recommendedBatchGrams;
  if (grams === null) throw new Error(`${machineId} has no recommendation for ${product}`);
  return grams;
};

const publishPreference = (machineId: string | null) => {
  const record = machineId === null ? null : recordFor(machineId);
  useRecipeProfileStore
    .getState()
    .setMachineAccountDefault(
      OWNER,
      record === null
        ? null
        : (visibleProductType) => machineAccountDefaultSnapshot(record, visibleProductType),
    );
};

describe('OWNER-LOCKED — saved machine preference is the NEW-recipe default', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useRecipeProfileStore.getState().resetForTests();
    useRecipeProfileStore.getState().setMachineAccountDefault(null, null);
  });

  it('1. a saved Deluxe opens a NEW recipe on the Deluxe, at its own grams', () => {
    publishPreference(DELUXE_ID);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    const grams = expectedGrams(DELUXE_ID, 'gelato');
    expect(state.machineKind).toBe('home');
    expect(state.machineId).toBe(DELUXE_ID);
    expect(state.machineLabel).toBeTruthy();
    expect(state.target_batch_grams).toBe(grams);
    expect(state.machine_capacity_grams).toBe(grams);
    expect(state.batch_source).toBe('MACHINE_DEFAULT');
    // The owner's canonical Deluxe authority: 706 ml manufacturer container
    // resolves to 670 g. Pinned so a silent catalogue drift is visible here.
    expect(grams).toBe(670);
  });

  it('2. reopening the NEW draft keeps the Deluxe — the preference is not one-shot', () => {
    publishPreference(DELUXE_ID);
    useRecipeStore.getState().startNewRecipe('gelato');
    const first = useRecipeStore.getState().target_batch_grams;

    // A refresh re-runs the sign-in bridge and starts the draft again.
    useRecipeStore.getState().startNewRecipe('gelato');
    const second = useRecipeStore.getState();
    expect(second.machineId).toBe(DELUXE_ID);
    expect(second.target_batch_grams).toBe(first);
    expect(second.batch_source).toBe('MACHINE_DEFAULT');
  });

  it('3. no saved preference keeps the Professional fallback exactly as it is', () => {
    publishPreference(null);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBeNull();
    expect(state.machineId).toBeNull();
    expect(state.target_batch_grams).toBe(PROFESSIONAL_DEFAULT_BATCH_GRAMS);
    expect(state.machine_capacity_grams).toBeNull();
    expect(state.batch_source).toBe('PROFESSIONAL_DEFAULT');
  });

  it('4. changing the preference to another home machine moves the NEXT new recipe', () => {
    publishPreference(DELUXE_ID);
    useRecipeStore.getState().startNewRecipe('gelato');
    expect(useRecipeStore.getState().machineId).toBe(DELUXE_ID);

    publishPreference(OTHER_HOME_ID);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineId).toBe(OTHER_HOME_ID);
    expect(state.target_batch_grams).toBe(expectedGrams(OTHER_HOME_ID, 'gelato'));
    expect(state.batch_source).toBe('MACHINE_DEFAULT');
  });

  it('5. Production reads the same machine context as the recipe', () => {
    publishPreference(DELUXE_ID);
    useRecipeStore.getState().startNewRecipe('gelato');

    // `useProductionWorkspace` builds its machine guide straight from these
    // three recipe fields, so proving them proves the Production context.
    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('home');
    expect(machineEducationForSelection(state.machineId, state.machineTechnology)).not.toBeNull();
  });

  it('6. a stored per-product default does NOT keep an old machine alive', () => {
    /* The reopened bug, reduced. `pro@pro.com` carried a `user_recipe_defaults`
       row written on 2026-08-14 — machineKind 'professional', 1000 g — and once
       a stored default outranked the machine preference, saving ANY home
       machine left every new recipe on Professional 1000 g. The saved machine
       is the customer's statement about the machine they own; the stored row is
       a months-old snapshot of a recipe. */
    useRecipeProfileStore.getState().saveDefaults(`${OWNER}:gelato`, {
      visibleProductType: 'gelato',
      mode: 'classic',
      targetBatchGrams: PROFESSIONAL_DEFAULT_BATCH_GRAMS,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Maszyna profesjonalna',
      servingModeId: 'temp_minus_11',
      targetTemperatureC: -11,
      machineCapacityGrams: null,
      directionTargets: { sweetness: 1, softness: -1, creaminess: 0, flavor: 0 },
    });
    publishPreference(DELUXE_ID);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('home');
    expect(state.machineId).toBe(DELUXE_ID);
    expect(state.target_batch_grams).toBe(expectedGrams(DELUXE_ID, 'gelato'));
    expect(state.batch_source).toBe('MACHINE_DEFAULT');
    // The stored default keeps everything that is NOT a machine fact.
    expect(state.direction_targets).toEqual({
      sweetness: 1,
      softness: -1,
      creaminess: 0,
      flavor: 0,
    });
  });

  it('6b. a stored default with no machine preference is untouched', () => {
    useRecipeProfileStore.getState().saveDefaults(`${OWNER}:gelato`, {
      visibleProductType: 'gelato',
      mode: 'classic',
      targetBatchGrams: PROFESSIONAL_DEFAULT_BATCH_GRAMS,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Maszyna profesjonalna',
      servingModeId: 'temp_minus_11',
      targetTemperatureC: -11,
      machineCapacityGrams: null,
      directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    });
    publishPreference(null);
    useRecipeStore.getState().startNewRecipe('gelato');

    const state = useRecipeStore.getState();
    expect(state.machineKind).toBe('professional');
    expect(state.target_batch_grams).toBe(PROFESSIONAL_DEFAULT_BATCH_GRAMS);
  });

  it('7. the fallback answers only this owner, and only product-scoped keys', () => {
    publishPreference(DELUXE_ID);
    const profile = useRecipeProfileStore.getState();
    // The bare legacy owner key must stay unanswered: `startNewRecipe` compares
    // its `visibleProductType`, and a machine preference has no product.
    expect(profile.defaultsFor(OWNER)).toBeNull();
    expect(profile.defaultsFor('someone-else:gelato')).toBeNull();
    expect(profile.defaultsFor(`${OWNER}:gelato`)).not.toBeNull();
  });

  it('8. a saved Professional recipe reopens Professional, preference or not', () => {
    publishPreference(DELUXE_ID);
    const saved = {
      ...DEFAULT_PRESET,
      machine_capacity_grams: null,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    };
    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'recipe-historical',
      savedName: 'Historical Professional recipe',
      versionNumber: 1,
      versionId: 'version-historical',
      versionDate: '2026-08-01T10:00:00.000Z',
    });

    // Rule 1: the saved recipe's own machine and batch win. A saved version
    // reads no account default at all, so the Deluxe preference cannot reach it.
    const state = useRecipeStore.getState();
    expect(state.machineId).not.toBe(DELUXE_ID);
    expect(state.machineKind).not.toBe('home');
    expect(state.target_batch_grams).toBe(saved.target_batch_grams);
  });

  it('9. the machine preference carries no Direction and no strategy opinion', () => {
    const snapshot = machineAccountDefaultSnapshot(recordFor(DELUXE_ID), 'gelato');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.directionTargets).toEqual({
      sweetness: 0,
      softness: 0,
      creaminess: 0,
      flavor: 0,
    });
    publishPreference(DELUXE_ID);
    useRecipeStore.getState().startNewRecipe('gelato');
    expect(useRecipeStore.getState().direction_targets).toEqual({
      sweetness: 0,
      softness: 0,
      creaminess: 0,
      flavor: 0,
    });
  });
});

/**
 * The full canonical matrix. Every machine the runtime exposes is exercised —
 * the list is read from `MACHINE_CATALOG`, so a machine added tomorrow is
 * covered without editing this file, and one removed cannot leave a silent gap.
 */
describe('OWNER-LOCKED — every canonical machine becomes the NEW-recipe default', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useRecipeProfileStore.getState().resetForTests();
    useRecipeProfileStore.getState().setMachineAccountDefault(null, null);
  });

  it('covers the whole registry, not a hand-picked subset', () => {
    expect(MACHINE_CATALOG.length).toBeGreaterThanOrEqual(10);
    expect(MACHINE_CATALOG.every((profile) => profile.active)).toBe(true);
  });

  for (const profile of MACHINE_CATALOG) {
    it(`${profile.id} — saved, new recipe, stale default, refresh, Production`, () => {
      const grams = expectedGrams(profile.id, 'gelato');

      // A stale Professional row, exactly the shape that reopened this bug.
      useRecipeProfileStore.getState().saveDefaults(`${OWNER}:gelato`, {
        visibleProductType: 'gelato',
        mode: 'classic',
        targetBatchGrams: PROFESSIONAL_DEFAULT_BATCH_GRAMS,
        machineKind: 'professional',
        machineId: null,
        machineLabel: 'Maszyna profesjonalna',
        servingModeId: 'temp_minus_11',
        targetTemperatureC: -11,
        machineCapacityGrams: null,
        directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      });
      publishPreference(profile.id);

      useRecipeStore.getState().startNewRecipe('gelato');
      const first = useRecipeStore.getState();
      expect(first.machineKind).toBe('home');
      expect(first.machineId).toBe(profile.id);
      expect(first.target_batch_grams).toBe(grams);
      expect(first.machine_capacity_grams).toBe(grams);
      expect(first.batch_source).toBe('MACHINE_DEFAULT');
      // The Base actually realizes the machine batch — not just a label.
      expect(first.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(grams);

      // „+ Nowa receptura" again — the preference is not consumed once.
      useRecipeStore.getState().startNewRecipe('gelato');
      const second = useRecipeStore.getState();
      expect(second.machineId).toBe(profile.id);
      expect(second.target_batch_grams).toBe(grams);

      // Production reads these three fields and nothing else for its machine.
      expect(machineEducationForSelection(second.machineId, second.machineTechnology)).not.toBeNull();
    });
  }

  it('is product-aware: a machine that differs by product keeps its own number', () => {
    // Magimix proposes a different sorbet batch. Whichever machine carries a
    // per-product difference, the snapshot must follow the registry, not one
    // remembered figure.
    const differing = MACHINE_CATALOG.filter(
      (profile) => expectedGrams(profile.id, 'sorbet') !== expectedGrams(profile.id, 'gelato'),
    );
    expect(differing.length).toBeGreaterThan(0);
    for (const profile of differing) {
      publishPreference(profile.id);
      useRecipeStore.getState().startNewRecipe('sorbet');
      expect(useRecipeStore.getState().target_batch_grams).toBe(
        expectedGrams(profile.id, 'sorbet'),
      );
    }
  });

  it('account isolation: another account never inherits this machine', () => {
    publishPreference(DELUXE_ID);
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'a-different-account', email: null, displayName: null },
      available: true,
    });
    useRecipeStore.getState().startNewRecipe('gelato');
    const state = useRecipeStore.getState();
    expect(state.machineId).toBeNull();
    expect(state.target_batch_grams).toBe(PROFESSIONAL_DEFAULT_BATCH_GRAMS);
  });
});
