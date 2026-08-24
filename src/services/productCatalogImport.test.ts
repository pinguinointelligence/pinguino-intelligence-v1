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
    expect(h.createWithIdentityResult).toHaveBeenCalledWith(
      { brand: 'B', product_name_display: 'N' },
      { duplicateDecision: null },
    );
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

describe('importProductCatalog — identity preflight and re-import (§15/§16)', () => {
  it('asks the ingest for a DISTINCT product when the preflight proved one', async () => {
    await importProductCatalog([
      candidate({ rowIndex: 1 }),
      candidate({ rowIndex: 2, forceDistinctIdentity: true }),
    ]);
    expect(h.createWithIdentityResult).toHaveBeenNthCalledWith(1, expect.anything(), {
      duplicateDecision: null,
    });
    expect(h.createWithIdentityResult).toHaveBeenNthCalledWith(2, expect.anything(), {
      duplicateDecision: 'different',
    });
  });

  it('does not let the weaker in-batch key merge a row proved distinct', async () => {
    // Both rows carry the SAME weak identity payload, so without the preflight
    // verdict the second would be dropped as an in-batch duplicate.
    const summary = await importProductCatalog([
      candidate({ rowIndex: 1 }),
      candidate({ rowIndex: 2, forceDistinctIdentity: true }),
    ]);
    expect(summary.inBatchDuplicates).toBe(0);
    expect(summary.created).toBe(2);
  });

  it('still collapses a true in-batch duplicate when nothing proved otherwise', async () => {
    const summary = await importProductCatalog([
      candidate({ rowIndex: 1 }),
      candidate({ rowIndex: 2 }),
    ]);
    expect(summary.inBatchDuplicates).toBe(1);
    expect(summary.created).toBe(1);
  });

  it('counts a replayed ingest as reuse, not as a fresh creation', async () => {
    // The server replays a prior ingest: the snapshot it returns is the ORIGINAL
    // one, so its kind still says `created`. Only `idempotent` tells the truth.
    h.createWithIdentityResult.mockResolvedValue({
      product: { id: 'id-1', product_code: 'PR-ING-000001' },
      ingest: { kind: 'created', idempotent: true },
    });
    const summary = await importProductCatalog([candidate({ rowIndex: 1 })]);
    expect(summary.created).toBe(0);
    expect(summary.existingDuplicates).toBe(1);
    expect(summary.rowResults[0]!.outcome).toBe('existing');
  });
});

describe('importProductCatalog — progress and systemic failure', () => {
  it('reports progress after every row', async () => {
    const seen: number[] = [];
    await importProductCatalog(
      [candidate({ rowIndex: 1 }), candidate({ rowIndex: 2, forceDistinctIdentity: true })],
      { onProgress: (p) => seen.push(p.processed) },
    );
    expect(seen).toEqual([1, 2]);
  });

  it('stops after repeated identical failures instead of failing 800 rows the same way', async () => {
    h.createWithIdentityResult.mockRejectedValue(new Error('limit zapisów (daily)'));
    const rows = Array.from({ length: 40 }, (_, i) =>
      candidate({ rowIndex: i + 1, forceDistinctIdentity: true }),
    );
    const summary = await importProductCatalog(rows, { stopAfterRepeatedFailures: 5 });
    expect(summary.failed).toBe(5);
    expect(summary.stopped?.reason).toContain('daily');
    expect(summary.stopped?.remaining).toBe(35);
    // The remaining rows were never attempted, so they can be resumed cleanly.
    expect(h.createWithIdentityResult).toHaveBeenCalledTimes(5);
  });

  it('does not stop on scattered, differing failures', async () => {
    let n = 0;
    h.createWithIdentityResult.mockImplementation(() => {
      n += 1;
      if (n % 2 === 0) return Promise.reject(new Error(`inny błąd ${n}`));
      return Promise.resolve({ product: makeRow(), ingest: { kind: 'created' } });
    });
    const rows = Array.from({ length: 12 }, (_, i) =>
      candidate({ rowIndex: i + 1, forceDistinctIdentity: true }),
    );
    const summary = await importProductCatalog(rows, { stopAfterRepeatedFailures: 5 });
    expect(summary.stopped).toBeUndefined();
    expect(summary.rowResults).toHaveLength(12);
  });

  it('stops before the next row when cooperative cancellation is requested', async () => {
    let cancelled = false;
    const recordOutcome = vi.fn().mockResolvedValue(undefined);
    const rows = [
      candidate({ rowIndex: 1 }),
      candidate({ rowIndex: 2, forceDistinctIdentity: true }),
    ];
    const summary = await importProductCatalog(rows, {
      importRun: {
        id: '11111111-1111-4111-8111-111111111111',
        shouldCancel: () => cancelled,
        recordOutcome,
      },
      onProgress: () => {
        cancelled = true;
      },
    });
    expect(h.createWithIdentityResult).toHaveBeenCalledTimes(1);
    expect(summary.cancelled).toEqual({ afterRowIndex: 1, remaining: 1 });
    expect(summary.rowResults).toHaveLength(1);
  });

  it('passes durable run and row identity into the canonical ingest', async () => {
    await importProductCatalog([candidate({ rowIndex: 7 })], {
      importRun: {
        id: '11111111-1111-4111-8111-111111111111',
        shouldCancel: () => false,
        recordOutcome: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(h.createWithIdentityResult).toHaveBeenCalledWith(expect.anything(), {
      duplicateDecision: null,
      importRun: {
        id: '11111111-1111-4111-8111-111111111111',
        rowIndex: 7,
        sourceRowId: null,
        displayName: 'N',
      },
    });
  });

  it('records skipped and failed rows in the durable run ledger', async () => {
    const recordOutcome = vi.fn().mockResolvedValue(undefined);
    h.createWithIdentityResult.mockRejectedValue(new Error('row refused'));
    await importProductCatalog(
      [
        candidate({ rowIndex: 1, status: 'skip', skipReason: 'no identity' }),
        candidate({ rowIndex: 2, forceDistinctIdentity: true }),
      ],
      {
        importRun: {
          id: '11111111-1111-4111-8111-111111111111',
          shouldCancel: () => false,
          recordOutcome,
        },
      },
    );
    expect(recordOutcome).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowIndex: 1, outcome: 'SKIPPED', error: 'no identity' }),
    );
    expect(recordOutcome).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowIndex: 2, outcome: 'FAILED', error: 'row refused' }),
    );
  });
});
