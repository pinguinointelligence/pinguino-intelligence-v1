// @vitest-environment jsdom
/**
 * PAKIET PRODUKCJA V3 §4 + „Adresy” — Produkcja → Produkty on the real page.
 *
 *   - the catalogue's state is in the address (`q`, `fav`, `market`, `retailer`, `product`, with
 *     `filter` and `panel`) and survives a fresh mount of the same address (a refresh);
 *   - `?product=` opens the details; on a phone they are their own view with „‹ Produkty”,
 *     which returns to the same list;
 *   - `?panel=markets` is „Rynki produktów” (AccountProductMarkets), `?panel=requests` is
 *     „Zgłoszenia produktów” (ProductRequestAccountSections);
 *   - the old account addresses land there: `/account?section=products`, `/account?request=`;
 *   - „Rynki produktów” / „Ustawienia produktów” no longer point at the wrong account section;
 *   - HOME has no „Moja cena”;
 *   - an unsaved market change is asked about; a failed save keeps „Nie udało się zapisać
 *     krajów.” and the draft.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

const mocks = vi.hoisted(() => ({
  usePicker: vi.fn(),
  getPreferences: vi.fn(),
  listCountries: vi.fn(),
  savePreferences: vi.fn(),
  listRequests: vi.fn(),
  listContributed: vi.fn(),
}));

vi.mock('@/features/global-catalog/useGlobalCatalogPicker', () => ({
  useGlobalCatalogPicker: mocks.usePicker,
}));
vi.mock('@/services/globalCatalog', () => ({
  DEFAULT_CATALOG_MARKET_PREFERENCES: {
    primaryMarket: null,
    additionalMarkets: [],
    preferredRetailers: [],
    defaultScope: 'my_markets_and_global',
  },
  detectCatalogMarketCountry: vi.fn(async () => null),
  getCatalogMarketPreferences: mocks.getPreferences,
  listCatalogMarketCountries: mocks.listCountries,
  resolveGuestProductCountryConflict: vi.fn(),
  saveCatalogMarketPreferences: mocks.savePreferences,
}));
vi.mock('@/services/productRequests', () => ({
  listMyProductRequests: mocks.listRequests,
  listMyContributedProducts: mocks.listContributed,
  productRequestUserAction: vi.fn(),
  resubmitProductRequest: vi.fn(),
}));

import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { AccountWorkspacePage } from '@/pages/account/AccountWorkspacePage';
import { ProductsHubPage } from '@/pages/destinations/GlobalDestinationPages';
import { useAuthStore } from '@/stores/authStore';
import { ProductionAreaSurface } from './ProductionAreaSurface';
import { clearProductionAreaMemory } from './productionAreaMemory';
import { resetUnsavedGuardForTests } from './unsavedGuard';

const hit = (id: string, overrides: Partial<CatalogProductSearchHit>): CatalogProductSearchHit => ({
  id,
  currentVersionId: `version-${id}`,
  entityKind: 'commercial_product',
  status: 'verified',
  provenance: 'human_verified',
  displayName: id,
  originalName: null,
  originalLanguage: null,
  brand: 'Brand',
  canonicalFamily: null,
  category: 'dairy',
  productForm: null,
  mappedIngredientId: null,
  markets: ['PL'],
  retailers: [],
  eans: ['5900820000196'],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  usableAsTopping: true,
  blockedReason: null,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'human',
  publicData: {},
  privatePricePerKg: 1.3,
  privatePriceCurrency: 'EUR',
  ...overrides,
});

const HITS = [
  hit('mleko-laciate', { displayName: 'Mleko płynne Łaciate 3,2%' }),
  hit('pasta-pistacjowa', { displayName: 'Pasta pistacjowa 100%', privatePricePerKg: 38 }),
];

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="probe" data-path={`${location.pathname}${location.search}`}>
      {location.pathname}
    </output>
  );
}

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Produkcja → Produkty', () => {
  let host: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'products-owner', email: 'products@example.test', displayName: null },
      available: true,
    });
    clearProductionAreaMemory();
    resetUnsavedGuardForTests();
    mocks.usePicker.mockReturnValue({
      hits: HITS,
      favorites: new Set<string>(),
      recent: new Set<string>(),
      preferences: {
        primaryMarket: 'PL',
        additionalMarkets: ['ES'],
        preferredRetailers: [],
        defaultScope: 'my_markets',
      },
      isSettled: true,
      isFetching: false,
      isError: false,
      hasMore: false,
      loadMore: vi.fn(),
      toggleFavorite: vi.fn(),
    });
    mocks.getPreferences.mockResolvedValue({
      primaryMarket: 'PL',
      additionalMarkets: [],
      preferredRetailers: [],
      defaultScope: 'my_markets',
    });
    mocks.listCountries.mockResolvedValue([
      { code: 'PL', namePl: 'Polska', nameEn: 'Poland' },
      { code: 'ES', namePl: 'Hiszpania', nameEn: 'Spain' },
    ]);
    mocks.savePreferences.mockResolvedValue(undefined);
    mocks.listRequests.mockResolvedValue([]);
    mocks.listContributed.mockResolvedValue([]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    queryClient.clear();
    vi.clearAllMocks();
    useProCoreAccessStore.setState({ devPersona: null });
    resetUnsavedGuardForTests();
  });

  const render = async (initial: string, persona: ProCorePersona = 'pro') => {
    useProCoreAccessStore.setState({ devPersona: persona });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initial]}>
            <Routes>
              <Route path="/products" element={<ProductsHubPage />} />
              <Route path="/account" element={<AccountWorkspacePage />} />
              <Route
                path="/machine"
                element={<ProductionAreaSurface section="machine">maszyna</ProductionAreaSurface>}
              />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const path = () => host.querySelector('[data-testid="probe"]')?.getAttribute('data-path') ?? '';
  const search = () => new URLSearchParams(path().split('?')[1] ?? '');
  const click = async (element: Element | null | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => {
      (element as HTMLElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const buttonByText = (text: string) =>
    [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === text);
  const linkByText = (text: string) =>
    [...host.querySelectorAll('a')].find((link) => link.textContent?.trim() === text);

  it('keeps search, filters and the open product in the address, and restores them', async () => {
    await render('/products');
    const searchField = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => setValue(searchField, 'mleko'));
    expect(search().get('q')).toBe('mleko');
    await click(buttonByText('★ Ulubione'));
    expect(search().get('fav')).toBe('1');
    await click(buttonByText('PL'));
    expect(search().get('market')).toBe('PL');
    await click(buttonByText('Cały świat'));
    expect(search().get('market')).toBe('world');
    await click(
      [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Pasta pistacjowa 100%'),
      ),
    );
    expect(search().get('product')).toBe('commercial_product:pasta-pistacjowa');
    const kept = path();

    // A refresh = the same address mounted again.
    await act(async () => root.unmount());
    root = createRoot(host);
    await render(kept);
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('mleko');
    expect(buttonByText('★ Ulubione')?.getAttribute('aria-pressed')).toBe('true');
    expect(buttonByText('Cały świat')?.getAttribute('aria-pressed')).toBe('true');
    const detail = host.querySelector('[data-testid="catalog-product-detail"]')!;
    expect(detail.textContent).toContain('Pasta pistacjowa 100%');
  });

  it('opens a product as its own phone view, and „‹ Produkty” returns to the same list', async () => {
    await render('/products?filter=all&q=pasta');
    const list = host.querySelector('[data-testid="catalog-list"]')!;
    const detail = host.querySelector('[data-testid="catalog-product-detail"]')!;
    // No product chosen: the phone shows the list only.
    expect(detail.className).toContain('max-lg:hidden');
    expect(list.className).not.toContain('max-lg:hidden');

    await click(
      [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Pasta pistacjowa 100%'),
      ),
    );
    expect(search().get('product')).toBe('commercial_product:pasta-pistacjowa');
    expect(host.querySelector('[data-testid="catalog-list"]')!.className).toContain(
      'max-lg:hidden',
    );
    expect(host.querySelector('[data-testid="catalog-product-detail"]')!.className).not.toContain(
      'max-lg:hidden',
    );
    await click(host.querySelector('[data-testid="catalog-product-back"]'));
    expect(search().get('product')).toBeNull();
    expect(search().get('q')).toBe('pasta');
    expect(search().get('filter')).toBe('all');
  });

  it('opens `?product=` directly (a shared link) with the same details', async () => {
    await render('/products?product=commercial_product%3Amleko-laciate');
    const detail = host.querySelector('[data-testid="catalog-product-detail"]')!;
    expect(detail.className).not.toContain('max-lg:hidden');
    expect(detail.textContent).toContain('Mleko płynne Łaciate 3,2%');
    // No history entry to go back to: „‹ Produkty” clears the product in place.
    await click(host.querySelector('[data-testid="catalog-product-back"]'));
    expect(path()).toBe('/products');
  });

  it('PRO sees „Moja cena”; HOME does not', async () => {
    await render('/products?product=commercial_product%3Apasta-pistacjowa', 'pro');
    expect(host.textContent).toContain('Moja cena');
    expect(host.textContent).toContain('38.00');
    await act(async () => root.unmount());
    root = createRoot(host);
    await render('/products?product=commercial_product%3Apasta-pistacjowa', 'home');
    expect(host.textContent).not.toContain('Moja cena');
    expect(host.textContent).not.toContain('38.00');
  });

  it('points „Rynki produktów” and „Ustawienia produktów” at Produkty → Rynki produktów', async () => {
    await render('/products?product=commercial_product%3Amleko-laciate');
    const links = [...host.querySelectorAll('a')].filter((link) =>
      ['Rynki produktów', 'Ustawienia produktów'].some((name) =>
        link.textContent?.trim().startsWith(name),
      ),
    );
    // The search row, the product's „Ustawienia produktów” and the settings row below.
    expect(links).toHaveLength(3);
    for (const link of links) expect(link.getAttribute('href')).toBe('/products?panel=markets');
    expect(linkByText('Zgłoszenia produktów›')?.getAttribute('href')).toBe(
      '/products?panel=requests',
    );
  });

  it('`?panel=markets` is the account product-market form, with „‹ Produkty” to the same list', async () => {
    await render('/products?filter=mine&panel=markets');
    expect(host.querySelector('[data-testid="products-panel-markets"]')).not.toBeNull();
    expect(host.textContent).toContain('Produkty w wyszukiwarce');
    expect(host.querySelector('[data-testid="products-panel-back"]')?.getAttribute('href')).toBe(
      '/products?filter=mine',
    );
    // Still one area: the Produkty section is current.
    expect(
      host
        .querySelector('[data-testid="production-area-section-products"]')
        ?.getAttribute('aria-current'),
    ).toBe('page');
  });

  it('`?panel=requests` is the account product-request list', async () => {
    await render('/products?panel=requests&request=req-7');
    expect(host.querySelector('[data-testid="products-panel-requests"]')).not.toBeNull();
    expect(host.textContent).toContain('Zgłoszenia produktów');
    expect(mocks.listRequests).toHaveBeenCalled();
  });

  it('the old account addresses land on the same components in Produkty', async () => {
    await render('/account?section=products');
    expect(path()).toBe('/products?panel=markets');
    await act(async () => root.unmount());
    root = createRoot(host);
    await render('/account?request=req-7');
    expect(path()).toBe('/products?panel=requests&request=req-7');
  });

  it('the account keeps „Ustawienia receptury” and moves the Home invite to „Plan i płatności”', async () => {
    await render('/account?section=billing');
    expect(host.querySelector('[data-testid="account-section-products"]')).toBeNull();
    expect(host.querySelector('[data-testid="account-section-recipe"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="account-home-invite"]')).not.toBeNull();
  });

  it('asks before leaving an unsaved market change; a failed save keeps the draft and message', async () => {
    mocks.savePreferences.mockRejectedValueOnce(new Error('network'));
    await render('/products?panel=markets');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const spain = [...host.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Hiszpania'))
      ?.querySelector('input');
    await click(spain);
    expect(spain?.checked).toBe(true);

    await click(host.querySelector('[data-testid="production-area-section-machine"]'));
    expect(document.querySelector('[data-testid="unsaved-changes-dialog"]')?.textContent).toContain(
      'Rynki produktów: zmiany nie są jeszcze zapisane.',
    );
    await click(document.querySelector('[data-testid="unsaved-changes-save"]'));
    expect(path()).toBe('/products?panel=markets');
    expect(host.textContent).toContain('Nie udało się zapisać krajów.');
    expect(spain?.checked).toBe(true);

    await click(host.querySelector('[data-testid="production-area-section-machine"]'));
    await click(document.querySelector('[data-testid="unsaved-changes-save"]'));
    expect(mocks.savePreferences).toHaveBeenCalledTimes(2);
    expect(path()).toBe('/machine');
  });

  it('keeps the admin import one tap from Produkty, and Pro recalculation moves in-app', () => {
    const importPage = readFileSync(
      join(process.cwd(), 'src', 'pages', 'destinations', 'ProductImportPage.tsx'),
      'utf8',
    );
    expect(importPage).toContain('data-testid="product-import-back"');
    expect(importPage).toContain('to="/products"');
    const recalc = readFileSync(
      join(process.cwd(), 'src', 'features', 'pro-core', 'ProRecalcPanel.tsx'),
      'utf8',
    );
    expect(recalc).toContain("routerNavigator.push('/products/scan')");
  });
});
