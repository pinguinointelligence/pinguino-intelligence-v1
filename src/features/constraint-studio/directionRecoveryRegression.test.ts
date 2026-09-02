import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorSnapshotFingerprint } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { recipeTechnicalFit } from '@/features/recipe-score';
import {
  assessDirectionCandidateProgress,
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
  type ConstraintPreview,
} from './applyPipeline';

vi.setConfig({ testTimeout: 120_000 });

const NONE = { byLineId: {} } as const;
const AT = '2026-08-28T09:00:00.000Z';
const LEVELS = [-2, 0, 2] as const satisfies readonly RecipeDirectionTarget[];

const source = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [header = [], ...records] = parseCsv(source);
const index = new Map(header.map((name, position) => [name, position]));
const numericFields = new Set([
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
      if (numericFields.has(field)) return [field, raw === '' ? null : Number(raw)];
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
  main = false,
): RecipeInput['items'][number] => ({
  id,
  ingredient: {
    ...ingredientRowToEngineIngredient(mapperRow(ingredientId)),
    cost_per_kg: 1,
    cost_currency: 'EUR',
  },
  planned_grams: grams,
  actual_grams: null,
  lock_type: main ? 'main' : 'unlocked',
  ...(main ? { main_ratio_weight: 1 } : {}),
});

const recipe = (
  kind: 'single' | 'owner-multi',
  axis: 'sweetness' | 'softness',
  level: RecipeDirectionTarget,
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: {
      sweetness: axis === 'sweetness' ? level : 0,
      softness: axis === 'softness' ? level : 0,
      creaminess: 0,
      flavor: 0,
    },
  },
  items:
    kind === 'single'
      ? [
          line('milk', IDS.milk, 296),
          line('cream', IDS.cream, 142),
          line('smp', IDS.smp, 72),
          line('sucrose', IDS.sucrose, 92),
          line('dextrose', IDS.dextrose, 43),
          line('tara', IDS.tara, 5),
          line('strawberry-main', IDS.strawberry, 350, true),
        ]
      : [
          line('milk', IDS.milk, 300),
          line('cream', IDS.cream, 127),
          line('smp', IDS.smp, 62),
          line('sucrose', IDS.sucrose, 126),
          line('dextrose', IDS.dextrose, 7),
          line('tara', IDS.tara, 5),
          line('strawberry-main', IDS.strawberry, 187, true),
          line('watermelon-main', IDS.watermelon, 186, true),
        ],
});

const options = (input: RecipeInput) => ({
  productBehaviorSnapshots: productBehaviorTestSnapshots(input),
  technicalOnlyMainLineIds: input.items
    .filter((item) => item.lock_type === 'main')
    .map((item) => item.id),
});

const assertDirectionOutcome = (input: RecipeInput): void => {
  expect(input.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1_000);
  const before = calculateRecipe(input);
  expect(detectViolations(before)).toEqual([]);
  const built = buildOptimizePreview(input, NONE, AT, options(input));

  if (!built.ok) {
    expect(['already_clean', 'no_proposal']).toContain(built.code);
    if (built.code === 'already_clean') {
      expect(assessRecipeDirection(input, calculateRecipe(input)).reached).toBe(true);
    } else {
      expect('directionTargetUnreached' in built && built.directionTargetUnreached === true).toBe(
        true,
      );
    }
    return;
  }

  const progress = assessDirectionCandidateProgress(input, built.preview.proposedInput);
  expect(progress.accepted).toBe(true);
  expect(progress.reached || (progress.materiallyDifferent && progress.strictlyCloser)).toBe(true);
  expect(detectViolations(calculateRecipe(built.preview.proposedInput))).toEqual([]);
  expect(
    built.preview.proposedInput.items
      .filter((item) => item.lock_type === 'main')
      .some((item) => item.planned_grams <= 1),
  ).toBe(false);
};

describe.each(['single', 'owner-multi'] as const)(
  'Direction strict-progress recovery — %s fixture',
  (kind) => {
    it.each(['sweetness', 'softness'] as const)('%s −2 / 0 / +2', (axis) => {
      for (const level of LEVELS) assertDirectionOutcome(recipe(kind, axis, level));
    });
  },
);

describe('exact owner Multi-Main recovery fixture', () => {
  it('pins both identities, 1:1 Crown ratio, whole grams and Main proof across the matrix', () => {
    for (const axis of ['sweetness', 'softness'] as const) {
      for (const level of LEVELS) {
        const input = recipe('owner-multi', axis, level);
        const baseOptions = options(input);
        const raw = buildOptimizePreview(input, NONE, AT, baseOptions);
        if (!raw.ok) {
          expect(['already_clean', 'no_proposal']).toContain(raw.code);
          continue;
        }
        const proposalSnapshots = productBehaviorTestSnapshots(raw.preview.proposedInput);
        const built = bindProductBehaviorToPreview(
          raw,
          proposalSnapshots,
          baseOptions.productBehaviorSnapshots,
          baseOptions.technicalOnlyMainLineIds,
        );
        expect(built.ok, JSON.stringify(built)).toBe(true);
        if (!built.ok) continue;
        const mains = built.preview.proposedInput.items.filter((item) => item.lock_type === 'main');
        expect(mains.map((item) => item.id)).toEqual(['strawberry-main', 'watermelon-main']);
        expect(mains.map((item) => item.main_ratio_weight)).toEqual([1, 1]);
        expect(Math.abs(mains[0]!.planned_grams - mains[1]!.planned_grams)).toBeLessThanOrEqual(1);
        expect(mains.every((item) => item.planned_grams > 1)).toBe(true);
        expect(built.preview.mainObjective).not.toBeNull();
        expect(built.preview.mainObjective).toMatchObject({
          exactAcceptedMainGrams: mains[0]!.planned_grams + mains[1]!.planned_grams,
          executableMainGrams: mains[0]!.planned_grams + mains[1]!.planned_grams,
          technicalScore: 10,
        });
        expect(built.preview.mainObjective?.technicalScore).toBe(
          recipeTechnicalFit(calculateRecipe(built.preview.proposedInput)).score,
        );
        const proposedFingerprint = workingStateFingerprint(
          built.preview.proposedInput,
          built.preview.nextConstraints,
        );
        const committed = commitPreview(
          input,
          NONE,
          built.preview,
          `${AT}:${axis}:${level}`,
          `owner-multi-${axis}-${level}`,
          [],
          undefined,
          null,
          null,
          {
            baseFingerprint: built.preview.baseFingerprint,
            targetFingerprint: directionTargetFingerprint(input),
            candidateFingerprint: proposedFingerprint,
          },
          null,
          baseOptions.productBehaviorSnapshots,
          baseOptions.technicalOnlyMainLineIds,
          {
            baseFingerprint: built.preview.baseFingerprint,
            proposedFingerprint,
            baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(
              baseOptions.productBehaviorSnapshots,
            ),
            proposedProductBehaviorFingerprint:
              productBehaviorSnapshotFingerprint(proposalSnapshots),
            snapshots: structuredClone(proposalSnapshots),
          },
        );
        expect(committed.ok, JSON.stringify(committed)).toBe(true);
        if (!committed.ok) continue;
        const appliedMains = committed.verified.input.items.filter(
          (item) => item.lock_type === 'main',
        );
        expect(appliedMains.map((item) => item.id)).toEqual(['strawberry-main', 'watermelon-main']);
        expect(appliedMains.map((item) => item.main_ratio_weight)).toEqual([1, 1]);
        expect(
          Math.abs(appliedMains[0]!.planned_grams - appliedMains[1]!.planned_grams),
        ).toBeLessThanOrEqual(1);
        expect(appliedMains.every((item) => item.planned_grams > 1)).toBe(true);
      }
    }
  });

  it('makes the Apply authority independently reject an unchanged unreached Direction candidate', () => {
    const input = recipe('owner-multi', 'sweetness', 2);
    const built = buildOptimizePreview(input, NONE, AT, options(input));
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const forged: ConstraintPreview = {
      ...built.preview,
      proposedInput: structuredClone(input),
      directionAssessment: assessRecipeDirection(input, calculateRecipe(input)),
    };
    const consent = {
      baseFingerprint: forged.baseFingerprint,
      targetFingerprint: directionTargetFingerprint(input),
      candidateFingerprint: workingStateFingerprint(forged.proposedInput, NONE),
    };
    const snapshots = productBehaviorTestSnapshots(input);
    const outcome = commitPreview(
      input,
      NONE,
      forged,
      AT,
      'direction-zero-change-forgery',
      [],
      undefined,
      null,
      null,
      consent,
      null,
      snapshots,
      options(input).technicalOnlyMainLineIds,
    );
    expect(outcome).toMatchObject({ ok: false, code: 'unsafe_proposal' });
  });
});
