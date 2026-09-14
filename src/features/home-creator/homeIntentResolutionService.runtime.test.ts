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
import { parseIntent } from './homeIntentParsing';
import { resolveChipTerm } from './homeIntentResolutionService';

const row = (
  id: string,
  name: string,
  subcategory = 'fresh_fruit_profile',
): SafeMapperSearchRow => ({
  ingredient_id: id,
  ingredient_name_display: name,
  ingredient_name_internal: name,
  ingredient_category: 'Fruit',
  ingredient_subcategory: subcategory,
  vegan: null,
  dairy_free: null,
  gluten_free: null,
  contains_alcohol: null,
  approved_for_base: true,
  approved_for_engines: true,
  dataset_version: 'test',
});

const freshBanana = row('PI-ING-000345', 'BANANA · Fresh Fruit');
const bananaPuree = row('PI-ING-001589', 'BANANA · Puree', 'fruit_puree');
const bananaPaste = row(
  'PI-ING-000188',
  'BANANA · Fabbri Cream · Chilled · 0004282',
  'liquid',
);

const parsedBananoweChip = () => {
  const term = parseIntent('bananowe').terms[0];
  expect(term).toBeDefined();
  expect(term!.concept).toBe('banana');
  expect(term!.fuzzy).toBe(false);
  return { label: term!.normalized, concept: term!.concept };
};

const parsedBananChip = () => {
  const term = parseIntent('banan').terms[0];
  expect(term).toBeDefined();
  expect(term!.concept).toBe('banana');
  expect(term!.fuzzy).toBe(false);
  return { label: term!.normalized, concept: term!.concept };
};

describe('HOME central result consumption', () => {
  beforeEach(() => mocks.search.mockReset());

  it('HOME-ADD-01: passes the raw intent once and asks when central results are ambiguous', async () => {
    const first = row('PI-ALMOND-RAW', 'Almond · Raw');
    const second = row('PI-ALMOND-PASTE', 'Almond Paste');
    mocks.search.mockResolvedValue({
      kind: 'results',
      rows: [first, second],
      hasMore: false,
    });

    await expect(resolveChipTerm({ label: '  migdal  ', concept: 'almond' })).resolves.toEqual({
      kind: 'ambiguous',
      candidates: [first, second],
    });
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(mocks.search).toHaveBeenNthCalledWith(1, {
      text: 'migdal',
      limit: 40,
      signal: undefined,
    });
    expect(mocks.search).toHaveBeenNthCalledWith(2, {
      text: 'almond',
      limit: 40,
      signal: undefined,
    });
  });

  it('HOME-ADD-02: fails closed when the central resolver has no legal result', async () => {
    mocks.search.mockResolvedValue({ kind: 'results', rows: [], hasMore: false });

    await expect(resolveChipTerm({ label: 'unlisted', concept: null })).resolves.toEqual({
      kind: 'unresolved',
    });
  });

  it('HOME-BANANA-01: bananowe resolves without a product-choice result', async () => {
    mocks.search.mockResolvedValue({
      kind: 'results',
      rows: [bananaPuree, bananaPaste, freshBanana],
      hasMore: false,
    });

    await expect(resolveChipTerm(parsedBananoweChip())).resolves.toMatchObject({
      kind: 'resolved',
    });
  });

  it('HOME-BANANA-02: bananowe resolves the canonical Fresh Banana automatically', async () => {
    mocks.search.mockResolvedValue({
      kind: 'results',
      rows: [bananaPuree, freshBanana],
      hasMore: false,
    });

    await expect(resolveChipTerm(parsedBananoweChip())).resolves.toMatchObject({
      kind: 'resolved',
      row: {
        ingredient_id: freshBanana.ingredient_id,
        ingredient_name_display: freshBanana.ingredient_name_display,
      },
    });
  });

  it('HOME-BANANA-03: commercial banana forms cannot outrank canonical Fresh Banana', async () => {
    mocks.search.mockResolvedValue({
      kind: 'results',
      rows: [bananaPaste, bananaPuree, freshBanana],
      hasMore: false,
    });

    const result = await resolveChipTerm(parsedBananoweChip());
    expect(result).toMatchObject({
      kind: 'resolved',
      row: {
        ingredient_id: freshBanana.ingredient_id,
        ingredient_name_display: freshBanana.ingredient_name_display,
      },
    });
    expect(result.kind === 'resolved' && result.row.ingredient_id).not.toBe(
      bananaPuree.ingredient_id,
    );
    expect(result.kind === 'resolved' && result.row.ingredient_id).not.toBe(
      bananaPaste.ingredient_id,
    );
  });

  it('HOME-BANANA-FLOW-01: banan resolves exact Fresh Banana without product disambiguation', async () => {
    mocks.search.mockResolvedValue({
      kind: 'results',
      rows: [bananaPaste, bananaPuree, freshBanana],
      hasMore: false,
    });

    const result = await resolveChipTerm(parsedBananChip());
    expect(result).toMatchObject({
      kind: 'resolved',
      row: {
        ingredient_id: freshBanana.ingredient_id,
        ingredient_name_display: freshBanana.ingredient_name_display,
      },
    });
    expect(result.kind).not.toBe('ambiguous');
  });
});
