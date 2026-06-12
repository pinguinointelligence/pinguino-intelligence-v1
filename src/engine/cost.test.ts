import { describe, expect, it } from 'vitest';
import { resolveEffectiveItems } from './composition';
import { computeRecipeCosts } from './cost';
import type { EngineIngredient, RecipeItem } from './types';

const ZERO_PROFILE = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const makeItem = (id: string, cost_per_kg: number | null, planned_grams: number): RecipeItem => {
  const ingredient: EngineIngredient = {
    id: `ing-${id}`,
    name: id,
    category: 'other',
    composition: ZERO_PROFILE,
    pod_value: null,
    pac_value: null,
    npac_value: null,
    de_value: null,
    cost_per_kg,
    confidence_score: 85,
    source_type: 'manual',
    is_verified: false,
  };
  return { id, ingredient, planned_grams, actual_grams: null, lock_type: 'unlocked' };
};

const effective = (...items: RecipeItem[]) => resolveEffectiveItems(items);

describe('computeRecipeCosts', () => {
  it('calculates total cost and cost per kg from ingredient cost_per_kg', () => {
    const items = effective(makeItem('sucrose', 1.1, 130), makeItem('milk', 0.9, 870));
    const costs = computeRecipeCosts(items, 1000);
    expect(costs.complete).toBe(true);
    expect(costs.total_cost).toBeCloseTo(0.13 * 1.1 + 0.87 * 0.9, 9); // 0.926
    expect(costs.cost_per_kg).toBeCloseTo(0.926, 9);
  });

  it('calculates serving costs for 60 / 70 / 80 g', () => {
    const items = effective(makeItem('mix', 5, 1000));
    const costs = computeRecipeCosts(items, 1000);
    expect(costs.cost_per_serving_60g).toBeCloseTo(0.3, 9);
    expect(costs.cost_per_serving_70g).toBeCloseTo(0.35, 9);
    expect(costs.cost_per_serving_80g).toBeCloseTo(0.4, 9);
  });

  it('supports an optional custom serving size', () => {
    const items = effective(makeItem('mix', 5, 1000));
    const costs = computeRecipeCosts(items, 1000, 100);
    expect(costs.custom_serving_g).toBe(100);
    expect(costs.cost_per_custom_serving).toBeCloseTo(0.5, 9);
  });

  it('missing ingredient cost creates the incomplete state — never a silent 0', () => {
    const items = effective(makeItem('known', 2, 500), makeItem('unknown', null, 500));
    const costs = computeRecipeCosts(items, 1000);
    expect(costs.complete).toBe(false);
    expect(costs.total_cost).toBeNull();
    expect(costs.cost_per_kg).toBeNull();
    expect(costs.cost_per_serving_60g).toBeNull();
    expect(costs.cost_per_serving_70g).toBeNull();
    expect(costs.cost_per_serving_80g).toBeNull();
    expect(costs.missing_cost_ingredient_ids).toEqual(['ing-unknown']);
  });

  it('explicit zero cost is genuinely free, not unknown', () => {
    const items = effective(makeItem('water', 0, 1000));
    const costs = computeRecipeCosts(items, 1000);
    expect(costs.complete).toBe(true);
    expect(costs.total_cost).toBe(0);
    expect(costs.cost_per_kg).toBe(0);
  });

  it('zero-mass batches yield null money rates safely', () => {
    const costs = computeRecipeCosts([], 0);
    expect(costs.complete).toBe(true);
    expect(costs.total_cost).toBe(0);
    expect(costs.cost_per_kg).toBeNull();
    expect(costs.cost_per_serving_60g).toBeNull();
  });

  it('is deterministic and non-mutating', () => {
    const items = effective(makeItem('a', 3, 400), makeItem('b', null, 600));
    const snapshot = JSON.parse(JSON.stringify(items)) as unknown;
    expect(computeRecipeCosts(items, 1000)).toEqual(computeRecipeCosts(items, 1000));
    expect(items).toEqual(snapshot);
  });
});
