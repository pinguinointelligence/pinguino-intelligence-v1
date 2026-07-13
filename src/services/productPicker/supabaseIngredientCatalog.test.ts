import { describe, expect, it, vi } from 'vitest';
import { createSupabaseIngredientCatalog } from './supabaseIngredientCatalog';
import { searchIngredientCatalogue } from '@/features/product-picker';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

const row = (over: Partial<IngredientRow>): IngredientRow =>
  ({
    ingredient_id: 'PI-ING-000001',
    ingredient_name_internal: 'vanilla_extract',
    ingredient_name_display: 'Ekstrakt waniliowy',
    ingredient_category: 'flavor',
    ingredient_subcategory: 'vanilla',
    verification_status: 'verified',
    pod_value: 0,
    pac_value: 0,
    storage_type: 'ambient',
    is_active: true,
    ...over,
  }) as unknown as IngredientRow;

describe('createSupabaseIngredientCatalog (mocked client)', () => {
  it('maps mapper_basement rows to ingredient entries via the injected reader', async () => {
    const listIngredients = vi.fn(async () => [
      row({}),
      row({ ingredient_id: 'PI-ING-000002', ingredient_name_display: 'Pasta waniliowa', ingredient_name_internal: 'vanilla_paste' }),
    ]);
    const port = createSupabaseIngredientCatalog({ listIngredients });
    const entries = await port.fetch();
    expect(listIngredients).toHaveBeenCalledOnce();
    expect(entries.map((e) => e.ingredientId)).toEqual(['PI-ING-000001', 'PI-ING-000002']);
  });

  it('marks an ingredient engine-ready only when BOTH pac and pod are present (never invented)', async () => {
    const port = createSupabaseIngredientCatalog({
      listIngredients: async () => [
        row({ ingredient_id: 'PI-ING-ready', pac_value: 190, pod_value: 100 }),
        row({ ingredient_id: 'PI-ING-nopac', pac_value: null, pod_value: 100 }),
      ],
    });
    const entries = await port.fetch();
    expect(entries.find((e) => e.ingredientId === 'PI-ING-ready')?.engineReady).toBe(true);
    expect(entries.find((e) => e.ingredientId === 'PI-ING-nopac')?.engineReady).toBe(false);
    expect(entries.find((e) => e.ingredientId === 'PI-ING-nopac')?.pac).toBeNull();
  });

  it('the pure search finds vanilla ingredients by name (Składniki PI)', async () => {
    const port = createSupabaseIngredientCatalog({
      listIngredients: async () => [
        row({ ingredient_id: 'PI-ING-1', ingredient_name_display: 'Ekstrakt waniliowy' }),
        row({ ingredient_id: 'PI-ING-2', ingredient_name_display: 'Pasta waniliowa' }),
        row({ ingredient_id: 'PI-ING-3', ingredient_name_display: 'Kakao 22/24', ingredient_category: 'cocoa' }),
      ],
    });
    const entries = await port.fetch();
    const results = searchIngredientCatalogue({ text: 'wanili' }, entries);
    expect(results.map((r) => r.entry.ingredientId).sort()).toEqual(['PI-ING-1', 'PI-ING-2']);
  });
});
