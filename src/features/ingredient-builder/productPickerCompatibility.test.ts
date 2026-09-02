import { describe, expect, it } from 'vitest';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { contextualPickerMatch, getProductPickerCompatibility } from './productPickerCompatibility';

const hit = (overrides: Partial<CatalogProductSearchHit> = {}): CatalogProductSearchHit => ({
  id: 'product-uuid',
  productCode: 'PR-ING-007144',
  currentVersionId: 'version-uuid',
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
  aliases: ['Quaxi', 'Haribo frogs'],
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

describe('getProductPickerCompatibility', () => {
  it('routes a TOPPING_ONLY capability mismatch from ingredients to toppings', () => {
    expect(getProductPickerCompatibility(hit(), 'BASE_FORMULATION')).toEqual({
      state: 'AVAILABLE_IN_OTHER_CONTEXT',
      availableAs: 'TOPPING',
      redirectScope: 'POST_PROCESS_ADDON',
      requestedCapability: 'INGREDIENT',
      attemptedContext: 'INGREDIENT_PICKER',
    });
  });

  it('routes an INGREDIENT_ONLY capability mismatch from toppings to ingredients', () => {
    expect(
      getProductPickerCompatibility(
        hit({ usableInBase: true, usableAsTopping: false }),
        'POST_PROCESS_ADDON',
      ),
    ).toEqual({
      state: 'AVAILABLE_IN_OTHER_CONTEXT',
      availableAs: 'INGREDIENT',
      redirectScope: 'BASE_FORMULATION',
      requestedCapability: 'TOPPING',
      attemptedContext: 'TOPPING_PICKER',
    });
  });

  it('allows BOTH in both pickers without a contextual warning', () => {
    const both = hit({ usableInBase: true, usableAsTopping: true });
    expect(getProductPickerCompatibility(both, 'BASE_FORMULATION')).toEqual({ state: 'ALLOWED' });
    expect(getProductPickerCompatibility(both, 'POST_PROCESS_ADDON')).toEqual({
      state: 'ALLOWED',
    });
  });

  it('keeps a product with neither capability in the truthful blocked state', () => {
    const neither = hit({ usableInBase: false, usableAsTopping: false });
    expect(getProductPickerCompatibility(neither, 'BASE_FORMULATION')).toEqual({
      state: 'BLOCKED',
    });
    expect(getProductPickerCompatibility(neither, 'POST_PROCESS_ADDON')).toEqual({
      state: 'BLOCKED',
    });
  });
});

describe('contextualPickerMatch', () => {
  it('does not put wrong-context products into normal browse', () => {
    expect(contextualPickerMatch(hit(), '')).toBe(false);
    expect(contextualPickerMatch(hit(), '  ')).toBe(false);
  });

  it('finds an explicit canonical name, brand, article id, EAN, or distinctive alias', () => {
    for (const query of ['HARIBO Quaxi', 'HARIBO', 'PR-ING-007144', '4001686322536', 'Quaxi']) {
      expect(contextualPickerMatch(hit(), query), query).toBe(true);
    }
  });

  it('does not treat a broad unrelated fragment as an exact contextual search', () => {
    expect(contextualPickerMatch(hit(), 'produkt')).toBe(false);
    expect(contextualPickerMatch(hit(), 'ha')).toBe(false);
    expect(contextualPickerMatch(hit(), 'czekolada')).toBe(false);
  });
});
