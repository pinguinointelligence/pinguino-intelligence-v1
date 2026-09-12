/**
 * Distinguish this apply package's own already-written rows from a real live
 * conflict. A matching APPROVED request is the authority that ties a product
 * and any partially-created routes back to the reviewed idempotency key.
 */
export function reconcileExistingApplyProduct({
  productKey,
  gtin,
  request,
  exactProduct,
  ingestEvent,
  routePrimaries,
}) {
  const issues = [];
  const approvedProductId =
    request?.status === 'APPROVED' && typeof request.approved_product_id === 'string'
      ? request.approved_product_id
      : null;
  const ingestedProductId =
    typeof ingestEvent?.product_id === 'string' ? ingestEvent.product_id : null;
  const ownedProductId = approvedProductId ?? ingestedProductId;

  if (request?.status === 'APPROVED' && !approvedProductId) {
    issues.push(`${productKey}: APPROVED request has no approved product`);
  }

  if (exactProduct && exactProduct.id !== ownedProductId) {
    issues.push(`${productKey}: GTIN ${gtin} now exists outside this approved request`);
  }
  if (gtin && ownedProductId && !exactProduct) {
    issues.push(`${productKey}: approved product is no longer the active exact GTIN product`);
  }

  for (const { proposalKey, primary } of routePrimaries) {
    if (primary && primary.product_id !== ownedProductId) {
      issues.push(`${proposalKey}: an active primary exists outside this approved request`);
    }
  }

  return { approvedProductId, ingestedProductId, ownedProductId, issues };
}
