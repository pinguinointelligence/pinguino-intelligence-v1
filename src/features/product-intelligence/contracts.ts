import type { ProductCategory } from '@/engine';

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
  | 'SAVE';

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
  evidenceStatus: 'owner_provisional' | 'verified' | 'reference_only';
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
  mainEligibility: ProductBehaviorBinding['mainClassification'];
  veganEligibility: ProductBehaviorBinding['veganEligibility'];
  proteinBehavior: ProductBehaviorBinding['proteinBehavior'];
  processBehavior: Record<string, unknown>;
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

/** Immutable recipe/version snapshot. No Engine formula reads this object. */
export interface ProductBehaviorSnapshot {
  schemaVersion: 1;
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
  warnings: string[];
  blockReasons: string[];
}

export interface ProductBehaviorRegistry {
  taxonomyVersion: string;
  policies: readonly MainEnvelopePolicy[];
}
