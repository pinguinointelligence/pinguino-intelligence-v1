/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { EngineIngredient } from '@/engine';

const mocks = vi.hoisted(() => ({
  hits: [] as CatalogProductSearchHit[],
  getRow: vi.fn(),
  markUsed: vi.fn(),
  toggleFavorite: vi.fn(),
  loadMore: vi.fn(),
  toEngine: vi.fn(),
}));

vi.mock('@/features/global-catalog/useGlobalCatalogPicker', () => ({
  useGlobalCatalogPicker: (input: { query: string; favoritesOnly: boolean }) => {
    const query = input.query.trim().toLocaleLowerCase('pl');
    const hits = mocks.hits.filter((hit) =>
      (!input.favoritesOnly || hit.favorite) &&
      (!query || hit.displayName.toLocaleLowerCase('pl').includes(query)));
    return {
      hits,
      favorites: new Set<string>(),
      recent: new Set(
        hits
          .filter((hit) => hit.recentlyUsedAt)
          .map((hit) => `${hit.entityKind}:${hit.entityKind === 'pi_base' ? hit.mappedIngredientId : hit.id}`),
      ),
      preferences: {
        primaryMarket: null,
        additionalMarkets: [],
        preferredRetailers: [],
        defaultScope: 'global',
      },
      isSettled: true,
      isFetching: false,
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

import { ProductPickerPopover } from './ProductPickerPopover';
import { serverSearchLibrary } from './ingredientLibrary';

const catalogHit = (
  overrides: Partial<CatalogProductSearchHit> = {},
): CatalogProductSearchHit => ({
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
    mocks.getRow.mockResolvedValue({});
    mocks.toEngine.mockReturnValue(engineIngredient);
    mocks.markUsed.mockResolvedValue(undefined);
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

  const renderPicker = async (onAdd = vi.fn()) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductPickerPopover
            library={serverSearchLibrary()}
            scope="BASE_FORMULATION"
            onAdd={onAdd}
          />
        </MemoryRouter>,
      );
    });
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    );
    await act(async () => trigger?.click());
    return onAdd;
  };

  it('A/B/D/F/J shows neutral metadata, unique count, and stable headings', async () => {
    await renderPicker();
    const text = document.body.textContent ?? '';

    expect(text).toContain('PI-ING-000180');
    expect(text).toContain('Status danych · 98%');
    expect(text).toContain('PI-ING-000345');
    expect(text).toContain('Status danych · 92%');
    expect(text).toContain('PI-ING-000520');
    expect(text).toContain('Status danych · —');
    expect(text).toContain('Znaleziono 3 składników');
    expect(document.querySelectorAll('[data-picker-segment="featured"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-picker-segment="remaining"]')).toHaveLength(1);
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
    expect(dialog?.textContent).toContain('Status danych');
    expect(dialog?.textContent).toContain('92%');
    expect(dialog?.textContent).not.toMatch(
      /Źródło|ai_estimated|verified_db|Zweryfikowane|Częściowo szacowane|Pewność/,
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

  it('G/H/I keeps one or two segments through filtering, searching, and long scroll', async () => {
    await renderPicker();
    const pastes = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Pasty'),
    );
    await act(async () => pastes?.click());
    expect(document.body.textContent).toContain('SKŁADNIKI');
    expect(document.body.textContent).toContain('ALMOND PASTE');
    expect(document.body.textContent).not.toContain('BANANA · Fresh Fruit');
    expect(document.querySelectorAll('[data-picker-segment]')).toHaveLength(1);

    const all = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Wszystkie'),
    );
    await act(async () => all?.click());
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(search, 'banana');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    expect(document.body.textContent).toContain('Znaleziono 1 składnik');
    expect(document.querySelectorAll('[data-picker-segment="featured"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-picker-segment="remaining"]')).toHaveLength(0);

    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
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
    expect(document.querySelectorAll('[data-picker-segment="featured"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-picker-segment="remaining"]')).toHaveLength(1);
  });
});
