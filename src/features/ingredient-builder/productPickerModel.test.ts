import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { productPickerVerificationView } from './productPickerModel';
import { catalogGroupFor } from '@/features/global-catalog/ranking';

const hit = (
  overrides: Partial<CatalogProductSearchHit>,
): CatalogProductSearchHit => ({
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
    const result = productPickerVerificationView(hit({
      id: 'mapper-product-watermelon',
      entityKind: 'pi_base',
      status: 'pi_base',
      verificationMethod: 'mapper_estimated',
      displayName: 'WATERMELON · Fresh Fruit',
      productForm: 'fresh',
      mappedIngredientId: 'PI-ING-000405',
      usableInBase: true,
      blockedReason: null,
    }));
    expect(result.status).toBe('Dane szacowane');
    expect(result.reason).toContain('techniczne dane Mappera');
    expect(result.reason).not.toContain('blok');
  });

  it('keeps Needs Label Review informational when Base is technically selectable', () => {
    expect(productPickerVerificationView(hit({
      entityKind: 'pi_base',
      status: 'pi_base',
      verificationMethod: 'mapper_needs_label_review',
      mappedIngredientId: 'PI-ING-000405',
      usableInBase: true,
    }))).toMatchObject({
      status: 'WYMAGA SPRAWDZENIA ETYKIETY',
    });
  });

  it('shows verified alcohol and beverage Mapper rows independently', () => {
    for (const [id, form] of [
      ['PI-ING-001764', 'alcoholic_beverage'],
      ['PI-ING-001787', 'liquid'],
      ['PI-ING-001788', 'liquid'],
    ] as const) {
      expect(productPickerVerificationView(hit({
        id: `mapper-product-${id}`,
        entityKind: 'pi_base',
        status: 'pi_base',
        verificationMethod: 'mapper_verified',
        productForm: form,
        mappedIngredientId: id,
      }))).toEqual({ status: 'PINGÜINO — SPRAWDZONY', reason: null });
    }
  });

  it('distinguishes a missing catalog binding from incomplete product data', () => {
    const missingBinding = productPickerVerificationView(hit({
      mappedIngredientId: null,
      usableInBase: false,
      blockedReason: 'Brak aktualnego mapowania PINGÜINO Base',
    }));
    expect(missingBinding.status).toBe('MAPPER BINDING REQUIRED');
    expect(missingBinding.reason).toContain('ID catalog-product');
    expect(missingBinding.reason).toContain('wersja product-version');
    expect(missingBinding.reason).toContain('pole mappedIngredientId');
    expect(missingBinding.reason).toContain('Wybierz dokładne powiązanie Mapper');

    const incomplete = productPickerVerificationView(hit({
      status: 'blocked',
      mappedIngredientId: null,
      usableInBase: false,
      missingFields: ['allergens_text'],
    }), 'POST_PROCESS_ADDON');
    expect(incomplete.status).toBe('PRODUCT DATA INCOMPLETE');
    expect(incomplete.reason).toContain('alergenów');
  });

  it('keeps verified and manual catalog states separate per row', () => {
    expect(productPickerVerificationView(hit({})).status).toBe('PINGÜINO — SPRAWDZONY');
    expect(productPickerVerificationView(hit({
      status: 'manual_unverified',
      verificationMethod: 'manual_unverified',
    })).status).toBe('DODANY PRZEZ UŻYTKOWNIKA');
    expect(productPickerVerificationView(hit({
      status: 'manual_unverified',
      provenance: 'automatic_verified',
      verificationMethod: 'automatic',
    }))).toEqual({ status: 'SYSTEM — DOPASOWANY', reason: null });
  });

  it('does not let a Topping-only label defect hide a valid Base binding', () => {
    const densityNeeded = hit({
      invalidFields: ['nutrition_basis_per_100ml_requires_density_for_gram_topping'],
      usableInBase: true,
      usableAsTopping: false,
    });
    expect(productPickerVerificationView(densityNeeded, 'BASE_FORMULATION').status)
      .toBe('PINGÜINO — SPRAWDZONY');
    expect(productPickerVerificationView(densityNeeded, 'POST_PROCESS_ADDON').status)
      .toBe('PRODUCT DATA INCOMPLETE');
  });

  it('keeps legal gaps informational for an exact mapped, technically usable Topping', () => {
    const result = productPickerVerificationView(hit({
      status: 'blocked',
      verificationMethod: 'manual_unverified',
      mappedIngredientId: 'PI-ING-000405',
      usableAsTopping: true,
      missingFields: ['allergens_text'],
      blockedReason: 'Etykieta wymaga uzupełnienia',
    }), 'POST_PROCESS_ADDON');
    expect(result.status).toBe('WYMAGA SPRAWDZENIA ETYKIETY');
    expect(result.reason).toContain('nie blokuje technicznego Toppingu');
    expect(result.reason).toContain('Label może pozostać zablokowany');
  });

  it('does not group an exact mapped usable commercial row as blocked solely by catalog status', () => {
    expect(catalogGroupFor(hit({
      status: 'blocked',
      mappedIngredientId: 'PI-ING-000405',
      usableInBase: true,
    }), {
      primaryMarket: null,
      additionalMarkets: [],
      preferredRetailers: [],
      defaultScope: 'global',
    })).not.toBe('blocked');
  });
});
