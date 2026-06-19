import { describe, expect, it } from 'vitest';
import type { ProductMatchResult } from '@/data/products/productMatcher';
import { productMatchResultToPatch } from './productMatchResultToPatch';

function makeResult(over: Partial<ProductMatchResult>): ProductMatchResult {
  return {
    mapper_status: 'matched',
    match_method: 'exact_ean',
    match_confidence: 'exact',
    matched_basement_id: 'B-1',
    normalized_name: 'whole milk',
    normalized_category: 'dairy',
    needs_review_reason: null,
    mapper_notes: null,
    missing_fields: [],
    candidate_count: 1,
    candidate_ids: ['B-1'],
    ...over,
  };
}

const KEYS = [
  'matched_basement_id', 'match_confidence', 'match_method', 'mapper_status',
  'mapper_notes', 'normalized_name', 'normalized_category', 'needs_review_reason',
  'missing_fields_json', 'candidate_ids', 'candidate_count',
];

describe('productMatchResultToPatch', () => {
  it('emits exactly the 11 mapper-result keys (no extras, no spread leakage)', () => {
    const patch = productMatchResultToPatch(makeResult({}));
    expect(Object.keys(patch).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(patch)).toHaveLength(11);
  });

  it('maps each field by name (matched / exact case)', () => {
    const patch = productMatchResultToPatch(
      makeResult({
        matched_basement_id: 'B-42', match_confidence: 'high', match_method: 'brand_name',
        mapper_status: 'matched', mapper_notes: 'note', normalized_name: 'crumble',
        normalized_category: 'flavor', needs_review_reason: null,
        missing_fields: ['pac_value'], candidate_ids: ['B-42'], candidate_count: 1,
      }),
    );
    expect(patch).toEqual({
      matched_basement_id: 'B-42', match_confidence: 'high', match_method: 'brand_name',
      mapper_status: 'matched', mapper_notes: 'note', normalized_name: 'crumble',
      normalized_category: 'flavor', needs_review_reason: null,
      missing_fields_json: ['pac_value'], candidate_ids: ['B-42'], candidate_count: 1,
    });
  });

  it('preserves a real candidate_count of 0 (never collapses it to null)', () => {
    expect(productMatchResultToPatch(makeResult({ candidate_count: 0 })).candidate_count).toBe(0);
  });

  it('maps undefined optional fields (candidate_count / candidate_ids) to null, never 0/[]', () => {
    const patch = productMatchResultToPatch(makeResult({ candidate_count: undefined, candidate_ids: undefined }));
    expect(patch.candidate_count).toBeNull();
    expect(patch.candidate_ids).toBeNull();
  });

  it('stores missing_fields verbatim, including an empty array (NOT null)', () => {
    expect(productMatchResultToPatch(makeResult({ missing_fields: [] })).missing_fields_json).toEqual([]);
    expect(
      productMatchResultToPatch(makeResult({ missing_fields: ['pac_value', 'pod_value'] })).missing_fields_json,
    ).toEqual(['pac_value', 'pod_value']);
  });

  it('keeps null result fields as null (no fake values)', () => {
    const patch = productMatchResultToPatch(
      makeResult({ matched_basement_id: null, normalized_category: null, mapper_notes: null }),
    );
    expect(patch.matched_basement_id).toBeNull();
    expect(patch.normalized_category).toBeNull();
    expect(patch.mapper_notes).toBeNull();
  });

  it('produces a JSON-serializable patch (arrays + scalars only)', () => {
    const patch = productMatchResultToPatch(
      makeResult({ missing_fields: ['pac_value'], candidate_ids: ['B-1', 'B-2'] }),
    );
    expect(() => JSON.stringify(patch)).not.toThrow();
    expect(JSON.parse(JSON.stringify(patch)).missing_fields_json).toEqual(['pac_value']);
  });

  it('preserves normalized_name verbatim, incl. edge values "" and "0" (never nulled)', () => {
    expect(productMatchResultToPatch(makeResult({ normalized_name: '' })).normalized_name).toBe('');
    expect(productMatchResultToPatch(makeResult({ normalized_name: '0' })).normalized_name).toBe('0');
  });

  it('passes the rejected confidence/status superset values through verbatim', () => {
    // 'rejected' is in the D2 unions (matcher never emits it, but a human/D3 result may);
    // ('manual_mapping' is intentionally unconstructible here — ProductMatchResult forbids it.)
    const patch = productMatchResultToPatch(
      makeResult({ mapper_status: 'rejected', match_confidence: 'rejected' }),
    );
    expect(patch.mapper_status).toBe('rejected');
    expect(patch.match_confidence).toBe('rejected');
  });

  it('stores arrays verbatim at any size (faithful pass-through — no re-cap, no truncation)', () => {
    const missing = Array.from({ length: 50 }, (_, i) => `field_${i}`);
    const ids = Array.from({ length: 30 }, (_, i) => `B-${i}`);
    const patch = productMatchResultToPatch(makeResult({ missing_fields: missing, candidate_ids: ids }));
    expect(patch.missing_fields_json).toEqual(missing);
    expect(patch.candidate_ids).toHaveLength(30);
  });

  it('emits no npac_value / calculated_profile_json / source_values_json key', () => {
    const patch = productMatchResultToPatch(makeResult({})) as Record<string, unknown>;
    for (const k of ['npac_value', 'calculated_profile_json', 'source_values_json']) {
      expect(k in patch, k).toBe(false);
    }
  });
});
