import { describe, expect, it } from 'vitest';
import {
  assessRescueTargetEvidenceSufficiency,
  rescueSugarSpectrumFromCohort,
  type MapperKnowledgeRow,
} from './mapperValueInference';
import {
  applyFieldTruth,
  emptyFieldTruthMap,
  knownField,
  type ProductFieldTruthMap,
  type WorkingNumericField,
} from './productFieldTruth';
import { classifyProductSemantics } from './productRecognition';

const targetEvidence = {
  exactProductIdentity: true,
  ingredientOrCompositionIdentity: true,
} as const;

const fruitSemantic = {
  ...classifyProductSemantics({
    name: 'Generic fruit puree',
    brand: null,
    manufacturer: null,
    manufacturerCode: null,
    gtin: null,
    productType: 'fruit puree',
    category: 'fruit',
    subcategory: 'puree',
    variant: null,
    ingredients: 'fruit',
    nutrition: null,
    description: 'fruit puree',
    dosage: null,
    technicalParameters: null,
    sourceUrls: [],
  }),
  productArchetype: 'NORMAL_INGREDIENT' as const,
  ingredientFamily: 'fruit' as const,
  physicalForm: 'LIQUID' as const,
  intendedUsageRole: 'BASE_ONLY' as const,
  compatibleMapperCategories: ['fruit'],
  forbiddenMapperCategories: [],
  modelRequired: false,
};

const hardFields = (values: Partial<Record<WorkingNumericField, number>>): ProductFieldTruthMap => {
  let fields = emptyFieldTruthMap();
  for (const [field, value] of Object.entries(values)) {
    fields = applyFieldTruth(
      fields,
      field as WorkingNumericField,
      knownField({
        value,
        state: 'VERIFIED',
        confidence: 0.95,
        basis: 'product_declared',
      }),
    );
  }
  return fields;
};

type Shares = Partial<
  Record<
    | 'sucrose_percent'
    | 'dextrose_percent'
    | 'glucose_percent'
    | 'fructose_percent'
    | 'lactose_percent',
    number
  >
>;

const spectrumRow = (
  id: string,
  shares: Shares,
  totalSugars = 10,
  overrides: Partial<MapperKnowledgeRow> = {},
): MapperKnowledgeRow => ({
  ingredient_id: id,
  ingredient_name_internal: `generic fruit puree ${id}`,
  ingredient_name_display: `Generic fruit puree ${id}`,
  ingredient_category: 'fruit',
  ingredient_subcategory: 'puree',
  is_active: true,
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Estimated / PI Calculated',
  water_percent: 80,
  total_solids_percent: 20,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 20,
  total_sugars_percent: totalSugars,
  sucrose_percent: totalSugars * (shares.sucrose_percent ?? 0),
  dextrose_percent: totalSugars * (shares.dextrose_percent ?? 0),
  glucose_percent: totalSugars * (shares.glucose_percent ?? 0),
  fructose_percent: totalSugars * (shares.fructose_percent ?? 0),
  lactose_percent: totalSugars * (shares.lactose_percent ?? 0),
  polyol_percent: 0,
  fiber_percent: 2,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 80,
  pod_value: null,
  pac_value: null,
  sweetness_factor: null,
  freezing_factor: null,
  ...overrides,
});

const targetFields = (overrides: Partial<Record<WorkingNumericField, number>> = {}) =>
  hardFields({
    carbohydrate_percent: 20,
    total_sugars_percent: 10,
    fiber_percent: 2,
    ...overrides,
  });

describe('target-aware normalized sugar-spectrum Rescue', () => {
  it('SSR-POS-01 reconstructs a coherent non-dairy mixed spectrum from target-normalized shares', () => {
    const cohort = ['001', '002', '003', '004'].map((id) =>
      spectrumRow(`PI-ING-99${id}`, {
        sucrose_percent: 0.25,
        glucose_percent: 0.25,
        fructose_percent: 0.5,
      }),
    );
    const result = rescueSugarSpectrumFromCohort({
      cohort,
      fields: targetFields({ total_sugars_percent: 8 }),
      semantic: fruitSemantic,
      targetEvidence,
    });

    expect(result).toMatchObject({
      resolved: true,
      confidence: 0.9,
      compatibleCandidateCount: 4,
      validSpectrumCandidateCount: 4,
      consensusShares: {
        sucrose_percent: 0.25,
        dextrose_percent: 0,
        glucose_percent: 0.25,
        fructose_percent: 0.5,
        lactose_percent: 0,
      },
      targetSpectrum: {
        sucrose_percent: 2,
        dextrose_percent: 0,
        glucose_percent: 2,
        fructose_percent: 4,
        lactose_percent: 0,
      },
    });
  });

  it('SSR-NEG-01 fails closed for a materially mixed normalized spectrum', () => {
    const cohort = [
      spectrumRow('PI-ING-990101', { sucrose_percent: 1 }),
      spectrumRow('PI-ING-990102', { sucrose_percent: 1 }),
      spectrumRow('PI-ING-990103', { fructose_percent: 1 }),
      spectrumRow('PI-ING-990104', { fructose_percent: 1 }),
    ];
    const result = rescueSugarSpectrumFromCohort({
      cohort,
      fields: targetFields(),
      semantic: fruitSemantic,
      targetEvidence,
    });

    expect(result.resolved).toBe(false);
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.reasonCodes).toEqual(['RESCUE_CONFIDENCE_BELOW_THRESHOLD']);
  });

  it('SSR-NEG-02 requires a hard target total and never manufactures total sugars with its spectrum', () => {
    const fields = hardFields({ carbohydrate_percent: 20, fiber_percent: 2 });
    const cohort = ['201', '202', '203'].map((id) =>
      spectrumRow(`PI-ING-99${id}`, { fructose_percent: 1 }),
    );
    const result = rescueSugarSpectrumFromCohort({
      cohort,
      fields,
      semantic: fruitSemantic,
      targetEvidence,
    });

    expect(result).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_TARGET_HARD_TOTAL_SUGARS_REQUIRED'],
    });
    expect(fields.total_sugars_percent.value).toBeNull();
  });

  it('SSR-NEG-03 excludes a donor whose named spectrum does not close to its total sugars', () => {
    const cohort = [
      spectrumRow('PI-ING-990301', { glucose_percent: 1 }),
      spectrumRow('PI-ING-990302', { glucose_percent: 1 }),
      spectrumRow('PI-ING-990303', { glucose_percent: 1 }),
      spectrumRow('PI-ING-990304', { glucose_percent: 1 }),
      spectrumRow('PI-ING-990305', { glucose_percent: 0.2 }),
    ];
    const result = rescueSugarSpectrumFromCohort({
      cohort,
      fields: targetFields(),
      semantic: fruitSemantic,
      targetEvidence,
    });

    expect(result.resolved).toBe(true);
    expect(result.validSpectrumCandidateCount).toBe(4);
    expect(result.rejectedCandidates).toContainEqual({
      ingredientId: 'PI-ING-990305',
      reasonCodes: ['RESCUE_SPECTRUM_DONOR_CLOSURE_INVALID'],
    });
  });

  it('SSR-NEG-04 refuses a cohort split that conflicts with a verified target species', () => {
    const fields = targetFields({ sucrose_percent: 6 });
    const cohort = ['401', '402', '403'].map((id) =>
      spectrumRow(`PI-ING-99${id}`, { sucrose_percent: 0.4, glucose_percent: 0.6 }),
    );
    const result = rescueSugarSpectrumFromCohort({
      cohort,
      fields,
      semantic: fruitSemantic,
      targetEvidence,
    });

    expect(result).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_HARD_TARGET_SPECIES_CONFLICT'],
    });
    expect(fields.sucrose_percent).toMatchObject({
      value: 6,
      provenance: { state: 'VERIFIED' },
    });
  });

  it('SSR-SAFE-01 extends target evidence sufficiency only to spectrum fields with hard total sugars', () => {
    const cohort = ['501', '502', '503'].map((id) =>
      spectrumRow(`PI-ING-99${id}`, { fructose_percent: 1 }),
    );
    const accepted = assessRescueTargetEvidenceSufficiency({
      field: 'fructose_percent',
      fields: targetFields(),
      semantic: fruitSemantic,
      identityEvidence: targetEvidence,
      cohort,
    });
    const refused = assessRescueTargetEvidenceSufficiency({
      field: 'fructose_percent',
      fields: hardFields({ carbohydrate_percent: 20, fiber_percent: 2 }),
      semantic: fruitSemantic,
      identityEvidence: targetEvidence,
      cohort,
    });

    expect(accepted).toMatchObject({ sufficient: true, compositionModel: 'OPEN' });
    expect(refused).toMatchObject({
      sufficient: false,
      reasonCodes: ['RESCUE_TARGET_HARD_TOTAL_SUGARS_REQUIRED'],
    });
  });
});
