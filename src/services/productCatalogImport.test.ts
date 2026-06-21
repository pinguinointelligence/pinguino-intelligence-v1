import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

/** Hoisted spies for the two services the importer orchestrates. The pure identity
 * helpers (productIdentityKey / productInsertToIdentityInput) are NOT mocked, so the
 * real in-batch dedup runs. */
const h = vi.hoisted(() => ({
  findExisting: vi.fn(),
  createWithIdentity: vi.fn(),
  matchAndSave: vi.fn(),
}));

vi.mock('@/services/products', () => ({
  findExistingProductForIdentity: h.findExisting,
  createProductWithIdentity: h.createWithIdentity,
}));
vi.mock('@/services/productMapper', () => ({
  matchAndSaveProduct: h.matchAndSave,
}));

import { importProductCatalog } from './productCatalogImport';

function candidate(over: Partial<ProductIntakeCandidate> & { rowIndex: number }): ProductIntakeCandidate {
  return {
    status: 'valid',
    insert: { brand: 'B', product_name_display: 'N' },
    warnings: [],
    skipReason: null,
    ...over,
  };
}

let nextId = 0;
const makeRow = () => {
  nextId += 1;
  return { id: `id-${nextId}`, product_code: `PR-ING-00000${nextId}` };
};

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 0;
  h.findExisting.mockResolvedValue(null);
  h.createWithIdentity.mockImplementation(() => Promise.resolve(makeRow()));
  h.matchAndSave.mockResolvedValue({});
});

describe('importProductCatalog — core outcomes', () => {
  it('creates a product for a valid candidate and collects its id + code', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(s.created).toBe(1);
    expect(h.createWithIdentity).toHaveBeenCalledTimes(1);
    expect(h.createWithIdentity).toHaveBeenCalledWith({ brand: 'B', product_name_display: 'N' });
    expect(s.productIds).toEqual(['id-1']);
    expect(s.productCodes).toEqual(['PR-ING-000001']);
    expect(s.rowResults[0]!.outcome).toBe('created');
  });

  it('returns an existing product (pre-check hit) and does NOT call create', async () => {
    h.findExisting.mockResolvedValue({ id: 'old-1', product_code: 'PR-ING-000099' });
    const s = await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(s.existingDuplicates).toBe(1);
    expect(h.createWithIdentity).not.toHaveBeenCalled();
    expect(s.rowResults[0]!.outcome).toBe('existing');
    expect(s.productIds).toEqual(['old-1']);
    expect(s.productCodes).toEqual(['PR-ING-000099']);
  });

  it('skips a skip-status candidate without any lookup or create', async () => {
    const s = await importProductCatalog([
      candidate({ rowIndex: 1, status: 'skip', skipReason: 'no usable identity' }),
    ]);
    expect(s.skipped).toBe(1);
    expect(h.findExisting).not.toHaveBeenCalled();
    expect(h.createWithIdentity).not.toHaveBeenCalled();
    expect(s.rowResults[0]!.outcome).toBe('skipped');
    expect(s.rowResults[0]!.skipReason).toBe('no usable identity');
  });

  it('flags an in-batch duplicate (same identity key) pointing at the earlier row, no lookup/create', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1 }), candidate({ rowIndex: 2 })]);
    expect(s.created).toBe(1);
    expect(s.inBatchDuplicates).toBe(1);
    expect(h.findExisting).toHaveBeenCalledTimes(1); // only the first row hit the DB
    expect(h.createWithIdentity).toHaveBeenCalledTimes(1);
    expect(s.rowResults[1]!.outcome).toBe('in_batch_duplicate');
    expect(s.rowResults[1]!.duplicateOfRowIndex).toBe(1);
  });

  it('carries the parser warnings through to the row result', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1, status: 'warning', warnings: ['missing brand'] })]);
    expect(s.rowResults[0]!.warnings).toContain('missing brand');
  });
});

describe('importProductCatalog — error isolation', () => {
  it('isolates a failed create (failed++), records the error, and continues by default', async () => {
    h.createWithIdentity.mockImplementation((insert: { brand: string }) =>
      insert.brand === 'D' ? Promise.reject(new Error('boom')) : Promise.resolve(makeRow()),
    );
    const s = await importProductCatalog([
      candidate({ rowIndex: 1, insert: { brand: 'D', product_name_display: 'N' } }),
      candidate({ rowIndex: 2, insert: { brand: 'E', product_name_display: 'N' } }),
    ]);
    expect(s.failed).toBe(1);
    expect(s.created).toBe(1);
    expect(s.rowResults[0]!.outcome).toBe('failed');
    expect(s.rowResults[0]!.error).toBe('boom');
  });

  it('continueOnError:false records the failing row then rethrows immediately', async () => {
    h.createWithIdentity.mockRejectedValue(new Error('boom'));
    await expect(importProductCatalog([candidate({ rowIndex: 1 })], { continueOnError: false })).rejects.toThrow('boom');
  });
});

describe('importProductCatalog — optional matching (runMatch)', () => {
  it('does NOT call matchAndSaveProduct by default', async () => {
    await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(h.matchAndSave).not.toHaveBeenCalled();
  });

  it('runMatch:true calls matchAndSaveProduct with the CREATED product id', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1 })], { runMatch: true });
    expect(h.matchAndSave).toHaveBeenCalledTimes(1);
    expect(h.matchAndSave).toHaveBeenCalledWith(s.rowResults[0]!.productId);
  });

  it('a match failure keeps the product CREATED (warning, not failure) and short-circuits later matches', async () => {
    h.matchAndSave.mockRejectedValue(new Error('No engine-approved reference ingredients available; cannot match.'));
    const s = await importProductCatalog(
      [
        candidate({ rowIndex: 1, insert: { brand: 'B', product_name_display: 'N' } }),
        candidate({ rowIndex: 2, insert: { brand: 'C', product_name_display: 'N' } }),
      ],
      { runMatch: true },
    );
    expect(s.created).toBe(2);
    expect(s.failed).toBe(0);
    expect(s.rowResults[0]!.outcome).toBe('created');
    expect(s.rowResults[0]!.warnings.some((w) => /match skipped/.test(w))).toBe(true);
    expect(s.warnings.some((w) => /matching unavailable/.test(w))).toBe(true);
    expect(h.matchAndSave).toHaveBeenCalledTimes(1); // short-circuited after the first failure
  });
});

describe('importProductCatalog — tally invariant', () => {
  it('created + existing + in_batch + skipped + failed === total across a mixed batch', async () => {
    h.findExisting.mockImplementation((insert: { brand: string }) =>
      Promise.resolve(insert.brand === 'E' ? { id: 'old-e', product_code: 'PR-ING-000050' } : null),
    );
    h.createWithIdentity.mockImplementation((insert: { brand: string }) =>
      insert.brand === 'D' ? Promise.reject(new Error('x')) : Promise.resolve(makeRow()),
    );
    const s = await importProductCatalog([
      candidate({ rowIndex: 1, status: 'skip', skipReason: 'no identity' }),
      candidate({ rowIndex: 2, insert: { brand: 'B', product_name_display: 'N' } }), // created
      candidate({ rowIndex: 3, insert: { brand: 'B', product_name_display: 'N' } }), // in-batch dup of row 2
      candidate({ rowIndex: 4, insert: { brand: 'D', product_name_display: 'N' } }), // failed
      candidate({ rowIndex: 5, insert: { brand: 'E', product_name_display: 'N' } }), // existing
    ]);
    expect(s.total).toBe(5);
    expect(s.skipped).toBe(1);
    expect(s.created).toBe(1);
    expect(s.inBatchDuplicates).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.existingDuplicates).toBe(1);
    expect(s.created + s.existingDuplicates + s.inBatchDuplicates + s.skipped + s.failed).toBe(s.total);
  });
});
