import { describe, expect, it } from 'vitest';
import {
  PRODUCT_PRODUCTION_ACCURACY_WEIGHTS,
  assessProductProductionAccuracy,
  type ProductProductionAccuracyInput,
  type ProductionAccuracyFieldTruth,
} from './productProductionAccuracy';
import { classifyProductSemantics } from './productRecognition';
import type { WorkingNumericField } from './productFieldTruth';

const recognition = {
  ...classifyProductSemantics({
    name: 'Mleko pełne',
    brand: null,
    manufacturer: null,
    manufacturerCode: null,
    gtin: null,
    productType: 'food ingredient',
    category: 'dairy',
    subcategory: 'milk',
    variant: null,
    ingredients: 'Mleko',
    nutrition: 'fat:3.5 | carbohydrate:4.8 | sugars:4.8 | protein:3.3 | salt:0.1',
    description: 'Mleko do produkcji lodów.',
    dosage: null,
    technicalParameters: null,
    sourceUrls: [],
  }),
  classificationSource: 'DETERMINISTIC' as const,
  productArchetype: 'NORMAL_INGREDIENT' as const,
  ingredientFamily: 'dairy_liquid' as const,
  physicalForm: 'LIQUID' as const,
  intendedUsageRole: 'BASE_ONLY' as const,
  modelRequired: false,
  modelReasonCodes: [],
};

const truth = (
  value: number,
  state: ProductionAccuracyFieldTruth['state'] = 'VERIFIED',
  basis: ProductionAccuracyFieldTruth['basis'] = 'product_declared',
): ProductionAccuracyFieldTruth => ({ value, state, basis });

const completeFieldTruth = (): Partial<
  Record<WorkingNumericField, ProductionAccuracyFieldTruth>
> => ({
  water_percent: truth(87),
  total_solids_percent: truth(13, 'VERIFIED', 'derived'),
  fat_percent: truth(3.5),
  protein_percent: truth(3.3),
  carbohydrate_percent: truth(4.8),
  total_sugars_percent: truth(4.8),
  sucrose_percent: truth(0),
  dextrose_percent: truth(0),
  glucose_percent: truth(0),
  fructose_percent: truth(0),
  lactose_percent: truth(4.8),
  polyol_percent: truth(0),
  fiber_percent: truth(0),
  salt_percent: truth(0.1),
  alcohol_percent: truth(0),
  kcal_per_100g: truth(62),
  pod_value: truth(16, 'VERIFIED', 'derived'),
  pac_value: truth(10, 'VERIFIED', 'derived'),
});

const baseInput = (
  overrides: Partial<ProductProductionAccuracyInput> = {},
): ProductProductionAccuracyInput => ({
  evidence: {
    kind: 'normal_food',
    fields: {
      identity: 'label',
      ingredients: 'label',
      energyKcal: 'label',
      fat: 'label',
      carbohydrate: 'label',
      protein: 'label',
      salt: 'label',
      netQuantity: 'label',
    },
    validatedBarcode: false,
    exactCanonicalMatch: false,
    mapperFamilyMatch: true,
    materialConflicts: [],
  },
  fieldTruth: completeFieldTruth(),
  mapperWholeProfileSimilarity: 0.9,
  recognition,
  engineUsable: true,
  criticalPhysicsBlockers: [],
  sweetnessPath: { kind: 'stored', resolved: true, reason: 'POD/PAC zapisane' },
  behavior: {
    classificationOutcome: 'classified',
    baseRecipeEligible: true,
    toppingEligible: false,
    intendedUsageRole: 'BASE_ONLY',
    dosageInterpretation: recognition.dosage,
    classificationReasonCodes: [],
  },
  ...overrides,
});

describe('one production-oriented Product Accuracy authority', () => {
  it('owns exactly the requested 100-point component budget', () => {
    expect(PRODUCT_PRODUCTION_ACCURACY_WEIGHTS).toEqual({
      recognition: 7,
      nutrition: 45,
      enginePhysics: 25,
      ingredientsEvidence: 10,
      productBehavior: 8,
      ean: 2,
      manufacturer: 1,
      country: 1,
      package: 1,
    });
    expect(Object.values(PRODUCT_PRODUCTION_ACCURACY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('does not let minor metadata or allergen status block a complete ordinary formulation', () => {
    const withoutMetadataOrAllergens = assessProductProductionAccuracy(baseInput());
    const withAllergens = assessProductProductionAccuracy(
      baseInput({
        evidence: {
          ...baseInput().evidence,
          fields: { ...baseInput().evidence.fields, allergens: 'label' },
        },
      }),
    );

    expect(withoutMetadataOrAllergens.productAccuracy).toBeGreaterThanOrEqual(85);
    expect(withoutMetadataOrAllergens.criticalCapApplied).toBe(false);
    expect(withAllergens.productAccuracy).toBe(withoutMetadataOrAllergens.productAccuracy);
  });

  it('charges at most 2/1/1/1 for EAN, manufacturer, country and package', () => {
    const all = baseInput();
    all.evidence = {
      ...all.evidence,
      validatedBarcode: true,
      fields: {
        ...all.evidence.fields,
        barcode: 'barcode_registry',
        manufacturer: 'manufacturer',
        countryOfOrigin: 'label',
        netQuantity: 'label',
      },
    };
    const full = assessProductProductionAccuracy(all);
    const missing = (field: 'barcode' | 'manufacturer' | 'countryOfOrigin' | 'netQuantity') => {
      const input = baseInput({ evidence: structuredClone(all.evidence) });
      delete input.evidence.fields[field];
      if (field === 'barcode') input.evidence.validatedBarcode = false;
      return assessProductProductionAccuracy(input);
    };

    expect(full.productAccuracy - missing('barcode').productAccuracy).toBe(2);
    expect(full.productAccuracy - missing('manufacturer').productAccuracy).toBe(1);
    expect(full.productAccuracy - missing('countryOfOrigin').productAccuracy).toBe(1);
    expect(full.productAccuracy - missing('netQuantity').productAccuracy).toBe(1);
  });

  it('credits a compatible Mapper-estimated technical field at exactly 80%', () => {
    const verified = assessProductProductionAccuracy(baseInput());
    const estimatedFields = completeFieldTruth();
    estimatedFields.fat_percent = truth(3.5, 'ESTIMATED', 'mapper_similar_profile');
    const estimated = assessProductProductionAccuracy(baseInput({ fieldTruth: estimatedFields }));
    const fatAvailable = verified.fields.fat_percent?.availablePoints ?? 0;

    expect(estimated.fields.fat_percent).toMatchObject({ creditFactor: 0.8 });
    expect(verified.rawProductAccuracy - estimated.rawProductAccuracy).toBeCloseTo(
      fatAvailable * 0.2,
      5,
    );
  });

  it('awards no estimate credit below the unchanged 0.85 whole-profile floor', () => {
    const fields = completeFieldTruth();
    fields.fat_percent = truth(3.5, 'ESTIMATED', 'mapper_similar_profile');
    const result = assessProductProductionAccuracy(
      baseInput({ fieldTruth: fields, mapperWholeProfileSimilarity: 0.8499 }),
    );
    expect(result.fields.fat_percent).toMatchObject({ creditFactor: 0 });
  });

  it('also gates Mapper-family evidence credit on the same whole-profile floor', () => {
    const evidence = structuredClone(baseInput().evidence);
    evidence.fields.ingredients = 'mapper_family';

    const belowFloor = assessProductProductionAccuracy(
      baseInput({ evidence, mapperWholeProfileSimilarity: 0.8499 }),
    );
    const atFloor = assessProductProductionAccuracy(
      baseInput({ evidence, mapperWholeProfileSimilarity: 0.85 }),
    );

    expect(belowFloor.fields.ingredients).toMatchObject({ creditFactor: 0 });
    expect(atFloor.fields.ingredients).toMatchObject({ creditFactor: 0.8 });
  });

  it('caps high raw accuracy at 84 when sugar physics remains unresolved', () => {
    const richEvidence = structuredClone(baseInput().evidence);
    richEvidence.validatedBarcode = true;
    Object.assign(richEvidence.fields, {
      barcode: 'barcode_registry',
      manufacturer: 'manufacturer',
      countryOfOrigin: 'label',
    });
    const result = assessProductProductionAccuracy(
      baseInput({
        evidence: richEvidence,
        engineUsable: false,
        criticalPhysicsBlockers: ['UNRESOLVED_SWEETENING_FREEZING_PATH'],
        sweetnessPath: {
          kind: 'unresolved',
          resolved: false,
          reason: 'widmo cukrów nie pokrywa cukrów ogółem',
        },
        behavior: {
          ...baseInput().behavior,
          classificationOutcome: 'unknown_requires_review',
          baseRecipeEligible: false,
          classificationReasonCodes: ['UNRESOLVED_SWEETENING_FREEZING_PATH'],
        },
      }),
    );

    expect(result.rawProductAccuracy).toBeGreaterThan(85);
    expect(result.criticalBlockers).toContain('UNRESOLVED_SWEETENING_FREEZING_PATH');
    expect(result.productAccuracy).toBe(84);
    expect(result.criticalCapApplied).toBe(true);
  });

  it('caps missing canonical water/solids without inventing either value', () => {
    const fields = completeFieldTruth();
    delete fields.water_percent;
    delete fields.total_solids_percent;
    const result = assessProductProductionAccuracy(
      baseInput({
        fieldTruth: fields,
        engineUsable: false,
        criticalPhysicsBlockers: ['MISSING_WATER_PERCENT'],
      }),
    );

    expect(result.productAccuracy).toBeLessThanOrEqual(84);
    expect(result.criticalBlockers).toContain('MISSING_WATER_PERCENT');
  });

  it('caps a technical/dosage-dependent product without required authority', () => {
    const technicalRecognition = {
      ...recognition,
      isTechnicalProduct: true,
      isDosageDependent: true,
      intendedUsageRole: 'BASE_ONLY' as const,
      dosage: { ...recognition.dosage, semantics: 'UNKNOWN' as const, evidence: null },
    };
    const result = assessProductProductionAccuracy(
      baseInput({
        recognition: technicalRecognition,
        behavior: {
          classificationOutcome: 'blocked',
          baseRecipeEligible: false,
          toppingEligible: false,
          intendedUsageRole: 'BASE_ONLY',
          dosageInterpretation: technicalRecognition.dosage,
          classificationReasonCodes: ['technical_or_dosage_product'],
        },
      }),
    );

    expect(result.productAccuracy).toBeLessThanOrEqual(84);
    expect(result.criticalBlockers).toContain('TECHNICAL_DOSAGE_AUTHORITY_REQUIRED');
  });

  it('accepts TOPPING_ONLY against topping requirements without claiming base readiness', () => {
    const toppingRecognition = {
      ...recognition,
      intendedUsageRole: 'TOPPING_ONLY' as const,
    };
    const result = assessProductProductionAccuracy(
      baseInput({
        recognition: toppingRecognition,
        engineUsable: false,
        criticalPhysicsBlockers: ['UNRESOLVED_SWEETENING_FREEZING_PATH'],
        behavior: {
          classificationOutcome: 'classified',
          baseRecipeEligible: false,
          toppingEligible: true,
          intendedUsageRole: 'TOPPING_ONLY',
          dosageInterpretation: toppingRecognition.dosage,
          classificationReasonCodes: [],
        },
      }),
    );

    expect(result.criticalBlockers).not.toContain('UNRESOLVED_SWEETENING_FREEZING_PATH');
    expect(result.criticalCapApplied).toBe(false);
    expect(result.roleReadiness).toBe('TOPPING_READY');
    expect(result.baseEngineReady).toBe(false);
  });

  it('does not grant the topping physics exemption before ProductBehavior approval', () => {
    const toppingRecognition = {
      ...recognition,
      intendedUsageRole: 'TOPPING_ONLY' as const,
    };
    const result = assessProductProductionAccuracy(
      baseInput({
        recognition: toppingRecognition,
        engineUsable: false,
        criticalPhysicsBlockers: ['UNRESOLVED_SWEETENING_FREEZING_PATH'],
        sweetnessPath: {
          kind: 'unresolved',
          resolved: false,
          reason: 'widmo cukrów pozostaje nierozstrzygnięte',
        },
        behavior: {
          classificationOutcome: 'unknown_requires_review',
          baseRecipeEligible: false,
          toppingEligible: false,
          intendedUsageRole: 'TOPPING_ONLY',
          dosageInterpretation: toppingRecognition.dosage,
          classificationReasonCodes: ['product_semantics_unresolved'],
        },
      }),
    );

    expect(result.components.enginePhysics.earnedPoints).toBeLessThan(25);
    expect(result.criticalBlockers).toContain('product_semantics_unresolved');
    expect(result.roleReadiness).toBe('REVIEW');
  });

  it('does not award a generic web-search bonus', () => {
    const withoutWeb = assessProductProductionAccuracy(baseInput());
    const withUnrelatedWebReceipt = assessProductProductionAccuracy(
      baseInput({
        evidenceProvenance: {
          identity: {
            source: 'label',
            sourceUrl: 'https://example.test/product',
            sourceAuthorityClass: 'UNCLASSIFIED_WEB',
          },
        },
      }),
    );
    expect(withUnrelatedWebReceipt.productAccuracy).toBe(withoutWeb.productAccuracy);
  });
});
