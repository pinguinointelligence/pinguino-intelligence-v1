import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenFoodFactsProduct } from './openFoodFacts';

afterEach(() => vi.restoreAllMocks());

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

describe('fetchOpenFoodFactsProduct', () => {
  it('parses a found product (read-only, keyless)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok({ status: 1, code: '3017620422003', product: { product_name: 'Nutella', nutriments: { fat_100g: 30.9, sugars_100g: 56.3 } } }),
      ),
    );
    const off = await fetchOpenFoodFactsProduct('3017620422003');
    expect(off.found).toBe(true);
    expect(off.name).toBe('Nutella');
    expect(off.nutrition.fat_percent).toBe(30.9);
    expect(off.source).toBe('public_composition_db');
  });

  it('treats a 404 (unknown product) as not-found without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const off = await fetchOpenFoodFactsProduct('0000000000000');
    expect(off.found).toBe(false);
  });

  it('throws on a non-404 error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(fetchOpenFoodFactsProduct('1')).rejects.toThrow(/failed/);
  });

  it('sends no API key / Authorization header', async () => {
    const spy = vi.fn(async () => ok({ status: 0 }));
    vi.stubGlobal('fetch', spy);
    await fetchOpenFoodFactsProduct('1');
    const calls = spy.mock.calls as unknown as Array<[string, RequestInit?]>;
    const init = calls[0]?.[1];
    const headerKeys = Object.keys((init?.headers ?? {}) as Record<string, string>).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
    expect(headerKeys.some((k) => k.includes('key') || k.includes('token'))).toBe(false);
  });
});
