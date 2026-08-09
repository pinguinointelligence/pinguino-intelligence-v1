import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { verifyEcoFlavourProtection } from './flavourFloor';

const composition = {
  water_percent: 50,
  solids_percent: 50,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 50,
  sugar_percent: 50,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 50,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 200,
};
const ingredient = (
  id: string,
  name = id,
  category: EngineIngredient['category'] = 'fruit',
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  name,
  category,
  composition,
  pod_value: 50,
  pac_value: 100,
  de_value: null,
  cost_per_kg: 5,
  cost_currency: 'EUR',
  confidence_score: 100,
  source_type: 'verified_db',
  is_verified: true,
});
const input = (
  mains: Array<[string, string, number]>,
  extras: RecipeInput['items'] = [],
): RecipeInput => ({
  items: [
    ...mains.map(([lineId, id, grams]) => ({
      id: lineId,
      ingredient: ingredient(id),
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'main' as const,
    })),
    ...extras,
  ],
  mode: 'classic',
  category: 'sorbet',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'eco' },
});

describe('ECO Flavour Floor', () => {
  it('freezes unknown Main at the user baseline', () => {
    const before = input([['main', 'PI-ING-009999', 300]]);
    const after = { ...before, items: [{ ...before.items[0]!, planned_grams: 299 }] };
    expect(verifyEcoFlavourProtection(before, after)).toMatchObject({
      ok: false,
      violations: [{ code: 'unknown_floor_reduced' }],
    });
  });

  it('fails closed when Main is missing or relabeled', () => {
    const before = input([['main', 'PI-ING-009999', 300]]);
    expect(verifyEcoFlavourProtection(before, { ...before, items: [] })).toMatchObject({
      ok: false,
      violations: [{ code: 'main_line_missing' }],
    });
    const relabeled = {
      ...before,
      items: [{ ...before.items[0]!, ingredient: ingredient('PI-ING-008888') }],
    };
    const outcome = verifyEcoFlavourProtection(before, relabeled);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok)
      expect(
        outcome.violations.some((violation) => violation.code === 'main_identity_changed'),
      ).toBe(true);
  });

  it('allows an exact verified concentrate above its floor and blocks below it', () => {
    const before = input([['main', 'PI-ING-000737', 100]]);
    const atTwenty = { ...before, items: [{ ...before.items[0]!, planned_grams: 20 }] };
    expect(verifyEcoFlavourProtection(before, atTwenty).ok).toBe(true);
    const below = { ...before, items: [{ ...before.items[0]!, planned_grams: 19 }] };
    expect(verifyEcoFlavourProtection(before, below)).toMatchObject({
      ok: false,
      violations: [{ code: 'verified_floor_crossed' }],
    });
  });

  it('rejects automatic flavour-defining rows without relying on one legacy flag', () => {
    const before = input([['main', 'PI-ING-009999', 300]]);
    const paste = {
      id: 'new-paste',
      ingredient: ingredient('PI-ING-000737', 'Concentrate', 'flavor'),
      planned_grams: 10,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    };
    expect(
      verifyEcoFlavourProtection(before, { ...before, items: [...before.items, paste] }),
    ).toMatchObject({
      ok: false,
      violations: [{ code: 'automatic_flavour_ingredient_added' }],
    });
  });

  it('preserves exact Multi-Main ratio', () => {
    const before = input([
      ['a', 'PI-ING-009991', 200],
      ['b', 'PI-ING-009992', 100],
    ]);
    const after = {
      ...before,
      items: before.items.map((item) => ({ ...item, planned_grams: item.id === 'a' ? 200 : 200 })),
    };
    const outcome = verifyEcoFlavourProtection(before, after);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok)
      expect(outcome.violations.some((v) => v.code === 'multi_main_ratio_changed')).toBe(true);
  });
});
