import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  buildProductionForecastInput,
  completeProductionSession,
  confirmProductionLine,
  correctRecordedPhysicalGrams,
  createProductionSession,
  productionProgress,
  productionSourceFingerprint,
  toppingProductionProgress,
  productionStepForGrams,
  reopenProductionRecord,
  setDraftActualGrams,
} from './productionSession';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';

function recipe(): RecipeInput {
  return {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: 'classic',
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
  };
}

function session() {
  const plannedInput = recipe();
  return createProductionSession({
    sessionId: 'run-1',
    ownerUserId: 'owner-1',
    source: {
      recipeId: 'recipe-1',
      recipeVersionId: 'version-1',
      recipeVersionNumber: 1,
      recipeName: 'Milk base',
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
    startedAt: '2026-08-09T10:00:00.000Z',
  });
}

describe('production session physical-reality contract', () => {
  it('binds the production source to immutable product behavior authority', () => {
    const input = recipe();
    const lineId = input.items[0]!.id;
    const behavior = {
      schemaVersion: 1,
      resolutionState: 'RESOLVED',
      lineId,
      productId: 'product-1',
      productVersionId: 'version-1',
      source: 'mapper',
      factsFingerprint: 'facts-1',
      behaviorBindingId: 'binding-1',
      behaviorBindingVersion: '1',
      taxonomyVersion: 'taxonomy-1',
      resolverVersion: 'resolver-1',
    } as ProductBehaviorSnapshot;
    const composition: RecipeCompositionMetadata = {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: { [lineId]: behavior },
      migrationAmbiguities: [],
    };
    const first = productionSourceFingerprint(input, composition);
    const second = productionSourceFingerprint(input, {
      ...composition,
      behaviorSnapshots: {
        [lineId]: { ...behavior, behaviorBindingVersion: '2' },
      },
    });
    expect(second).not.toBe(first);
  });

  it('rejects a rescue-added Mapper line without behavior authority', () => {
    const run = session();
    const candidate = buildProductionForecastInput(run);
    candidate.items.push({
      ...candidate.items[0]!,
      id: 'rescue-mapper-line',
      ingredient: {
        ...candidate.items[0]!.ingredient,
        id: 'PI-ING-rescue',
        canonical_ingredient_id: 'PI-ING-rescue',
        identity_provenance: 'mapper',
      },
      planned_grams: 1,
      actual_grams: null,
    });
    expect(() => applyVerifiedRescueInput(run, candidate)).toThrow(
      /Brak zatwierdzonego uprawnienia PRODUCTION/,
    );
  });
  it('uses persisted Base order for the operator without reordering Engine input', () => {
    const input = recipe();
    const reversed = input.items.map((item) => item.id).reverse();
    const run = createProductionSession({
      sessionId: 'ordered-run',
      ownerUserId: 'owner-1',
      source: {
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        recipeName: 'Ordered base',
      },
      plannedInput: input,
      plannedComposition: {
        schemaVersion: 1,
        baseScope: 'BASE_FORMULATION',
        baseOrder: reversed,
        toppings: [],
        migrationAmbiguities: [],
      },
      startedAt: '2026-08-11T00:00:00.000Z',
    });
    expect(run.lines.map((line) => line.lineId)).toEqual(reversed);
    expect(run.plannedInput.items.map((item) => item.id)).toEqual(
      input.items.map((item) => item.id),
    );
  });

  it('defaults every editable actual to plan without marking material as added', () => {
    const run = session();
    expect(run.lines.every((line) => line.draftActualGrams === line.plannedGrams)).toBe(true);
    expect(run.lines.every((line) => line.physicalAddedGrams === 0 && !line.confirmed)).toBe(true);
    expect(run.plannedInput.items.every((line) => line.actual_grams === null)).toBe(true);
  });

  it('does not score an unconfirmed edit, then forecasts from confirmed actual + pending plan', () => {
    const run = session();
    const line = run.lines[0]!;
    const edited = setDraftActualGrams(run, line.lineId, line.plannedGrams + 2);
    expect(buildProductionForecastInput(edited).items[0]!.planned_grams).toBe(line.plannedGrams);
    expect(buildProductionForecastInput(edited).items[0]!.actual_grams).toBeNull();

    const confirmed = confirmProductionLine(edited, line.lineId, '2026-08-09T10:01:00.000Z');
    const forecast = buildProductionForecastInput(confirmed);
    expect(forecast.items[0]!.actual_grams).toBe(line.plannedGrams + 2);
    expect(forecast.items[1]!.actual_grams).toBeNull();
    expect(calculateRecipe(forecast).total_batch_g).toBeCloseTo(1002, 8);
  });

  it('keeps the planned recipe immutable while exact, +2 g and -2 g actuals are recorded', () => {
    const run = session();
    const [a, b, c] = run.lines;
    let next = confirmProductionLine(run, a!.lineId, '2026-08-09T10:01:00.000Z');
    next = setDraftActualGrams(next, b!.lineId, b!.plannedGrams + 2);
    next = confirmProductionLine(next, b!.lineId, '2026-08-09T10:02:00.000Z');
    next = setDraftActualGrams(next, c!.lineId, c!.plannedGrams - 2);
    next = confirmProductionLine(next, c!.lineId, '2026-08-09T10:03:00.000Z');

    expect(next.plannedInput.items.map((item) => item.planned_grams)).toEqual(
      run.plannedInput.items.map((item) => item.planned_grams),
    );
    expect(next.lines.slice(0, 3).map((line) => line.physicalAddedGrams)).toEqual([
      a!.plannedGrams,
      b!.plannedGrams + 2,
      c!.plannedGrams - 2,
    ]);
  });

  it('never lets an accepted rescue reduce already-confirmed material', () => {
    const run = session();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, line.lineId, line.plannedGrams + 12),
      line.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const illegal = buildProductionForecastInput(confirmed);
    illegal.items[0] = {
      ...illegal.items[0]!,
      actual_grams: null,
      planned_grams: line.plannedGrams,
    };
    expect(() => applyVerifiedRescueInput(confirmed, illegal)).toThrow(/reduce physically added/);
  });

  it('turns a verified top-up into a pending confirmation while retaining the physical floor', () => {
    const run = session();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(run, line.lineId, '2026-08-09T10:01:00.000Z');
    const target = buildProductionForecastInput(confirmed);
    target.items[0] = {
      ...target.items[0]!,
      actual_grams: null,
      planned_grams: line.plannedGrams + 3,
    };
    const rescued = applyVerifiedRescueInput(confirmed, target);
    expect(rescued.lines[0]).toMatchObject({
      physicalAddedGrams: line.plannedGrams,
      targetGrams: line.plannedGrams + 3,
      draftActualGrams: line.plannedGrams + 3,
      confirmed: false,
    });
    expect(productionProgress(rescued)).toMatchObject({
      confirmedCount: 0,
      confirmedMassG: line.plannedGrams,
    });
    expect(() => setDraftActualGrams(rescued, line.lineId, line.plannedGrams - 1)).toThrow(
      /cannot remove physically added/,
    );
  });

  it('requires an explicit record-correction path for a human entry mistake', () => {
    const run = session();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(run, line.lineId, '2026-08-09T10:01:00.000Z');
    expect(() => setDraftActualGrams(confirmed, line.lineId, line.plannedGrams - 1)).toThrow(
      /record correction/,
    );
    const reopened = reopenProductionRecord(confirmed, line.lineId);
    const corrected = correctRecordedPhysicalGrams(reopened, line.lineId, line.plannedGrams - 1);
    expect(corrected.lines[0]).toMatchObject({
      physicalAddedGrams: line.plannedGrams - 1,
      draftActualGrams: line.plannedGrams - 1,
      recordCorrectionCount: 1,
      confirmed: false,
    });
  });

  it('freezes a final actual snapshot and never mutates the source plan', () => {
    let run = session();
    for (const [index, line] of run.lines.entries()) {
      if (index === 0) run = setDraftActualGrams(run, line.lineId, line.plannedGrams + 2);
      run = confirmProductionLine(run, line.lineId, `2026-08-09T10:0${index + 1}:00.000Z`);
    }
    const finalInput = buildFinalActualInput(run);
    const finalResult = calculateRecipe(finalInput);
    const completed = completeProductionSession(
      run,
      finalResult,
      '2026-08-09T11:00:00.000Z',
      'owner-1',
    );
    expect(completed.status).toBe('completed');
    expect(completed.completionSnapshot?.actualFinalMassG).toBeCloseTo(1002, 8);
    expect(completed.completionSnapshot?.plannedInput.target_batch_grams).toBe(1000);
    expect(completed.completionSnapshot?.finalActualInput.target_batch_grams).toBeCloseTo(1002, 8);
    expect(completed.completionSnapshot?.confirmedOrder).toHaveLength(run.lines.length);
    expect(productionProgress(run).coherent).toBe(true);
  });

  it('uses precision-preserving context steps without rounding the stored value', () => {
    expect(productionStepForGrams(4.25)).toBe(0.1);
    expect(productionStepForGrams(42.125)).toBe(0.5);
    expect(productionStepForGrams(420.125)).toBe(1);
    const run = session();
    const line = run.lines[0]!;
    expect(setDraftActualGrams(run, line.lineId, 671.123_456).lines[0]!.draftActualGrams).toBe(
      671.123_456,
    );
  });

  it('runs Base first, then actual toppings, without changing Base score or Rescue input', () => {
    const plannedInput = recipe();
    const toppingIngredient = plannedInput.items[0]!.ingredient;
    const composition: RecipeCompositionMetadata = {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: plannedInput.items.map((item) => item.id),
      toppings: [
        {
          id: 'topping-milk',
          ingredient: {
            ...toppingIngredient,
            id: 'PI-ING-TOP-MILK',
            canonical_ingredient_id: 'PI-ING-TOP-MILK',
          },
          planned_grams: 70,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 0,
        },
        {
          id: 'topping-sauce',
          ingredient: {
            ...toppingIngredient,
            id: 'PI-ING-TOP-SAUCE',
            canonical_ingredient_id: 'PI-ING-TOP-SAUCE',
          },
          planned_grams: 60,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 1,
        },
      ],
      behaviorSnapshots: productBehaviorTestSnapshots(plannedInput, [
        {
          id: 'topping-milk',
          ingredient: toppingIngredient,
          planned_grams: 60,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 0,
        },
        {
          id: 'topping-sauce',
          ingredient: {
            ...toppingIngredient,
            id: 'PI-ING-TOP-SAUCE',
            canonical_ingredient_id: 'PI-ING-TOP-SAUCE',
          },
          planned_grams: 60,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 1,
        },
      ]),
      migrationAmbiguities: [],
    };
    let run = createProductionSession({
      sessionId: 'run-toppings',
      ownerUserId: 'owner-1',
      source: {
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        recipeName: 'Base plus toppings',
      },
      plannedInput,
      plannedComposition: composition,
      startedAt: '2026-08-09T10:00:00.000Z',
    });
    const baseBefore = calculateRecipe(plannedInput);
    expect(() => confirmProductionLine(run, 'topping-milk', '2026-08-09T10:00:30.000Z')).toThrow(
      /after every Base ingredient/,
    );

    for (const [index, line] of run.lines.entries()) {
      run = confirmProductionLine(run, line.lineId, `2026-08-09T10:${index + 1}:00.000Z`);
    }
    expect(run.stage).toBe('addons');
    const baseForecast = buildProductionForecastInput(run);
    expect(baseForecast.items.map((item) => item.actual_grams ?? item.planned_grams)).toEqual(
      plannedInput.items.map((item) => item.planned_grams),
    );
    const baseAfterConfirmation = calculateRecipe(baseForecast);
    const baseScientificResult = { ...baseBefore, items: [] };
    const confirmedScientificResult = { ...baseAfterConfirmation, items: [] };
    expect(confirmedScientificResult).toEqual(baseScientificResult);

    run = setDraftActualGrams(run, 'topping-milk', 75);
    run = confirmProductionLine(run, 'topping-milk', '2026-08-09T10:20:00.000Z');
    run = confirmProductionLine(run, 'topping-sauce', '2026-08-09T10:21:00.000Z');
    expect(toppingProductionProgress(run)).toMatchObject({
      confirmedCount: 2,
      totalCount: 2,
      confirmedMassG: 135,
      forecastMassG: 135,
      coherent: true,
    });

    const finalInput = buildFinalActualInput(run);
    const completed = completeProductionSession(
      run,
      calculateRecipe(finalInput),
      '2026-08-09T11:00:00.000Z',
      'owner-1',
    );
    expect(completed.completionSnapshot?.finalResult.scores).toEqual(baseBefore.scores);
    expect(completed.completionSnapshot?.finalProduct.baseMassG).toBe(1000);
    expect(completed.completionSnapshot?.finalProduct.toppingMassG).toBe(135);
    expect(completed.completionSnapshot?.finalProduct.finalMassG).toBe(1135);
    expect(completed.completionSnapshot?.finalProduct.items).toHaveLength(
      plannedInput.items.length + 2,
    );
  });

  it('freezes a label-only commercial Topping for final nutrition without entering Engine', () => {
    const plannedInput = recipe();
    const labelIngredient: CatalogLabelToppingIngredient = {
      kind: 'catalog_label_topping',
      id: 'catalog:fruit-sauce',
      canonical_ingredient_id: 'catalog:fruit-sauce',
      private_product_id: 'catalog:fruit-sauce:version:v1',
      name: 'Fruit sauce',
      catalog_product_id: 'fruit-sauce',
      catalog_version_id: 'v1',
      verification_status: 'manual_unverified',
      label_nutrition_per_100g: {
        basis: 'per_100g',
        energyKcal: 210,
        fat: 0.5,
        saturatedFat: 0.1,
        carbohydrate: 50,
        sugars: 44,
        protein: 0.7,
        salt: 0.02,
        fibre: 2,
      },
      ingredients_text: 'Fruit, sugar',
      allergens_text: 'None declared',
      cost_per_kg: null,
      cost_currency: null,
    };
    let run = createProductionSession({
      sessionId: 'run-label-only-topping',
      ownerUserId: 'owner-1',
      source: {
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        recipeName: 'Base plus label topping',
      },
      plannedInput,
      plannedComposition: (() => {
        const toppings = [
          {
            id: 'label-topping-line',
            ingredient: labelIngredient,
            planned_grams: 80,
            actual_grams: null,
            process_scope: 'POST_PROCESS_ADDON' as const,
            addon_sort_order: 0,
          },
        ];
        return {
          schemaVersion: 1,
          baseScope: 'BASE_FORMULATION' as const,
          baseOrder: plannedInput.items.map((item) => item.id),
          toppings,
          behaviorSnapshots: productBehaviorTestSnapshots(plannedInput, toppings),
          migrationAmbiguities: [],
        };
      })(),
      startedAt: '2026-08-12T10:00:00.000Z',
    });
    for (const [index, line] of run.lines.entries()) {
      run = confirmProductionLine(run, line.lineId, `2026-08-12T10:0${index}:00.000Z`);
    }
    run = setDraftActualGrams(run, 'label-topping-line', 85);
    run = confirmProductionLine(run, 'label-topping-line', '2026-08-12T10:20:00.000Z');
    const finalInput = buildFinalActualInput(run);
    const baseResult = calculateRecipe(finalInput);
    const completed = completeProductionSession(
      run,
      baseResult,
      '2026-08-12T11:00:00.000Z',
      'owner-1',
    );

    expect(completed.completionSnapshot?.finalResult).toEqual(baseResult);
    expect(completed.completionSnapshot?.finalProduct.toppingMassG).toBe(85);
    expect(completed.completionSnapshot?.finalProduct.labelNutritionPer100g).not.toBeNull();
    expect(completed.completionSnapshot?.finalProduct.nutritionPer100g).toBeNull();
    expect(completed.completionSnapshot?.finalProduct.items.at(-1)?.ingredient).toEqual(
      labelIngredient,
    );
  });
});
