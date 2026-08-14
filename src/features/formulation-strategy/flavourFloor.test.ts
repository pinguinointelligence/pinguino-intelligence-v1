import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
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

  it('freezes a legacy exact concentrate until the server resolver supplies its policy', () => {
    const before = input([['main', 'PI-ING-000737', 100]]);
    const atTwenty = { ...before, items: [{ ...before.items[0]!, planned_grams: 20 }] };
    expect(verifyEcoFlavourProtection(before, atTwenty)).toMatchObject({
      ok: false,
      violations: [{ code: 'unknown_floor_reduced', minimumGrams: 100 }],
    });
  });

  it('uses the resolved behavior snapshot as the sole ECO floor for managed products', () => {
    const before = input([['main', 'PI-ING-000737', 100]]);
    const after = { ...before, items: [{ ...before.items[0]!, planned_grams: 25 }] };
    const authority = {
      resolutionState: 'RESOLVED',
      moduleEligibility: { ECO: 'eligible' },
      ecoFloorPercent: 30,
      mainEquivalentFactor: 1,
    } as ProductBehaviorSnapshot;

    expect(
      verifyEcoFlavourProtection(before, after, {
        productBehaviorSnapshots: { main: authority },
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ code: 'verified_floor_crossed', minimumGrams: 300 }],
    });
  });

  it('does not fall back to the local registry when a managed snapshot blocks ECO', () => {
    const before = input([['main', 'PI-ING-000737', 100]]);
    const after = { ...before, items: [{ ...before.items[0]!, planned_grams: 99 }] };
    const authority = {
      resolutionState: 'RESOLVED',
      moduleEligibility: { ECO: 'blocked' },
      ecoFloorPercent: 1,
      mainEquivalentFactor: 1,
    } as ProductBehaviorSnapshot;

    expect(
      verifyEcoFlavourProtection(before, after, {
        productBehaviorSnapshots: { main: authority },
      }),
    ).toMatchObject({
      ok: false,
      violations: [{ code: 'unknown_floor_reduced', minimumGrams: 100 }],
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

  it('fails closed for an expensive Pistachio Main without a calibrated floor — numeric ECO proof', () => {
    const pistachio = ingredient('PI-ING-PISTACHIO-UNMAPPED-FLOOR', 'Pistachio paste', 'nut_paste');
    pistachio.cost_per_kg = 80;
    const cheap = ingredient('PI-ING-CHEAP-BASE', 'Cheap balancing base', 'water');
    cheap.cost_per_kg = 1;
    const before: RecipeInput = {
      ...input([]),
      items: [
        {
          id: 'pistachio-main',
          ingredient: pistachio,
          planned_grams: 150,
          actual_grams: null,
          lock_type: 'main',
        },
        {
          id: 'cheap-base',
          ingredient: cheap,
          planned_grams: 850,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
    };
    const unsafeCheaper: RecipeInput = {
      ...before,
      items: before.items.map((item) =>
        item.id === 'pistachio-main'
          ? { ...item, planned_grams: 100 }
          : { ...item, planned_grams: 900 },
      ),
    };
    const cost = (recipe: RecipeInput) =>
      recipe.items.reduce(
        (sum, item) => sum + (item.planned_grams / 1000) * (item.ingredient.cost_per_kg ?? 0),
        0,
      );

    expect(cost(before)).toBeCloseTo(12.85, 9);
    expect(cost(unsafeCheaper)).toBeCloseTo(8.9, 9);
    expect(verifyEcoFlavourProtection(before, unsafeCheaper)).toMatchObject({
      ok: false,
      violations: [
        {
          code: 'unknown_floor_reduced',
          lineId: 'pistachio-main',
          minimumGrams: 150,
          actualGrams: 100,
        },
      ],
    });
    // Accepted ECO state freezes the flavour identity instead of inventing a
    // potency minimum: grams and therefore cost remain the user's baseline.
    expect(verifyEcoFlavourProtection(before, before).ok).toBe(true);
    expect(cost(before)).toBeCloseTo(12.85, 9);
  });
});
