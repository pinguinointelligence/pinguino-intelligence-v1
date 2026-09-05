/** @vitest-environment jsdom */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

const mocks = vi.hoisted(() => ({
  hits: [] as CatalogProductSearchHit[],
  eligibility: vi.fn(),
  submit: vi.fn(),
}));

vi.mock('@/features/global-catalog/useGlobalCatalogPicker', () => ({
  useGlobalCatalogPicker: (input: { query: string }) => ({
    hits: mocks.hits.filter((hit) => {
      const query = input.query.trim().toLocaleLowerCase('pl');
      if (!query) return true;
      return [hit.displayName, hit.brand, hit.productCode, ...hit.eans, ...hit.aliases].some(
        (value) => value?.toLocaleLowerCase('pl').includes(query),
      );
    }),
    favorites: new Set<string>(),
    recent: new Set<string>(),
    preferences: {
      primaryMarket: null,
      additionalMarkets: [],
      preferredRetailers: [],
      defaultScope: 'global',
    },
    searchIsSettled: true,
    isSettled: true,
    isFetching: false,
    isError: false,
    hasMore: false,
    loadMore: vi.fn(),
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock('@/services/productCapabilityReanalysis', () => ({
  getProductCapabilityReviewEligibility: mocks.eligibility,
  requestProductCapabilityReview: mocks.submit,
}));

vi.mock('@/services/globalCatalog', () => ({
  markCatalogProductUsed: vi.fn().mockResolvedValue(undefined),
  searchProducts: vi.fn().mockResolvedValue([]),
  setUserPreferredExactProductForSlot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/ingredients', () => ({
  getEngineApprovedIngredientById: vi.fn().mockResolvedValue(null),
}));

import {
  ProductPickerPopover,
  type ProductPickerHandoff,
  type ProductPickerRouteRequest,
} from './ProductPickerPopover';
import { serverSearchLibrary } from './ingredientLibrary';

const product = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'haribo-product-uuid',
  productCode: 'PR-ING-007144',
  currentVersionId: 'haribo-version-uuid',
  entityKind: 'commercial_product',
  status: 'verified',
  provenance: 'customer_added_admin_canonicalization_v1',
  displayName: 'HARIBO Quaxi',
  originalName: 'HARIBO Quaxi',
  originalLanguage: 'pl',
  brand: 'HARIBO',
  canonicalFamily: 'confectionery',
  category: 'candy',
  productForm: 'solid',
  mappedIngredientId: null,
  markets: ['GLOBAL'],
  retailers: [],
  eans: ['4001686322536'],
  aliases: ['Quaxi'],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: false,
  mainAllowed: false,
  usableAsTopping: true,
  blockedReason: null,
  relevance: 100,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'human',
  publicData: {},
  ...overrides,
});

const setInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const flushQueries = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('ProductPickerPopover bidirectional context routing', () => {
  let host: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    mocks.hits = [product()];
    mocks.eligibility.mockResolvedValue({
      eligible: true,
      existingRequestStatus: null,
      currentClassification: 'TOPPING_ONLY',
    });
    mocks.submit.mockResolvedValue({
      requestId: 'request-uuid',
      status: 'OPEN',
      alreadyExists: false,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  const render = async (
    scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON',
    options: {
      onRouteToScope?: (request: ProductPickerRouteRequest) => void;
      handoff?: ProductPickerHandoff | null;
    } = {},
  ) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProductPickerPopover
              library={serverSearchLibrary()}
              scope={scope}
              onAdd={vi.fn()}
              {...options}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    await act(async () => trigger?.click());
    return document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  };

  it('TOPPING_ONLY is absent from ingredient browse, then becomes a neutral exact-search route without +', async () => {
    const onRouteToScope = vi.fn();
    const input = await render('BASE_FORMULATION', { onRouteToScope });

    expect(document.body.textContent).not.toContain('HARIBO Quaxi');
    await setInput(input, 'HARIBO');
    await act(async () => Promise.resolve());

    const row = document.querySelector<HTMLElement>(
      '[data-testid="product-picker-contextual-product"]',
    );
    expect(row?.textContent).toContain('HARIBO Quaxi');
    expect(row?.textContent).toContain('Topping');
    expect(row?.textContent).toContain('Ten produkt jest dostępny jako topping.');
    expect(row?.textContent).toContain('Przejdź do toppingów →');
    expect(row?.textContent).not.toContain('!');
    expect(row?.querySelector('[aria-label="Dodaj HARIBO Quaxi"]')).toBeNull();
    expect(document.querySelector('[data-picker-segment="otherContext"]')).not.toBeNull();

    const route = Array.from(row?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('Przejdź do toppingów'),
    );
    await act(async () => route?.click());
    expect(onRouteToScope).toHaveBeenCalledWith({
      targetScope: 'POST_PROCESS_ADDON',
      query: 'HARIBO',
      productId: 'haribo-product-uuid',
    });
  });

  it('shows contributor-only ingredient reanalysis, submits once, and never adds the product', async () => {
    const input = await render('BASE_FORMULATION', { onRouteToScope: vi.fn() });
    await setInput(input, 'HARIBO Quaxi');
    await flushQueries();

    expect(document.body.textContent).toContain('Uważasz, że powinien działać też jako składnik?');
    const request = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Poproś o ponowną analizę',
    );
    await act(async () => request?.click());

    expect(mocks.submit).toHaveBeenCalledWith({
      productId: 'haribo-product-uuid',
      requestedCapability: 'INGREDIENT',
      attemptedContext: 'INGREDIENT_PICKER',
    });
    expect(document.body.textContent).toContain('Dzięki — sprawdzimy to jeszcze raz.');
    expect(document.body.textContent).toContain(
      'Na razie produkt pozostaje dostępny jako topping.',
    );
    expect(document.querySelector('[aria-label="Dodaj HARIBO Quaxi"]')).toBeNull();
  });

  it('routes the active wrong-context result with Enter instead of showing an unavailable error', async () => {
    const onRouteToScope = vi.fn();
    const input = await render('BASE_FORMULATION', { onRouteToScope });
    await setInput(input, 'HARIBO');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onRouteToScope).toHaveBeenCalledWith({
      targetScope: 'POST_PROCESS_ADDON',
      query: 'HARIBO',
      productId: 'haribo-product-uuid',
    });
    expect(document.querySelector('[data-testid="product-picker-unavailable-reason"]')).toBeNull();
  });

  it('hides reanalysis from a non-contributor and shows an owner existing-request state', async () => {
    mocks.eligibility.mockResolvedValueOnce({
      eligible: false,
      existingRequestStatus: null,
      currentClassification: 'TOPPING_ONLY',
    });
    let input = await render('BASE_FORMULATION', { onRouteToScope: vi.fn() });
    await setInput(input, 'HARIBO');
    await flushQueries();
    expect(document.body.textContent).not.toContain('Poproś o ponowną analizę');

    await act(async () => root.unmount());
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    mocks.eligibility.mockResolvedValueOnce({
      eligible: true,
      existingRequestStatus: 'OPEN',
      currentClassification: 'TOPPING_ONLY',
    });
    input = await render('BASE_FORMULATION', { onRouteToScope: vi.fn() });
    await setInput(input, 'HARIBO');
    await flushQueries();
    expect(document.body.textContent).toContain('Prośba o ponowną analizę została już wysłana.');
    expect(document.body.textContent).not.toContain('Poproś o ponowną analizę');
  });

  it('uses the symmetric ingredient-only route in the topping picker', async () => {
    mocks.hits = [
      product({
        id: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
        productCode: 'PR-ING-007142',
        displayName: 'Cacao Puro',
        originalName: 'Cacao Puro',
        brand: 'La Chocolatera',
        eans: ['8410109121551'],
        aliases: [],
        usableInBase: true,
        usableAsTopping: false,
      }),
    ];
    mocks.eligibility.mockResolvedValue({
      eligible: true,
      existingRequestStatus: null,
      currentClassification: 'INGREDIENT_ONLY',
    });
    const onRouteToScope = vi.fn();
    const input = await render('POST_PROCESS_ADDON', { onRouteToScope });
    await setInput(input, 'PR-ING-007142');
    await flushQueries();

    const row = document.querySelector<HTMLElement>(
      '[data-testid="product-picker-contextual-product"]',
    );
    expect(row?.textContent).toContain('Składnik');
    expect(row?.textContent).toContain('Ten produkt jest dostępny jako składnik receptury.');
    expect(row?.textContent).toContain('Przejdź do składników →');
    expect(row?.textContent).toContain('Uważasz, że powinien działać też jako topping?');
    expect(row?.querySelector('[aria-label="Dodaj Cacao Puro"]')).toBeNull();

    const route = Array.from(row?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('Przejdź do składników'),
    );
    await act(async () => route?.click());
    expect(onRouteToScope).toHaveBeenCalledWith({
      targetScope: 'BASE_FORMULATION',
      query: 'PR-ING-007142',
      productId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
    });
  });

  it('keeps normal + actions for the correct scope and for BOTH, with no reanalysis CTA', async () => {
    await render('POST_PROCESS_ADDON');
    expect(document.querySelector('[aria-label="Dodaj HARIBO Quaxi"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Poproś o ponowną analizę');

    await act(async () => root.unmount());
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    mocks.hits = [product({ usableInBase: true, usableAsTopping: true })];
    await render('BASE_FORMULATION');
    expect(document.querySelector('[aria-label="Dodaj HARIBO Quaxi"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Przejdź do toppingów');
  });

  it('opens the sibling picker with the same query and exact product target after handoff', async () => {
    function Harness() {
      const [handoff, setHandoff] = useState<ProductPickerHandoff | null>(null);
      const route = (request: ProductPickerRouteRequest) =>
        setHandoff({ ...request, key: (handoff?.key ?? 0) + 1, scope: request.targetScope });
      return (
        <>
          <ProductPickerPopover
            library={serverSearchLibrary()}
            scope="BASE_FORMULATION"
            onAdd={vi.fn()}
            handoff={handoff?.scope === 'BASE_FORMULATION' ? handoff : null}
            onRouteToScope={route}
          />
          <ProductPickerPopover
            library={serverSearchLibrary()}
            scope="POST_PROCESS_ADDON"
            onAdd={vi.fn()}
            handoff={handoff?.scope === 'POST_PROCESS_ADDON' ? handoff : null}
            onRouteToScope={route}
          />
        </>
      );
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Harness />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const ingredientTrigger = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]'),
    ).find((button) => button.textContent?.includes('Dodaj składnik'));
    await act(async () => ingredientTrigger?.click());
    let input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await setInput(input, 'HARIBO');
    const route = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Przejdź do toppingów'),
    );
    await act(async () => route?.click());

    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.getAttribute('aria-label')).toBe('Dodaj topping');
    input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(input.value).toBe('HARIBO');
    const target = document.querySelector<HTMLElement>('[data-product-id="haribo-product-uuid"]');
    expect(target).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-activedescendant')).toBe(target?.id);
    expect(document.querySelector('[aria-label="Dodaj HARIBO Quaxi"]')).not.toBeNull();
  });
});
