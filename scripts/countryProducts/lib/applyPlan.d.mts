export declare const PLAN_SCHEMA: 'gellatti.country-products.gelato-base.db-plan/v1';
export declare const REGISTRY_SCHEMA: 'gellatti.country-products.gelato-base.registry/v1';
export declare const APPLY_PROJECT_REF: 'tunabqqrwabacxjcxxkz';
export declare const APPLY_APPROVAL_TOKEN: 'GELLATTI-V12-PR-ING';
export declare const IDEMPOTENCY_NAMESPACE: 'gellatti-v12-pr-ing';
export declare const CATALOG_SUBMIT_REVISION: 'approve-v12';
export declare const SOURCE_AUTHORITY: 'OWNER_WORKBOOK_GELATO_BASE_V12';
export declare const V23_APPLY_APPROVAL_TOKEN: 'GELLATTI-V23-PR-ING';

export type ApplyMode = 'DRY_RUN' | 'APPLY' | 'REFUSED';

export interface ApplyGuardResult {
  mode: ApplyMode;
  refusal: string | null;
  args: Map<string, string | true>;
}

/** DB-package constants of one registry version. */
export interface ApplyProfile {
  label: string;
  approvalToken: string;
  idempotencyNamespace: string;
  catalogSubmitRevision: string;
  sourceAuthority: string;
  researchedFor: string;
  scope: string;
}

export declare const APPLY_PROFILES: Readonly<Record<'GELATO_BASE_V12' | 'GELATO_BASE_V23', ApplyProfile>>;
export declare function applyProfileFor(registry: unknown): ApplyProfile;

export declare function parseArguments(argv: readonly string[]): Map<string, string | true>;
export declare function sourceUrlsFor(registry: unknown, ids: readonly string[] | null | undefined): string[];
export declare function registryText<T>(registry: unknown, value: T): T | string;
export declare function evaluateApplyGuard(
  argv: readonly string[],
  options?: { approvalToken?: string },
): ApplyGuardResult;

export interface PlannedRoute {
  country: string;
  proposalKey: string;
  mapperIngredientId: string;
  assignmentKind: 'PRIMARY_DEFAULT';
  fallbackPriority: null;
  approvalReason: string;
}

export interface PlannedProduct {
  productKey: string;
  slot: string;
  piIngId: string;
  exactName: string | null;
  brand: string | null;
  identityBasis: string;
  gtin: string | null;
  requestMarket: string;
  additionalMarkets: string[];
  requestIdempotencyKey: string;
  catalogSubmitIdempotencyKey: string;
  routes: PlannedRoute[];
  blockedRoutes: Array<{ country: string; blockers: string[] }>;
  requestPayload: Record<string, unknown>;
  evidencePatch: Record<string, unknown>;
  catalogInput: Record<string, unknown>;
  slotReview: Record<string, unknown>;
}

export interface ApplyPlan {
  schema: typeof PLAN_SCHEMA;
  registryId: string;
  workbook: string;
  workbookSha256: string;
  catalogSnapshotCapturedAt: string;
  projectRef: typeof APPLY_PROJECT_REF;
  sharedWithProduction: true;
  /** The owner approval token of this registry version. */
  approvalToken: string;
  scope: string;
  productsToCreate: PlannedProduct[];
  reuse: Array<{
    productKey: string;
    prIng: string;
    routesAlreadyPresent: string[];
    routesToAdd: string[];
    blockedRoutes: Array<{ country: string; blockers: string[] }>;
  }>;
  deferredProducts: Array<{
    productKey: string;
    slot: string;
    markets: string[];
    catalogDecision: string;
    engineProfileExpectation: string;
    reasons: string[];
  }>;
  /** The product-key / local-name fields are named after the registry version (v12ProductKey, v23ProductKey, …). */
  routeConflicts: Array<{
    selectionKey: string;
    piIngId: string;
    existingPrimary: { productCode: string; productEan: string | null } | null;
    v12ProductKey?: string;
    v12LocalName?: string | null;
    v23ProductKey?: string;
    v23LocalName?: string | null;
    workbookInstruction: string | null;
    decision: 'NOT_CHANGED_REQUIRES_SEPARATE_OWNER_DECISION';
  }>;
  marketRowsNeeded: Array<{ country: string; blockedRoutes: number; slots: string[] }>;
  tableCounts: {
    product_add_requests: number;
    products: number;
    product_versions: number;
    product_behavior_bindings: number;
    product_variants: number;
    product_variant_markets: number;
    product_variant_markets_via_ingest: number;
    product_variant_markets_via_add_market: number;
    product_canonical_slot_reviews: number;
    country_product_slot_assignments: number;
    catalog_market_countries: number;
    mapper_basement: number;
    pi_ing_created: number;
  };
  sideEffectsPerProduct: Record<string, number | string>;
  routeCounts: {
    creatableNow: number;
    alreadyPresent: number;
    blockedByMarketForeignKey: number;
    blockedOtherwise: number;
    existingPrimaryConflicts: number;
  };
}

export declare function buildProductPayloads(
  registry: unknown,
  product: unknown,
  anchorProposalKey: string,
): {
  requestPayload: Record<string, unknown>;
  evidencePatch: Record<string, unknown>;
  catalogInput: Record<string, unknown>;
  slotReview: Record<string, unknown>;
};

export declare function buildApplyPlan(registry: unknown): ApplyPlan;
