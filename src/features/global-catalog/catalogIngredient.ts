import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { CatalogProductSearchHit } from './contracts';

export function mappedCatalogIngredient(
  hit: CatalogProductSearchHit,
  row: IngredientRow,
): EngineIngredient {
  const reference = ingredientRowToEngineIngredient(row);
  return {
    ...reference,
    id: `catalog:${hit.id}`,
    canonical_ingredient_id: row.ingredient_id,
    private_product_id: hit.currentVersionId
      ? `catalog:${hit.id}:version:${hit.currentVersionId}`
      : `catalog:${hit.id}`,
    identity_provenance: 'reference',
    name: hit.brand ? `${hit.brand} · ${hit.displayName}` : hit.displayName,
    source_type: hit.status === 'verified' ? 'producer_label' : 'manual',
    is_verified: hit.status === 'verified',
    confidence_score: hit.status === 'verified' ? 95 : 65,
    cost_per_kg: hit.privatePricePerKg ?? reference.cost_per_kg,
    cost_currency: hit.privatePricePerKg === null || hit.privatePricePerKg === undefined
      ? reference.cost_currency
      : (hit.privatePriceCurrency ?? 'EUR'),
    cost_source: hit.privatePricePerKg === null || hit.privatePricePerKg === undefined
      ? 'reference'
      : 'private',
  };
}

function numberAt(data: Record<string, unknown>, key: string): number | null {
  const nutrition = data.nutrition;
  if (!nutrition || typeof nutrition !== 'object') return null;
  const value = (nutrition as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const REQUIRED_LABEL_TOPPING_FACTS = [
  'fat',
  'protein',
  'carbohydrate',
  'salt',
  'energyKcal',
] as const;

export function catalogHasCompleteToppingFacts(hit: CatalogProductSearchHit): boolean {
  const nutrition = hit.publicData.nutrition;
  return hit.usableAsTopping
    && hit.status !== 'blocked'
    && typeof nutrition === 'object'
    && nutrition !== null
    && (nutrition as Record<string, unknown>).basis === 'per_100g'
    && REQUIRED_LABEL_TOPPING_FACTS.every((key) => numberAt(hit.publicData, key) !== null)
    && typeof hit.publicData.ingredientsText === 'string'
    && hit.publicData.ingredientsText.trim().length > 0
    && typeof hit.publicData.allergensText === 'string'
    && hit.publicData.allergensText.trim().length > 0;
}

/** Product-layer Topping handoff. No composition, PAC, POD, water, solids,
 * sugar fractions or Engine approval are invented. */
export function labelOnlyCatalogToppingIngredient(
  hit: CatalogProductSearchHit,
): CatalogLabelToppingIngredient | null {
  if (!catalogHasCompleteToppingFacts(hit)) return null;
  const fat = numberAt(hit.publicData, 'fat');
  const carbohydrate = numberAt(hit.publicData, 'carbohydrate');
  const protein = numberAt(hit.publicData, 'protein');
  const salt = numberAt(hit.publicData, 'salt');
  const energy = numberAt(hit.publicData, 'energyKcal');
  const fibre = numberAt(hit.publicData, 'fibre');
  const sugars = numberAt(hit.publicData, 'sugars');
  const saturatedFat = numberAt(hit.publicData, 'saturatedFat');
  if ([fat, carbohydrate, protein, salt, energy].some(
    (value) => value === null,
  )) return null;
  const catalogIdentity = `catalog:${hit.id}`;
  return {
    kind: 'catalog_label_topping',
    id: catalogIdentity,
    canonical_ingredient_id: catalogIdentity,
    private_product_id: hit.currentVersionId
      ? `catalog:${hit.id}:version:${hit.currentVersionId}`
      : catalogIdentity,
    name: hit.brand ? `${hit.brand} · ${hit.displayName}` : hit.displayName,
    catalog_product_id: hit.id,
    catalog_version_id: hit.currentVersionId ?? null,
    verification_status: hit.status === 'verified' ? 'verified' : 'manual_unverified',
    label_nutrition_per_100g: {
      basis: 'per_100g',
      energyKcal: energy!,
      fat: fat!,
      saturatedFat,
      carbohydrate: carbohydrate!,
      sugars,
      protein: protein!,
      salt: salt!,
      fibre,
    },
    ingredients_text: hit.publicData.ingredientsText as string,
    allergens_text: hit.publicData.allergensText as string,
    cost_per_kg: hit.privatePricePerKg ?? null,
    cost_currency: hit.privatePricePerKg === null || hit.privatePricePerKg === undefined
      ? null
      : (hit.privatePriceCurrency ?? 'EUR'),
  };
}
