import { describe, expect, it, vi } from 'vitest';
import type { IntimportCandidate } from '@/data/products/intimport';
import type { ValidBarcode } from '@/features/product-scanner/barcode';
import type { ScanExactProduct } from '@/services/productScanner';
import { loadIntimportCanonicalExactMatches } from './intimportCanonicalLookup';

const candidate = (rowIndex: number, ean: string | null): IntimportCandidate =>
  ({ rowIndex, ean, insert: {}, source: {} }) as IntimportCandidate;

const exact = (id: string): ScanExactProduct =>
  ({ id, productCode: 'PR-ING-000001', eans: [] }) as unknown as ScanExactProduct;

describe('INTIMPORT canonical exact lookup', () => {
  it('reuses the Scanner exact-barcode authority once per unique valid GTIN', async () => {
    const lookup = vi.fn(async (barcode: ValidBarcode) =>
      barcode.lookupValue === '5900120025578' ? exact('canonical-pr') : null,
    );
    const result = await loadIntimportCanonicalExactMatches(
      [candidate(1, '5900120025578'), candidate(2, '5900120025578'), candidate(3, null)],
      lookup,
    );

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result.attempted).toBe(1);
    expect(result.index.byBarcode?.(['5900120025578'])).toBe('canonical-pr');
  });

  it('ignores invalid EANs and fails open to research/server canonicalization on read failure', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('temporary catalogue read failure');
    });
    const result = await loadIntimportCanonicalExactMatches(
      [candidate(1, '123'), candidate(2, '5900120025578')],
      lookup,
    );

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
    expect(result.index.byBarcode?.(['5900120025578'])).toBeNull();
  });
});
