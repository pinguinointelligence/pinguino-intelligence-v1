import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  getRichRow: vi.fn(),
}));

vi.mock('@/services/productPicker/mapperSearch', () => ({
  searchCanonicalMapperIngredients: mocks.search,
}));

vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: mocks.getRichRow,
}));

import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { useHomeIntentIngredients } from './useHomeIntentIngredients';
import { useRecipeStore } from '@/stores/recipeStore';

const BANANA_ID = 'PI-ING-000345';
const bananaRow: SafeMapperSearchRow = {
  ingredient_id: BANANA_ID,
  ingredient_name_display: 'BANANA · Fresh Fruit',
  ingredient_name_internal: 'banana',
  ingredient_category: 'Fruit',
  ingredient_subcategory: 'fresh_fruit_profile',
  vegan: null,
  dairy_free: null,
  gluten_free: null,
  contains_alcohol: null,
  approved_for_base: true,
  approved_for_engines: true,
  dataset_version: 'v1.0',
};

const rawChip: IntentChip = {
  id: 'intent-banana',
  label: 'banana',
  concept: 'banana',
  role: null,
  source: 'text',
  productId: null,
  productName: null,
  ambiguous: false,
};

function hook() {
  let api: ReturnType<typeof useHomeIntentIngredients>;
  const Probe = () => {
    api = useHomeIntentIngredients();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return api!;
}

beforeEach(() => {
  mocks.search.mockReset();
  mocks.getRichRow.mockReset();
  useHomeDraftStore.getState().startNew();
  useRecipeStore.setState({ items: [], toppings: [], baseOrder: [], priority_mode: 'AUTO' });
});

describe('served G — central HOME result reaches the recipe', () => {
  it('HOME-G-01 keeps central #1 through anonymous hydration and recipe insertion', async () => {
    mocks.search.mockResolvedValue({ kind: 'results', rows: [bananaRow], hasMore: false });
    mocks.getRichRow.mockRejectedValue(
      new Error('permission denied for view mapper_basement_search'),
    );
    useHomeDraftStore.getState().addChip(rawChip);

    const api = hook();
    await expect(api.resolveOne(rawChip)).resolves.toMatchObject({ status: 'added' });
    const resolved = useHomeDraftStore.getState().chips[0]!;
    expect(resolved.productId).toBe(BANANA_ID);

    const materialized = await api.addResolvedChip(resolved);
    expect(materialized).toMatchObject({
      chipId: rawChip.id,
      status: 'needs_amount',
      ingredient: {
        id: BANANA_ID,
        name: bananaRow.ingredient_name_display,
        identity_provenance: 'mapper',
      },
    });
    expect(useRecipeStore.getState().items).toHaveLength(0);

    // HOME's existing amount prompt confirms mass before creating the final row.
    useRecipeStore.getState().addIngredient(materialized.ingredient!, 120);
    const inserted = useRecipeStore
      .getState()
      .items.find((item) => canonicalIngredientId(item.ingredient) === BANANA_ID);

    expect(inserted?.ingredient.id).toBe(BANANA_ID);
    expect(inserted?.ingredient.name).toBe(bananaRow.ingredient_name_display);
    expect(inserted?.ingredient.identity_provenance).toBe('mapper');
  });
});
