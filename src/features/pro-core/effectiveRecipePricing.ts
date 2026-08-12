import type { EngineIngredient, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type {
  CustomerIngredientPriceOverride,
  EffectiveIngredientCost,
} from '@/features/pro-core/costContracts';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  effectiveLineCost,
  isCustomerPriceCanonicalIngredientId,
  resolveEffectiveIngredientCost,
} from '@/features/pro-core/costing';
export const CUSTOMER_COST_CURRENCY = 'EUR';
export type CustomerPriceIndex = Readonly<
  Record<string, CustomerIngredientPriceOverride | undefined>
>;

/** Only an explicit Mapper canonical identity may own a private customer price. */
export function customerPriceCanonicalId(ingredient: EngineIngredient): string | null {
  const explicit = ingredient.canonical_ingredient_id?.trim();
  if (explicit && isCustomerPriceCanonicalIngredientId(explicit)) return explicit;
  const sourceId = ingredient.id.trim();
  return isCustomerPriceCanonicalIngredientId(sourceId) ? sourceId : null;
}

export const canPersistCustomerPrice = (ingredient: EngineIngredient): boolean =>
  customerPriceCanonicalId(ingredient) !== null;

export function effectiveCostForIngredient(
  ingredient: EngineIngredient,
  overrides: CustomerPriceIndex,
  currency = CUSTOMER_COST_CURRENCY,
): EffectiveIngredientCost {
  const id = canonicalIngredientId(ingredient);
  return resolveEffectiveIngredientCost({
    canonicalIngredientId: id,
    mapperPricePerKg: ingredient.cost_per_kg,
    mapperCurrency: ingredient.cost_currency ?? null,
    customerOverride: overrides[id] ?? null,
    targetCurrency: currency,
  });
}

/**
 * Immutable pricing projection. Composition, grams, roles and every scientific
 * input stay byte-identical; only the per-run cost field is replaced.
 */
export function applyEffectiveCustomerPrices(
  input: RecipeInput,
  overrides: CustomerPriceIndex,
  currency = CUSTOMER_COST_CURRENCY,
): RecipeInput {
  return {
    ...input,
    items: input.items.map((item) => {
      const effective = effectiveCostForIngredient(item.ingredient, overrides, currency);
      return {
        ...item,
        ingredient: {
          ...item.ingredient,
          cost_per_kg: effective.pricePerKg,
          cost_currency: effective.pricePerKg === null ? null : effective.currency,
        },
      };
    }),
  };
}

/** Product-layer equivalent for POST_PROCESS_ADDON lines. It is a transient
 * runtime projection only; canonical recipe/version sidecars keep Mapper facts
 * and never freeze a customer's private current price. */
export function applyEffectiveCustomerPricesToToppings(
  toppings: readonly RecipeToppingItem[],
  overrides: CustomerPriceIndex,
  currency = CUSTOMER_COST_CURRENCY,
): RecipeToppingItem[] {
  return toppings.map((item) => {
    const effective = effectiveCostForIngredient(item.ingredient, overrides, currency);
    return {
      ...item,
      ingredient: {
        ...item.ingredient,
        cost_per_kg: effective.pricePerKg,
        cost_currency: effective.pricePerKg === null ? null : effective.currency,
      },
    };
  });
}

export interface EffectiveRecipeCostSummary {
  currency: string;
  totalCost: number | null;
  costPerKg: number | null;
  knownCost: number;
  complete: boolean;
  missingCanonicalIngredientIds: string[];
}

export function summarizeEffectiveRecipeCost(
  input: RecipeInput,
  overrides: CustomerPriceIndex,
  currency = CUSTOMER_COST_CURRENCY,
): EffectiveRecipeCostSummary {
  let knownCost = 0;
  let totalGrams = 0;
  const missingCanonicalIngredientIds: string[] = [];
  for (const item of input.items) {
    totalGrams += item.planned_grams;
    const resolution = effectiveCostForIngredient(item.ingredient, overrides, currency);
    const line = effectiveLineCost(item.planned_grams, resolution);
    if (line === null) missingCanonicalIngredientIds.push(resolution.canonicalIngredientId);
    else knownCost += line;
  }
  const complete = missingCanonicalIngredientIds.length === 0;
  return {
    currency,
    totalCost: complete ? knownCost : null,
    costPerKg: complete && totalGrams > 0 ? (knownCost / totalGrams) * 1000 : null,
    knownCost,
    complete,
    missingCanonicalIngredientIds,
  };
}
