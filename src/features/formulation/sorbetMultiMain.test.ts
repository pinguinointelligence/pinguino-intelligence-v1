import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeInput } from '@/engine';
import { resolveMainRatioScale, verifyMainIngredientIdentity } from './mainIngredientContract';

const ingredient = (id: string) => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`Missing fixture ingredient ${id}`);
  return found;
};

const recipe = (weights: readonly [number, number]): RecipeInput => ({
  mode: 'classic',
  category: 'sorbet',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  items: [
    {
      id: 'strawberry',
      ingredient: ingredient('raspberry'),
      planned_grams: weights[0] === weights[1] ? 300 : 400,
      actual_grams: null,
      lock_type: 'main',
      main_ratio_weight: weights[0],
    },
    {
      id: 'lime',
      ingredient: { ...ingredient('raspberry'), id: 'lime', canonical_ingredient_id: 'PI-ING-000369' },
      planned_grams: weights[0] === weights[1] ? 300 : 200,
      actual_grams: null,
      lock_type: 'main',
      main_ratio_weight: weights[1],
    },
    {
      id: 'structural',
      ingredient: ingredient('sucrose'),
      planned_grams: 400,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
});

describe('Sorbet Multi-Main ratio execution contract', () => {
  it.each([
    [[1, 1] as const, [300, 300]],
    [[2, 1] as const, [400, 200]],
  ])('preserves %j at the exact 600 g owner target', (weights, expected) => {
    const input = recipe(weights);
    const allocation = resolveMainRatioScale(input, {}, 600);
    expect(allocation).toMatchObject({ ok: true, allocatedMainTotal: 600 });
    if (!allocation.ok) return;
    expect(allocation.allocations.map((entry) => entry.grams)).toEqual(expected);
    const after: RecipeInput = {
      ...input,
      items: input.items.map((item) => {
        const grams = allocation.allocations.find((entry) => entry.lineId === item.id)?.grams;
        return grams === undefined ? item : { ...item, planned_grams: grams };
      }),
    };
    expect(verifyMainIngredientIdentity(input, after).ok).toBe(true);
  });
});
