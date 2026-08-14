import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

/** Hoisted spies for the two services the importer orchestrates. The pure identity
 * helpers (productIdentityKey / productInsertToIdentityInput) are NOT mocked, so the
 * real in-batch dedup runs. */
const h = vi.hoisted(() => ({
  createWithIdentityResult: vi.fn(),
  matchAndSave: vi.fn(),
}));

vi.mock('@/services/products', () => ({
  createProductWithIdentityResult: h.createWithIdentityResult,
}));
vi.mock('@/services/productMapper', () => ({
  matchAndSaveProduct: h.matchAndSave,
}));

import { importProductCatalog } from './productCatalogImport';

function candidate(
  over: Partial<ProductIntakeCandidate> & { rowIndex: number },
): ProductIntakeCandidate {
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
  h.createWithIdentityResult.mockImplementation(() => {
    const product = makeRow();
    return Promise.resolve({ product, ingest: { kind: 'created' } });
  });
  h.matchAndSave.mockResolvedValue({});
});

describe('importProductCatalog — snapshots (best-effort)', () => {
  it('records a created-product snapshot on create, and does not match by default', async () => {
    await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(h.createWithIdentityResult).toHaveBeenCalledTimes(1);
    expect(h.matchAndSave).not.toHaveBeenCalled();
  });

  it('snapshots a changed existing source, never failing the row', async () => {
    const existing = { id: 'id-existing', product_code: 'PR-ING-000099' };
    h.createWithIdentityResult.mockResolvedValue({
      product: existing,
      ingest: { kind: 'existing' },
    });
    const s = await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(s.existingDuplicates).toBe(1);
    expect(h.createWithIdentityResult).toHaveBeenCalledOnce();
  });

  it('snapshot:false disables snapshot writes', async () => {
    await importProductCatalog([candidate({ rowIndex: 1 })], { snapshot: false });
    expect(h.createWithIdentityResult).toHaveBeenCalledTimes(1);
  });
});

describe('importProductCatalog — core outcomes', () => {
  it('creates a product for a valid candidate and collects its id + code', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(s.created).toBe(1);
    expect(h.createWithIdentityResult).toHaveBeenCalledTimes(1);
    expect(h.createWithIdentityResult).toHaveBeenCalledWith({
      brand: 'B',
      product_name_display: 'N',
    });
    expect(s.productIds).toEqual(['id-1']);
    expect(s.productCodes).toEqual(['PR-ING-000001']);
    expect(s.rowResults[0]!.outcome).toBe('created');
  });

  it('reports an existing product but still traverses canonical ingest', async () => {
    const existing = { id: 'old-1', product_code: 'PR-ING-000099' };
    h.createWithIdentityResult.mockResolvedValue({
      product: existing,
      ingest: { kind: 'existing' },
    });
    const s = await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(s.existingDuplicates).toBe(1);
    expect(h.createWithIdentityResult).toHaveBeenCalledOnce();
    expect(s.rowResults[0]!.outcome).toBe('existing');
    expect(s.productIds).toEqual(['old-1']);
    expect(s.productCodes).toEqual(['PR-ING-000099']);
  });

  it('skips a skip-status candidate without any lookup or create', async () => {
    const s = await importProductCatalog([
      candidate({ rowIndex: 1, status: 'skip', skipReason: 'no usable identity' }),
    ]);
    expect(s.skipped).toBe(1);
    expect(h.createWithIdentityResult).not.toHaveBeenCalled();
    expect(s.rowResults[0]!.outcome).toBe('skipped');
    expect(s.rowResults[0]!.skipReason).toBe('no usable identity');
  });

  it('flags an in-batch duplicate (same identity key) pointing at the earlier row, no lookup/create', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1 }), candidate({ rowIndex: 2 })]);
    expect(s.created).toBe(1);
    expect(s.inBatchDuplicates).toBe(1);
    expect(h.createWithIdentityResult).toHaveBeenCalledTimes(1);
    expect(s.rowResults[1]!.outcome).toBe('in_batch_duplicate');
    expect(s.rowResults[1]!.duplicateOfRowIndex).toBe(1);
  });

  it('carries the parser warnings through to the row result', async () => {
    const s = await importProductCatalog([
      candidate({ rowIndex: 1, status: 'warning', warnings: ['missing brand'] }),
    ]);
    expect(s.rowResults[0]!.warnings).toContain('missing brand');
  });
});

describe('importProductCatalog — error isolation', () => {
  it('isolates a failed create (failed++), records the error, and continues by default', async () => {
    h.createWithIdentityResult.mockImplementation((insert: { brand: string }) => {
      if (insert.brand === 'D') return Promise.reject(new Error('boom'));
      const product = makeRow();
      return Promise.resolve({ product, ingest: { kind: 'created' } });
    });
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
    h.createWithIdentityResult.mockRejectedValue(new Error('boom'));
    await expect(
      importProductCatalog([candidate({ rowIndex: 1 })], { continueOnError: false }),
    ).rejects.toThrow('boom');
  });
});

describe('importProductCatalog — optional matching (runMatch)', () => {
  it('does NOT call matchAndSaveProduct by default', async () => {
    await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(h.matchAndSave).not.toHaveBeenCalled();
  });

  it('runMatch:true delegates classification to canonical ingest', async () => {
    const s = await importProductCatalog([candidate({ rowIndex: 1 })], { runMatch: true });
    expect(h.matchAndSave).not.toHaveBeenCalled();
    expect(s.warnings).toContain(
      'Legacy client-side Mapper matching is ignored; canonical ingest owns classification.',
    );
  });

  it('a match failure keeps the product CREATED (warning, not failure) and short-circuits later matches', async () => {
    h.matchAndSave.mockRejectedValue(
      new Error('No engine-approved reference ingredients available; cannot match.'),
    );
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
    expect(s.warnings).toContain(
      'Legacy client-side Mapper matching is ignored; canonical ingest owns classification.',
    );
    expect(h.matchAndSave).not.toHaveBeenCalled();
  });
});

describe('importProductCatalog — tally invariant', () => {
  it('created + existing + in_batch + skipped + failed === total across a mixed batch', async () => {
    h.createWithIdentityResult.mockImplementation((insert: { brand: string }) => {
      if (insert.brand === 'D') return Promise.reject(new Error('x'));
      if (insert.brand === 'E') {
        return Promise.resolve({
          product: { id: 'old-e', product_code: 'PR-ING-000050' },
          ingest: { kind: 'existing' },
        });
      }
      const product = makeRow();
      return Promise.resolve({ product, ingest: { kind: 'created' } });
    });
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
    expect(s.created + s.existingDuplicates + s.inBatchDuplicates + s.skipped + s.failed).toBe(
      s.total,
    );
  });
});
