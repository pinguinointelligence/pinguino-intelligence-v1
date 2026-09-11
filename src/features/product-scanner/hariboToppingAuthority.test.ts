import { describe, expect, it } from 'vitest';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';
import {
  finalizeProductProductionAccuracy,
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
  type IntimportTrustedProductProfile,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import {
  productSemanticEvidenceFromScanResult,
  scanResultFromLookupFacts,
} from '../../../supabase/functions/_shared/productScanner';
import { scanAssessmentSnapshot } from '../../../supabase/functions/_shared/scanAssessment';
import { loadMapperKnowledgeRows } from '../product-intelligence/__dryrun__/mapperFixture';
import {
  supportsSemanticBehaviorReference,
  validateProductBehaviorAuthority,
} from '../product-intelligence/productBehaviorAuthority';
import { classifyProductSemantics } from '../product-intelligence/productRecognition';
import { classifyRemainingGaps, manualFieldsFor } from '../scan-flow/scanFlowLogic';

const EAN = '8426617014254';
const SESSION = '2e04eeb5-0b9d-4cd1-b1f3-3a4cb73860be';
const URL = `https://world.openfoodfacts.org/product/${EAN}`;

const fact = (field: string, value: string) => ({
  field,
  value,
  sourceUrl: URL,
  sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
  sourceTitle: 'Sandía · Haribo · 90 g',
  sourceStatedEan: EAN,
  sourceEanConfirmationMethod: 'page_text',
  sourceEanConfirmedAt: '2026-09-11T00:00:00.000Z',
});

function exactHariboScan(): Record<string, unknown> {
  const scan = scanResultFromLookupFacts([
    fact('productName', 'Sandía'),
    fact('brand', 'Haribo'),
    fact('productCategory', 'Candies, Fruit gums'),
    fact('productDescription', 'Watermelon fruit gummy candy.'),
    fact('netQuantity', '90 g'),
    fact(
      'ingredients',
      'Jarabe de glucosa, azúcar, gelatina, dextrosa, acidulante: ácido cítrico, aceite de girasol, aromas.',
    ),
    fact('nutritionBasis', 'por 100 g'),
    fact('energyKcal', '339 kcal'),
    fact('fat', '0,5 g'),
    fact('carbohydrate', '83 g'),
    fact('sugars', '57 g'),
    fact('protein', '3,6 g'),
    fact('salt', '0,16 g'),
  ]);
  if (!scan) throw new Error('exact Haribo internet evidence did not build a scan result');
  scan.barcodes = [{ value: EAN, format: 'EAN_13' }];
  return scan;
}

function trustedHariboProfile(): {
  scan: Record<string, unknown>;
  profile: IntimportTrustedProductProfile;
} {
  const scan = exactHariboScan();
  const recognitionEvidence = productSemanticEvidenceFromScanResult(scan);
  const recognition = classifyProductSemantics(recognitionEvidence);
  const proposal = customerProductProfileProposal({
    scanResult: scan,
    recognitionEvidence,
    recognition,
  });
  if (!proposal) throw new Error('exact Haribo evidence did not build a product proposal');
  const { rows } = loadMapperKnowledgeRows();
  const profile = validateIntimportProductProfileProposal({
    origin: 'CUSTOMER_ADDED',
    proposedMapperIngredientId: null,
    ...proposal,
    rows: rows as unknown as IntimportMapperAuthorityRow[],
  });
  if (!profile) throw new Error('exact Haribo proposal was rejected');
  return { scan, profile };
}

describe('Haribo Sandía exact-EAN topping semantic authority', () => {
  it('HBR-TOP-01 carries exact deterministic topping semantics without a numeric Mapper donor', async () => {
    const { scan, profile } = trustedHariboProfile();
    const recognition = profile.recognition;
    const behavior = validateProductBehaviorAuthority({
      productProfile: profile,
      behaviorRows: [],
    });
    const finalized = finalizeProductProductionAccuracy(profile, behavior);
    const assessment = await scanAssessmentSnapshot({
      sessionId: SESSION,
      barcode: EAN,
      result: scan,
      confirmedFields: [],
      recognition: recognition as unknown as Record<string, unknown>,
      recognitionCarriedForward: supportsSemanticBehaviorReference(recognition),
      behavior: behavior as unknown as Record<string, unknown>,
      profile: finalized as unknown as Record<string, unknown>,
    });

    expect(SESSION).toBe('2e04eeb5-0b9d-4cd1-b1f3-3a4cb73860be');
    expect(scan).toMatchObject({
      identity: { displayName: 'Sandía', brand: 'Haribo' },
      package: { netQuantity: 90, unit: 'g' },
      nutrition: {
        basis: 'per_100g',
        energyKcal: 339,
        fat: 0.5,
        carbohydrate: 83,
        sugars: 57,
        protein: 3.6,
        salt: 0.16,
      },
    });
    expect(recognition).toMatchObject({
      classificationSource: 'DETERMINISTIC',
      productArchetype: 'CONFECTIONERY',
      ingredientFamily: 'confectionery',
      physicalForm: 'SOLID',
      intendedUsageRole: 'TOPPING_ONLY',
      flavorDomain: 'FRUIT',
      confidence: 0.95,
      modelRequired: false,
    });
    expect(profile.evidence).toMatchObject({
      validatedBarcode: true,
      exactCanonicalMatch: false,
      materialConflicts: [],
      fields: {
        identity: 'barcode_registry',
        barcode: 'label',
        ingredients: 'barcode_registry',
      },
    });
    expect(profile.profileReferenceMapperIngredientId).toBeNull();
    expect(profile.profileReferenceAuthority).toBe('RECOGNITION_SEMANTIC_AUTHORITY');
    expect(profile.estimatedFromMapperIds).toEqual([]);
    expect(profile.productAccuracyAssessment).toMatchObject({
      roleReadiness: 'TOPPING_READY',
      baseEngineReady: false,
      criticalBlockers: [],
    });
    expect(profile.fieldTruth).toMatchObject({
      carbohydrate_percent: { value: 83, state: 'VERIFIED' },
      total_sugars_percent: { value: 57, state: 'VERIFIED' },
      fat_percent: { value: 0.5, state: 'VERIFIED' },
      protein_percent: { value: 3.6, state: 'VERIFIED' },
      salt_percent: { value: 0.16, state: 'VERIFIED' },
      kcal_per_100g: { value: 339, state: 'VERIFIED' },
    });
    for (const field of [
      'water_percent',
      'total_solids_percent',
      'pod_value',
      'pac_value',
    ] as const) {
      expect(profile.fieldTruth[field]).toBeUndefined();
    }
    expect(profile.engineUsable).toBe(false);
    expect(behavior).toMatchObject({
      classificationOutcome: 'classified',
      familyId: 'inclusion',
      formId: 'solid',
      intendedUsageRole: 'TOPPING_ONLY',
      baseRecipeEligible: false,
      toppingEligible: true,
      referenceMapperIngredientId: null,
      runtimeMapperIngredientId: null,
      mapperBehaviorBindingId: null,
      mainEligibility: 'TOPPING_ONLY',
      behaviorRole: 'TOPPING_ONLY',
      classificationReasonCodes: [],
    });
    expect(behavior.profilePermissions).toMatchObject({ BASE_RECIPE: false, TOPPING: true });
    expect(finalized.productAccuracyAssessment).toMatchObject({
      roleReadiness: 'TOPPING_READY',
      baseEngineReady: false,
      criticalBlockers: [],
      gellattiReadiness: { ready: true },
    });
    expect(assessment).toMatchObject({
      classificationCarriedForward: true,
      mapperDonorId: null,
      productionReady: true,
      roleReadiness: 'TOPPING_READY',
      engineUsable: false,
      criticalGaps: [],
    });
    expect(assessment.criticalGaps).not.toContain('family_and_form_evidence_missing');
    expect(classifyRemainingGaps(assessment.criticalGaps).photoSolvable).toEqual([]);
    expect(manualFieldsFor(assessment.criticalGaps)).toEqual([]);
  });

  it('HBR-TOP-02 keeps insufficient Recognition fail-closed despite exact identity', () => {
    const { profile } = trustedHariboProfile();
    profile.recognition = profile.recognition
      ? { ...profile.recognition, confidence: 0.8, classificationSource: 'SERVER_MODEL' }
      : null;
    const behavior = validateProductBehaviorAuthority({
      productProfile: profile,
      behaviorRows: [],
    });

    expect(supportsSemanticBehaviorReference(profile.recognition)).toBe(false);
    expect(behavior).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      classificationReasonCodes: ['family_and_form_evidence_missing'],
    });
  });

  it('HBR-TOP-03 never grants Base readiness to an incomplete BASE_ONLY profile with no donor', () => {
    const { profile } = trustedHariboProfile();
    profile.recognition = profile.recognition
      ? {
          ...profile.recognition,
          productArchetype: 'NORMAL_INGREDIENT',
          ingredientFamily: 'base_mix',
          physicalForm: 'POWDER',
          intendedUsageRole: 'BASE_ONLY',
          compatibleMapperCategories: ['base_mix'],
          confidence: 0.95,
        }
      : null;
    const behavior = validateProductBehaviorAuthority({
      productProfile: profile,
      behaviorRows: [],
    });
    const finalized = finalizeProductProductionAccuracy(profile, behavior);

    expect(profile.engineUsable).toBe(false);
    expect(behavior).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      familyId: 'base_mix',
      formId: 'powder',
      baseRecipeEligible: false,
      toppingEligible: false,
    });
    expect(finalized.productAccuracyAssessment).toMatchObject({
      baseEngineReady: false,
      roleReadiness: 'REVIEW',
      gellattiReadiness: { ready: false },
    });
  });

  it('HBR-TOP-04 rejects a hard role contradiction instead of silently choosing TOPPING_ONLY', () => {
    const { profile } = trustedHariboProfile();
    profile.evidence = {
      ...profile.evidence,
      materialConflicts: ['intendedUsageRole:TOPPING_ONLY_vs_BASE_ONLY'],
    };
    const behavior = validateProductBehaviorAuthority({
      productProfile: profile,
      behaviorRows: [],
    });
    const finalized = finalizeProductProductionAccuracy(profile, behavior);

    expect(behavior).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
    });
    expect(finalized.productAccuracyAssessment).toMatchObject({
      roleReadiness: 'CONFLICT',
      gellattiReadiness: { ready: false },
    });
    expect(finalized.productAccuracyAssessment.criticalBlockers).toContain(
      'MATERIAL_CONFLICT:intendedUsageRole:TOPPING_ONLY_vs_BASE_ONLY',
    );
  });
});
