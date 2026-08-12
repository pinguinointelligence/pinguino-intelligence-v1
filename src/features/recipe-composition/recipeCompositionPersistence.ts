import type { EngineIngredient } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { savedEngineIngredientSchema } from '@/features/recipes/recipePayload';

export interface RecipeToppingItem {
  id: string;
  ingredient: EngineIngredient;
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

const validTopping = (value: unknown): value is RecipeToppingItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecipeToppingItem>;
  const parsedIngredient = savedEngineIngredientSchema.safeParse(item.ingredient);
  const hasCompleteComposition =
    parsedIngredient.success &&
    REQUIRED_COMPOSITION_FIELDS.every(
      (field) => Number.isFinite(parsedIngredient.data.composition[field]),
    );
  const explicitCanonicalId =
    parsedIngredient.success &&
    typeof parsedIngredient.data.canonical_ingredient_id === 'string'
      ? parsedIngredient.data.canonical_ingredient_id.trim()
      : '';
  const resolvedCanonicalId = parsedIngredient.success
    ? canonicalIngredientId(parsedIngredient.data as unknown as EngineIngredient).trim()
    : '';
  return (
    typeof item.id === 'string' &&
    item.id.trim().length > 0 &&
    parsedIngredient.success &&
    hasCompleteComposition &&
    explicitCanonicalId.length > 0 &&
    explicitCanonicalId === resolvedCanonicalId &&
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
    const canonicalId = canonicalIngredientId(candidate.ingredient).trim();
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
    migrationAmbiguities,
  };
}

export function recipeCompositionFromState(state: {
  items: readonly { id: string }[];
  baseOrder?: readonly string[];
  toppings?: readonly RecipeToppingItem[];
  compositionMigrationAmbiguities?: readonly { lineId: string; reason: string }[];
}): RecipeCompositionMetadata {
  const itemIds = new Set(state.items.map((item) => item.id));
  const baseOrder = [
    ...(state.baseOrder ?? []).filter((id) => itemIds.has(id)),
    ...state.items.map((item) => item.id).filter((id) => !(state.baseOrder ?? []).includes(id)),
  ];
  return {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder,
    toppings: (state.toppings ?? []).map((item, index) => ({
      ...item,
      ingredient: {
        ...item.ingredient,
        composition: { ...item.ingredient.composition },
        flags: item.ingredient.flags ? { ...item.ingredient.flags } : undefined,
      },
      addon_sort_order: index,
    })),
    migrationAmbiguities: (state.compositionMigrationAmbiguities ?? []).map((item) => ({ ...item })),
  };
}
