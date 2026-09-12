import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; args: unknown[] }>,
  searchProducts: vi.fn(),
  publicRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/services/globalCatalog', () => ({
  searchProducts: mocks.searchProducts,
}));

vi.mock('@/features/mapper-search-runtime', () => ({
  planMapperCatalogSearch: vi.fn(async () => ({
    blocked: false,
    tokenGroups: [['banan', 'banana', 'platan']],
  })),
}));

vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: vi.fn(async () => {
    throw new Error('permission denied for view mapper_basement_search');
  }),
}));

vi.mock('@/services/products', () => ({ getProduct: vi.fn() }));

vi.mock('@/lib/supabase/client', () => {
  const makeBuilder = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'or', 'eq', 'order', 'range', 'abortSignal']) {
      builder[method] = (...args: unknown[]) => {
        mocks.calls.push({ method, args });
        return builder;
      };
    }
    builder.then = (onOk: (value: unknown) => unknown) =>
      Promise.resolve({ data: mocks.publicRows, error: null }).then(onOk);
    return builder;
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (...args: unknown[]) => {
        mocks.calls.push({ method: 'from', args });
        return makeBuilder();
      },
    },
  };
});

import { DEMO_SEARCH_VIEW } from '@/services/productPicker/mapperSearch';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { useHomeIntentIngredients } from './useHomeIntentIngredients';
import { useRecipeStore } from '@/stores/recipeStore';

const BANANA_ID = 'PI-ING-000345';
const safeRow = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  ingredient_id: 'PI-ING-000188',
  ingredient_name_display: 'BANANA · Fabbri Cream · Chilled · 0004282',
  ingredient_name_internal: 'delipaste_banana_fabbri_0004282',
  ingredient_category: 'dairy',
  ingredient_subcategory: 'liquid',
  vegan: 'unknown',
  dairy_free: 'false',
  gluten_free: 'unknown',
  contains_alcohol: 'false',
  approved_for_base: true,
  approved_for_engines: true,
  dataset_version: 'v1.0',
  ...overrides,
});

const chip: IntentChip = {
  id: 'served-anonymous-banana',
  label: 'banana',
  concept: 'banana',
  role: null,
  source: 'text',
  productId: null,
  productName: null,
  ambiguous: false,
};

function renderHook() {
  let api: ReturnType<typeof useHomeIntentIngredients>;
  const Probe = () => {
    api = useHomeIntentIngredients();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return api!;
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.searchProducts.mockReset();
  mocks.searchProducts.mockRejectedValue(
    new Error('permission denied for function search_products_v1'),
  );
  // Public view order is intentionally non-authoritative: the accepted ranker
  // must still recover Fresh Fruit as central HOME #1.
  mocks.publicRows = [
    safeRow({}),
    safeRow({
      ingredient_id: BANANA_ID,
      ingredient_name_display: 'BANANA · Fresh Fruit',
      ingredient_name_internal: 'banana',
      ingredient_category: 'fruit',
      ingredient_subcategory: 'fresh_fruit_profile',
      vegan: 'true',
      dairy_free: 'true',
    }),
    safeRow({
      ingredient_id: 'PI-ING-001589',
      ingredient_name_display: 'BANANA · Puree',
      ingredient_name_internal: 'banana_puree',
      ingredient_category: 'fruit',
      ingredient_subcategory: 'fruit_puree',
      vegan: 'true',
      dairy_free: 'true',
    }),
  ];
  useHomeDraftStore.getState().startNew();
  useRecipeStore.setState({ items: [], toppings: [], baseOrder: [], priority_mode: 'AUTO' });
});

describe('served G anonymous capability fallback', () => {
  it('HOME-G-02 preserves public-safe canonical #1 through exact recipe insertion', async () => {
    useHomeDraftStore.getState().addChip(chip);
    const api = renderHook();

    await expect(api.resolveOne(chip)).resolves.toMatchObject({ status: 'added' });
    const resolved = useHomeDraftStore.getState().chips[0]!;
    expect(resolved).toMatchObject({
      productId: BANANA_ID,
      productName: 'BANANA · Fresh Fruit',
    });
    expect(mocks.searchProducts).toHaveBeenCalledOnce();
    expect(mocks.calls.find((call) => call.method === 'from')?.args).toEqual([
      DEMO_SEARCH_VIEW,
    ]);

    const materialized = await api.addResolvedChip(resolved);
    expect(materialized).toMatchObject({
      status: 'needs_amount',
      ingredient: { id: BANANA_ID, name: 'BANANA · Fresh Fruit' },
    });

    useRecipeStore.getState().addIngredient(materialized.ingredient!, 120);
    const inserted = useRecipeStore
      .getState()
      .items.find((item) => canonicalIngredientId(item.ingredient) === BANANA_ID);
    expect(inserted).toMatchObject({
      planned_grams: 120,
      ingredient: {
        id: BANANA_ID,
        canonical_ingredient_id: BANANA_ID,
        name: 'BANANA · Fresh Fruit',
        identity_provenance: 'mapper',
      },
    });
  });
});
