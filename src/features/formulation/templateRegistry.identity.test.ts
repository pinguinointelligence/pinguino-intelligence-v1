import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { proteinFlavorStrategyForRecipe } from './templateRegistry';

const composition: EngineIngredient['composition'] = {
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

const ingredient = (id: string, name: string): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  name,
  category: 'other',
  composition,
  pod_value: 0,
  pac_value: 0,
  de_value: null,
  cost_per_kg: null,
  cost_currency: null,
  confidence_score: 100,
  source_type: 'verified_db',
  is_verified: true,
});

const recipe = (main: EngineIngredient): RecipeInput => ({
  items: [{ id: 'main', ingredient: main, planned_grams: 15, actual_grams: null, lock_type: 'main' }],
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
});

describe('protein flavour identity routing', () => {
  it('routes the approved coffee identity independently of display language', () => {
    expect(
      proteinFlavorStrategyForRecipe(
        recipe(ingredient('PI-ING-000166', 'Caf\u00e9 molido para infusi\u00f3n')),
      ),
    ).toBe('coffee');
  });

  it('does not infer coffee behavior from a translated or neighboring display name', () => {
    expect(
      proteinFlavorStrategyForRecipe(
        recipe(ingredient('PI-ING-009999', 'Coffee-style caramel crunch')),
      ),
    ).toBe('neutral');
  });
});
