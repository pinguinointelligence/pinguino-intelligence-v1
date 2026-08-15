// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProductSearchHit } from './contracts';

const mocks = vi.hoisted(() => ({ usePicker: vi.fn() }));
vi.mock('./useGlobalCatalogPicker', () => ({
  useGlobalCatalogPicker: mocks.usePicker,
}));

import { GlobalCatalogSearchPanel } from './GlobalCatalogSearchPanel';

const hit = (
  id: string,
  overrides: Partial<CatalogProductSearchHit>,
): CatalogProductSearchHit => ({
  id,
  currentVersionId: `version-${id}`,
  entityKind: 'pi_base',
  status: 'pi_base',
  provenance: 'mapper',
  displayName: id,
  originalName: null,
  originalLanguage: null,
  brand: null,
  canonicalFamily: null,
  category: 'fruit',
  productForm: 'fresh',
  mappedIngredientId: id,
  markets: [],
  retailers: [],
  eans: [],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  usableAsTopping: true,
  blockedReason: null,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'mapper_verified',
  publicData: {},
  ...overrides,
});

describe('GlobalCatalogSearchPanel status projection', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
    const hits = [
      hit('PI-VERIFIED', {}),
      hit('PI-ESTIMATED', { verificationMethod: 'mapper_estimated' }),
      hit('PI-LABEL', { verificationMethod: 'mapper_needs_label_review' }),
      hit('PI-BLOCKED', { usableAsTopping: false, blockedReason: 'Brak zatwierdzenia Topping.' }),
      hit('customer-product', {
        entityKind: 'commercial_product', status: 'manual_unverified',
        provenance: 'manual', mappedIngredientId: 'PI-ING-000405',
        verificationMethod: 'manual_unverified', brand: 'Customer',
      }),
      hit('customer-mapped-label-gap', {
        entityKind: 'commercial_product', status: 'blocked',
        provenance: 'manual', mappedIngredientId: 'PI-ING-000405',
        verificationMethod: 'manual_unverified', brand: 'Customer',
        usableAsTopping: true, missingFields: ['allergens_text'],
      }),
    ];
    mocks.usePicker.mockReturnValue({
      hits,
      favorites: new Set<string>(),
      recent: new Set<string>(),
      preferences: {
        primaryMarket: null, additionalMarkets: [], preferredRetailers: [], defaultScope: 'global',
      },
      isSettled: true,
      isFetching: false,
      isError: false,
      hasMore: false,
      loadMore: vi.fn(),
      toggleFavorite: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    mocks.usePicker.mockReset();
  });

  it('renders truthful TOPPING-context status for Mapper and customer rows without hiding Favorites', async () => {
    await act(async () => {
      root.render(<MemoryRouter><GlobalCatalogSearchPanel /></MemoryRouter>);
    });

    const statuses = [...host.querySelectorAll('[data-catalog-verification-status]')]
      .map((element) => element.getAttribute('data-catalog-verification-status'));
    expect(statuses).toEqual(expect.arrayContaining([
      'PINGÜINO — SPRAWDZONY',
      'Dane szacowane',
      'WYMAGA SPRAWDZENIA ETYKIETY',
      'PRODUCT DATA INCOMPLETE',
      'DODANY PRZEZ UŻYTKOWNIKA',
    ]));
    expect(host.querySelector('[data-catalog-verification-status="PRODUCT DATA INCOMPLETE"]')
      ?.className).toContain('bg-red-100');
    expect(host.querySelector('[data-catalog-verification-status="WYMAGA SPRAWDZENIA ETYKIETY"]')
      ?.className).toContain('bg-amber-100');
    const exactBlock = host.querySelector('[data-catalog-block-reason]');
    expect(exactBlock?.textContent).toContain('PI-BLOCKED');
    expect(exactBlock?.textContent).toContain('version-PI-BLOCKED');
    expect(exactBlock?.textContent).toContain('Mapper PI-BLOCKED');
    expect(exactBlock?.textContent).toContain('moduł TOPPING');
    expect(exactBlock?.textContent).toContain('Brak zatwierdzenia Topping');
    expect(host.querySelectorAll('button[aria-label*="do Ulubionych"]')).toHaveLength(6);
  });
});
