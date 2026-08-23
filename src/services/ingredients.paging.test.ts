/**
 * The Mapper is larger than one response. A single unpaged select is silently
 * capped by the server's row limit, and nothing downstream can tell a truncated
 * Mapper from a small one — it just matches fewer products.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ supabase: { from: h.from } }));

import { listActiveIngredients, SEARCH_DB_PAGE_ROWS } from './ingredients';

/** A query builder that records each requested range and answers from `rows`. */
function tableWith(rows: { ingredient_id: string }[], ranges: [number, number][]) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.range = vi.fn((from: number, to: number) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  });
  return builder;
}

describe('listActiveIngredients paging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps paging past the first response until a short page ends it', async () => {
    const rows = Array.from({ length: 2088 }, (_, i) => ({ ingredient_id: `PI-${i}` }));
    const ranges: [number, number][] = [];
    h.from.mockReturnValue(tableWith(rows, ranges));

    const loaded = await listActiveIngredients();

    // Every active row arrives, not just the first page.
    expect(loaded).toHaveLength(2088);
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0]).toEqual([0, SEARCH_DB_PAGE_ROWS - 1]);
  });

  it('stops after one request when the table is smaller than a page', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ ingredient_id: `PI-${i}` }));
    const ranges: [number, number][] = [];
    h.from.mockReturnValue(tableWith(rows, ranges));

    await expect(listActiveIngredients()).resolves.toHaveLength(10);
    expect(ranges).toHaveLength(1);
  });
});
