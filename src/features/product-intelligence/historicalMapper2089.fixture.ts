import type { EngineIngredient, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

const DEXTROSE_MAPPER_ID = 'PI-ING-000494';

/**
 * Replays the Dextrose facts frozen into recipes saved under Mapper 2089.
 *
 * The stable Mapper product identity intentionally stays unchanged. Only the
 * versioned technical payload is historical; new recipes and solver-proposed
 * lines must continue to use the current Mapper payload instead.
 */
export function withHistoricalMapper2089Dextrose(ingredient: EngineIngredient): EngineIngredient {
  if (canonicalIngredientId(ingredient) !== DEXTROSE_MAPPER_ID) return ingredient;
  return {
    ...ingredient,
    name: 'DEXTROSE · Sweetener · Dry',
    composition: {
      ...ingredient.composition,
      water_percent: 8,
      solids_percent: 92,
      carbohydrate_percent: 92,
      sugar_percent: 92,
      dextrose_percent: 92,
      kcal_per_100g: 368,
    },
    pod_value: 70.84,
    pac_value: 174.8,
  };
}

export function withHistoricalMapper2089Recipe(input: RecipeInput): RecipeInput {
  return {
    ...input,
    items: input.items.map((item) => ({
      ...item,
      ingredient: withHistoricalMapper2089Dextrose(item.ingredient),
    })),
  };
}
