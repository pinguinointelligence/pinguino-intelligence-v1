import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductUpdatePatch } from './products';

const h = vi.hoisted(() => {
  const state: { data: unknown; error: unknown } = { data: null, error: null };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['from', 'update', 'eq', 'neq', 'select']) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: state.data, error: state.error }));
  return { chain, state, ingest: vi.fn() };
});
vi.mock('@/lib/supabase/client', () => ({ supabase: h.chain }));
vi.mock('@/services/productIngest', () => ({
  canonicalIngestFromLegacyProduct: (input: Record<string, unknown>) => ({ source: 'manual', input, privateOverlay: {} }),
  productIngestIdempotencyKey: async () => 'product:manual:test',
  ingestProduct: h.ingest,
}));

import { updateProduct, updateProductUnlessStatus } from './products';

beforeEach(() => {
  vi.clearAllMocks();
  h.state.data = null;
  h.state.error = null;
  h.ingest.mockResolvedValue({ productId: 'p1' });
});

describe('updateProduct — structural engine-value protection', () => {
  it('strips pac_value/pod_value at runtime; allowed nutrition fields still update', async () => {
    h.state.data = { id: 'p1', fat_percent: 30.9 };
    // a hostile/legacy caller sneaking engine values past the type layer
    const hostile = { fat_percent: 30.9, pac_value: 9, pod_value: 9 } as unknown as ProductUpdatePatch;
    await updateProduct('p1', hostile);
    const written = h.ingest.mock.calls[0]?.[0].input as Record<string, unknown>;
    expect(written.fat_percent).toBe(30.9);
    expect(written).not.toHaveProperty('pac_value');
    expect(written).not.toHaveProperty('pod_value');
    expect(h.chain.from).toHaveBeenCalledWith('products'); // only the products table, ever
  });
});

describe('updateProductUnlessStatus — write-time status guard', () => {
  it('carries the status condition INSIDE the update (closes the check-then-write race)', async () => {
    h.state.data = { id: 'p1', status: 'draft', fat_percent: 30.9 };
    await updateProductUnlessStatus('p1', { fat_percent: 30.9 }, 'pi_verified');
    const written = h.ingest.mock.calls[0]?.[0].input as Record<string, unknown>;
    expect(written.expectedStatusNot).toBe('pi_verified');
    expect(written.fat_percent).toBe(30.9);
  });

  it('refuses the write when the row is (now) in the guarded status', async () => {
    h.state.data = { id: 'p1', status: 'pi_verified' };
    h.ingest.mockResolvedValue({ productId: null });
    await expect(updateProductUnlessStatus('p1', { fat_percent: 30.9 }, 'pi_verified')).rejects.toThrow(
      /status is 'pi_verified' \(write refused\)/,
    );
  });

  it('also strips engine values', async () => {
    h.state.data = { id: 'p1' };
    await updateProductUnlessStatus('p1', { salt_percent: 0.1, pac_value: 5 } as unknown as ProductUpdatePatch, 'pi_verified');
    const written = h.ingest.mock.calls[0]?.[0].input as Record<string, unknown>;
    expect(written.salt_percent).toBe(0.1);
    expect(written).not.toHaveProperty('pac_value');
  });
});
