/**
 * RESTORATION #2 — batch lifecycle coherence.
 *
 * Owner P0 (served): a lifecycle load could adopt an account/product DEFAULT
 * target batch, keep the loaded recipe's OLD grams, write `batchResizeConflict:
 * null` and present the result as an authoritative recipe — the reported
 * `400 / 1000` and `982 / 950` states.
 *
 * The contract proved here: at every stable initialized state
 *   displayed Partia == target batch == actual Base sum
 * and no manual/stale batch from a previous recipe leaks into a new one.
 *
 * First bad commit: `c6a0ab1b` (2026-08-09) introduced the non-saved
 * `defaultsFor(...)` adoption in `loadRecipeInput` feeding `profileFields`,
 * which wrote `target_batch_grams` without resizing the Base.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  attachRecipeProfileMetadata,
  profileSnapshotFromState,
} from '@/features/pro-workbench/recipeProfilePersistence';
import {
  DEFAULT_DIRECTION_TARGETS,
  useRecipeProfileStore,
  type ProfileSettingsSnapshot,
} from '@/features/pro-workbench/recipeProfileStore';
import {
  MAGIMIX_GELATO_EXPERT,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_NC302EU,
  deriveMachineSetup,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding';
import {
  changeProRecipeProductType,
  startNewProRecipe,
} from '@/pages/destinations/startNewProRecipe';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { sorbetMultiMainBase } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';
import {
  BATCH_RESIZE_TOLERANCE_GRAMS,
  PROFESSIONAL_DEFAULT_BATCH_GRAMS,
  useRecipeStore,
  type RecipeBatchSource,
} from './recipeStore';

const baseSum = () =>
  useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0);

/** Partia == target == Base sum, proved through the Engine as well as the store. */
const expectCoherent = (grams: number, source: RecipeBatchSource) => {
  const state = useRecipeStore.getState();
  expect(state.target_batch_grams).toBe(grams);
  expect(Math.abs(baseSum() - grams)).toBeLessThanOrEqual(BATCH_RESIZE_TOLERANCE_GRAMS);
  expect(
    Math.abs(calculateRecipe(buildRecipeInput(state)).total_batch_g - grams),
  ).toBeLessThanOrEqual(BATCH_RESIZE_TOLERANCE_GRAMS);
  expect(state.batch_source).toBe(source);
  expect(state.batchResizeConflict).toBeNull();
};

const selectHome = (profile: HomeMachineProfile) => {
  const state = useRecipeStore.getState();
  const setup = deriveMachineSetup(profile, state.visibleProductType);
  if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) {
    throw new Error(`incomplete profile: ${profile.id}`);
  }
  return state.setMachineSelection({
    kind: 'home',
    servingModeId: setup.resolvedVisibleMode,
    machineId: profile.id,
    label: machineDisplayName(profile),
    temperatureC: profile.resolvedVisibleMode === 'ninja_gelato' ? -13 : -11,
    batchGrams: setup.recommendedBatchGrams,
    capacityGrams: setup.recommendedBatchGrams,
    batchSource: 'MACHINE_DEFAULT',
  });
};

/** Exactly what the Settings line does for "Maszyna profesjonalna". */
const selectProfessional = () =>
  useRecipeStore.getState().setMachineSelection({
    kind: 'professional',
    servingModeId: 'fresh',
    machineId: null,
    label: 'Maszyna profesjonalna',
    temperatureC: -11,
    batchGrams: PROFESSIONAL_DEFAULT_BATCH_GRAMS,
    capacityGrams: null,
    batchSource: 'PROFESSIONAL_DEFAULT',
  });

/** Exactly what Account Recipe Defaults stores: a snapshot of a recipe state. */
const storeAccountDefault = (): ProfileSettingsSnapshot => {
  const settings = profileSnapshotFromState(
    useRecipeStore.getState(),
    useRecipeStore.getState().direction_targets,
  );
  useRecipeProfileStore.getState().saveDefaults('local-device:gelato', settings);
  return settings;
};

const savedPayload = () =>
  structuredClone(
    attachRecipeProfileMetadata(
      buildRecipeInput(useRecipeStore.getState()),
      profileSnapshotFromState(useRecipeStore.getState(), DEFAULT_DIRECTION_TARGETS),
    ),
  );

describe('RESTORATION #2 — a lifecycle load never writes an incoherent batch', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().startNewRecipe('gelato');
  });

  it('reproduces the owner 400 / 1000 state and proves it is gone', () => {
    // A real 400 g Professional recipe, then an account default of 1000 g.
    useRecipeStore.getState().setBatchGrams(400);
    expectCoherent(400, 'PROFESSIONAL_USER_BATCH');
    const payload = structuredClone(buildRecipeInput(useRecipeStore.getState()));

    useRecipeStore.getState().startNewRecipe('gelato');
    const stored = storeAccountDefault();
    expect(stored.targetBatchGrams).toBe(1000);

    // NON-SAVED load: the default batch may win, but only WITH its Base.
    useRecipeStore.getState().loadRecipeInput(payload);
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('reproduces the owner 982 / 950 shape: a Home default over a larger draft', () => {
    selectHome(MAGIMIX_GELATO_EXPERT);
    expectCoherent(950, 'MACHINE_DEFAULT');
    storeAccountDefault();

    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setBatchGrams(982);
    const payload = structuredClone(buildRecipeInput(useRecipeStore.getState()));

    useRecipeStore.getState().loadRecipeInput(payload);
    expectCoherent(950, 'MACHINE_DEFAULT');
  });

  it('keeps every ratio, lock and identity while adopting the default batch', () => {
    useRecipeStore.getState().setBatchGrams(400);
    const payload = structuredClone(buildRecipeInput(useRecipeStore.getState()));
    const sourceShares = payload.items.map((item) => item.planned_grams / 400);

    useRecipeStore.getState().startNewRecipe('gelato');
    storeAccountDefault();
    useRecipeStore.getState().loadRecipeInput(payload);

    const loaded = useRecipeStore.getState().items;
    expect(loaded.map((item) => item.id)).toEqual(payload.items.map((item) => item.id));
    loaded.forEach((item, index) => {
      expect(item.planned_grams / 1000).toBeCloseTo(sourceShares[index]!, 8);
    });
  });

  it('never adopts a default it cannot realize — it keeps the coherent recipe instead', () => {
    // A gram-locked line larger than the account default makes the resize
    // impossible. The previous code wrote target=100 next to ~1000 g of Base.
    useRecipeStore.getState().setBatchGrams(400);
    const payload = structuredClone(buildRecipeInput(useRecipeStore.getState()));
    const first = payload.items[0]!;
    first.lock_type = 'grams';
    first.grams_constraint = { grams: first.planned_grams };

    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setBatchGrams(10);
    storeAccountDefault();

    useRecipeStore.getState().loadRecipeInput(payload);
    // The impossible default is refused; the recipe keeps its own coherent batch.
    expectCoherent(400, 'PROFESSIONAL_USER_BATCH');
  });
});

describe('RESTORATION #2 — owner regression matrix', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().startNewRecipe('gelato');
  });

  it('1. Professional 1000 -> manual 400 -> New Recipe = 1000', () => {
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
    useRecipeStore.getState().setBatchGrams(400);
    expectCoherent(400, 'PROFESSIONAL_USER_BATCH');
    startNewProRecipe();
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('2. Professional manual 3000 -> temperature change preserves 3000', () => {
    useRecipeStore.getState().setBatchGrams(3000);
    expectCoherent(3000, 'PROFESSIONAL_USER_BATCH');
    useRecipeStore.getState().setTargetTemperature(-13);
    expectCoherent(3000, 'PROFESSIONAL_USER_BATCH');
    useRecipeStore.getState().setTargetTemperature(-12);
    expectCoherent(3000, 'PROFESSIONAL_USER_BATCH');
  });

  it('3. Professional 3000 -> save -> reopen SAME recipe = 3000', () => {
    useRecipeStore.getState().setBatchGrams(3000);
    const saved = savedPayload();
    // An account default of 1000 g must not touch a reopened saved recipe.
    useRecipeStore.getState().startNewRecipe('gelato');
    storeAccountDefault();
    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'professional-3000',
      savedName: 'Professional 3000 g',
      versionNumber: 1,
    });
    expectCoherent(3000, 'PROFESSIONAL_USER_BATCH');
  });

  it('4. Professional 3000 -> New Recipe = 1000', () => {
    useRecipeStore.getState().setBatchGrams(3000);
    startNewProRecipe();
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('5. Ninja canonical default -> Professional = 1000', () => {
    selectHome(NINJA_CREAMI_NC302EU);
    expectCoherent(450, 'MACHINE_DEFAULT');
    selectProfessional();
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('6. Deluxe canonical default -> Professional = 1000', () => {
    selectHome(NINJA_CREAMI_DELUXE_NC502EU);
    expectCoherent(670, 'MACHINE_DEFAULT');
    selectProfessional();
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('7. Custom 700 -> New Professional recipe = 1000', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'fresh',
      machineId: 'custom-unspecified',
      label: 'Własna maszyna',
      temperatureC: -11,
      batchGrams: null,
      capacityGrams: null,
      machineTechnology: 'compressor',
    });
    useRecipeStore.getState().setBatchGrams(700, undefined, 'CUSTOM_MACHINE_BATCH');
    expectCoherent(700, 'CUSTOM_MACHINE_BATCH');
    startNewProRecipe();
    selectProfessional();
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('8. Magimix machine default -> profile switch to Sorbet stays canonical', () => {
    selectHome(MAGIMIX_GELATO_EXPERT);
    expectCoherent(950, 'MACHINE_DEFAULT');
    changeProRecipeProductType('sorbet');
    expect(useRecipeStore.getState().visibleProductType).toBe('sorbet');
    expectCoherent(1240, 'MACHINE_DEFAULT');
  });

  it('9. manual Magimix override survives profile and temperature changes', () => {
    selectHome(MAGIMIX_GELATO_EXPERT);
    useRecipeStore.getState().setBatchGrams(1100);
    expectCoherent(1100, 'USER_OVERRIDE');
    changeProRecipeProductType('sorbet');
    expectCoherent(1100, 'USER_OVERRIDE');
    useRecipeStore.getState().setTargetTemperature(-12);
    expectCoherent(1100, 'USER_OVERRIDE');
  });

  it('10. New Recipe after a manual Magimix state returns to fresh semantics', () => {
    selectHome(MAGIMIX_GELATO_EXPERT);
    useRecipeStore.getState().setBatchGrams(1100);
    expectCoherent(1100, 'USER_OVERRIDE');
    // No account default was deliberately stored, so the fresh draft is the
    // canonical Professional one — the previous recipe's 1100 g cannot ride in.
    startNewProRecipe();
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });
});

describe('RESTORATION #2 — Sorbet differential (science is NOT the cause)', () => {
  const scaled = (input: RecipeInput, factor: number): RecipeInput => ({
    ...input,
    items: input.items.map((item) => ({ ...item, planned_grams: item.planned_grams * factor })),
  });

  const coherent = () => sorbetMultiMainBase(-13, [2, 1]);
  /** The corrupted lifecycle state: Base at 40 % while target still claims 1000 g. */
  const corrupted = (): RecipeInput => ({
    ...scaled(coherent(), 0.4),
    target_batch_grams: coherent().target_batch_grams,
  });

  it('proves the Sorbet composition model is untouched by the batch corruption', () => {
    const a = calculateRecipe(corrupted());
    const b = calculateRecipe(coherent());
    // Identical science: the corruption scales mass, not composition.
    expect(a.pod_points).toBeCloseTo(b.pod_points!, 9);
    expect(a.pac_points).toBeCloseTo(b.pac_points!, 9);
    expect(a.npac_points).toBeCloseTo(b.npac_points!, 9);
    expect(a.ice_fraction_percent).toBeCloseTo(b.ice_fraction_percent!, 9);
    expect(Object.keys(a.percentages)).toEqual(Object.keys(b.percentages));
    for (const [metric, value] of Object.entries(a.percentages)) {
      // Equal to float noise: scaling the mass cannot move a composition share.
      expect(value, metric).toBeCloseTo(b.percentages[metric as keyof typeof b.percentages], 9);
    }
    expect(detectViolations(a)).toHaveLength(0);
    expect(detectViolations(b)).toHaveLength(0);
  });

  it('proves the failure is the batch gate, which only the corrupted state trips', () => {
    // The owner-reported Sorbet symptom is this gate, not a band or a solver.
    const bad = practicalizeRecipeCandidate(corrupted(), { byLineId: {} });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('batch_residual_unresolved');
    expect(practicalizeRecipeCandidate(coherent(), { byLineId: {} }).ok).toBe(true);
  });

  it('proves the owner-visible Main share is only wrong while the batch is incoherent', () => {
    const mainGrams = (input: RecipeInput) =>
      input.items.filter((i) => i.lock_type === 'main').reduce((s, i) => s + i.planned_grams, 0);
    const bad = corrupted();
    expect((mainGrams(bad) / bad.target_batch_grams) * 100).toBeCloseTo(24, 6);
    const good = coherent();
    expect((mainGrams(good) / good.target_batch_grams) * 100).toBeCloseTo(60, 6);
  });
});

describe('RESTORATION #2 — a legitimate dirty draft is still allowed to differ', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().startNewRecipe('gelato');
  });

  it('keeps a manual gram edit as a truthful dirty draft, never auto-resizing it', () => {
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
    const [first] = useRecipeStore.getState().items;
    useRecipeStore.getState().setPlannedGrams(first!.id, first!.planned_grams + 1);

    const state = useRecipeStore.getState();
    // The target is untouched and the Base is honestly 1001 — a dirty draft the
    // UI marks as changed and Recalculate reconciles. This is NOT the P0.
    expect(state.target_batch_grams).toBe(1000);
    expect(baseSum()).toBeCloseTo(1001, 6);
    expect(state.dirty).toBe(true);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });
});
