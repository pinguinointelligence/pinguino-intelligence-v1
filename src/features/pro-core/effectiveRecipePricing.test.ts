import { describe, expect, it } from 'vitest';
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import { recipeTechnicalFit } from '@/features/recipe-score/technicalFit';
import type { CustomerIngredientPriceOverride } from './costContracts';
import { effectiveLineCost, resolveEffectiveIngredientCost } from './costing';
import {
  applyEffectiveCustomerPrices,
  canPersistCustomerPrice,
  customerPriceCanonicalId,
  effectiveCostForIngredient,
  effectiveCostForToppingIngredient,
  summarizeEffectiveRecipeCost,
} from './effectiveRecipePricing';

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

const ingredient = (id = 'PI-ING-000236', price: number | null = 0.97): EngineIngredient => ({
  id,
  canonical_ingredient_id: id.startsWith('PI-ING-') ? id : undefined,
  name: 'Milk',
  category: 'dairy',
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

const override = (pricePerKg = 1.12, currency = 'EUR'): CustomerIngredientPriceOverride => ({
  overrideId: 'price-1',
  ownerUserId: 'owner-a',
  canonicalIngredientId: 'PI-ING-000236',
  pricePerKg,
  currency,
  createdBy: 'owner-a',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
});

describe('effective customer pricing', () => {
  it('uses private override before Mapper and computes exact line contribution', () => {
    const cost = effectiveCostForIngredient(ingredient(), {
      'PI-ING-000236': override(),
    });
    expect(cost).toMatchObject({
      source: 'customer_override',
      pricePerKg: 1.12,
      mapperPricePerKg: 0.97,
      customerOverridePerKg: 1.12,
    });
    expect(effectiveLineCost(80, cost)).toBeCloseTo(0.0896, 10);
  });

  it('falls back to Mapper, keeps zero valid and never treats missing as free', () => {
    expect(effectiveCostForIngredient(ingredient(), {}).source).toBe('mapper_reference');
    expect(effectiveCostForIngredient(ingredient('PI-ING-000236', 0), {}).pricePerKg).toBe(0);
    const missing = effectiveCostForIngredient(ingredient('PI-ING-000236', null), {});
    expect(missing.source).toBe('missing');
    expect(missing.pricePerKg).toBeNull();
    expect(effectiveLineCost(100, missing)).toBeNull();
  });

  it('ignores an invalid private override and falls back to a valid Mapper reference', () => {
    const mismatch = resolveEffectiveIngredientCost({
      canonicalIngredientId: 'PI-ING-000236',
      mapperPricePerKg: 0.97,
      mapperCurrency: 'EUR',
      customerOverride: { ...override(), currency: 'USD' },
      targetCurrency: 'EUR',
    });
    expect(mismatch.source).toBe('mapper_reference');
    expect(mismatch.pricePerKg).toBe(0.97);
  });

  it.each([
    { canonicalIngredientId: 'PI-ING-999999', pricePerKg: 1.12, currency: 'EUR' },
    { canonicalIngredientId: 'PI-ING-000236', pricePerKg: -1, currency: 'EUR' },
    { canonicalIngredientId: 'PI-ING-000236', pricePerKg: 1.12, currency: 'USD' },
  ])('never lets an invalid private price shadow a valid reference: %j', (invalid) => {
    const resolved = resolveEffectiveIngredientCost({
      canonicalIngredientId: 'PI-ING-000236',
      mapperPricePerKg: 0.97,
      mapperCurrency: 'EUR',
      customerOverride: { ...override(), ...invalid },
      targetCurrency: 'EUR',
    });
    expect(resolved).toMatchObject({
      source: 'mapper_reference',
      pricePerKg: 0.97,
      customerOverridePerKg: null,
    });
  });

  it('accepts only explicit Mapper canonical identity for persistence', () => {
    expect(customerPriceCanonicalId(ingredient())).toBe('PI-ING-000236');
    expect(canPersistCustomerPrice(ingredient())).toBe(true);
    const privateLine = ingredient('private-line-id');
    expect(customerPriceCanonicalId(privateLine)).toBeNull();
    expect(canPersistCustomerPrice(privateLine)).toBe(false);
  });

  it('projects private price transiently without mutating the canonical recipe', () => {
    const input: RecipeInput = {
      items: [
        {
          id: 'milk',
          ingredient: ingredient(),
          planned_grams: 500,
          actual_grams: null,
          lock_type: 'unlocked',
        },
      ],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 500,
      machine_capacity_grams: null,
      goals: { formulation_strategy: 'optimal' },
    };
    const projected = applyEffectiveCustomerPrices(input, { 'PI-ING-000236': override() });
    expect(projected.items[0]!.ingredient.cost_per_kg).toBe(1.12);
    expect(projected.items[0]!.ingredient.cost_currency).toBe('EUR');
    expect(input.items[0]!.ingredient.cost_per_kg).toBe(0.97);

    const scientificBefore = calculateRecipe(input);
    const scientificAfter = calculateRecipe(projected);
    expect({
      pod: scientificAfter.pod_points,
      pac: scientificAfter.pac_points,
      npac: scientificAfter.npac_points,
      ice: scientificAfter.ice_fraction_percent,
      water: scientificAfter.percentages.water_percent,
      fat: scientificAfter.percentages.fat_percent,
      protein: scientificAfter.percentages.protein_percent,
    }).toEqual({
      pod: scientificBefore.pod_points,
      pac: scientificBefore.pac_points,
      npac: scientificBefore.npac_points,
      ice: scientificBefore.ice_fraction_percent,
      water: scientificBefore.percentages.water_percent,
      fat: scientificBefore.percentages.fat_percent,
      protein: scientificBefore.percentages.protein_percent,
    });
    expect(recipeTechnicalFit(scientificAfter)).toEqual(recipeTechnicalFit(scientificBefore));
    expect(summarizeEffectiveRecipeCost(input, { 'PI-ING-000236': override() })).toMatchObject({
      totalCost: 0.56,
      costPerKg: 1.12,
      complete: true,
    });
  });

  it('uses only the caller-private catalog price for a label-only Topping', () => {
    const cost = effectiveCostForToppingIngredient({
      kind: 'catalog_label_topping',
      id: 'catalog:sauce',
      canonical_ingredient_id: 'catalog:sauce',
      private_product_id: 'catalog:sauce:version:v1',
      name: 'Sauce',
      catalog_product_id: 'sauce',
      catalog_version_id: 'v1',
      verification_status: 'verified',
      label_nutrition_per_100g: {
        basis: 'per_100g', energyKcal: 200, fat: 1, saturatedFat: null,
        carbohydrate: 48, sugars: null, protein: 1, salt: 0.05, fibre: null,
      },
      ingredients_text: 'Fruit, sugar',
      allergens_text: 'None declared',
      cost_per_kg: 8.5,
      cost_currency: 'EUR',
    }, {});
    expect(cost).toMatchObject({
      canonicalIngredientId: 'catalog:sauce',
      pricePerKg: 8.5,
      source: 'customer_override',
      mapperPricePerKg: null,
      customerOverridePerKg: 8.5,
    });
  });
});
