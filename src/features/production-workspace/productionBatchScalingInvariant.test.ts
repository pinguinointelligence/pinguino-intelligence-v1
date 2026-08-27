import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput, type RecipeResult } from '@/engine';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  buildProductionForecastInput,
  confirmProductionLine,
  confirmProductionTopUpTask,
  createProductionSession,
  pendingProductionTopUpTasks,
  setDraftActualGrams,
  topUpProductionLine,
  type ProductionSession,
} from './productionSession';
import { assessProductionRescue } from './productionRescue';

const OWNER_PLAN = [
  ['milk', 'PI-ING-000236', 657],
  ['cream', 'PI-ING-000180', 95],
  ['smp', 'PI-ING-000270', 49],
  ['sucrose', 'PI-ING-000514', 85],
  ['dextrose', 'PI-ING-000494', 71],
  ['tara', 'PI-ING-000492', 3],
  ['apple', 'PI-ING-000342', 40],
] as const;

const P0_RESCUE_SCORE_PLAN = [
  ['milk', 'PI-ING-000236', 613],
  ['cream', 'PI-ING-000180', 176],
  ['smp', 'PI-ING-000270', 48],
  ['sucrose', 'PI-ING-000514', 95],
  ['dextrose', 'PI-ING-000494', 64],
  ['tara', 'PI-ING-000492', 4],
] as const;

const ownerInput = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'eco',
    cost_priority: 'balanced',
    flavor_intensity: 'balanced',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    excluded_ingredient_ids: [],
    unavailable_main_ingredient_ids: [],
  },
  items: OWNER_PLAN.map(([id, mapperId, plannedGrams]) => ({
    id,
    ingredient: sorbetMapperIngredient(mapperId),
    planned_grams: plannedGrams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
    ...(id === 'apple'
      ? { user_target_grams: plannedGrams, user_intent_anchor_grams: plannedGrams }
      : {}),
  })),
});

const ownerSession = (): ProductionSession => {
  const plannedInput = ownerInput();
  return createProductionSession({
    sessionId: 'owner-final-tests-1',
    ownerUserId: 'owner',
    source: {
      recipeId: 'final-tests-1',
      recipeVersionId: 'final-tests-1-v1',
      recipeVersionNumber: 1,
      recipeName: 'FinalTests1',
    },
    plannedInput,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: plannedInput.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: productBehaviorTestSnapshots(plannedInput),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-27T06:02:16.078Z',
  });
};

const p0RescueScoreInput = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    cost_priority: 'balanced',
    flavor_intensity: 'balanced',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    excluded_ingredient_ids: [],
    unavailable_main_ingredient_ids: [],
  },
  items: P0_RESCUE_SCORE_PLAN.map(([id, mapperId, plannedGrams]) => ({
    id,
    ingredient: sorbetMapperIngredient(mapperId),
    planned_grams: plannedGrams,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
});

const p0RescueScoreSession = (): ProductionSession => {
  const plannedInput = p0RescueScoreInput();
  return createProductionSession({
    sessionId: 'p0-production-rescue-score-authority',
    ownerUserId: 'owner',
    source: {
      recipeId: 'p0-production-rescue-score-authority',
      recipeVersionId: 'p0-production-rescue-score-authority-v1',
      recipeVersionNumber: 1,
      recipeName: 'P0 Production Rescue score authority',
    },
    plannedInput,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: plannedInput.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: productBehaviorTestSnapshots(plannedInput),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-27T21:00:00.000Z',
  });
};

const p0RescueScoreDeviation = (
  changedLineId: 'dextrose' | 'sucrose' | 'smp' | 'tara',
  actualGrams: number,
): ProductionSession => {
  let session = p0RescueScoreSession();
  for (const [index, line] of session.lines.entries()) {
    const grams = line.lineId === changedLineId ? actualGrams : line.plannedGrams;
    session = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, grams),
      line.lineId,
      `2026-08-27T21:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  }
  return session;
};

const confirmVector = (actualByLineId: Readonly<Record<string, number>>): ProductionSession => {
  let session = ownerSession();
  for (const [index, line] of session.lines.entries()) {
    const grams = actualByLineId[line.lineId] ?? line.plannedGrams;
    session = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, grams),
      line.lineId,
      `2026-08-27T06:${String(index + 3).padStart(2, '0')}:00.000Z`,
    );
  }
  return session;
};

const expectCloseRecord = (actualValue: object, expectedValue: object): void => {
  const actual = actualValue as Readonly<Record<string, number>>;
  const expected = expectedValue as Readonly<Record<string, number>>;
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    expect(actual[key], key).toBeCloseTo(expected[key]!, 9);
  }
};

const normalizedSugar = (result: RecipeResult): Record<string, number> =>
  Object.fromEntries(
    Object.entries(result.sugar).map(([key, grams]) => [key, (grams / result.total_batch_g) * 100]),
  );

const expectRatioMetricsEquivalent = (actual: RecipeResult, expected: RecipeResult): void => {
  expectCloseRecord(actual.percentages, expected.percentages);
  expectCloseRecord(normalizedSugar(actual), normalizedSugar(expected));
  expect(actual.pod_points).toBeCloseTo(expected.pod_points!, 9);
  expect(actual.pac_points).toBeCloseTo(expected.pac_points!, 9);
  expect(actual.npac_points).toBeCloseTo(expected.npac_points!, 9);
  expect(actual.ice_fraction_percent).toBeCloseTo(expected.ice_fraction_percent!, 9);
  expect(actual.indicators.map(({ key, status }) => ({ key, status }))).toEqual(
    expected.indicators.map(({ key, status }) => ({ key, status })),
  );
  for (const expectedIndicator of expected.indicators) {
    const actualIndicator = actual.indicators.find(({ key }) => key === expectedIndicator.key)!;
    if (expectedIndicator.value === null) {
      expect(actualIndicator.value, expectedIndicator.key).toBeNull();
    } else {
      expect(actualIndicator.value, expectedIndicator.key).toBeCloseTo(expectedIndicator.value, 9);
    }
    expect({
      bandStatus: actualIndicator.band_status,
      categoryFallback: actualIndicator.category_fallback,
      temperatureFallback: actualIndicator.temperature_fallback,
    }).toEqual({
      bandStatus: expectedIndicator.band_status,
      categoryFallback: expectedIndicator.category_fallback,
      temperatureFallback: expectedIndicator.temperature_fallback,
    });
  }
  expectCloseRecord(actual.scores!, expected.scores!);
  expectCloseRecord(actual.nutrition_per_100g!, expected.nutrition_per_100g!);
  expect(actual.costs?.cost_per_kg).toBeCloseTo(expected.costs!.cost_per_kg!, 9);
};

describe('Production batch scaling mathematical truth', () => {
  it('proves the served 1017 g vector scores 8/10 in canonical Recipe because of Direction, not Engine physics', () => {
    const plannedInput = p0RescueScoreInput();
    const plannedResult = calculateRecipe(plannedInput);
    const roundedGrams = [623, 179, 49, 97, 65, 4] as const;
    const roundedInput: RecipeInput = {
      ...plannedInput,
      target_batch_grams: 1_017,
      items: plannedInput.items.map((item, index) => ({
        ...item,
        planned_grams: roundedGrams[index]!,
      })),
    };
    const roundedResult = calculateRecipe(roundedInput);
    const roundedScore = recipeFitForInput(roundedInput, roundedResult);

    expect(recipeFitForInput(plannedInput, plannedResult).display).toBe('10/10');
    expect(roundedResult.total_batch_g).toBe(1_017);
    expect(detectViolations(roundedResult)).toEqual([]);
    expect(roundedScore).toMatchObject({
      score: 8,
      display: '8/10',
      validatedNative: true,
      provisional: false,
      violationCount: 0,
    });
    expect(roundedScore.ariaText).toContain('Kierunek receptury: 0 z 2 obsługiwanych osi w celu.');
    expect(roundedResult).toMatchObject({
      pod_points: 15.009423795476895,
      pac_points: 27.38850245821042,
      npac_points: 41.04947818110864,
      ice_fraction_percent: 46.003328586607545,
      percentages: {
        water_percent: 66.72070796460177,
        solids_percent: 33.27929203539823,
        fat_percent: 7.464798426745328,
        protein_percent: 3.970501474926254,
      },
    });
  });

  it('uses the exact P0 Dextrose 64 → 65 g Restore candidate for score, apply, forecast, and completion', () => {
    const plannedInput = p0RescueScoreInput();
    const plannedResult = calculateRecipe(plannedInput);
    let session = p0RescueScoreDeviation('dextrose', 65);
    const assessment = assessProductionRescue(session);
    const restore = assessment.options.find(({ id }) => id === 'restore_original_recipe');
    const scale = 65 / 64;
    const idealVector = plannedInput.items.map((item) => item.planned_grams * scale);
    const idealInput: RecipeInput = {
      ...plannedInput,
      target_batch_grams: 1_015.625,
      items: plannedInput.items.map((item, index) => ({
        ...item,
        planned_grams: idealVector[index]!,
      })),
    };
    const idealResult = calculateRecipe(idealInput);

    expect(idealVector).toEqual([622.578125, 178.75, 48.75, 96.484375, 65, 4.0625]);
    expect(idealVector.reduce((sum, grams) => sum + grams, 0)).toBe(1_015.625);
    expectRatioMetricsEquivalent(idealResult, plannedResult);
    expect(recipeFitForInput(idealInput, idealResult).display).toBe('10/10');
    expect(
      assessment.forecastInput.items.map((item) => item.actual_grams ?? item.planned_grams),
    ).toEqual([613, 176, 48, 95, 65, 4]);
    expect(recipeFitForInput(plannedInput, plannedResult).display).toBe('10/10');
    expect(restore).toBeDefined();
    expect(restore!.candidateInput.items.map((item) => item.planned_grams)).toEqual([
      622.6, 178.8, 48.800000000000004, 96.5, 65, 4.1000000000000005,
    ]);
    expect(restore!.finalMassG).toBeCloseTo(1_015.8, 9);
    expect(restore!.scoreDisplay).toBe('10/10');

    const recipeResult = calculateRecipe(restore!.candidateInput);
    const recipeScore = recipeFitForInput(restore!.candidateInput, recipeResult);
    expect(restore!.practicalAudit.executableResult).toEqual(recipeResult);
    expect(restore!.scoreDisplay).toBe(recipeScore.display);

    session = applyVerifiedRescueInput(session, restore!.candidateInput, 1);
    const appliedForecast = buildProductionForecastInput(session);
    const appliedResult = calculateRecipe(appliedForecast);
    expect(appliedForecast.items.map((item) => item.actual_grams ?? item.planned_grams)).toEqual(
      restore!.candidateInput.items.map((item) => item.planned_grams),
    );
    expect(appliedForecast.target_batch_grams).toBeCloseTo(1_015.8, 9);
    expect(appliedResult.warnings).toEqual([]);
    expectRatioMetricsEquivalent(appliedResult, recipeResult);
    expect(recipeFitForInput(appliedForecast, appliedResult).display).toBe(restore!.scoreDisplay);

    for (const task of pendingProductionTopUpTasks(session)) {
      session = confirmProductionTopUpTask(session, task.taskId, '2026-08-27T21:30:00.000Z');
    }
    const finalInput = buildFinalActualInput(session);
    const finalResult = calculateRecipe(finalInput);
    expect(finalInput.items.map((item) => item.actual_grams)).toEqual(
      restore!.candidateInput.items.map((item) => item.planned_grams),
    );
    expectRatioMetricsEquivalent(finalResult, recipeResult);
    expect(recipeFitForInput(finalInput, finalResult).display).toBe(restore!.scoreDisplay);
  });

  it.each([
    ['Dextrose 64 → 65 g', 'dextrose', 65],
    ['Dextrose 64 → 66 g', 'dextrose', 66],
    ['Sucrose 95 → 96 g', 'sucrose', 96],
    ['SMP 48 → 49 g', 'smp', 49],
    ['TARA 4.0 → 4.1 g', 'tara', 4.1],
  ] as const)(
    'keeps Recipe and Production Rescue score/metric authority identical for %s',
    (_label, lineId, actualGrams) => {
      const assessment = assessProductionRescue(p0RescueScoreDeviation(lineId, actualGrams));
      const restore = assessment.options.find(({ id }) => id === 'restore_original_recipe');

      expect(restore, 'feasible proportional Restore').toBeDefined();
      const recipeResult = calculateRecipe(restore!.candidateInput);
      const recipeScore = recipeFitForInput(restore!.candidateInput, recipeResult);
      const rescueResult = restore!.practicalAudit.executableResult;

      expect(restore!.scoreDisplay).toBe(recipeScore.display);
      expect(rescueResult.pod_points).toBeCloseTo(recipeResult.pod_points!, 12);
      expect(rescueResult.pac_points).toBeCloseTo(recipeResult.pac_points!, 12);
      expect(rescueResult.npac_points).toBeCloseTo(recipeResult.npac_points!, 12);
      expect(rescueResult.ice_fraction_percent).toBeCloseTo(recipeResult.ice_fraction_percent!, 12);
      for (const metric of [
        'water_percent',
        'solids_percent',
        'fat_percent',
        'protein_percent',
      ] as const) {
        expect(rescueResult.percentages[metric]).toBeCloseTo(recipeResult.percentages[metric], 12);
      }
      expect(rescueResult).toEqual(recipeResult);
    },
  );

  it.each([3.1, 3.2, 3.5])(
    'keeps a safe 3.0 → %s g stabilizer deviation continuable and proportionally restorable',
    (actualStabilizerG) => {
      const plannedInput = ownerInput();
      const session = confirmVector({ tara: actualStabilizerG });
      const assessment = assessProductionRescue(session);
      const continuation = assessment.options.find(({ id }) => id === 'leave_as_is');
      const restore = assessment.options.find(({ id }) => id === 'restore_original_recipe');

      expect(assessment.hardSafety).toMatchObject({ safe: true, violationMetrics: [] });
      expect(continuation, 'safe continuation').toBeDefined();
      expect(continuation!.candidateInput.items.find(({ id }) => id === 'tara')).toMatchObject({
        planned_grams: actualStabilizerG,
        actual_grams: null,
      });
      expect(continuation!.candidateInput.target_batch_grams).toBeCloseTo(
        1_000 + actualStabilizerG - 3,
        9,
      );
      expect(continuation!.scoreDisplay).toBe(
        recipeFitForInput(assessment.forecastInput, assessment.forecastResult).display,
      );

      expect(restore, 'proportional restoration').toBeDefined();
      const scale = actualStabilizerG / 3;
      const expectedTargets = Object.fromEntries(
        plannedInput.items.map((item) => [
          item.id,
          Math.round((item.planned_grams * scale + Number.EPSILON) * 10) / 10,
        ]),
      );
      const expectedTotal = Object.values(expectedTargets).reduce((sum, grams) => sum + grams, 0);
      expect(restore!.candidateInput.target_batch_grams).toBeCloseTo(expectedTotal, 9);
      expect(restore!.finalMassG).toBeCloseTo(expectedTotal, 9);
      for (const item of restore!.candidateInput.items) {
        expect(item.planned_grams, item.id).toBeCloseTo(expectedTargets[item.id]!, 9);
        expect(item.actual_grams, item.id).toBeNull();
      }
      expect(restore!.instructions).toEqual(
        expect.arrayContaining(
          plannedInput.items
            .filter((item) => item.id !== 'tara')
            .map((item) => ({
              lineId: item.id,
              ingredientName: item.ingredient.name,
              kind: 'add' as const,
              grams: expect.closeTo(expectedTargets[item.id]! - item.planned_grams, 9),
              finalTargetGrams: expect.closeTo(expectedTargets[item.id]!, 9),
            })),
        ),
      );
      expect(restore!.instructions.some(({ lineId }) => lineId === 'tara')).toBe(false);
    },
  );

  it('uses the accepted proportional stabilizer plan after a repeated deviation', () => {
    let session = confirmVector({ tara: 3.1 });
    const firstRestore = assessProductionRescue(session).options.find(
      ({ id }) => id === 'restore_original_recipe',
    );
    expect(firstRestore).toBeDefined();
    session = applyVerifiedRescueInput(session, firstRestore!.candidateInput, 1);
    for (const task of pendingProductionTopUpTasks(session)) {
      session = confirmProductionTopUpTask(session, task.taskId, '2026-08-27T07:00:00.000Z');
    }
    const acceptedTargetG = session.lines.reduce((sum, line) => sum + line.targetGrams, 0);
    session = topUpProductionLine(session, 'tara', 3.2, '2026-08-27T07:05:00.000Z');

    const secondAssessment = assessProductionRescue(session);
    const secondRestore = secondAssessment.options.find(
      ({ id }) => id === 'restore_original_recipe',
    );
    expect(secondRestore).toBeDefined();
    expect(secondRestore!.candidateInput.target_batch_grams).toBeGreaterThan(acceptedTargetG);
    expect(secondRestore!.candidateInput.items.find(({ id }) => id === 'tara')).toMatchObject({
      planned_grams: 3.2,
      actual_grams: null,
    });
  });

  it('keeps an ordinary non-stabilizer +0.1 g overweigh as the control case', () => {
    const assessment = assessProductionRescue(confirmVector({ cream: 95.1 }));
    expect(assessment.hardSafety).toMatchObject({ safe: true, violationMetrics: [] });
    expect(assessment.options.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['leave_as_is', 'restore_original_recipe']),
    );
  });

  it('uniform_batch_scaling_preserves_formula_score', () => {
    const plannedInput = ownerInput();
    const plannedResult = calculateRecipe(plannedInput);
    const plannedScore = recipeFitForInput(plannedInput, plannedResult);

    expect(plannedResult.total_batch_g).toBe(1_000);
    expect(plannedScore.display).toBe('10/10');

    for (const scale of [1.001, 1.05, 1.2, 2] as const) {
      const actualByLineId = Object.fromEntries(
        plannedInput.items.map((item) => [item.id, item.planned_grams * scale]),
      );
      const finalActualInput = buildFinalActualInput(confirmVector(actualByLineId));
      const scaledResult = calculateRecipe(finalActualInput);
      const scaledScore = recipeFitForInput(finalActualInput, scaledResult);

      expect(finalActualInput.target_batch_grams, `target ×${scale}`).toBeCloseTo(1_000 * scale, 9);
      expect(scaledResult.total_batch_g, `denominator ×${scale}`).toBeCloseTo(1_000 * scale, 9);
      for (const item of finalActualInput.items) {
        const planned = plannedInput.items.find(({ id }) => id === item.id)!;
        expect(
          (item.actual_grams! / scaledResult.total_batch_g) * 100,
          `${item.id} normalized share ×${scale}`,
        ).toBeCloseTo((planned.planned_grams / plannedResult.total_batch_g) * 100, 9);
      }
      expectRatioMetricsEquivalent(scaledResult, plannedResult);
      expect(scaledScore.display, `score ×${scale}`).toBe(plannedScore.display);
    }
  });

  it('reproduces the exact owner 10 → forecast 7 → Rescue 8 fixture truthfully', () => {
    const plannedInput = ownerInput();
    const plannedResult = calculateRecipe(plannedInput);
    const session = confirmVector({ cream: 95.5, sucrose: 95 });
    const finalActualInput = buildFinalActualInput(session);
    const assessment = assessProductionRescue(session);

    expect(recipeFitForInput(plannedInput, plannedResult).display).toBe('10/10');
    expect(finalActualInput.items.map((item) => item.actual_grams)).toEqual([
      657, 95.5, 49, 95, 71, 3, 40,
    ]);
    expect(assessment.forecastResult.total_batch_g).toBe(1_010.5);
    expect(assessment.forecastInput.target_batch_grams).toBe(1_000);
    expect(assessment.forecastScoreDisplay).toBe('7/10');

    const targetAdjustedResult = calculateRecipe({
      ...assessment.forecastInput,
      target_batch_grams: assessment.forecastResult.total_batch_g,
    });
    expectRatioMetricsEquivalent(targetAdjustedResult, assessment.forecastResult);
    expect(
      recipeFitForInput(
        { ...assessment.forecastInput, target_batch_grams: 1_010.5 },
        targetAdjustedResult,
      ).display,
    ).toBe('7/10');

    expect(
      (95.5 / assessment.forecastResult.total_batch_g) * 100,
      'Cream normalized actual share',
    ).not.toBeCloseTo(95 / plannedResult.total_batch_g, 6);
    expect(
      (95 / assessment.forecastResult.total_batch_g) * 100,
      'Sucrose normalized actual share',
    ).not.toBeCloseTo(85 / plannedResult.total_batch_g, 6);

    const minimumSafe = assessment.options.find(({ id }) => id === 'enlarge_batch');
    expect(minimumSafe).toMatchObject({
      finalMassG: 1_018.2,
      scoreDisplay: '8/10',
      instructions: [
        {
          lineId: 'milk',
          ingredientName: 'MILK 3.5% · Milk · Chilled',
          kind: 'add',
          grams: expect.closeTo(7.7, 9),
          finalTargetGrams: expect.closeTo(664.7, 9),
        },
      ],
    });
    expect(minimumSafe!.candidateInput.target_batch_grams).toBe(1_018.2);
    expect(calculateRecipe(minimumSafe!.candidateInput).total_batch_g).toBe(1_018.2);
  });

  it('keeps a mixed over/under vector on the direct truthful Engine path', () => {
    const session = confirmVector({ cream: 100, sucrose: 80 });
    const finalActualInput = buildFinalActualInput(session);
    const directResult = calculateRecipe(finalActualInput);
    const assessment = assessProductionRescue(session);

    expect(directResult.total_batch_g).toBe(1_000);
    expect(assessment.forecastResult).toEqual(directResult);
    expect(assessment.forecastScoreDisplay).toBe(
      recipeFitForInput(finalActualInput, directResult).display,
    );
    expect(assessment.state).not.toBe('not_needed');
    expect(assessment.options.every(({ verifiedByEngine }) => verifiedByEngine)).toBe(true);
  });

  it('keeps the no-deviation batch and score unchanged', () => {
    const plannedInput = ownerInput();
    const plannedResult = calculateRecipe(plannedInput);
    const session = confirmVector({});
    const finalActualInput = buildFinalActualInput(session);
    const finalResult = calculateRecipe(finalActualInput);
    const assessment = assessProductionRescue(session);

    expect(finalActualInput.target_batch_grams).toBe(1_000);
    expect(finalResult.total_batch_g).toBe(1_000);
    expectRatioMetricsEquivalent(finalResult, plannedResult);
    expect(recipeFitForInput(finalActualInput, finalResult).display).toBe('10/10');
    expect(assessment.state).toBe('not_needed');
    expect(assessment.forecastScoreDisplay).toBe('10/10');
  });
});
