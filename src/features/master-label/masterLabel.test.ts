import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  completeProductionSession,
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from '@/features/production-workspace/productionSession';
import {
  addOptionalField,
  buildLabelPreflight,
  buildMasterLabelData,
  requestFieldRemoval,
  type MasterLabelData,
} from './masterLabel';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { MARKET_PROFILES, marketProfile } from './marketProfiles';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';

function behaviorSnapshots(
  input: RecipeInput,
  toppings: readonly RecipeToppingItem[] = [],
): Record<string, ProductBehaviorSnapshot> {
  const snapshots = productBehaviorTestSnapshots(input, toppings);
  for (const [lineId, snapshot] of Object.entries(snapshots)) {
    const item =
      input.items.find((candidate) => candidate.id === lineId) ??
      toppings.find((candidate) => candidate.id === lineId);
    const containsMilk =
      item?.ingredient.name.toLowerCase().includes('milk') ||
      item?.ingredient.name.toLowerCase().includes('cream');
    if (snapshot.sharedFacts?.allergens) {
      snapshot.sharedFacts.allergens.declared = containsMilk ? ['milk'] : [];
    }
  }
  return snapshots;
}

function completedSnapshot(delta = 0) {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: 'classic',
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  let session = createProductionSession({
    sessionId: 'run-label',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Gelato mleczne',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: behaviorSnapshots(input),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-09T10:00:00.000Z',
  });
  session = {
    ...session,
    customerLabelNote: 'Best served after 5 minutes.',
    internalProductionNote: 'Never print me.',
  };
  for (const [index, line] of session.lines.entries()) {
    if (index === 0 && delta !== 0)
      session = setDraftActualGrams(session, line.lineId, line.plannedGrams + delta);
    session = confirmProductionLine(session, line.lineId, `2026-08-09T10:0${index}:00.000Z`);
  }
  const finalInput: RecipeInput = {
    ...input,
    target_batch_grams: 1000 + delta,
    items: input.items.map((item, index) => ({
      ...item,
      actual_grams: item.planned_grams + (index === 0 ? delta : 0),
      lock_type: 'already_added',
    })),
  };
  return completeProductionSession(
    session,
    calculateRecipe(finalInput),
    '2026-08-09T11:00:00.000Z',
    'owner',
  ).completionSnapshot!;
}

function completedSnapshotWithToppings(sameCanonicalAsBase = false) {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: 'classic',
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  const ingredient = input.items[0]!.ingredient;
  const toppings: RecipeToppingItem[] = [
    {
      id: 'sauce-topping',
      ingredient: {
        ...ingredient,
        id: 'PI-ING-SAUCE',
        canonical_ingredient_id: 'PI-ING-SAUCE',
        name: 'Sauce',
      },
      planned_grams: 60,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 0,
    },
    {
      id: 'milk-topping',
      ingredient: sameCanonicalAsBase
        ? { ...ingredient, name: 'Milk topping' }
        : {
            ...ingredient,
            id: 'PI-ING-TOP-MILK',
            canonical_ingredient_id: 'PI-ING-TOP-MILK',
            name: 'Milk topping',
          },
      planned_grams: 70,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 1,
    },
  ];
  let session = createProductionSession({
    sessionId: 'run-label-toppings',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Gelato z toppingami',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: [...input.items.map((item) => item.id)].reverse(),
      toppings,
      behaviorSnapshots: behaviorSnapshots(input, toppings),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-09T10:00:00.000Z',
  });
  for (const [index, line] of session.lines.entries()) {
    session = confirmProductionLine(session, line.lineId, `2026-08-09T10:0${index}:00.000Z`);
  }
  session = setDraftActualGrams(session, 'milk-topping', 75);
  session = confirmProductionLine(session, 'milk-topping', '2026-08-09T10:20:00.000Z');
  session = confirmProductionLine(session, 'sauce-topping', '2026-08-09T10:21:00.000Z');
  return completeProductionSession(
    session,
    calculateRecipe({
      ...input,
      items: input.items.map((item) => ({
        ...item,
        actual_grams: item.planned_grams,
        lock_type: 'already_added' as const,
      })),
    }),
    '2026-08-09T11:00:00.000Z',
    'owner',
  ).completionSnapshot!;
}

function completedSnapshotWithLabelTopping() {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: 'classic',
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  const ingredient: CatalogLabelToppingIngredient = {
    kind: 'catalog_label_topping',
    id: 'catalog:fruit-sauce',
    canonical_ingredient_id: 'catalog:fruit-sauce',
    private_product_id: 'catalog:fruit-sauce:version:v1',
    name: 'Fruit sauce',
    catalog_product_id: 'fruit-sauce',
    catalog_version_id: 'v1',
    verification_status: 'verified',
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
  const toppings: RecipeToppingItem[] = [
    {
      id: 'label-topping-line',
      ingredient,
      planned_grams: 80,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 0,
    },
  ];
  let session = createProductionSession({
    sessionId: 'run-label-catalog-topping',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Gelato z sosem',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings,
      behaviorSnapshots: behaviorSnapshots(input, toppings),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-12T10:00:00.000Z',
  });
  for (const [index, line] of session.lines.entries()) {
    session = confirmProductionLine(session, line.lineId, `2026-08-12T10:0${index}:00.000Z`);
  }
  session = confirmProductionLine(session, 'label-topping-line', '2026-08-12T10:20:00.000Z');
  return completeProductionSession(
    session,
    calculateRecipe({
      ...input,
      items: input.items.map((item) => ({
        ...item,
        actual_grams: item.planned_grams,
        lock_type: 'already_added' as const,
      })),
    }),
    '2026-08-12T11:00:00.000Z',
    'owner',
  ).completionSnapshot!;
}

const build = (delta = 0) => {
  const snapshot = completedSnapshot(delta);
  return buildMasterLabelData({
    masterLabelId: 'label-1',
    snapshot,
    market: 'EU',
    uiLanguage: 'pl',
    labelLanguages: ['es', 'en'],
    facilityDefaults: {
      operatorName: 'Pinguino SL',
      address: 'Calle Uno 1, Madrid',
      countryCode: 'ES',
    },
  });
};

function printable(data: MasterLabelData): MasterLabelData {
  return {
    ...data,
    nutritionSource: data.nutritionSource
      ? { ...data.nutritionSource, saturated_fat_g: 0, sugars_g: 0 }
      : data.nutritionSource,
    legalProductName: { es: 'Helado de leche', en: 'Milk gelato' },
    allergens: { ...data.allergens, reviewedByUser: true },
    netQuantityG: 500,
    productionDateReviewed: true,
    dateMark: {
      kind: 'best_before',
      date: '2026-09-01',
      basis: 'manual',
      reviewedByUser: true,
    },
    storageInstructions: { es: 'Conservar congelado.', en: 'Keep frozen.' },
    lotCode: 'LOT-20260809-01',
    copies: 3,
    printer: { ...data.printer, copies: 3 },
    regulatoryReview: {
      translations: true,
      ingredientOrderAndQuid: true,
      marketSpecific: true,
    },
    preflightAcknowledged: true,
  };
}

describe('Master Label — one actual-batch source model', () => {
  it('derives ingredients and Nutrition from final actual production, not the plan', () => {
    const planned = build(0);
    const actual = build(20);
    expect(actual.ingredients[0]!.actualGrams).toBe(planned.ingredients[0]!.actualGrams + 20);
    expect(actual.ingredients[0]!.percent).not.toBe(planned.ingredients[0]!.percent);
    expect(actual.nutritionSource).not.toEqual(planned.nutritionSource);
    expect(actual.sourceCompletionSessionId).toBe('run-label');
    expect(planned.netQuantityG).toBe(1000);
    expect(actual.netQuantityG).toBe(1020);
  });

  it('uses actual toppings and legal mass order independently from manual UI order', () => {
    const snapshot = completedSnapshotWithToppings();
    const data = buildMasterLabelData({
      masterLabelId: 'label-toppings',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
    expect(snapshot.finalProduct.finalMassG).toBe(1135);
    expect(data.ingredients.find((item) => item.lineId === 'milk-topping')?.actualGrams).toBe(75);
    expect(data.ingredients.find((item) => item.lineId === 'sauce-topping')?.actualGrams).toBe(60);
    expect(data.ingredients.reduce((sum, item) => sum + item.actualGrams, 0)).toBe(1135);
    expect(data.ingredients.map((item) => item.actualGrams)).toEqual(
      [...data.ingredients.map((item) => item.actualGrams)].sort((a, b) => b - a),
    );
  });

  it('aggregates the same canonical product from Base and Toppings into one legal declaration', () => {
    const snapshot = completedSnapshotWithToppings(true);
    const canonicalId =
      snapshot.finalProduct.items[0]!.ingredient.canonical_ingredient_id ??
      snapshot.finalProduct.items[0]!.ingredient.id;
    const factualMass = snapshot.finalProduct.items
      .filter(
        (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === canonicalId,
      )
      .reduce((sum, item) => sum + item.effective_grams, 0);
    const data = buildMasterLabelData({
      masterLabelId: 'label-shared-canonical',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
    const declarations = data.ingredients.filter(
      (item) => item.canonicalIngredientId === canonicalId,
    );
    expect(declarations).toHaveLength(1);
    expect(declarations[0]!.actualGrams).toBe(factualMass);
    expect(data.ingredients.reduce((sum, item) => sum + item.actualGrams, 0)).toBe(
      snapshot.finalProduct.finalMassG,
    );
  });

  it('uses label-only commercial Topping nutrition in the final label without Engine science', () => {
    const snapshot = completedSnapshotWithLabelTopping();
    const data = buildMasterLabelData({
      masterLabelId: 'label-catalog-topping',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });

    expect(snapshot.finalProduct.nutritionPer100g).toBeNull();
    expect(snapshot.finalProduct.labelNutritionPer100g).not.toBeNull();
    expect(data.nutritionSource).toEqual(snapshot.finalProduct.labelNutritionPer100g);
    expect(data.nutritionSource?.alcohol_g).toBeNull();
    expect(data.ingredients).toContainEqual(
      expect.objectContaining({
        canonicalIngredientId: 'catalog:fruit-sauce',
        actualGrams: 80,
        sourceIngredientsText: 'Fruit, sugar',
        sourceAllergensText: 'None declared',
      }),
    );
    expect(
      data.ingredients.find((item) => item.canonicalIngredientId === 'catalog:fruit-sauce')?.names
        .pl,
    ).toContain('Fruit, sugar');
    expect(data.allergens.labelStatements).not.toContain('None declared');
    expect(JSON.stringify(data.allergens)).not.toContain('none_declared');
  });

  it('never falls back to mutable Topping label text after frozen authority is captured', () => {
    const snapshot = completedSnapshotWithLabelTopping();
    const frozen = snapshot.productComposition.behaviorSnapshots!['label-topping-line']!;
    snapshot.productComposition.behaviorSnapshots!['label-topping-line'] = {
      ...frozen,
      sharedFacts: frozen.sharedFacts
        ? {
            ...frozen.sharedFacts,
            allergens: frozen.sharedFacts.allergens
              ? {
                  ...frozen.sharedFacts.allergens,
                  ingredientsText: null,
                  allergensText: null,
                }
              : null,
          }
        : null,
    };

    const data = buildMasterLabelData({
      masterLabelId: 'label-frozen-only',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
    const topping = data.ingredients.find(
      (item) => item.canonicalIngredientId === 'catalog:fruit-sauce',
    );
    expect(topping?.sourceIngredientsText).toBeNull();
    expect(topping?.sourceAllergensText).toBeNull();
    expect(topping?.names.pl).toBe('Fruit sauce');
    expect(data.allergens.labelStatements).toEqual([]);
  });

  it('keeps UI language, market and label languages independent', () => {
    const data = build();
    expect(data.uiLanguage).toBe('pl');
    expect(data.market).toBe('EU');
    expect(data.labelLanguages).toEqual(['es', 'en']);
    expect(Object.keys(data.productName)).toEqual(['es', 'en']);
  });

  it('prefills production date but never fabricates best-before/use-by', () => {
    const data = build();
    expect(data.productionDate).toBe('2026-08-09');
    expect(data.productionDateReviewed).toBe(false);
    expect(data.dateMark).toEqual({
      kind: 'unresolved',
      date: null,
      basis: 'none',
      reviewedByUser: false,
    });
    expect(buildLabelPreflight(data).items.find((item) => item.field === 'date_mark')?.status).toBe(
      'missing',
    );
  });

  it('keeps one automatic LOT stable for the completed run and legacy reloads', () => {
    const snapshot = completedSnapshot();
    expect(snapshot.lotCode).toMatch(/^LOT-20260809-/);
    const first = buildMasterLabelData({
      masterLabelId: 'lot-first',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
    const reloaded = buildMasterLabelData({
      masterLabelId: 'lot-reloaded',
      snapshot: { ...snapshot, lotCode: undefined },
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
    expect(first.lotCode).toBe(snapshot.lotCode);
    expect(reloaded.lotCode).toBe(first.lotCode);
    expect(first.lotCode).not.toBe('LOT —');
  });

  it('blocks label construction when frozen canonical allergen evidence is missing', () => {
    const snapshot = completedSnapshot();
    const firstId = snapshot.finalActualInput.items[0]!.id;
    const current = snapshot.productComposition.behaviorSnapshots![firstId]!;
    snapshot.productComposition.behaviorSnapshots![firstId] = {
      ...current,
      sharedFacts: current.sharedFacts ? { ...current.sharedFacts, allergens: null } : null,
    };
    expect(() =>
      buildMasterLabelData({
        masterLabelId: 'label-gap',
        snapshot,
        market: 'EU',
        uiLanguage: 'pl',
        labelLanguages: ['pl'],
      }),
    ).toThrow(`master_label_behavior_authority_required:${firstId}`);
  });

  it('warns on required-field removal and supports explicit optional fields', () => {
    const data = build();
    expect(requestFieldRemoval(data, 'ingredients').warning).toBe(
      'To pole jest wymagane dla wybranego rynku.',
    );
    const withOrigin = addOptionalField(data, 'origin');
    expect(withOrigin.enabledOptionalFields).toContain('origin');
    expect(requestFieldRemoval(withOrigin, 'origin').data.enabledOptionalFields).not.toContain(
      'origin',
    );
  });

  it('changes required-field profile without changing the nutrition source math', () => {
    const data = build();
    const us = {
      ...data,
      market: 'US' as const,
      marketProfileVersion: marketProfile('US').version,
    };
    expect(us.nutritionSource).toEqual(data.nutritionSource);
    expect(marketProfile('US').status).toBe('RESEARCH_REQUIRED');
    expect(marketProfile('US').selectable).toBe(false);
    expect(marketProfile('CA').status).toBe('RESEARCH_REQUIRED');
    expect(marketProfile('CA').selectable).toBe(false);
    expect(marketProfile('CUSTOM').status).toBe('RESEARCH_REQUIRED');
    expect(marketProfile('EU').consumerLayout).toBe('eu_declaration');
    expect(marketProfile('US').consumerLayout).toBe('us_nutrition_facts');
    expect(marketProfile('US').flag).toBe('🇺🇸');
    expect(marketProfile('UK')).toMatchObject({
      code: 'UK',
      flag: '🇬🇧',
      consumerLayout: 'uk_declaration',
    });
    expect(Object.keys(MARKET_PROFILES)).toEqual(['EU', 'US', 'CA', 'UK', 'AU_NZ', 'CUSTOM']);
  });

  it('separates customer label note from the internal production note', () => {
    const data = build();
    expect(data.customerNote.en).toBe('Best served after 5 minutes.');
    expect(JSON.stringify(data)).not.toContain('Never print me.');
  });

  it('blocks system print for a research/unavailable market before final output', () => {
    const base = printable(build());
    const data: MasterLabelData = {
      ...base,
      market: 'CA',
      marketProfileVersion: marketProfile('CA').version,
      labelLanguages: ['en', 'fr'],
    };
    const preflight = buildLabelPreflight(data);
    expect(preflight.readyForSystemPrint).toBe(false);
    expect(preflight.regulatoryProfileVerified).toBe(false);
    expect(() => buildMasterLabelPrintHtml(data)).toThrow('Master Label preflight is incomplete.');
  });

  it('prints N safe copies only when the verified market preflight is complete', () => {
    const data = printable(build());
    const preflight = buildLabelPreflight(data);
    expect(preflight.readyForSystemPrint).toBe(true);
    expect(preflight.regulatoryProfileVerified).toBe(true);
    const branded = {
      ...data,
      businessName: 'Gellatti Lab',
      logoPath: 'owner/logo.png',
      enabledOptionalFields: [...data.enabledOptionalFields, 'logo' as const],
    };
    const html = buildMasterLabelPrintHtml(branded, 'https://example.test/private-logo.png');
    expect(html.match(/<article class="label"/g)).toHaveLength(3);
    expect(html).toContain('Gellatti Lab');
    expect(html).toContain('https://example.test/private-logo.png');
    expect(html).not.toContain('Koszt');
    expect(html).not.toContain('Never print me.');
    expect(html).not.toContain('Cała partia');
    expect(html).not.toContain('Baza techniczna');
  });
});
