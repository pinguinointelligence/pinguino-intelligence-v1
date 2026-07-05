import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnrichmentPatch } from '@/data/products/productEnrichment';

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  updateProductUnlessStatus: vi.fn(),
  snapshotSourceChange: vi.fn(),
}));
vi.mock('@/services/products', () => ({
  getProduct: h.getProduct,
  updateProduct: h.updateProduct,
  updateProductUnlessStatus: h.updateProductUnlessStatus,
}));
vi.mock('@/services/productSnapshots', () => ({ snapshotSourceChange: h.snapshotSourceChange }));

import { applyProductEnrichment } from './productEnrichment';

const product = (over: Record<string, unknown> = {}) => ({ id: 'p1', product_code: 'PR-ING-000010', status: 'draft', ...over });

afterEach(() => vi.clearAllMocks());

describe('applyProductEnrichment', () => {
  it('writes only the selected nutrition fields via the GUARDED update and records a snapshot', async () => {
    h.getProduct.mockResolvedValue(product());
    h.updateProductUnlessStatus.mockImplementation((_id: string, patch: Record<string, unknown>) => Promise.resolve(product(patch)));
    h.snapshotSourceChange.mockResolvedValue({ id: 's1', change_type: 'nutrition' });

    const res = await applyProductEnrichment('p1', { fat_percent: 30.9, protein_percent: 6.3 });

    // no override → the write itself refuses a pi_verified row (write-time guard)
    expect(h.updateProductUnlessStatus).toHaveBeenCalledWith('p1', { fat_percent: 30.9, protein_percent: 6.3 }, 'pi_verified');
    expect(h.updateProduct).not.toHaveBeenCalled();
    expect(res.appliedFields).toEqual(['fat_percent', 'protein_percent']);
    expect(res.snapshot?.change_type).toBe('nutrition');
    expect(h.snapshotSourceChange).toHaveBeenCalledOnce();
  });

  it('TOCTOU: if the row becomes PI Verified between read and write, the write refuses and NO snapshot is taken', async () => {
    h.getProduct.mockResolvedValue(product({ status: 'draft' })); // read says draft…
    h.updateProductUnlessStatus.mockRejectedValue(new Error("Product not found, not owned, or its status is 'pi_verified' (write refused).")); // …write-time guard fires
    await expect(applyProductEnrichment('p1', { fat_percent: 30.9 })).rejects.toThrow(/write refused/);
    expect(h.snapshotSourceChange).not.toHaveBeenCalled();
  });

  it('throws (no write) when nothing enrichable is selected', async () => {
    await expect(applyProductEnrichment('p1', {})).rejects.toThrow(/No enrichable/);
    expect(h.getProduct).not.toHaveBeenCalled();
    expect(h.updateProduct).not.toHaveBeenCalled();
  });

  it('never silently overwrites a PI Verified product (blocks without an explicit override)', async () => {
    h.getProduct.mockResolvedValue(product({ status: 'pi_verified' }));
    await expect(applyProductEnrichment('p1', { fat_percent: 30.9 })).rejects.toThrow(/PI Verified/);
    expect(h.updateProduct).not.toHaveBeenCalled();
    expect(h.snapshotSourceChange).not.toHaveBeenCalled();
  });

  it('allows a PI Verified product only with an explicit override', async () => {
    h.getProduct.mockResolvedValue(product({ status: 'pi_verified' }));
    h.updateProduct.mockResolvedValue(product({ status: 'pi_verified', fat_percent: 30.9 }));
    h.snapshotSourceChange.mockResolvedValue({ id: 's2', change_type: 'nutrition' });
    const res = await applyProductEnrichment('p1', { fat_percent: 30.9 }, { allowPiVerifiedOverride: true, reason: 'producer sheet' });
    expect(res.appliedFields).toEqual(['fat_percent']);
    expect(h.updateProduct).toHaveBeenCalledOnce(); // explicit override → the unguarded path, deliberately
    expect(h.updateProductUnlessStatus).not.toHaveBeenCalled();
  });

  it('strips any non-enrichable key — pac/pod/identity/status can never be written', async () => {
    h.getProduct.mockResolvedValue(product());
    h.updateProductUnlessStatus.mockResolvedValue(product({ fat_percent: 30.9 }));
    h.snapshotSourceChange.mockResolvedValue(null);
    // a hostile patch carrying forbidden keys
    const hostile = { fat_percent: 30.9, pac_value: 9, pod_value: 9, status: 'pi_verified', ean_code: '000', product_code: 'X' } as unknown as EnrichmentPatch;
    await applyProductEnrichment('p1', hostile);
    const patch = h.updateProductUnlessStatus.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toEqual({ fat_percent: 30.9 });
    expect(patch).not.toHaveProperty('pac_value');
    expect(patch).not.toHaveProperty('pod_value');
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('ean_code');
    expect(patch).not.toHaveProperty('product_code');
  });

  it('throws when the product is missing / not owned', async () => {
    h.getProduct.mockResolvedValue(null);
    await expect(applyProductEnrichment('p1', { fat_percent: 1 })).rejects.toThrow(/not found|not owned/i);
    expect(h.updateProduct).not.toHaveBeenCalled();
  });
});
