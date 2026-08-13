/**
 * Product lifecycle-status write service. The ONE narrow path that persists a product's
 * customer-facing lifecycle `status` (and optional review audit). It updates ONLY
 * `products.status` + `reviewed_by` / `reviewed_at` / `review_notes` — never identity, EAN,
 * source, nutrition, composition, pac/pod, or the Mapper-result columns, and never the locked
 * `mapper_basement`. RLS-gated (own row); no privileged key; no npac_value.
 *
 * The STATUS itself is decided by the pure `productStatusDecision` (red flags block PI Verified;
 * reference-linked → at most PI Generated). This service only persists the chosen status.
 */
import { getProduct } from '@/services/products';
import {
  canonicalIngestFromLegacyProduct,
  ingestProduct,
  productIngestIdempotencyKey,
} from '@/services/productIngest';
import type { ProductRow, ProductStatus } from '@/data/products/productRow';

export interface StatusReview {
  reviewed_by?: string;
  review_notes?: string;
  /** REQUIRED true to persist PI Verified: attests reliable lab / technical-sheet / producer
   * provenance exists (reference-linked values alone can never be PI Verified). */
  independent_provenance?: boolean;
  /** REQUIRED true to persist PI Verified: attests the red-flag check ran and came back clean
   * (the pure decision layer never grants PI Verified to a red-flagged product). */
  red_flags_clear?: boolean;
}

/**
 * SERVICE-LEVEL GUARD (defense-in-depth): `pi_verified` cannot be persisted casually. The caller
 * must supply a reviewer, a written reason, and the two explicit attestations — mirroring what the
 * pure `decideProductStatus` policy requires — so no future code path can set PI Verified by
 * accident. Refusal happens BEFORE any client/database access; nothing is written.
 */
function assertVerifiedReview(review: StatusReview | undefined): void {
  const problems: string[] = [];
  if (!review?.reviewed_by?.trim()) problems.push('a reviewer (reviewed_by)');
  if (!review?.review_notes?.trim()) problems.push('a written reason (review_notes)');
  if (review?.independent_provenance !== true) problems.push('the independent-provenance attestation');
  if (review?.red_flags_clear !== true) problems.push('the clean red-flag attestation');
  if (problems.length > 0) {
    throw new Error(`PI Verified was refused — missing ${problems.join(', ')}. Nothing was written.`);
  }
}

/**
 * Narrow update of ONLY `products.status` (+ optional review audit). Throws if the row is
 * missing / not owned. Never writes any other product field. Persisting `pi_verified`
 * additionally requires the full verified review (see assertVerifiedReview).
 */
export async function setProductLifecycleStatus(
  productId: string,
  status: ProductStatus,
  review?: StatusReview,
): Promise<ProductRow> {
  if (status === 'pi_verified') assertVerifiedReview(review);
  const current = await getProduct(productId);
  if (!current) throw new Error('Product not found or not owned.');
  const request = canonicalIngestFromLegacyProduct(current);
  request.source = 'admin';
  request.input.productId = productId;
  request.input.lifecycleDecision = status;
  request.input.reviewEvidence = {
    reviewedBy: review?.reviewed_by ?? null,
    reviewNotes: review?.review_notes ?? null,
    independentProvenance: review?.independent_provenance === true,
    redFlagsClear: review?.red_flags_clear === true,
  };
  const idempotencyKey = await productIngestIdempotencyKey('admin', request.input, `lifecycle:${productId}:${status}`);
  const result = await ingestProduct({ ...request, idempotencyKey, productId });
  if (!result.productId) throw new Error('Product lifecycle decision did not return a canonical product.');
  const updated = await getProduct(result.productId);
  if (!updated) throw new Error('Canonical product is not visible after lifecycle decision.');
  return updated as ProductRow;
}
