import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
  type ProductionSession,
} from './productionSession';
import { productionTestComposition } from './productionTestComposition.fixture';

const [mapperHeader = [], ...mapperRecords] = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperIndex = new Map(mapperHeader.map((name, position) => [name, position]));
const mapperRecordsById = new Map(
  mapperRecords.map((record) => [record[mapperIndex.get('ingredient_id')!]!, record]),
);
const mapperTriStateFields = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const mapperNumericFields = new Set(
  mapperHeader.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);

const mapperIngredient = (ingredientId: string) => {
  const record = mapperRecordsById.get(ingredientId);
  if (!record) throw new Error(`Missing immutable Mapper row ${ingredientId}`);
  const row = Object.fromEntries(
    mapperHeader.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (mapperTriStateFields.has(field)) return [field, raw.toLocaleLowerCase('en')];
      if (mapperNumericFields.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      ) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at') {
        return [field, raw || null];
      }
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
  return ingredientRowToEngineIngredient(row);
};

export const OWNER_RESCUE_RECIPE: RecipeInput = {
  items: [
    ['milk', 'PI-ING-000236', 201, 'unlocked'],
    ['cream', 'PI-ING-000180', 125, 'unlocked'],
    ['skimmed_milk', 'PI-ING-000270', 50, 'unlocked'],
    ['sucrose', 'PI-ING-000514', 31, 'unlocked'],
    ['dextrose', 'PI-ING-000494', 77, 'unlocked'],
    ['tara', 'PI-ING-000492', 2, 'unlocked'],
    ['strawberries', 'PI-ING-001553', 92, 'main'],
    ['watermelon', 'PI-ING-000405', 92, 'main'],
  ].map(([id, ingredientId, grams, lockType]) => ({
    id: String(id),
    ingredient: mapperIngredient(String(ingredientId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: lockType as 'unlocked' | 'main',
  })),
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -13,
  target_batch_grams: 670,
  machine_capacity_grams: 670,
  goals: {
    formulation_strategy: 'optimal',
    cost_priority: 'balanced',
    flavor_intensity: 'balanced',
    direction_targets_active: true,
    direction_targets: { flavor: 0, softness: 0, sweetness: 1, creaminess: 0 },
    excluded_ingredient_ids: [],
    unavailable_main_ingredient_ids: [],
  },
};

export const makeOwnerRescueSession = (): ProductionSession =>
  createProductionSession({
    sessionId: 'owner-670-rescue',
    ownerUserId: 'owner',
    source: {
      recipeId: 'owner-recipe',
      recipeVersionId: 'owner-version',
      recipeVersionNumber: 1,
      recipeName: 'Owner strawberry watermelon gelato',
    },
    plannedInput: OWNER_RESCUE_RECIPE,
    plannedComposition: productionTestComposition(OWNER_RESCUE_RECIPE),
    startedAt: '2026-09-05T10:00:00.000Z',
  });

export const confirmOwnerRescueLines = (
  session: ProductionSession,
  values: ReadonlyArray<readonly [lineId: string, grams: number]>,
): ProductionSession =>
  values.reduce(
    (current, [lineId, grams], index) =>
      confirmProductionLine(
        setDraftActualGrams(current, lineId, grams),
        lineId,
        `2026-09-05T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
      ),
    session,
  );
