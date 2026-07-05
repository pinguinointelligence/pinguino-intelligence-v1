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
import { supabase } from '@/lib/supabase/client';
import type { ProductRow, ProductStatus } from '@/data/products/productRow';

const TABLE = 'products';
const UNAVAILABLE = 'Products are not available in this build.';

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
  if (!supabase) throw new Error(UNAVAILABLE);
  const patch: { status: ProductStatus; reviewed_by?: string; reviewed_at?: string; review_notes?: string } = { status };
  if (review?.reviewed_by !== undefined) {
    patch.reviewed_by = review.reviewed_by;
    patch.reviewed_at = new Date().toISOString();
  }
  if (review?.review_notes !== undefined) patch.review_notes = review.review_notes;

  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', productId).select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Product not found or not owned.');
  return data as ProductRow;
}
