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
import { marketProfile } from './marketProfiles';

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
    snapshot.finalResult.items.map((item) => {
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

  it('prints N copies through one safe HTML model and excludes internal costs/notes', () => {
    const data = printable(build());
    const preflight = buildLabelPreflight(data);
    expect(preflight.readyForSystemPrint).toBe(true);
    expect(preflight.regulatoryProfileVerified).toBe(false);
    const html = buildMasterLabelPrintHtml(data);
    expect(html.match(/<article class="label">/g)).toHaveLength(3);
    expect(html).not.toContain('Koszt');
    expect(html).not.toContain('Never print me.');
  });
});
