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
}

/**
 * Narrow update of ONLY `products.status` (+ optional review audit). Throws if the row is
 * missing / not owned. Never writes any other product field.
 */
export async function setProductLifecycleStatus(
  productId: string,
  status: ProductStatus,
  review?: StatusReview,
): Promise<ProductRow> {
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
