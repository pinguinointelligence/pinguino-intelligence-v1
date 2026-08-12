import {
  calculateRecipe,
  type EffectiveRecipeItem,
  type NutritionPer100g,
  type RecipeCosts,
  type RecipeInput,
  type RecipeItem,
  type RecipeResult,
} from '@/engine';
import type { RecipeToppingItem } from './recipeCompositionPersistence';

export interface FinalProductCalculation {
  baseResult: RecipeResult;
  finalItems: EffectiveRecipeItem[];
  finalNutritionPer100g: NutritionPer100g | null;
  finalCosts: RecipeCosts | null;
  baseMassG: number;
  toppingMassG: number;
  finalMassG: number;
  toppingCount: number;
}

export type ToppingMassContext = 'planning' | 'actual_batch';

export const toppingEffectiveGrams = (
  item: RecipeToppingItem,
  context: ToppingMassContext,
): number => (context === 'actual_batch' ? (item.actual_grams ?? item.planned_grams) : item.planned_grams);

export function buildFinalProductItems(
  baseInput: RecipeInput,
  toppings: readonly RecipeToppingItem[],
  context: ToppingMassContext = 'planning',
): RecipeItem[] {
  const toppingItems: RecipeItem[] = toppings.map((item) => {
    const grams = toppingEffectiveGrams(item, context);
    return {
      id: item.id,
      ingredient: item.ingredient,
      planned_grams: grams,
      actual_grams: context === 'actual_batch' ? grams : null,
      lock_type: context === 'actual_batch' ? 'already_added' : 'unlocked',
      production_step: item.production_step,
      notes: item.notes,
    };
  });
  const baseItems = baseInput.items.map((item) => ({ ...item }));
  return [...baseItems, ...toppingItems];
}

export function calculateFinalProduct(
  baseInput: RecipeInput,
  toppings: readonly RecipeToppingItem[] = [],
  context: ToppingMassContext = 'planning',
): FinalProductCalculation {
  const baseResult = calculateRecipe(baseInput);
  const finalInputItems = buildFinalProductItems(baseInput, toppings, context);
  const finalMassG = finalInputItems.reduce(
    (sum, item) => sum + (item.actual_grams ?? item.planned_grams),
    0,
  );
  // Reuse the public Engine calculation boundary for factual composition,
  // nutrition and cost. Its technical output is deliberately discarded:
  // Base `baseResult` above remains the sole POD/PAC/NPAC/score authority.
  const factualFinalResult = calculateRecipe({
    ...baseInput,
    items: finalInputItems,
    target_batch_grams: finalMassG,
  });
  const toppingMassG = toppings.reduce(
    (sum, item) => sum + toppingEffectiveGrams(item, context),
    0,
  );
  return {
    baseResult,
    finalItems: factualFinalResult.items,
    finalNutritionPer100g: factualFinalResult.nutrition_per_100g,
    finalCosts: factualFinalResult.costs,
    baseMassG: baseResult.total_batch_g,
    toppingMassG,
    finalMassG,
    toppingCount: toppings.length,
  };
}
