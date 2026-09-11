/**
 * Owner fruit-Main fixtures — INTERACTIVE RECALCULATION PREVIEW + CONFLICT
 * RESOLUTION (owner 2026-09-11).
 *
 * REAL Mapper compositions (docs/ingredients/validation/mapper_basement.csv)
 * and the published fresh-fruit dairy Main policy on WATERMELON (floor 20 %,
 * OPTIMAL 35 %, hard limit 45 %, 30 % approved liquid dairy carrier) — the same
 * construction as the accepted PR #276 regression fixture, extended with the
 * owner's second secondary flavour, CRANBERRY. Nothing here is invented.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { RecipeInput, RecipeItem } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { parseCsv } from '@/lib/csv';

const NUMERIC = new Set([
  'data_confidence_percent',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'saturated_fat_percent',
  'milk_fat_percent',
  'non_fat_milk_solids_percent',
  'protein_percent',
  'aerating_protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'ash_percent',
  'acidity_percent',
  'brix',
  'dry_matter_percent',
  'pod_value',
  'pac_value',
  'de_value',
  'sweetness_factor',
  'freezing_factor',
  'stabilizer_activity',
  'recommended_dosage_percent_min',
  'recommended_dosage_percent_max',
  'kcal_per_100g',
  'cost_per_kg',
  'shelf_life_days',
]);

let rows: Map<string, IngredientRow> | null = null;
const mapperRow = (ingredientId: string): IngredientRow => {
  if (rows === null) {
    const [header = [], ...records] = parseCsv(
      readFileSync(
        resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
        'utf8',
      ),
    );
    rows = new Map(
      records.map((record) => {
        const row = Object.fromEntries(
          header.map((field, position) => {
            const raw = record[position]?.trim() ?? '';
            if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
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
        return [row.ingredient_id, row] as const;
      }),
    );
  }
  const row = rows.get(ingredientId);
  if (!row) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return row;
};

export const OWNER_IDS = Object.freeze({
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  strawberry: 'PI-ING-001553',
  cranberry: 'PI-ING-001556',
  watermelon: 'PI-ING-000405',
});

export const OWNER_CREATED_AT = '2026-09-11T10:00:00.000Z';

const ownerLine = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeItem['lock_type'] = 'unlocked',
): RecipeItem => ({
  id,
  ingredient: {
    ...ingredientRowToEngineIngredient(mapperRow(ingredientId)),
    cost_per_kg: 1,
    cost_currency: 'EUR',
  },
  planned_grams: grams,
  actual_grams: null,
  lock_type: lockType,
});

/**
 * Milk gelato −11 °C with WATERMELON as the only Main and STRAWBERRY +
 * CRANBERRY as secondary flavours. The base lines scale with the batch and the
 * milk line closes it exactly, so every fixture starts ON its target batch.
 */
export function ownerFruitRecipe({
  batch = 600,
  strawberry = 100,
  cranberry = 130,
  watermelon = Math.round(batch * 0.1),
}: {
  batch?: number;
  strawberry?: number;
  cranberry?: number;
  watermelon?: number;
} = {}): RecipeInput {
  const scale = batch / 1000;
  const base = {
    cream: Math.round(100 * scale),
    smp: Math.round(50 * scale),
    sucrose: Math.round(100 * scale),
    dextrose: Math.round(36 * scale),
    tara: Math.max(2, Math.round(4 * scale)),
  };
  const milk =
    batch -
    strawberry -
    cranberry -
    watermelon -
    Object.values(base).reduce((sum, grams) => sum + grams, 0);
  return {
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: batch,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
    items: [
      ownerLine('milk', OWNER_IDS.milk, milk),
      ownerLine('cream', OWNER_IDS.cream, base.cream),
      ownerLine('smp', OWNER_IDS.smp, base.smp),
      ownerLine('sucrose', OWNER_IDS.sucrose, base.sucrose),
      ownerLine('dextrose', OWNER_IDS.dextrose, base.dextrose),
      ownerLine('tara', OWNER_IDS.tara, base.tara),
      ownerLine('strawberry', OWNER_IDS.strawberry, strawberry),
      ownerLine('cranberry', OWNER_IDS.cranberry, cranberry),
      ownerLine('watermelon', OWNER_IDS.watermelon, watermelon, 'main'),
    ],
  };
}

/** The customer's exact padlocks, both halves exactly as the store writes them. */
export function withCustomerGramLocks(
  input: RecipeInput,
  locks: Readonly<Record<string, number>>,
): { input: RecipeInput; constraints: ConstraintSet } {
  return {
    input: {
      ...input,
      items: input.items.map((item) =>
        locks[item.id] === undefined
          ? item
          : {
              ...item,
              planned_grams: locks[item.id]!,
              lock_type: item.lock_type === 'main' ? 'main' : 'grams',
              grams_constraint: { grams: locks[item.id]! },
            },
      ),
    },
    constraints: {
      byLineId: Object.fromEntries(
        Object.entries(locks).map(([lineId, grams]) => [lineId, { mode: 'locked', grams }]),
      ),
    },
  };
}

/** Resolved snapshots: the published Main policy on WATERMELON, milk as the
 * approved liquid dairy carrier, every other line STANDARD_ONLY. */
export function ownerFruitSnapshots(input: RecipeInput): Record<string, ProductBehaviorSnapshot> {
  const snapshots = productBehaviorTestSnapshots(input);
  if (snapshots.watermelon) {
    snapshots.watermelon = {
      ...snapshots.watermelon,
      productId: 'e3264816-1050-d2a6-cc55-149e0d363bbf',
      productVersionId: '009d5b8a-f0bd-4c19-958b-3feec2f045f9',
      mapperIngredientId: OWNER_IDS.watermelon,
      verificationState: 'estimated',
      familyId: 'fruit',
      formId: 'fresh',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainPolicyId: 'main-fruit-fresh-dairy',
      mainPolicyVersion: 'v2',
      ecoFloorPercent: 20,
      optimalCeilingPercent: 35,
      hardLimitPercent: 45,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      requiresLiquidDairyCarrier: true,
      liquidDairyCarrierFloorPercent: 30,
    };
  }
  if (snapshots.milk) snapshots.milk = { ...snapshots.milk, approvedLiquidDairyCarrier: true };
  return snapshots;
}

/** The option set the served Przelicz passes to the canonical pipeline. */
export function ownerPreviewOptions(input: RecipeInput) {
  return {
    productBehaviorSnapshots: ownerFruitSnapshots(input),
    technicalOnlyMainLineIds: [],
    requirePracticalPreview: true,
    directionFallbackPass: true,
    skipRescueAssessment: true,
  };
}
