/**
 * P1-A — the STORE seam that produced the served defect (owner, 2026-08-23).
 *
 * `direction_targets_active` used to be derived as
 *   `Object.values(profile.directionTargets).some((target) => target !== 0)`
 * so a neutral 0/0 draft serialized `direction_targets_active: false`. The
 * Direction contract then never reached the Engine, no POD band was applied,
 * and Sweetness 0 was optimized against the global band alone — parking POD at
 * its top edge (served: 17.00) while "+1 sweeter" delivered 15.97.
 *
 * These tests exercise the STORE, not a hand-built RecipeInput: the pure
 * Direction tests construct `direction_targets_active` themselves and therefore
 * could never have caught this. This file closes that gap.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from './recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeInput } from '@/engine';

const reset = () => useRecipeStore.getState().resetToDemo();

const legacyInput = (active?: boolean): RecipeInput => ({
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
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    ...(active === undefined ? {} : { direction_targets_active: active }),
  },
});

describe('P1-A — neutral Direction survives the store seam', () => {
  beforeEach(reset);

  it('a fresh Pro draft at neutral 0/0 carries an ACTIVE direction contract', () => {
    useRecipeStore.getState().startNewRecipe();
    const state = useRecipeStore.getState();
    expect(state.direction_targets).toEqual({
      sweetness: 0,
      softness: 0,
      creaminess: 0,
      flavor: 0,
    });
    // THE FIX: neutral is an intent, not the absence of one.
    expect(state.direction_targets_active).toBe(true);
  });

  it('serializes the active neutral contract into the Engine input', () => {
    useRecipeStore.getState().startNewRecipe();
    const input = buildRecipeInput(useRecipeStore.getState());
    expect(input.goals?.direction_targets_active).toBe(true);
    expect(input.goals?.direction_targets).toMatchObject({ sweetness: 0, softness: 0 });
  });

  it('setting an axis and returning to 0 keeps the contract active', () => {
    useRecipeStore.getState().startNewRecipe();
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);
    expect(useRecipeStore.getState().direction_targets_active).toBe(true);
    useRecipeStore.getState().setDirectionTarget('sweetness', 0);
    // Returning to neutral must NOT silently switch Direction off again.
    expect(useRecipeStore.getState().direction_targets_active).toBe(true);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(0);
  });

  it('reopening a saved recipe preserves an explicitly stored activation', () => {
    useRecipeStore.getState().loadRecipeInput(legacyInput(true));
    expect(useRecipeStore.getState().direction_targets_active).toBe(true);
  });

  it('a LEGACY save with no stored flag keeps its legacy semantics (documented boundary)', () => {
    // DELIBERATE BOUNDARY: recipes saved BEFORE this fix carry no flag. Turning
    // them active on reopen retroactively re-optimizes historical recipes and
    // broke three accepted Apply/Undo flows, so legacy saves keep the legacy
    // derivation. Everything saved from now on stores the flag explicitly and
    // round-trips (see the round-trip test below), which is what §6 requires.
    useRecipeStore.getState().loadRecipeInput(legacyInput(undefined));
    expect(useRecipeStore.getState().direction_targets_active).toBe(false);
  });

  it('respects an explicit stored false (a recipe deliberately saved without Direction)', () => {
    useRecipeStore.getState().loadRecipeInput(legacyInput(false));
    expect(useRecipeStore.getState().direction_targets_active).toBe(false);
  });

  it('round-trips: a recipe saved with the contract reopens with it intact', () => {
    useRecipeStore.getState().startNewRecipe();
    const serialized = buildRecipeInput(useRecipeStore.getState());
    expect(serialized.goals?.direction_targets_active).toBe(true);
    reset();
    useRecipeStore.getState().loadRecipeInput(serialized);
    expect(useRecipeStore.getState().direction_targets_active).toBe(true);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(0);
  });
});
