import type { EffectiveRecipeItem, EngineIngredient } from './types';
import { ingredientNpacContribution } from './pac';
import { ingredientPodContribution } from './pod';

/** Public, read-only Engine projection used by mathematical relaxations.
 * It exposes the exact linear numerators already used by Engine stages; it
 * does not classify, approve or modify a recipe and introduces no second set
 * of formulation coefficients outside the Engine boundary. */
export interface TechnicalLinearIngredientFactors {
  waterPercent: number;
  solidsPercent: number;
  fatPercent: number;
  proteinPercent: number;
  lactosePercent: number;
  alcoholPercent: number;
  podPointGramsPerGram: number;
  npacPointGramsPerGram: number;
}

export function technicalLinearIngredientFactors(
  ingredient: EngineIngredient,
): TechnicalLinearIngredientFactors {
  const unit: EffectiveRecipeItem = {
    id: `linear-unit-${ingredient.id}`,
    ingredient,
    planned_grams: 1,
    actual_grams: null,
    lock_type: 'unlocked',
    effective_grams: 1,
    difference: 0,
    is_actual: false,
  };
  return {
    waterPercent: ingredient.composition.water_percent,
    solidsPercent: ingredient.composition.solids_percent,
    fatPercent: ingredient.composition.fat_percent,
    proteinPercent: ingredient.composition.protein_percent,
    lactosePercent: ingredient.composition.lactose_percent,
    alcoholPercent: ingredient.composition.alcohol_percent,
    podPointGramsPerGram: ingredientPodContribution(unit),
    npacPointGramsPerGram: ingredientNpacContribution(unit),
  };
}
