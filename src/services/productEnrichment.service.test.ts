import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnrichmentPatch } from '@/data/products/productEnrichment';

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  snapshotSourceChange: vi.fn(),
}));
vi.mock('@/services/products', () => ({ getProduct: h.getProduct, updateProduct: h.updateProduct }));
vi.mock('@/services/productSnapshots', () => ({ snapshotSourceChange: h.snapshotSourceChange }));

import { applyProductEnrichment } from './productEnrichment';

const product = (over: Record<string, unknown> = {}) => ({ id: 'p1', product_code: 'PR-ING-000010', status: 'draft', ...over });

afterEach(() => vi.clearAllMocks());

describe('applyProductEnrichment', () => {
  it('writes only the selected nutrition fields and records a snapshot', async () => {
    h.getProduct.mockResolvedValue(product());
    h.updateProduct.mockImplementation((_id: string, patch: Record<string, unknown>) => Promise.resolve(product(patch)));
    h.snapshotSourceChange.mockResolvedValue({ id: 's1', change_type: 'nutrition' });

    const res = await applyProductEnrichment('p1', { fat_percent: 30.9, protein_percent: 6.3 });

    expect(h.updateProduct).toHaveBeenCalledWith('p1', { fat_percent: 30.9, protein_percent: 6.3 });
    expect(res.appliedFields).toEqual(['fat_percent', 'protein_percent']);
    expect(res.snapshot?.change_type).toBe('nutrition');
    expect(h.snapshotSourceChange).toHaveBeenCalledOnce();
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
    expect(h.updateProduct).toHaveBeenCalledOnce();
  });

  it('strips any non-enrichable key — pac/pod/identity/status can never be written', async () => {
    h.getProduct.mockResolvedValue(product());
    h.updateProduct.mockResolvedValue(product({ fat_percent: 30.9 }));
    h.snapshotSourceChange.mockResolvedValue(null);
    // a hostile patch carrying forbidden keys
    const hostile = { fat_percent: 30.9, pac_value: 9, pod_value: 9, status: 'pi_verified', ean_code: '000', product_code: 'X' } as unknown as EnrichmentPatch;
    await applyProductEnrichment('p1', hostile);
    const patch = h.updateProduct.mock.calls[0]![1] as Record<string, unknown>;
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
