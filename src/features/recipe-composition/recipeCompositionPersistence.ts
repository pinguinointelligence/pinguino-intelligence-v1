import type { EngineIngredient } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { savedEngineIngredientSchema } from '@/features/recipes/recipePayload';
import {
  cloneToppingIngredient,
  toppingIngredientIdentity,
  type CatalogLabelToppingIngredient,
  type RecipeToppingIngredient,
} from './labelTopping';
import {
  readProductBehaviorSnapshot,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';

export type {
  CatalogLabelNutritionPer100g,
  CatalogLabelToppingIngredient,
  RecipeToppingIngredient,
} from './labelTopping';

export interface RecipeToppingItem {
  id: string;
  ingredient: RecipeToppingIngredient;
  planned_grams: number;
  actual_grams: number | null;
  process_scope: 'POST_PROCESS_ADDON';
  addon_sort_order: number;
  production_step?: number;
  notes?: string;
}

export interface RecipeCompositionMetadata {
  schemaVersion: 1;
  baseScope: 'BASE_FORMULATION';
  baseOrder: string[];
  toppings: RecipeToppingItem[];
  /** Immutable per-line product/version/policy authority consumed by every
   * downstream module. Optional on legacy payloads; absent never grants Main. */
  behaviorSnapshots?: Record<string, ProductBehaviorSnapshot>;
  migrationAmbiguities: Array<{ lineId: string; reason: string }>;
}

export type RecipeCompositionAmbiguity = RecipeCompositionMetadata['migrationAmbiguities'][number];

const REQUIRED_COMPOSITION_FIELDS = [
  'water_percent',
  'solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'sugar_percent',
  'sucrose_percent',
  'glucose_percent',
  'dextrose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'kcal_per_100g',
] as const;

const LABEL_NUTRITION_REQUIRED_FIELDS = [
  'energyKcal', 'fat', 'carbohydrate', 'protein', 'salt',
] as const;
const LABEL_NUTRITION_OPTIONAL_FIELDS = ['saturatedFat', 'sugars', 'fibre'] as const;

const validLabelToppingIngredient = (value: unknown): value is CatalogLabelToppingIngredient => {
  if (!value || typeof value !== 'object') return false;
  const ingredient = value as Partial<CatalogLabelToppingIngredient>;
  const nutrition = ingredient.label_nutrition_per_100g;
  if (!nutrition || nutrition.basis !== 'per_100g') return false;
  const values = LABEL_NUTRITION_REQUIRED_FIELDS.map((field) => nutrition[field]);
  const optionalValues = LABEL_NUTRITION_OPTIONAL_FIELDS.map((field) => nutrition[field]);
  return ingredient.kind === 'catalog_label_topping'
    && typeof ingredient.id === 'string' && ingredient.id.startsWith('catalog:')
    && typeof ingredient.canonical_ingredient_id === 'string'
    && ingredient.canonical_ingredient_id === ingredient.id
    && typeof ingredient.private_product_id === 'string' && ingredient.private_product_id.length > 0
    && typeof ingredient.name === 'string' && ingredient.name.trim().length > 0
    && typeof ingredient.catalog_product_id === 'string' && ingredient.catalog_product_id.length > 0
    && (ingredient.catalog_version_id === null || typeof ingredient.catalog_version_id === 'string')
    && (ingredient.verification_status === 'verified' || ingredient.verification_status === 'manual_unverified')
    && values.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0)
    && optionalValues.every((entry) => entry === null
      || (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0))
    && nutrition.energyKcal <= 1000
    && [nutrition.fat, nutrition.saturatedFat, nutrition.carbohydrate, nutrition.sugars,
      nutrition.protein, nutrition.salt, nutrition.fibre].every((entry) => entry === null || entry <= 100)
    && (nutrition.saturatedFat === null || nutrition.saturatedFat <= nutrition.fat + 0.01)
    && (nutrition.sugars === null || nutrition.sugars <= nutrition.carbohydrate + 0.01)
    && typeof ingredient.ingredients_text === 'string' && ingredient.ingredients_text.trim().length > 0
    && typeof ingredient.allergens_text === 'string' && ingredient.allergens_text.trim().length > 0
    && (ingredient.cost_per_kg === null || (typeof ingredient.cost_per_kg === 'number' && Number.isFinite(ingredient.cost_per_kg) && ingredient.cost_per_kg >= 0))
    && (ingredient.cost_currency === null || typeof ingredient.cost_currency === 'string');
};

const validTopping = (value: unknown): value is RecipeToppingItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecipeToppingItem>;
  const labelIngredient = validLabelToppingIngredient(item.ingredient) ? item.ingredient : null;
  const parsedIngredient = labelIngredient ? null : savedEngineIngredientSchema.safeParse(item.ingredient);
  const hasCompleteComposition =
    parsedIngredient?.success === true &&
    REQUIRED_COMPOSITION_FIELDS.every(
      (field) => Number.isFinite(parsedIngredient.data.composition[field]),
    );
  const explicitCanonicalId =
    parsedIngredient?.success === true &&
    typeof parsedIngredient.data.canonical_ingredient_id === 'string'
      ? parsedIngredient.data.canonical_ingredient_id.trim()
      : '';
  const resolvedCanonicalId = parsedIngredient?.success === true
    ? canonicalIngredientId(parsedIngredient.data as unknown as EngineIngredient).trim()
    : '';
  return (
    typeof item.id === 'string' &&
    item.id.trim().length > 0 &&
    ((labelIngredient !== null) || (
      parsedIngredient?.success === true &&
      hasCompleteComposition &&
      explicitCanonicalId.length > 0 &&
      explicitCanonicalId === resolvedCanonicalId
    )) &&
    typeof item.planned_grams === 'number' &&
    Number.isFinite(item.planned_grams) &&
    item.planned_grams >= 0 &&
    (item.actual_grams === null ||
      (typeof item.actual_grams === 'number' &&
        Number.isFinite(item.actual_grams) &&
        item.actual_grams >= 0)) &&
    item.process_scope === 'POST_PROCESS_ADDON' &&
    Number.isInteger(item.addon_sort_order) &&
    Number(item.addon_sort_order) >= 0 &&
    (item.production_step === undefined ||
      (typeof item.production_step === 'number' &&
        Number.isFinite(item.production_step) &&
        item.production_step > 0)) &&
    (item.notes === undefined || typeof item.notes === 'string')
  );
};

export function readRecipeCompositionMetadata(
  value: unknown,
  baseLineIds: readonly string[] = [],
): RecipeCompositionMetadata | null {
  const raw = value as RecipeCompositionMetadata | null | undefined;
  if (!raw || raw.schemaVersion !== 1 || raw.baseScope !== 'BASE_FORMULATION') return null;
  const migrationAmbiguities: RecipeCompositionAmbiguity[] = Array.isArray(
    raw.migrationAmbiguities,
  )
    ? raw.migrationAmbiguities.filter(
        (item): item is RecipeCompositionAmbiguity =>
          !!item && typeof item.lineId === 'string' && typeof item.reason === 'string',
      )
    : [];
  const seenCanonicalIds = new Set<string>();
  const seenLineIds = new Set<string>();
  const baseIds = new Set(baseLineIds);
  const toppings: RecipeToppingItem[] = [];
  for (const [index, candidate] of (Array.isArray(raw.toppings) ? raw.toppings : []).entries()) {
    const lineId =
      candidate && typeof candidate === 'object' && typeof (candidate as { id?: unknown }).id === 'string'
        ? (candidate as { id: string }).id
        : `topping-${index + 1}`;
    if (!validTopping(candidate)) {
      migrationAmbiguities.push({ lineId, reason: 'INVALID_TOPPING_RECORD' });
      continue;
    }
    const canonicalId = toppingIngredientIdentity(candidate.ingredient);
    if (!canonicalId) {
      migrationAmbiguities.push({ lineId, reason: 'TOPPING_CANONICAL_ID_MISSING' });
      continue;
    }
    if (seenLineIds.has(candidate.id)) {
      migrationAmbiguities.push({ lineId, reason: 'DUPLICATE_TOPPING_LINE_ID' });
      continue;
    }
    if (baseIds.has(candidate.id)) {
      migrationAmbiguities.push({ lineId, reason: 'CROSS_SCOPE_LINE_ID_COLLISION' });
      continue;
    }
    if (seenCanonicalIds.has(canonicalId)) {
      migrationAmbiguities.push({ lineId, reason: 'DUPLICATE_TOPPING_CANONICAL_ID' });
      continue;
    }
    seenLineIds.add(candidate.id);
    seenCanonicalIds.add(canonicalId);
    if (!Number.isInteger(candidate.addon_sort_order) || candidate.addon_sort_order < 0) {
      migrationAmbiguities.push({ lineId, reason: 'INVALID_TOPPING_SORT_ORDER_NORMALIZED' });
    }
    toppings.push(candidate);
  }
  const toppingIds = new Set(toppings.map((item) => item.id));
  const behaviorSnapshots: Record<string, ProductBehaviorSnapshot> = {};
  const rawSnapshots = raw.behaviorSnapshots && typeof raw.behaviorSnapshots === 'object'
    ? raw.behaviorSnapshots
    : {};
  for (const [lineId, candidate] of Object.entries(rawSnapshots)) {
    const snapshot = readProductBehaviorSnapshot(candidate);
    const expectedScope = baseIds.has(lineId)
      ? 'BASE_FORMULATION'
      : toppingIds.has(lineId)
        ? 'POST_PROCESS_ADDON'
        : null;
    if (!snapshot || snapshot.lineId !== lineId || expectedScope === null) {
      migrationAmbiguities.push({ lineId, reason: 'INVALID_PRODUCT_BEHAVIOR_SNAPSHOT' });
      continue;
    }
    if (snapshot.processScope !== expectedScope) {
      migrationAmbiguities.push({ lineId, reason: 'PRODUCT_BEHAVIOR_SCOPE_MISMATCH' });
      continue;
    }
    behaviorSnapshots[lineId] = snapshot;
  }
  const baseOrder: string[] = [];
  const seenBaseLineIds = new Set<string>();
  for (const [index, candidate] of (Array.isArray(raw.baseOrder) ? raw.baseOrder : []).entries()) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      migrationAmbiguities.push({
        lineId: `base-order-${index + 1}`,
        reason: 'INVALID_BASE_ORDER_ENTRY',
      });
      continue;
    }
    if (seenBaseLineIds.has(candidate)) {
      migrationAmbiguities.push({ lineId: candidate, reason: 'DUPLICATE_BASE_ORDER_ENTRY' });
      continue;
    }
    seenBaseLineIds.add(candidate);
    baseOrder.push(candidate);
  }
  return {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder,
    toppings: toppings.map((item, index) => ({ ...item, addon_sort_order: index })),
    ...(Object.keys(behaviorSnapshots).length > 0 ? { behaviorSnapshots } : {}),
    migrationAmbiguities,
  };
}

export function recipeCompositionFromState(state: {
  items: readonly { id: string }[];
  baseOrder?: readonly string[];
  toppings?: readonly RecipeToppingItem[];
  compositionMigrationAmbiguities?: readonly { lineId: string; reason: string }[];
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}): RecipeCompositionMetadata {
  const itemIds = new Set(state.items.map((item) => item.id));
  const baseOrder = [
    ...(state.baseOrder ?? []).filter((id) => itemIds.has(id)),
    ...state.items.map((item) => item.id).filter((id) => !(state.baseOrder ?? []).includes(id)),
  ];
  const behaviorSnapshots = Object.fromEntries(
    Object.entries(state.productBehaviorSnapshots ?? {})
      .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
      .map(([lineId, snapshot]) => [lineId, structuredClone(snapshot)]),
  );
  return {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder,
    toppings: (state.toppings ?? []).map((item, index) => ({
      ...item,
      ingredient: cloneToppingIngredient(item.ingredient),
      addon_sort_order: index,
    })),
    ...(Object.keys(behaviorSnapshots).length > 0 ? { behaviorSnapshots } : {}),
    migrationAmbiguities: (state.compositionMigrationAmbiguities ?? []).map((item) => ({ ...item })),
  };
}
