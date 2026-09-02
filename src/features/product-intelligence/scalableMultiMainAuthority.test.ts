import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductBehaviorSnapshot } from './contracts';
import { mainEnvelopeSearchCeilingGrams, verifyMainEnvelope } from './mainEnvelope';

const ingredient = (id: string) => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`missing fixture ${id}`);
  return found;
};

const calibrated = (
  lineId: string,
  overrides: Partial<ProductBehaviorSnapshot> = {},
): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: `product-${lineId}`,
  productVersionId: `version-${lineId}`,
  source: 'mapper',
  factsFingerprint: `facts-${lineId}`,
  behaviorBindingId: `binding-${lineId}`,
  behaviorBindingVersion: '1',
  taxonomyVersion: 'pinguino-product-taxonomy-v1',
  familyId: 'fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId: lineId,
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE',
  mainAuthority: 'CALIBRATED',
  mainCalibrationLevel: 'FAMILY',
  mainPolicyId: 'main-berry-fresh-dairy',
  mainPolicyVersion: '2',
  ecoFloorPercent: 25,
  optimalCeilingPercent: 35,
  hardLimitPercent: 45,
  multiMainHardLimitPercent: null,
  mainEquivalentFactor: 1,
  mainBasis: 'FRUIT_EQUIVALENT',
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: {
    MAIN: 'eligible',
    BASE_RECIPE: 'eligible',
    OPTIMAL: 'eligible',
    ECO: 'eligible',
  },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'unified-product-behavior-v2',
  sharedFacts: null,
  warnings: [],
  blockReasons: [],
  ...overrides,
});

const BANANA = (lineId = 'banana') =>
  calibrated(lineId, {
    mapperIngredientId: 'PI-ING-000345',
    subfamilyId: 'banana',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainPolicyId: 'main-banana-fresh-dairy',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 20,
    hardLimitPercent: 30,
  });

const BERRY = (lineId: string, mapperIngredientId: string) =>
  calibrated(lineId, {
    mapperIngredientId,
    subfamilyId: 'berry',
  });

const mainRecipe = (
  mains: ReadonlyArray<{ id: string; grams: number; ratioWeight: number }>,
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'optimal' },
  items: [
    ...mains.map((main) => ({
      id: main.id,
      ingredient: ingredient('raspberry'),
      planned_grams: main.grams,
      actual_grams: null,
      lock_type: 'main' as const,
      main_ratio_weight: main.ratioWeight,
    })),
    {
      id: 'support',
      ingredient: ingredient('milk_3_5'),
      planned_grams: 1_000 - mains.reduce((sum, main) => sum + main.grams, 0),
      actual_grams: null,
      lock_type: 'unlocked' as const,
    },
  ],
});

describe('scalable Multi-Main authority derived from individual envelopes', () => {
  it('accepts the owner Banana + Cranberry 150:150 fixture without a pair policy', () => {
    const recipe = mainRecipe([
      { id: 'banana', grams: 150, ratioWeight: 1 },
      { id: 'cranberry', grams: 150, ratioWeight: 1 },
    ]);
    const result = verifyMainEnvelope({
      recipe,
      snapshots: {
        banana: BANANA(),
        cranberry: BERRY('cranberry', 'PI-ING-001556'),
      },
      mode: 'optimal',
    });

    expect(result).toMatchObject({
      ok: true,
      equivalentPercent: 30,
      targetPercent: 30,
      hardLimitPercent: 30,
      policyId: null,
    });
  });

  it('accepts Banana + Strawberry 1:1 from their individual authorities', () => {
    const result = verifyMainEnvelope({
      recipe: mainRecipe([
        { id: 'banana', grams: 150, ratioWeight: 1 },
        { id: 'strawberry', grams: 150, ratioWeight: 1 },
      ]),
      snapshots: {
        banana: BANANA(),
        strawberry: BERRY('strawberry', 'PI-ING-001553'),
      },
      mode: 'optimal',
    });

    expect(result.ok).toBe(true);
  });

  it('rejects the first candidate above the strictest individual hard limit', () => {
    const result = verifyMainEnvelope({
      recipe: mainRecipe([
        { id: 'banana', grams: 151, ratioWeight: 1 },
        { id: 'cranberry', grams: 150, ratioWeight: 1 },
      ]),
      snapshots: {
        banana: BANANA(),
        cranberry: BERRY('cranberry', 'PI-ING-001556'),
      },
      mode: 'optimal',
    });

    expect(result).toMatchObject({
      ok: false,
      violations: expect.arrayContaining([
        expect.objectContaining({ code: 'main_above_hard_limit' }),
      ]),
    });
  });

  it('derives the Banana + Cranberry 2:1 envelope from the exact stored ratio', () => {
    const recipe = mainRecipe([
      { id: 'banana', grams: 200, ratioWeight: 2 },
      { id: 'cranberry', grams: 100, ratioWeight: 1 },
    ]);
    const snapshots = {
      banana: BANANA(),
      cranberry: BERRY('cranberry', 'PI-ING-001556'),
    };

    expect(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' })).toMatchObject({
      ok: true,
      equivalentPercent: 30,
      targetPercent: 30,
      hardLimitPercent: 30,
    });
    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots})).toBe(300);
    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots})).toBe(300);
  });

  it('derives a three-Main envelope in O(N) from three individual policies', () => {
    const result = verifyMainEnvelope({
      recipe: mainRecipe([
        { id: 'banana', grams: 100, ratioWeight: 1 },
        { id: 'cranberry', grams: 100, ratioWeight: 1 },
        { id: 'strawberry', grams: 100, ratioWeight: 1 },
      ]),
      snapshots: {
        banana: BANANA(),
        cranberry: BERRY('cranberry', 'PI-ING-001556'),
        strawberry: BERRY('strawberry', 'PI-ING-001553'),
      },
      mode: 'optimal',
    });

    expect(result).toMatchObject({
      ok: true,
      equivalentPercent: 30,
      targetPercent: 30,
      hardLimitPercent: 30,
    });
  });

  it('does not require a pair record for two lines under the canonical pure-nut family policy', () => {
    const nut = (lineId: string, mapperIngredientId: string) =>
      calibrated(lineId, {
        mapperIngredientId,
        familyId: 'nut',
        subfamilyId: null,
        formId: 'pure_nut_paste',
        mainPolicyId: 'main-pure-nut-paste-dairy',
        ecoFloorPercent: 8,
        optimalCeilingPercent: 15,
        hardLimitPercent: 15,
        mainBasis: 'NUT_EQUIVALENT',
      });
    const result = verifyMainEnvelope({
      recipe: mainRecipe([
        { id: 'nut-a', grams: 75, ratioWeight: 1 },
        { id: 'nut-b', grams: 75, ratioWeight: 1 },
      ]),
      snapshots: {
        'nut-a': nut('nut-a', 'PI-ING-000614'),
        'nut-b': nut('nut-b', 'PI-ING-000614'),
      },
      mode: 'optimal',
    });

    expect(result).toMatchObject({
      ok: true,
      equivalentPercent: 15,
      targetPercent: 15,
      hardLimitPercent: 15,
    });
  });

  it('keeps a published shared combination cap as the stronger authority', () => {
    const group = (lineId: string, ceiling: number) =>
      calibrated(lineId, {
        mainPolicyId: 'main-protein-fruit-combination-v2',
        ecoFloorPercent: 10,
        optimalCeilingPercent: ceiling,
        hardLimitPercent: ceiling,
        multiMainHardLimitPercent: 20.7,
      });
    const recipe = mainRecipe([
      { id: 'strawberry', grams: 150, ratioWeight: 1 },
      { id: 'banana', grams: 150, ratioWeight: 1 },
    ]);
    const snapshots = {
      strawberry: group('strawberry', 49.5),
      banana: group('banana', 17.1),
    };

    // The derived multi-Main envelope collapses ceiling and hard limit onto the
    // same combined percentage, so an over-limit group now fails closed on the
    // hard limit itself rather than on the OPTIMAL preference target.
    expect(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' })).toMatchObject({
      ok: false,
      violations: expect.arrayContaining([
        expect.objectContaining({ code: 'main_above_hard_limit' }),
      ]),
    });
    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots })).toBe(207);
  });

  it('fails closed when Main bases/families are genuinely incompatible', () => {
    const result = verifyMainEnvelope({
      recipe: mainRecipe([
        { id: 'banana', grams: 100, ratioWeight: 1 },
        { id: 'pistachio', grams: 100, ratioWeight: 1 },
      ]),
      snapshots: {
        banana: BANANA(),
        pistachio: calibrated('pistachio', {
          mapperIngredientId: 'PI-ING-000614',
          familyId: 'nut',
          subfamilyId: null,
          formId: 'pure_nut_paste',
          mainPolicyId: 'main-pistachio-pure-paste-dairy-0614',
          ecoFloorPercent: 8,
          optimalCeilingPercent: 15,
          hardLimitPercent: 15,
          mainBasis: 'NUT_EQUIVALENT',
        }),
      },
      mode: 'optimal',
    });

    expect(result).toMatchObject({
      ok: false,
      violations: [expect.objectContaining({ code: 'multi_main_policy_unknown' })],
    });
  });

  it('fails closed when one purported Main is genuinely unknown', () => {
    const result = verifyMainEnvelope({
      recipe: mainRecipe([
        { id: 'banana', grams: 150, ratioWeight: 1 },
        { id: 'unknown', grams: 150, ratioWeight: 1 },
      ]),
      snapshots: {
        banana: BANANA(),
        unknown: calibrated('unknown', {
          mainCapability: 'MAIN_UNKNOWN',
          mainAuthority: undefined,
          mainCalibrationLevel: 'NONE',
        }),
      },
      mode: 'optimal',
    });

    expect(result).toMatchObject({
      ok: false,
      violations: [expect.objectContaining({ code: 'main_behavior_blocked' })],
    });
  });

  it('feeds the derived 1:1 ceiling into search without manufacturing a policy id', () => {
    const recipe = mainRecipe([
      { id: 'banana', grams: 150, ratioWeight: 1 },
      { id: 'cranberry', grams: 150, ratioWeight: 1 },
    ]);
    const snapshots = {
      banana: BANANA(),
      cranberry: BERRY('cranberry', 'PI-ING-001556'),
    };

    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots})).toBe(300);
    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots})).toBe(300);
  });

  it('uses the stored ratio and equivalence factors to convert the group cap to raw grams', () => {
    const recipe = mainRecipe([
      { id: 'banana', grams: 240, ratioWeight: 2 },
      { id: 'concentrated-berry', grams: 120, ratioWeight: 1 },
    ]);
    const snapshots = {
      banana: BANANA(),
      'concentrated-berry': BERRY('concentrated-berry', 'PI-ING-001556'),
    };
    snapshots['concentrated-berry'] = {
      ...snapshots['concentrated-berry'],
      mainEquivalentFactor: 0.5,
    };

    expect(mainEnvelopeSearchCeilingGrams({ recipe, snapshots})).toBe(360);
    expect(verifyMainEnvelope({ recipe, snapshots, mode: 'optimal' })).toMatchObject({
      ok: true,
      equivalentPercent: 30,
      targetPercent: 30,
      hardLimitPercent: 30,
    });
  });
});
