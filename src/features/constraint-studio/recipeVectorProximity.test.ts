import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { attachRecipeProfileMetadata } from '@/features/pro-workbench/recipeProfilePersistence';
import { parseCsv } from '@/lib/csv';
import { recipeTechnicalFit } from '@/features/recipe-score';
import { normalizedLineDrift } from '@/features/formulation/userLineIntent';
import { buildOptimizePreview, commitPreview } from './applyPipeline';
import {
  compareExperimentalCandidateMeasures,
  evaluateExperimentalCandidate,
  experimentalNeighborhoodSearch,
} from './experimentalNeighborhoodSearch';

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const TRI_STATE = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);

const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (TRI_STATE.has(field)) return [field, raw.toLocaleLowerCase('en')];
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
};

const ingredient = (ingredientId: string) =>
  ingredientRowToEngineIngredient(mapperRow(ingredientId));

const HORCHATA_LINES = [
  ['rice-drink', 'PI-ING-001566', 600],
  ['water', 'PI-ING-001409', 127],
  ['coconut-oil', 'PI-ING-000163', 50],
  ['sucrose', 'PI-ING-000514', 120],
  ['dextrose', 'PI-ING-000494', 50],
  ['inulin', 'PI-ING-000456', 50],
  ['cinnamon', 'PI-ING-001661', 2],
  ['tara', 'PI-ING-000492', 1],
] as const;

const horchata = (strategy: 'optimal' | 'eco'): RecipeInput => ({
  items: HORCHATA_LINES.map(([id, ingredientId, grams]) => ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
    user_intent_anchor_grams: grams,
  })),
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: strategy,
    direction_targets_active: false,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const price = (canonicalIngredientId: string, pricePerKg: number) => ({
  overrideId: `override:${canonicalIngredientId}`,
  ownerUserId: 'owner-test',
  canonicalIngredientId,
  pricePerKg,
  currency: 'EUR',
  createdBy: 'owner-test',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
});

const HORCHATA_PRICES = {
  'PI-ING-001566': price('PI-ING-001566', 2.09),
  'PI-ING-001409': price('PI-ING-001409', 1),
  'PI-ING-000163': price('PI-ING-000163', 5),
  'PI-ING-000514': price('PI-ING-000514', 0.53),
  'PI-ING-000494': price('PI-ING-000494', 1.48),
  'PI-ING-000456': price('PI-ING-000456', 9),
  'PI-ING-001661': price('PI-ING-001661', 10.44),
  'PI-ING-000492': price('PI-ING-000492', 13),
};

const HISTORICAL_OPTIMAL = new Map<string, number>([
  ['rice-drink', 245],
  ['water', 379],
  ['coconut-oil', 82],
  ['sucrose', 151],
  ['dextrose', 43],
  ['inulin', 50],
  ['cinnamon', 49],
  ['tara', 1],
]);

const vectorDistance = (baseline: RecipeInput, proposed: RecipeInput): number => {
  const byId = new Map(proposed.items.map((item) => [item.id, item.planned_grams]));
  return baseline.items.reduce(
    (total, item) =>
      total +
      normalizedLineDrift(
        item.planned_grams,
        byId.get(item.id) ?? 0,
        baseline.target_batch_grams,
      ),
    0,
  );
};

const historicalOptimal = (input: RecipeInput): RecipeInput => ({
  ...input,
  items: input.items.map((item) => ({
    ...item,
    planned_grams: HISTORICAL_OPTIMAL.get(item.id) ?? item.planned_grams,
  })),
});

const hazelnut = (): RecipeInput => ({
  items: [
    ['milk', 'PI-ING-000236', 575],
    ['cream', 'PI-ING-000180', 75],
    ['smp', 'PI-ING-000270', 35],
    ['sucrose', 'PI-ING-000514', 85],
    ['dextrose', 'PI-ING-000494', 55],
    ['inulin', 'PI-ING-000456', 43],
    ['hazelnut', 'PI-ING-000419', 130],
    ['tara', 'PI-ING-000492', 2],
  ].map(([id, ingredientId, grams]) => ({
    id: String(id),
    ingredient: ingredient(String(ingredientId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: 'unlocked' as const,
    user_intent_anchor_grams: Number(grams),
  })),
  mode: 'classic',
  // Visible Gelato with nut paste stays on the canonical native milk profile;
  // `nut_gelato` is an unseeded historical flavour label, not a runtime family.
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: false,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const proteinMinus11 = (): RecipeInput => ({
  items: [
    ['cream', 'PI-ING-000180', 110],
    ['protein-gel', 'PI-ING-000264', 247],
    ['water', 'PI-ING-001409', 505],
    ['sucrose', 'PI-ING-000514', 80],
    ['dextrose', 'PI-ING-000494', 56],
    ['tara', 'PI-ING-000492', 2],
  ].map(([id, ingredientId, grams]) => ({
    id: String(id),
    ingredient: ingredient(String(ingredientId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: 'unlocked' as const,
    user_intent_anchor_grams: Number(grams),
  })),
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: false,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const proteinMatchaEco = (): RecipeInput => ({
  items: [
    ['milk', 'PI-ING-000236', 645],
    ['cream', 'PI-ING-000180', 120],
    ['smp', 'PI-ING-000270', 35],
    ['sucrose', 'PI-ING-000514', 80],
    ['dextrose', 'PI-ING-000494', 60],
    ['inulin', 'PI-ING-000456', 48],
    ['matcha', 'PI-ING-000169', 10],
    ['tara', 'PI-ING-000492', 2],
  ].map(([id, ingredientId, grams]) => ({
    id: String(id),
    ingredient: ingredient(String(ingredientId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: 'unlocked' as const,
    user_intent_anchor_grams: Number(grams),
  })),
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'eco',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const MATCHA_PRICES = Object.fromEntries(
  ['PI-ING-000236', 'PI-ING-000180', 'PI-ING-000270', 'PI-ING-000514',
    'PI-ING-000494', 'PI-ING-000456', 'PI-ING-000169', 'PI-ING-000492'].map(
    (canonicalId) => [canonicalId, price(canonicalId, 1)],
  ),
);

describe('whole-recipe user-gram proximity — Horchata historical reproducer', () => {
  it('disambiguates score 10: the input is natively feasible even though blended Engine score is separate', () => {
    const input = horchata('optimal');
    const result = calculateRecipe(input);

    expect(detectViolations(result)).toHaveLength(0);
    expect(recipeTechnicalFit(result)).toMatchObject({ score: 10, validatedNative: true });
    expect(result.scores?.overall).not.toBe(10);
  });

  it('keeps a feasible no-Crown OPTIMAL recipe instead of replacing it with a deeper band-center point', () => {
    const input = horchata('optimal');
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z');

    expect(built).toEqual({ ok: false, code: 'already_clean' });
  });

  it('keeps the exact Horchata vector through the served Pro practical-preview Apply door', () => {
    const source = horchata('optimal');
    const input = attachRecipeProfileMetadata(
      source,
      {
        visibleProductType: 'vegan',
        mode: 'classic',
        formulationStrategy: 'optimal',
        targetBatchGrams: 1_000,
        machineKind: 'professional',
        machineId: null,
        machineLabel: 'Maszyna profesjonalna',
        servingModeId: 'temp_minus_11',
        targetTemperatureC: -11,
        machineCapacityGrams: null,
        directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
        directionIntents: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
      Object.fromEntries(
        source.items.map((item) => [item.id, { role: 'standard' as const, required: false }]),
      ),
    );
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z', {
      requirePracticalPreview: true,
      productBehaviorSnapshots: productBehaviorTestSnapshots(input),
    });

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(built.preview.practicalizationOnly).toBe(true);
    expect(built.preview.proposedInput.items.map((item) => item.planned_grams)).toEqual(
      input.items.map((item) => item.planned_grams),
    );
    expect(
      built.preview.proposedInput.items.find((item) => item.id === 'cinnamon')?.planned_grams,
    ).toBe(2);
    expect(
      commitPreview(
        input,
        { byLineId: {} },
        built.preview,
        '2026-08-25T00:00:01.000Z',
        'served-pro-horchata-no-op',
        [],
        undefined,
        null,
        null,
        null,
        null,
        {},
        [],
        null,
        null,
        { requirePracticalPreview: true },
      ).ok,
    ).toBe(true);
  });

  it('keeps the exact Horchata vector through the served Pro ECO Apply door', () => {
    const source = horchata('eco');
    const input = attachRecipeProfileMetadata(
      source,
      {
        visibleProductType: 'vegan',
        mode: 'classic',
        formulationStrategy: 'eco',
        targetBatchGrams: 1_000,
        machineKind: 'professional',
        machineId: null,
        machineLabel: 'Maszyna profesjonalna',
        servingModeId: 'temp_minus_11',
        targetTemperatureC: -11,
        machineCapacityGrams: null,
        directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
        directionIntents: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
      Object.fromEntries(
        source.items.map((item) => [item.id, { role: 'standard' as const, required: false }]),
      ),
    );
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z', {
      requirePracticalPreview: true,
      productBehaviorSnapshots: productBehaviorTestSnapshots(input),
      effectivePriceOverrides: HORCHATA_PRICES,
    });

    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(built.preview.proposedInput.items.map((item) => item.planned_grams)).toEqual(
      input.items.map((item) => item.planned_grams),
    );
    expect(
      built.preview.proposedInput.items.find((item) => item.id === 'cinnamon')?.planned_grams,
    ).toBe(2);
  });

  it('keeps ECO closer to the complete entered vector than the rejected historical OPTIMAL rewrite', () => {
    const input = horchata('eco');
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z', {
      effectivePriceOverrides: HORCHATA_PRICES,
    });
    const proposed = built.ok ? built.preview.proposedInput : input;

    expect(vectorDistance(input, proposed)).toBeLessThan(
      vectorDistance(input, historicalOptimal(input)),
    );
  });
});

describe('isolated multi-candidate neighborhood experiment — null hypothesis', () => {
  it('short-circuits at the original valid no-Crown vector without evaluating mutations', () => {
    const input = horchata('optimal');
    const result = experimentalNeighborhoodSearch(input, { byLineId: {} }, {
      beamWidth: 5,
      evaluationBudget: 2_000,
    });

    expect(result.status).toBe('no_change');
    expect(result.input.items.map((item) => item.planned_grams)).toEqual(
      input.items.map((item) => item.planned_grams),
    );
    expect(result.diagnostics.candidateEvaluations).toBe(0);
  });

  it('ranks unchanged Horchata ahead of the historical 49 g Cinnamon vector', () => {
    const input = horchata('optimal');
    const unchanged = evaluateExperimentalCandidate(input, input, { byLineId: {} });
    const rewritten = evaluateExperimentalCandidate(input, historicalOptimal(input), {
      byLineId: {},
    });

    expect(compareExperimentalCandidateMeasures(unchanged, rewritten, 'optimal')).toBeLessThan(0);
    expect(unchanged.normalizedDistanceFromUser).toBe(0);
    expect(rewritten.maximumFoldChange).toBe(24.5);
  });

  it('proves the current Hazelnut path is avoidably farther than a hard-safe nearby candidate', () => {
    const input = hazelnut();
    const current = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z');
    const experimental = experimentalNeighborhoodSearch(input, { byLineId: {} }, {
      beamWidth: 3,
      evaluationBudget: 2_500,
    });

    expect(current.ok).toBe(true);
    expect(experimental.status).toBe('candidate');
    if (!current.ok) return;
    expect(detectViolations(calculateRecipe(experimental.input))).toEqual([]);
    expect(vectorDistance(input, current.preview.proposedInput)).toBeLessThanOrEqual(
      vectorDistance(input, experimental.input) + 1e-9,
    );
  });

  it('does not keep climbing the Protein frontier after the requested qualification is reached', () => {
    const input = proteinMinus11();
    const current = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z');
    const experimental = experimentalNeighborhoodSearch(input, { byLineId: {} }, {
      beamWidth: 3,
      evaluationBudget: 2_500,
    });

    expect(current.ok).toBe(true);
    expect(experimental.status).toBe('candidate');
    if (!current.ok) return;
    expect(current.preview.proteinFormulation?.qualification.qualified).toBe(true);
    expect(vectorDistance(input, current.preview.proposedInput)).toBeLessThanOrEqual(
      vectorDistance(input, experimental.input) + 1e-9,
    );
  });

  it('classifies the exact CROSS Matcha Protein ECO candidate by Protein authority, not Direction score alone', () => {
    const input = proteinMatchaEco();
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T00:00:00.000Z', {
      effectivePriceOverrides: MATCHA_PRICES,
    });

    expect(built.ok, built.ok ? '' : JSON.stringify(built).slice(0, 800)).toBe(true);
    if (!built.ok) return;
    expect(built.preview.lines.some((line) => line.kind !== 'unchanged')).toBe(true);
    expect(built.preview.proteinFormulation?.qualification.qualified).toBe(false);
    expect(built.preview.diagnosticOnly).toBe(true);
    expect(built.preview.diagnosticReason).toBe('protein_claim_residual');
  });
});
