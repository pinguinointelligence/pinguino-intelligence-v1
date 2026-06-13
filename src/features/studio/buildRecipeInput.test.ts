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
  category: 'fruit_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1200,
  machine_capacity_grams: 2000,
  flavor_intensity: 'maximum',
  cost_priority: 'low',
  items,
});

describe('buildRecipeInput', () => {
  it('maps store state to a valid RecipeInput including goals', () => {
    const input = buildRecipeInput(state([line('raspberry', 300, null, 'main'), line('milk_3_5', 500)]));
    expect(input.mode).toBe('premium');
    expect(input.category).toBe('fruit_gelato');
    expect(input.target_temperature_c).toBe(-12);
    expect(input.target_batch_grams).toBe(1200);
    expect(input.machine_capacity_grams).toBe(2000);
    expect(input.goals).toEqual({ flavor_intensity: 'maximum', cost_priority: 'low' });
    expect(input.items[0]!.lock_type).toBe('main');
  });
});

describe('recipeContext', () => {
  it('is planning when no line records an actual amount', () => {
    expect(recipeContext(buildRecipeInput(state([line('milk_3_5', 500)])))).toBe('planning');
  });

  it('switches to actual_batch when any line has actual grams', () => {
    expect(
      recipeContext(buildRecipeInput(state([line('milk_3_5', 500, 520), line('sucrose', 130)]))),
    ).toBe('actual_batch');
  });
});
