import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  productCatalogOverviewVerificationView,
  productPickerVerificationView,
} from './productPickerModel';
import { catalogGroupFor } from '@/features/global-catalog/ranking';

const hit = (overrides: Partial<CatalogProductSearchHit>): CatalogProductSearchHit => ({
  id: 'catalog-product',
  currentVersionId: 'product-version',
  entityKind: 'commercial_product',
  status: 'verified',
  provenance: 'human_verified',
  displayName: 'Product',
  originalName: null,
  originalLanguage: null,
  brand: null,
  canonicalFamily: null,
  category: null,
  productForm: null,
  mappedIngredientId: 'PI-ING-000001',
  markets: [],
  retailers: [],
  eans: [],
  aliases: [],
  favorite: false,
  recentlyUsedAt: null,
  usableInBase: true,
  mainAllowed: false,
  usableAsTopping: false,
  blockedReason: null,
  relevance: 1,
  missingFields: [],
  invalidFields: [],
  verificationMethod: 'human',
  publicData: {},
  ...overrides,
});

describe('per-row catalog → Mapper verification status', () => {
  it('keeps Estimated Fresh Watermelon explicit and selectable', () => {
    const result = productPickerVerificationView(
      hit({
        id: 'mapper-product-watermelon',
        entityKind: 'pi_base',
        status: 'pi_base',
        verificationMethod: 'mapper_estimated',
        displayName: 'WATERMELON · Fresh Fruit',
        productForm: 'fresh',
        mappedIngredientId: 'PI-ING-000405',
        usableInBase: true,
        blockedReason: null,
      }),
    );
    expect(result.status).toBe('Dane szacowane');
    expect(result.reason).toContain('Dane produktu są oszacowane');
    expect(result.reason).not.toContain('blok');
  });

  it('keeps Needs Label Review informational when Base is technically selectable', () => {
    expect(
      productPickerVerificationView(
        hit({
          entityKind: 'pi_base',
          status: 'pi_base',
          verificationMethod: 'mapper_needs_label_review',
          mappedIngredientId: 'PI-ING-000405',
          usableInBase: true,
        }),
      ),
    ).toMatchObject({
      status: 'WYMAGA SPRAWDZENIA ETYKIETY',
    });
  });

  it('shows verified alcohol and beverage Mapper rows independently', () => {
    for (const [id, form] of [
      ['PI-ING-001764', 'alcoholic_beverage'],
      ['PI-ING-001787', 'liquid'],
      ['PI-ING-001788', 'liquid'],
    ] as const) {
      expect(
        productPickerVerificationView(
          hit({
            id: `mapper-product-${id}`,
            entityKind: 'pi_base',
            status: 'pi_base',
            verificationMethod: 'mapper_verified',
            productForm: form,
            mappedIngredientId: id,
          }),
        ),
      ).toEqual({ status: 'GELLATTI — SPRAWDZONY', reason: null });
    }
  });

  it('distinguishes a missing catalog binding from incomplete product data', () => {
    const missingBinding = productPickerVerificationView(
      hit({
        mappedIngredientId: null,
        usableInBase: false,
        blockedReason: 'Brak aktualnego mapowania PINGÜINO Base',
      }),
    );
    expect(missingBinding.status).toBe('WYMAGA POWIĄZANIA');
    expect(missingBinding.reason).toContain('ID catalog-product');
    expect(missingBinding.reason).toContain('wersja product-version');
    expect(missingBinding.reason).toContain('pole product-owned profile / mappedIngredientId');
    expect(missingBinding.reason).toContain('Utwórz gotowy profil produktu');

    const incomplete = productPickerVerificationView(
      hit({
        status: 'blocked',
        mappedIngredientId: null,
        usableInBase: false,
        missingFields: ['allergens_text'],
      }),
      'POST_PROCESS_ADDON',
    );
    expect(incomplete.status).toBe('DANE PRODUKTU NIEPEŁNE');
    expect(incomplete.reason).toContain('alergenów');
  });

  it('keeps verified and manual catalog states separate per row', () => {
    expect(productPickerVerificationView(hit({})).status).toBe('GELLATTI — SPRAWDZONY');
    expect(
      productPickerVerificationView(
        hit({
          status: 'manual_unverified',
          verificationMethod: 'manual_unverified',
        }),
      ).status,
    ).toBe('DODANY PRZEZ UŻYTKOWNIKA');
    expect(
      productPickerVerificationView(
        hit({
          status: 'manual_unverified',
          provenance: 'automatic_verified',
          verificationMethod: 'automatic',
        }),
      ),
    ).toEqual({ status: 'DOPASOWANY', reason: null });
  });

  it('does not let a Topping-only label defect hide a valid Base binding', () => {
    const densityNeeded = hit({
      invalidFields: ['nutrition_basis_per_100ml_requires_density_for_gram_topping'],
      usableInBase: true,
      usableAsTopping: false,
    });
    expect(productPickerVerificationView(densityNeeded, 'BASE_FORMULATION').status).toBe(
      'GELLATTI — SPRAWDZONY',
    );
    expect(productPickerVerificationView(densityNeeded, 'POST_PROCESS_ADDON').status).toBe(
      'DANE PRODUKTU NIEPEŁNE',
    );
  });

  it('keeps legal gaps informational for an exact mapped, technically usable Topping', () => {
    const result = productPickerVerificationView(
      hit({
        status: 'blocked',
        verificationMethod: 'manual_unverified',
        mappedIngredientId: 'PI-ING-000405',
        usableAsTopping: true,
        missingFields: ['allergens_text'],
        blockedReason: 'Etykieta wymaga uzupełnienia',
      }),
      'POST_PROCESS_ADDON',
    );
    expect(result.status).toBe('WYMAGA SPRAWDZENIA ETYKIETY');
    expect(result.reason).toContain('nie blokuje użycia produktu jako dodatku po procesie');
    expect(result.reason).toContain('etykieta końcowa może nadal wymagać uzupełnienia');
  });

  it('does not group an exact mapped usable commercial row as blocked solely by catalog status', () => {
    expect(
      catalogGroupFor(
        hit({
          status: 'blocked',
          mappedIngredientId: 'PI-ING-000405',
          usableInBase: true,
        }),
        {
          primaryMarket: null,
          additionalMarkets: [],
          preferredRetailers: [],
          defaultScope: 'global',
        },
      ),
    ).not.toBe('blocked');
  });

  it('shows a canonical product-owned Base profile as ready in the module-neutral Home catalogue', () => {
    const canonical = hit({
      id: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
      productCode: 'PR-ING-007142',
      displayName: 'Cacao Puro La Chocolatera',
      mappedIngredientId: null,
      usableInBase: true,
      usableAsTopping: false,
      blockedReason: 'Brak kompletnych danych Topping',
      publicData: {
        productAccuracy: 95,
        technicalComposition: { water: 4, totalSolids: 96 },
        productIntelligence: { engineUsable: true },
      },
    });

    expect(productPickerVerificationView(canonical, 'POST_PROCESS_ADDON').status).toBe(
      'DANE PRODUKTU NIEPEŁNE',
    );
    expect(productPickerVerificationView(canonical, 'BASE_FORMULATION')).toEqual({
      status: 'GELLATTI — SPRAWDZONY',
      reason: null,
    });
    expect(productCatalogOverviewVerificationView(canonical)).toEqual({
      status: 'GELLATTI — SPRAWDZONY',
      reason: null,
    });
  });

  it('keeps a canonical TOPPING_ONLY PR ready without inventing a runtime Mapper binding', () => {
    const canonicalTopping = hit({
      id: '363ff5b6-0b7b-41a9-acbb-394daa26b4d2',
      productCode: 'PR-ING-007144',
      displayName: 'HARIBO Quaxi',
      mappedIngredientId: null,
      usableInBase: false,
      usableAsTopping: true,
      blockedReason: null,
      publicData: {
        productAccuracy: 93,
        technicalComposition: {
          fat: 0.5,
          salt: 0.02,
          sugars: 53,
          protein: 5.8,
          energyKcal: 345,
          carbohydrate: 79,
        },
        productIntelligence: {
          engineUsable: false,
          productAccuracyAssessment: { roleReadiness: 'TOPPING_READY' },
        },
      },
    });

    expect(productPickerVerificationView(canonicalTopping, 'BASE_FORMULATION').status).toBe(
      'WYMAGA POWIĄZANIA',
    );
    expect(productPickerVerificationView(canonicalTopping, 'POST_PROCESS_ADDON')).toEqual({
      status: 'GELLATTI — SPRAWDZONY',
      reason: null,
    });
    expect(productCatalogOverviewVerificationView(canonicalTopping)).toEqual({
      status: 'GELLATTI — SPRAWDZONY',
      reason: null,
    });
  });
});
