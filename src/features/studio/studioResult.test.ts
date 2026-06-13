import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { calculateRecipe, type LockType, type RecipeItem } from '@/engine';
import { buildRecipeInput, type RecipeInputState } from './buildRecipeInput';

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

const state = (items: RecipeItem[], over: Partial<RecipeInputState> = {}): RecipeInputState => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  flavor_intensity: 'balanced',
  cost_priority: 'balanced',
  items,
  ...over,
});

const run = (s: RecipeInputState) => calculateRecipe(buildRecipeInput(s));

describe('studio result (engine is the source of truth)', () => {
  it('changing planned grams changes the result', () => {
    const before = run(state([line('milk_3_5', 800), line('sucrose', 130)]));
    const after = run(state([line('milk_3_5', 800), line('sucrose', 200)]));
    expect(after.total_batch_g).toBe(1000);
    expect(before.total_batch_g).toBe(930);
    expect(after.pod_points).not.toBe(before.pod_points);
  });

  it('actual grams override planned grams (effective grams)', () => {
    const result = run(state([line('milk_3_5', 800), line('sucrose', 130, 200)]));
    expect(result.total_batch_g).toBe(1000); // 800 + 200 actual
    const sucrose = result.items.find((item) => item.id === 'l-sucrose')!;
    expect(sucrose.effective_grams).toBe(200);
    expect(sucrose.is_actual).toBe(true);
    expect(sucrose.difference).toBeCloseTo(70, 9);
  });

  it('an empty recipe is safe — null metrics, never NaN', () => {
    const result = run(state([]));
    expect(result.total_batch_g).toBe(0);
    expect(result.pod_points).toBeNull();
    expect(result.npac_points).toBeNull();
    expect(result.ice_fraction_percent).toBeNull();
    expect(result.scores).toBeNull();
  });

  it('is deterministic for the same store state', () => {
    const s = state([line('milk_3_5', 670), line('sucrose', 130)]);
    expect(run(s)).toEqual(run(s));
  });
});
