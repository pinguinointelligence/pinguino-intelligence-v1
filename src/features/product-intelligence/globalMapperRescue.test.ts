import { describe, expect, it } from 'vitest';
import {
  assessRescueTargetEvidenceSufficiency,
  buildMapperKnowledge,
  inferMapperValues,
  rescueMassBalanceFromCohort,
  validateMassBalanceRescueProposal,
  type MapperKnowledgeRow,
} from './mapperValueInference';
import { resolveProductWorkingValues } from './productWorkingValues';
import { classifyProductSemantics, type ProductSemanticEvidence } from './productRecognition';
import { classifyProspectiveProductBehavior } from './productBehaviorAuthority';
import {
  isIntimportMapperRescueDonor,
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

const hardFields = (values: Partial<Record<string, number>>): ProductFieldTruthMap => {
  let fields = emptyFieldTruthMap();
  for (const [field, value] of Object.entries(values)) {
    if (typeof value !== 'number') continue;
    fields = applyFieldTruth(
      fields,
      field as keyof ProductFieldTruthMap,
      knownField({ value, state: 'VERIFIED', confidence: 0.95, basis: 'product_declared' }),
    );
  }
  return fields;
};

const exactFields = (overrides: Partial<Record<string, number>> = {}): ProductFieldTruthMap =>
  hardFields({
    fat_percent: 10,
    protein_percent: 10,
    carbohydrate_percent: 70,
    fiber_percent: 6,
    salt_percent: 0,
    alcohol_percent: 0,
    ...overrides,
  });

const targetEvidence = {
  exactProductIdentity: true,
  ingredientOrCompositionIdentity: true,
} as const;

const replayVerifiedMapperMassBalance = (ingredientId: string) => {
  const mapper = loadMapperKnowledgeRows();
  const rows = mapper.rows.filter(
    (row) =>
      row.is_active !== false &&
      row.approved_for_base === true &&
      row.approved_for_engines === true &&
      row.verification_status?.trim().toLowerCase().startsWith('verified') === true,
  );
  const target = rows.find((row) => row.ingredient_id === ingredientId);
  if (!target) throw new Error(`Missing Mapper regression target ${ingredientId}`);
  const semantic = classifyProductSemantics(
    evidence({
      name: target.ingredient_name_display ?? target.ingredient_name_internal,
      brand: target.brand ?? null,
      manufacturer: target.brand ?? null,
      manufacturerCode: target.ingredient_id,
      productType: 'mapper_reference',
      category: target.ingredient_category ?? null,
      subcategory: target.ingredient_subcategory ?? null,
    }),
  );
  const fields = hardFields(
    Object.fromEntries(
      [
        'fat_percent',
        'protein_percent',
        'carbohydrate_percent',
        'fiber_percent',
        'salt_percent',
        'alcohol_percent',
      ].flatMap((field) =>
        typeof target[field as keyof MapperKnowledgeRow] === 'number'
          ? [[field, target[field as keyof MapperKnowledgeRow] as number]]
          : [],
      ),
    ),
  );
  const inference = inferMapperValues(
    {
      name: target.ingredient_name_display ?? target.ingredient_name_internal,
      brand: target.brand ?? null,
      category: target.ingredient_category ?? null,
      subcategory: target.ingredient_subcategory ?? null,
      barcode: null,
      knownMacros: {
        fat_percent: target.fat_percent ?? undefined,
        protein_percent: target.protein_percent ?? undefined,
        carbohydrate_percent: target.carbohydrate_percent ?? undefined,
      },
      semantic,
      excludedMapperIngredientIds: [ingredientId],
    },
    buildMapperKnowledge(rows, mapper.fingerprint),
  );
  const rescue = rescueMassBalanceFromCohort({
    cohort: inference.bestCohort?.rows ?? [],
    fields,
    semantic,
    targetEvidence,
    excludedMapperIngredientIds: [ingredientId],
  });
  return { target, semantic, fields, inference, rescue };
};

const cocoaSemantic = classifyProductSemantics(
  evidence({
    name: 'Cacao soluble en polvo',
    category: 'cocoa',
    subcategory: 'cocoa powder',
    description: 'Cacao soluble en polvo para bebida',
  }),
);

const dairySemantic = {
  ...cocoaSemantic,
  productArchetype: 'NORMAL_INGREDIENT' as const,
  ingredientFamily: 'dairy_liquid' as const,
  physicalForm: 'LIQUID' as const,
  intendedUsageRole: 'BASE_ONLY' as const,
  flavorDomain: 'MILK_CREAM' as const,
  compatibleMapperCategories: ['dairy'],
  forbiddenMapperCategories: [],
  modelRequired: false,
};

describe('field-specific mass-balance Rescue safety', () => {
  it('uses resolved semantic context below 0.85 while keeping the Rescue result floor above 0.85', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 96), mapperRow('b', 97), mapperRow('c', 98)],
      fields: exactFields(),
      semantic: { ...cocoaSemantic, confidence: 0.8 },
      targetEvidence,
    });
    expect(result).toMatchObject({
      resolved: true,
      totalSolids: 97,
      water: 3,
      reasonCodes: ['RESCUE_MASS_BALANCE_SUCCESS'],
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('uses a coherent field cohort although no whole-profile donor was accepted', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 96), mapperRow('b', 97), mapperRow('c', 98)],
      fields: exactFields(),
      semantic: cocoaSemantic,
      targetEvidence,
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
      targetEvidence,
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
      targetEvidence,
    });
    expect(result.resolved).toBe(false);
    expect(result.reasonCodes).toContain('RESCUE_COHORT_DISPERSION_HIGH');
  });

  it('rejects candidates whose solids contradict known exact composition', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 70), mapperRow('b', 71), mapperRow('c', 72)],
      fields: exactFields(),
      semantic: cocoaSemantic,
      targetEvidence,
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
      targetEvidence,
    });
    expect(result.resolved).toBe(false);
    expect(
      result.rejectedCandidates.some((candidate) =>
        candidate.reasonCodes.includes('RESCUE_PHYSICAL_FORM_MISMATCH'),
      ),
    ).toBe(true);
  });

  it('RSC-AUTH-01 keeps non-Verified canonical PI provenance for audit without using it as eligibility', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [
        mapperRow('a', 97, { fat_percent: 40 }),
        mapperRow('b', 97, { verification_status: 'Estimated' }),
        mapperRow('c', 97, { approved_for_engines: false }),
        mapperRow('d', 97, { verification_status: 'PI Calculated' }),
      ],
      fields: exactFields(),
      semantic: cocoaSemantic,
      targetEvidence,
    });
    expect(result.resolved).toBe(true);
    expect(result.candidates.map((candidate) => candidate.ingredientId)).toEqual(['b', 'c', 'd']);
    expect(result.rejectedCandidates[0]?.ingredientId).toBe('a');
    expect(result.rejectedCandidates[0]?.reasonCodes).toContain('RESCUE_MACRO_MISMATCH');
    expect(result.candidates.some((candidate) => candidate.ingredientId === 'b')).toBe(true);
  });

  it('rejects ambiguous blend/premix semantics before reading a cohort', () => {
    const ambiguous = classifyProductSemantics(
      evidence({ name: 'Blend numer 7', category: 'base mix', subcategory: 'premix' }),
    );
    const result = rescueMassBalanceFromCohort({
      cohort: [mapperRow('a', 97), mapperRow('b', 97), mapperRow('c', 97)],
      fields: exactFields(),
      semantic: ambiguous,
      targetEvidence,
    });
    expect(result).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_TARGET_SEMANTICS_UNRESOLVED'],
    });
  });

  it('RSC-SAFE-01 fails target sufficiency for an open-composition family with one numeric anchor', () => {
    const assessment = assessRescueTargetEvidenceSufficiency({
      field: 'total_solids_percent',
      fields: hardFields({ fat_percent: 0.5 }),
      semantic: dairySemantic,
      identityEvidence: targetEvidence,
      cohort: [mapperRow('a', 12), mapperRow('b', 13), mapperRow('c', 14)],
    });
    expect(assessment).toMatchObject({
      sufficient: false,
      compositionModel: 'OPEN',
      independentGroups: ['fat'],
      relevantGroups: ['fat'],
      requiredIndependentGroups: 3,
      reasonCodes: ['RESCUE_TARGET_EVIDENCE_INSUFFICIENT'],
    });
  });

  it('RSC-SAFE-02 counts carbohydrate, sugars and kcal as one independent composition group', () => {
    const assessment = assessRescueTargetEvidenceSufficiency({
      field: 'water_percent',
      fields: hardFields({
        carbohydrate_percent: 3.5,
        total_sugars_percent: 3.5,
        kcal_per_100g: 46,
      }),
      semantic: dairySemantic,
      identityEvidence: targetEvidence,
      cohort: [mapperRow('a', 12), mapperRow('b', 13), mapperRow('c', 14)],
    });
    expect(assessment.independentGroups).toEqual(['carbohydrate']);
    expect(assessment.sufficient).toBe(false);
  });

  it('RSC-SAFE-03 allows sparse nutrition for an exact constrained canonical oil identity', () => {
    const mapper = loadMapperKnowledgeRows();
    const cohort = mapper.rows.filter((row) =>
      ['PI-ING-000299', 'PI-ING-000300', 'PI-ING-000302', 'PI-ING-000303'].includes(
        row.ingredient_id,
      ),
    );
    const oilSemantic = {
      ...dairySemantic,
      ingredientFamily: 'liquid_vegetable_oil' as const,
      flavorDomain: 'NEUTRAL' as const,
      compatibleMapperCategories: ['fat'],
    };
    const assessment = assessRescueTargetEvidenceSufficiency({
      field: 'total_solids_percent',
      fields: hardFields({ fat_percent: 100 }),
      semantic: oilSemantic,
      identityEvidence: targetEvidence,
      cohort,
    });
    expect(cohort).toHaveLength(4);
    expect(assessment).toMatchObject({
      sufficient: true,
      compositionModel: 'CONSTRAINED',
      independentGroups: ['fat'],
      requiredIndependentGroups: 0,
    });
  });

  it('RSC-SAFE-04 rejects a physically inconsistent proposal in the post-Rescue closure guard', () => {
    const validation = validateMassBalanceRescueProposal({
      water: 80,
      totalSolids: 30,
      fields: hardFields({ fat_percent: 0.5, protein_percent: 8, carbohydrate_percent: 3.5 }),
      semantic: dairySemantic,
    });
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain('RESCUE_POST_MASS_BALANCE_INVALID');
  });

  it('RSC-AUTH-02 admits active canonical PI donors regardless of historical provenance status', () => {
    const donor = mapperRow('PI-ING-999999', 14, {
      verification_status: 'Estimated / PI Calculated',
      approved_for_base: false,
      approved_for_engines: false,
    }) as IntimportMapperAuthorityRow;
    expect(isIntimportMapperRescueDonor(donor)).toBe(true);
    expect(donor.verification_status).toBe('Estimated / PI Calculated');
  });

  it('WSA-NEG-01 refuses the sparse named-solid basis that previously gave a powder 68.63% water', () => {
    const replay = replayVerifiedMapperMassBalance('PI-ING-000777');

    expect(replay.semantic).toMatchObject({
      ingredientFamily: 'base_mix',
      physicalForm: 'POWDER',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(replay.rescue.resolved).toBe(false);
    expect(replay.rescue.water).toBeNull();
    expect(replay.rescue.confidence).toBeLessThan(0.85);
    expect(replay.rescue.reasonCodes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /RESCUE_(INSUFFICIENT_FIELD_CANDIDATES|DIRECT_MASS_DISPERSION_HIGH|DIRECT_MASS_PROPOSAL_INCONSISTENT)/,
        ),
      ]),
    );
  });

  it('WSA-NEG-02 rejects high-fibre/low-salt stabilizer donors against hard target fibre and salt', () => {
    const replay = replayVerifiedMapperMassBalance('PI-ING-000470');

    expect(replay.rescue.resolved).toBe(false);
    expect(replay.rescue.water).toBeNull();
    expect(replay.rescue.confidence).toBeLessThan(0.85);
    expect(replay.rescue.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: 'PI-ING-000466',
          reasonCodes: expect.arrayContaining(['RESCUE_HARD_FIELD_MISMATCH']),
        }),
        expect.objectContaining({
          ingredientId: 'PI-ING-000492',
          reasonCodes: expect.arrayContaining(['RESCUE_HARD_FIELD_MISMATCH']),
        }),
      ]),
    );
  });

  it('WSA-NEG-03 does not turn zero donor-residual dispersion into applicability confidence', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [
        mapperRow('a', 20, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 20 }),
        mapperRow('b', 20, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 20 }),
        mapperRow('c', 32, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 32 }),
        mapperRow('d', 32, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 32 }),
        mapperRow('e', 20, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 20 }),
        mapperRow('f', 20, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 20 }),
        mapperRow('g', 32, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 32 }),
        mapperRow('h', 32, { fat_percent: 0, protein_percent: 0, carbohydrate_percent: 32 }),
      ],
      fields: hardFields({
        fat_percent: 0,
        protein_percent: 0,
        carbohydrate_percent: 20,
      }),
      semantic: cocoaSemantic,
      targetEvidence,
    });

    expect(result.resolved).toBe(false);
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.reasonCodes).toContain('RESCUE_DIRECT_MASS_DISPERSION_HIGH');
  });

  it('WSA-NEG-04 rejects a residual proposal outside coherent direct donor water support', () => {
    const result = rescueMassBalanceFromCohort({
      cohort: [
        mapperRow('a', 88, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('b', 89, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('c', 90, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('d', 88, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('e', 89, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('f', 90, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('g', 88, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
        mapperRow('h', 90, { fat_percent: 8, protein_percent: 5, carbohydrate_percent: 52 }),
      ],
      fields: hardFields({
        fat_percent: 0,
        protein_percent: 0,
        carbohydrate_percent: 40,
      }),
      semantic: cocoaSemantic,
      targetEvidence,
    });

    expect(result.resolved).toBe(false);
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.reasonCodes).toContain('RESCUE_DIRECT_MASS_PROPOSAL_INCONSISTENT');
  });

  it('WSA-POS-01 preserves the safe PI-ING-000057 dry aligned-basis result', () => {
    const safe57 = replayVerifiedMapperMassBalance('PI-ING-000057');

    expect(safe57.rescue).toMatchObject({ resolved: true, water: 6.25, totalSolids: 93.75 });
  });

  it('WSA-POS-02 preserves the safe PI-ING-000078 dry aligned-basis result', () => {
    const safe78 = replayVerifiedMapperMassBalance('PI-ING-000078');

    expect(safe78.rescue).toMatchObject({ resolved: true, water: 3.2, totalSolids: 96.8 });
  });

  it('WSA-POS-03 preserves the PI-ING-000050 dispersion refusal', () => {
    const refused50 = replayVerifiedMapperMassBalance('PI-ING-000050');

    expect(refused50.rescue).toMatchObject({
      resolved: false,
      reasonCodes: ['RESCUE_COHORT_DISPERSION_HIGH'],
    });
  });

  it('WSA-HARD-01 never changes verified target facts during an applicability refusal', () => {
    const replay = replayVerifiedMapperMassBalance('PI-ING-000470');

    expect(replay.fields.fat_percent).toMatchObject({
      value: 0.1,
      provenance: { state: 'VERIFIED' },
    });
    expect(replay.fields.protein_percent.value).toBe(1.7);
    expect(replay.fields.carbohydrate_percent.value).toBe(0);
    expect(replay.fields.fiber_percent.value).toBe(0);
    expect(replay.fields.salt_percent.value).toBe(13.7);
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
        rescueTargetEvidence: targetEvidence,
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
      rescueTargetEvidence: targetEvidence,
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
    // The removed pre-Rescue mass-coverage gate no longer decides this case;
    // this intentionally narrowed legacy fixture lacks a viable field cohort.
    expect(resolved.fields.water_percent).toMatchObject({
      value: null,
      provenance: { note: 'RESCUE_INSUFFICIENT_FIELD_CANDIDATES' },
    });
    expect(resolved.fields.total_solids_percent.value).toBeNull();
    expect(resolved.unresolvedEngineFieldReasons.water_percent).toContain(
      'RESCUE_INSUFFICIENT_FIELD_CANDIDATES',
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
      'RESCUE_INSUFFICIENT_FIELD_CANDIDATES',
    );
    expect(trusted?.fieldTruth.sucrose_percent).toMatchObject({ value: 70, state: 'VERIFIED' });
  });
});
