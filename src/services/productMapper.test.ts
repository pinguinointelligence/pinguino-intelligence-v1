import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';

/** Hoisted spies for the orchestrator's three composed calls. matchProduct is a
 * spy that DELEGATES to the real pure matcher (so it runs for real AND we can assert
 * whether/when/with-what it was invoked). */
const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  listEngineApprovedIngredients: vi.fn(),
  saveProductMatchResult: vi.fn(),
  matchProduct: vi.fn(),
}));

vi.mock('@/services/products', () => ({
  getProduct: h.getProduct,
  saveProductMatchResult: h.saveProductMatchResult,
}));
vi.mock('@/services/ingredients', () => ({
  listEngineApprovedIngredients: h.listEngineApprovedIngredients,
}));
vi.mock('@/data/products/productMatcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/products/productMatcher')>();
  h.matchProduct.mockImplementation(actual.matchProduct); // real logic, but spy-able
  return { ...actual, matchProduct: h.matchProduct };
});

import { matchAndSaveProduct } from './productMapper';

/** Minimal fixtures — only the fields the real matchProduct reads. An EAN match
 * (product.ean_code === basement.ean_code) yields a deterministic exact_ean hit. */
const PRODUCT = {
  id: 'P-1',
  ean_code: '111',
  product_name_display: 'Milk',
  pac_value: 5,
  pod_value: 5,
} as unknown as ProductRow;

const BASEMENT = [
  {
    ingredient_id: 'B-1',
    ean_code: '111',
    ingredient_name_display: 'Milk',
    verification_status: 'verified',
    pac_value: 1,
    pod_value: 1,
  },
] as unknown as IngredientRow[];

/** A realistic persisted row: the 11 mapper columns as the write-back would store them. */
const UPDATED = {
  id: 'P-1',
  matched_basement_id: 'B-1',
  match_confidence: 'exact',
  match_method: 'exact_ean',
  mapper_status: 'matched',
  mapper_notes: null,
  normalized_name: 'milk',
  normalized_category: null,
  needs_review_reason: null,
  missing_fields_json: [],
  candidate_ids: ['B-1'],
  candidate_count: 1,
} as unknown as ProductRow;

describe('matchAndSaveProduct — orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getProduct.mockResolvedValue(PRODUCT);
    h.listEngineApprovedIngredients.mockResolvedValue(BASEMENT);
    h.saveProductMatchResult.mockResolvedValue(UPDATED);
  });

  it('reads product + basement, runs the matcher on both, persists, and returns exactly the three facts', async () => {
    const result = await matchAndSaveProduct('P-1');

    expect(h.getProduct).toHaveBeenCalledWith('P-1');
    expect(h.listEngineApprovedIngredients).toHaveBeenCalledTimes(1);

    // the matcher ran on the loaded product AND basement (proves both reads fed it)
    expect(h.matchProduct).toHaveBeenCalledWith(PRODUCT, BASEMENT);
    // the REAL pure matcher computed an exact-EAN hit against B-1
    expect(result.match.match_method).toBe('exact_ean');
    expect(result.match.matched_basement_id).toBe('B-1');

    // strict call ORDER: getProduct -> listBasement -> matchProduct -> save
    const ord = (m: { mock: { invocationCallOrder: number[] } }) => m.mock.invocationCallOrder[0]!;
    expect(ord(h.getProduct)).toBeLessThan(ord(h.listEngineApprovedIngredients));
    expect(ord(h.listEngineApprovedIngredients)).toBeLessThan(ord(h.matchProduct));
    expect(ord(h.matchProduct)).toBeLessThan(ord(h.saveProductMatchResult));

    // persisted the SAME computed match (by reference) under the same id
    expect(h.saveProductMatchResult).toHaveBeenCalledTimes(1);
    const [savedId, savedMatch] = h.saveProductMatchResult.mock.calls[0]!;
    expect(savedId).toBe('P-1');
    expect(savedMatch).toBe(result.match);

    // returns EXACTLY { product (pre-write), match (computed), updatedProduct (persisted) }
    expect(Object.keys(result).sort()).toEqual(['match', 'product', 'updatedProduct']);
    expect(result.product).toBe(PRODUCT);
    expect(result.updatedProduct).toBe(UPDATED);
  });

  it('throws "Product not found or not owned." when the product is null — never reads basement, never matches, never saves', async () => {
    h.getProduct.mockResolvedValue(null);
    await expect(matchAndSaveProduct('missing')).rejects.toThrow('Product not found or not owned.');
    expect(h.listEngineApprovedIngredients).not.toHaveBeenCalled();
    expect(h.matchProduct).not.toHaveBeenCalled();
    expect(h.saveProductMatchResult).not.toHaveBeenCalled();
  });

  it('throws on an empty basement — never runs the matcher, never saves an "unmatched" result', async () => {
    h.listEngineApprovedIngredients.mockResolvedValue([]);
    await expect(matchAndSaveProduct('P-1')).rejects.toThrow(
      'No engine-approved reference ingredients available; cannot match.',
    );
    expect(h.matchProduct).not.toHaveBeenCalled();
    expect(h.saveProductMatchResult).not.toHaveBeenCalled();
  });
});
