/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { EngineIngredient } from '@/engine';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mocks = vi.hoisted(() => ({
  hits: [] as CatalogProductSearchHit[],
  getRow: vi.fn(),
  markUsed: vi.fn(),
  toggleFavorite: vi.fn(),
  loadMore: vi.fn(),
  toEngine: vi.fn(),
  isFetching: false,
  isSettled: true,
}));

vi.mock('@/features/global-catalog/useGlobalCatalogPicker', () => ({
  useGlobalCatalogPicker: (input: { query: string; favoritesOnly: boolean }) => {
    const query = input.query.trim().toLocaleLowerCase('pl');
    const hits = mocks.hits.filter(
      (hit) =>
        (!input.favoritesOnly || hit.favorite) &&
        (!query ||
          [hit.displayName, hit.canonicalFamily, hit.category, hit.productForm, ...hit.aliases]
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
      isSettled: mocks.isSettled,
      isFetching: mocks.isFetching,
      isError: false,
      hasMore: true,
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
}));

vi.mock('@/data/ingredients/ingredientMapper', () => ({
  ingredientRowToEngineIngredient: mocks.toEngine,
}));

import { ProductPickerPopover, type ProductPickerReplaceInvocation } from './ProductPickerPopover';
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
    mocks.isFetching = false;
    mocks.isSettled = true;
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
  ) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductPickerPopover
            library={serverSearchLibrary()}
            scope="BASE_FORMULATION"
            intent={intent}
            replaceInvocation={replaceInvocation}
            onAdd={onAdd}
          />
        </MemoryRouter>,
      );
    });
    if (!replaceInvocation) {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
      await act(async () => trigger?.click());
    }
    return onAdd;
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
    // Query active: favorite state is only the star, never a ranking section.
    expect(document.querySelectorAll('[data-picker-segment="ingredients"]')).toHaveLength(1);
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
});
