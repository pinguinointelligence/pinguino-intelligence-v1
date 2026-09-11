import { describe, expect, it } from 'vitest';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';
import {
  isBindableIntimportMapperTarget,
  isIntimportMapperRescueDonor,
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { scanResultFromLookupFacts } from '../../../supabase/functions/_shared/productScanner';
import { loadMapperKnowledgeRows } from '../product-intelligence/__dryrun__/mapperFixture';
import { validateProductBehaviorAuthority } from '../product-intelligence/productBehaviorAuthority';
import { classifyProductSemantics } from '../product-intelligence/productRecognition';
import {
  buildMapperKnowledge,
  findProfileMatch,
  inferMapperValues,
  rescueMassBalanceFromCohort,
  rescueSugarSpectrumFromCohort,
} from '../product-intelligence/mapperValueInference';
import { classifyRemainingGaps } from '../scan-flow/scanFlowLogic';
import { productSemanticEvidenceFromScanResult } from '../../../supabase/functions/_shared/productScanner';
import {
  applyFieldTruth,
  emptyFieldTruthMap,
  knownField,
  type ProductFieldTruthMap,
  type WorkingNumericField,
} from '../product-intelligence/productFieldTruth';
import { ingredientPodContribution } from '../../engine/pod';
import { ingredientNpacContribution, ingredientPacContribution } from '../../engine/pac';
import type { EffectiveRecipeItem } from '../../engine/types';

const EAN = '8480000510716';
const SESSION = '50896b62-81fb-4c00-9a6a-f0ba107a3b6e';
const URL = `https://tienda.mercadona.es/product/${EAN}`;
const fact = (field: string, value: string) => ({
  field,
  value,
  sourceUrl: URL,
  sourceAuthorityClass: 'OFFICIAL_PRIVATE_LABEL',
  sourceTitle: 'Queso fresco batido desnatado Hacendado 500 g',
  sourceStatedEan: EAN,
  sourceEanConfirmationMethod: 'page_text',
  sourceEanConfirmedAt: '2026-09-11T00:00:00.000Z',
});

describe('Hacendado Queso 8480000510716 rescue-first regression', () => {
  it('SCN-QUESO-01 keeps the complete exact-product evidence and never classifies physics as photo-solvable', () => {
    const scan = scanResultFromLookupFacts([
      fact('productName', 'Queso fresco batido desnatado'),
      fact('brand', 'Hacendado'),
      fact('productCategory', 'Queso fresco batido, lácteo fermentado'),
      fact('productDescription', 'Producto lácteo desnatado de consistencia cremosa.'),
      fact('netQuantity', '500 g'),
      fact('ingredients', 'Leche desnatada pasteurizada y fermentos lácticos'),
      fact('allergens', 'Leche'),
      fact('nutritionBasis', 'por 100 g'),
      fact('energyKj', '194 kJ'),
      fact('energyKcal', '46 kcal'),
      fact('fat', '0,2 g'),
      fact('saturatedFat', '0,1 g'),
      fact('carbohydrate', '3,8 g'),
      fact('sugars', '3,8 g'),
      fact('fiber', '0 g'),
      fact('protein', '8 g'),
      fact('salt', '0,10 g'),
      fact('manufacturer', 'Mercadona S.A.'),
      fact('countryOfOrigin', 'España'),
      fact('technicalParameters', 'Producto pasteurizado; conservar refrigerado.'),
    ])!;
    scan.barcodes = [{ value: EAN, format: 'EAN_13' }];
    const evidence = productSemanticEvidenceFromScanResult(scan);
    const deterministic = classifyProductSemantics(evidence);
    // Exact persisted Recognition from the accepted phone forensic. The deterministic classifier
    // asks its server model for this Spanish product; the model resolved these semantics at 0.80.
    const recognition = {
      ...deterministic,
      classificationSource: 'SERVER_MODEL' as const,
      productArchetype: 'NORMAL_INGREDIENT' as const,
      ingredientFamily: 'dairy_liquid' as const,
      physicalForm: 'LIQUID' as const,
      intendedUsageRole: 'BASE_ONLY' as const,
      compatibleMapperCategories: ['dairy'],
      isTechnicalProduct: false,
      isDosageDependent: false,
      confidence: 0.8,
      modelRequired: false,
      modelReasonCodes: [],
    };
    const proposal = customerProductProfileProposal({
      scanResult: scan,
      recognitionEvidence: evidence,
      recognition,
    });
    const { rows } = loadMapperKnowledgeRows();
    const profile = proposal
      ? validateIntimportProductProfileProposal({
          origin: 'CUSTOMER_ADDED',
          proposedMapperIngredientId: null,
          ...proposal,
          rows: rows as unknown as IntimportMapperAuthorityRow[],
        })
      : null;
    const behavior = profile
      ? validateProductBehaviorAuthority({ productProfile: profile, behaviorRows: [] })
      : null;
    const blockers = profile?.productAccuracyAssessment.criticalBlockers ?? [];

    expect(scan).toMatchObject({
      identity: { displayName: 'Queso fresco batido desnatado', brand: 'Hacendado' },
      package: { netQuantity: 500, unit: 'g' },
      ingredientsText: 'Leche desnatada pasteurizada y fermentos lácticos',
      nutrition: { basis: 'per_100g', energyKcal: 46, protein: 8 },
    });
    expect(recognition).toMatchObject({
      ingredientFamily: 'dairy_liquid',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
      modelRequired: false,
    });
    expect(profile).not.toBeNull();
    expect(behavior).toMatchObject({ familyId: 'dairy', formId: 'liquid' });
    expect(behavior?.profilePermissions).toMatchObject({ BASE_RECIPE: false, PRODUCTION: false });
    expect(classifyRemainingGaps(blockers).photoSolvable).toEqual([]);
    expect(classifyRemainingGaps(blockers).photoCannotSolve).toEqual(blockers);
  });

  it('SCN-QUESO-02 runs the exact persisted session through the corrected Rescue authority once', () => {
    const scan = scanResultFromLookupFacts([
      fact('productName', 'Queso fresco batido desnatado 0% MG Hacendado'),
      fact('brand', 'Hacendado'),
      fact('productCategory', 'Lácteos, Quesos, Queso fresco, Quark'),
      fact('productDescription', 'Queso fresco batido 0% materia grasa'),
      fact('netQuantity', '500 g'),
      fact('ingredients', 'Leche desnatada pasteurizada, fermentos lácticos.'),
      fact('allergens', 'leche'),
      fact('nutritionBasis', 'por 100 ml'),
      fact('energyKj', '195 kJ'),
      fact('energyKcal', '46 kcal'),
      fact('fat', '0,5 g'),
      fact('saturatedFat', '0,1 g'),
      fact('carbohydrate', '3,5 g'),
      fact('sugars', '3,5 g'),
      fact('fiber', '0 g'),
      fact('protein', '8 g'),
      fact('salt', '0,1 g'),
      fact('technicalParameters', 'MIN 10% ESL'),
    ])!;
    scan.barcodes = [{ value: EAN, format: 'EAN_13' }];
    const evidence = productSemanticEvidenceFromScanResult(scan);
    const deterministic = classifyProductSemantics(evidence);
    const recognition = {
      ...deterministic,
      classificationSource: 'CUSTOMER_CONFIRMED' as const,
      productArchetype: 'NORMAL_INGREDIENT' as const,
      ingredientFamily: 'dairy_liquid' as const,
      physicalForm: 'LIQUID' as const,
      intendedUsageRole: 'BASE_ONLY' as const,
      compatibleMapperCategories: ['dairy'],
      isTechnicalProduct: false,
      isDosageDependent: false,
      confidence: 0.8,
      modelRequired: false,
      modelReasonCodes: [],
    };
    const proposal = customerProductProfileProposal({
      scanResult: scan,
      recognitionEvidence: evidence,
      recognition,
    })!;
    const mapper = loadMapperKnowledgeRows();
    const legacyRows = mapper.rows.filter((row) =>
      isBindableIntimportMapperTarget(row as IntimportMapperAuthorityRow),
    );
    const rows = mapper.rows.filter((row) =>
      isIntimportMapperRescueDonor(row as IntimportMapperAuthorityRow),
    );
    const knowledge = buildMapperKnowledge(rows, mapper.fingerprint);
    const legacyInference = inferMapperValues(
      {
        ...proposal.matchInput,
        knownMacros: {
          fat_percent: proposal.declared.fat_percent,
          protein_percent: proposal.declared.protein_percent,
          carbohydrate_percent: proposal.declared.carbohydrate_percent,
        },
        semantic: recognition,
      },
      buildMapperKnowledge(legacyRows, mapper.fingerprint),
    );
    const profileMatch = findProfileMatch(
      { ...proposal.matchInput, semantic: recognition },
      knowledge,
    );
    const fieldInference = inferMapperValues(
      {
        ...proposal.matchInput,
        knownMacros: {
          fat_percent: proposal.declared.fat_percent,
          protein_percent: proposal.declared.protein_percent,
          carbohydrate_percent: proposal.declared.carbohydrate_percent,
        },
        semantic: recognition,
      },
      knowledge,
    );
    let hardTargetFields = emptyFieldTruthMap();
    for (const [field, value] of Object.entries(proposal.declared)) {
      if (typeof value !== 'number') continue;
      hardTargetFields = applyFieldTruth(
        hardTargetFields,
        field as WorkingNumericField,
        knownField({
          value,
          state: 'VERIFIED',
          confidence: 0.95,
          basis: proposal.declaredBasis?.[field as WorkingNumericField] ?? 'product_declared',
        }),
      );
    }
    const massRescue = rescueMassBalanceFromCohort({
      cohort: fieldInference.bestCohort?.rows ?? [],
      fields: hardTargetFields as ProductFieldTruthMap,
      semantic: recognition,
      targetEvidence: {
        exactProductIdentity: true,
        ingredientOrCompositionIdentity: true,
      },
    });
    const finalCandidateIds = new Set(
      massRescue.candidates.map((candidate) => candidate.ingredientId),
    );
    const spectrumRescue = rescueSugarSpectrumFromCohort({
      cohort: (fieldInference.bestCohort?.rows ?? []).filter((row) =>
        finalCandidateIds.has(row.ingredient_id),
      ),
      fields: hardTargetFields,
      semantic: recognition,
      targetEvidence: {
        exactProductIdentity: true,
        ingredientOrCompositionIdentity: true,
      },
    });
    const badCandidates = new Set([
      'PI-ING-000175',
      'PI-ING-000184',
      'PI-ING-000279',
      'PI-ING-000287',
      'PI-ING-000290',
    ]);
    const trusted = validateIntimportProductProfileProposal({
      origin: 'CUSTOMER_ADDED',
      proposedMapperIngredientId: null,
      ...proposal,
      rows: mapper.rows as unknown as IntimportMapperAuthorityRow[],
    });

    expect(SESSION).toBe('50896b62-81fb-4c00-9a6a-f0ba107a3b6e');
    expect(profileMatch.family).toBe('dairy_liquid');
    expect(fieldInference.family).toBe('dairy_liquid');
    expect(legacyInference.bestCohort?.rows.length ?? 0).toBe(0);
    expect(fieldInference.bestCohort?.rows.length ?? 0).toBe(55);
    expect(massRescue.candidates).toHaveLength(34);
    expect(massRescue).toMatchObject({
      resolved: true,
      water: 87.1959,
      totalSolids: 12.8041,
      confidence: 0.887,
      reasonCodes: ['RESCUE_MASS_BALANCE_SUCCESS'],
      applicability: {
        physicalForm: 'LIQUID',
        directWaterMedian: 85.6688,
        directWaterIqr: 5.55,
        directWaterIqrLimit: 12,
        proposalDistance: 1.5271,
      },
    });
    expect(spectrumRescue).toMatchObject({
      resolved: true,
      compatibleCandidateCount: 34,
      validSpectrumCandidateCount: 33,
      confidence: 0.9,
      consensusShares: {
        sucrose_percent: 0,
        dextrose_percent: 0,
        glucose_percent: 0,
        fructose_percent: 0,
        lactose_percent: 1,
      },
      targetSpectrum: {
        sucrose_percent: 0,
        dextrose_percent: 0,
        glucose_percent: 0,
        fructose_percent: 0,
        lactose_percent: 3.5,
      },
    });
    expect(spectrumRescue.candidates).toHaveLength(32);
    expect(spectrumRescue.rejectedCandidates).toEqual(
      expect.arrayContaining([
        {
          ingredientId: 'PI-ING-001451',
          reasonCodes: ['RESCUE_SPECTRUM_DONOR_CLOSURE_INVALID'],
        },
        {
          ingredientId: 'PI-ING-002113',
          reasonCodes: ['RESCUE_SPECTRUM_SHARE_OUTLIER'],
        },
      ]),
    );
    expect(profileMatch.references.some((id) => badCandidates.has(id))).toBe(false);
    expect(trusted).not.toBeNull();
    expect(trusted?.fieldTruth.fat_percent).toMatchObject({ value: 0.5, state: 'VERIFIED' });
    expect(trusted?.fieldTruth.protein_percent).toMatchObject({ value: 8, state: 'VERIFIED' });
    expect(trusted?.fieldTruth.carbohydrate_percent).toMatchObject({
      value: 3.5,
      state: 'VERIFIED',
    });
    expect(trusted?.fieldTruth.total_sugars_percent).toMatchObject({
      value: 3.5,
      state: 'VERIFIED',
    });
    expect(trusted?.fieldTruth.total_solids_percent?.value).not.toBe(10);
    expect(trusted?.fieldTruth.total_solids_percent?.algorithmVersion).toBe(
      'mapper-field-rescue-v1',
    );
    expect(trusted?.fieldTruth.water_percent?.basis).toBe('derived');
    expect(trusted?.fieldTruth.pod_value).toBeUndefined();
    expect(trusted?.fieldTruth.pac_value).toBeUndefined();
    for (const field of [
      'sucrose_percent',
      'dextrose_percent',
      'glucose_percent',
      'fructose_percent',
    ] as const) {
      expect(trusted?.fieldTruth[field]).toMatchObject({
        value: 0,
        state: 'ESTIMATED',
        basis: 'mapper_similar_profile',
        confidence: 0.9,
        algorithmVersion: 'mapper-sugar-spectrum-share-rescue-v1',
      });
    }
    expect(trusted?.fieldTruth.lactose_percent).toMatchObject({
      value: 3.5,
      state: 'ESTIMATED',
      basis: 'mapper_similar_profile',
      confidence: 0.9,
      algorithmVersion: 'mapper-sugar-spectrum-share-rescue-v1',
    });
    expect(trusted?.fieldTruth.polyol_percent).toBeUndefined();
    expect(trusted?.sweetnessPath).toMatchObject({ kind: 'sugar_spectrum', resolved: true });
    expect(trusted?.engineUsable).toBe(true);
    expect(trusted?.criticalPhysicsBlockers).not.toContain(
      'UNRESOLVED_SWEETENING_FREEZING_PATH',
    );
    if (!trusted) throw new Error('exact Hacendado profile was not resolved');
    const engineItem: EffectiveRecipeItem = {
      id: 'ean-8480000510716',
      ingredient: {
        id: 'ean-8480000510716',
        name: 'Queso fresco batido desnatado 0% MG Hacendado',
        category: 'dairy',
        composition: {
          water_percent: trusted.fieldTruth.water_percent?.value ?? 0,
          solids_percent: trusted.fieldTruth.total_solids_percent?.value ?? 0,
          fat_percent: trusted.fieldTruth.fat_percent?.value ?? 0,
          protein_percent: trusted.fieldTruth.protein_percent?.value ?? 0,
          carbohydrate_percent: trusted.fieldTruth.carbohydrate_percent?.value ?? 0,
          sugar_percent: trusted.fieldTruth.total_sugars_percent?.value ?? 0,
          sucrose_percent: trusted.fieldTruth.sucrose_percent?.value ?? 0,
          dextrose_percent: trusted.fieldTruth.dextrose_percent?.value ?? 0,
          glucose_percent: trusted.fieldTruth.glucose_percent?.value ?? 0,
          fructose_percent: trusted.fieldTruth.fructose_percent?.value ?? 0,
          lactose_percent: trusted.fieldTruth.lactose_percent?.value ?? 0,
          polyol_percent: trusted.fieldTruth.polyol_percent?.value ?? 0,
          fiber_percent: trusted.fieldTruth.fiber_percent?.value ?? 0,
          salt_percent: trusted.fieldTruth.salt_percent?.value ?? 0,
          alcohol_percent: trusted.fieldTruth.alcohol_percent?.value ?? 0,
          kcal_per_100g: trusted.fieldTruth.kcal_per_100g?.value ?? 0,
        },
        pod_value: null,
        pac_value: null,
        de_value: null,
        cost_per_kg: null,
        confidence_score: 90,
        source_type: 'ai_estimated',
        is_verified: false,
      },
      planned_grams: 100,
      actual_grams: null,
      lock_type: 'unlocked',
      effective_grams: 100,
      difference: 0,
      is_actual: false,
    };
    expect(ingredientPodContribution(engineItem)).toBeCloseTo(0.56, 9);
    expect(ingredientPacContribution(engineItem)).toBeCloseTo(3.5, 9);
    expect(ingredientNpacContribution(engineItem)).toBeCloseTo(4.67, 9);
  });
});
