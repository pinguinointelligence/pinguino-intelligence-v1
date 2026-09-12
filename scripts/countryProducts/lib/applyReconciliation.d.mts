export interface ApplyRequestIdentity {
  status?: string | null;
  approved_product_id?: string | null;
}

export interface ApplyProductIdentity {
  id: string;
}

export interface ApplyIngestIdentity {
  product_id?: string | null;
  status?: string | null;
}

export interface ApplyRoutePrimaryIdentity {
  proposalKey: string;
  primary: { product_id?: string | null } | null;
}

export interface ReconcileExistingApplyProductInput {
  productKey: string;
  gtin: string | null;
  request: ApplyRequestIdentity | null;
  exactProduct: ApplyProductIdentity | null;
  ingestEvent: ApplyIngestIdentity | null;
  routePrimaries: readonly ApplyRoutePrimaryIdentity[];
}

export interface ExistingApplyProductReconciliation {
  approvedProductId: string | null;
  ingestedProductId: string | null;
  ownedProductId: string | null;
  issues: string[];
}

export declare function reconcileExistingApplyProduct(
  input: ReconcileExistingApplyProductInput,
): ExistingApplyProductReconciliation;
