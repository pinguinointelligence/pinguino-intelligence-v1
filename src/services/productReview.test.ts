import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductRow } from '@/data/products/productRow';

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  saveProductMapperReview: vi.fn(),
}));
vi.mock('@/services/products', () => ({
  getProduct: h.getProduct,
  saveProductMapperReview: h.saveProductMapperReview,
}));

import { confirmProductMatch, confirmProductMatchTo, rejectProductMatch } from './productReview';

/** Minimal needs_review row — only the fields the actions read. */
const row = (over: Partial<ProductRow> = {}): ProductRow =>
  ({
    id: 'p1',
    matched_basement_id: 'PI-ING-000180',
    match_method: 'category_composition_similarity',
    mapper_status: 'needs_review',
    ...over,
  }) as ProductRow;

afterEach(() => vi.clearAllMocks());

describe('confirmProductMatch', () => {
  it('writes ONLY matched / manual_mapping / high + clears needs_review_reason, touching no pac/pod/identity/missing_fields', async () => {
    h.getProduct.mockResolvedValue(row());
    h.saveProductMapperReview.mockResolvedValue(row({ mapper_status: 'matched' }));

    await confirmProductMatch('p1');

    expect(h.saveProductMapperReview).toHaveBeenCalledTimes(1);
    const [id, patch] = h.saveProductMapperReview.mock.calls[0] ?? [];
    expect(id).toBe('p1');
    expect(patch.mapper_status).toBe('matched');
    expect(patch.match_method).toBe('manual_mapping');
    expect(patch.match_confidence).toBe('high');
    expect(patch.needs_review_reason).toBeNull();
    expect(typeof patch.mapper_notes).toBe('string');
    // kept as-is (not in the patch):
    expect(patch).not.toHaveProperty('matched_basement_id');
    expect(patch).not.toHaveProperty('candidate_ids');
    expect(patch).not.toHaveProperty('candidate_count');
    expect(patch).not.toHaveProperty('missing_fields_json');
    // never engine values:
    expect(patch).not.toHaveProperty('pac_value');
    expect(patch).not.toHaveProperty('pod_value');
    expect(patch).not.toHaveProperty('status');
  });

  it('throws (no write) when the product is missing or has no candidate', async () => {
    h.getProduct.mockResolvedValue(null);
    await expect(confirmProductMatch('p1')).rejects.toThrow(/not found/i);

    h.getProduct.mockResolvedValue(row({ matched_basement_id: null }));
    await expect(confirmProductMatch('p1')).rejects.toThrow(/no matched candidate/i);
    expect(h.saveProductMapperReview).not.toHaveBeenCalled();
  });
});

describe('confirmProductMatchTo (multi-candidate chosen pick)', () => {
  it('sets matched / manual_mapping / high with the CHOSEN basement id, never pac/pod', async () => {
    h.getProduct.mockResolvedValue(row({ matched_basement_id: null })); // never persisted / ambiguous
    h.saveProductMapperReview.mockResolvedValue(row({ mapper_status: 'matched', matched_basement_id: 'PI-ING-000099' }));

    await confirmProductMatchTo('p1', 'PI-ING-000099');

    const [id, patch] = h.saveProductMapperReview.mock.calls[0] ?? [];
    expect(id).toBe('p1');
    expect(patch.mapper_status).toBe('matched');
    expect(patch.match_method).toBe('manual_mapping');
    expect(patch.match_confidence).toBe('high');
    expect(patch.matched_basement_id).toBe('PI-ING-000099'); // the reviewer's pick
    expect(patch.needs_review_reason).toBeNull();
    expect(patch).not.toHaveProperty('pac_value');
    expect(patch).not.toHaveProperty('pod_value');
    expect(patch).not.toHaveProperty('status');
  });

  it('throws (no write) on a missing product or a blank candidate id', async () => {
    h.getProduct.mockResolvedValue(null);
    await expect(confirmProductMatchTo('p1', 'PI-ING-000099')).rejects.toThrow(/not found/i);

    h.getProduct.mockResolvedValue(row());
    await expect(confirmProductMatchTo('p1', '   ')).rejects.toThrow(/no candidate id/i);
    expect(h.saveProductMapperReview).not.toHaveBeenCalled();
  });
});

describe('rejectProductMatch', () => {
  it('writes rejected / manual_mapping / rejected + clears matched_basement_id, keeping candidates and never touching pac/pod', async () => {
    h.getProduct.mockResolvedValue(row());
    h.saveProductMapperReview.mockResolvedValue(row({ mapper_status: 'rejected', matched_basement_id: null }));

    await rejectProductMatch('p1');

    const [id, patch] = h.saveProductMapperReview.mock.calls[0] ?? [];
    expect(id).toBe('p1');
    expect(patch.mapper_status).toBe('rejected');
    expect(patch.match_method).toBe('manual_mapping');
    expect(patch.match_confidence).toBe('rejected');
    expect(patch.matched_basement_id).toBeNull();
    expect(typeof patch.needs_review_reason).toBe('string');
    // candidates kept (not in the patch), engine values never touched:
    expect(patch).not.toHaveProperty('candidate_ids');
    expect(patch).not.toHaveProperty('candidate_count');
    expect(patch).not.toHaveProperty('pac_value');
    expect(patch).not.toHaveProperty('pod_value');
    expect(patch).not.toHaveProperty('status');
  });

  it('throws (no write) when the product is missing', async () => {
    h.getProduct.mockResolvedValue(null);
    await expect(rejectProductMatch('p1')).rejects.toThrow(/not found/i);
    expect(h.saveProductMapperReview).not.toHaveBeenCalled();
  });
});
