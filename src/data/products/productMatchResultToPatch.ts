/**
 * Pure mapper (Mapper Slice D3): one in-memory D2 `ProductMatchResult` -> the
 * NARROW `ProductMapperResultUpdate` patch persisted by `saveProductMatchResult`.
 *
 *   • PURE — no DB access, no data-layer client, no services, no engine, no IO.
 *     Deterministic: same input always yields the same patch.
 *   • EXPLICIT — every one of the 11 columns is mapped by name (no spread), so a
 *     non-mapper column can never leak into the patch.
 *   • HONEST — optional fields (candidate_count, candidate_ids) become `null` when
 *     undefined, NEVER a fake 0 / empty value; a REAL `candidate_count` of 0 is
 *     preserved (`0 ?? null === 0`); arrays — including an empty `missing_fields`
 *     — are stored verbatim (an empty array is "matched, nothing missing", which is
 *     distinct from NULL = "never mapped"). No npac_value, no calculated/source JSON.
 */
import type { ProductMatchResult } from '@/data/products/productMatcher';
import type { ProductMapperResultUpdate } from '@/data/products/productRow';

export function productMatchResultToPatch(result: ProductMatchResult): ProductMapperResultUpdate {
  return {
    matched_basement_id: result.matched_basement_id,
    match_confidence: result.match_confidence,
    match_method: result.match_method,
    mapper_status: result.mapper_status,
    mapper_notes: result.mapper_notes,
    normalized_name: result.normalized_name,
    normalized_category: result.normalized_category,
    needs_review_reason: result.needs_review_reason,
    missing_fields_json: result.missing_fields,
    candidate_ids: result.candidate_ids ?? null,
    candidate_count: result.candidate_count ?? null,
  };
}
