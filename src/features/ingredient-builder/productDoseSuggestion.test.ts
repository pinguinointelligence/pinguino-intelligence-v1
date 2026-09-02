/**
 * NO AUTOMATIC DOSING (owner decision, 2026-08-23). A manufacturer's
 * recommended dosage is information; it is never turned into an amount on the
 * user's behalf. A selected product starts UNKNOWN at 0 g and the professional
 * enters the grams they intend to use.
 */
import { describe, expect, it } from 'vitest';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  EMPTY_PRODUCT_DOSE_META,
  missingProductDoseMessage,
  type ProductDoseMeta,
} from './productDoseSuggestion';
import * as productDoseSuggestion from './productDoseSuggestion';

const snapshot = (overrides: Partial<ProductBehaviorSnapshot> = {}): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId: '',
  productId: 'product-strawberry',
  productVersionId: 'product-strawberry-v1',
  source: 'mapper',
  factsFingerprint: 'facts-v1',
  behaviorBindingId: 'binding-v1',
  behaviorBindingVersion: '1',
  taxonomyVersion: 'taxonomy-v1',
  familyId: 'fresh_fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId: 'PI-ING-001553',
  mainClassification: 'MAIN_ALLOWED',
  mainPolicyId: 'fresh-fruit-dose',
  mainPolicyVersion: '3',
  ecoFloorPercent: 20,
  optimalCeilingPercent: 30,
  hardLimitPercent: 40,
  multiMainHardLimitPercent: 40,
  mainEquivalentFactor: 1,
  mainBasis: 'FRUIT_EQUIVALENT',
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'eligible' },
  processScope: 'BASE_FORMULATION',
  resolutionContext: {
    accountId: 'owner',
    productProfile: 'milk_gelato',
    temperatureC: -12,
    mode: 'optimal',
    processScope: 'BASE_FORMULATION',
    requestedRole: 'STANDARD',
    module: 'BASE_RECIPE',
  },
  resolverVersion: 'resolver-v1',
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: null,
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: [],
    veganEligibility: 'unknown',
    proteinBehavior: 'neutral',
    referencePrice: null,
    recommendedDose: { minPercent: 20, maxPercent: 30, sourceVersion: 'mapper-v1' },
  },
  warnings: [],
  blockReasons: [],
  ...overrides,
});

describe('no automatic dosing from manufacturer metadata', () => {
  it('has removed the automatic dose suggestion and group allocation entirely', () => {
    // Removed, not disabled: there is no threshold left to relax.
    expect(
      (productDoseSuggestion as Record<string, unknown>).verifiedProductDoseSuggestion,
    ).toBeUndefined();
    expect(
      (productDoseSuggestion as Record<string, unknown>).allocateAutomaticDoseGroup,
    ).toBeUndefined();
  });

  it('starts a newly selected product as UNKNOWN with no suggested amount', () => {
    const meta: ProductDoseMeta = {
      provenance: 'UNKNOWN',
      groupId: null,
      suggestedPercent: null,
      suggestedTotalGrams: null,
    };
    expect(meta.suggestedTotalGrams).toBeNull();
    expect(meta.suggestedPercent).toBeNull();
    expect(EMPTY_PRODUCT_DOSE_META.provenance).toBe('NONE');
  });

  it('carries a rich recommended dosage without it becoming an amount', () => {
    // The snapshot below declares a 20–30 % window. Nothing in this module
    // converts it into grams for any batch size.
    const declared = snapshot().sharedFacts?.recommendedDose;
    expect(declared).toMatchObject({ minPercent: 20, maxPercent: 30 });
    expect(Object.keys(productDoseSuggestion).sort()).toEqual([
      'EMPTY_PRODUCT_DOSE_META',
      'missingProductDoseMessage',
    ]);
  });

  it('still asks the professional for grams instead of inventing them', () => {
    expect(missingProductDoseMessage(['Truskawki', 'Inulina'])).toContain('Podaj gramaturę dla');
    expect(missingProductDoseMessage(['Truskawki'])).toContain('Minimalna ilość to 1 g.');
  });
});
