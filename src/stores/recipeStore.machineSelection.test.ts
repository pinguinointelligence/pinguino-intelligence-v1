/**
 * S4 — recipeStore.setMachineSelection (per-recipe machine/serving context).
 *
 * The machine selection lives in the recipe working state: it sets the routing temperature (an
 * EXISTING supported cell — never a new Engine value), the context fields the workbar reads, and
 * an optional derived batch. `resetToDemo` (the account-boundary reset) clears it — the mechanism
 * that keeps a Pro session from inheriting a previous account's machine.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { recipePersistPartialize, useRecipeStore } from './recipeStore';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findPreset } from '@/data/demoPresets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  buildRecipeBehaviorAuthority,
  productBehaviorSnapshotFingerprint,
  recipeBehaviorLegacyInspection,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  attachRecipeProfileMetadata,
  profileSnapshotFromState,
  readRecipeProfileMetadata,
} from '@/features/pro-workbench/recipeProfilePersistence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';

const reset = () => useRecipeStore.getState().resetToDemo();

const MACHINE_A = {
  kind: 'professional' as const,
  servingModeId: 'temp_minus_13',
  machineId: null,
  label: 'Maszyna profesjonalna',
  temperatureC: -13,
  batchGrams: null,
};

const MACHINE_B = {
  kind: 'home' as const,
  servingModeId: 'ninja_gelato',
  machineId: 'ninja-creami-nc302eu-eu-es',
  label: 'Ninja CREAMi',
  temperatureC: -13,
  batchGrams: null,
  hardCapacityGrams: null,
};

const currentSnapshotsFor = (recipe: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const module = recipe.goals?.formulation_strategy === 'eco' ? 'ECO' : 'OPTIMAL';
  const mode = module === 'ECO' ? 'eco' : 'optimal';
  const items = new Map(recipe.items.map((item) => [item.id, item]));
  return Object.fromEntries(
    Object.entries(productBehaviorTestSnapshots(recipe)).map(([lineId, snapshot]) => [
      lineId,
      {
        ...snapshot,
        resolutionContext: {
          accountId: 'owner-current',
          productProfile: recipe.category,
          temperatureC: recipe.target_temperature_c,
          mode,
          processScope: snapshot.processScope,
          requestedRole: items.get(lineId)?.lock_type === 'main' ? 'MAIN' : 'STANDARD',
          module,
        },
      },
    ]),
  );
};

const seedSevenCurrentProductRecipe = () => {
  const preset = findPreset('jim-beam');
  expect(preset).toBeDefined();
  useRecipeStore.getState().loadPreset(preset!);
  expect(useRecipeStore.getState().setMachineSelection(MACHINE_A)).toEqual({ ok: true });

  const mapperLine = useRecipeStore.getState().items.at(-1)!;
  const mapperIngredientId =
    mapperLine.ingredient.canonical_ingredient_id ?? mapperLine.ingredient.id;
  const privateProductLine = {
    ...mapperLine,
    ingredient: {
      ...mapperLine.ingredient,
      id: 'PR-ING-007142',
      canonical_ingredient_id: 'PR-ING-007142',
      private_product_id:
        'catalog:55bd0ed2-2d13-4c6b-9020-5c563188f1ef:version:6a463055-ac6d-41d1-8fbb-01e662ba943b',
      identity_provenance: 'private_product' as const,
    },
  };
  useRecipeStore.setState((state) => ({
    items: state.items.map((item) => (item.id === mapperLine.id ? privateProductLine : item)),
  }));

  const recipe = buildRecipeInput(useRecipeStore.getState());
  expect(recipe.items).toHaveLength(7);
  const snapshots = currentSnapshotsFor(recipe);
  snapshots[mapperLine.id] = {
    ...snapshots[mapperLine.id]!,
    source: 'admin',
    productId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
    productVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
    behaviorBindingId: '639f48f5-9d1c-4948-86a0-02ed20205203',
    factsFingerprint: 'current-private-product-facts',
    mapperIngredientId,
    technicalAuthority: 'mapper_exact',
  };
  useRecipeStore.setState({
    productBehaviorSnapshots: snapshots,
    savedRecipeId: 'current-seven-product-recipe',
    dirty: false,
  });
  useRecipeProfileStore.getState().acknowledgeRecalculation();
  return { recipe: buildRecipeInput(useRecipeStore.getState()), snapshots };
};

const currentIdentityProjection = () => {
  const state = useRecipeStore.getState();
  return state.items.map((item) => {
    const snapshot = state.productBehaviorSnapshots[item.id];
    return {
      lineId: item.id,
      ingredientId: item.ingredient.id,
      canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? null,
      privateProductId: item.ingredient.private_product_id ?? null,
      identityProvenance: item.ingredient.identity_provenance ?? null,
      mapperIngredientId: snapshot?.mapperIngredientId ?? null,
      productId: snapshot?.productId ?? null,
      productVersionId: snapshot?.productVersionId ?? null,
      behaviorBindingId: snapshot?.behaviorBindingId ?? null,
      factsFingerprint: snapshot?.factsFingerprint ?? null,
      resolutionState: snapshot?.resolutionState ?? null,
      historicalIdentity: snapshot?.historicalIdentity ?? null,
    };
  });
};

describe('recipeStore.setMachineSelection (S4)', () => {
  beforeEach(reset);

  it('professional + Świeże routes to −11 and records the context (marks dirty)', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'fresh',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -11,
    });
    const s = useRecipeStore.getState();
    expect(s.machineKind).toBe('professional');
    expect(s.servingModeId).toBe('fresh');
    expect(s.machineId).toBeNull();
    expect(s.machineLabel).toBe('Maszyna profesjonalna');
    expect(s.target_temperature_c).toBe(-11);
    expect(s.dirty).toBe(true);
  });

  it('professional −12 / −13 set the exact existing temperature cell', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'temp_minus_12',
      machineId: null,
      label: 'x',
      temperatureC: -12,
    });
    expect(useRecipeStore.getState().target_temperature_c).toBe(-12);
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'temp_minus_13',
      machineId: null,
      label: 'x',
      temperatureC: -13,
    });
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
  });

  it('a professional selection without a batch leaves the current batch untouched', () => {
    const before = useRecipeStore.getState().target_batch_grams;
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'fresh',
      machineId: null,
      label: 'x',
      temperatureC: -11,
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(before);
  });

  it('a home selection records the machine id/label + auto-batch + routing temperature', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'ninja_gelato',
      machineId: 'ninja-creami-nc302eu-eu-es',
      label: 'Ninja CREAMi',
      temperatureC: -13,
      batchGrams: 450,
    });
    const s = useRecipeStore.getState();
    expect(s.machineKind).toBe('home');
    expect(s.machineId).toBe('ninja-creami-nc302eu-eu-es');
    expect(s.machineLabel).toBe('Ninja CREAMi');
    expect(s.target_temperature_c).toBe(-11);
    expect(s.homeFormulationModuleId).toBe('FROZEN_PINT');
    expect(s.machine_capacity_grams).toBeNull();
    expect(s.target_batch_grams).toBe(450);
    expect(s.dirty).toBe(true);
  });

  it('allows a total above the soft recommendation without creating an Engine capacity warning', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'ninja_gelato',
      machineId: 'ninja-creami-nc302eu-eu-es',
      label: 'Ninja CREAMi',
      temperatureC: -13,
      batchGrams: 1_000,
      hardCapacityGrams: null,
    });

    const input = buildRecipeInput(useRecipeStore.getState());
    expect(input.target_batch_grams).toBe(1_000);
    expect(input.machine_capacity_grams).toBeNull();
    expect(
      calculateRecipe(input).warnings.some(
        (warning) => warning.code === 'machine_capacity_exceeded',
      ),
    ).toBe(false);
  });

  it('persists and reopens the Home module, −11 route, and null hard gram ceiling', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'ninja_gelato',
      machineId: 'ninja-creami-nc302eu-eu-es',
      label: 'Ninja CREAMi',
      temperatureC: -13,
      batchGrams: 450,
      hardCapacityGrams: null,
    });
    const selected = useRecipeStore.getState();
    const persisted = recipePersistPartialize(selected);
    expect(persisted).toMatchObject({
      homeFormulationModuleId: 'FROZEN_PINT',
      target_temperature_c: -11,
      machine_capacity_grams: null,
    });

    const snapshot = profileSnapshotFromState(selected, selected.direction_targets);
    const saved = attachRecipeProfileMetadata(buildRecipeInput(selected), snapshot);
    // Simulate a legacy save that put the soft 450 g recommendation in the
    // Engine capacity slot; reopening must not preserve that false hard limit.
    (
      saved as unknown as {
        pinguino_profile_v1: { machineCapacityGrams: number | null };
      }
    ).pinguino_profile_v1.machineCapacityGrams = 450;
    expect(readRecipeProfileMetadata(saved)).toMatchObject({
      homeFormulationModuleId: 'FROZEN_PINT',
      targetTemperatureC: -11,
      machineCapacityGrams: null,
    });

    reset();
    useRecipeStore.getState().loadRecipeInput(saved, { batchAuthority: 'payload' });
    expect(useRecipeStore.getState()).toMatchObject({
      homeFormulationModuleId: 'FROZEN_PINT',
      target_temperature_c: -11,
      machine_capacity_grams: null,
    });
  });

  it.each(['percent', 'main'] as const)(
    'machine-derived batch applies the durable percentage share for a %s line',
    (lockType) => {
      useRecipeStore.setState({ items: [], target_batch_grams: 1000 });
      useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 130);
      useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 870);
      const line = useRecipeStore.getState().items[0]!;
      if (lockType === 'main') useRecipeStore.getState().setLockType(line.id, 'main');
      useRecipeStore.getState().setPercentLock(line.id, 13);

      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: 'ninja_gelato',
        machineId: 'ninja-creami-nc302eu-eu-es',
        label: 'Ninja CREAMi',
        temperatureC: -13,
        batchGrams: 450,
        hardCapacityGrams: null,
      });

      expect(useRecipeStore.getState().items[0]).toMatchObject({
        lock_type: lockType,
        planned_grams: 58.5,
        percent_constraint: { percent: 13 },
      });
    },
  );

  it('a home selection with a null auto-batch keeps the current batch (never invents one)', () => {
    useRecipeStore.getState().setBatchGrams(800);
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'fresh',
      machineId: 'moulinex-freezi-mj803af0-es',
      label: 'Moulinex Freezi',
      temperatureC: -11,
      batchGrams: null,
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(800);
  });

  it('machine A → B preserves seven current PI/PR/product identities without a false historical state', () => {
    const { snapshots } = seedSevenCurrentProductRecipe();
    const beforeIdentity = currentIdentityProjection();
    const beforeBytes = JSON.stringify(snapshots);
    const beforeFingerprint = productBehaviorSnapshotFingerprint(snapshots);
    expect(beforeIdentity.some((identity) => identity.ingredientId === 'PR-ING-007142')).toBe(true);
    expect(
      beforeIdentity.some((identity) => identity.mapperIngredientId?.startsWith('PI-ING-')),
    ).toBe(true);

    expect(useRecipeStore.getState().setMachineSelection(MACHINE_B)).toEqual({ ok: true });

    const changed = useRecipeStore.getState();
    const authority = buildRecipeBehaviorAuthority({
      items: changed.items,
      toppings: changed.toppings,
      snapshots: changed.productBehaviorSnapshots,
    });
    expect(currentIdentityProjection()).toEqual(beforeIdentity);
    expect(JSON.stringify(changed.productBehaviorSnapshots)).toBe(beforeBytes);
    expect(productBehaviorSnapshotFingerprint(changed.productBehaviorSnapshots)).toBe(
      beforeFingerprint,
    );
    expect(authority.requiredLineIds).toHaveLength(7);
    expect(authority.missingLineIds).toEqual([]);
    expect(authority.revalidationRequiredLineIds).toEqual([]);
    expect(recipeBehaviorLegacyInspection(authority, changed.savedRecipeId)).toBe(false);
  });

  it('machine A → B → A keeps identity deterministic and unchanged', () => {
    seedSevenCurrentProductRecipe();
    const beforeIdentity = currentIdentityProjection();
    const beforeSnapshots = structuredClone(useRecipeStore.getState().productBehaviorSnapshots);

    expect(useRecipeStore.getState().setMachineSelection(MACHINE_B)).toEqual({ ok: true });
    expect(useRecipeStore.getState().setMachineSelection(MACHINE_A)).toEqual({ ok: true });

    expect(useRecipeStore.getState()).toMatchObject({
      machineKind: 'professional',
      machineId: null,
      target_temperature_c: -13,
    });
    expect(currentIdentityProjection()).toEqual(beforeIdentity);
    expect(useRecipeStore.getState().productBehaviorSnapshots).toEqual(beforeSnapshots);
  });

  it('repeated batch-size changes remain product-identity neutral', () => {
    seedSevenCurrentProductRecipe();
    const beforeIdentity = currentIdentityProjection();
    const beforeSnapshots = structuredClone(useRecipeStore.getState().productBehaviorSnapshots);

    expect(useRecipeStore.getState().setBatchGrams(800)).toEqual({ ok: true });
    expect(useRecipeStore.getState().setBatchGrams(1_000)).toEqual({ ok: true });

    expect(currentIdentityProjection()).toEqual(beforeIdentity);
    expect(useRecipeStore.getState().productBehaviorSnapshots).toEqual(beforeSnapshots);
  });

  it('a machine temperature/context transition still marks recalculation required', () => {
    const { snapshots } = seedSevenCurrentProductRecipe();
    const revision = useRecipeStore.getState().draftRevision;
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);

    expect(useRecipeStore.getState().setMachineSelection(MACHINE_B)).toEqual({ ok: true });

    const changed = useRecipeStore.getState();
    expect(changed.target_temperature_c).toBe(-11);
    expect(changed.draftRevision).toBe(revision + 1);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(
      Object.values(changed.productBehaviorSnapshots).every(
        (snapshot) => snapshot.resolutionContext?.temperatureC === -13,
      ),
    ).toBe(true);
    expect(changed.productBehaviorSnapshots).toEqual(snapshots);
  });

  it('resetToDemo clears the machine context (cross-account isolation)', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'fresh',
      machineId: null,
      label: 'x',
      temperatureC: -11,
    });
    useRecipeStore.getState().resetToDemo();
    const s = useRecipeStore.getState();
    expect(s.machineKind).toBeNull();
    expect(s.servingModeId).toBeNull();
    expect(s.machineId).toBeNull();
    expect(s.machineLabel).toBeNull();
  });
});
