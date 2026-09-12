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

const hit = (id: string, overrides: Partial<CatalogProductSearchHit>): CatalogProductSearchHit => ({
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
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
    const hits = [
      hit('PI-VERIFIED', {}),
      hit('PI-ESTIMATED', { verificationMethod: 'mapper_estimated' }),
      hit('PI-LABEL', { verificationMethod: 'mapper_needs_label_review' }),
      hit('PI-BLOCKED', { usableAsTopping: false, blockedReason: 'Brak zatwierdzenia Topping.' }),
      hit('customer-product', {
        entityKind: 'commercial_product',
        status: 'manual_unverified',
        provenance: 'manual',
        mappedIngredientId: 'PI-ING-000405',
        verificationMethod: 'manual_unverified',
        brand: 'Customer',
      }),
      hit('customer-mapped-label-gap', {
        entityKind: 'commercial_product',
        status: 'blocked',
        provenance: 'manual',
        mappedIngredientId: 'PI-ING-000405',
        verificationMethod: 'manual_unverified',
        brand: 'Customer',
        usableAsTopping: true,
        missingFields: ['allergens_text'],
      }),
      hit('haribo-product-id', {
        entityKind: 'commercial_product',
        productCode: 'PR-ING-007205',
        status: 'verified',
        provenance: 'human_verified',
        mappedIngredientId: null,
        verificationMethod: 'human',
        displayName: 'HARIBO Żelki owocowe arbuz',
        brand: 'Haribo',
        eans: ['8426617014254'],
        usableInBase: false,
        usableAsTopping: true,
        semanticBinding: {
          authority: 'PR_ING_SEMANTIC_BINDING_V1',
          source: 'scanner',
          state: 'RESOLVED',
          exactIdentity: {
            productId: 'haribo-product-id',
            articleCode: 'PR-ING-007205',
            productVersionId: 'haribo-version-2',
            ean: '8426617014254',
            brand: 'Haribo',
            productName: 'HARIBO Żelki owocowe arbuz',
            variant: 'Sandía',
            pack: '90 g',
          },
          searchAuthority: {
            releaseId: 'GELLATTI-SA10-2026-09-10-FINAL',
            concepts: [
              { id: 'SC-ING-000184', key: 'watermelon', targetType: 'INGREDIENT_CONCEPT' },
            ],
            roleKeys: ['INCLUSION'],
          },
          classification: {
            family: 'confectionery',
            form: 'SOLID',
            role: 'TOPPING_ONLY',
            archetype: 'CONFECTIONERY',
            flavorDomain: 'FRUIT',
            compatibleMapperCategories: ['confectionery_inclusion'],
          },
          behavior: {
            familyId: 'inclusion',
            subfamilyId: null,
            formId: 'solid',
            behaviorRole: 'TOPPING_ONLY',
            behaviorFingerprint: 'product-behavior-v1-haribo',
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
        publicData: {
          productAccuracy: 93,
          technicalComposition: { sugars: 53, protein: 5.8 },
          productIntelligence: {
            engineUsable: false,
            productAccuracyAssessment: { roleReadiness: 'TOPPING_READY' },
          },
        },
      }),
    ];
    mocks.usePicker.mockReturnValue({
      hits,
      favorites: new Set<string>(),
      recent: new Set<string>(),
      preferences: {
        primaryMarket: null,
        additionalMarkets: [],
        preferredRetailers: [],
        defaultScope: 'global',
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

  it('PRING-CATALOG-01 renders module truth and exact Haribo pack/variant identity', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <GlobalCatalogSearchPanel />
        </MemoryRouter>,
      );
    });

    const statuses = [...host.querySelectorAll('[data-catalog-verification-status]')].map(
      (element) => element.getAttribute('data-catalog-verification-status'),
    );
    expect(statuses).toEqual(
      expect.arrayContaining([
        'GELLATTI — SPRAWDZONY',
        'Dane szacowane',
        'WYMAGA SPRAWDZENIA ETYKIETY',
        'DODANY PRZEZ UŻYTKOWNIKA',
      ]),
    );
    expect(
      host.querySelector('[data-catalog-verification-status="DANE PRODUKTU NIEPEŁNE"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-catalog-verification-status="WYMAGA SPRAWDZENIA ETYKIETY"]')
        ?.className,
    ).toContain('bg-amber-100');
    expect(statuses.filter((status) => status === 'GELLATTI — SPRAWDZONY')).toHaveLength(3);
    expect(host.querySelectorAll('button[aria-label*="do Ulubionych"]')).toHaveLength(7);
    expect(host.textContent).toContain('HARIBO Żelki owocowe arbuz');
    const haribo = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('HARIBO Żelki owocowe arbuz'),
    );
    await act(async () => haribo?.click());
    expect(host.textContent).toContain('Opakowanie');
    expect(host.textContent).toContain('90 g');
    expect(host.textContent).toContain('Wariant');
    expect(host.textContent).toContain('Sandía');
    expect(host.textContent).not.toContain('PR-ING-007144 · ID');
  });
});
