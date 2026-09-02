/**
 * P2 — a NEW draft starts clean; a SAVED recipe keeps its own Direction.
 *
 * Served defect (staging, 2026-08-23, reproduced on the deployed pre-fix
 * bundle): with a gelato draft at Sweetness −2 / Hardness +2, switching the
 * product type rebuilt the starter into an ALL-NEW sorbet — new category, new
 * temperature, every ingredient replaced — that still carried −2/+2, on the
 * same `draftContextSeq` (19 → 19). `rebuildNewRecipeStarter` replaced the
 * whole recipe but never reset Direction and never opened a new draft context.
 *
 * `startNewRecipe` / `resetToDemo` were measured on the same bundle and do NOT
 * leak: they seed Direction from the per-product account default, which is a
 * deliberately configured preference (only `AccountRecipeDefaults` writes it),
 * and neutral when none is stored.
 *
 * The two halves of the contract are deliberately opposite:
 *   - NEW/rebuilt draft → the account default for that product, else neutral;
 *   - SAVED recipe reopened → its OWN persisted Direction, whatever the
 *     ambient profile snapshot currently holds.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from './recipeStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeDirectionTarget, RecipeInput } from '@/engine';

const NEUTRAL = { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 } as const;

const reset = () => {
  useRecipeProfileStore.getState().resetForTests();
  useRecipeStore.getState().resetToDemo();
};
const state = () => useRecipeStore.getState();

/** The exact starter key the product-type switch sends through the store. */
const starterKey = (visibleProductType: 'gelato' | 'sorbet') => ({
  visibleProductType,
  servingModeId: 'temp_minus_12' as const,
  formulationStrategy: 'optimal' as const,
  targetBatchGrams: 1000,
});

/** A deliberately configured per-product account default. */
const saveAccountDefault = (
  visible: 'gelato' | 'sorbet',
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
) => {
  useRecipeProfileStore.getState().saveDefaults(`local-device:${visible}`, {
    visibleProductType: visible,
    mode: 'classic',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1000,
    machineKind: 'professional',
    machineId: null,
    machineLabel: 'Maszyna profesjonalna',
    servingModeId: 'temp_minus_12',
    targetTemperatureC: -12,
    machineCapacityGrams: null,
    directionTargets: { sweetness, softness, creaminess: 0, flavor: 0 },
    directionIntents: { sweetness, softness, creaminess: 0, flavor: 0 },
  } as never);
};

/** A saved recipe that carries its own non-neutral Direction. */
const savedRecipe = (
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    {
      id: 'milk',
      ingredient: findDemoIngredient('milk_3_5')!,
      planned_grams: 620,
      actual_grams: null,
      lock_type: 'unlocked',
    },
    {
      id: 'sucrose',
      ingredient: findDemoIngredient('sucrose')!,
      planned_grams: 145,
      actual_grams: null,
      lock_type: 'unlocked',
    },
    {
      id: 'tara',
      ingredient: findDemoIngredient('tara_gum')!,
      planned_grams: 4,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
  },
});

describe('P2 — a rebuilt starter never inherits the previous recipe Direction', () => {
  beforeEach(reset);

  it('the served case: gelato at −2/+2 → switch product → sorbet starts 0/0', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', -2);
    useRecipeStore.getState().setDirectionTarget('softness', 2);
    expect(state().direction_targets).toMatchObject({ sweetness: -2, softness: 2 });

    useRecipeStore.getState().rebuildNewRecipeStarter(starterKey('sorbet'));

    expect(state().visibleProductType).toBe('sorbet');
    expect(state().direction_targets).toEqual(NEUTRAL);
  });

  it('rebinds the Direction regulator to the new draft context', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', -2);
    const before = state().draftContextSeq;

    useRecipeStore.getState().rebuildNewRecipeStarter(starterKey('sorbet'));

    // Served: the seq never moved (19 → 19), so the regulator stayed bound to
    // the recipe that had just been replaced.
    expect(state().draftContextSeq).toBe(before + 1);
    expect(useRecipeProfileStore.getState().openedContextSeq).toBe(state().draftContextSeq);
    expect(useRecipeProfileStore.getState().directionIntents).toEqual(NEUTRAL);
  });

  it('a rebuild within the same product type also drops the previous Direction', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('softness', -2);

    useRecipeStore.getState().rebuildNewRecipeStarter(starterKey('gelato'));

    expect(state().direction_targets).toEqual(NEUTRAL);
  });

  it('the rebuilt draft still carries an ACTIVE contract (P1-A stays intact)', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);

    useRecipeStore.getState().rebuildNewRecipeStarter(starterKey('sorbet'));

    const input = buildRecipeInput(state());
    expect(input.goals?.direction_targets).toMatchObject({ sweetness: 0, softness: 0 });
    expect(input.goals?.direction_targets_active).toBe(true);
  });

  it('a rebuild adopts the account default of the product being switched TO', () => {
    saveAccountDefault('sorbet', -1, 1);
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);
    useRecipeStore.getState().setDirectionTarget('softness', -2);

    useRecipeStore.getState().rebuildNewRecipeStarter(starterKey('sorbet'));

    // The stored sorbet preference — never the gelato draft that was replaced.
    expect(state().direction_targets).toMatchObject({ sweetness: -1, softness: 1 });
  });
});

describe('P2 — a fresh recipe starts from its own product default, not recipe A', () => {
  beforeEach(reset);

  it('recipe A at Sweetness −2 → new recipe B starts 0/0', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', -2);
    expect(state().direction_targets.sweetness).toBe(-2);

    useRecipeStore.getState().startNewRecipe('gelato');
    expect(state().direction_targets).toEqual(NEUTRAL);
  });

  it('recipe A at +2/+2 → new recipe B starts 0/0', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);
    useRecipeStore.getState().setDirectionTarget('softness', 2);

    useRecipeStore.getState().startNewRecipe('gelato');
    expect(state().direction_targets).toEqual(NEUTRAL);
  });

  it('switching the starter product on a new draft does not leak Direction', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    useRecipeStore.getState().setDirectionTarget('sweetness', -2);
    useRecipeStore.getState().setDirectionTarget('softness', 1);

    useRecipeStore.getState().startNewRecipe('sorbet');
    expect(state().direction_targets).toEqual(NEUTRAL);

    useRecipeStore.getState().startNewRecipe('gelato');
    expect(state().direction_targets).toEqual(NEUTRAL);
  });
});

describe('P2 — a saved recipe reopens with its OWN Direction', () => {
  beforeEach(reset);

  it('restores a non-neutral saved Direction on reopen', () => {
    useRecipeStore.getState().loadRecipeInput(savedRecipe(-2, 1));
    expect(state().direction_targets).toMatchObject({ sweetness: -2, softness: 1 });
    expect(state().direction_targets_active).toBe(true);
  });

  it('the saved recipe outranks the ambient per-profile snapshot', () => {
    // Before the fix `profile?.directionTargets` was consulted FIRST, so a
    // recipe saved at −1/+2 reopened wearing whatever was last configured.
    saveAccountDefault('gelato', 2, -2);
    useRecipeStore.getState().startNewRecipe('gelato');
    expect(state().direction_targets).toMatchObject({ sweetness: 2, softness: -2 });

    useRecipeStore.getState().loadRecipeInput(savedRecipe(-1, 2));
    expect(state().direction_targets).toMatchObject({ sweetness: -1, softness: 2 });
  });

  it('save → reopen round-trips the recipe’s own Direction', () => {
    useRecipeStore.getState().loadRecipeInput(savedRecipe(2, -1));
    const serialized = buildRecipeInput(state());
    expect(serialized.goals?.direction_targets).toMatchObject({ sweetness: 2, softness: -1 });

    // A new recipe in between must not disturb what the saved one reopens with.
    useRecipeStore.getState().startNewRecipe('gelato');
    expect(state().direction_targets).toEqual(NEUTRAL);

    useRecipeStore.getState().loadRecipeInput(serialized);
    expect(state().direction_targets).toMatchObject({ sweetness: 2, softness: -1 });
    expect(state().direction_targets_active).toBe(true);
  });

  it('a neutral saved recipe reopens neutral and still active', () => {
    useRecipeStore.getState().loadRecipeInput(savedRecipe(0, 0));
    expect(state().direction_targets).toEqual(NEUTRAL);
    expect(state().direction_targets_active).toBe(true);
  });
});
