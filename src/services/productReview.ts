/**
 * Manual Mapper review actions (DEV review slice) — a human confirms or rejects the
 * single candidate the deterministic matcher proposed for a `needs_review` product.
 *
 * Boundaries (enforced by productReview.security.test.ts):
 *   • the ONLY product write is the narrow saveProductMapperReview — it accepts a
 *     ProductMapperResultUpdate (the Mapper-result columns only), so it can never set
 *     products.status, pac_value/pod_value, composition, or identity;
 *   • it never reads or writes the locked reference base (no mapper_basement, no
 *     npac_value), calls no engine / AI / billing, makes no raw DB / Supabase access,
 *     and runs only when explicitly called (no auto-run / schedule / trigger).
 *
 * Neither action copies or computes pac/pod: a confirmed mapping is NOT yet engine-ready
 * (missing_fields_json is left untouched, still [pac_value, pod_value]); sourcing those
 * values is a separate, later step.
 */
import { getProduct, saveProductMapperReview } from '@/services/products';
import type { ProductMapperResultUpdate, ProductRow } from '@/data/products/productRow';

/**
 * Confirm the single candidate as correct. Records a HUMAN decision in the Mapper-result
 * columns: status → matched, method → manual_mapping (a human action, not the matcher),
 * confidence → high (honest: confident, but not an exact EAN/name match), and clears the
 * needs_review_reason. matched_basement_id / candidate_ids / candidate_count /
 * missing_fields_json are deliberately NOT in the patch, so they are kept as-is. pac/pod
 * are never touched — "matched" here means the mapping is confirmed, NOT engine-ready.
 */
export async function confirmProductMatch(productId: string): Promise<ProductRow> {
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found or not owned.');
  if (!product.matched_basement_id) {
    throw new Error('Cannot confirm: this product has no matched candidate.');
  }
  const autoMethod = product.match_method ?? 'category_composition_similarity';
  const patch: ProductMapperResultUpdate = {
    mapper_status: 'matched',
    match_method: 'manual_mapping',
    match_confidence: 'high',
    needs_review_reason: null,
    mapper_notes: `Manually confirmed by reviewer (auto-method was ${autoMethod}). Not engine-ready: pac/pod still unsourced.`,
  };
  return saveProductMapperReview(productId, patch);
}

/**
 * Confirm a CHOSEN candidate for a multi-candidate (ambiguous / not-yet-persisted) product.
 * Same human-decision semantics as confirmProductMatch, but the reviewer supplies the
 * basement id they picked from the shortlist — so it sets matched_basement_id explicitly.
 * It writes ONLY the decision columns via the narrow saveProductMapperReview; it never
 * touches pac_value/pod_value (a confirmed mapping is NOT engine-ready) and never reads or
 * writes the locked reference base.
 */
export async function confirmProductMatchTo(productId: string, basementId: string): Promise<ProductRow> {
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found or not owned.');
  const chosen = basementId.trim();
  if (chosen === '') throw new Error('Cannot confirm: no candidate id provided.');
  const autoMethod = product.match_method ?? 'category_composition_similarity';
  const patch: ProductMapperResultUpdate = {
    mapper_status: 'matched',
    match_method: 'manual_mapping',
    match_confidence: 'high',
    matched_basement_id: chosen,
    needs_review_reason: null,
    mapper_notes: `Manually confirmed by reviewer — chose ${chosen} from the candidate shortlist (auto-method was ${autoMethod}). Not engine-ready: pac/pod still unsourced.`,
  };
  return saveProductMapperReview(productId, patch);
}

/**
 * Reject the single candidate as a false match. Records: status → rejected, method →
 * manual_mapping, confidence → rejected, and CLEARS matched_basement_id (the wrong choice
 * is removed). candidate_ids / candidate_count are kept (not in the patch) as an audit
 * trail of what the matcher proposed, so a later reviewer can see the rejected candidate.
 * pac/pod and composition are never touched.
 */
export async function rejectProductMatch(productId: string): Promise<ProductRow> {
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found or not owned.');
  const autoMethod = product.match_method ?? 'category_composition_similarity';
  const rejectedId = product.matched_basement_id ?? '(none)';
  const patch: ProductMapperResultUpdate = {
    mapper_status: 'rejected',
    match_method: 'manual_mapping',
    match_confidence: 'rejected',
    matched_basement_id: null,
    needs_review_reason: `Reviewer rejected false candidate ${rejectedId} (auto-method ${autoMethod}); the composition similarity was coincidental.`,
    mapper_notes: 'Manually rejected by reviewer. candidate_ids/candidate_count kept as an audit trail of the matcher proposal.',
  };
  return saveProductMapperReview(productId, patch);
}
