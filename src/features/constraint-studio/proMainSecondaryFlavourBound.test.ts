import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { verifyMainEnvelope } from '@/features/product-intelligence/mainEnvelope';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { parseCsv } from '@/lib/csv';

import { buildOptimizePreview } from './applyPipeline';

vi.setConfig({ testTimeout: 180_000 });

const source = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [header = [], ...records] = parseCsv(source);
const index = new Map(header.map((name, position) => [name, position]));
const numeric = new Set([
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

const mapperRow = (ingredientId: string): IngredientRow => {
  const record = records.find((row) => row[index.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    header.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (numeric.has(field)) return [field, raw === '' ? null : Number(raw)];
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
};

const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  strawberry: 'PI-ING-001553',
  watermelon: 'PI-ING-000405',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
): RecipeInput['items'][number] => ({
  id,
  ingredient: ingredient(ingredientId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: lockType,
});

const owner451 = (watermelonGrams = 1, strawberryGrams = 166): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 451,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'optimal' },
  items: [
    line('milk', IDS.milk, 135),
    line('cream', IDS.cream, 57),
    line('smp', IDS.smp, 32),
    line('sucrose', IDS.sucrose, 28),
    line('dextrose', IDS.dextrose, 30),
    line('tara', IDS.tara, 2),
    line('strawberry', IDS.strawberry, strawberryGrams),
    line('watermelon', IDS.watermelon, watermelonGrams, 'main'),
  ],
});

const snapshotsFor = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = productBehaviorTestSnapshots(input);
  snapshots.watermelon = {
    ...snapshots.watermelon!,
    productId: 'e3264816-1050-d2a6-cc55-149e0d363bbf',
    productVersionId: '009d5b8a-f0bd-4c19-958b-3feec2f045f9',
    mapperIngredientId: IDS.watermelon,
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
  snapshots.milk = { ...snapshots.milk!, approvedLiquidDairyCarrier: true };
  return snapshots;
};

const run = (input: RecipeInput, set: ConstraintSet = { byLineId: {} }) =>
  buildOptimizePreview(input, set, '2026-09-10T23:53:00.000Z', {
    productBehaviorSnapshots: snapshotsFor(input),
    technicalOnlyMainLineIds: [],
    requirePracticalPreview: true,
  });

const grams = (input: RecipeInput, lineId: string): number =>
  input.items.find((item) => item.id === lineId)!.planned_grams;

const expectStructuredBlocker = (result: ReturnType<typeof run>): void => {
  expect(result.ok, JSON.stringify(result)).toBe(false);
  if (result.ok) return;
  expect(['impossible_under_constraints', 'main_ratio_conflict', 'no_proposal']).toContain(
    result.code,
  );
};

describe('PRO Main search — secondary flavour decrease-only authority', () => {
  it('cases 1, 6 and 9: repairs the served 451 g draft without raising Strawberry or losing Main identity', () => {
    const input = owner451();
    const result = run(input);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    const watermelon = proposed.items.find((item) => item.id === 'watermelon')!;

    expect(grams(proposed, 'strawberry')).toBeGreaterThan(0);
    expect(grams(proposed, 'strawberry')).toBeLessThanOrEqual(166);
    expect(grams(proposed, 'strawberry')).toBeLessThan(166);
    expect(watermelon.planned_grams).toBeGreaterThanOrEqual(91);
    expect(watermelon).toMatchObject({
      id: 'watermelon',
      lock_type: 'main',
      ingredient: {
        id: input.items.find((item) => item.id === 'watermelon')!.ingredient.id,
        canonical_ingredient_id: IDS.watermelon,
      },
    });
    expect(proposed.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(451);
    expect(proposed.items.every((item) => Number.isInteger(item.planned_grams))).toBe(true);
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
    expect(
      verifyMainEnvelope({
        recipe: proposed,
        snapshots: snapshotsFor(proposed),
        mode: 'optimal',
        enforceFloor: true,
      }),
    ).toMatchObject({ ok: true });
    expect(result.preview.violationsAfter).toBe(0);
  });

  it('case 2: a real explicit Strawberry lock remains exact and blocks instead of being weakened', () => {
    const result = run(owner451(), {
      byLineId: { strawberry: { mode: 'locked', grams: 166 } },
    });

    expectStructuredBlocker(result);
    if (!result.ok && result.code === 'impossible_under_constraints') {
      expect(result.conflict).toMatchObject({ lineId: 'strawberry', grams: 166 });
    }
  });

  it.each([
    ['case 3 exact grams', { mode: 'locked' as const, grams: 1 }],
    ['case 4 exact percent', { mode: 'percent' as const, percent: (1 / 451) * 100 }],
    ['case 5 fixed range', { mode: 'range' as const, minGrams: 1, maxGrams: 1 }],
  ])('%s returns a structured blocker, never a successful 1 g proposal', (_name, constraint) => {
    const result = run(owner451(), { byLineId: { watermelon: constraint } });
    expectStructuredBlocker(result);
    if (result.ok) expect(grams(result.preview.proposedInput, 'watermelon')).not.toBe(1);
  });

  it('case 7: compatible flavour lines do not move when the exact Main floor is already valid', () => {
    const input = owner451(91, 70);
    input.items = input.items.map((item) => {
      if (item.id === 'milk') return { ...item, planned_grams: 136 };
      if (item.id === 'cream') return { ...item, planned_grams: 62 };
      return item;
    });
    expect(detectViolations(calculateRecipe(input))).toEqual([]);

    const result = run(input, { byLineId: { watermelon: { mode: 'locked', grams: 91 } } });
    if (!result.ok) {
      expect(result.code).toBe('already_clean');
      return;
    }
    expect(grams(result.preview.proposedInput, 'watermelon')).toBe(91);
    expect(grams(result.preview.proposedInput, 'strawberry')).toBe(70);
  });

  it('rejects every successful Crown-ON preview that misses an immutable Main quantity rule', () => {
    const result = run(owner451(), {
      byLineId: { watermelon: { mode: 'percent', percent: (1 / 451) * 100 } },
    });
    expectStructuredBlocker(result);
    expect(result.ok).toBe(false);
  });
});
