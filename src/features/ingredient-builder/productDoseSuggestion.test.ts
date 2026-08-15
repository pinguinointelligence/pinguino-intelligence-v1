import { describe, expect, it } from 'vitest';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  EMPTY_PRODUCT_DOSE_META,
  allocateAutomaticDoseGroup,
  missingProductDoseMessage,
  verifiedProductDoseSuggestion,
  type DoseGroupMember,
  type ProductDoseMeta,
} from './productDoseSuggestion';

const snapshot = (
  overrides: Partial<ProductBehaviorSnapshot> = {},
): ProductBehaviorSnapshot => ({
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

const auto = (groupId: string, suggestedTotalGrams = 300): ProductDoseMeta => ({
  provenance: 'AUTO_SUGGESTED',
  groupId,
  suggestedPercent: 30,
  suggestedTotalGrams,
});

const member = (
  lineId: string,
  plannedGrams: number,
  dose: ProductDoseMeta,
  lockType: DoseGroupMember['lockType'] = 'unlocked',
): DoseGroupMember => ({ lineId, plannedGrams, dose, lockType, actualGrams: null });

describe('verified picker-time product dose', () => {
  it('uses the product-specific lower ECO and upper OPTIMAL dose and scales from Base mass', () => {
    expect(
      verifiedProductDoseSuggestion({ snapshot: snapshot(), strategy: 'eco', targetBaseGrams: 1_000 }),
    ).toMatchObject({ suggestedPercent: 20, suggestedTotalGrams: 200 });
    expect(
      verifiedProductDoseSuggestion({
        snapshot: snapshot(),
        strategy: 'optimal',
        targetBaseGrams: 5_000,
      }),
    ).toMatchObject({ suggestedPercent: 30, suggestedTotalGrams: 1_500 });
  });

  it('does not reinterpret a Main equivalent factor as a product dose', () => {
    const halfStrength =
      verifiedProductDoseSuggestion({
        snapshot: snapshot({ mainEquivalentFactor: 0.5 }),
        strategy: 'eco',
        targetBaseGrams: 1_000,
      });
    expect(halfStrength).toMatchObject({ suggestedPercent: 20, suggestedTotalGrams: 200 });
    expect(halfStrength?.groupId).toBe(
      verifiedProductDoseSuggestion({
        snapshot: snapshot({ mainEquivalentFactor: 1 }),
        strategy: 'eco',
        targetBaseGrams: 1_000,
      })?.groupId,
    );
  });

  it('returns unknown for missing product dosage, ineligible or non-Base authority instead of guessing', () => {
    for (const candidate of [
      undefined,
      snapshot({ sharedFacts: null }),
      snapshot({
        sharedFacts: {
          ...snapshot().sharedFacts!,
          recommendedDose: { minPercent: null, maxPercent: null, sourceVersion: 'mapper-v1' },
        },
      }),
      snapshot({ moduleEligibility: { BASE_RECIPE: 'blocked' } }),
      snapshot({ processScope: 'POST_PROCESS_ADDON' }),
    ]) {
      expect(
        verifiedProductDoseSuggestion({
          snapshot: candidate,
          strategy: 'optimal',
          targetBaseGrams: 1_000,
        }),
      ).toBeNull();
    }
  });

  it('does not describe a sub-gram rounded zero as an automatic approved dose', () => {
    expect(
      verifiedProductDoseSuggestion({
        snapshot: snapshot({
          sharedFacts: {
            ...snapshot().sharedFacts!,
            recommendedDose: { minPercent: 1, maxPercent: 1, sourceVersion: 'mapper-v1' },
          },
        }),
        strategy: 'eco',
        targetBaseGrams: 10,
      }),
    ).toBeNull();
  });

  it('keeps dosage-unknown Fresh Watermelon at 0 g even when Main policy is covered', () => {
    expect(verifiedProductDoseSuggestion({
      snapshot: snapshot({
        mapperIngredientId: 'PI-ING-000405',
        mainClassification: 'MAIN_PROFILE_SPECIFIC',
        mainPolicyId: 'fresh-fruit-main-policy',
        mainPolicyVersion: '1',
        sharedFacts: { ...snapshot().sharedFacts!, recommendedDose: null },
      }),
      strategy: 'optimal',
      targetBaseGrams: 1_000,
    })).toBeNull();
  });
});

describe('same approved dose-group allocation', () => {
  const group = 'fresh-fruit-dose:3:FRUIT_EQUIVALENT:1';

  it.each([
    [1, [300]],
    [2, [150, 150]],
    [4, [75, 75, 75, 75]],
  ])('keeps one %i-product group at exactly 300 g', (count, expected) => {
    const members = Array.from({ length: count }, (_, index) =>
      member(`fruit-${index + 1}`, 0, auto(group)),
    );
    const allocated = allocateAutomaticDoseGroup({
      groupId: group,
      suggestedTotalGrams: 300,
      members,
    });
    expect(Object.values(allocated)).toEqual(expected);
    expect(Object.values(allocated).reduce((sum, grams) => sum + grams, 0)).toBe(300);
  });

  it('keeps a USER_SET line byte-stable and gives only the residual to automatic members', () => {
    const manual: ProductDoseMeta = { ...auto(group), provenance: 'USER_SET' };
    const members = [member('strawberry', 220, manual), member('banana', 0, auto(group))];
    expect(
      allocateAutomaticDoseGroup({ groupId: group, suggestedTotalGrams: 300, members }),
    ).toEqual({ banana: 80 });
    expect(members[0]!.plannedGrams).toBe(220);
  });

  it('does not overwrite a locked line and divides an odd residual within 1 g', () => {
    const members = [
      member('locked', 101, auto(group), 'grams'),
      member('auto-a', 0, auto(group)),
      member('auto-b', 0, auto(group)),
    ];
    const allocated = allocateAutomaticDoseGroup({
      groupId: group,
      suggestedTotalGrams: 300,
      members,
    });
    expect(allocated).toEqual({ 'auto-a': 100, 'auto-b': 99 });
    expect(allocated).not.toHaveProperty('locked');
  });

  it('does not group UNKNOWN/NONE provenance', () => {
    expect(
      allocateAutomaticDoseGroup({
        groupId: group,
        suggestedTotalGrams: 300,
        members: [member('unknown', 0, { ...EMPTY_PRODUCT_DOSE_META, provenance: 'UNKNOWN' })],
      }),
    ).toEqual({});
  });
});

it('uses the exact zero-dose PI instruction', () => {
  expect(missingProductDoseMessage(['Produkt A', 'Produkt B'])).toBe(
    'Podaj gramaturę dla:\nProdukt A, Produkt B.\n\nMinimalna ilość to 1 g.',
  );
});
