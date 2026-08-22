import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateRecipe,
  detectViolations,
  estimateIceFraction,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { assessSorbetStabilizerSystem } from '@/features/recipe-constraints';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { assessRecipeDirection } from './recipeDirectionAssessment';
import { projectSorbetExactDirectionCandidate } from './sorbetDirectionProjection';
import {
  buildRecipeDirectionPlan,
  recipeDirectionViolations,
  SORBET_HARDNESS_TARGET_CENTERS,
  SORBET_SWEETNESS_TARGET_CENTERS,
} from './recipeDirectionTargets';

const TARGETS = [-2, -1, 0, 1, 2] as const;
// Run the two formerly authority-blocked temperatures first so regressions
// fail fast instead of hiding behind the already-established −11 matrix.
const TEMPERATURES = [-12, -13, -11] as const;
const STRATEGIES = ['optimal', 'eco'] as const;
const EMPTY = { byLineId: {} } as const;

const mapperGrid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperHeader = mapperGrid[0]!;
const mapperTriState = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const mapperCell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (mapperTriState.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const mapperRows = new Map(
  mapperGrid.slice(1).map((cells) => {
    const row = Object.fromEntries(
      mapperHeader.map((name, index) => [name, mapperCell(cells[index] ?? '', name)]),
    ) as unknown as IngredientRow;
    return [row.ingredient_id, row] as const;
  }),
);
const mapperIngredient = (id: string) => {
  const row = mapperRows.get(id);
  if (!row) throw new Error(`Missing Mapper fixture ${id}`);
  return ingredientRowToEngineIngredient(row);
};

const snapshot = (
  lineId: string,
  mapperIngredientId: string,
  main: boolean,
): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: `product-${lineId}`,
  productVersionId: `version-${lineId}`,
  source: 'mapper',
  factsFingerprint: `facts-${lineId}`,
  behaviorBindingId: `binding-${lineId}`,
  behaviorBindingVersion: '1',
  taxonomyVersion: 'pinguino-product-taxonomy-v1',
  familyId: main ? 'fruit' : null,
  subfamilyId: main ? 'berry' : null,
  formId: main ? 'fresh' : null,
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId,
  mainClassification: main ? 'MAIN_PROFILE_SPECIFIC' : 'STRUCTURAL_ONLY',
  mainPolicyId: main ? 'main-sorbet-exact-fruit-60-v1' : null,
  mainPolicyVersion: main ? '1' : null,
  ecoFloorPercent: main ? 60 : null,
  optimalCeilingPercent: main ? 60 : null,
  hardLimitPercent: main ? 60 : null,
  multiMainHardLimitPercent: main ? 60 : null,
  mainEquivalentFactor: main ? 1 : null,
  mainBasis: main ? 'FRUIT_EQUIVALENT' : null,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: {
    BASE_RECIPE: 'eligible',
    MAIN: main ? 'eligible' : 'blocked',
    OPTIMAL: 'eligible',
    ECO: 'eligible',
    SAVE: 'eligible',
  },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'unified-product-behavior-v2',
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: null,
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: main ? ['sorbet'] : [],
    veganEligibility: 'unknown',
    proteinBehavior: 'neutral',
    referencePrice: null,
    recommendedDose: null,
  },
  warnings: [],
  blockReasons: [],
});

const nativeSafeMinus11Base = (): RecipeInput => {
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: 'temp_minus_11',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  const input: RecipeInput = {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: -11,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [
      {
        id: 'main-strawberry',
        ingredient: mapperIngredient('PI-ING-001553'),
        planned_grams: 400,
        actual_grams: null,
        lock_type: 'main',
        main_ratio_weight: 2,
      },
      {
        id: 'main-lime',
        ingredient: mapperIngredient('PI-ING-000369'),
        planned_grams: 200,
        actual_grams: null,
        lock_type: 'main',
        main_ratio_weight: 1,
      },
      ...scaffold.items.map((item) => ({
        ...item,
        ingredient: mapperIngredient(item.ingredient.canonical_ingredient_id ?? item.ingredient.id),
      })),
    ],
    goals: { formulation_strategy: 'optimal' },
  };
  expect(plannedSum(input)).toBe(1_000);
  expect(assessSorbetStabilizerSystem(input).issues).toEqual([]);
  expect(detectViolations(calculateRecipe(input))).toEqual([]);
  return input;
};

const snapshotsFor = (input: RecipeInput) =>
  Object.fromEntries(
    input.items.map((item) => [
      item.id,
      snapshot(
        item.id,
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        item.lock_type === 'main',
      ),
    ]),
  );

const directed = (
  base: RecipeInput,
  strategy: (typeof STRATEGIES)[number],
  sweetness: RecipeDirectionTarget,
  hardness: RecipeDirectionTarget,
): RecipeInput => ({
  ...base,
  goals: {
    ...base.goals,
    formulation_strategy: strategy,
    direction_targets_active: true,
    direction_targets: { sweetness, softness: hardness, creaminess: 0, flavor: 0 },
  },
});

const severity = (input: RecipeInput) =>
  recipeDirectionViolations(input).reduce((sum, violation) => sum + violation.severity_points, 0);

const finiteMetric = (value: number | null, label: string): number => {
  expect(value, label).not.toBeNull();
  expect(Number.isFinite(value), label).toBe(true);
  return value ?? Number.NaN;
};

describe('Sorbet exact five-step Direction matrix', () => {
  it('pins exact owner centers for every temperature and all five positions', () => {
    for (const temperature of TEMPERATURES) {
      const base = { ...nativeSafeMinus11Base(), target_temperature_c: temperature };
      const expectedHardness =
        temperature === -11
          ? [39.5, 38.5, 37.5, 36.5, 35.5]
          : temperature === -12
            ? [48.3, 46.9, 45.5, 44.1, 42.7]
            : [54.3, 52.9, 51.5, 50.1, 48.7];
      for (const [index, target] of TARGETS.entries()) {
        const plan = buildRecipeDirectionPlan(directed(base, 'optimal', target, target));
        expect(SORBET_SWEETNESS_TARGET_CENTERS[target]).toBe(16 + index * 2);
        expect(SORBET_HARDNESS_TARGET_CENTERS[temperature][target]).toBe(expectedHardness[index]);
        expect(plan.bands.pod).toEqual({ min: 16 + index * 2, max: 16 + index * 2 });
        expect(plan.bands.npac).toEqual({
          min: expectedHardness[index],
          max: expectedHardness[index],
        });
      }
    }
  });

  it('uses composition-sensitive Sorbet ice at all three temperatures and never the milk anchor API', () => {
    expect(estimateIceFraction({ category: 'sorbet', temperature_c: -12, npac: 42 })).toBeNull();
    for (const temperature of TEMPERATURES) {
      const result = calculateRecipe({
        ...nativeSafeMinus11Base(),
        target_temperature_c: temperature,
      });
      expect(result.ice_fraction_percent).not.toBeNull();
      expect(Number.isFinite(result.ice_fraction_percent)).toBe(true);
    }
  });

  it('enumerates and truthfully exercises all 150 temperature × strategy × Direction cells', () => {
    let cells = 0;
    let legalCells = 0;
    let nearestAchievableCells = 0;
    const byTemperature = new Map<number, { legal: number; nearestAchievable: number }>(
      TEMPERATURES.map((temperature) => [temperature, { legal: 0, nearestAchievable: 0 }]),
    );
    const outputs = new Map<
      string,
      { status: 'LEGAL' | 'NEAREST_ACHIEVABLE'; pod: number; npac: number; ice: number }
    >();
    for (const temperature of TEMPERATURES) {
      const base = { ...nativeSafeMinus11Base(), target_temperature_c: temperature };
      for (const strategy of STRATEGIES) {
        for (const sweetness of TARGETS) {
          for (const hardness of TARGETS) {
            cells += 1;
            const input = directed(base, strategy, sweetness, hardness);
            const key = `${temperature}/${strategy}/${sweetness}/${hardness}`;
            const exactCandidate = projectSorbetExactDirectionCandidate(input);
            const candidate = exactCandidate ?? input;
            const result = calculateRecipe(candidate);
            const exactLegal =
              exactCandidate !== null &&
              detectViolations(result).length === 0 &&
              assessRecipeDirection(candidate, result).reached;
            const status = exactLegal ? 'LEGAL' : 'NEAREST_ACHIEVABLE';
            if (exactLegal) {
              expect(plannedSum(candidate), key).toBeCloseTo(1_000, 6);
              expect(assessSorbetStabilizerSystem(candidate).issues, key).toEqual([]);
              expect(candidate.goals?.direction_targets).toEqual(input.goals?.direction_targets);
              legalCells += 1;
              byTemperature.get(temperature)!.legal += 1;
            } else {
              // The closed three-role system has no non-negative exact
              // solution while Main, optional Inulin and stabilizer remain
              // unchanged. This is a mathematical nearest-achievable state,
              // not a missing-ice-authority block.
              nearestAchievableCells += 1;
              byTemperature.get(temperature)!.nearestAchievable += 1;
            }
            outputs.set(key, {
              status,
              pod: finiteMetric(result.pod_points, `${key} POD`),
              npac: finiteMetric(result.npac_points, `${key} NPAC`),
              ice: finiteMetric(result.ice_fraction_percent, `${key} ice`),
            });
            expect(result.ice_fraction_percent, `${key} ice authority`).not.toBeNull();
          }
        }
      }
    }
    expect(cells).toBe(150);
    expect(legalCells + nearestAchievableCells).toBe(150);
    expect(legalCells).toBeGreaterThan(0);
    expect(nearestAchievableCells).toBeGreaterThan(0);
    expect(outputs.size).toBe(150);
    // Owner-accepted baseline of current code truth (2026-08-21). A change here
    // means the Engine/Direction output moved and must be investigated, never
    // silently accepted: 94 LEGAL / 56 NEAREST_ACHIEVABLE / 0 authority-blocked.
    expect({ legalCells, nearestAchievableCells }).toEqual({
      legalCells: 94,
      nearestAchievableCells: 56,
    });
    expect(Object.fromEntries(byTemperature)).toEqual({
      [-11]: { legal: 38, nearestAchievable: 12 },
      [-12]: { legal: 32, nearestAchievable: 18 },
      [-13]: { legal: 24, nearestAchievable: 26 },
    });
    console.info(
      'SORBET_DIRECTION_MATRIX',
      JSON.stringify({
        legalCells,
        nearestAchievableCells,
        byTemperature: Object.fromEntries(byTemperature),
      }),
    );
  });

  it.each(
    TEMPERATURES.flatMap((temperature) =>
      STRATEGIES.map((strategy) => [temperature, strategy] as const),
    ),
  )(
    'runs the real Preview path for representative neutral Sorbet at %d / %s',
    (temperature, strategy) => {
      const base = { ...nativeSafeMinus11Base(), target_temperature_c: temperature };
      const input = directed(base, strategy, 0, 0);
      const beforeSeverity = severity(input);
      const built = buildOptimizePreview(
        input,
        EMPTY,
        `sorbet-representative-${temperature}-${strategy}`,
        {
          productBehaviorSnapshots: snapshotsFor(base),
        },
      );
      if (!built.ok) {
        expect(['no_proposal', 'unsafe_proposal']).toContain(built.code);
        expect(calculateRecipe(input).ice_fraction_percent).not.toBeNull();
        return;
      }
      const proposed = built.preview.proposedInput;
      const result = calculateRecipe(proposed);
      expect(built.preview.diagnosticOnly).not.toBe(true);
      expect(detectViolations(result)).toEqual([]);
      expect(plannedSum(proposed)).toBeCloseTo(1_000, 6);
      expect(assessSorbetStabilizerSystem(proposed).issues).toEqual([]);
      expect(severity(proposed)).toBeLessThan(beforeSeverity);
    },
    120_000,
  );

  it('recomputes Score from exact targets and restores it on a 0/0 round trip', () => {
    const base = nativeSafeMinus11Base();
    const neutral = directed(base, 'optimal', 0, 0);
    const extreme = directed(base, 'optimal', -2, -2);
    const restored = directed(base, 'optimal', 0, 0);
    const neutralScore = recipeFitForInput(neutral).score;
    const extremeScore = recipeFitForInput(extreme).score;
    expect(assessRecipeDirection(neutral, calculateRecipe(neutral)).residuals).not.toEqual(
      assessRecipeDirection(extreme, calculateRecipe(extreme)).residuals,
    );
    expect(extremeScore).toBeTypeOf('number');
    expect(recipeFitForInput(restored).score).toBe(neutralScore);
  });
});
