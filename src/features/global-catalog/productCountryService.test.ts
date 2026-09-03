// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

vi.mock('@/services/auth', () => ({
  getCurrentUser: mocks.currentUser,
}));

import {
  detectCatalogMarketCountry,
  getCatalogMarketPreferences,
  readDeploymentProductCountry,
  resolveCountryProductsForSlots,
  resolveGuestProductCountryConflict,
  saveCatalogMarketPreferences,
  setUserPreferredExactProductForSlot,
} from '@/services/globalCatalog';

const queryResult = (data: unknown) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data, error: null })) })),
  })),
});

describe('Product Country client authority', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue(null);
  });

  it('reads only the verified coarse deployment endpoint', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ country: 'es' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(readDeploymentProductCountry(fetcher)).resolves.toBe('ES');
    expect(fetcher).toHaveBeenCalledWith('/api/product-country', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  });

  it('bootstraps and persists the first signed-out country before login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ country: 'PL' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(getCatalogMarketPreferences()).resolves.toMatchObject({
      primaryMarket: 'PL',
      defaultScope: 'my_markets',
    });
    expect(JSON.parse(localStorage.getItem('pinguino.product_country.v1') ?? '{}')).toMatchObject({
      countryCode: 'PL',
      source: 'detected',
    });
  });

  it.each([
    ['ES', 'pl-PL', 'de-DE'],
    ['PL', 'es-ES', 'fr-FR'],
    ['FR', 'en-GB', 'pl-PL'],
  ] as const)(
    'persists signed-out Product Country %s independently of UI locale %s',
    async (country, initialLocale, laterLocale) => {
      Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        value: initialLocale,
      });
      await saveCatalogMarketPreferences({
        primaryMarket: country,
        additionalMarkets: [],
        preferredRetailers: [],
        defaultScope: 'my_markets',
      });
      Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        value: laterLocale,
      });

      await expect(getCatalogMarketPreferences()).resolves.toMatchObject({
        primaryMarket: country,
        defaultScope: 'my_markets',
      });
      await expect(detectCatalogMarketCountry()).resolves.toBe(country);
    },
  );

  it('maps the bounded resolver projection without changing its authority source', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          requested_mapper_ingredient_id: 'PI-ING-000236',
          resolution_source: 'USER_PREFERRED',
          resolution_country: 'ES',
          id: 'product-b',
          current_version_id: 'version-b',
          entity_kind: 'commercial_product',
          status: 'verified',
          verification_method: 'human',
          provenance: 'human_verified',
          display_name: 'Leche B',
          original_name: 'Leche B',
          original_language: 'es',
          brand: 'Marca B',
          canonical_family: 'milk',
          category: 'dairy',
          product_form: 'milk',
          mapped_ingredient_id: 'PI-ING-000236',
          markets: ['ES'],
          retailers: [],
          eans: ['8412345678901'],
          aliases: [],
          favorite: false,
          recently_used_at: null,
          usable_in_base: true,
          main_allowed: false,
          usable_as_topping: true,
          blocked_reason: null,
          missing_fields: [],
          invalid_fields: [],
          public_data: { productCode: 'PR-ING-000901' },
          private_price: null,
          private_currency: null,
          relevance: 0,
        },
      ],
      error: null,
    });

    await expect(
      resolveCountryProductsForSlots({
        mapperIngredientIds: ['PI-ING-000236'],
        productCountry: 'ES',
      }),
    ).resolves.toMatchObject([
      {
        mapperIngredientId: 'PI-ING-000236',
        source: 'USER_PREFERRED',
        country: 'ES',
        product: {
          id: 'product-b',
          productCode: 'PR-ING-000901',
          mappedIngredientId: 'PI-ING-000236',
        },
      },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_country_product_slots_v1', {
      p_mapper_ingredient_ids: ['PI-ING-000236'],
      p_product_country: 'ES',
      p_product_profile: null,
    });
  });

  it('surfaces explicit guest/account conflict without mutating either winner', async () => {
    await saveCatalogMarketPreferences({
      primaryMarket: 'ES',
      additionalMarkets: [],
      preferredRetailers: [],
      defaultScope: 'my_markets',
    });
    mocks.currentUser.mockResolvedValue({ id: 'user-1' });
    mocks.from.mockReturnValue(
      queryResult({
        primary_market: 'PL',
        additional_markets: [],
        preferred_retailers: [],
        default_scope: 'my_markets',
      }),
    );
    mocks.rpc.mockResolvedValue({
      data: {
        mergeOutcome: 'EXPLICIT_CONFLICT',
        primaryMarket: 'PL',
        additionalMarkets: [],
        preferredRetailers: [],
        defaultScope: 'my_markets',
        guestCountry: 'ES',
      },
      error: null,
    });

    await expect(getCatalogMarketPreferences()).resolves.toMatchObject({
      primaryMarket: 'PL',
      guestCountryConflict: { accountCountry: 'PL', guestCountry: 'ES' },
    });
    expect(localStorage.getItem('pinguino.product_country.v1')).not.toBeNull();
  });

  it('keeps a signed-in explicit Product Country authoritative over profile, travel, and UI locale', async () => {
    mocks.currentUser.mockResolvedValue({ id: 'user-1' });
    mocks.from.mockImplementation((table: string) =>
      table === 'account_product_market_preferences'
        ? queryResult({ primary_market: 'ES' })
        : queryResult({ country: 'PL' }),
    );
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'fr-FR',
    });

    await expect(detectCatalogMarketCountry()).resolves.toBe('ES');
    expect(mocks.from).toHaveBeenCalledWith('account_product_market_preferences');
    expect(mocks.from).toHaveBeenCalledWith('account_profiles');
  });

  it('uses a coarse country as the first signed-in default only while no preference row exists', async () => {
    mocks.currentUser.mockResolvedValue({ id: 'user-1' });
    mocks.from.mockImplementation((table: string) =>
      table === 'account_product_market_preferences'
        ? queryResult(null)
        : queryResult({ country: 'FR' }),
    );

    await expect(getCatalogMarketPreferences()).resolves.toMatchObject({
      primaryMarket: 'FR',
      defaultScope: 'my_markets',
    });
  });

  it('applies a conscious guest choice and clears device state only after server success', async () => {
    mocks.currentUser.mockResolvedValue(null);
    await saveCatalogMarketPreferences({
      primaryMarket: 'ES',
      additionalMarkets: [],
      preferredRetailers: [],
      defaultScope: 'my_markets',
    });
    mocks.currentUser.mockResolvedValue({ id: 'user-1' });
    mocks.rpc.mockResolvedValue({
      data: {
        mergeOutcome: 'GUEST_CHOSEN',
        primaryMarket: 'ES',
        additionalMarkets: ['PL'],
        preferredRetailers: [],
        defaultScope: 'my_markets',
      },
      error: null,
    });

    await expect(resolveGuestProductCountryConflict('guest')).resolves.toMatchObject({
      primaryMarket: 'ES',
      additionalMarkets: ['PL'],
      guestCountryConflict: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('merge_guest_product_country_v1', {
      p_guest_country: 'ES',
      p_guest_source: 'EXPLICIT',
      p_conflict_choice: 'GUEST',
    });
    expect(localStorage.getItem('pinguino.product_country.v1')).toBeNull();
  });

  it('writes CP-36 only through the explicit exact-product setter', async () => {
    mocks.currentUser.mockResolvedValue({ id: 'user-1' });
    mocks.rpc.mockResolvedValue({ data: 'product-b', error: null });
    await setUserPreferredExactProductForSlot({
      mapperIngredientId: 'PI-ING-000236',
      productId: 'product-b',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('set_user_preferred_product_for_slot_v1', {
      p_mapper_ingredient_id: 'PI-ING-000236',
      p_preferred_product_id: 'product-b',
    });
  });
});
