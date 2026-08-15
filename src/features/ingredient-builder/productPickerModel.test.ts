import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { productPickerVerificationView } from './productPickerModel';

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
  it('keeps Estimated Fresh Watermelon explicit and fail-closed', () => {
    const result = productPickerVerificationView(hit({
      id: 'mapper-product-watermelon',
      entityKind: 'pi_base',
      status: 'pi_base',
      verificationMethod: 'pi_base',
      displayName: 'WATERMELON · Fresh Fruit',
      productForm: 'fresh',
      mappedIngredientId: 'PI-ING-000405',
      usableInBase: false,
      blockedReason: 'Wymaga weryfikacji Mapper',
    }));
    expect(result.status).toBe('PRODUCT DATA INCOMPLETE');
    expect(result.reason).toContain('PI-ING-000405');
    expect(result.reason).toContain('nie ma zatwierdzenia Verified');
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
        verificationMethod: 'pi_base',
        productForm: form,
        mappedIngredientId: id,
      }))).toEqual({ status: 'PINGÜINO VERIFIED', reason: null });
    }
  });

  it('distinguishes a missing catalog binding from incomplete product data', () => {
    const missingBinding = productPickerVerificationView(hit({
      mappedIngredientId: null,
      usableInBase: false,
      blockedReason: 'Brak aktualnego mapowania PINGÜINO Base',
    }));
    expect(missingBinding.status).toBe('MAPPER BINDING REQUIRED');
    expect(missingBinding.reason).toContain('Mapper reference');

    const incomplete = productPickerVerificationView(hit({
      status: 'blocked',
      mappedIngredientId: null,
      usableInBase: false,
      missingFields: ['allergens_text'],
    }));
    expect(incomplete.status).toBe('PRODUCT DATA INCOMPLETE');
    expect(incomplete.reason).toContain('alergenów');
  });

  it('keeps verified and manual catalog states separate per row', () => {
    expect(productPickerVerificationView(hit({})).status).toBe('VERIFIED CATALOG');
    expect(productPickerVerificationView(hit({
      status: 'manual_unverified',
      verificationMethod: 'manual_unverified',
    })).status).toBe('MANUAL / UNVERIFIED');
  });

  it('does not let a Topping-only label defect hide a valid Base binding', () => {
    const densityNeeded = hit({
      invalidFields: ['nutrition_basis_per_100ml_requires_density_for_gram_topping'],
      usableInBase: true,
      usableAsTopping: false,
    });
    expect(productPickerVerificationView(densityNeeded, 'BASE_FORMULATION').status)
      .toBe('VERIFIED CATALOG');
    expect(productPickerVerificationView(densityNeeded, 'POST_PROCESS_ADDON').status)
      .toBe('PRODUCT DATA INCOMPLETE');
  });
});
