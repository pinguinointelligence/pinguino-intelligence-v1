import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
  type ProductionSession,
} from './productionSession';
import { productionTestComposition } from './productionTestComposition.fixture';
import {
  assessProductionHardSafety,
  assessProductionRescue,
  productionRescueTerminalAuthority,
} from './productionRescue';
import { evaluateProductionRescueTerminalAuthority } from './productionRescueAuthority';

const [mapperHeader = [], ...mapperRecords] = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperIndex = new Map(mapperHeader.map((name, position) => [name, position]));
const mapperTriStateFields = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const mapperNumericFields = new Set(
  mapperHeader.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);

const valueAt = (record: string[], field: string): string =>
  record[mapperIndex.get(field)!]?.trim() ?? '';

const rowFromRecord = (record: string[]): IngredientRow =>
  Object.fromEntries(
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

interface FreshFruitAuthority {
  ingredientId: string;
  name: string;
  row: IngredientRow;
  verification: string;
  subfamilyId: string | null;
  policyId: string;
  calibrationLevel: 'EXACT_PRODUCT' | 'FAMILY';
  ecoFloorPercent: number;
  optimalCeilingPercent: number;
  hardLimitPercent: number;
}

const BERRY_IDS = new Set([
  'PI-ING-000346',
  'PI-ING-000347',
  'PI-ING-000352',
  'PI-ING-000361',
  'PI-ING-000394',
  'PI-ING-000395',
  'PI-ING-000396',
  'PI-ING-000397',
  'PI-ING-000406',
  'PI-ING-001553',
  'PI-ING-001556',
]);
const CITRUS_IDS = new Set(['PI-ING-000363', 'PI-ING-000369', 'PI-ING-000393', 'PI-ING-000398']);
const TROPICAL_IDS = new Set(['PI-ING-000364', 'PI-ING-000372', 'PI-ING-000381', 'PI-ING-000390']);
const EXACT_IDS = new Set(['PI-ING-000345', 'PI-ING-000369', 'PI-ING-001553']);

const authorityFor = (record: string[]): FreshFruitAuthority => {
  const ingredientId = valueAt(record, 'ingredient_id');
  const subfamilyId =
    ingredientId === 'PI-ING-000345'
      ? 'banana'
      : BERRY_IDS.has(ingredientId)
        ? 'berry'
        : CITRUS_IDS.has(ingredientId)
          ? 'citrus'
          : ingredientId === 'PI-ING-000366'
            ? 'kiwi'
            : TROPICAL_IDS.has(ingredientId)
              ? 'mango_tropical'
              : null;
  const policy =
    subfamilyId === 'banana'
      ? ['main-banana-fresh-dairy', 10, 20, 30]
      : subfamilyId === 'berry'
        ? ['main-berry-fresh-dairy', 25, 35, 45]
        : subfamilyId === 'kiwi'
          ? ['main-kiwi-fresh-dairy', 10, 15, 20]
          : ['main-fruit-fresh-dairy', 20, 35, 45];
  return {
    ingredientId,
    name: valueAt(record, 'ingredient_name_display'),
    row: rowFromRecord(record),
    verification: valueAt(record, 'verification_status'),
    subfamilyId,
    policyId: policy[0] as string,
    calibrationLevel: EXACT_IDS.has(ingredientId) ? 'EXACT_PRODUCT' : 'FAMILY',
    ecoFloorPercent: policy[1] as number,
    optimalCeilingPercent: policy[2] as number,
    hardLimitPercent: policy[3] as number,
  };
};

/**
 * This is discovery, not a hand-written product list: every currently active,
 * Engine-approved canonical Mapper row with the fresh-fruit form enters the
 * matrix automatically. The count assertion makes an accidental empty or
 * narrowed discovery fail loudly.
 */
const FRESH_FRUITS = mapperRecords
  .filter(
    (record) =>
      valueAt(record, 'ingredient_category') === 'fruit' &&
      valueAt(record, 'ingredient_subcategory') === 'fresh_fruit_profile' &&
      valueAt(record, 'approved_for_base').toLocaleLowerCase('en') === 'true' &&
      valueAt(record, 'approved_for_engines').toLocaleLowerCase('en') === 'true',
  )
  .map(authorityFor)
  .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));

const mapperIngredient = (ingredientId: string) => {
  const fruit = FRESH_FRUITS.find((candidate) => candidate.ingredientId === ingredientId);
  const record =
    fruit?.row ??
    (() => {
      const source = mapperRecords.find(
        (candidate) => valueAt(candidate, 'ingredient_id') === ingredientId,
      );
      if (!source) throw new Error(`Missing immutable Mapper row ${ingredientId}`);
      return rowFromRecord(source);
    })();
  return ingredientRowToEngineIngredient(record);
};

const SUPPORT = [
  ['milk', 'PI-ING-000236', 201],
  ['cream', 'PI-ING-000180', 85],
  ['smp', 'PI-ING-000270', 41],
  ['sucrose', 'PI-ING-000514', 54],
  ['dextrose', 'PI-ING-000494', 54],
  ['inulin', 'PI-ING-000456', 16],
  ['tara', 'PI-ING-000492', 2],
] as const;
const TARGET_G = 670;

const inputFor = (
  fruit: FreshFruitAuthority,
  fruitGrams: number,
  temperature: -11 | -12 | -13,
  machineCapacityG = 1200,
  supportOverride?: readonly number[],
): RecipeInput => {
  const supportGrams = supportOverride ?? [TARGET_G - fruitGrams - 227, 90, 40, 25, 65, 5, 2];
  return {
    items: [
      ...SUPPORT.map(([id, ingredientId], index) => ({
        id,
        ingredient: mapperIngredient(ingredientId),
        planned_grams: supportGrams[index]!,
        actual_grams: null,
        lock_type: 'unlocked' as const,
      })),
      {
        id: 'fruit',
        ingredient: mapperIngredient(fruit.ingredientId),
        planned_grams: fruitGrams,
        actual_grams: null,
        lock_type: 'main' as const,
      },
    ],
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: temperature,
    target_batch_grams: TARGET_G,
    machine_capacity_grams: machineCapacityG,
    goals: {
      formulation_strategy: 'optimal',
      cost_priority: 'balanced',
      flavor_intensity: 'balanced',
      direction_targets_active: true,
      direction_targets: { flavor: 0, softness: 2, sweetness: 2, creaminess: 0 },
      excluded_ingredient_ids: [],
      unavailable_main_ingredient_ids: [],
    },
  };
};

const compositionFor = (fruit: FreshFruitAuthority, input: RecipeInput) => {
  const composition = productionTestComposition(input);
  composition.behaviorSnapshots.milk = {
    ...composition.behaviorSnapshots.milk!,
    approvedLiquidDairyCarrier: true,
  };
  composition.behaviorSnapshots.fruit = {
    ...composition.behaviorSnapshots.fruit!,
    familyId: 'fruit',
    subfamilyId: fruit.subfamilyId,
    formId: 'fresh',
    mainCapability: 'MAIN_CAPABLE',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainAuthority: 'CALIBRATED',
    mainCalibrationLevel: fruit.calibrationLevel,
    mainPolicyId: fruit.policyId,
    mainPolicyVersion: '2',
    mainBasis: 'FRUIT_EQUIVALENT',
    mainEquivalentFactor: 1,
    ecoFloorPercent: fruit.ecoFloorPercent,
    optimalCeilingPercent: fruit.optimalCeilingPercent,
    hardLimitPercent: fruit.hardLimitPercent,
    requiresLiquidDairyCarrier: true,
    liquidDairyCarrierFloorPercent: 30,
  } as ProductBehaviorSnapshot;
  return composition;
};

const legalReferenceFor = (fruit: FreshFruitAuthority): RecipeInput => {
  const minimum = Math.ceil((fruit.ecoFloorPercent / 100) * TARGET_G);
  const maximum = Math.floor((fruit.hardLimitPercent / 100) * TARGET_G);
  const ideal = Math.round((fruit.optimalCeilingPercent / 100) * TARGET_G);
  const candidates = Array.from(
    new Set([
      ideal,
      minimum,
      maximum,
      ...Array.from(
        { length: Math.floor((maximum - minimum) / 5) + 1 },
        (_, index) => minimum + index * 5,
      ),
    ]),
  )
    .filter((grams) => grams >= minimum && grams <= maximum)
    .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
  for (const temperature of [-13, -11, -12] as const) {
    for (const fruitGrams of candidates) {
      for (const cream of [90, 100, 80]) {
        for (const smp of [40, 45, 35]) {
          for (const inulin of [5, 15, 25]) {
            for (const sucrose of [0, 10, 20, 30, 40, 50, 60]) {
              for (const dextrose of [20, 30, 40, 50, 60, 70, 80, 90, 100]) {
                const milk = TARGET_G - fruitGrams - cream - smp - sucrose - dextrose - inulin - 2;
                if (milk < Math.ceil(TARGET_G * 0.3)) continue;
                const input = inputFor(fruit, fruitGrams, temperature, 1200, [
                  milk,
                  cream,
                  smp,
                  sucrose,
                  dextrose,
                  inulin,
                  2,
                ]);
                if (
                  assessProductionHardSafety(input, calculateRecipe(input)).safe &&
                  evaluateProductionRescueTerminalAuthority(input, compositionFor(fruit, input))
                    .valid
                ) {
                  return input;
                }
              }
            }
          }
        }
      }
    }
  }
  const diagnosticInput = inputFor(fruit, ideal, -13);
  throw new Error(
    `No safe 670 g reference formula found for ${fruit.ingredientId} ${fruit.name}: ${JSON.stringify(
      {
        result: calculateRecipe(diagnosticInput),
        hardSafety: assessProductionHardSafety(diagnosticInput, calculateRecipe(diagnosticInput)),
        terminal: evaluateProductionRescueTerminalAuthority(
          diagnosticInput,
          compositionFor(fruit, diagnosticInput),
        ),
      },
    )}`,
  );
};

const sessionWithFruitDeviation = (
  fruit: FreshFruitAuthority,
  plannedInput: RecipeInput,
  deltaG: number,
): ProductionSession => {
  let session = createProductionSession({
    sessionId: `matrix-${fruit.ingredientId}-${deltaG}`,
    ownerUserId: 'owner',
    source: {
      recipeId: `recipe-${fruit.ingredientId}`,
      recipeVersionId: `version-${fruit.ingredientId}`,
      recipeVersionNumber: 1,
      recipeName: fruit.name,
    },
    plannedInput,
    plannedComposition: compositionFor(fruit, plannedInput),
    startedAt: '2026-09-05T00:00:00.000Z',
  });
  for (const line of session.lines) {
    const actualGrams = line.lineId === 'fruit' ? line.plannedGrams + deltaG : line.plannedGrams;
    session = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, actualGrams),
      line.lineId,
      '2026-09-05T00:01:00.000Z',
    );
  }
  return session;
};

const diagnostic = (fruit: FreshFruitAuthority, session: ProductionSession): string => {
  const assessment = assessProductionRescue(session);
  return JSON.stringify({
    ingredientId: fruit.ingredientId,
    name: fruit.name,
    verification: fruit.verification,
    policy: fruit.policyId,
    terminal: productionRescueTerminalAuthority(session.plannedInput, session),
    hardSafety: assessment.hardSafety,
    state: assessment.state,
    reason: assessment.reason,
    trace: assessment.strategyTrace,
    options: assessment.options.map((option) => ({
      id: option.id,
      finalMassG: option.finalMassG,
      instructions: option.instructions,
    })),
  });
};

describe('Production Rescue canonical fresh-fruit matrix', () => {
  it('discovers the complete current active and Engine-approved canonical Mapper set', () => {
    expect(FRESH_FRUITS).toHaveLength(55);
    expect(new Set(FRESH_FRUITS.map((fruit) => fruit.ingredientId))).toHaveLength(55);
    expect(FRESH_FRUITS.filter((fruit) => fruit.verification === 'Verified')).toHaveLength(12);
    expect(FRESH_FRUITS.filter((fruit) => fruit.verification === 'Estimated')).toHaveLength(43);
  });

  const references = new Map(
    FRESH_FRUITS.map((fruit) => [fruit.ingredientId, legalReferenceFor(fruit)]),
  );

  it.each(FRESH_FRUITS)(
    '$ingredientId $name has a legal complete 670 g reference formula',
    (fruit) => {
      const input = references.get(fruit.ingredientId)!;
      const session = sessionWithFruitDeviation(fruit, input, 0);
      expect(calculateRecipe(input).total_batch_g).toBe(TARGET_G);
      expect(assessProductionHardSafety(input, calculateRecipe(input)).safe).toBe(true);
      expect(productionRescueTerminalAuthority(input, session).valid).toBe(true);
      expect(session.plannedComposition.baseOrder).toHaveLength(input.items.length);
      expect(Object.keys(session.plannedComposition!.behaviorSnapshots!)).toHaveLength(
        input.items.length,
      );
    },
  );

  it.each(FRESH_FRUITS.flatMap((fruit) => [-5, -10].map((deltaG) => ({ fruit, deltaG }))))(
    '$fruit.ingredientId $fruit.name restores P$deltaG with that same fruit only',
    ({ fruit, deltaG }) => {
      const input = references.get(fruit.ingredientId)!;
      const session = sessionWithFruitDeviation(fruit, input, deltaG);
      const assessment = assessProductionRescue(session);
      const restore = assessment.options.find((option) => option.id === 'restore_original_recipe');
      expect(restore, diagnostic(fruit, session)).toBeDefined();
      expect(restore?.finalMassG).toBe(TARGET_G);
      expect(restore?.instructions).toEqual([
        expect.objectContaining({
          lineId: 'fruit',
          ingredientName: fruit.name,
          kind: 'add',
          grams: Math.abs(deltaG),
          finalTargetGrams: input.items.find((item) => item.id === 'fruit')!.planned_grams,
        }),
      ]);
      expect(restore?.candidateInput.items).toHaveLength(input.items.length);
      expect(
        new Set(restore?.candidateInput.items.map((item) => canonicalIngredientId(item.ingredient)))
          .size,
      ).toBe(input.items.length);
    },
  );

  it.each(FRESH_FRUITS.flatMap((fruit) => [5, 10].map((deltaG) => ({ fruit, deltaG }))))(
    '$fruit.ingredientId $fruit.name repairs P+$deltaG through a larger add-only batch',
    ({ fruit, deltaG }) => {
      const input = references.get(fruit.ingredientId)!;
      const session = sessionWithFruitDeviation(fruit, input, deltaG);
      const assessment = assessProductionRescue(session);
      const restore = assessment.options.find((option) => option.id === 'restore_original_recipe');
      expect(restore, diagnostic(fruit, session)).toBeDefined();
      expect(restore!.finalMassG).toBeGreaterThan(TARGET_G);
      expect(restore!.finalMassG).toBeLessThanOrEqual(input.machine_capacity_grams!);
      expect(restore!.instructions.length).toBeGreaterThan(0);
      expect(restore!.instructions.every((instruction) => instruction.kind === 'add')).toBe(true);
      expect(restore!.instructions.every((instruction) => instruction.grams > 0)).toBe(true);
      expect(restore!.candidateInput.items).toHaveLength(input.items.length);
      expect(
        new Set(restore!.candidateInput.items.map((item) => canonicalIngredientId(item.ingredient)))
          .size,
      ).toBe(input.items.length);
      expect(
        assessProductionHardSafety(
          restore!.candidateInput,
          calculateRecipe(restore!.candidateInput),
        ).safe,
      ).toBe(true);
      expect(productionRescueTerminalAuthority(restore!.candidateInput, session).valid).toBe(true);
    },
  );

  it('replays the exact served Strawberry 217 g → 206 g facts as a one-line +11 g restore', () => {
    const strawberry = FRESH_FRUITS.find((fruit) => fruit.ingredientId === 'PI-ING-001553')!;
    const plannedInput = inputFor(strawberry, 217, -13, 670, [201, 85, 41, 54, 54, 16, 2]);
    const session = sessionWithFruitDeviation(strawberry, plannedInput, -11);
    expect(assessProductionHardSafety(plannedInput, calculateRecipe(plannedInput)).safe).toBe(true);
    expect(productionRescueTerminalAuthority(plannedInput, session).valid).toBe(true);

    const assessment = assessProductionRescue(session);
    const restore = assessment.options.find((option) => option.id === 'restore_original_recipe');
    expect(restore, diagnostic(strawberry, session)).toMatchObject({
      finalMassG: 670,
      instructions: [
        {
          lineId: 'fruit',
          ingredientName: strawberry.name,
          kind: 'add',
          grams: 11,
          finalTargetGrams: 217,
        },
      ],
    });
  });
});
