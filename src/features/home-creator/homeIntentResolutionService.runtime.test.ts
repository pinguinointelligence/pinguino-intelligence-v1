import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock('@/services/productPicker/mapperSearch', () => ({
  searchCanonicalMapperIngredients: mocks.search,
}));

vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: vi.fn(),
}));

vi.mock('@/data/ingredients/ingredientMapper', () => ({
  ingredientRowToEngineIngredient: vi.fn(),
}));

import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import { resolveChipTerm } from './homeIntentResolutionService';

const row = (id: string, name: string): SafeMapperSearchRow => ({
  ingredient_id: id,
  ingredient_name_display: name,
  ingredient_name_internal: name,
  ingredient_category: 'Fruit',
  ingredient_subcategory: 'fresh_fruit_profile',
  vegan: null,
  dairy_free: null,
  gluten_free: null,
  contains_alcohol: null,
  approved_for_base: true,
  approved_for_engines: true,
  dataset_version: 'test',
});

describe('HOME central result consumption', () => {
  beforeEach(() => mocks.search.mockReset());

  it('HOME-ADD-01: passes the raw intent once and automatically selects central #1', async () => {
    const first = row('PI-BANANA-FRESH', 'Banana · Fresh Fruit');
    const second = row('PI-BANANA-POWDER', 'Banana Powder');
    mocks.search.mockResolvedValue({
      kind: 'results',
      rows: [first, second],
      hasMore: false,
    });

    await expect(resolveChipTerm({ label: '  banan  ', concept: 'banana' })).resolves.toEqual({
      kind: 'resolved',
      row: first,
    });
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith({
      text: 'banan',
      limit: 40,
      signal: undefined,
    });
  });

  it('HOME-ADD-02: fails closed when the central resolver has no legal result', async () => {
    mocks.search.mockResolvedValue({ kind: 'results', rows: [], hasMore: false });

    await expect(resolveChipTerm({ label: 'banan', concept: 'banana' })).resolves.toEqual({
      kind: 'unresolved',
    });
  });
});
