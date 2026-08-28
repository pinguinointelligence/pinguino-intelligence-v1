import { beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  CUISINART_ICE21E,
  CUISINART_ICE30BCE,
  CUISINART_ICE100E,
  KITCHENAID_5KSMICM,
  MAGIMIX_GELATO_EXPERT,
  MOULINEX_FREEZI_MJ803AF0,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_NC302EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  SAGE_SMART_SCOOP_BCI600,
  deriveMachineSetup,
  planContainerSplit,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding';
import { changeProRecipeProductType } from '@/pages/destinations/startNewProRecipe';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  attachRecipeProfileMetadata,
  profileSnapshotFromState,
} from '@/features/pro-workbench/recipeProfilePersistence';
import { DEFAULT_DIRECTION_TARGETS } from '@/features/pro-workbench/recipeProfileStore';
import { machineEducationForSelection } from '@/features/education';
import {
  BATCH_RESIZE_TOLERANCE_GRAMS,
  recipePersistPartialize,
  resizeRecipeBatch,
  useRecipeStore,
  type RecipeBatchSource,
} from './recipeStore';

const baseSum = () =>
  useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0);

const select = (profile: HomeMachineProfile) => {
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

const expectCoherent = (grams: number, source: RecipeBatchSource) => {
  const state = useRecipeStore.getState();
  expect(state.target_batch_grams).toBe(grams);
  expect(Math.abs(baseSum() - grams)).toBeLessThanOrEqual(BATCH_RESIZE_TOLERANCE_GRAMS);
  expect(state.batch_source).toBe(source);
  expect(state.batchResizeConflict).toBeNull();
};

describe('canonical machine/manual batch coherence', () => {
  beforeEach(() => {
    useRecipeStore.getState().startNewRecipe('gelato');
  });

  it('executes the exact owner machine sequence with immediate Partia = Base sum', () => {
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'fresh',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -11,
    });
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');

    for (const [profile, grams] of [
      [NINJA_CREAMI_NC302EU, 450],
      [NINJA_CREAMI_DELUXE_NC502EU, 670],
      [NINJA_CREAMI_SCOOP_SWIRL_NC7, 460],
      [MOULINEX_FREEZI_MJ803AF0, 950],
      [SAGE_SMART_SCOOP_BCI600, 950],
      [MAGIMIX_GELATO_EXPERT, 950],
      [CUISINART_ICE100E, 1430],
      [KITCHENAID_5KSMICM, 1330],
      [CUISINART_ICE21E, 1330],
      [CUISINART_ICE30BCE, 1900],
    ] as const) {
      expect(select(profile)).toEqual({ ok: true });
      expectCoherent(grams, 'MACHINE_DEFAULT');
      expect(useRecipeStore.getState().machine_capacity_grams).toBe(grams);
    }
  });

  it('proves Magimix machine-default switching and manual-override preservation', () => {
    select(MAGIMIX_GELATO_EXPERT);
    expectCoherent(950, 'MACHINE_DEFAULT');

    changeProRecipeProductType('sorbet');
    expect(useRecipeStore.getState().visibleProductType).toBe('sorbet');
    expectCoherent(1240, 'MACHINE_DEFAULT');

    useRecipeStore.getState().setBatchGrams(1100);
    expectCoherent(1100, 'USER_OVERRIDE');

    changeProRecipeProductType('gelato');
    expectCoherent(1100, 'USER_OVERRIDE');

    select(MAGIMIX_GELATO_EXPERT);
    expectCoherent(950, 'MACHINE_DEFAULT');
  });

  it('uses the same resize authority for the exact independent manual-batch sequence', () => {
    for (const grams of [450, 950, 1330, 1000]) {
      expect(useRecipeStore.getState().setBatchGrams(grams)).toEqual({ ok: true });
      expectCoherent(grams, 'PROFESSIONAL_USER_BATCH');
    }
  });

  it('reopens an explicitly saved Professional user batch while every fresh Professional recipe returns to 1000 g', () => {
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
    expect(useRecipeStore.getState().setBatchGrams(3000)).toEqual({ ok: true });
    expectCoherent(3000, 'PROFESSIONAL_USER_BATCH');

    const saved = attachRecipeProfileMetadata(
      buildRecipeInput(useRecipeStore.getState()),
      profileSnapshotFromState(useRecipeStore.getState(), DEFAULT_DIRECTION_TARGETS),
    );
    useRecipeStore.getState().loadRecipeInput(structuredClone(saved), {
      savedId: 'professional-3000',
      savedName: 'Professional 3000 g',
      versionNumber: 1,
    });
    expectCoherent(3000, 'PROFESSIONAL_USER_BATCH');

    useRecipeStore.getState().startNewRecipe('gelato');
    expectCoherent(1000, 'PROFESSIONAL_DEFAULT');
  });

  it('keeps machine working batch fixed and derives three informational cycles for 1000 g', () => {
    select(NINJA_CREAMI_NC302EU);
    expect(useRecipeStore.getState().machine_capacity_grams).toBe(450);
    expect(useRecipeStore.getState().setBatchGrams(1000)).toEqual({ ok: true });
    expectCoherent(1000, 'USER_OVERRIDE');
    expect(useRecipeStore.getState().machine_capacity_grams).toBe(450);
    expect(planContainerSplit(1000, 450)).toEqual({
      containers: 3,
      gramsPerContainer: 333.3,
      totalGrams: 1000,
      withinSingleContainer: false,
    });
  });

  it('custom machine starts unset, rejects zero, then persists a coherent custom batch', () => {
    const selected = useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'fresh',
      machineId: 'custom-unspecified',
      label: 'Własna maszyna',
      temperatureC: -11,
      batchGrams: null,
      capacityGrams: null,
      machineTechnology: 'compressor',
    });
    expect(selected).toEqual({ ok: true });
    expect(useRecipeStore.getState().batch_source).toBe('PROFESSIONAL_DEFAULT');
    expect(useRecipeStore.getState().setBatchGrams(0, undefined, 'CUSTOM_MACHINE_BATCH')).toEqual({
      ok: false,
      conflict: expect.objectContaining({ reason: 'invalid_target' }),
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(1000);

    expect(useRecipeStore.getState().setBatchGrams(700, undefined, 'CUSTOM_MACHINE_BATCH')).toEqual(
      { ok: true },
    );
    expectCoherent(700, 'CUSTOM_MACHINE_BATCH');
    expect(useRecipeStore.getState().machine_capacity_grams).toBe(700);

    const persisted = JSON.parse(
      JSON.stringify(recipePersistPartialize(useRecipeStore.getState())),
    );
    expect(persisted.batch_source).toBe('CUSTOM_MACHINE_BATCH');
    expect(persisted.machineId).toBe('custom-unspecified');
    expect(persisted.target_batch_grams).toBe(700);

    const saved = attachRecipeProfileMetadata(
      buildRecipeInput(useRecipeStore.getState()),
      profileSnapshotFromState(useRecipeStore.getState(), DEFAULT_DIRECTION_TARGETS),
    );
    useRecipeStore.getState().loadRecipeInput(structuredClone(saved));
    expectCoherent(700, 'CUSTOM_MACHINE_BATCH');
    expect(useRecipeStore.getState()).toMatchObject({
      machineId: 'custom-unspecified',
      machineLabel: 'Własna maszyna',
      machineTechnology: 'compressor',
      machine_capacity_grams: 700,
    });
    expect(
      machineEducationForSelection(
        useRecipeStore.getState().machineId,
        useRecipeStore.getState().machineTechnology,
      )?.category,
    ).toBe('compressor');
  });
});

describe('one atomic batch resize authority — locks, Main and toppings', () => {
  const ingredient = (id: string) => {
    const value = findDemoIngredient(id);
    if (!value) throw new Error(`missing ${id}`);
    return value;
  };

  it('scales unlocked rows, fixes gram locks, preserves percent locks and Main ratios', () => {
    const items = [
      {
        id: 'main-a',
        ingredient: ingredient('milk_3_5'),
        planned_grams: 300,
        actual_grams: null,
        lock_type: 'main' as const,
        main_ratio_weight: 3,
      },
      {
        id: 'main-b',
        ingredient: ingredient('cream_30'),
        planned_grams: 100,
        actual_grams: null,
        lock_type: 'main' as const,
        main_ratio_weight: 1,
      },
      {
        id: 'grams',
        ingredient: ingredient('sucrose'),
        planned_grams: 100,
        actual_grams: null,
        lock_type: 'grams' as const,
        grams_constraint: { grams: 100 },
      },
      {
        id: 'percent',
        ingredient: ingredient('dextrose'),
        planned_grams: 100,
        actual_grams: null,
        lock_type: 'percent' as const,
        percent_constraint: { percent: 10 },
      },
      {
        id: 'free',
        ingredient: ingredient('smp'),
        planned_grams: 400,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
    ];
    const result = resizeRecipeBatch(items, 1000, 1500);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const grams = Object.fromEntries(result.items.map((item) => [item.id, item.planned_grams]));
    expect(grams.grams).toBe(100);
    expect(grams.percent).toBe(150);
    expect(grams['main-a']! / grams['main-b']!).toBe(3);
    expect(result.items.filter((item) => item.lock_type === 'main').map((item) => item.id)).toEqual(
      ['main-a', 'main-b'],
    );
    expect(result.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(1500, 8);
  });

  it('rejects an impossible locked target atomically and never writes target-only state', () => {
    useRecipeStore.setState({
      target_batch_grams: 1000,
      items: [
        {
          id: 'locked',
          ingredient: ingredient('milk_3_5'),
          planned_grams: 800,
          actual_grams: null,
          lock_type: 'grams',
          grams_constraint: { grams: 800 },
        },
        {
          id: 'free',
          ingredient: ingredient('smp'),
          planned_grams: 200,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
      batchResizeConflict: null,
    });
    const before = structuredClone(useRecipeStore.getState().items);
    const result = useRecipeStore.getState().setBatchGrams(700);
    expect(result).toEqual({
      ok: false,
      conflict: expect.objectContaining({ reason: 'fixed_locks_exceed_target', targetGrams: 700 }),
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(1000);
    expect(useRecipeStore.getState().items).toEqual(before);
    expect(useRecipeStore.getState().batchResizeConflict?.reason).toBe('fixed_locks_exceed_target');
  });

  it('never resizes POST_PROCESS_ADDON toppings', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().addTopping(ingredient('sucrose'), 50);
    const before = structuredClone(useRecipeStore.getState().toppings);
    useRecipeStore.getState().setBatchGrams(1500);
    expect(useRecipeStore.getState().toppings).toEqual(before);
    expectCoherent(1500, 'PROFESSIONAL_USER_BATCH');
  });
});
