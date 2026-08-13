import type { EngineIngredient } from '@/engine';

/** Standard facts copied from a commercial label. This deliberately excludes
 * water, solids, individual sugar fractions, PAC/POD and every Engine approval. */
export interface CatalogLabelNutritionPer100g {
  basis: 'per_100g';
  energyKcal: number;
  fat: number;
  saturatedFat: number | null;
  carbohydrate: number;
  sugars: number | null;
  protein: number;
  salt: number;
  fibre: number | null;
}

/** Product-layer POST_PROCESS_ADDON identity. It is never a RecipeInput
 * ingredient and therefore can never enter Base formulation or Engine science. */
export interface CatalogLabelToppingIngredient {
  kind: 'catalog_label_topping';
  id: string;
  canonical_ingredient_id: string;
  private_product_id: string;
  name: string;
  catalog_product_id: string;
  catalog_version_id: string | null;
  verification_status: 'verified' | 'manual_unverified';
  label_nutrition_per_100g: CatalogLabelNutritionPer100g;
  ingredients_text: string;
  allergens_text: string;
  cost_per_kg: number | null;
  cost_currency: string | null;
}

export type RecipeToppingIngredient = EngineIngredient | CatalogLabelToppingIngredient;

export function isCatalogLabelToppingIngredient(
  ingredient: RecipeToppingIngredient,
): ingredient is CatalogLabelToppingIngredient {
  return 'kind' in ingredient && ingredient.kind === 'catalog_label_topping';
}

export function toppingIngredientIdentity(ingredient: RecipeToppingIngredient): string {
  return ingredient.canonical_ingredient_id?.trim() || ingredient.id.trim();
}

export function cloneToppingIngredient(
  ingredient: RecipeToppingIngredient,
): RecipeToppingIngredient {
  if (isCatalogLabelToppingIngredient(ingredient)) {
    return {
      ...ingredient,
      label_nutrition_per_100g: { ...ingredient.label_nutrition_per_100g },
    };
  }
  return {
    ...ingredient,
    composition: { ...ingredient.composition },
    flags: ingredient.flags ? { ...ingredient.flags } : undefined,
  };
}
