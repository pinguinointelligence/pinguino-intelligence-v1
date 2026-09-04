import {
  calculateRecipe,
  type EffectiveRecipeItem,
  type NutritionPer100g,
  type RecipeCosts,
  type RecipeInput,
  type RecipeItem,
  type RecipeResult,
} from '@/engine';
import {
  isCatalogLabelToppingIngredient,
  type CatalogLabelToppingIngredient,
} from './labelTopping';
import type { RecipeToppingItem } from './recipeCompositionPersistence';

export interface ProductLabelNutritionPer100g {
  kcal: number;
  fat_g: number;
  /** Null stays honest when any Base ingredient lacks declared saturated fat. */
  saturated_fat_g: number | null;
  carbohydrate_g: number;
  sugars_g: number | null;
  protein_g: number;
  salt_g: number;
  fiber_g: number | null;
  /** Null means the commercial label did not establish the topping's alcohol. */
  alcohol_g: number | null;
}

export interface EffectiveCatalogLabelToppingItem {
  id: string;
  ingredient: CatalogLabelToppingIngredient;
  planned_grams: number;
  actual_grams: number | null;
  lock_type: 'unlocked' | 'already_added';
  production_step?: number;
  notes?: string;
  effective_grams: number;
  difference: number;
  is_actual: boolean;
}

export type FinalProductItem = EffectiveRecipeItem | EffectiveCatalogLabelToppingItem;

export interface FinalProductCalculation {
  baseResult: RecipeResult;
  finalItems: FinalProductItem[];
  /** Full Engine nutrition is unavailable once a label-only item is present. */
  finalNutritionPer100g: NutritionPer100g | null;
  /** Standard declared label facts remain usable without inventing Engine science. */
  finalLabelNutritionPer100g: ProductLabelNutritionPer100g | null;
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
): number =>
  context === 'actual_batch' ? (item.actual_grams ?? item.planned_grams) : item.planned_grams;

function scienceToppingItem(
  item: RecipeToppingItem,
  context: ToppingMassContext,
): RecipeItem | null {
  if (isCatalogLabelToppingIngredient(item.ingredient)) return null;
  const grams = toppingEffectiveGrams(item, context);
  if (grams <= 0) return null;
  return {
    id: item.id,
    ingredient: item.ingredient,
    planned_grams: grams,
    actual_grams: context === 'actual_batch' ? grams : null,
    lock_type: context === 'actual_batch' ? 'already_added' : 'unlocked',
    production_step: item.production_step,
    notes: item.notes,
  };
}

function labelToppingItem(
  item: RecipeToppingItem,
  context: ToppingMassContext,
): EffectiveCatalogLabelToppingItem | null {
  if (!isCatalogLabelToppingIngredient(item.ingredient)) return null;
  const grams = toppingEffectiveGrams(item, context);
  if (grams <= 0) return null;
  return {
    id: item.id,
    ingredient: item.ingredient,
    planned_grams: grams,
    actual_grams: context === 'actual_batch' ? grams : null,
    lock_type: context === 'actual_batch' ? 'already_added' : 'unlocked',
    production_step: item.production_step,
    notes: item.notes,
    effective_grams: grams,
    difference: context === 'actual_batch' ? grams - item.planned_grams : 0,
    is_actual: context === 'actual_batch',
  };
}

export function buildFinalProductItems(
  baseInput: RecipeInput,
  toppings: readonly RecipeToppingItem[],
  context: ToppingMassContext = 'planning',
): FinalProductItem[] {
  const scienceItems = toppings.flatMap((item) => {
    const next = scienceToppingItem(item, context);
    return next ? [next] : [];
  });
  const factual = calculateRecipe({
    ...baseInput,
    items: [...baseInput.items.map((item) => ({ ...item })), ...scienceItems],
    target_batch_grams: [...baseInput.items, ...scienceItems].reduce(
      (sum, item) => sum + (item.actual_grams ?? item.planned_grams),
      0,
    ),
  });
  const labelItems = toppings.flatMap((item) => {
    const next = labelToppingItem(item, context);
    return next ? [next] : [];
  });
  return [...factual.items, ...labelItems];
}

function combineLabelNutrition(
  factual: NutritionPer100g | null,
  factualMassG: number,
  labelItems: readonly EffectiveCatalogLabelToppingItem[],
  finalMassG: number,
): ProductLabelNutritionPer100g | null {
  if (!factual || finalMassG <= 0) return null;
  const total: Omit<ProductLabelNutritionPer100g, 'alcohol_g'> = {
    kcal: (factual.kcal * factualMassG) / 100,
    fat_g: (factual.fat_g * factualMassG) / 100,
    saturated_fat_g:
      factual.saturated_fat_g === null ? null : (factual.saturated_fat_g * factualMassG) / 100,
    carbohydrate_g: (factual.carbohydrate_g * factualMassG) / 100,
    sugars_g: (factual.sugars_g * factualMassG) / 100,
    protein_g: (factual.protein_g * factualMassG) / 100,
    salt_g: (factual.salt_g * factualMassG) / 100,
    fiber_g: (factual.fiber_g * factualMassG) / 100,
  };
  for (const item of labelItems) {
    const grams = item.effective_grams;
    const label = item.ingredient.label_nutrition_per_100g;
    total.kcal += (label.energyKcal * grams) / 100;
    total.fat_g += (label.fat * grams) / 100;
    if (label.saturatedFat === null) total.saturated_fat_g = null;
    else if (total.saturated_fat_g !== null) {
      total.saturated_fat_g += (label.saturatedFat * grams) / 100;
    }
    total.carbohydrate_g += (label.carbohydrate * grams) / 100;
    if (label.sugars === null) total.sugars_g = null;
    else if (total.sugars_g !== null) total.sugars_g += (label.sugars * grams) / 100;
    total.protein_g += (label.protein * grams) / 100;
    total.salt_g += (label.salt * grams) / 100;
    if (label.fibre === null) total.fiber_g = null;
    else if (total.fiber_g !== null) total.fiber_g += (label.fibre * grams) / 100;
  }
  const per100 = (value: number) => (value / finalMassG) * 100;
  return {
    kcal: per100(total.kcal),
    fat_g: per100(total.fat_g),
    saturated_fat_g: total.saturated_fat_g === null ? null : per100(total.saturated_fat_g),
    carbohydrate_g: per100(total.carbohydrate_g),
    sugars_g: total.sugars_g === null ? null : per100(total.sugars_g),
    protein_g: per100(total.protein_g),
    salt_g: per100(total.salt_g),
    fiber_g: total.fiber_g === null ? null : per100(total.fiber_g),
    alcohol_g: labelItems.length === 0 ? factual.alcohol_g : null,
  };
}

function combineCosts(
  factual: RecipeCosts | null,
  labelItems: readonly EffectiveCatalogLabelToppingItem[],
  finalMassG: number,
): RecipeCosts | null {
  if (!factual) return null;
  const missing = [...factual.missing_cost_ingredient_ids];
  // `total_cost` fallback keeps older stored calculation artifacts readable;
  // every current Engine result publishes the explicit known subtotal.
  let knownTotal = factual.known_cost ?? factual.total_cost ?? 0;
  for (const item of labelItems) {
    const price = item.ingredient.cost_per_kg;
    if (price === null) missing.push(item.ingredient.id);
    else knownTotal += (item.effective_grams / 1000) * price;
  }
  const complete = factual.complete && missing.length === 0;
  const totalCost = complete ? knownTotal : null;
  const perKg = complete && finalMassG > 0 ? (knownTotal / finalMassG) * 1000 : null;
  const serving = (grams: number) => (perKg === null ? null : (perKg * grams) / 1000);
  return {
    known_cost: knownTotal,
    total_cost: totalCost,
    cost_per_kg: perKg,
    cost_per_serving_60g: serving(60),
    cost_per_serving_70g: serving(70),
    cost_per_serving_80g: serving(80),
    complete,
    missing_cost_ingredient_ids: [...new Set(missing)],
  };
}

export function calculateFinalProduct(
  baseInput: RecipeInput,
  toppings: readonly RecipeToppingItem[] = [],
  context: ToppingMassContext = 'planning',
): FinalProductCalculation {
  const baseResult = calculateRecipe(baseInput);
  const scienceItems = toppings.flatMap((item) => {
    const next = scienceToppingItem(item, context);
    return next ? [next] : [];
  });
  const scienceInputItems = [...baseInput.items.map((item) => ({ ...item })), ...scienceItems];
  const factualMassG = scienceInputItems.reduce(
    (sum, item) => sum + (item.actual_grams ?? item.planned_grams),
    0,
  );
  const factualFinalResult = calculateRecipe({
    ...baseInput,
    items: scienceInputItems,
    target_batch_grams: factualMassG,
  });
  const labelItems = toppings.flatMap((item) => {
    const next = labelToppingItem(item, context);
    return next ? [next] : [];
  });
  const toppingMassG = toppings.reduce(
    (sum, item) => sum + toppingEffectiveGrams(item, context),
    0,
  );
  const finalMassG = factualMassG + labelItems.reduce((sum, item) => sum + item.effective_grams, 0);
  return {
    baseResult,
    finalItems: [...factualFinalResult.items, ...labelItems],
    finalNutritionPer100g: labelItems.length === 0 ? factualFinalResult.nutrition_per_100g : null,
    finalLabelNutritionPer100g: combineLabelNutrition(
      factualFinalResult.nutrition_per_100g,
      factualMassG,
      labelItems,
      finalMassG,
    ),
    finalCosts: combineCosts(factualFinalResult.costs, labelItems, finalMassG),
    baseMassG: baseResult.total_batch_g,
    toppingMassG,
    finalMassG,
    toppingCount: toppings.length,
  };
}
