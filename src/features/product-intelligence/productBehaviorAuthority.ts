import { PROFILE_MATCH_FLOOR, profileDonor, type ProfileMatch } from './mapperValueInference.ts';
import type {
  ProductIntendedUsageRole,
  ProductSemanticClassification,
} from './productRecognition.ts';

export const PRODUCT_BEHAVIOR_AUTHORITY = 'PRODUCT_BEHAVIOR_V1' as const;

export type ProductBehaviorClassificationOutcome =
  | 'classified'
  | 'unknown_requires_review'
  | 'blocked';

export interface ProspectiveProductBehaviorAuthority {
  classificationOutcome: ProductBehaviorClassificationOutcome;
  baseRecipeEligible: boolean;
  toppingEligible: boolean;
  intendedUsageRole: ProductIntendedUsageRole;
  dosageInterpretation: ProductSemanticClassification['dosage'] | null;
  referenceMapperIngredientId: string | null;
  classificationReasonCodes: string[];
}

export interface MapperProductBehaviorAuthorityRow {
  id: string;
  mapper_ingredient_id: string;
  mapper_dataset_version: string;
  taxonomy_version_id: string;
  family_id: string | null;
  subfamily_id: string | null;
  form_id: string | null;
  main_eligibility: string;
  vegan_eligibility: string;
  protein_behavior: string;
  approved_liquid_dairy_carrier: boolean;
  profile_permissions: Record<string, unknown>;
  process_behavior: Record<string, unknown>;
  classifier_version: string;
  behavior_role: string;
  main_policy_status: string;
  profile_applicability: Record<string, unknown>;
  classification_reason_codes: string[];
  is_current: boolean;
}

export interface TrustedProductBehaviorAuthority {
  authority: typeof PRODUCT_BEHAVIOR_AUTHORITY;
  validationMode: 'server_recomputed_product_behavior';
  articleIdentity: 'PRODUCT_OWNED';
  classificationOutcome: ProductBehaviorClassificationOutcome;
  baseRecipeEligible: boolean;
  toppingEligible: boolean;
  intendedUsageRole: ProductIntendedUsageRole;
  dosageInterpretation: ProductSemanticClassification['dosage'] | null;
  /** Audit/reference knowledge only. The canonical binding column stays null. */
  referenceMapperIngredientId: string | null;
  runtimeMapperIngredientId: null;
  mapperBehaviorBindingId: string | null;
  mapperBehaviorClassifierVersion: string | null;
  mapperDatasetVersion: string | null;
  taxonomyVersionId: string;
  familyId: string | null;
  subfamilyId: string | null;
  formId: string | null;
  mainEligibility: string;
  veganEligibility: string;
  proteinBehavior: string;
  approvedLiquidDairyCarrier: boolean;
  profilePermissions: Record<string, unknown>;
  processBehavior: Record<string, unknown>;
  behaviorRole: string;
  mainPolicyStatus: string;
  profileApplicability: Record<string, unknown>;
  classificationReasonCodes: string[];
  mapperFingerprint: string;
  behaviorFingerprint: string;
}

export interface ProductBehaviorProductProfile {
  engineUsable: boolean;
  /** Product-owned physics blockers produced by the shared PR/PM completion
   * authority. Their presence proves that a profile exists even when it must
   * remain fail-closed for Engine use. */
  criticalPhysicsBlockers?: readonly string[];
  evidence: { kind: 'normal_food' | 'technical' };
  profileReferenceMapperIngredientId: string | null;
  mapperFingerprint: string;
  /** Server-recomputed Recognition V2 semantics. Optional only for historical
   * product versions, which retain their previous BASE_ONLY behavior. */
  recognition?: ProductSemanticClassification | null;
}

const REVIEW_REASON = 'family_and_form_evidence_missing';
const MODULE_REASON = 'module_permission_missing';
const TECHNICAL_REASON = 'technical_or_dosage_product';

const verifiedPrefix = (value: string | null | undefined): boolean =>
  value?.trim().toLocaleLowerCase('en-US').startsWith('verified') === true;

/** Read-only pre-ingest classification. It promises only that the selected
 * immutable Mapper profile is eligible to serve as semantic evidence. The
 * server repeats this decision against the current behavior binding. */
export function classifyProspectiveProductBehavior(input: {
  kind: 'normal_food' | 'technical';
  engineUsable: boolean;
  profileMatch: ProfileMatch | null;
  recognition?: ProductSemanticClassification | null;
  criticalPhysicsBlockers?: readonly string[];
}): ProspectiveProductBehaviorAuthority {
  const intendedUsageRole = input.recognition?.intendedUsageRole ?? 'BASE_ONLY';
  const dosageInterpretation = input.recognition?.dosage ?? null;
  const baseRequested =
    intendedUsageRole === 'BASE_ONLY' || intendedUsageRole === 'BASE_AND_TOPPING';
  const toppingRequested =
    intendedUsageRole === 'TOPPING_ONLY' || intendedUsageRole === 'BASE_AND_TOPPING';
  if (!input.engineUsable && baseRequested) {
    const profileReasons = [...new Set(input.criticalPhysicsBlockers ?? [])];
    return {
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes:
        profileReasons.length > 0 ? profileReasons : ['product_owned_profile_incomplete'],
    };
  }
  if (
    input.recognition?.isTechnicalProduct === true ||
    (!input.recognition && input.kind === 'technical')
  ) {
    return {
      classificationOutcome: 'blocked',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: [TECHNICAL_REASON],
    };
  }
  if (input.recognition?.modelRequired === true) {
    return {
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: ['product_semantics_unresolved'],
    };
  }
  if (intendedUsageRole === 'NEITHER_REVIEW') {
    return {
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: ['product_role_unresolved'],
    };
  }
  // A resolved, ordinary topping is judged on topping semantics. It does not
  // need a base formulation profile, water/solids or a technical dosage merely
  // to be used as a solid inclusion/decorative component.
  if (
    intendedUsageRole === 'TOPPING_ONLY' &&
    input.kind === 'normal_food' &&
    input.recognition &&
    input.recognition.isTechnicalProduct === false &&
    input.recognition.physicalForm !== 'UNKNOWN'
  ) {
    return {
      classificationOutcome: 'classified',
      baseRecipeEligible: false,
      toppingEligible: true,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: [],
    };
  }
  const match = input.profileMatch;
  if (
    !match ||
    match.confidence < PROFILE_MATCH_FLOOR ||
    match.rejected !== null ||
    match.basis === 'none'
  ) {
    return {
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: [REVIEW_REASON],
    };
  }
  const reference = profileDonor(match);
  if (!reference) {
    return {
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: [REVIEW_REASON],
    };
  }
  if (
    reference.is_active === false ||
    (baseRequested && reference.approved_for_base !== true) ||
    (baseRequested && reference.approved_for_engines !== true) ||
    !verifiedPrefix(reference.verification_status)
  ) {
    return {
      classificationOutcome: 'unknown_requires_review',
      baseRecipeEligible: false,
      toppingEligible: false,
      intendedUsageRole,
      dosageInterpretation,
      referenceMapperIngredientId: null,
      classificationReasonCodes: [MODULE_REASON],
    };
  }
  return {
    classificationOutcome: 'classified',
    baseRecipeEligible: baseRequested,
    toppingEligible: toppingRequested,
    intendedUsageRole,
    dosageInterpretation,
    referenceMapperIngredientId: reference.ingredient_id,
    classificationReasonCodes: [],
  };
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const fingerprint = (value: unknown): string => {
  const serialized = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `product-behavior-v1-${hash.toString(16).padStart(8, '0')}`;
};

const restrictedPermissions = (source: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...source,
  BASE_RECIPE: false,
  TOPPING: false,
  MAIN: false,
  OPTIMAL: false,
  ECO: false,
  SUBSTITUTION: false,
  MONITOR: false,
  PRODUCTION: false,
  SAVE: false,
});

function unresolvedAuthority(input: {
  profile: ProductBehaviorProductProfile;
  outcome: Exclude<ProductBehaviorClassificationOutcome, 'classified'>;
  reasons: string[];
  reference?: MapperProductBehaviorAuthorityRow | null;
}): TrustedProductBehaviorAuthority {
  const reference = input.reference ?? null;
  const intendedUsageRole = input.profile.recognition?.intendedUsageRole ?? 'BASE_ONLY';
  const result = {
    authority: PRODUCT_BEHAVIOR_AUTHORITY,
    validationMode: 'server_recomputed_product_behavior' as const,
    articleIdentity: 'PRODUCT_OWNED' as const,
    classificationOutcome: input.outcome,
    baseRecipeEligible: false,
    toppingEligible: false,
    intendedUsageRole,
    dosageInterpretation: input.profile.recognition?.dosage ?? null,
    referenceMapperIngredientId: reference?.mapper_ingredient_id ?? null,
    runtimeMapperIngredientId: null,
    mapperBehaviorBindingId: reference?.id ?? null,
    mapperBehaviorClassifierVersion: reference?.classifier_version ?? null,
    mapperDatasetVersion: reference?.mapper_dataset_version ?? null,
    taxonomyVersionId: reference?.taxonomy_version_id ?? 'pinguino-product-taxonomy-v1',
    familyId: reference?.family_id ?? null,
    subfamilyId: reference?.subfamily_id ?? null,
    formId: reference?.form_id ?? null,
    mainEligibility: reference?.main_eligibility ?? 'MAIN_BLOCKED_POLICY',
    veganEligibility: reference?.vegan_eligibility ?? 'unknown',
    proteinBehavior: reference?.protein_behavior ?? 'unknown',
    approvedLiquidDairyCarrier: false,
    profilePermissions: restrictedPermissions(reference?.profile_permissions),
    processBehavior: reference ? structuredClone(reference.process_behavior) : {},
    behaviorRole: reference?.behavior_role ?? 'UNKNOWN_REQUIRES_EVIDENCE',
    mainPolicyStatus: reference?.main_policy_status ?? 'BLOCKED_DATA',
    profileApplicability: reference ? structuredClone(reference.profile_applicability) : {},
    classificationReasonCodes: [...input.reasons],
    mapperFingerprint: input.profile.mapperFingerprint,
    behaviorFingerprint: '',
  };
  result.behaviorFingerprint = fingerprint(result);
  return result;
}

/** Server-only final authority. It copies taxonomy/process semantics from the
 * current Mapper behavior binding but explicitly publishes no runtime Mapper
 * identity and no numerical composition. */
export function validateProductBehaviorAuthority(input: {
  productProfile: ProductBehaviorProductProfile;
  behaviorRows: readonly MapperProductBehaviorAuthorityRow[];
}): TrustedProductBehaviorAuthority {
  const profile = input.productProfile;
  const recognition = profile.recognition ?? null;
  const intendedUsageRole = recognition?.intendedUsageRole ?? 'BASE_ONLY';
  const baseRequested =
    intendedUsageRole === 'BASE_ONLY' || intendedUsageRole === 'BASE_AND_TOPPING';
  const toppingRequested =
    intendedUsageRole === 'TOPPING_ONLY' || intendedUsageRole === 'BASE_AND_TOPPING';
  if (!profile.engineUsable && baseRequested) {
    const profileReasons = [
      ...new Set(
        (profile.criticalPhysicsBlockers ?? []).filter((reason) => reason.trim().length > 0),
      ),
    ];
    return unresolvedAuthority({
      profile,
      outcome: 'unknown_requires_review',
      reasons: profileReasons.length > 0 ? profileReasons : ['product_owned_profile_incomplete'],
    });
  }
  if (
    recognition?.isTechnicalProduct === true ||
    (!recognition && profile.evidence.kind === 'technical')
  ) {
    return unresolvedAuthority({
      profile,
      outcome: 'blocked',
      reasons: [TECHNICAL_REASON],
    });
  }
  if (recognition?.modelRequired === true) {
    return unresolvedAuthority({
      profile,
      outcome: 'unknown_requires_review',
      reasons: ['product_semantics_unresolved'],
    });
  }
  if (intendedUsageRole === 'NEITHER_REVIEW') {
    return unresolvedAuthority({
      profile,
      outcome: 'unknown_requires_review',
      reasons: ['product_role_unresolved'],
    });
  }
  const referenceId = profile.profileReferenceMapperIngredientId;
  if (!referenceId) {
    return unresolvedAuthority({
      profile,
      outcome: 'unknown_requires_review',
      reasons: [REVIEW_REASON],
    });
  }
  const references = input.behaviorRows.filter(
    (row) => row.is_current && row.mapper_ingredient_id === referenceId,
  );
  if (references.length !== 1) {
    return unresolvedAuthority({
      profile,
      outcome: 'unknown_requires_review',
      reasons: [references.length > 1 ? 'ambiguous_mapper_identity' : REVIEW_REASON],
    });
  }
  const reference = references[0]!;
  if (baseRequested && reference.profile_permissions.BASE_RECIPE !== true) {
    return unresolvedAuthority({
      profile,
      outcome: 'unknown_requires_review',
      reasons:
        reference.classification_reason_codes.length > 0
          ? [...reference.classification_reason_codes]
          : [MODULE_REASON],
      reference,
    });
  }

  const result: TrustedProductBehaviorAuthority = {
    authority: PRODUCT_BEHAVIOR_AUTHORITY,
    validationMode: 'server_recomputed_product_behavior',
    articleIdentity: 'PRODUCT_OWNED',
    classificationOutcome: 'classified',
    baseRecipeEligible: baseRequested,
    toppingEligible: toppingRequested,
    intendedUsageRole,
    dosageInterpretation: recognition?.dosage ?? null,
    referenceMapperIngredientId: reference.mapper_ingredient_id,
    runtimeMapperIngredientId: null,
    mapperBehaviorBindingId: reference.id,
    mapperBehaviorClassifierVersion: reference.classifier_version,
    mapperDatasetVersion: reference.mapper_dataset_version,
    taxonomyVersionId: reference.taxonomy_version_id,
    familyId: reference.family_id,
    subfamilyId: reference.subfamily_id,
    formId: reference.form_id,
    mainEligibility: reference.main_eligibility,
    veganEligibility: reference.vegan_eligibility,
    proteinBehavior: reference.protein_behavior,
    approvedLiquidDairyCarrier: reference.approved_liquid_dairy_carrier,
    profilePermissions: {
      ...structuredClone(reference.profile_permissions),
      BASE_RECIPE: baseRequested,
      TOPPING: toppingRequested,
    },
    processBehavior: structuredClone(reference.process_behavior),
    behaviorRole: reference.behavior_role,
    mainPolicyStatus: reference.main_policy_status,
    profileApplicability: structuredClone(reference.profile_applicability),
    classificationReasonCodes: [...reference.classification_reason_codes],
    mapperFingerprint: profile.mapperFingerprint,
    behaviorFingerprint: '',
  };
  result.behaviorFingerprint = fingerprint(result);
  return result;
}
