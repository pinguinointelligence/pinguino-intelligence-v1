import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductBehaviorSnapshot } from './contracts';
import { mainEnvelopeSearchCeilingGrams, verifyMainEnvelope } from './mainEnvelope';
import {
  bindProductBehaviorToPreview,
  buildBatchRescalePreview,
  commitPreview,
} from '@/features/constraint-studio/applyPipeline';

const ingredient = (id: string) => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`missing fixture ${id}`);
  return found;
};

const snapshot = (
  lineId: string,
  overrides: Partial<ProductBehaviorSnapshot> = {},
): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  lineId,
  productId: `product-${lineId}`,
  productVersionId: `version-${lineId}`,
  source: 'mapper',
  factsFingerprint: `facts-${lineId}`,
  behaviorBindingId: `binding-${lineId}`,
  behaviorBindingVersion: '1',
  taxonomyVersion: 'taxonomy-v1',
  familyId: 'fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId: lineId === 'berry' ? 'raspberry' : lineId,
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  mainPolicyId: 'berry-dairy-v1',
  mainPolicyVersion: '1',
  ecoFloorPercent: 25,
  optimalCeilingPercent: 35,
  hardLimitPercent: 45,
  mainEquivalentFactor: 1,
  mainBasis: 'FRUIT_EQUIVALENT',
  requiresLiquidDairyCarrier: true,
  liquidDairyCarrierFloorPercent: 30,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: { MAIN: 'eligible', BASE_RECIPE: 'eligible' },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'resolver-v1',
  warnings: [],
  blockReasons: [],
  ...overrides,
});

const recipe = (mainGrams: number, carrierGrams: number): RecipeInput => ({
  mode: 'classic',
  category: 'fruit_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    { id: 'berry', ingredient: ingredient('raspberry'), planned_grams: mainGrams, actual_grams: null, lock_type: 'main' },
    { id: 'milk', ingredient: ingredient('milk_3_5'), planned_grams: carrierGrams, actual_grams: null, lock_type: 'unlocked' },
    { id: 'sugar', ingredient: ingredient('sucrose'), planned_grams: 1000 - mainGrams - carrierGrams, actual_grams: null, lock_type: 'unlocked' },
  ],
});

const snapshots = (extra: Record<string, ProductBehaviorSnapshot> = {}) => ({
  berry: snapshot('berry'),
  milk: snapshot('milk', {
    mapperIngredientId: 'PI-ING-000236',
    familyId: null,
    subfamilyId: null,
    formId: null,
    mainClassification: 'STANDARD_ONLY',
    mainPolicyId: null,
    mainPolicyVersion: null,
    ecoFloorPercent: null,
    optimalCeilingPercent: null,
    hardLimitPercent: null,
    mainEquivalentFactor: null,
    mainBasis: null,
    requiresLiquidDairyCarrier: false,
    liquidDairyCarrierFloorPercent: null,
    approvedLiquidDairyCarrier: true,
    moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'blocked' },
  }),
  ...extra,
});

describe('versioned Main envelope', () => {
  it('blocks Preview when a substitute keeps the previous product snapshot', () => {
    const input = recipe(300, 400);
    input.items[0] = {
      ...input.items[0]!,
      ingredient: { ...ingredient('pistachio_paste'), identity_provenance: 'mapper' },
    };
    expect(bindProductBehaviorToPreview(
      buildBatchRescalePreview(input, { byLineId: {} }, 1100, '2026-08-12T00:00:00Z'),
      snapshots(),
    )).toMatchObject({
      ok: false,
      code: 'product_behavior_invalid',
      violations: [{ code: 'product_behavior_identity_mismatch', lineIds: ['berry'] }],
    });
  });

  it('never grandfathers a Mapper/private/catalog Main line without a behavior snapshot', () => {
    const input = recipe(350, 400);
    input.items[0] = {
      ...input.items[0]!,
      ingredient: {
        ...input.items[0]!.ingredient,
        private_product_id: 'legacy-private-product',
        identity_provenance: 'private_product',
      },
    };
    expect(verifyMainEnvelope({ recipe: input, snapshots: {}, mode: 'optimal' }))
      .toMatchObject({
        ok: false,
        violations: [{ code: 'main_behavior_missing', lineIds: ['berry'] }],
      });
  });

  it('also blocks a legacy Mapper Main without a private product id', () => {
    const input = recipe(350, 400);
    input.items[0] = {
      ...input.items[0]!,
      ingredient: {
        ...input.items[0]!.ingredient,
        private_product_id: undefined,
        identity_provenance: 'mapper',
      },
    };
    expect(verifyMainEnvelope({ recipe: input, snapshots: {}, mode: 'optimal' }))
      .toMatchObject({
        ok: false,
        violations: [{ code: 'main_behavior_missing', lineIds: ['berry'] }],
      });
  });

  it('blocks Preview when any applicable Mapper line lacks a snapshot', () => {
    const input = recipe(300, 400);
    input.items[1] = {
      ...input.items[1]!,
      ingredient: { ...input.items[1]!.ingredient, identity_provenance: 'mapper' },
    };
    expect(bindProductBehaviorToPreview(
      buildBatchRescalePreview(input, { byLineId: {} }, 1100, '2026-08-12T00:00:00Z'),
      { berry: snapshots().berry },
    )).toMatchObject({
      ok: false,
      code: 'product_behavior_invalid',
      violations: [{ code: 'product_behavior_missing', lineIds: ['milk'] }],
    });
  });
  it('applies the ordinary dairy carrier boundary at 299/300/301 g per kg', () => {
    expect(verifyMainEnvelope({ recipe: recipe(300, 299), snapshots: snapshots(), mode: 'optimal' })).toMatchObject({
      ok: false,
      violations: expect.arrayContaining([expect.objectContaining({ code: 'liquid_dairy_carrier_below_floor' })]),
    });
    expect(verifyMainEnvelope({ recipe: recipe(300, 300), snapshots: snapshots(), mode: 'optimal' }).ok).toBe(true);
    expect(verifyMainEnvelope({ recipe: recipe(300, 301), snapshots: snapshots(), mode: 'optimal' }).ok).toBe(true);
  });

  it('blocks below floor, above OPTIMAL ceiling and above the hard limit', () => {
    expect(verifyMainEnvelope({ recipe: recipe(249, 400), snapshots: snapshots(), mode: 'eco' })).toMatchObject({ ok: false, violations: [expect.objectContaining({ code: 'main_below_floor' })] });
    expect(verifyMainEnvelope({ recipe: recipe(351, 400), snapshots: snapshots(), mode: 'optimal' })).toMatchObject({ ok: false, violations: expect.arrayContaining([expect.objectContaining({ code: 'main_above_optimal_ceiling' })]) });
    expect(verifyMainEnvelope({ recipe: recipe(451, 400), snapshots: snapshots(), mode: 'eco' })).toMatchObject({ ok: false, violations: expect.arrayContaining([expect.objectContaining({ code: 'main_above_hard_limit' })]) });
  });

  it('caps the OPTIMAL search at the policy ceiling rather than the Engine frontier', () => {
    expect(mainEnvelopeSearchCeilingGrams({ recipe: recipe(250, 400), snapshots: snapshots() })).toBe(350);
  });

  it('uses concentration-equivalent mass and refuses an unapproved mixed family', () => {
    const compoundRecipe = recipe(500, 300);
    expect(verifyMainEnvelope({
      recipe: compoundRecipe,
      snapshots: snapshots({ berry: snapshot('berry', { mainEquivalentFactor: 0.3 }) }),
      mode: 'optimal',
    })).toMatchObject({ ok: false, violations: [expect.objectContaining({ code: 'main_below_floor' })] });

    const mixed: RecipeInput = {
      ...recipe(200, 400),
      items: [
        ...recipe(200, 400).items,
        { id: 'nut', ingredient: ingredient('pistachio_paste'), planned_grams: 100, actual_grams: null, lock_type: 'main' },
      ],
    };
    expect(verifyMainEnvelope({
      recipe: mixed,
      snapshots: snapshots({
        nut: snapshot('nut', {
          mapperIngredientId: 'pistachio_paste',
          familyId: 'nut',
          subfamilyId: null,
        }),
      }),
      mode: 'optimal',
    })).toMatchObject({ ok: false, violations: [expect.objectContaining({ code: 'multi_main_policy_unknown' })] });
  });

  it('does not apply the ordinary dairy carrier gate to a profile policy that does not require it', () => {
    const proteinSnapshot = snapshot('berry', {
      requiresLiquidDairyCarrier: false,
      liquidDairyCarrierFloorPercent: null,
    });
    expect(verifyMainEnvelope({
      recipe: { ...recipe(300, 0), category: 'protein_gelato' },
      snapshots: { berry: proteinSnapshot },
      mode: 'optimal',
    }).ok).toBe(true);
  });

  it('invalidates Preview when the product behavior binding changes before Apply', () => {
    const input = recipe(300, 400);
    const authority = snapshots();
    const built = bindProductBehaviorToPreview(
      buildBatchRescalePreview(input, { byLineId: {} }, 1100, '2026-08-12T00:00:00Z'),
      authority,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const changedAuthority = {
      ...authority,
      berry: { ...authority.berry, behaviorBindingVersion: '2' },
    };
    expect(commitPreview(
      input,
      { byLineId: {} },
      built.preview,
      '2026-08-12T00:01:00Z',
      'apply-stale-product-policy',
      [],
      undefined,
      null,
      null,
      null,
      null,
      changedAuthority,
    )).toMatchObject({ ok: false, code: 'stale_preview' });
  });
});
