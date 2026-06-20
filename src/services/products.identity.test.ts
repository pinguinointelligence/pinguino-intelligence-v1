import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductRow } from '@/data/products/productRow';

/** Controllable fake backend: duplicate lookups resolve via h.lookup(column, value);
 * createProduct inserts resolve via h.insertResult / h.insertError. */
const h = vi.hoisted(() => ({
  lookup: (() => null) as (column: string, value: string) => unknown,
  lookupCalls: [] as Array<[string, string]>,
  insertResult: null as unknown,
  insertError: null as { message: string } | null,
  insertedPayloads: [] as Array<Record<string, unknown>>,
  insertAttempted: false,
}));

vi.mock('@/services/auth', () => ({
  getCurrentUser: () => Promise.resolve({ id: 'user-1' }),
}));

vi.mock('@/lib/supabase/client', () => {
  interface Builder {
    _col: string;
    _val: string;
    select: () => Builder;
    eq: (c: string, v: string) => Builder;
    limit: () => Builder;
    insert: (p: Record<string, unknown>) => Builder;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    single: () => Promise<{ data: unknown; error: unknown }>;
  }
  const make = (): Builder => {
    const b: Builder = {
      _col: '',
      _val: '',
      select: () => b,
      eq: (c, v) => {
        b._col = c;
        b._val = v;
        return b;
      },
      limit: () => b,
      insert: (p) => {
        h.insertAttempted = true;
        h.insertedPayloads.push(p);
        return b;
      },
      maybeSingle: () => {
        h.lookupCalls.push([b._col, b._val]);
        return Promise.resolve({ data: h.lookup(b._col, b._val), error: null });
      },
      single: () =>
        h.insertError
          ? Promise.resolve({ data: null, error: h.insertError })
          : Promise.resolve({ data: h.insertResult, error: null }),
    };
    return b;
  };
  return { supabase: { from: () => make() }, isSupabaseConfigured: true };
});

import { createProductWithIdentity, findExistingProductForIdentity } from './products';

const EXISTING = { id: 'existing-1', product_code: 'PR-ING-000005' } as unknown as ProductRow;
const CREATED = { id: 'created-1', product_code: 'PR-ING-000099' } as unknown as ProductRow;
const RACED = { id: 'raced-1', product_code: 'PR-ING-000100' } as unknown as ProductRow;

beforeEach(() => {
  h.lookup = () => null;
  h.lookupCalls = [];
  h.insertResult = null;
  h.insertError = null;
  h.insertedPayloads = [];
  h.insertAttempted = false;
});

describe('findExistingProductForIdentity — owner-scoped duplicate lookup', () => {
  it('checks columns in priority order: EAN → barcode → source_url → product_identity_hash', async () => {
    const r = await findExistingProductForIdentity({
      ean_code: '111',
      barcode: '222',
      source_url: 'http://x',
      brand: 'B',
      product_name_display: 'Milk',
    });
    expect(r).toBeNull();
    expect(h.lookupCalls.map(([c]) => c)).toEqual([
      'ean_code_normalized',
      'barcode_normalized',
      'source_url',
      'product_identity_hash',
    ]);
  });

  it('matches the NORMALIZED EAN (leading zeros preserved) and short-circuits', async () => {
    h.lookup = (col, val) => (col === 'ean_code_normalized' && val === '0049' ? EXISTING : null);
    const r = await findExistingProductForIdentity({ ean_code: '0-04 9', barcode: '222' });
    expect(r).toBe(EXISTING);
    expect(h.lookupCalls).toEqual([['ean_code_normalized', '0049']]); // stopped at EAN
  });

  it('SKIPS blank normalized EAN/barcode (never queries with an empty value)', async () => {
    h.lookup = (col) => (col === 'product_identity_hash' ? EXISTING : null);
    const r = await findExistingProductForIdentity({ brand: 'B', product_name_display: 'Milk' });
    expect(r).toBe(EXISTING);
    expect(h.lookupCalls.some(([, v]) => v === '')).toBe(false);
    expect(h.lookupCalls.map(([c]) => c)).toEqual(['product_identity_hash']); // EAN/barcode/source skipped
  });

  it('matches by normalized barcode after an EAN miss, and does NOT reach source_url / identity hash', async () => {
    h.lookup = (col, val) => (col === 'barcode_normalized' && val === '222' ? EXISTING : null);
    const r = await findExistingProductForIdentity({ ean_code: '111', barcode: '2-2 2', source_url: 'http://x' });
    expect(r).toBe(EXISTING);
    expect(h.lookupCalls.map(([c]) => c)).toEqual(['ean_code_normalized', 'barcode_normalized']); // short-circuit
  });

  it('matches by source_url after EAN/barcode miss, and does NOT reach the identity hash', async () => {
    h.lookup = (col, val) => (col === 'source_url' && val === 'http://x' ? EXISTING : null);
    const r = await findExistingProductForIdentity({ ean_code: '111', barcode: '222', source_url: 'http://x' });
    expect(r).toBe(EXISTING);
    expect(h.lookupCalls.map(([c]) => c)).toEqual(['ean_code_normalized', 'barcode_normalized', 'source_url']); // short-circuit
  });

  it('matches by product_identity_hash as the last resort', async () => {
    h.lookup = (col) => (col === 'product_identity_hash' ? EXISTING : null);
    const r = await findExistingProductForIdentity({ brand: 'Babbi', product_name_display: 'Crumble' });
    expect(r).toBe(EXISTING);
  });

  it('does NOT dedupe on a non-meaningful identity key (no brand and no name)', async () => {
    h.lookup = (col) => (col === 'product_identity_hash' ? EXISTING : null);
    const r = await findExistingProductForIdentity({ fat_percent: 30 }); // nutrition-only, no name/brand
    expect(r).toBeNull();
    expect(h.lookupCalls.some(([c]) => c === 'product_identity_hash')).toBe(false);
  });
});

describe('createProductWithIdentity — dedupe-then-create', () => {
  it('returns the existing product and does NOT insert when a duplicate exists', async () => {
    h.lookup = (col, val) => (col === 'ean_code_normalized' && val === '111' ? EXISTING : null);
    const r = await createProductWithIdentity({ ean_code: '111', product_name_display: 'Milk' });
    expect(r).toBe(EXISTING);
    expect(h.insertAttempted).toBe(false);
    expect(h.insertedPayloads).toHaveLength(0);
  });

  it('inserts a new row with the computed product_identity_hash and NO app-side product_code', async () => {
    h.insertResult = CREATED;
    const r = await createProductWithIdentity({ ean_code: '111', brand: 'Babbi', product_name_display: 'Crumble' });
    expect(r).toBe(CREATED);
    expect(h.insertedPayloads).toHaveLength(1);
    const payload = h.insertedPayloads[0]!;
    expect('product_identity_hash' in payload).toBe(true);
    expect(typeof payload.product_identity_hash).toBe('string');
    expect('product_code' in payload).toBe(false); // DB assigns it; never app-side
    expect(payload.owner_user_id).toBe('user-1');
  });

  it('is race-safe: on insert failure it re-runs the lookup and returns the concurrent row', async () => {
    // no dup before insert; after the insert is attempted (and fails), the EAN now resolves
    h.lookup = (col, val) => (h.insertAttempted && col === 'ean_code_normalized' && val === '111' ? RACED : null);
    h.insertError = { message: 'duplicate key value violates unique constraint "products_owner_ean_norm_uniq"' };
    const r = await createProductWithIdentity({ ean_code: '111', product_name_display: 'Milk' });
    expect(r).toBe(RACED);
  });

  it('rethrows the original error when the insert fails for a non-duplicate reason', async () => {
    h.lookup = () => null; // re-lookup also finds nothing
    h.insertError = { message: 'network down' };
    await expect(
      createProductWithIdentity({ ean_code: '111', product_name_display: 'Milk' }),
    ).rejects.toThrow('network down');
  });
});
