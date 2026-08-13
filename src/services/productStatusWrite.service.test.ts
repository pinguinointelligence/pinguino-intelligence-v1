import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  ingestProduct: vi.fn(),
  canonical: vi.fn((input: unknown) => ({ source: 'manual', input: { source: input }, privateOverlay: {} })),
  idempotency: vi.fn(async () => 'product:admin:key'),
}));

vi.mock('@/services/products', () => ({ getProduct: h.getProduct }));
vi.mock('@/services/productIngest', () => ({
  canonicalIngestFromLegacyProduct: h.canonical,
  ingestProduct: h.ingestProduct,
  productIngestIdempotencyKey: h.idempotency,
}));

import { setProductLifecycleStatus } from './productStatusWrite';

afterEach(() => vi.clearAllMocks());

const FULL_REVIEW = {
  reviewed_by: 'owner',
  review_notes: 'producer technical sheet on file',
  independent_provenance: true,
  red_flags_clear: true,
} as const;

describe('setProductLifecycleStatus — canonical admin decision', () => {
  it('refuses a plain pi_verified decision before calling ingest', async () => {
    await expect(setProductLifecycleStatus('p1', 'pi_verified')).rejects.toThrow(/PI Verified was refused/);
    expect(h.ingestProduct).not.toHaveBeenCalled();
  });

  it('refuses pi_verified without every review attestation', async () => {
    await expect(setProductLifecycleStatus('p1', 'pi_verified', { ...FULL_REVIEW, review_notes: '  ' }))
      .rejects.toThrow(/written reason/);
    await expect(setProductLifecycleStatus('p1', 'pi_verified', { reviewed_by: 'owner', review_notes: 'reason' }))
      .rejects.toThrow(/independent-provenance/);
    await expect(setProductLifecycleStatus('p1', 'pi_verified', { ...FULL_REVIEW, red_flags_clear: undefined }))
      .rejects.toThrow(/red-flag/);
    expect(h.ingestProduct).not.toHaveBeenCalled();
  });

  it('routes pi_verified and its review evidence through one canonical admin ingest', async () => {
    h.getProduct.mockResolvedValueOnce({ id: 'p1', status: 'draft' }).mockResolvedValueOnce({ id: 'p1', status: 'pi_verified' });
    h.ingestProduct.mockResolvedValue({ productId: 'p1' });

    const row = await setProductLifecycleStatus('p1', 'pi_verified', FULL_REVIEW);

    expect((row as { status: string }).status).toBe('pi_verified');
    const request = h.ingestProduct.mock.calls[0]?.[0] as { source: string; input: Record<string, unknown> };
    expect(request.source).toBe('admin');
    expect(request.input.lifecycleDecision).toBe('pi_verified');
    expect(request.input.reviewEvidence).toEqual({
      reviewedBy: 'owner',
      reviewNotes: 'producer technical sheet on file',
      independentProvenance: true,
      redFlagsClear: true,
    });
  });

  it('routes non-verified decisions through the same canonical boundary', async () => {
    h.getProduct.mockResolvedValueOnce({ id: 'p1', status: 'draft' }).mockResolvedValueOnce({ id: 'p1', status: 'pi_generated' });
    h.ingestProduct.mockResolvedValueOnce({ productId: 'p1' });
    await setProductLifecycleStatus('p1', 'pi_generated', { reviewed_by: 'dev', review_notes: 'apply recommended' });

    h.getProduct.mockResolvedValueOnce({ id: 'p2', status: 'draft' }).mockResolvedValueOnce({ id: 'p2', status: 'rejected' });
    h.ingestProduct.mockResolvedValueOnce({ productId: 'p2' });
    await setProductLifecycleStatus('p2', 'rejected');

    expect(h.ingestProduct).toHaveBeenCalledTimes(2);
  });
});
