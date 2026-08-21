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
import { recipeFitForInput } from '@/features/protein-gelato/proteinTarget';
import { assessSorbetStabilizerSystem } from '@/features/recipe-constraints';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { assessRecipeDirection } from './recipeDirectionAssessment';
import {
  buildRecipeDirectionPlan,
  recipeDirectionViolations,
  SORBET_HARDNESS_TARGET_CENTERS,
  SORBET_SWEETNESS_TARGET_CENTERS,
} from './recipeDirectionTargets';

const TARGETS = [-2, -1, 0, 1, 2] as const;
const TEMPERATURES = [-11, -12, -13] as const;
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
        ingredient: mapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
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
  recipeDirectionViolations(input).reduce(
    (sum, violation) => sum + violation.severity_points,
    0,
  );

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
        expect(SORBET_HARDNESS_TARGET_CENTERS[temperature][target]).toBe(
          expectedHardness[index],
        );
        if (temperature === -11) {
          expect(plan.bands.pod).toEqual({ min: 16 + index * 2, max: 16 + index * 2 });
          expect(plan.bands.npac).toEqual({
            min: expectedHardness[index],
            max: expectedHardness[index],
          });
        } else {
          expect(plan.bands.pod).toBeUndefined();
          expect(plan.bands.npac).toBeUndefined();
        }
      }
    }
  });

  it('proves the pre-existing Sorbet ice authority is unsatisfiable at −12/−13', () => {
    const minus12MaximumIce = estimateIceFraction({
      category: 'sorbet',
      temperature_c: -12,
      npac: 42,
    });
    const minus13MaximumIce = estimateIceFraction({
      category: 'sorbet',
      temperature_c: -13,
      npac: 48,
    });
    expect(minus12MaximumIce).toBeCloseTo(50.3748333333, 8);
    expect(minus12MaximumIce).toBeLessThan(51);
    expect(minus13MaximumIce).toBeCloseTo(49.8392753623, 8);
    expect(minus13MaximumIce).toBeLessThan(50);
  });

  it('enumerates 150 cells, exercises the 50 satisfiable −11 cells, and marks 100 authority-blocked cells', () => {
    let cells = 0;
    let runtimeCells = 0;
    let authorityBlockedCells = 0;
    const outputs = new Map<
      string,
      { status: 'runtime'; pod: number; npac: number } | { status: 'authority_blocked' }
    >();
    for (const temperature of TEMPERATURES) {
      const base = { ...nativeSafeMinus11Base(), target_temperature_c: temperature };
      const snapshots = snapshotsFor(base);
      for (const strategy of STRATEGIES) {
        for (const sweetness of TARGETS) {
          for (const hardness of TARGETS) {
            cells += 1;
            const input = directed(base, strategy, sweetness, hardness);
            const key = `${temperature}/${strategy}/${sweetness}/${hardness}`;
            if (temperature !== -11) {
              authorityBlockedCells += 1;
              expect(detectViolations(calculateRecipe(input)).length).toBeGreaterThan(0);
              outputs.set(key, { status: 'authority_blocked' });
              continue;
            }
            runtimeCells += 1;
            const before = recipeDirectionViolations(input);
            const beforeSeverity = severity(input);
            expect(detectViolations(calculateRecipe(input))).toEqual([]);
            const built = buildOptimizePreview(input, EMPTY, `sorbet-${cells}`, {
              productBehaviorSnapshots: snapshots,
            });

            if (!built.ok) {
              if (built.code === 'already_clean') {
                expect(before).toEqual([]);
                const result = calculateRecipe(input);
                outputs.set(key, {
                  status: 'runtime',
                  pod: finiteMetric(result.pod_points, `${key} POD`),
                  npac: finiteMetric(result.npac_points, `${key} NPAC`),
                });
                expect(recipeFitForInput(input).score).toBe(10);
                continue;
              }
              if (built.code !== 'no_proposal') {
                throw new Error(`${key}: unexpected solver stop ${built.code}`);
              }
              expect(built.directionTargetUnreached).toBe(true);
              expect(built.solverInvocations ?? 0).toBeGreaterThan(0);
              expect(built.iteration?.draftVectorSearches ?? 0).toBeGreaterThan(0);
              const result = calculateRecipe(input);
              outputs.set(key, {
                status: 'runtime',
                pod: finiteMetric(result.pod_points, `${key} POD`),
                npac: finiteMetric(result.npac_points, `${key} NPAC`),
              });
              continue;
            }

            const proposed = built.preview.proposedInput;
            const after = recipeDirectionViolations(proposed);
            const afterSeverity = severity(proposed);
            const result = calculateRecipe(proposed);
            expect(built.preview.diagnosticOnly).not.toBe(true);
            expect(detectViolations(result)).toEqual([]);
            expect(plannedSum(proposed)).toBeCloseTo(1_000, 6);
            expect(assessSorbetStabilizerSystem(proposed).issues).toEqual([]);
            expect(proposed.goals?.direction_targets).toEqual(input.goals?.direction_targets);
            expect(after.length).toBeLessThanOrEqual(before.length);
            if (before.length > 0 && after.length === before.length) {
              expect(
                afterSeverity,
                `${key}: ${beforeSeverity} -> ${afterSeverity}; before=${JSON.stringify(input.items.map((item) => [item.id, item.planned_grams]))}; after=${JSON.stringify(proposed.items.map((item) => [item.id, item.planned_grams]))}`,
              ).toBeLessThan(beforeSeverity - 1e-9);
            }
            outputs.set(key, {
              status: 'runtime',
              pod: finiteMetric(result.pod_points, `${key} POD`),
              npac: finiteMetric(result.npac_points, `${key} NPAC`),
            });
            const assessment = assessRecipeDirection(proposed, result);
            expect(recipeFitForInput(proposed).score).toBe(assessment.score);
          }
        }
      }
    }
    expect(cells).toBe(150);
    expect(runtimeCells).toBe(50);
    expect(authorityBlockedCells).toBe(100);
    expect(outputs.size).toBe(150);

    for (const temperature of [-11] as const) {
      for (const strategy of STRATEGIES) {
        for (const hardness of TARGETS) {
          const values = TARGETS.map(
            (sweetness) => {
              const output = outputs.get(`${temperature}/${strategy}/${sweetness}/${hardness}`)!;
              expect(output.status).toBe('runtime');
              return output.status === 'runtime' ? output.pod : Number.NaN;
            },
          );
          for (let index = 1; index < values.length; index += 1) {
            expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]! - 1e-9);
          }
        }
        for (const sweetness of TARGETS) {
          const values = TARGETS.map(
            (hardness) => {
              const output = outputs.get(`${temperature}/${strategy}/${sweetness}/${hardness}`)!;
              expect(output.status).toBe('runtime');
              return output.status === 'runtime' ? output.npac : Number.NaN;
            },
          );
          for (let index = 1; index < values.length; index += 1) {
            expect(values[index]).toBeLessThanOrEqual(values[index - 1]! + 1e-9);
          }
        }
      }
    }
  }, 300_000);

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
