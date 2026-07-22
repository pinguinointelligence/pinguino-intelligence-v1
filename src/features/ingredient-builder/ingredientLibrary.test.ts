import { describe, expect, it } from 'vitest';
import { DEMO_INGREDIENTS } from '@/data/demoIngredients';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { calculateRecipe, type RecipeItem } from '@/engine';
import {
  filterIngredients,
  groupIngredientsByCategory,
  selectIngredientLibrary,
  shouldFetchLibrary,
} from './ingredientLibrary';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';

/** A complete, engine-approved sample row (numeric unknowns null). */
const sampleRow: IngredientRow = {
  ingredient_id: 'PI-ING-000010',
  ingredient_name_internal: 'whole_milk_3_5',
  ingredient_name_display: 'Whole Milk 3.5%',
  brand: 'Granarolo',
  supplier: '',
  country: '',
  ean_code: '',
  ingredient_category: 'dairy',
  ingredient_subcategory: 'fresh milk',
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  verification_source: 'pinguino_internal_confirmed_dataset_v0_94',
  verification_date: '2026-06-16',
  data_confidence_percent: 95,
  water_percent: 87.5,
  total_solids_percent: 12.5,
  fat_percent: 3.5,
  saturated_fat_percent: 2.3,
  milk_fat_percent: 3.5,
  non_fat_milk_solids_percent: 9,
  protein_percent: 3.3,
  aerating_protein_percent: 3.3,
  carbohydrate_percent: 4.8,
  total_sugars_percent: 4.8,
  sucrose_percent: 0,
  dextrose_percent: 0,
  glucose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 4.8,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0.1,
  alcohol_percent: 0,
  ash_percent: 0.7,
  acidity_percent: 0,
  brix: null,
  dry_matter_percent: 12.5,
  pod_value: 4.8,
  pac_value: 4.8,
  de_value: null,
  sweetness_factor: null,
  freezing_factor: null,
  stabilizer_activity: null,
  recommended_dosage_percent_min: null,
  recommended_dosage_percent_max: null,
  kcal_per_100g: 64,
  cost_per_kg: 0.9,
  currency: 'EUR',
  allergens: 'milk',
  vegan: 'false',
  dairy_free: 'false',
  gluten_free: 'true',
  contains_alcohol: 'false',
  storage_type: 'chilled',
  shelf_life_days: 7,
  usage_notes: '',
  engine_notes: '',
  source_url: 'internal_dataset_v0_94',
  screenshot_reference: 'internal_dataset_v0_94',
  last_reviewed_by: 'PINGUINO team',
  last_reviewed_at: '2026-06-16',
  dataset_version: 'v0.94',
  is_active: true,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: '2026-06-16T00:00:00Z',
};

/** A second row whose RAW category ("chocolate") differs from its ENGINE
 * category ("chocolate_cocoa"), to test both. */
const chocolateRow: IngredientRow = {
  ...sampleRow,
  ingredient_id: 'PI-ING-000020',
  ingredient_name_internal: 'dark_chocolate_70',
  ingredient_name_display: 'Dark Chocolate 70%',
  brand: 'Domori',
  ingredient_category: 'chocolate',
  ingredient_subcategory: 'dark 70',
};

describe('shouldFetchLibrary', () => {
  it('only enables the query for Pro users off the demo route', () => {
    expect(shouldFetchLibrary({ isPro: true, demo: false })).toBe(true);
    expect(shouldFetchLibrary({ isPro: true, demo: true })).toBe(false); // /demo never fetches
    expect(shouldFetchLibrary({ isPro: false, demo: false })).toBe(false);
    expect(shouldFetchLibrary({ isPro: false, demo: true })).toBe(false);
  });
});

describe('selectIngredientLibrary', () => {
  it('uses the demo catalog on the demo route even when Pro rows exist', () => {
    const lib = selectIngredientLibrary({ demo: true, isPro: true, rows: [sampleRow], isError: false });
    expect(lib.source).toBe('demo');
    expect(lib.status).toBe('demo');
    expect(lib.ingredients).toBe(DEMO_INGREDIENTS);
    expect(lib.searchIndex.size).toBe(DEMO_INGREDIENTS.length);
  });

  it('uses the demo catalog for free / anon (not Pro)', () => {
    const lib = selectIngredientLibrary({ demo: false, isPro: false, rows: undefined, isError: false });
    expect(lib.source).toBe('demo');
    expect(lib.ingredients).toBe(DEMO_INGREDIENTS);
  });

  it('shows a loading state for Pro while fetching — no demo flash', () => {
    const lib = selectIngredientLibrary({ demo: false, isPro: true, rows: undefined, isError: false });
    expect(lib.status).toBe('loading');
    expect(lib.source).toBe('pi_base');
    expect(lib.ingredients).toHaveLength(0);
  });

  it('falls back to demo on fetch error', () => {
    const lib = selectIngredientLibrary({ demo: false, isPro: true, rows: undefined, isError: true });
    expect(lib.status).toBe('fallback');
    expect(lib.ingredients).toBe(DEMO_INGREDIENTS);
  });

  it('falls back to demo when the library is empty (not seeded / RLS empty)', () => {
    const lib = selectIngredientLibrary({ demo: false, isPro: true, rows: [], isError: false });
    expect(lib.status).toBe('fallback');
    expect(lib.ingredients).toBe(DEMO_INGREDIENTS);
  });

  it('returns mapped PI Base ingredients for Pro when rows are present', () => {
    const lib = selectIngredientLibrary({ demo: false, isPro: true, rows: [sampleRow], isError: false });
    expect(lib.status).toBe('ready');
    expect(lib.source).toBe('pi_base');
    expect(lib.ingredients).toHaveLength(1);
    const ing = lib.ingredients[0]!;
    expect(ing.id).toBe('PI-ING-000010');
    expect(ing.category).toBe('dairy');
    expect(ing.source_type).toBe('verified_db');
  });
});

describe('search index', () => {
  const lib = selectIngredientLibrary({
    demo: false,
    isPro: true,
    rows: [sampleRow, chocolateRow],
    isError: false,
  });

  it('builds a rich NORMALIZED haystack for PI Base rows (name/internal/id/brand/category/subcategory)', () => {
    // Owner P0: the haystack is diacritic/punctuation-normalized (% and _ → spaces) so Polish
    // queries match; the tokens are all present, just unified.
    const hay = lib.searchIndex.get('PI-ING-000020')!;
    expect(hay).toContain('dark chocolate 70'); // display name (normalized: % dropped)
    expect(hay).toContain('dark chocolate 70'); // internal name (normalized: _ → space)
    expect(hay).toContain('pi ing 000020'); // id (normalized: - → space)
    expect(hay).toContain('domori'); // brand
    expect(hay).toContain('chocolate'); // raw category
    expect(hay).toContain('chocolate cocoa'); // engine category (normalized)
    expect(hay).toContain('dark 70'); // subcategory
  });

  it('builds a demo index from name, id and category', () => {
    const demoLib = selectIngredientLibrary({ demo: false, isPro: false, rows: undefined, isError: false });
    expect(demoLib.searchIndex.size).toBe(DEMO_INGREDIENTS.length);
    // Haystack is NORMALIZED (owner P0): "Milk 3.5 %" → "milk 3 5"; the words are all present.
    expect(demoLib.searchIndex.get('milk_3_5')).toContain('milk 3 5');
    expect(filterIngredients(demoLib.ingredients, 'milk', demoLib.searchIndex).length).toBeGreaterThan(0);
  });
});

describe('filterIngredients', () => {
  const lib = selectIngredientLibrary({
    demo: false,
    isPro: true,
    rows: [sampleRow, chocolateRow],
    isError: false,
  });
  const run = (q: string) => filterIngredients(lib.ingredients, q, lib.searchIndex).map((i) => i.id);

  it('returns all ingredients for an empty query', () => {
    expect(run('')).toEqual(['PI-ING-000010', 'PI-ING-000020']);
  });

  it('matches by display name', () => expect(run('whole milk')).toEqual(['PI-ING-000010']));
  it('matches by internal name', () => expect(run('dark_chocolate_70')).toEqual(['PI-ING-000020']));
  it('matches by ingredient id', () => expect(run('PI-ING-000010')).toEqual(['PI-ING-000010']));
  it('matches by brand', () => expect(run('domori')).toEqual(['PI-ING-000020']));
  it('matches by raw category', () => expect(run('chocolate')).toEqual(['PI-ING-000020']));
  it('matches by engine category', () => expect(run('chocolate_cocoa')).toEqual(['PI-ING-000020']));
  it('matches by subcategory', () => expect(run('dark 70')).toEqual(['PI-ING-000020']));

  it('returns an empty list when nothing matches', () => {
    expect(run('zzzznomatch')).toEqual([]);
  });
});

describe('groupIngredientsByCategory', () => {
  it('groups by category preserving first-appearance order', () => {
    const groups = groupIngredientsByCategory(DEMO_INGREDIENTS);
    expect(groups[0]!.category).toBe('dairy');
    expect(groups.map((g) => g.category)).toContain('sugar');
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(DEMO_INGREDIENTS.length);
  });
});

describe('PI Base ingredient → engine seam', () => {
  it('a mapped PI Base ingredient flows into RecipeInput and calculateRecipe', () => {
    const ingredient = ingredientRowToEngineIngredient(sampleRow);
    const item: RecipeItem = {
      id: 'line-1',
      ingredient,
      planned_grams: 1000,
      actual_grams: null,
      lock_type: 'unlocked',
    };
    const input = buildRecipeInput({
      mode: 'premium',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      flavor_intensity: 'balanced',
      cost_priority: 'balanced',
      items: [item],
    });
    const result = calculateRecipe(input);
    expect(result.items).toHaveLength(1);
    expect(result.total_batch_g).toBeGreaterThan(0);
  });
});
