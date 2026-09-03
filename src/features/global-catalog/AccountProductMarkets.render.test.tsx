// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectCountry: vi.fn(),
  getPreferences: vi.fn(),
  listCountries: vi.fn(),
  savePreferences: vi.fn(),
}));

vi.mock('@/services/globalCatalog', () => ({
  DEFAULT_CATALOG_MARKET_PREFERENCES: {
    primaryMarket: null,
    additionalMarkets: [],
    preferredRetailers: [],
    defaultScope: 'my_markets_and_global',
  },
  detectCatalogMarketCountry: mocks.detectCountry,
  getCatalogMarketPreferences: mocks.getPreferences,
  listCatalogMarketCountries: mocks.listCountries,
  saveCatalogMarketPreferences: mocks.savePreferences,
}));

import { AccountProductMarkets } from './AccountProductMarkets';

describe('Primary Product Country rendered interaction', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  const settleQueries = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    mocks.getPreferences.mockResolvedValue({
      primaryMarket: 'PL',
      additionalMarkets: ['ES', 'DE'],
      preferredRetailers: ['Mercadona'],
      defaultScope: 'my_markets_and_global',
    });
    mocks.listCountries.mockResolvedValue([
      { code: 'PL', namePl: 'Polska', nameEn: 'Poland' },
      { code: 'ES', namePl: 'Hiszpania', nameEn: 'Spain' },
      { code: 'DE', namePl: 'Niemcy', nameEn: 'Germany' },
    ]);
    mocks.detectCountry.mockResolvedValue(null);
    mocks.savePreferences.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('promotes an enabled country, preserves the rest, and saves that exact preference', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AccountProductMarkets />
        </QueryClientProvider>,
      );
    });
    await settleQueries();

    const poland = host.querySelector<HTMLInputElement>(
      'input[name="primary-product-market"][value="PL"]',
    );
    const spain = host.querySelector<HTMLInputElement>(
      'input[name="primary-product-market"][value="ES"]',
    );
    expect(poland?.checked).toBe(true);
    expect(spain?.checked).toBe(false);

    await act(async () => spain?.click());
    expect(spain?.checked).toBe(true);

    const save = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Zapisz ustawienia',
    );
    await act(async () => save?.click());
    await settleQueries();

    expect(mocks.savePreferences.mock.calls[0]?.[0]).toEqual({
      primaryMarket: 'ES',
      additionalMarkets: ['PL', 'DE'],
      preferredRetailers: ['Mercadona'],
      defaultScope: 'my_markets_and_global',
    });
  });
});
