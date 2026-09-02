import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';

export interface CarbonatedProductionProduct {
  productId: string;
  name: string;
  grams: number;
}

/** Process-only projection. It reads no Engine result and changes no formula. */
export function carbonatedProductsForRecipe(
  recipe: Pick<RecipeInput, 'items'>,
  composition: Pick<RecipeCompositionMetadata, 'toppings'>,
): CarbonatedProductionProduct[] {
  const products = new Map<string, CarbonatedProductionProduct>();
  const add = (ingredient: RecipeInput['items'][number]['ingredient'], grams: number) => {
    if (ingredient.carbonation_status !== 'CARBONATED') return;
    const productId = ingredient.canonical_ingredient_id?.trim() || ingredient.id.trim();
    const current = products.get(productId);
    products.set(productId, {
      productId,
      name: current?.name ?? ingredient.name,
      grams: (current?.grams ?? 0) + grams,
    });
  };
  for (const item of recipe.items) add(item.ingredient, item.planned_grams);
  for (const item of composition.toppings) {
    if (item.ingredient.carbonation_status !== 'CARBONATED') continue;
    const productId =
      item.ingredient.canonical_ingredient_id?.trim() || item.ingredient.id.trim();
    const current = products.get(productId);
    products.set(productId, {
      productId,
      name: current?.name ?? item.ingredient.name,
      grams: (current?.grams ?? 0) + item.planned_grams,
    });
  }
  return [...products.values()];
}
