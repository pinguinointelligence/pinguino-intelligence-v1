import { describe, expect, it } from 'vitest';
import type {
  ProductBehaviorBinding,
  ProductBehaviorContext,
  ProductBehaviorRegistry,
} from './contracts';
import { DEFAULT_PRODUCT_BEHAVIOR_REGISTRY } from './behaviorPolicyRegistry';
import {
  PRODUCT_BEHAVIOR_MODULES,
  productBehaviorSnapshotFingerprint,
  resolveProductBehavior,
  snapshotResolvedProductBehavior,
} from './productBehaviorResolver';
import { productBehaviorModuleGate } from './productBehaviorAccess';

const CONTEXT: ProductBehaviorContext = {
  accountId: 'account-a',
  productProfile: 'milk_gelato',
  temperatureC: -12,
  mode: 'optimal',
  processScope: 'BASE_FORMULATION',
  requestedRole: 'MAIN',
  module: 'MAIN',
};

const binding = (overrides: Partial<ProductBehaviorBinding> = {}): ProductBehaviorBinding => ({
  bindingId: 'binding-strawberry-v1',
  bindingVersion: '1',
  taxonomyVersion: DEFAULT_PRODUCT_BEHAVIOR_REGISTRY.taxonomyVersion,
  productVersionId: 'strawberry-v1',
  familyId: 'fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  mainPolicyId: 'main-berry-fresh-dairy',
  baseAllowed: true,
  toppingAllowed: true,
  substitutionAllowed: true,
  labelAllowed: true,
  costAllowed: true,
  veganEligibility: 'verified',
  proteinBehavior: 'neutral',
  processBehavior: 'both',
  approvedLiquidDairyCarrier: false,
  classifiedBy: 'server_policy',
  classifiedAt: '2026-08-12T00:00:00.000Z',
  warnings: [],
  blockReasons: [],
  ...overrides,
});

const resolve = (overrides: Partial<Parameters<typeof resolveProductBehavior>[0]> = {}) =>
  resolveProductBehavior({
    product: {
      productId: 'strawberry',
      productVersionId: 'strawberry-v1',
      source: 'ocr',
      sourceIdentity: 'ean:123',
      factsFingerprint: 'facts-1',
    },
    verification: {
      state: 'verified',
      method: 'automatic',
      provenanceLabel: 'GREEN',
      evidenceVersion: 'evidence-1',
    },
    technical: {
      kind: 'mapper_exact',
      mapperIngredientId: 'PI-ING-001553',
      technicalProfileId: null,
      technicalProfileVersion: null,
      engineReady: true,
      reasons: [],
    },
    binding: binding(),
    context: CONTEXT,
    registry: DEFAULT_PRODUCT_BEHAVIOR_REGISTRY,
    hasMinimumLabelFacts: true,
    hasKnownCompatiblePrice: true,
    ...overrides,
  });

describe('Unified Product Behavior Resolver', () => {
  it('fails closed at Save/Production boundaries for managed snapshots only', () => {
    const managed = snapshotResolvedProductBehavior({
      lineId: 'managed',
      processScope: 'BASE_FORMULATION',
      resolved: resolve(),
    });
    const blocked = productBehaviorModuleGate(
      {
        managed: {
          ...managed,
          moduleEligibility: { ...managed.moduleEligibility, SAVE: 'blocked' },
        },
      },
      'SAVE',
    );
    expect(blocked.ready).toBe(false);
    expect(blocked.blockedLineIds).toEqual(['managed']);
    expect(productBehaviorModuleGate({}, 'SAVE').ready).toBe(true);
  });
  it('returns one complete module matrix from one versioned binding', () => {
    const result = resolve();
    expect(Object.keys(result.moduleEligibility).sort()).toEqual([...PRODUCT_BEHAVIOR_MODULES].sort());
    expect(result.moduleEligibility.BASE_RECIPE.state).toBe('eligible');
    expect(result.moduleEligibility.MAIN.state).toBe('eligible');
    expect(result.moduleEligibility.TOPPING.state).toBe('eligible');
    expect(result.mainPolicy).toMatchObject({
      ecoFloorPercent: 25,
      optimalCeilingPercent: 35,
      hardLimitPercent: 45,
    });
  });

  it('keeps a verified label product label-only when technical authority is absent', () => {
    const result = resolve({
      technical: {
        kind: 'none', mapperIngredientId: null, technicalProfileId: null,
        technicalProfileVersion: null, engineReady: false, reasons: ['no_safe_technical_profile'],
      },
      binding: binding({ baseAllowed: false, mainClassification: 'UNKNOWN', mainPolicyId: null }),
    });
    expect(result.moduleEligibility.BASE_RECIPE.state).toBe('blocked');
    expect(result.moduleEligibility.MAIN.state).toBe('blocked');
    expect(result.moduleEligibility.TOPPING.state).toBe('label_only');
    expect(result.moduleEligibility.LABEL.state).toBe('label_only');
  });

  it('fails every write-capable path closed on a stale product binding', () => {
    const result = resolve({ binding: binding({ productVersionId: 'strawberry-v0' }) });
    expect(result.moduleEligibility.BASE_RECIPE.state).toBe('blocked');
    expect(result.moduleEligibility.MAIN.state).toBe('blocked');
    expect(result.moduleEligibility.TOPPING.state).toBe('blocked');
    expect(result.warnings).toContain('product_behavior_binding_version_mismatch');
  });

  it('classifies a future product from injected policy data without resolver code changes', () => {
    const futureRegistry: ProductBehaviorRegistry = {
      taxonomyVersion: 'future-taxonomy-v2',
      policies: [{
        policyId: 'future-yuzu-sorbet-v1', policyVersion: '1', taxonomyVersion: 'future-taxonomy-v2',
        familyId: 'yuzu', subfamilyId: null, formId: 'fresh', productProfiles: ['sorbet'],
        basis: 'FRUIT_EQUIVALENT', ecoFloorPercent: 18, optimalCeilingPercent: 26,
        hardLimitPercent: 35, mainEquivalentFactor: 1, evidenceStatus: 'verified',
        requiresLiquidDairyCarrier: false, liquidDairyCarrierFloorPercent: null,
        approvedMixedFamilyIds: [], source: 'future-admin-policy', warnings: [],
      }],
    };
    const result = resolve({
      product: {
        productId: 'future-yuzu', productVersionId: 'future-yuzu-v1', source: 'future',
        sourceIdentity: 'future:yuzu', factsFingerprint: 'future-facts',
      },
      binding: binding({
        bindingId: 'future-binding', bindingVersion: '1', taxonomyVersion: 'future-taxonomy-v2',
        productVersionId: 'future-yuzu-v1', familyId: 'yuzu', formId: 'fresh',
        mainPolicyId: 'future-yuzu-sorbet-v1',
      }),
      context: { ...CONTEXT, productProfile: 'sorbet' },
      registry: futureRegistry,
    });
    expect(result.mainPolicy?.optimalCeilingPercent).toBe(26);
    expect(result.moduleEligibility.MAIN.state).toBe('eligible');
  });

  it('freezes product, policy and taxonomy versions into the recipe fingerprint', () => {
    const snapshot = snapshotResolvedProductBehavior({
      lineId: 'line-main', processScope: 'BASE_FORMULATION', resolved: resolve(),
    });
    const first = productBehaviorSnapshotFingerprint({ 'line-main': snapshot });
    const changed = productBehaviorSnapshotFingerprint({
      'line-main': { ...snapshot, mainPolicyVersion: '2' },
    });
    expect(first).not.toBe(changed);
    expect(snapshot.productVersionId).toBe('strawberry-v1');
  });
});
