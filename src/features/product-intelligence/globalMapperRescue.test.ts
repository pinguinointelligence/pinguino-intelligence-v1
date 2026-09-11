import { describe, expect, it } from 'vitest';
import {
  buildMapperKnowledge,
  rescueMassBalanceFromCohort,
  type MapperKnowledgeRow,
} from './mapperValueInference';
import { resolveProductWorkingValues } from './productWorkingValues';
import { classifyProductSemantics, type ProductSemanticEvidence } from './productRecognition';
import { classifyProspectiveProductBehavior } from './productBehaviorAuthority';
import {
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { loadMapperKnowledgeRows } from './__dryrun__/mapperFixture';
import {
  applyFieldTruth,
  emptyFieldTruthMap,
  knownField,
  type ProductFieldTruthMap,
} from './productFieldTruth';

const evidence = (overrides: Partial<ProductSemanticEvidence>): ProductSemanticEvidence => ({
  name: null,
  brand: null,
  manufacturer: null,
  manufacturerCode: null,
  gtin: null,
  productType: null,
  category: null,
  subcategory: null,
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
  ...overrides,
});

const mapperRow = (
  id: string,
  totalSolids: number,
  overrides: Partial<MapperKnowledgeRow> = {},
): MapperKnowledgeRow => ({
  ingredient_id: id,
  ingredient_name_internal: `cocoa powder ${id}`,
  ingredient_name_display: `Cocoa Powder ${id}`,
  ingredient_category: 'cocoa',
  ingredient_subcategory: 'cocoa_powder',
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  water_percent: 100 - totalSolids,
  total_solids_percent: totalSolids,
  fat_percent: 10,
  protein_percent: 10,
  carbohydrate_percent: 70,
  total_sugars_percent: 50,
  sucrose_percent: 50,
  dextrose_percent: 0,
  glucose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 6,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 370,
  pod_value: 50,
  pac_value: 50,
  sweetness_factor: 1,
  freezing_factor: 1,
  ...overrides,
});

const exactFields = (overrides: Partial<Record<string, number>> = {}): ProductFieldTruthMap => {
  let fields = emptyFieldTruthMap();
  const values = {
    fat_percent: 10,
    protein_percent: 10,
    carbohydrate_percent: 70,
    fiber_percent: 6,
    salt_percent: 0,
    alcohol_percent: 0,
    ...overrides,
  };
  for (const [field, value] of Object.entries(values)) {
    fields = applyFieldTruth(
      fields,
      field as keyof ProductFieldTruthMap,
      knownField({ value, state: 'VERIFIED', confidence: 0.95, basis: 'product_declared' }),
    );
  }
  return fields;
};

const cocoaSemantic = classifyProductSemantics(
  evidence({
    name: 'Cacao soluble en polvo',
    category: 'cocoa',
    subcategory: 'cocoa powder',
    description: 'Cacao soluble en polvo para bebida',
  }),
);

describe('field-specific mass-balance Rescue safety', () => {
  it('uses a coherent field cohort although no whole-profile donor was accepted', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 96), mapperRow('b', 97), mapperRow('c', 98)],
      fields: exactFields(),
      semantic: cocoaSemantic,
    });
    expect(result).toMatchObject({
      resolved: true,
      totalSolids: 97,
      water: 3,
      reasonCodes: ['RESCUE_MASS_BALANCE_SUCCESS'],
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.86);
    expect(result.candidates.map((candidate) => candidate.ingredientId)).toEqual(['a', 'b', 'c']);
  });

  it('fails closed when the cohort is too small', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 97), mapperRow('b', 97)],
      fields: exactFields(),
      semantic: cocoaSemantic,
    });
    expect(result).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_INSUFFICIENT_FIELD_CANDIDATES'],
    });
  });

  it('fails closed when the field cohort is highly dispersed', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 96), mapperRow('b', 96), mapperRow('c', 100), mapperRow('d', 100)],
      fields: exactFields(),
      semantic: cocoaSemantic,
    });
    expect(result.resolved).toBe(false);
    expect(result.reasonCodes).toContain('RESCUE_COHORT_DISPERSION_HIGH');
  });

  it('rejects candidates whose solids contradict known exact composition', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 70), mapperRow('b', 71), mapperRow('c', 72)],
      fields: exactFields(),
      semantic: cocoaSemantic,
    });
    expect(result).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_INSUFFICIENT_FIELD_CANDIDATES'],
    });
    expect(
      result.rejectedCandidates.every((candidate) =>
        candidate.reasonCodes.includes('RESCUE_KNOWN_COMPOSITION_CONTRADICTION'),
      ),
    ).toBe(true);
  });

  it('rejects a physically incompatible form even when its numbers are narrow', () => {
    const liquids = [
      mapperRow('a', 10, {
        ingredient_name_internal: 'cocoa drink liquid a',
        ingredient_name_display: 'Cocoa drink liquid a',
        ingredient_category: 'beverage',
        ingredient_subcategory: 'drink',
      }),
      mapperRow('b', 10, {
        ingredient_name_internal: 'cocoa drink liquid b',
        ingredient_name_display: 'Cocoa drink liquid b',
        ingredient_category: 'beverage',
        ingredient_subcategory: 'drink',
      }),
      mapperRow('c', 10, {
        ingredient_name_internal: 'cocoa drink liquid c',
        ingredient_name_display: 'Cocoa drink liquid c',
        ingredient_category: 'beverage',
        ingredient_subcategory: 'drink',
      }),
    ];
    const result = rescueMassBalanceFromCohort({
      cohort: liquids,
      fields: exactFields(),
      semantic: cocoaSemantic,
    });
    expect(result.resolved).toBe(false);
    expect(
      result.rejectedCandidates.some((candidate) =>
        candidate.reasonCodes.includes('RESCUE_PHYSICAL_FORM_MISMATCH'),
      ),
    ).toBe(true);
  });

  it('rejects a macro-incompatible or non-verified candidate set', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [
        mapperRow('a', 97, { fat_percent: 40 }),
        mapperRow('b', 97, { verification_status: 'Estimated' }),
        mapperRow('c', 97, { approved_for_engines: false }),
      ],
      fields: exactFields(),
      semantic: cocoaSemantic,
    });
    expect(result.resolved).toBe(false);
    expect(result.rejectedCandidates.flatMap((candidate) => candidate.reasonCodes)).toEqual(
      expect.arrayContaining(['RESCUE_MACRO_MISMATCH', 'RESCUE_CANDIDATE_NOT_VERIFIED']),
    );
  });

  it('rejects ambiguous blend/premix semantics before reading a cohort', () => {
    const ambiguous = classifyProductSemantics(
      evidence({ name: 'Blend numer 7', category: 'base mix', subcategory: 'premix' }),
    );
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 97), mapperRow('b', 97), mapperRow('c', 97)],
      fields: exactFields(),
      semantic: ambiguous,
    });
    expect(result).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_TARGET_SEMANTICS_UNRESOLVED'],
    });
  });
});

describe('global Mapper Rescue regression fixtures', () => {
  it('reaches Engine and ProductBehavior through per-field Rescue after whole-profile rejection', () => {
    const rows = ['a', 'b', 'c'].map((id) =>
      mapperRow(id, 97, {
        fat_percent: 18,
        protein_percent: 15,
        carbohydrate_percent: 58,
        total_sugars_percent: 0,
        sucrose_percent: 0,
        fiber_percent: 1,
        salt_percent: 1.5,
      }),
    );
    const knowledge = buildMapperKnowledge(rows, 'synthetic-rescue-fingerprint');
    const resolved = resolveProductWorkingValues(
      {
        declared: {
          fat_percent: 10,
          protein_percent: 10,
          carbohydrate_percent: 70,
          total_sugars_percent: 70,
          sucrose_percent: 70,
          fiber_percent: 6,
          salt_percent: 0,
          alcohol_percent: 0,
        },
        declaredBasis: { sucrose_percent: 'derived' },
        declaredConfidence: 0.95,
        identity: {
          name: 'Cocoa powder target',
          category: 'cocoa',
          subcategory: 'cocoa powder',
          semantic: cocoaSemantic,
        },
        technical: false,
      },
      knowledge,
    );

    expect(resolved.profileMatch?.confidence).toBeLessThan(0.85);
    expect(resolved.fields.total_solids_percent).toMatchObject({
      value: 99.5,
      provenance: {
        state: 'ESTIMATED',
        algorithmVersion: 'mapper-field-rescue-v1',
        mapperFingerprint: 'synthetic-rescue-fingerprint',
      },
    });
    expect(resolved.fields.water_percent).toMatchObject({
      value: 0.5,
      provenance: { state: 'ESTIMATED', basis: 'derived' },
    });
    expect(resolved.engineReady).toBe(true);
    expect(resolved.criticalPhysicsBlockers).toEqual([]);

    expect(
      classifyProspectiveProductBehavior({
        kind: 'normal_food',
        engineUsable: resolved.engineReady,
        profileMatch: resolved.profileMatch,
        recognition: cocoaSemantic,
        criticalPhysicsBlockers: resolved.criticalPhysicsBlockers,
      }),
    ).toMatchObject({
      classificationOutcome: 'classified',
      baseRecipeEligible: true,
      intendedUsageRole: 'BASE_ONLY',
    });
  });

  it('audits Hacendado as an ordinary cocoa-powder product after whole-profile rejection', () => {
    const mapper = loadMapperKnowledgeRows();
    const rows = mapper.rows.filter(
      (row): row is IntimportMapperAuthorityRow =>
        row.is_active !== false &&
        row.approved_for_base === true &&
        row.approved_for_engines === true &&
        row.verification_status?.toLowerCase().startsWith('verified') === true,
    );
    const knowledge = buildMapperKnowledge(rows, mapper.fingerprint);
    const recognitionEvidence = evidence({
      name: 'Cacao soluble',
      brand: 'Hacendado',
      gtin: '8480000804693',
      productType: 'Cacao soluble en polvo',
      category: 'cocoa',
      subcategory: 'cocoa powder',
      ingredients:
        'Azucar, cacao desgrasado en polvo (30%), fosfato dicalcico, sal y canela en polvo.',
      nutrition:
        'por 100 g: 373 kcal, grasas 3.3 g, hidratos 74 g, azucares 70 g, fibra 10 g, proteinas 6.8 g, sal 0.1 g',
      description: 'Cacao soluble en polvo para preparar bebida',
      sourceUrls: ['https://example.test/8480000804693'],
    });
    const recognition = classifyProductSemantics(recognitionEvidence);
    const input = {
      declared: {
        fat_percent: 3.3,
        protein_percent: 6.8,
        carbohydrate_percent: 74,
        total_sugars_percent: 70,
        sucrose_percent: 70,
        fiber_percent: 10,
        salt_percent: 0.1,
        kcal_per_100g: 373,
      },
      declaredBasis: { sucrose_percent: 'derived' as const },
      declaredConfidence: 0.88,
      identity: {
        name: 'Cacao soluble',
        brand: 'Hacendado',
        category: 'cocoa',
        subcategory: 'cocoa powder',
        barcode: '8480000804693',
        semantic: recognition,
      },
      technical: false,
    };

    const resolved = resolveProductWorkingValues(input, knowledge);

    expect(recognition).toMatchObject({
      productArchetype: 'COCOA_POWDER',
      ingredientFamily: 'cocoa',
      physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(resolved.fields.sucrose_percent).toMatchObject({
      value: 70,
      provenance: { state: 'VERIFIED', basis: 'derived' },
    });
    expect(resolved.profileMatch?.confidence).toBeLessThan(0.85);
    expect(resolved.fields.fat_percent.value).toBe(3.3);
    expect(resolved.fields.protein_percent.value).toBe(6.8);
    expect(resolved.fields.carbohydrate_percent.value).toBe(74);
    expect(resolved.fields.total_sugars_percent.value).toBe(70);
    expect(resolved.fields.fiber_percent.value).toBe(10);
    expect(resolved.fields.salt_percent.value).toBe(0.1);
    expect(resolved.fields.kcal_per_100g.value).toBe(373);
    // The generic backtest-derived safety ceiling is stricter than this
    // product's 5.8% unaccounted mass, so the honest result is unresolved.
    expect(resolved.fields.water_percent).toMatchObject({
      value: null,
      provenance: { note: 'RESCUE_TARGET_COMPOSITION_COVERAGE_LOW' },
    });
    expect(resolved.fields.total_solids_percent.value).toBeNull();
    expect(resolved.unresolvedEngineFieldReasons.water_percent).toContain(
      'RESCUE_TARGET_COMPOSITION_COVERAGE_LOW',
    );
    expect(resolved.engineReady).toBe(false);

    const trusted = validateIntimportProductProfileProposal({
      proposedMapperIngredientId: null,
      matchInput: {
        name: 'Cacao soluble',
        brand: 'Hacendado',
        category: 'cocoa',
        subcategory: 'cocoa powder',
        barcode: '8480000804693',
      },
      declared: input.declared,
      declaredBasis: input.declaredBasis,
      evidence: {
        kind: 'normal_food',
        fields: {
          identity: 'web_search',
          brand: 'web_search',
          barcode: 'barcode_registry',
          ingredients: 'web_search',
          energyKcal: 'web_search',
          fat: 'web_search',
          carbohydrate: 'web_search',
          protein: 'web_search',
          salt: 'web_search',
        },
        validatedBarcode: true,
        exactCanonicalMatch: false,
        mapperFamilyMatch: true,
        materialConflicts: [],
      },
      recognitionEvidence,
      rows,
    });
    expect(trusted).not.toBeNull();
    expect(trusted).toMatchObject({
      engineUsable: false,
      mapperSimilarity: null,
      mapperProfileBasis: null,
      profileReferenceMapperIngredientId: null,
      profileReferenceAuthority: null,
    });
    expect(trusted?.unresolvedEngineFieldReasons.water_percent).toContain(
      'RESCUE_TARGET_COMPOSITION_COVERAGE_LOW',
    );
    expect(trusted?.fieldTruth.sucrose_percent).toMatchObject({ value: 70, state: 'VERIFIED' });
  });
});
