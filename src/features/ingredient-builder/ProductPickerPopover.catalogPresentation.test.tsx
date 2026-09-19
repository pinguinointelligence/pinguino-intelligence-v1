/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { EngineIngredient } from '@/engine';
import type { ProductBehaviorContext } from '@/features/product-intelligence';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  hits: [] as CatalogProductSearchHit[],
  getRow: vi.fn(),
  markUsed: vi.fn(),
  setPreferred: vi.fn(),
  toggleFavorite: vi.fn(),
  loadMore: vi.fn(),
  toEngine: vi.fn(),
  isFetching: false,
  hasMore: true,
  searchIsSettled: true,
  isSettled: true,
  lastPickerInput: null as {
    query: string;
    context: 'BASE' | 'TOPPING';
    productProfile?: string | null;
  } | null,
}));

vi.mock('@/features/global-catalog/useGlobalCatalogPicker', () => ({
  useGlobalCatalogPicker: (input: {
    query: string;
    favoritesOnly: boolean;
    context: 'BASE' | 'TOPPING';
    productProfile?: string | null;
  }) => {
    mocks.lastPickerInput = input;
    const query = input.query.trim().toLocaleLowerCase('pl');
    const hits = mocks.hits.filter(
      (hit) =>
        (!input.favoritesOnly || hit.favorite) &&
        (!query ||
          [
            hit.displayName,
            hit.productCode,
            hit.canonicalFamily,
            hit.category,
            hit.productForm,
            ...hit.eans,
            ...hit.aliases,
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('pl')
            .includes(query)),
    );
    return {
      hits,
      favorites: new Set(
        mocks.hits
          .filter((hit) => hit.favorite)
          .map(
            (hit) =>
              `${hit.entityKind}:${hit.entityKind === 'pi_base' ? hit.mappedIngredientId : hit.id}`,
          ),
      ),
      favoritesSettled: true,
      recent: new Set(
        hits
          .filter((hit) => hit.recentlyUsedAt)
          .map(
            (hit) =>
              `${hit.entityKind}:${hit.entityKind === 'pi_base' ? hit.mappedIngredientId : hit.id}`,
          ),
      ),
      preferences: {
        primaryMarket: null,
        additionalMarkets: [],
        preferredRetailers: [],
        defaultScope: 'global',
      },
      searchIsSettled: mocks.searchIsSettled,
      isSettled: mocks.isSettled,
      isFetching: mocks.isFetching,
      isError: false,
      hasMore: mocks.hasMore,
      loadMore: mocks.loadMore,
      toggleFavorite: mocks.toggleFavorite,
    };
  },
}));

vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: mocks.getRow,
}));

vi.mock('@/services/globalCatalog', () => ({
  markCatalogProductUsed: mocks.markUsed,
  searchProducts: vi.fn().mockResolvedValue([]),
  setUserPreferredExactProductForSlot: mocks.setPreferred,
}));

vi.mock('@/data/ingredients/ingredientMapper', () => ({
  ingredientRowToEngineIngredient: mocks.toEngine,
}));

import { ProductPickerPopover, type ProductPickerReplaceInvocation } from './ProductPickerPopover';
import type { ProductDiscoveryReplaceContext } from './canonicalProductDiscovery';
import { serverSearchLibrary } from './ingredientLibrary';

const catalogHit = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'catalog-root',
  currentVersionId: 'version-1',
  entityKind: 'pi_base',
  status: 'pi_base',
  provenance: 'mapper',
  displayName: 'PRODUCT',
  originalName: null,
  originalLanguage: null,
  brand: null,
  canonicalFamily: null,
  category: 'other',
  productForm: 'other',
  mappedIngredientId: 'PI-ING-000001',
  markets: [],
  retailers: [],
  eans: [],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  mainAllowed: false,
  usableAsTopping: true,
  blockedReason: null,
  relevance: 1,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'mapper_verified',
  publicData: {},
  ...overrides,
});

const commercialHit = (
  overrides: Partial<CatalogProductSearchHit> & { id: string },
): CatalogProductSearchHit =>
  catalogHit({
    entityKind: 'commercial_product',
    productCode: `PR-${overrides.id}`,
    currentVersionId: `version-${overrides.id}`,
    status: 'verified',
    verificationMethod: 'human',
    ...overrides,
  });

const replacementLine = (userFilters: ProductDiscoveryReplaceContext) => ({
  usageMode: 'PRO_REPLACE' as const,
  lineId: 'current-line',
  currentIdentity: {
    canonicalIngredientId: 'PI-ING-CURRENT',
    mapperIngredientId: 'PI-ING-CURRENT',
    productId: null,
    productVersionId: null,
    privateProductId: null,
  },
  searchConceptSeed: 'Current product',
  familyId: null,
  subfamilyId: null,
  formId: null,
  gradeOrSubtype: null,
  recipeProfile: 'sorbet' as const,
  currentRole: 'STANDARD' as const,
  processScope: 'BASE_FORMULATION' as const,
  temperatureC: -12,
  formulationMode: 'optimal' as const,
  marketCountry: 'ES',
  userFilters,
  moduleEligibility: {},
  recipeLine: { plannedGrams: 125, actualGrams: null, lockType: 'grams' as const },
});

const engineIngredient: EngineIngredient = {
  id: 'PI-ING-000345',
  canonical_ingredient_id: 'PI-ING-000345',
  private_product_id: null,
  identity_provenance: 'mapper',
  name: 'BANANA · Fresh Fruit',
  category: 'fruit',
  composition: {
    water_percent: 75,
    solids_percent: 25,
    fat_percent: 0,
    protein_percent: 1,
    carbohydrate_percent: 24,
    sugar_percent: 20,
    sucrose_percent: 5,
    glucose_percent: 5,
    dextrose_percent: 0,
    fructose_percent: 10,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 2,
    salt_percent: 0,
    alcohol_percent: 0,
    kcal_per_100g: 95,
  },
  pod_value: 20,
  pac_value: 20,
  de_value: null,
  cost_per_kg: null,
  cost_currency: null,
  confidence_score: 92,
  source_type: 'ai_estimated',
  is_verified: false,
};

const banana = catalogHit({
  id: 'banana-root',
  displayName: 'BANANA · Fresh Fruit',
  mappedIngredientId: 'PI-ING-000345',
  category: 'fruit',
  productForm: 'fresh_fruit',
  favorite: true,
  recentlyUsedAt: '2026-08-20T00:00:00Z',
  verificationMethod: 'mapper_estimated',
  publicData: { sourceConfidence: 92, verificationSource: 'ai_estimated' },
});

const cream = catalogHit({
  id: 'cream-root',
  displayName: 'CREAM 30% · Mlekovita Cream · Chilled',
  mappedIngredientId: 'PI-ING-000180',
  category: 'dairy',
  productForm: 'cream',
  publicData: { sourceConfidence: 98, verificationSource: 'verified_db' },
});

const paste = catalogHit({
  id: 'paste-root',
  displayName: 'ALMOND PASTE',
  mappedIngredientId: 'PI-ING-000520',
  category: 'paste',
  productForm: 'nut_paste',
  publicData: {},
});

describe('ProductPickerPopover catalog presentation', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    mocks.hits = [banana, cream, { ...banana, id: 'duplicate-page-edge' }, paste];
    mocks.getRow.mockImplementation(async (ingredientId: string) => ({
      ingredient_id: ingredientId,
      is_active: true,
      dataset_version: 'v1.0',
      approved_for_base: true,
    }));
    mocks.toEngine.mockReturnValue(engineIngredient);
    mocks.markUsed.mockResolvedValue(undefined);
    mocks.setPreferred.mockResolvedValue(undefined);
    mocks.isFetching = false;
    mocks.hasMore = true;
    mocks.searchIsSettled = true;
    mocks.isSettled = true;
    mocks.lastPickerInput = null;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  const renderPicker = async (
    onAdd = vi.fn(),
    intent: 'ADD' | 'REPLACE' = 'ADD',
    replaceInvocation?: ProductPickerReplaceInvocation,
    behaviorContext?: Omit<ProductBehaviorContext, 'processScope' | 'requestedRole' | 'module'>,
  ) => {
    const tree = (
      <MemoryRouter>
        <ProductPickerPopover
          library={serverSearchLibrary()}
          scope="BASE_FORMULATION"
          intent={intent}
          replaceInvocation={replaceInvocation}
          behaviorContext={behaviorContext}
          onAdd={onAdd}
        />
      </MemoryRouter>
    );
    await act(async () => {
      root.render(tree);
    });
    if (!replaceInvocation) {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
      await act(async () => trigger?.click());
    }
    return onAdd;
  };

  const rerenderOpenPicker = async (
    onAdd = vi.fn(),
    behaviorContext?: Omit<ProductBehaviorContext, 'processScope' | 'requestedRole' | 'module'>,
  ) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductPickerPopover
            library={serverSearchLibrary()}
            scope="BASE_FORMULATION"
            onAdd={onAdd}
            behaviorContext={behaviorContext}
          />
        </MemoryRouter>,
      );
    });
  };

  it('A/B/D/F/J hides technical metadata in browsing rows and keeps stable headings', async () => {
    await renderPicker();
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());
    const text = document.body.textContent ?? '';

    expect(text).not.toContain('PI-ING-000180');
    expect(text).not.toContain('PI-ING-000345');
    expect(text).not.toContain('PI-ING-000520');
    expect(text).not.toContain('Status danych ·');
    expect(text).toContain('Znaleziono 3 składników');
    // Empty box: what the user reached for most recently leads.
    expect(document.querySelectorAll('[data-picker-segment="recent"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-picker-segment="all"]')).toHaveLength(1);
    for (const forbidden of [
      'Nr art.',
      'Dane szacowane',
      'PINGÜINO — SPRAWDZONY',
      'verified_db',
      'ai_estimated',
      'PINGÜINO Base',
    ]) {
      expect(document.body.innerHTML).not.toContain(forbidden);
    }
    for (const option of document.querySelectorAll<HTMLElement>('[role="option"]')) {
      expect(option.getAttribute('aria-label')).not.toMatch(/PI-ING-|Status danych/);
    }
    expect(mocks.markUsed).not.toHaveBeenCalled();
  });

  it('visually separates the subtly warm Recent block from the white All catalogue', async () => {
    await renderPicker();
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());

    const recent = document.querySelector<HTMLElement>('[data-picker-section="recent"]');
    const catalogue = document.querySelector<HTMLElement>('[data-picker-section="all"]');

    expect(recent?.className).toContain('bg-[#fffaf5]');
    expect(recent?.textContent).toContain('OSTATNIO UŻYWANE');
    expect(recent?.textContent).toContain('BANANA · Fresh Fruit');
    expect(recent?.className).not.toContain('border');

    expect(catalogue?.className).toContain('bg-white');
    expect(catalogue?.className).toContain('mt-3');
    expect(catalogue?.className).toContain('border-t');
    expect(catalogue?.textContent).toContain('WSZYSTKIE SKŁADNIKI');
    expect(catalogue?.textContent).not.toContain('BANANA · Fresh Fruit');
  });

  it('renders the canonical top-level filter order and keeps form filters contextual', async () => {
    await renderPicker();
    const filters = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-product-filter]'),
    ).map((button) => button.dataset.productFilter);
    expect(filters).toEqual([
      'favorites',
      'all',
      'fruit',
      'dairy',
      'nuts',
      'chocolate',
      'technical',
    ]);
    expect(document.querySelector('[data-product-filter="fresh"]')).toBeNull();
    expect(document.querySelector('[data-product-filter="paste"]')).toBeNull();

    const fruits = document.querySelector<HTMLButtonElement>('[data-product-filter="fruit"]');
    await act(async () => fruits?.click());
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('[data-product-subfilter]')).map(
        (button) => button.dataset.productSubfilter,
      ),
    ).toEqual(['all', 'fresh']);
    expect(document.querySelectorAll('[data-product-filter][aria-pressed="true"]')).toHaveLength(1);
  });

  it('opens in All when no favorite exists', async () => {
    mocks.hits = [cream];
    await renderPicker();
    expect(
      document
        .querySelector<HTMLButtonElement>('[data-product-filter="all"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('opens in Favorites when favorites exist and offers one-click Search all on no match', async () => {
    await renderPicker();
    const favorites = document.querySelector<HTMLButtonElement>(
      '[data-product-filter="favorites"]',
    );
    expect(favorites?.getAttribute('aria-pressed')).toBe('true');

    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'cream');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const searchAll = document.querySelector<HTMLButtonElement>(
      '[data-testid="product-picker-search-all"]',
    );
    expect(searchAll?.textContent).toContain('Szukaj we wszystkich');
    await act(async () => searchAll?.click());
    expect(document.body.textContent).toContain('CREAM 30%');
  });

  it('uses one action contract per invocation', async () => {
    mocks.hits = [cream];
    await renderPicker(vi.fn(), 'REPLACE');
    expect(document.querySelector('button[aria-label^="Zamień na CREAM 30%"]')).not.toBeNull();
    expect(
      document.querySelector('button[aria-label="Dodaj CREAM 30% · Mlekovita Cream · Chilled"]'),
    ).toBeNull();
  });

  it('PRO-BANANA-01 keeps matching recent bananas above remaining central rank without auto-selection', async () => {
    mocks.hits = [
      commercialHit({
        id: 'banana-fresh',
        mappedIngredientId: 'PI-BANANA-FRESH',
        displayName: 'Banana Fresh Fruit',
        category: 'fruit',
        productForm: 'fresh_fruit',
        recentlyUsedAt: '2026-09-05T00:00:00.000Z',
      }),
      commercialHit({
        id: 'banana-puree',
        mappedIngredientId: 'PI-BANANA-PUREE',
        displayName: 'Banana Puree',
        category: 'fruit',
        productForm: 'puree',
        recentlyUsedAt: '2026-09-06T00:00:00.000Z',
      }),
      commercialHit({
        id: 'banana-powder',
        mappedIngredientId: 'PI-BANANA-POWDER',
        displayName: 'Banana Powder',
        category: 'other',
        productForm: 'powder',
      }),
      commercialHit({
        id: 'banana-paste',
        mappedIngredientId: 'PI-BANANA-PASTE',
        displayName: 'Banana Paste Compound',
        category: 'paste',
        productForm: 'paste',
      }),
      commercialHit({
        id: 'recent-milk',
        mappedIngredientId: 'PI-MILK',
        displayName: 'Milk 3.5%',
        category: 'dairy',
        productForm: 'milk',
        recentlyUsedAt: '2026-09-07T00:00:00.000Z',
      }),
    ];
    const onAdd = await renderPicker();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-product-filter="all"]')?.click(),
    );
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (!search) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'banan');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const recent = document.querySelector('[data-picker-section="recent"]');
    const remaining = document.querySelector('[data-picker-section="remaining"]');
    expect(recent?.textContent).toContain('Banana Puree');
    expect(recent?.textContent).toContain('Banana Fresh Fruit');
    expect(recent?.textContent).not.toContain('Milk 3.5%');
    expect(remaining?.textContent).toContain('Banana Powder');
    expect(remaining?.textContent).toContain('Banana Paste Compound');
    expect(document.body.textContent).not.toContain('Milk 3.5%');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('PROFILE-01 sends the same banana query with the active Sorbet or Gelato context', async () => {
    const onAdd = vi.fn();
    const sorbetContext = {
      accountId: 'account-1',
      productProfile: 'sorbet' as const,
      temperatureC: -12,
      mode: 'optimal' as const,
    };
    await renderPicker(onAdd, 'ADD', undefined, sorbetContext);
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (!search) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'banan');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(mocks.lastPickerInput).toMatchObject({
      query: 'banan',
      context: 'BASE',
      productProfile: 'sorbet',
    });

    await rerenderOpenPicker(onAdd, {
      ...sorbetContext,
      productProfile: 'milk_gelato',
    });
    expect(mocks.lastPickerInput).toMatchObject({
      query: 'banan',
      context: 'BASE',
      productProfile: 'milk_gelato',
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('PRO-FILTER-01 applies Fresh Fruit before recent segmentation', async () => {
    mocks.hits = [
      commercialHit({
        id: 'banana-fresh',
        mappedIngredientId: 'PI-BANANA-FRESH',
        displayName: 'Banana Fresh Fruit',
        category: 'fruit',
        productForm: 'fresh_fruit',
        recentlyUsedAt: '2026-09-05T00:00:00.000Z',
      }),
      commercialHit({
        id: 'banana-powder',
        mappedIngredientId: 'PI-BANANA-POWDER',
        displayName: 'Banana Powder',
        category: 'other',
        productForm: 'powder',
        recentlyUsedAt: '2026-09-07T00:00:00.000Z',
      }),
      commercialHit({
        id: 'banana-paste',
        mappedIngredientId: 'PI-BANANA-PASTE',
        displayName: 'Banana Paste',
        category: 'paste',
        productForm: 'paste',
      }),
    ];
    await renderPicker();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-product-filter="fruit"]')?.click(),
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-product-subfilter="fresh"]')?.click(),
    );
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (!search) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'banan');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Banana Fresh Fruit');
    expect(document.body.textContent).not.toContain('Banana Powder');
    expect(document.body.textContent).not.toContain('Banana Paste');
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  });

  it('REPLACE-COMPAT-01 filters current, blocked, and other-role rows before recency', async () => {
    const filters = { filter: 'fruit', subfilter: 'all', family: null } as const;
    mocks.hits = [
      commercialHit({
        id: 'current-banana',
        mappedIngredientId: 'PI-CURRENT-BANANA',
        displayName: 'Current Banana',
        category: 'fruit',
        productForm: 'fresh_fruit',
      }),
      commercialHit({
        id: 'compatible-recent',
        mappedIngredientId: 'PI-COMPATIBLE',
        displayName: 'Compatible Banana Puree',
        category: 'fruit',
        productForm: 'puree',
        recentlyUsedAt: '2026-09-06T00:00:00.000Z',
      }),
      commercialHit({
        id: 'blocked-recent',
        mappedIngredientId: 'PI-BLOCKED',
        displayName: 'Blocked Banana Powder',
        category: 'fruit',
        productForm: 'powder',
        usableInBase: false,
        usableAsTopping: false,
        recentlyUsedAt: '2026-09-07T00:00:00.000Z',
      }),
      commercialHit({
        id: 'topping-only',
        mappedIngredientId: 'PI-TOPPING',
        displayName: 'Topping Banana Sauce',
        category: 'fruit',
        productForm: 'sauce',
        usableInBase: false,
        usableAsTopping: true,
      }),
    ];
    await renderPicker(vi.fn(), 'ADD', {
      key: 77,
      context: filters,
      currentLine: {
        ...replacementLine(filters),
        currentIdentity: {
          canonicalIngredientId: 'PI-CURRENT-BANANA',
          mapperIngredientId: 'PI-CURRENT-BANANA',
          productId: 'current-banana',
          productVersionId: null,
          privateProductId: null,
        },
      },
    });

    expect(document.body.textContent).toContain('Compatible Banana Puree');
    expect(document.body.textContent).not.toContain('Current Banana');
    expect(document.body.textContent).not.toContain('Blocked Banana Powder');
    expect(document.body.textContent).not.toContain('Topping Banana Sauce');
    expect(document.querySelector('[data-picker-section="recent"]')).not.toBeNull();
  });

  it('REPLACE-COMPAT-02 keeps the cream hard gate across the complete HOME/PRO list', async () => {
    const filters = { filter: 'dairy', subfilter: 'all', family: 'cream' } as const;
    mocks.hits = [
      commercialHit({
        id: 'cream-36',
        mappedIngredientId: 'PI-CREAM-36',
        displayName: 'CREAM 36%',
        canonicalFamily: 'cream',
        category: 'dairy',
        productForm: 'cream',
        recentlyUsedAt: '2026-09-07T00:00:00.000Z',
      }),
      commercialHit({
        id: 'whipping-cream',
        mappedIngredientId: 'PI-WHIPPING-CREAM',
        displayName: 'WHIPPING CREAM · Tesco Cream · Chilled',
        canonicalFamily: null,
        category: 'dairy',
        productForm: 'fresh',
      }),
      commercialHit({
        id: 'banana-cream',
        mappedIngredientId: 'PI-ING-000188',
        displayName: 'BANANA · Fabbri Cream · Chilled · 0004282',
        originalName: 'delipaste_banana_fabbri_0004282',
        canonicalFamily: null,
        category: 'dairy',
        productForm: 'liquid',
      }),
      commercialHit({
        id: 'amaretto-cream',
        mappedIngredientId: 'PI-ING-000184',
        displayName: 'AMARETTO · Fabbri Cream · Chilled · 0004306',
        originalName: 'delipasta_amaretto_fabbri_0004306',
        canonicalFamily: null,
        category: 'dairy',
        productForm: 'liquid',
      }),
    ];
    await renderPicker(vi.fn(), 'ADD', {
      key: 80,
      context: filters,
      currentLine: {
        ...replacementLine(filters),
        usageMode: 'HOME_REPLACE',
        searchConceptSeed: 'CREAM 30%',
      },
    });

    // Presentation controls may broaden the visible catalogue query, but never
    // the line-derived replacement compatibility gate.
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-product-filter="all"]')?.click(),
    );

    expect(document.body.textContent).toContain('CREAM 36%');
    expect(document.body.textContent).toContain('WHIPPING CREAM');
    expect(document.body.textContent).not.toContain('BANANA · Fabbri Cream');
    expect(document.body.textContent).not.toContain('AMARETTO · Fabbri Cream');
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(document.querySelector('[data-picker-section="recent"]')?.textContent).toContain(
      'CREAM 36%',
    );
  });

  it('REPLACE-ROLE-01 keeps a Main line inside server-projected Main eligibility', async () => {
    const filters = { filter: 'dairy', subfilter: 'all', family: 'milk' } as const;
    mocks.hits = [
      commercialHit({
        id: 'standard-milk',
        mappedIngredientId: 'PI-STANDARD-MILK',
        displayName: 'Standard-only Milk',
        category: 'dairy',
        canonicalFamily: 'milk',
        productForm: 'milk',
        mainAllowed: false,
      }),
      commercialHit({
        id: 'main-milk',
        mappedIngredientId: 'PI-MAIN-MILK',
        displayName: 'Main-capable Milk',
        category: 'dairy',
        canonicalFamily: 'milk',
        productForm: 'milk',
        mainAllowed: true,
      }),
    ];
    await renderPicker(vi.fn(), 'ADD', {
      key: 79,
      context: filters,
      currentLine: {
        ...replacementLine(filters),
        currentRole: 'MAIN',
      },
    });

    expect(document.body.textContent).toContain('Main-capable Milk');
    expect(document.body.textContent).not.toContain('Standard-only Milk');
  });

  it('REPLACE-EMPTY-01 fails closed when no compatible replacement exists', async () => {
    const filters = { filter: 'fruit', subfilter: 'all', family: null } as const;
    mocks.hits = [
      commercialHit({
        id: 'blocked-banana',
        mappedIngredientId: 'PI-BLOCKED',
        displayName: 'Blocked Banana',
        category: 'fruit',
        usableInBase: false,
        usableAsTopping: false,
      }),
    ];
    await renderPicker(vi.fn(), 'ADD', {
      key: 78,
      context: filters,
      currentLine: replacementLine(filters),
    });

    expect(
      document.querySelector('[data-testid="product-picker-no-compatible-replacements"]')
        ?.textContent,
    ).toContain('Brak zgodnych zamienników');
    expect(document.body.textContent).not.toContain('Dodaj ręcznie');
  });

  it('selects the resolved country SKU behind one canonical row without turning it into a passive preference write', async () => {
    const exact = catalogHit({
      id: 'spanish-milk-product',
      entityKind: 'commercial_product',
      productCode: 'PR-ING-000901',
      currentVersionId: 'spanish-milk-version',
      status: 'verified',
      verificationMethod: 'human',
      displayName: 'Leche entera 3.6%',
      brand: 'Marca ES',
      mappedIngredientId: 'PI-ING-000236',
      markets: ['ES'],
      publicData: {
        productIntelligence: { engineUsable: true },
        technicalComposition: {
          water: 88.6,
          totalSolids: 11.4,
          fat: 3.6,
          protein: 3.2,
          carbohydrate: 4.7,
          sugars: 4.7,
          salt: 0.1,
        },
      },
    });
    mocks.hits = [
      catalogHit({
        id: 'milk-mapper',
        displayName: 'MILK 3.6% · Milk · Chilled',
        canonicalFamily: 'milk',
        category: 'dairy',
        productForm: 'milk',
        mappedIngredientId: 'PI-ING-000236',
        resolvedExactProduct: exact,
        resolutionSource: 'COUNTRY_PRIMARY_DEFAULT',
        resolutionCountry: 'ES',
      }),
      exact,
    ];
    const onAdd = await renderPicker();
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'milk');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    expect(document.body.textContent).toContain('MILK 3.6%');
    expect(document.body.textContent).toContain('Marca ES · Leche entera 3.6%');
    expect(document.querySelectorAll('button[aria-label="Dodaj MILK 3.6%"]')).toHaveLength(1);

    const add = document.querySelector<HTMLButtonElement>('button[aria-label="Dodaj MILK 3.6%"]');
    await act(async () => add?.click());
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      id: 'PR-ING-000901',
      private_product_id: 'catalog:spanish-milk-product:version:spanish-milk-version',
      name: 'Leche entera 3.6%',
    });
    expect(mocks.markUsed).toHaveBeenCalledWith({
      entityKind: 'commercial_product',
      id: 'spanish-milk-product',
    });
    expect(mocks.setPreferred).not.toHaveBeenCalled();
  });

  it('keeps a resolved exact SKU attached when the resolver projection omits its product code', async () => {
    const exact = catalogHit({
      id: 'preferred-milk-product',
      entityKind: 'commercial_product',
      productCode: null,
      currentVersionId: 'preferred-milk-version',
      status: 'manual_unverified',
      verificationMethod: 'human',
      displayName: 'Leche entera 3.5%',
      brand: 'Marca Preferida',
      mappedIngredientId: 'PI-ING-000236',
      markets: ['ES'],
      publicData: {
        nutrition: { basis: 'per_100ml', fat: 3.5 },
        productIntelligence: { engineUsable: true },
        technicalComposition: {
          water: 88.8,
          totalSolids: 11.2,
          fat: 3.5,
          protein: 3.2,
          carbohydrate: 4.7,
          sugars: 4.7,
          salt: 0.1,
        },
      },
    });
    mocks.hits = [
      catalogHit({
        id: 'milk-mapper',
        displayName: 'MILK 3.5% · Milk · Chilled',
        canonicalFamily: 'milk',
        category: 'dairy',
        productForm: 'milk',
        mappedIngredientId: 'PI-ING-000236',
        resolvedExactProduct: exact,
        resolutionSource: 'USER_PREFERRED',
        resolutionCountry: 'ES',
      }),
      exact,
    ];
    const onAdd = await renderPicker(vi.fn(), 'REPLACE');
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'milk');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const add = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Zamień na MILK 3.5%"]',
    );
    await act(async () => add?.click());

    expect(mocks.getRow).toHaveBeenCalledWith('PI-ING-000236');
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      id: 'catalog:preferred-milk-product',
      canonical_ingredient_id: 'PI-ING-000236',
      private_product_id: 'catalog:preferred-milk-product:version:preferred-milk-version',
      identity_provenance: 'reference',
      name: 'Marca Preferida · Leche entera 3.5%',
    });
    expect(mocks.markUsed).toHaveBeenCalledWith({
      entityKind: 'commercial_product',
      id: 'preferred-milk-product',
    });
    expect(mocks.setPreferred).not.toHaveBeenCalled();
  });

  it('fails closed when a resolved exact SKU does not match the canonical Mapper slot', async () => {
    const exact = catalogHit({
      id: 'mismatched-milk-product',
      entityKind: 'commercial_product',
      productCode: 'PR-ING-000904',
      currentVersionId: 'mismatched-milk-version',
      status: 'manual_unverified',
      verificationMethod: 'human',
      displayName: 'Wrong slot milk',
      mappedIngredientId: 'PI-ING-000999',
      publicData: { nutrition: { basis: 'per_100ml', fat: 3.5 } },
    });
    mocks.hits = [
      catalogHit({
        id: 'milk-mapper',
        displayName: 'MILK 3.5% · Milk · Chilled',
        canonicalFamily: 'milk',
        category: 'dairy',
        productForm: 'milk',
        mappedIngredientId: 'PI-ING-000236',
        resolvedExactProduct: exact,
        resolutionSource: 'USER_PREFERRED',
      }),
    ];
    const onAdd = await renderPicker();
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'milk');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const add = document.querySelector<HTMLButtonElement>('button[aria-label="Dodaj MILK 3.5%"]');
    await act(async () => add?.click());

    expect(onAdd).not.toHaveBeenCalled();
    expect(mocks.getRow).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('wymaga odświeżenia powiązania produktu');
  });

  it('updates CP-36 only when the user consciously selects an exact commercial result', async () => {
    const exact = catalogHit({
      id: 'user-milk-product',
      entityKind: 'commercial_product',
      productCode: 'PR-ING-000902',
      currentVersionId: 'user-milk-version',
      status: 'verified',
      verificationMethod: 'human',
      displayName: 'Leche exacta B',
      brand: 'Marca B',
      mappedIngredientId: 'PI-ING-000236',
      markets: ['ES'],
      publicData: {
        productIntelligence: { engineUsable: true },
        technicalComposition: {
          water: 88.6,
          totalSolids: 11.4,
          fat: 3.6,
          protein: 3.2,
          carbohydrate: 4.7,
          sugars: 4.7,
          salt: 0.1,
        },
      },
    });
    mocks.hits = [exact];
    const onAdd = await renderPicker();
    const add = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Dodaj Leche exacta B"]',
    );
    await act(async () => add?.click());

    expect(onAdd).toHaveBeenCalledOnce();
    expect(mocks.setPreferred).toHaveBeenCalledWith({
      mapperIngredientId: 'PI-ING-000236',
      productId: 'user-milk-product',
    });
  });

  it('shows the current product-owned percentage on an exact Hacendado EAN result', async () => {
    mocks.hits = [
      catalogHit({
        id: 'hacendado-current',
        productCode: 'PR-ING-007173',
        entityKind: 'commercial_product',
        status: 'manual_unverified',
        verificationMethod: 'human',
        displayName: 'Leche líquida entera Hacendado',
        brand: 'Hacendado',
        canonicalFamily: 'milk',
        category: 'dairy',
        productForm: 'milk',
        mappedIngredientId: 'PI-ING-000236',
        markets: ['ES'],
        eans: ['8402001047251'],
        publicData: { nutrition: { basis: 'per_100ml', fat: 3.5 } },
      }),
    ];
    await renderPicker();
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, '8402001047251');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    expect(document.body.textContent).toContain('Leche líquida entera Hacendado');
    expect(document.body.textContent).toContain('Hacendado · 3.5% tłuszczu');
    expect(document.querySelector('[data-info-product-id="PR-ING-007173"]')).not.toBeNull();
  });

  it('opens an external row Replace directly in its Milk context and keeps numeric order', async () => {
    mocks.hits = [
      catalogHit({
        id: 'milk-35',
        mappedIngredientId: 'PI-ING-000351',
        displayName: 'MILK 3.5% · Reference',
        category: 'dairy',
        canonicalFamily: 'milk',
        productForm: 'milk',
      }),
      catalogHit({
        id: 'cream-30',
        mappedIngredientId: 'PI-ING-000300',
        displayName: 'CREAM 30% · Reference',
        category: 'dairy',
        canonicalFamily: 'cream',
        productForm: 'cream',
      }),
      catalogHit({
        id: 'milk-05',
        mappedIngredientId: 'PI-ING-000051',
        displayName: 'MILK 0.5% · Reference',
        category: 'dairy',
        canonicalFamily: 'milk',
        productForm: 'milk',
      }),
    ];
    const onReplace = await renderPicker(vi.fn(), 'ADD', {
      key: 1,
      context: { filter: 'dairy', subfilter: 'all', family: 'milk' },
      currentLine: replacementLine({ filter: 'dairy', subfilter: 'all', family: 'milk' }),
    });

    expect(
      document.querySelector('[data-product-filter="dairy"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(document.body.textContent).not.toContain('CREAM 30%');
    const actions = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Zamień na MILK"]'),
    );
    expect(actions.map((button) => button.textContent)).toEqual(['Zamień', 'Zamień']);
    expect(actions.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Zamień na MILK 0.5%',
      'Zamień na MILK 3.5%',
    ]);
    expect(
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
        (button) => button.textContent?.trim() === '+',
      ),
    ).toHaveLength(0);

    await act(async () => actions[0]?.click());
    expect(onReplace).toHaveBeenCalledWith(engineIngredient, undefined);
  });

  it.each([
    ['DEXTROSE', 'sweetener', 'sugars', 'PI-ING-000101'],
    ['TARA GUM', 'stabilizer', 'stabilizers', 'PI-ING-000102'],
    ['GELLATTI STABILIZER', 'stabilizer', 'stabilizers', 'PI-ING-000103'],
    ['INULIN', 'fiber', 'inulin', 'PI-ING-000104'],
  ] as const)(
    'opens %s Replace in its Technical subcontext',
    async (name, category, subfilter, mapperId) => {
      mocks.hits = [
        catalogHit({
          id: name.toLocaleLowerCase('en-US').replaceAll(' ', '-'),
          mappedIngredientId: mapperId,
          displayName: name,
          category,
          canonicalFamily: subfilter === 'sugars' ? 'sugar' : null,
          productForm: category,
        }),
      ];
      await renderPicker(vi.fn(), 'ADD', {
        key: 1,
        context: { filter: 'technical', subfilter, family: null },
        currentLine: replacementLine({ filter: 'technical', subfilter, family: null }),
      });

      expect(
        document.querySelector('[data-product-filter="technical"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      expect(
        document
          .querySelector(`[data-product-subfilter="${subfilter}"]`)
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      expect(document.querySelector(`button[aria-label="Zamień na ${name}"]`)).not.toBeNull();
    },
  );

  it('opens Cream Replace in the Cream-only dairy family', async () => {
    mocks.hits = [
      catalogHit({
        id: 'cream-20',
        mappedIngredientId: 'PI-ING-000200',
        displayName: 'CREAM 20%',
        category: 'dairy',
        canonicalFamily: 'cream',
        productForm: 'cream',
      }),
      catalogHit({
        id: 'milk-35',
        mappedIngredientId: 'PI-ING-000351',
        displayName: 'MILK 3.5%',
        category: 'dairy',
        canonicalFamily: 'milk',
        productForm: 'milk',
      }),
    ];
    await renderPicker(vi.fn(), 'ADD', {
      key: 1,
      context: { filter: 'dairy', subfilter: 'all', family: 'cream' },
      currentLine: replacementLine({ filter: 'dairy', subfilter: 'all', family: 'cream' }),
    });

    expect(document.querySelector('button[aria-label="Zamień na CREAM 20%"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('MILK 3.5%');
  });

  it('C/K opens neutral product details and preserves favorite and add actions', async () => {
    const onAdd = await renderPicker();
    const info = document.querySelector<HTMLButtonElement>(
      'button[data-info-product-id="PI-ING-000345"]',
    );
    await act(async () => info?.click());
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="product-data-status-dialog"]',
    );
    expect(dialog?.textContent).toContain('BANANA · Fresh Fruit');
    expect(dialog?.textContent).toContain('ID');
    expect(dialog?.textContent).toContain('PI-ING-000345');
    expect(dialog?.textContent).toContain('Pewność');
    expect(dialog?.textContent).toContain('92%');
    expect(dialog?.textContent).not.toMatch(
      /Źródło|ai_estimated|verified_db|Zweryfikowane|Częściowo szacowane/,
    );

    await act(async () => {
      dialog?.querySelector<HTMLButtonElement>('button')?.click();
    });
    expect(document.activeElement).toBe(info);
    const star = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Usuń BANANA · Fresh Fruit z Ulubionych"]',
    );
    await act(async () => star?.click());
    expect(mocks.toggleFavorite).toHaveBeenCalledWith('pi_base', 'PI-ING-000345', false);

    const add = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Dodaj BANANA · Fresh Fruit"]',
    );
    await act(async () => add?.click());
    expect(onAdd).toHaveBeenCalledWith(engineIngredient, undefined);
  });

  it('shows Baitz with exactly one customer-facing article identity', async () => {
    mocks.hits = [
      catalogHit({
        id: '0cfa39a9-e683-4dea-b4b9-7f732a7c9c08',
        entityKind: 'commercial_product',
        productCode: 'PR-ING-006308',
        displayName: 'Baitz Baton choco cocos',
        mappedIngredientId: 'PI-ING-000091',
        status: 'manual_unverified',
        verificationMethod: 'mapper_estimated',
        semanticBinding: {
          authority: 'PR_ING_SEMANTIC_BINDING_V1',
          source: 'revalidation',
          state: 'RESOLVED',
          exactIdentity: {
            productId: '0cfa39a9-e683-4dea-b4b9-7f732a7c9c08',
            articleCode: 'PR-ING-006308',
            productVersionId: 'version-1',
            ean: null,
            brand: null,
            productName: 'Baitz Baton choco cocos',
            variant: null,
            pack: null,
          },
          searchAuthority: {
            releaseId: 'GELLATTI-SA10-2026-09-10-FINAL',
            concepts: [{ id: 'SC-ING-000081', key: 'coconut', targetType: 'INGREDIENT_CONCEPT' }],
            roleKeys: [],
          },
          classification: {
            family: 'confectionery',
            form: 'SOLID',
            role: 'TOPPING_ONLY',
            archetype: 'CONFECTIONERY',
            flavorDomain: 'COCONUT',
            compatibleMapperCategories: ['confectionery_inclusion'],
          },
          behavior: {
            familyId: 'inclusion',
            subfamilyId: null,
            formId: 'solid',
            behaviorRole: 'TOPPING_ONLY',
            behaviorFingerprint: 'fixture',
            referenceMapperIngredientId: null,
            runtimeMapperIngredientId: null,
          },
          readiness: {
            privateRecipe: { base: false, topping: true },
            publicCatalogue: false,
          },
          marketCountries: [],
          reasonCodes: [],
        },
      }),
    ];
    await renderPicker();
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'Baitz Baton choco cocos');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const info = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Pokaż status danych produktu: Baitz Baton choco cocos"]',
    );
    await act(async () => info?.click());
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="product-data-status-dialog"]',
    );

    expect(dialog?.textContent).toContain('ID produktu');
    expect(dialog?.textContent).toContain('PR-ING-006308');
    expect(dialog?.textContent).not.toContain('Profil Gellatti / Mapper');
    expect(dialog?.textContent).not.toContain('PI-ING-000091');
    expect(dialog?.textContent).toContain('confectionery · SOLID · TOPPING_ONLY');
    expect(dialog?.textContent).toContain('Search Concept');
    expect(dialog?.textContent).toContain('coconut');
    expect(dialog?.textContent).toContain('Kontekst potwierdzony');
  });

  it('G/H/I keeps one or two segments through filtering, searching, and long scroll', async () => {
    await renderPicker();
    const fruits = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Owoce'),
    );
    await act(async () => fruits?.click());
    expect(document.body.textContent).toContain('BANANA · Fresh Fruit');
    expect(document.body.textContent).not.toContain('ALMOND PASTE');
    expect(document.querySelectorAll('[data-picker-segment]')).toHaveLength(1);

    const all = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Wszystkie'),
    );
    await act(async () => all?.click());
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, 'banana');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    expect(document.body.textContent).toContain('Znaleziono 1 składnik');
    // Query active: only matching recent rows may lead the central result set.
    expect(document.querySelectorAll('[data-picker-segment="recent"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-picker-segment="favorites"]')).toHaveLength(0);

    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, '');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const list = document.querySelector<HTMLElement>('.product-picker-results');
    if (!list) throw new Error('catalog list missing');
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1200 },
      scrollTop: { configurable: true, value: 1000, writable: true },
    });
    await act(async () => list.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-picker-segment="recent"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-picker-segment="all"]')).toHaveLength(1);
  });

  it('keeps loaded rows visible while the next page is being appended', async () => {
    mocks.isFetching = true;

    await renderPicker();
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());

    expect(document.body.textContent).toContain('BANANA · Fresh Fruit');
    expect(document.body.textContent).toContain('CREAM 30% · Mlekovita Cream · Chilled');
    expect(document.body.textContent).toContain('Znaleziono 3 składników');
    expect(document.body.textContent).not.toContain('Znaleziono 0 składników');
    expect(document.body.textContent).not.toContain('Nie znaleziono produktu.');
  });

  it('reaches a finite true bottom without a blank/reset and then scrolls upward normally', async () => {
    const firstPage = Array.from({ length: 18 }, (_, index) =>
      catalogHit({
        id: `page-one-${index}`,
        mappedIngredientId: `PI-ING-${String(1000 + index).padStart(6, '0')}`,
        displayName: `${String(index + 1).padStart(2, '0')} INGREDIENT`,
        recentlyUsedAt: index < 2 ? `2026-09-0${index + 3}T10:00:00.000Z` : null,
      }),
    );
    const finalItem = catalogHit({
      id: 'final-page-item',
      mappedIngredientId: 'PI-ING-009999',
      displayName: 'ZZZ FINAL INGREDIENT',
    });
    mocks.hits = firstPage;

    await renderPicker();
    const all = document.querySelector<HTMLButtonElement>('[data-product-filter="all"]');
    await act(async () => all?.click());
    const list = document.querySelector<HTMLElement>('.product-picker-results');
    if (!list) throw new Error('catalog list missing');
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1200 },
      scrollTop: { configurable: true, value: 1000, writable: true },
    });

    await act(async () => list.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);

    // This is the real pagination seam: the new search page is current, while
    // its expanded country/SKU resolution is still pending. Existing and newly
    // appended rows must remain mounted so the browser preserves scrollTop.
    mocks.hits = [...firstPage, finalItem];
    mocks.isFetching = true;
    mocks.isSettled = false;
    await rerenderOpenPicker();

    const pendingList = document.querySelector<HTMLElement>('.product-picker-results');
    expect(pendingList).toBe(list);
    expect(pendingList?.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    expect(pendingList?.textContent).toContain('ZZZ FINAL INGREDIENT');
    expect(pendingList?.textContent).not.toContain('Wczytuję katalog…');
    expect(pendingList?.scrollTop).toBe(1000);

    mocks.isFetching = false;
    mocks.isSettled = true;
    mocks.hasMore = false;
    await rerenderOpenPicker();
    const finalList = document.querySelector<HTMLElement>('.product-picker-results');
    expect(finalList).toBe(list);
    expect(finalList?.textContent).toContain('ZZZ FINAL INGREDIENT');
    expect(finalList?.scrollTop).toBe(1000);

    await act(async () => finalList?.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);

    if (!finalList) throw new Error('final catalog list missing');
    finalList.scrollTop = 600;
    await act(async () => finalList.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(finalList.scrollTop).toBe(600);
    expect(finalList.textContent).toContain('ZZZ FINAL INGREDIENT');
  });
});
