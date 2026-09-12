import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

const mocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getRichRow: vi.fn(),
}));

vi.mock('@/services/products', () => ({ getProduct: mocks.getProduct }));
vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: mocks.getRichRow,
}));
vi.mock('@/services/productPicker/mapperSearch', () => ({
  searchCanonicalMapperIngredients: vi.fn(),
}));

import { useHomeIntentIngredients } from './useHomeIntentIngredients';
import { useRecipeStore } from '@/stores/recipeStore';

const PRODUCT_UUID = '84800005-1071-6000-8000-000000000001';
const PRODUCT_CODE = 'PR-ING-000725';
const MAPPER_ID = 'PI-ING-000236';
const DISPLAY_NAME = 'Leche líquida entera Hacendado';

const reference = {
  ingredient_id: MAPPER_ID,
  ingredient_name_internal: 'milk_3_5',
  ingredient_name_display: 'MILK · Whole Milk',
  ingredient_category: 'dairy',
  ingredient_subcategory: 'whole_milk',
  water_percent: 87.5,
  total_solids_percent: 12.5,
  fat_percent: 3.5,
  saturated_fat_percent: 2.3,
  protein_percent: 3.3,
  carbohydrate_percent: 4.8,
  total_sugars_percent: 4.8,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 4.8,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0.1,
  alcohol_percent: 0,
  kcal_per_100g: 64,
  pod_value: 0.76,
  pac_value: 4.8,
  de_value: null,
  cost_per_kg: null,
  currency: 'EUR',
  data_confidence_percent: 98,
  verification_status: 'Verified',
  vegan: 'false',
  approved_for_base: true,
  approved_for_engines: true,
  is_active: true,
} as IngredientRow;

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
  mocks.getProduct.mockReset();
  mocks.getRichRow.mockReset();
  useRecipeStore.setState({ items: [], toppings: [], baseOrder: [], priority_mode: 'AUTO' });
});

describe('served H — exact scanned identity reaches HOME', () => {
  it('HOME-H-01 stores and renders the same Hacendado product identity', async () => {
    mocks.getProduct.mockResolvedValue({
      id: PRODUCT_UUID,
      product_code: PRODUCT_CODE,
      product_name_display: DISPLAY_NAME,
      mapper_status: 'matched',
      matched_basement_id: MAPPER_ID,
      source_type: 'catalog_import',
      vegan: 'false',
      pac_value: null,
      pod_value: null,
    });
    mocks.getRichRow.mockResolvedValue(reference);

    const result = await hook().addScannedProduct({
      id: PRODUCT_UUID,
      productCode: PRODUCT_CODE,
      displayName: DISPLAY_NAME,
      entityKind: 'commercial_product',
    });
    expect(result.status).toBe('needs_amount');
    expect(result.ingredient).toMatchObject({
      id: PRODUCT_CODE,
      private_product_id: PRODUCT_UUID,
      name: DISPLAY_NAME,
    });
    expect(useRecipeStore.getState().items).toHaveLength(0);

    useRecipeStore.getState().addIngredient(result.ingredient!, 80);

    const inserted = useRecipeStore
      .getState()
      .items.find((item) => item.ingredient.private_product_id === PRODUCT_UUID);
    expect(inserted?.ingredient).toMatchObject({
      id: PRODUCT_CODE,
      canonical_ingredient_id: MAPPER_ID,
      private_product_id: PRODUCT_UUID,
      identity_provenance: 'private_product',
      name: DISPLAY_NAME,
    });
  });
});
