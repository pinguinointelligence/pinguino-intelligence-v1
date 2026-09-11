import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget, type RecipeInput } from '@/engine';
import { ingredientOf } from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorSnapshotFingerprint } from '@/features/product-intelligence';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { recipeTechnicalFit } from '@/features/recipe-score';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  plannedSum,
  workingStateFingerprint,
} from './applyPipeline';
import { buildDirectionFallback } from './directionFallback';

const NONE = { byLineId: {} } as const;
const AT = '2026-09-10T00:00:00.000Z';
const LEVELS = [-2, -1, 0, 1, 2] as const satisfies readonly RecipeDirectionTarget[];

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  main = false,
): RecipeInput['items'][number] => ({
  id,
  ingredient: ingredientOf(ingredientId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: main ? 'main' : 'unlocked',
  ...(main ? { main_ratio_weight: 1 } : {}),
});

const approvedStrawberryTemplate = (strategy: 'eco' | 'optimal'): RecipeInput => ({
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: strategy,
    direction_targets_active: false,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
  items: [
    line('strawberry-main', 'PI-ING-001553', 324.3, true),
    line('water', 'PI-ING-001409', 152.2),
    line('oat-drink', 'PI-ING-001565', 213.3),
    line('coconut-oil', 'PI-ING-000163', 33.6),
    line('sucrose', 'PI-ING-000514', 157),
    line('dextrose', 'PI-ING-000494', 57.7),
    line('inulin', 'PI-ING-000456', 59.9),
    line('tara', 'PI-ING-000492', 2),
  ],
});

const behaviorOptions = (input: RecipeInput) => {
  const snapshots = productBehaviorTestSnapshots(input);
  snapshots['strawberry-main'] = {
    ...snapshots['strawberry-main']!,
    mapperIngredientId: 'PI-ING-001553',
    mainCapability: 'MAIN_CAPABLE',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-vegan-strawberry-1553',
    mainPolicyVersion: '2',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    ecoFloorPercent: 30,
    optimalCeilingPercent: 74.7,
    hardLimitPercent: 74.7,
    multiMainHardLimitPercent: 74.7,
    requiresLiquidDairyCarrier: false,
    liquidDairyCarrierFloorPercent: null,
  } as ProductBehaviorSnapshot;
  return {
    productBehaviorSnapshots: snapshots,
    requirePracticalPreview: true,
  } as const;
};

const vector = (input: RecipeInput): number[] => {
  const order = [
    'PI-ING-001553',
    'PI-ING-001409',
    'PI-ING-001565',
    'PI-ING-000163',
    'PI-ING-000514',
    'PI-ING-000494',
    'PI-ING-000456',
    'PI-ING-000492',
  ];
  return order.map(
    (ingredientId) =>
      input.items.find(
        (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === ingredientId,
      )?.planned_grams ?? 0,
  );
};

const withDirection = (
  input: RecipeInput,
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => ({
  ...structuredClone(input),
  goals: {
    ...input.goals,
    direction_targets_active: true,
    direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
  },
});

const canonicalByStrategy = new Map<'eco' | 'optimal', RecipeInput>();
const canonicalPreview = (strategy: 'eco' | 'optimal'): RecipeInput => {
  const cached = canonicalByStrategy.get(strategy);
  if (cached) return cached;
  const template = approvedStrawberryTemplate(strategy);
  const canonical = buildOptimizePreview(template, NONE, AT, behaviorOptions(template));
  expect(canonical.ok).toBe(true);
  if (!canonical.ok) throw new Error(`Canonical Vegan Preview failed: ${canonical.code}`);
  expect(plannedSum(canonical.preview.proposedInput)).toBeCloseTo(1_000, 6);
  expect(vector(canonical.preview.proposedInput)).toEqual([747, 0, 4, 95, 0, 132, 20, 2]);
  canonicalByStrategy.set(strategy, canonical.preview.proposedInput);
  return canonical.preview.proposedInput;
};

const MATRIX = (['eco', 'optimal'] as const).flatMap((strategy) =>
  LEVELS.flatMap((sweetness) => LEVELS.map((softness) => ({ strategy, sweetness, softness }))),
);

describe('Vegan Strawberry Direction history independence', () => {
  it('retains the proven exact S1H5 result from the approved pre-solver template', () => {
    const template = approvedStrawberryTemplate('eco');
    const requested = withDirection(template, -2, -2);
    const solved = buildOptimizePreview(requested, NONE, AT, behaviorOptions(requested));
    expect(solved.ok, solved.ok ? undefined : JSON.stringify(solved)).toBe(true);
    if (!solved.ok) return;
    expect(solved.preview.directionAssessment?.reached).toBe(true);
  });

  it.each(MATRIX)(
    '$strategy S$sweetness H$softness publishes exact 10/10 from canonical V0',
    ({ strategy, sweetness, softness }) => {
      const requested = withDirection(canonicalPreview(strategy), sweetness, softness);
      const solved = buildOptimizePreview(requested, NONE, AT, behaviorOptions(requested));
      expect(solved.ok, solved.ok ? undefined : JSON.stringify(solved)).toBe(true);
      if (!solved.ok) return;
      const assessment = assessRecipeDirection(
        solved.preview.proposedInput,
        calculateRecipe(solved.preview.proposedInput),
      );
      expect(assessment.reached, JSON.stringify(assessment)).toBe(true);
      expect(assessment.score).toBe(10);
      expect(solved.preview.proposedInput.goals?.direction_targets).toEqual(
        requested.goals?.direction_targets,
      );
      expect(recipeTechnicalFit(calculateRecipe(solved.preview.proposedInput)).score).toBe(10);
    },
    120_000,
  );

  it('publishes and commits the formerly trapped S1H5 candidate from canonical V0', () => {
    const requested = withDirection(canonicalPreview('eco'), -2, -2);
    const baseOptions = behaviorOptions(requested);
    const raw = buildOptimizePreview(requested, NONE, AT, baseOptions);
    expect(raw.ok, raw.ok ? undefined : JSON.stringify(raw)).toBe(true);
    if (!raw.ok) return;

    const proposalSnapshots = behaviorOptions(raw.preview.proposedInput).productBehaviorSnapshots;
    const bound = bindProductBehaviorToPreview(
      raw,
      proposalSnapshots,
      baseOptions.productBehaviorSnapshots,
      [],
    );
    expect(bound.ok, JSON.stringify(bound)).toBe(true);
    if (!bound.ok) return;

    const proposedFingerprint = workingStateFingerprint(
      bound.preview.proposedInput,
      bound.preview.nextConstraints,
    );
    const committed = commitPreview(
      requested,
      NONE,
      bound.preview,
      AT,
      'vegan-history-s1h5',
      [],
      undefined,
      null,
      null,
      undefined,
      null,
      baseOptions.productBehaviorSnapshots,
      [],
      {
        baseFingerprint: bound.preview.baseFingerprint,
        proposedFingerprint,
        baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(
          baseOptions.productBehaviorSnapshots,
        ),
        proposedProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(proposalSnapshots),
        snapshots: structuredClone(proposalSnapshots),
      },
      null,
      { requirePracticalPreview: true },
    );
    expect(committed.ok, JSON.stringify(committed)).toBe(true);
    if (!committed.ok) return;
    expect(directionTargetFingerprint(committed.verified.input)).toBe(
      directionTargetFingerprint(requested),
    );
    expect(
      assessRecipeDirection(committed.verified.input, calculateRecipe(committed.verified.input))
        .score,
    ).toBe(10);
  }, 120_000);

  it('keeps the already-achieved S1 axis when a forced fallback relaxes only H5', () => {
    const requested = withDirection(canonicalPreview('eco'), -2, -2);
    const baseline = assessRecipeDirection(requested, calculateRecipe(requested));
    const baselineScore = baseline.score;
    expect(baselineScore).toBe(9);
    if (baselineScore === null) throw new Error('Expected an original S1H5 score');
    expect(baseline.residuals.find((residual) => residual.axis === 'sweetness')?.reached).toBe(
      true,
    );
    expect(baseline.residuals.find((residual) => residual.axis === 'softness')?.reached).toBe(
      false,
    );

    const report = buildDirectionFallback({
      input: requested,
      set: NONE,
      createdAt: AT,
      normalResult: { ok: false, code: 'no_proposal', failureKind: 'SEARCH_FAILED' },
      evaluateCandidate: ({ fallbackInput }) =>
        buildOptimizePreview(fallbackInput, NONE, AT, behaviorOptions(fallbackInput)),
    });

    expect(report.failureKind).toBe('SEARCH_FAILED');
    const best = report.best;
    expect(best).not.toBeNull();
    if (!best) throw new Error('Expected a Vegan S1H5 fallback candidate');
    expect(best.targets.sweetness).toBe(-2);
    expect(best.targets.softness).toBe(-1);
    expect(best.preservedOriginallySatisfiedAxes).toBe(true);
    const originalTargetScore = best.originalTargetScore;
    expect(originalTargetScore).not.toBeNull();
    if (originalTargetScore === null) {
      throw new Error('Expected the fallback to be scored against original S1H5');
    }
    expect(originalTargetScore).toBeGreaterThanOrEqual(baselineScore);
  }, 120_000);
});
