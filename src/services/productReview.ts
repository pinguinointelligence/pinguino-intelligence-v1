/**
 * Manual Mapper review actions (DEV review slice) — a human confirms or rejects the
 * single candidate the deterministic matcher proposed for a `needs_review` product.
 *
 * Boundaries (enforced by productReview.security.test.ts):
 *   • the only mutation is a canonical-ingest review event; ordinary reviewers
 *     add candidate evidence and cannot authorize or reject a Mapper mapping;
 *   • it never reads or writes the locked reference base (no mapper_basement, no
 *     npac_value), calls no engine / AI / billing, makes no raw DB / Supabase access,
 *     and runs only when explicitly called (no auto-run / schedule / trigger).
 *
 * Neither action copies or computes pac/pod: a candidate review is NOT engine-ready
 * (missing_fields_json is left untouched, still [pac_value, pod_value]); sourcing those
 * values is a separate, later step.
 */
import { getProduct, saveProductMapperReview } from '@/services/products';
import type { ProductMapperResultUpdate, ProductRow } from '@/data/products/productRow';

/**
 * Record the reviewer choice as candidate evidence. Without an independent administrator
 * sign-off this does not authorize a Mapper binding or Engine use; the server creates or
 * consolidates review work and preserves the immutable candidate evidence.
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
 * Same evidence semantics as confirmProductMatch, with an explicit shortlist candidate.
 * It never authorizes science, touches PAC/POD, or writes the locked reference base.
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
 * Record a reviewer rejection as immutable candidate evidence. An ordinary DEV reviewer
 * cannot revoke an authorized mapping; that remains an administrator decision inside the
 * canonical ingest transaction. PAC/POD and composition are never touched.
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
