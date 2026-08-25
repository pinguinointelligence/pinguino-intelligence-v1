import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  CURRENT_MAPPER_CATALOG_CACHE_KEY,
  MAPPER_ONLY_CATALOG_ERROR,
  currentMapperCatalogId,
  filterCurrentMapperCatalogHits,
  filterCurrentMapperCatalogRelations,
  resolveCurrentMapperCatalogSelection,
} from './mapperOnlyCatalog';

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((entry) =>
    Object.fromEntries(headers!.map((header, index) => [header, entry[index] ?? ''])),
  );
}

const hit = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'mapper-root-1',
  currentVersionId: 'mapper-version-1',
  entityKind: 'pi_base',
  status: 'pi_base',
  provenance: 'mapper',
  displayName: 'Current Mapper ingredient',
  originalName: null,
  originalLanguage: null,
  brand: null,
  canonicalFamily: null,
  category: 'dairy',
  productForm: 'milk',
  mappedIngredientId: 'PI-ING-000001',
  markets: [],
  retailers: [],
  eans: [],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  usableAsTopping: true,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'mapper_verified',
  publicData: { lifecycleRejected: false },
  ...overrides,
});

const productProfile = {
  productAccuracy: 96,
  productIntelligence: { engineUsable: true },
  technicalComposition: {
    water: 51,
    totalSolids: 49,
    fat: 11,
    protein: 24,
    carbohydrate: 13,
    sugars: 0.5,
    salt: 0.2,
  },
};

const row = (overrides: Partial<IngredientRow> = {}): IngredientRow => ({
  ingredient_id: 'PI-ING-000001',
  ingredient_name_internal: 'current_mapper_ingredient',
  ingredient_name_display: 'Current Mapper ingredient',
  brand: '',
  supplier: '',
  country: '',
  ean_code: '',
  ingredient_category: 'dairy',
  ingredient_subcategory: 'milk',
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  verification_source: 'Mapper',
  verification_date: null,
  data_confidence_percent: 100,
  water_percent: 80,
  total_solids_percent: 20,
  fat_percent: 3.5,
  saturated_fat_percent: 2,
  milk_fat_percent: 3.5,
  non_fat_milk_solids_percent: 8,
  protein_percent: 3.2,
  aerating_protein_percent: 3.2,
  carbohydrate_percent: 5,
  total_sugars_percent: 5,
  sucrose_percent: 0,
  dextrose_percent: 0,
  glucose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 5,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0.1,
  alcohol_percent: 0,
  ash_percent: 0.7,
  acidity_percent: 0,
  brix: 0,
  dry_matter_percent: 20,
  pod_value: 16,
  pac_value: 10,
  de_value: null,
  sweetness_factor: null,
  freezing_factor: null,
  stabilizer_activity: null,
  recommended_dosage_percent_min: null,
  recommended_dosage_percent_max: null,
  kcal_per_100g: 60,
  cost_per_kg: 1,
  currency: 'EUR',
  allergens: 'milk',
  vegan: 'false',
  dairy_free: 'false',
  gluten_free: 'true',
  contains_alcohol: 'false',
  storage_type: 'chilled',
  shelf_life_days: null,
  usage_notes: '',
  engine_notes: '',
  source_url: '',
  screenshot_reference: '',
  last_reviewed_by: 'Mapper',
  last_reviewed_at: null,
  dataset_version: 'v1.0',
  is_active: true,
  created_at: '2026-08-08T00:00:00Z',
  updated_at: '2026-08-08T00:00:00Z',
  ...overrides,
});

describe('Mapper-only product catalog', () => {
  it('A/B derives the exact current/selectable census from the immutable 2,088-row Mapper', () => {
    const mapper = parseCsv(
      readFileSync(
        resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
        'utf8',
      ),
    );
    expect(mapper).toHaveLength(2088);
    expect(new Set(mapper.map((entry) => entry.ingredient_id)).size).toBe(2088);
    expect(
      mapper.filter((entry) => entry.approved_for_base?.toLowerCase() === 'true'),
    ).toHaveLength(2075);
    expect(CURRENT_MAPPER_CATALOG_CACHE_KEY).toContain(
      'b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38',
    );
  });

  it('C/E/F/G rejects QA, unbound, commercial, stale favorite and stale recent records', () => {
    const qa = hit({
      id: 'qa-owner-record',
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      displayName: 'Owner Biscuit Topping Final QA',
      mappedIngredientId: null,
    });
    const unbound = hit({ mappedIngredientId: null });
    const stale = hit({ mappedIngredientId: 'PI-ING-999999', currentVersionId: null });
    expect(filterCurrentMapperCatalogHits([hit(), qa, unbound, stale], 'BASE')).toEqual([hit()]);
    expect(
      filterCurrentMapperCatalogRelations(
        [
          { entityKind: 'pi_base', id: 'PI-ING-000001' },
          { entityKind: 'commercial_product', id: 'qa-owner-record' },
          { entityKind: 'pi_base', id: 'PI-ING-999999' },
        ],
        new Set(['PI-ING-000001']),
      ),
    ).toEqual([{ entityKind: 'pi_base', id: 'PI-ING-000001' }]);
  });

  it('D respects canonical selectability instead of product-name heuristics', () => {
    const superseded = hit({
      displayName: 'CAMPARI · Bitter Aperitivo · Superseded',
      mappedIngredientId: 'PI-ING-001399',
      usableInBase: false,
      usableAsTopping: false,
    });
    const glycerin = hit({
      displayName: 'GLYCERIN · Sweetener',
      mappedIngredientId: 'PI-ING-001376',
      usableInBase: false,
      usableAsTopping: false,
    });
    expect(filterCurrentMapperCatalogHits([superseded, glycerin], 'BASE')).toEqual([]);
    expect(
      filterCurrentMapperCatalogHits(
        [hit({ displayName: 'A suspicious QA-looking but Mapper-approved name' })],
        'BASE',
      ),
    ).toHaveLength(1);
  });

  it('J rejects forged snapshots before a recipe row, dirty state or Undo can be created', async () => {
    // A commercial result needs its own immutable profile and product identity.
    // A Mapper-looking field on the browser snapshot authorizes nothing.
    const load = vi.fn(async () => null);
    const outcome = await resolveCurrentMapperCatalogSelection(
      hit({
        entityKind: 'commercial_product',
        status: 'verified',
        mappedIngredientId: 'PI-ING-000001',
      }),
      'BASE',
      load,
    );
    expect(outcome).toEqual({ ok: false, message: MAPPER_ONLY_CATALOG_ERROR });
    expect(load).not.toHaveBeenCalled();
  });

  it('J refuses a blocked or unmapped catalogue product before anything is loaded', async () => {
    const load = vi.fn(async () => null);
    for (const forged of [
      hit({
        entityKind: 'commercial_product',
        status: 'blocked',
        mappedIngredientId: 'PI-ING-000001',
      }),
      hit({ entityKind: 'commercial_product', status: 'verified', mappedIngredientId: null }),
      hit({
        entityKind: 'commercial_product',
        status: 'verified',
        mappedIngredientId: 'not-a-mapper-id',
      }),
    ]) {
      expect(await resolveCurrentMapperCatalogSelection(forged, 'BASE', load)).toEqual({
        ok: false,
        message: MAPPER_ONLY_CATALOG_ERROR,
      });
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('J rejects a valid-looking name paired with another/missing current Mapper row', async () => {
    const outcome = await resolveCurrentMapperCatalogSelection(
      hit({ displayName: 'Current Mapper ingredient', mappedIngredientId: 'PI-ING-000001' }),
      'BASE',
      async () => row({ ingredient_id: 'PI-ING-000002' }),
    );
    expect(outcome).toEqual({ ok: false, message: MAPPER_ONLY_CATALOG_ERROR });
  });

  it('K/L resolves Base and Topping only from the fresh server Mapper row', async () => {
    for (const context of ['BASE', 'TOPPING'] as const) {
      // The sanctioned view deliberately filters `is_active` but does not
      // project that administrative column into its read model.
      const currentViewRow = { ...row(), is_active: undefined } as unknown as IngredientRow;
      const load = vi.fn(async () => currentViewRow);
      const outcome = await resolveCurrentMapperCatalogSelection(hit(), context, load);
      expect(outcome).toEqual({
        ok: true,
        kind: 'mapper',
        articleId: 'PI-ING-000001',
        mapperId: 'PI-ING-000001',
        row: currentViewRow,
      });
      expect(load).toHaveBeenCalledWith('PI-ING-000001');
    }
  });

  it('resolves an admitted PR from its own version without loading a Mapper row', async () => {
    const load = vi.fn(async () => null);
    const outcome = await resolveCurrentMapperCatalogSelection(
      hit({
        id: 'catalog-pr',
        entityKind: 'commercial_product',
        status: 'manual_unverified',
        productCode: 'PR-ING-000001',
        mappedIngredientId: null,
        publicData: productProfile,
      }),
      'BASE',
      load,
    );
    expect(outcome).toEqual({
      ok: true,
      kind: 'catalog_product',
      articleId: 'PR-ING-000001',
      productVersionId: 'mapper-version-1',
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('does not trust an arbitrary PI-shaped id without a matching current row', async () => {
    expect(currentMapperCatalogId(hit({ mappedIngredientId: 'PI-ING-999999' }), 'BASE')).toBe(
      'PI-ING-999999',
    );
    expect(
      await resolveCurrentMapperCatalogSelection(
        hit({ mappedIngredientId: 'PI-ING-999999' }),
        'BASE',
        async () => null,
      ),
    ).toEqual({ ok: false, message: MAPPER_ONLY_CATALOG_ERROR });
  });
});

describe('Mapper-only picker source and UI contract', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

  it('H versions React Query cache and uses no persistent browser product cache', () => {
    const hook = read('src/features/global-catalog/useGlobalCatalogPicker.ts');
    expect(hook).toContain('CURRENT_MAPPER_CATALOG_CACHE_KEY');
    expect(hook).not.toMatch(/localStorage|indexedDB/i);
  });

  it('I searches the whole eligible catalogue, with scan/manual actions only in no-results UI', () => {
    const picker = read('src/features/ingredient-builder/ProductPickerPopover.tsx');
    expect(picker).toContain('Nie znaleziono produktu.');
    expect(picker).toContain('Skanuj');
    expect(picker).toContain('Dodaj ręcznie');
    expect(picker).not.toContain('Nie znalazłeś produktu?');
    expect(picker).not.toContain('Katalog zawiera wyłącznie aktualne produkty Mappera.');
    // Owner decision: an imported commercial product must be findable in the
    // recipe picker. Restricting the query to pi_base made that impossible.
    expect(picker).toContain('mapperOnly: false');
  });

  it('pins the sanctioned selection view as the current/active authority', () => {
    const migration = read('supabase/migrations/20260814110000_product_search_v1.sql');
    const view = migration.slice(
      migration.indexOf('create or replace view public.mapper_basement_search'),
      migration.indexOf('revoke all on public.mapper_basement_search'),
    );
    expect(view).toContain('where is_active and approved_for_base');
    expect(view).not.toMatch(/^\s*is_active\s*,?$/m);
  });

  it('detaches owner products from the active Pro ingredient library', () => {
    const library = read('src/features/ingredient-builder/useIngredientLibrary.ts');
    expect(library).not.toContain('listMyProducts');
    expect(library).not.toContain('buildProductEngineLibrary');
    expect(library).not.toContain("queryKey: ['my-products']");
  });

  it('keeps customer pricing keyed by canonical Mapper identity', () => {
    const prices = read('src/services/proCore/supabaseCustomerPrices.ts');
    expect(prices).toContain("const TABLE = 'customer_ingredient_prices'");
    expect(prices).toContain('canonical_ingredient_id');
  });
});
