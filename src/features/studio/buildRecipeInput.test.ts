import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { LockType, RecipeItem } from '@/engine';
import { buildRecipeInput, recipeContext, type RecipeInputState } from './buildRecipeInput';

const line = (
  id: string,
  planned: number,
  actual: number | null = null,
  lock: LockType = 'unlocked',
): RecipeItem => ({
  id: `l-${id}`,
  ingredient: findDemoIngredient(id)!,
  planned_grams: planned,
  actual_grams: actual,
  lock_type: lock,
});

const state = (items: RecipeItem[]): RecipeInputState => ({
  mode: 'premium',
  formulation_strategy: 'eco',
  category: 'fruit_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1200,
  machine_capacity_grams: 2000,
  machine_capacity_source: 'manual',
  flavor_intensity: 'maximum',
  cost_priority: 'low',
  items,
});

describe('buildRecipeInput', () => {
  // OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — SUPERSEDES the
  // `fruit_gelato` pass-through. `fruit_gelato` carries no NATIVE seeded band
  // cell, so `selectTargetBand` silently substituted milk_gelato bands and
  // flagged `category_fallback`. This seam now CANONICALIZES the category from
  // the real ingredients (raspberry + milk 3.5 % ⇒ dairy fruit ⇒ milk_gelato),
  // so the engine is never asked for bands it does not own. The guarantee this
  // test protects — every store field maps through to the engine contract —
  // is unchanged and re-pinned below, plus the canonicalization itself.
  it('maps store state to a valid RecipeInput including goals', () => {
    const input = buildRecipeInput(
      state([line('raspberry', 300, null, 'main'), line('milk_3_5', 500)]),
    );
    expect(input.mode).toBe('classic');
    expect(input.category).toBe('milk_gelato');
    expect(input.target_temperature_c).toBe(-12);
    expect(input.target_batch_grams).toBe(1200);
    expect(input.machine_capacity_grams).toBe(2000);
    expect(input.goals).toEqual({
      formulation_strategy: 'eco',
      flavor_intensity: 'maximum',
      cost_priority: 'low',
      direction_targets: {
        sweetness: 0,
        softness: 0,
        creaminess: 0,
        flavor: 0,
      },
      direction_targets_active: false,
      excluded_ingredient_ids: [],
      unavailable_main_ingredient_ids: [],
    });
    expect(input.items[0]!.lock_type).toBe('main');
  });

  // OWNER ADDENDUM item 1 — the canonicalization is a STRUCTURAL property of
  // this seam, not a side effect of one fixture: no unseeded category can pass
  // through it, and an already-native category passes through byte-identical.
  it('canonicalizes every unseeded category and never touches a native one', () => {
    const dairyFruit = [line('raspberry', 300), line('milk_3_5', 500)];
    for (const unseeded of ['fruit_gelato', 'nut_gelato', 'alcohol_gelato', 'custom'] as const) {
      const input = buildRecipeInput({ ...state(dairyFruit), category: unseeded });
      expect(input.category, unseeded).toBe('milk_gelato');
    }
    // A water-based NON-DAIRY fruit draft canonicalizes to sorbet (owner rule).
    expect(
      buildRecipeInput({ ...state([line('raspberry', 300)]), category: 'fruit_gelato' }).category,
    ).toBe('sorbet');
    // Native categories are returned untouched.
    for (const native of [
      'milk_gelato',
      'chocolate_gelato',
      'sorbet',
      'vegan_gelato',
      'protein_gelato',
    ] as const) {
      expect(buildRecipeInput({ ...state(dairyFruit), category: native }).category, native).toBe(
        native,
      );
    }
  });

  // OWNER CURRENT-DRAFT P0 (Phase 8) — the machine-context gate: an
  // unprovenanced capacity (the stale-localStorage class) never reaches the
  // Engine, so it can never raise `machine_capacity_exceeded`.
  it('an UNPROVENANCED capacity never reaches the engine', () => {
    const base = state([line('milk_3_5', 500)]);
    expect(
      buildRecipeInput({ ...base, machine_capacity_source: null }).machine_capacity_grams,
    ).toBeNull();
    const legacy: RecipeInputState = { ...base };
    delete legacy.machine_capacity_source;
    expect(buildRecipeInput(legacy).machine_capacity_grams).toBeNull();
  });

  it('a machine-derived capacity DOES reach the engine', () => {
    const base = state([line('milk_3_5', 500)]);
    expect(
      buildRecipeInput({ ...base, machine_capacity_source: 'machine' }).machine_capacity_grams,
    ).toBe(2000);
  });
});

describe('recipeContext', () => {
  it('is planning when no line records an actual amount', () => {
    expect(recipeContext(buildRecipeInput(state([line('milk_3_5', 500)])))).toBe('planning');
  });

  it('switches to actual_batch when any line has actual grams', () => {
    expect(
      recipeContext(
        buildRecipeInput(state([line('milk_3_5', 500, 520), line('sucrose', 130)]), 'actual_batch'),
      ),
    ).toBe('actual_batch');
  });

  it('does not let stale actual grams override normal Recipe/Monitor planning', () => {
    const planning = buildRecipeInput(
      state([line('milk_3_5', 500, 520), line('sucrose', 130, 120)]),
    );
    expect(planning.items.map((item) => item.actual_grams)).toEqual([null, null]);
    expect(recipeContext(planning)).toBe('planning');
  });
});
