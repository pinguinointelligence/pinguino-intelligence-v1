/**
 * Deterministic Sorbet fixtures for the freezing-authority tests — REAL Mapper
 * compositions (docs/ingredients/validation/mapper_basement.csv, the immutable
 * 2089-row source of truth) and the REAL canonical Sorbet starter scaffold.
 * Nothing here is invented: the Multi-Main base is the same owner-approved
 * strawberry + lime 60 % identity exercised by the 150-cell Direction matrix.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineIngredient, RecipeInput, RecipeItem } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';

export type SorbetServingTemperature = -11 | -12 | -13;

const SERVING_MODE: Readonly<
  Record<SorbetServingTemperature, 'temp_minus_11' | 'temp_minus_12' | 'temp_minus_13'>
> = { [-11]: 'temp_minus_11', [-12]: 'temp_minus_12', [-13]: 'temp_minus_13' };

/** Owner-approved exact Sorbet Main identities (60 % group). */
export const SORBET_MAIN_IDS = Object.freeze({
  strawberry: 'PI-ING-001553',
  lime: 'PI-ING-000369',
  mango: 'PI-ING-000340',
});

const TRI_STATE = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (TRI_STATE.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};

let mapperRows: Map<string, IngredientRow> | null = null;
const loadMapperRows = (): Map<string, IngredientRow> => {
  if (mapperRows) return mapperRows;
  const grid = parseCsv(
    readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
  );
  const header = grid[0]!;
  mapperRows = new Map(
    grid.slice(1).map((cells) => {
      const row = Object.fromEntries(
        header.map((name, index) => [name, cell(cells[index] ?? '', name)]),
      ) as unknown as IngredientRow;
      return [row.ingredient_id, row] as const;
    }),
  );
  return mapperRows;
};

/** Real Mapper ingredient by canonical id (throws on an unknown id). */
export function sorbetMapperIngredient(id: string): EngineIngredient {
  const row = loadMapperRows().get(id);
  if (!row) throw new Error(`Missing Mapper fixture ${id}`);
  return ingredientRowToEngineIngredient(row);
}

/** Line ids used by the fixture so tests can address them without guessing. */
export const SORBET_FIXTURE_LINE = Object.freeze({
  strawberry: 'main-strawberry',
  lime: 'main-lime',
});

/**
 * Complete 1000 g Sorbet BASE: strawberry + lime Multi-Main at the exact 600 g
 * owner target (2:1 → 400/200 g, 1:1 → 300/300 g) over the canonical Sorbet
 * starter scaffold for the requested serving temperature. Mass sums to 1000 g.
 */
export function sorbetMultiMainBase(
  temperature: SorbetServingTemperature,
  weights: readonly [number, number] = [2, 1],
): RecipeInput {
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: SERVING_MODE[temperature],
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  const equal = weights[0] === weights[1];
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: temperature,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [
      {
        id: SORBET_FIXTURE_LINE.strawberry,
        ingredient: sorbetMapperIngredient(SORBET_MAIN_IDS.strawberry),
        planned_grams: equal ? 300 : 400,
        actual_grams: null,
        lock_type: 'main',
        main_ratio_weight: weights[0],
      },
      {
        id: SORBET_FIXTURE_LINE.lime,
        ingredient: sorbetMapperIngredient(SORBET_MAIN_IDS.lime),
        planned_grams: equal ? 300 : 200,
        actual_grams: null,
        lock_type: 'main',
        main_ratio_weight: weights[1],
      },
      ...scaffold.items.map((item) => ({
        ...item,
        ingredient: sorbetMapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
      })),
    ],
    goals: { formulation_strategy: 'optimal' },
  };
}

/** The neutral canonical Sorbet starter (scaffold only, Main still to be chosen). */
export function neutralSorbetStarter(temperature: SorbetServingTemperature): RecipeInput {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: SERVING_MODE[temperature],
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
}

/**
 * Complete frozen ProductBehavior authority for a Sorbet recipe: structural
 * lines from the shared test fixture, Main lines bound to the owner-approved
 * exact 60 % Sorbet policy (`main-sorbet-exact-fruit-60-v1`).
 */
export function sorbetAuthoritySnapshots(
  recipe: RecipeInput,
  toppings: readonly RecipeToppingItem[] = [],
): Record<string, ProductBehaviorSnapshot> {
  const snapshots = productBehaviorTestSnapshots(recipe, toppings);
  for (const item of recipe.items) {
    if (item.lock_type !== 'main') continue;
    const base = snapshots[item.id];
    if (!base?.sharedFacts) throw new Error(`Sorbet fixture snapshot missing for ${item.id}`);
    snapshots[item.id] = {
      ...base,
      familyId: 'fruit',
      subfamilyId: 'berry',
      formId: 'fresh',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainPolicyId: 'main-sorbet-exact-fruit-60-v1',
      mainPolicyVersion: '1',
      ecoFloorPercent: 60,
      optimalCeilingPercent: 60,
      hardLimitPercent: 60,
      multiMainHardLimitPercent: 60,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      sharedFacts: { ...base.sharedFacts, profileEligibility: ['sorbet'] },
    };
  }
  return snapshots;
}

const lineEndingWith = (recipe: RecipeInput, suffix: string): RecipeItem => {
  const item = recipe.items.find((candidate) => candidate.id.endsWith(suffix));
  if (!item) throw new Error(`Sorbet fixture has no line ending with ${suffix}`);
  return item;
};

/** Same batch mass, stabilizer system pushed above the owner maximum (0.5 %). */
export function overStabilizedSorbet(recipe: RecipeInput): RecipeInput {
  const tara = lineEndingWith(recipe, 'tara_gum');
  const water = lineEndingWith(recipe, 'water');
  const delta = 9 - tara.planned_grams;
  return {
    ...recipe,
    items: recipe.items.map((item) =>
      item.id === tara.id
        ? { ...item, planned_grams: 9 }
        : item.id === water.id
          ? { ...item, planned_grams: item.planned_grams - delta }
          : item,
    ),
  };
}

/**
 * Same batch mass with a polyol line (5 g, 0.5 % of mix — far above the 0.05 %
 * trace tolerance): a freeze-active solute outside the published F/G/S model,
 * so the composition solver must fail closed (no invented coefficient).
 */
export function unsupportedSorbet(recipe: RecipeInput): RecipeInput {
  const water = lineEndingWith(recipe, 'water');
  const template = lineEndingWith(recipe, 'sucrose').ingredient;
  const polyol: EngineIngredient = {
    ...template,
    id: 'fixture-polyol',
    canonical_ingredient_id: undefined,
    name: 'Fixture polyol (unsupported freeze-active solute)',
    composition: {
      ...template.composition,
      water_percent: 0,
      solids_percent: 100,
      carbohydrate_percent: 100,
      sugar_percent: 0,
      sucrose_percent: 0,
      dextrose_percent: 0,
      glucose_percent: 0,
      fructose_percent: 0,
      polyol_percent: 100,
    },
  };
  return {
    ...recipe,
    items: [
      ...recipe.items.map((item) =>
        item.id === water.id ? { ...item, planned_grams: item.planned_grams - 5 } : item,
      ),
      {
        id: 'fixture-polyol',
        ingredient: polyol,
        planned_grams: 5,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ],
  };
}

/** A post-process topping line built from a real Mapper ingredient. */
export function sorbetTopping(id: string, grams: number): RecipeToppingItem {
  return {
    id,
    ingredient: sorbetMapperIngredient(SORBET_MAIN_IDS.mango),
    planned_grams: grams,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: 0,
  };
}
