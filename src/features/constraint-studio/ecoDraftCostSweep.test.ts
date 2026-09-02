import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { effectiveInputCostPerKg, sweepEcoDraftCost } from './ecoDraftCostSweep';
import type { CustomerPriceIndex } from '@/features/pro-core/effectiveRecipePricing';
import { verifyEcoFlavourProtection } from '@/features/formulation-strategy/flavourFloor';

const composition = {
  water_percent: 100,
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
const ingredient = (id: string, price: number | null): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  name: id,
  category: 'water',
  composition,
  pod_value: 0,
  pac_value: 0,
  de_value: null,
  cost_per_kg: price,
  cost_currency: 'EUR',
  confidence_score: 100,
  source_type: 'verified_db',
  is_verified: true,
});
const recipe = (priceA: number, priceB: number): RecipeInput => ({
  items: [
    {
      id: 'a',
      ingredient: ingredient('PI-ING-000001', priceA),
      planned_grams: 500,
      actual_grams: null,
      lock_type: 'unlocked',
    },
    {
      id: 'b',
      ingredient: ingredient('PI-ING-000002', priceB),
      planned_grams: 500,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
  mode: 'classic',
  category: 'custom',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'eco' },
});
const override = (canonicalIngredientId: string, pricePerKg: number) => ({
  overrideId: `override-${canonicalIngredientId}`,
  ownerUserId: 'owner-a',
  canonicalIngredientId,
  pricePerKg,
  currency: 'EUR',
  createdBy: 'owner-a',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
});

const run = (input: RecipeInput, priceOverrides: CustomerPriceIndex = {}) =>
  sweepEcoDraftCost({
    identityInput: input,
    start: input,
    set: { byLineId: {} },
    excludedIngredientIds: new Set(),
    constraints: {
      context: 'planning',
      mode: 'classic',
      allow_main_ingredient_reduction: false,
      machine_capacity_grams: null,
    },
    normalize: (candidate) => {
      const sum = candidate.items.reduce((total, item) => total + item.planned_grams, 0);
      return {
        ...candidate,
        items: candidate.items.map((item) =>
          item.id === 'b' ? { ...item, planned_grams: item.planned_grams + (1000 - sum) } : item,
        ),
      };
    },
    priceOverrides,
  });

describe('bounded ECO current-draft sweep', () => {
  it('keeps technical fit equal and follows the effective customer price', () => {
    const expensiveA = recipe(10, 1);
    const first = run(expensiveA);
    expect(first).not.toBeNull();
    expect(first!.input.items.find((item) => item.id === 'a')!.planned_grams).toBeLessThan(500);
    expect(effectiveInputCostPerKg(first!.input)).toBeLessThan(
      effectiveInputCostPerKg(expensiveA)!,
    );

    const cheapA = recipe(0.1, 1);
    const second = run(cheapA);
    expect(second).not.toBeNull();
    expect(second!.input.items.find((item) => item.id === 'a')!.planned_grams).toBeGreaterThan(500);
  });

  it('does not claim savings when any price is missing', () => {
    const missing = recipe(10, 1);
    missing.items[1] = { ...missing.items[1]!, ingredient: ingredient('PI-ING-000002', null) };
    expect(effectiveInputCostPerKg(missing)).toBeNull();
    expect(run(missing)).toBeNull();
  });

  it('ranks with the owner override but keeps private prices out of the proposed input', () => {
    const mapperPriced = recipe(10, 1);
    const privatePrices: CustomerPriceIndex = {
      'PI-ING-000001': override('PI-ING-000001', 0.1),
      'PI-ING-000002': override('PI-ING-000002', 1),
    };

    const result = run(mapperPriced, privatePrices);
    expect(result).not.toBeNull();
    expect(result!.input.items.find((item) => item.id === 'a')!.planned_grams).toBeGreaterThan(500);
    expect(result!.input.items.find((item) => item.id === 'a')!.ingredient.cost_per_kg).toBe(10);
    expect(result!.input.items.find((item) => item.id === 'b')!.ingredient.cost_per_kg).toBe(1);
  });

  it('runs the real ECO sweep without inventing a Pistachio sensory floor', () => {
    const pistachio = recipe(80, 1);
    pistachio.items[0] = {
      ...pistachio.items[0]!,
      ingredient: {
        ...pistachio.items[0]!.ingredient,
        name: 'Pistachio paste',
        category: 'nut_paste',
      },
      planned_grams: 150,
      lock_type: 'main',
    };
    pistachio.items[1] = { ...pistachio.items[1]!, planned_grams: 850 };
    expect(effectiveInputCostPerKg(pistachio)).toBeCloseTo(12.85, 9);

    const swept = run(pistachio);
    expect(swept).toBeNull();
    expect(pistachio.items[0]?.planned_grams).toBe(150);

    const cheaper = {
      ...pistachio,
      items: [
        { ...pistachio.items[0]!, planned_grams: 100 },
        { ...pistachio.items[1]!, planned_grams: 900 },
      ],
    };
    expect(effectiveInputCostPerKg(cheaper)).toBeCloseTo(8.9, 9);
    expect(verifyEcoFlavourProtection(pistachio, cheaper))
      .toEqual({ ok: true, violations: [] });
  });
});
