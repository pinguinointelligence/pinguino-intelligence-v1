import type { ProductCategory } from '@/engine';
import type { RecipeProcessEvidence } from '@/features/education/processClassification';

/** Product-layer modules which are allowed to ask what a product may do. */
export type ProductBehaviorModule =
  | 'SEARCH'
  | 'BASE_RECIPE'
  | 'MAIN'
  | 'OPTIMAL'
  | 'ECO'
  | 'TOPPING'
  | 'SUBSTITUTION'
  | 'COST'
  | 'MONITOR'
  | 'PRODUCTION'
  | 'LABEL'
  | 'NUTRITION'
  | 'ALLERGENS'
  | 'PROCESS'
  | 'SUMMARY'
  | 'BATCH_RESCUE'
  | 'MASTER_LABEL'
  | 'RECIPE_VERSION'
  | 'RESTORE'
  | 'EXPORT'
  | 'SAVE';

export type ProductBehaviorSnapshotState =
  | 'RESOLVED'
  | 'LEGACY_RECONSTRUCTED'
  | 'REVALIDATION_REQUIRED';

export type ProductSourceKind =
  | 'mapper'
  | 'ocr'
  | 'manual'
  | 'catalog_import'
  | 'internal_subproduct'
  | 'future';

export type CatalogVerificationState =
  | 'verified'
  | 'manual_unverified'
  | 'blocked'
  | 'processing';

export type RuntimeEligibilityState =
  | 'eligible'
  | 'label_only'
  | 'blocked'
  | 'unknown';

export type ProductProcessScope = 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
export type ProductRequestedRole = 'STANDARD' | 'MAIN';
export type ProductFormulationMode = 'optimal' | 'eco';

export type ProductBehaviorRole =
  | 'MAIN_ALLOWED'
  | 'MAIN_PROFILE_SPECIFIC'
  | 'STANDARD_ONLY'
  | 'STRUCTURAL_ONLY'
  | 'PROTEIN_CONTRIBUTOR_ONLY'
  | 'TOPPING_ONLY'
  | 'NOT_MAIN'
  | 'UNKNOWN_REQUIRES_EVIDENCE';

export type MainPolicyStatus =
  | 'COVERED'
  | 'NOT_APPLICABLE'
  | 'BLOCKED_DATA'
  | 'BLOCKED_SCIENCE'
  | 'UNKNOWN_REQUIRES_EVIDENCE';

export type ProductPolicyEvidenceStatus =
  | 'PRODUCTION_VALIDATED'
  | 'PINGUINO_CALIBRATED'
  | 'OWNER_PROVISIONAL'
  | 'SOURCE_REFERENCE'
  | 'MAPPER_DERIVED_PROVISIONAL'
  | 'BLOCKED_DATA'
  | 'BLOCKED_SCIENCE'
  // Legacy in-memory registries remain readable during the forward migration.
  | 'owner_provisional'
  | 'verified'
  | 'reference_only';

/** Stable taxonomy ids are data, not a closed TypeScript enum. */
export type ProductFamilyId = string;
export type ProductFormId = string;

export interface ProductVersionRef {
  productId: string;
  productVersionId: string;
  source: ProductSourceKind;
  sourceIdentity: string;
  factsFingerprint: string;
}

export interface ProductTechnicalAuthority {
  kind: 'mapper_exact' | 'verified_profile' | 'approved_pi_calculation' | 'none';
  mapperIngredientId: string | null;
  technicalProfileId: string | null;
  technicalProfileVersion: string | null;
  engineReady: boolean;
  reasons: string[];
}

export interface ProductVerificationAuthority {
  state: CatalogVerificationState;
  method: 'mapper' | 'automatic' | 'human' | 'manual_unverified' | 'blocked' | 'processing';
  provenanceLabel: string;
  evidenceVersion: string | null;
}

export interface MainEnvelopePolicy {
  policyId: string;
  policyVersion: string;
  taxonomyVersion: string;
  familyId: ProductFamilyId;
  subfamilyId: string | null;
  formId: ProductFormId;
  productProfiles: readonly ProductCategory[];
  basis:
    | 'FRUIT_EQUIVALENT'
    | 'NUT_EQUIVALENT'
    | 'COCOA_SOLIDS_EQUIVALENT'
    | 'ETHANOL_PERCENT'
    | 'INFUSION_INPUT_PER_KG'
    | 'PERCENT_OF_BASE';
  ecoFloorPercent: number;
  optimalCeilingPercent: number;
  hardLimitPercent: number;
  mainEquivalentFactor: number;
  requiresLiquidDairyCarrier: boolean;
  liquidDairyCarrierFloorPercent: number | null;
  approvedMixedFamilyIds: readonly string[];
  evidenceStatus: ProductPolicyEvidenceStatus;
  source: string;
  warnings: readonly string[];
}

export interface ProductBehaviorBinding {
  bindingId: string;
  bindingVersion: string;
  taxonomyVersion: string;
  productVersionId: string;
  familyId: ProductFamilyId | null;
  subfamilyId: string | null;
  formId: ProductFormId | null;
  mainClassification:
    | 'MAIN_ALLOWED'
    | 'MAIN_PROFILE_SPECIFIC'
    | 'STANDARD_ONLY'
    | 'PROTEIN_CONTRIBUTOR_ONLY'
    | 'TOPPING_ONLY'
    | 'NOT_MAIN'
    | 'MAIN_BLOCKED_POLICY'
    | 'UNKNOWN';
  mainPolicyId: string | null;
  baseAllowed: boolean;
  toppingAllowed: boolean;
  substitutionAllowed: boolean;
  labelAllowed: boolean;
  costAllowed: boolean;
  veganEligibility: 'verified' | 'false' | 'unknown' | 'conflict';
  proteinBehavior: 'contributor' | 'neutral' | 'unknown';
  processBehavior: 'base' | 'topping' | 'both' | 'blocked';
  approvedLiquidDairyCarrier: boolean;
  classifiedBy: 'server_policy' | 'mapper_binding' | 'human_review' | 'unclassified';
  classifiedAt: string;
  warnings: readonly string[];
  blockReasons: readonly string[];
}

/** Exact payload returned by the server-owned resolver RPC. */
export interface ServerResolvedProductBehavior {
  schemaVersion: 1;
  resolverVersion: string;
  entityKind: 'mapper' | 'catalog_product_version';
  productId: string;
  productVersionId: string;
  factsFingerprint: string;
  catalogStatus: CatalogVerificationState | 'pi_base';
  provenance: string;
  behaviorBindingId: string;
  behaviorBindingVersion: string;
  taxonomyVersion: string;
  mapperIngredientId: string | null;
  familyId: string | null;
  subfamilyId: string | null;
  formId: string | null;
  behaviorRole?: ProductBehaviorRole;
  mainPolicyStatus?: MainPolicyStatus;
  profileApplicability?: Record<string, unknown>;
  classificationReasonCodes?: string[];
  mainEligibility: ProductBehaviorBinding['mainClassification'];
  veganEligibility: ProductBehaviorBinding['veganEligibility'];
  proteinBehavior: ProductBehaviorBinding['proteinBehavior'];
  processBehavior: Record<string, unknown>;
  /** Immutable shared facts for this exact product version. Account-private
   * price/supplier/note/stock data is deliberately excluded. */
  sharedFacts?: SharedProductBehaviorFacts | null;
  /** RLS-protected, request-account overlay. This object is transient and is
   * never copied into ProductBehaviorSnapshot or recipe versions. */
  privateOverlay?: PrivateProductBehaviorOverlay | null;
  approvedLiquidDairyCarrier: boolean;
  context: Record<string, unknown>;
  module: ProductBehaviorModule;
  state: 'eligible' | 'blocked';
  moduleEligibility: Partial<Record<ProductBehaviorModule, RuntimeEligibilityState>>;
  mainPolicy: null | {
    policyId: string;
    policyVersion: string;
    familyId: string | null;
    subfamilyId: string | null;
    formId: string | null;
    basis: MainEnvelopePolicy['basis'];
    ecoFloorPercent: number;
    optimalCeilingPercent: number;
    hardLimitPercent: number;
    mainEquivalentFactor: number;
    requiresLiquidDairyCarrier: boolean;
    liquidDairyCarrierFloorPercent: number | null;
    approvedMixedFamilyIds: string[];
    evidenceStatus: MainEnvelopePolicy['evidenceStatus'];
  };
  warnings: string[];
  blockReasons: string[];
}

export interface ProductBehaviorContext {
  accountId: string | null;
  productProfile: ProductCategory;
  temperatureC: number;
  mode: ProductFormulationMode;
  processScope: ProductProcessScope;
  requestedRole: ProductRequestedRole;
  module: ProductBehaviorModule;
}

export interface ModuleEligibility {
  module: ProductBehaviorModule;
  state: RuntimeEligibilityState;
  reasons: string[];
}

export interface ResolvedProductBehavior {
  schemaVersion: 1;
  product: ProductVersionRef;
  verification: ProductVerificationAuthority;
  technical: ProductTechnicalAuthority;
  binding: ProductBehaviorBinding;
  mainPolicy: MainEnvelopePolicy | null;
  moduleEligibility: Record<ProductBehaviorModule, ModuleEligibility>;
  warnings: string[];
  blockReasons: string[];
  resolverVersion: string;
}

export interface ProductNutritionFactsPer100g {
  basis: 'per_100g';
  energyKcal: number | null;
  fat: number | null;
  saturatedFat: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  protein: number | null;
  salt: number | null;
  fibre: number | null;
}

export interface ProductAllergenFacts {
  ingredientsText: string | null;
  allergensText: string | null;
  declared: string[];
  mayContain: string[];
  evidenceVersion: string | null;
}

export interface SharedProductReferencePrice {
  pricePerKg: number;
  currency: string;
  sourceVersion: string;
}

/** Facts that application modules may project without independently reading a
 * mutable product/catalog table. The payload belongs to one exact product
 * version and participates in the recipe behavior fingerprint. */
export interface SharedProductBehaviorFacts {
  schemaVersion: 1;
  technicalComposition: Readonly<Record<string, number | null>> | null;
  nutritionPer100g: ProductNutritionFactsPer100g | null;
  allergens: ProductAllergenFacts | null;
  processEvidence: RecipeProcessEvidence[];
  profileEligibility: ProductCategory[];
  veganEligibility: ProductBehaviorBinding['veganEligibility'];
  proteinBehavior: ProductBehaviorBinding['proteinBehavior'];
  referencePrice: SharedProductReferencePrice | null;
}

/** Request-account data returned separately by the server resolver. It must
 * never be embedded in a shared product or recipe behavior snapshot. */
export interface PrivateProductBehaviorOverlay {
  favorite: boolean;
  recentAt: string | null;
  privatePricePerKg: number | null;
  privatePriceCurrency: string | null;
  supplier: string | null;
  note: string | null;
  stock: number | null;
}

/** Immutable recipe/version snapshot. No Engine formula reads this object. */
export interface ProductBehaviorSnapshot {
  schemaVersion: 1;
  resolutionState: ProductBehaviorSnapshotState;
  lineId: string;
  productId: string;
  productVersionId: string;
  source: ProductSourceKind;
  factsFingerprint: string;
  behaviorBindingId: string;
  behaviorBindingVersion: string;
  taxonomyVersion: string;
  familyId: string | null;
  subfamilyId: string | null;
  formId: string | null;
  verificationState: CatalogVerificationState;
  technicalAuthority: ProductTechnicalAuthority['kind'];
  mapperIngredientId: string | null;
  mainClassification: ProductBehaviorBinding['mainClassification'];
  mainPolicyId: string | null;
  mainPolicyVersion: string | null;
  ecoFloorPercent: number | null;
  optimalCeilingPercent: number | null;
  hardLimitPercent: number | null;
  mainEquivalentFactor: number | null;
  mainBasis: MainEnvelopePolicy['basis'] | null;
  requiresLiquidDairyCarrier: boolean;
  liquidDairyCarrierFloorPercent: number | null;
  approvedLiquidDairyCarrier: boolean;
  approvedMixedFamilyIds: string[];
  moduleEligibility: Partial<Record<ProductBehaviorModule, RuntimeEligibilityState>>;
  processScope: ProductProcessScope;
  resolverVersion: string;
  /** Frozen shared facts for this exact version. Optional only for schema-v1
   * compatibility; facts-dependent module gates fail closed when it is absent. */
  sharedFacts?: SharedProductBehaviorFacts | null;
  warnings: string[];
  blockReasons: string[];
}

export interface ProductBehaviorRegistry {
  taxonomyVersion: string;
  policies: readonly MainEnvelopePolicy[];
}
