import { describe, expect, it } from 'vitest';
import type { ProfileMatch } from './mapperValueInference';
import {
  classifyProspectiveProductBehavior,
  validateProductBehaviorAuthority,
  type MapperProductBehaviorAuthorityRow,
} from './productBehaviorAuthority';
import type { IntimportTrustedProductProfile } from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';
import { classifyProductSemantics } from './productRecognition';

const variegatoRecognition = classifyProductSemantics({
  name: 'Variegato pistacchio',
  brand: 'Comprital',
  manufacturer: 'Comprital',
  manufacturerCode: 'V1',
  gtin: null,
  productType: 'professional',
  category: 'Professional gelato products',
  subcategory: 'Variegato',
  variant: null,
  ingredients: null,
  nutrition: null,
  description: 'Do przekładania i dekoracji lodów.',
  dosage: 'q.b.',
  technicalParameters: null,
  sourceUrls: [],
});

const unresolvedFormRecognition = classifyProductSemantics({
  name: 'Czekolada bez informacji o formie',
  brand: 'Test',
  manufacturer: 'Test',
  manufacturerCode: null,
  gtin: null,
  productType: null,
  category: 'Chocolate',
  subcategory: null,
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
});

const behaviorRow = (
  overrides: Partial<MapperProductBehaviorAuthorityRow> = {},
): MapperProductBehaviorAuthorityRow => ({
  id: '00000000-0000-4000-8000-000000000123',
  mapper_ingredient_id: 'PI-ING-000123',
  mapper_dataset_version: 'v1.0',
  taxonomy_version_id: 'pinguino-product-taxonomy-v1',
  family_id: 'dairy',
  subfamily_id: 'milk',
  form_id: 'liquid',
  main_eligibility: 'STANDARD_ONLY',
  vegan_eligibility: 'false',
  protein_behavior: 'neutral',
  approved_liquid_dairy_carrier: true,
  profile_permissions: {
    BASE_RECIPE: true,
    SUBSTITUTION: true,
    MONITOR: true,
    PRODUCTION: true,
    SAVE: true,
  },
  process_behavior: { decision: 'COLD_OR_HEAT' },
  classifier_version: 'mapper-product-classifier-v2:test',
  behavior_role: 'STANDARD_ONLY',
  main_policy_status: 'NOT_APPLICABLE',
  profile_applicability: { all_existing_profiles: 'standard_where_mapper_approved' },
  classification_reason_codes: ['standard_product_not_flavour_main'],
  is_current: true,
  ...overrides,
});

const productProfile = (
  overrides: Partial<IntimportTrustedProductProfile> = {},
): IntimportTrustedProductProfile => ({
  authority: 'PRODUCT_PROFILE_V1',
  validationMode: 'server_recomputed_product_profile',
  articleIdentity: 'PRODUCT_OWNED',
  origin: 'PR',
  productAccuracy: 92,
  evidence: {
    kind: 'normal_food',
    fields: { identity: 'source_file', ingredients: 'source_file' },
    validatedBarcode: false,
    exactCanonicalMatch: false,
    mapperFamilyMatch: true,
    materialConflicts: [],
  },
  evidenceProvenance: {},
  carbonation: { status: 'UNKNOWN', evidence: [], decision: 'NO_EXACT_ASSERTION' },
  readiness: 'ESTIMATED_READY',
  engineUsable: true,
  criticalReadiness: true,
  missingCritical: [],
  missingEngineFields: [],
  allergenEvidenceStatus: 'CONFIRMED',
  ingredientsEvidenceStatus: 'CONFIRMED',
  technicalComposition: {
    water: 88,
    totalSolids: 12,
    fat: 3.2,
    protein: 3.3,
    carbohydrate: 4.7,
    sugars: 4.7,
    salt: 0.1,
  },
  fieldTruth: {},
  estimatedFromMapperIds: ['PI-ING-000123'],
  profileReferenceMapperIngredientId: 'PI-ING-000123',
  mapperSimilarity: 0.94,
  mapperProfileBasis: 'commodity_name',
  mapperFingerprint: 'runtime-2088-deadbeef',
  recognition: null,
  ...overrides,
});

const profileMatch = (overrides: Partial<ProfileMatch> = {}): ProfileMatch => ({
  confidence: 0.94,
  basis: 'commodity_name',
  rows: [
    {
      ingredient_id: 'PI-ING-000123',
      ingredient_name_internal: 'milk',
      approved_for_base: true,
      approved_for_engines: true,
      verification_status: 'Verified / Public Label',
      water_percent: 88,
      total_solids_percent: 12,
      fat_percent: 3.2,
      protein_percent: 3.3,
      carbohydrate_percent: 4.7,
      total_sugars_percent: 4.7,
      sucrose_percent: 0,
      dextrose_percent: 0,
      glucose_percent: 0,
      fructose_percent: 0,
      lactose_percent: 4.7,
      polyol_percent: 0,
      fiber_percent: 0,
      salt_percent: 0.1,
      alcohol_percent: 0,
      kcal_per_100g: 60,
      pod_value: 16,
      pac_value: 10,
      sweetness_factor: null,
      freezing_factor: null,
    },
  ],
  references: ['PI-ING-000123'],
  family: 'dairy_liquid',
  reasons: [],
  rejected: null,
  candidatesBeforeFilter: ['PI-ING-000123'],
  candidatesAfterFilter: ['PI-ING-000123'],
  rejectedCandidates: [],
  ...overrides,
});

describe('prospective ProductBehavior authority', () => {
  it('publishes one topping role contract for a manufacturer-confirmed variegato', () => {
    expect(classifyProspectiveProductBehavior({
      kind: 'normal_food',
      engineUsable: true,
      profileMatch: profileMatch(),
      recognition: variegatoRecognition,
    })).toMatchObject({
      classificationOutcome: 'classified',
      intendedUsageRole: 'TOPPING_ONLY',
      baseRecipeEligible: false,
      toppingEligible: true,
    });
  });

  it('accepts normal food only when the frozen whole-profile reference is eligible', () => {
    expect(
      classifyProspectiveProductBehavior({
        kind: 'normal_food',
        engineUsable: true,
        profileMatch: profileMatch(),
      }),
    ).toMatchObject({
      classificationOutcome: 'classified',
      baseRecipeEligible: true,
      referenceMapperIngredientId: 'PI-ING-000123',
      classificationReasonCodes: [],
    });
  });

  it('keeps complete physics blocked from Engine when behavior evidence is insufficient', () => {
    expect(
      classifyProspectiveProductBehavior({
        kind: 'normal_food',
        engineUsable: true,
        profileMatch: null,
      }),
    ).toEqual({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole: 'BASE_ONLY',
      referenceMapperIngredientId: null,
      classificationReasonCodes: ['family_and_form_evidence_missing'],
    });
  });

  it('does not classify an otherwise complete product while required semantics remain unresolved', () => {
    expect(unresolvedFormRecognition.modelRequired).toBe(true);
    expect(classifyProspectiveProductBehavior({
      kind: 'normal_food',
      engineUsable: true,
      profileMatch: profileMatch(),
      recognition: unresolvedFormRecognition,
    })).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      classificationReasonCodes: ['product_semantics_unresolved'],
    });
  });

  it('keeps technical/high-risk products fail-closed at ProductBehavior without changing physics', () => {
    expect(
      classifyProspectiveProductBehavior({
        kind: 'technical',
        engineUsable: true,
        profileMatch: profileMatch(),
      }),
    ).toMatchObject({
      classificationOutcome: 'blocked',
      baseRecipeEligible: false,
      referenceMapperIngredientId: null,
      classificationReasonCodes: ['technical_or_dosage_product'],
    });
  });
});

describe('server-owned immutable ProductBehavior authority', () => {
  it('keeps the same topping-only role at the server authority boundary', () => {
    const authority = validateProductBehaviorAuthority({
      productProfile: productProfile({ recognition: variegatoRecognition }),
      behaviorRows: [behaviorRow()],
    });
    expect(authority).toMatchObject({
      classificationOutcome: 'classified',
      intendedUsageRole: 'TOPPING_ONLY',
      baseRecipeEligible: false,
      toppingEligible: true,
      runtimeMapperIngredientId: null,
    });
    expect(authority.profilePermissions).toMatchObject({ BASE_RECIPE: false, TOPPING: true });
  });

  it('copies semantic behavior only and keeps Mapper out of runtime identity/composition', () => {
    const authority = validateProductBehaviorAuthority({
      productProfile: productProfile(),
      behaviorRows: [behaviorRow()],
    });

    expect(authority).toMatchObject({
      authority: 'PRODUCT_BEHAVIOR_V1',
      validationMode: 'server_recomputed_product_behavior',
      articleIdentity: 'PRODUCT_OWNED',
      classificationOutcome: 'classified',
      baseRecipeEligible: true,
      referenceMapperIngredientId: 'PI-ING-000123',
      runtimeMapperIngredientId: null,
      familyId: 'dairy',
      formId: 'liquid',
      behaviorRole: 'STANDARD_ONLY',
    });
    expect(authority).not.toHaveProperty('technicalComposition');
    expect(authority?.profilePermissions.BASE_RECIPE).toBe(true);
  });

  it('does not silently route complete PR physics through Mapper when behavior is missing', () => {
    const authority = validateProductBehaviorAuthority({
      productProfile: productProfile({ profileReferenceMapperIngredientId: null }),
      behaviorRows: [behaviorRow()],
    });

    expect(authority).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      referenceMapperIngredientId: null,
      runtimeMapperIngredientId: null,
      classificationReasonCodes: ['family_and_form_evidence_missing'],
    });
  });

  it('repeats the unresolved-semantics gate at the server authority boundary', () => {
    const authority = validateProductBehaviorAuthority({
      productProfile: productProfile({ recognition: unresolvedFormRecognition }),
      behaviorRows: [behaviorRow()],
    });
    expect(authority).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      classificationReasonCodes: ['product_semantics_unresolved'],
    });
  });

  it('refuses a non-current or Base-denied semantic reference', () => {
    const authority = validateProductBehaviorAuthority({
      productProfile: productProfile(),
      behaviorRows: [
        behaviorRow({
          profile_permissions: { BASE_RECIPE: false },
          classification_reason_codes: ['module_permission_missing'],
        }),
      ],
    });
    expect(authority).toMatchObject({
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      classificationReasonCodes: ['module_permission_missing'],
    });
  });
});
