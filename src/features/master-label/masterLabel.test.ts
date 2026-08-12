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
  type IngredientAllergenEvidence,
  type MasterLabelData,
} from './masterLabel';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { MARKET_PROFILES, marketProfile } from './marketProfiles';

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
    startedAt: '2026-08-09T10:00:00.000Z',
  });
  session = { ...session, customerLabelNote: 'Best served after 5 minutes.', internalProductionNote: 'Never print me.' };
  for (const [index, line] of session.lines.entries()) {
    if (index === 0 && delta !== 0) session = setDraftActualGrams(session, line.lineId, line.plannedGrams + delta);
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

function evidence(snapshot = completedSnapshot()): Record<string, IngredientAllergenEvidence> {
  return Object.fromEntries(
    snapshot.finalProduct.items.map((item) => {
      const id = item.ingredient.canonical_ingredient_id ?? item.ingredient.id;
      return [
        id,
        {
          canonicalIngredientId: id,
          status: 'verified' as const,
          allergens: item.ingredient.name.toLowerCase().includes('milk') ? ['milk'] : [],
          mayContain: [],
          sourceRevision: 'mapper-label-review-1',
        },
      ];
    }),
  );
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
      toppings: [
        {
          id: 'sauce-topping',
          ingredient: { ...ingredient, id: 'PI-ING-SAUCE', canonical_ingredient_id: 'PI-ING-SAUCE', name: 'Sauce' },
          planned_grams: 60,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 0,
        },
        {
          id: 'milk-topping',
          ingredient: sameCanonicalAsBase
            ? { ...ingredient, name: 'Milk topping' }
            : { ...ingredient, id: 'PI-ING-TOP-MILK', canonical_ingredient_id: 'PI-ING-TOP-MILK', name: 'Milk topping' },
          planned_grams: 70,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 1,
        },
      ],
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

const build = (delta = 0) => {
  const snapshot = completedSnapshot(delta);
  return buildMasterLabelData({
    masterLabelId: 'label-1',
    snapshot,
    market: 'EU',
    uiLanguage: 'pl',
    labelLanguages: ['es', 'en'],
    facilityDefaults: { operatorName: 'Pinguino SL', address: 'Calle Uno 1, Madrid', countryCode: 'ES' },
    allergenEvidenceByCanonicalId: evidence(snapshot),
  });
};

function printable(data: MasterLabelData): MasterLabelData {
  return {
    ...data,
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
  });

  it('uses actual toppings and legal mass order independently from manual UI order', () => {
    const snapshot = completedSnapshotWithToppings();
    const data = buildMasterLabelData({
      masterLabelId: 'label-toppings',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
      allergenEvidenceByCanonicalId: evidence(snapshot),
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
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === canonicalId,
      )
      .reduce((sum, item) => sum + item.effective_grams, 0);
    const data = buildMasterLabelData({
      masterLabelId: 'label-shared-canonical',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
      allergenEvidenceByCanonicalId: evidence(snapshot),
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
    expect(buildLabelPreflight(data).items.find((item) => item.field === 'date_mark')?.status).toBe('missing');
  });

  it('never claims allergen-free when canonical evidence is missing or unreviewed', () => {
    const snapshot = completedSnapshot();
    const data = buildMasterLabelData({
      masterLabelId: 'label-gap',
      snapshot,
      market: 'EU',
      uiLanguage: 'pl',
      labelLanguages: ['pl'],
    });
    expect(data.allergens.status).toBe('incomplete');
    expect(buildLabelPreflight(data).items.find((item) => item.field === 'allergens')?.message).toMatch(/WYMAGA WERYFIKACJI/);
  });

  it('warns on required-field removal and supports explicit optional fields', () => {
    const data = build();
    expect(requestFieldRemoval(data, 'ingredients').warning).toBe('To pole jest wymagane dla wybranego rynku.');
    const withOrigin = addOptionalField(data, 'origin');
    expect(withOrigin.enabledOptionalFields).toContain('origin');
    expect(requestFieldRemoval(withOrigin, 'origin').data.enabledOptionalFields).not.toContain('origin');
  });

  it('changes required-field profile without changing the nutrition source math', () => {
    const data = build();
    const us = { ...data, market: 'US' as const, marketProfileVersion: marketProfile('US').version };
    expect(us.nutritionSource).toEqual(data.nutritionSource);
    expect(marketProfile('US').status).toBe('PARTIAL');
    expect(marketProfile('CUSTOM').status).toBe('RESEARCH_REQUIRED');
  });

  it('separates customer label note from the internal production note', () => {
    const data = build();
    expect(data.customerNote.en).toBe('Best served after 5 minutes.');
    expect(JSON.stringify(data)).not.toContain('Never print me.');
  });

  it('blocks system print while the selected regulatory market profile is only PARTIAL', () => {
    const data = printable(build());
    const preflight = buildLabelPreflight(data);
    expect(preflight.readyForSystemPrint).toBe(false);
    expect(preflight.regulatoryProfileVerified).toBe(false);
    expect(() => buildMasterLabelPrintHtml(data)).toThrow('Master Label preflight is incomplete.');
  });

  it('prints N safe copies only after the market profile itself is VERIFIED', () => {
    const profile = MARKET_PROFILES.EU as { status: 'VERIFIED' | 'PARTIAL' | 'RESEARCH_REQUIRED' };
    const previousStatus = profile.status;
    profile.status = 'VERIFIED';
    try {
      const data = printable(build());
      const preflight = buildLabelPreflight(data);
      expect(preflight.readyForSystemPrint).toBe(true);
      expect(preflight.regulatoryProfileVerified).toBe(true);
      const html = buildMasterLabelPrintHtml(data);
      expect(html.match(/<article class="label">/g)).toHaveLength(3);
      expect(html).not.toContain('Koszt');
      expect(html).not.toContain('Never print me.');
    } finally {
      profile.status = previousStatus;
    }
  });
});
