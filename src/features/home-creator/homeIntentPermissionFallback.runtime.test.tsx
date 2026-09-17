import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; args: unknown[] }>,
  searchProducts: vi.fn(),
  publicRows: [] as Array<Record<string, unknown>>,
  viewRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/services/globalCatalog', () => ({
  searchProducts: mocks.searchProducts,
}));

/* REAL SA-10 runtime + REAL generated SA-03 decisions; only the release fetch is local. */
vi.mock('@/features/mapper-search-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/mapper-search-runtime')>();
  const { createTestMapperSearchRuntime } =
    await import('@/features/mapper-search-runtime/testRelease');
  const runtime = createTestMapperSearchRuntime();
  return {
    ...actual,
    loadMapperSearchRuntime: async () => runtime,
    planMapperCatalogSearch: async (
      text: string,
      options: Parameters<typeof actual.planMapperCatalogSearch>[1] = {},
    ) =>
      actual.createMapperCatalogSearchPlan(runtime, text, {
        ...options,
        telemetry: { record() {} },
      }),
  };
});

vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: vi.fn(async () => {
    throw new Error('permission denied for view mapper_basement_search');
  }),
}));

vi.mock('@/services/products', () => ({ getProduct: vi.fn() }));

vi.mock('@/lib/supabase/client', () => {
  const makeBuilder = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {};
    let ids: readonly string[] | null = null;
    for (const method of ['select', 'or', 'eq', 'order', 'range', 'abortSignal', 'in']) {
      builder[method] = (...args: unknown[]) => {
        mocks.calls.push({ method, args });
        if (method === 'in' && args[0] === 'ingredient_id') ids = args[1] as readonly string[];
        return builder;
      };
    }
    // An exact-id read sees the whole public view; a name search sees only its page.
    builder.then = (onOk: (value: unknown) => unknown) =>
      Promise.resolve({
        data:
          ids === null
            ? mocks.publicRows
            : mocks.viewRows.filter((row) => ids!.includes(row.ingredient_id as string)),
        error: null,
      }).then(onOk);
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

import { parseIntent } from './homeIntentParsing';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { useHomeIntentIngredients } from './useHomeIntentIngredients';
import { useRecipeStore } from '@/stores/recipeStore';

/** The real 27 963-alias SA-10 runtime resolves several inputs per test; CI runners are slow. */
const REAL_RUNTIME_TIMEOUT_MS = 60_000;

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
  mocks.viewRows = [...mocks.publicRows];
  useHomeDraftStore.getState().startNew();
  useRecipeStore.setState({ items: [], toppings: [], baseOrder: [], priority_mode: 'AUTO' });
});

describe('served G anonymous capability fallback', { timeout: REAL_RUNTIME_TIMEOUT_MS }, () => {
  it.each([
    ['HOME-BANANA-P1-01', 'banan'],
    ['HOME-BANANA-P1-02', 'bananowe'],
    ['HOME-BANANA-P1-03', 'bananowy'],
    ['HOME-BANANA-P1-04', 'bananowa'],
  ] as const)(
    '%s: %s selects Fresh Banana through the normal chip state without disambiguation',
    async (_testId, form) => {
      const parsed = parseIntent(form).terms[0];
      expect(parsed).toMatchObject({ concept: 'banana', fuzzy: false });
      const naturalBananaChip = { ...chip, label: form, concept: parsed!.concept };
      useHomeDraftStore.getState().addChip(naturalBananaChip);
      const api = renderHook();

      // Reproduce the staging failure mode: broad catalogue candidates are present,
      // but the canonical Fresh Fruit row did not make this search page.
      mocks.publicRows = mocks.publicRows.filter((row) => row.ingredient_id !== BANANA_ID);

      await expect(api.resolveOne(naturalBananaChip)).resolves.toMatchObject({ status: 'added' });
      const resolved = useHomeDraftStore.getState().chips[0]!;
      expect(resolved).toMatchObject({
        productId: BANANA_ID,
        productName: 'BANANA · Fresh Fruit',
        ambiguous: false,
      });
      expect(resolved.candidates).toBeUndefined();
      // Owner 2026-09-17: the shared SA-03 decision replaces the HOME banana exception.
      // One exact-id read of the public view — no search RPC, no name ranking.
      expect(mocks.searchProducts).not.toHaveBeenCalled();
      expect(mocks.calls.filter((call) => call.method === 'from')).toEqual([
        { method: 'from', args: ['mapper_basement_search_demo'] },
      ]);
      expect(mocks.calls.some((call) => call.method === 'or')).toBe(false);

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
    },
  );
});
