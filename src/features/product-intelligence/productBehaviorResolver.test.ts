import { describe, expect, it } from 'vitest';
import type { ServerResolvedProductBehavior } from './contracts';
import {
  productBehaviorSnapshotFingerprint,
  snapshotServerResolvedProductBehavior,
} from './productBehaviorResolver';
import { productBehaviorModuleGate } from './productBehaviorAccess';

const resolved = (
  overrides: Partial<ServerResolvedProductBehavior> = {},
): ServerResolvedProductBehavior => ({
  schemaVersion: 1,
  resolverVersion: 'server-resolver-v1',
  entityKind: 'catalog_product_version',
  productId: 'product-1',
  productVersionId: 'version-1',
  factsFingerprint: 'facts-1',
  catalogStatus: 'verified',
  provenance: 'ocr',
  behaviorBindingId: 'binding-1',
  behaviorBindingVersion: 'classifier-v1',
  taxonomyVersion: 'taxonomy-v1',
  mapperIngredientId: 'PI-ING-001553',
  familyId: 'fruit',
  subfamilyId: 'berry',
  formId: 'fresh',
  mainEligibility: 'MAIN_PROFILE_SPECIFIC',
  veganEligibility: 'verified',
  proteinBehavior: 'neutral',
  processBehavior: { decision: 'COLD_PROCESS_OK' },
  approvedLiquidDairyCarrier: false,
  context: {
    accountId: 'account-1',
    productProfile: 'milk_gelato',
    temperatureC: -12,
    mode: 'optimal',
    processScope: 'BASE_FORMULATION',
    requestedRole: 'MAIN',
    module: 'MAIN',
  },
  module: 'MAIN',
  state: 'eligible',
  moduleEligibility: {
    BASE_RECIPE: 'eligible', MAIN: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible',
    MONITOR: 'eligible', SAVE: 'eligible', PRODUCTION: 'eligible',
  },
  mainPolicy: {
    policyId: 'main-berry-fresh-dairy', policyVersion: '2', familyId: 'fruit',
    subfamilyId: 'berry', formId: 'fresh', basis: 'FRUIT_EQUIVALENT',
    ecoFloorPercent: 25, optimalCeilingPercent: 35, hardLimitPercent: 45,
    mainEquivalentFactor: 1, requiresLiquidDairyCarrier: true,
    liquidDairyCarrierFloorPercent: 30, approvedMixedFamilyIds: [],
    evidenceStatus: 'owner_provisional',
  },
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: { water: 86, totalSolids: 14 },
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: ['milk_gelato'],
    veganEligibility: 'verified',
    proteinBehavior: 'neutral',
    referencePrice: { pricePerKg: 5, currency: 'EUR', sourceVersion: 'mapper-v1' },
  },
  privateOverlay: {
    favorite: true, recentAt: null, privatePricePerKg: 4, privatePriceCurrency: 'EUR',
    supplier: 'Private supplier', note: 'Private note', stock: 2,
  },
  warnings: [],
  blockReasons: [],
  ...overrides,
});

describe('server Product Behavior snapshot boundary', () => {
  it('freezes the exact server policy, context and module matrix', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION', resolved: resolved(),
    });
    expect(snapshot).toMatchObject({
      resolutionState: 'RESOLVED', productVersionId: 'version-1',
      mainPolicyId: 'main-berry-fresh-dairy', mainPolicyVersion: '2',
      ecoFloorPercent: 25, optimalCeilingPercent: 35, hardLimitPercent: 45,
      resolutionContext: { productProfile: 'milk_gelato', temperatureC: -12, mode: 'optimal' },
      moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'eligible', OPTIMAL: 'eligible' },
    });
  });

  it('never persists the account-private overlay inside shared recipe authority', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION', resolved: resolved(),
    });
    expect(snapshot.sharedFacts?.referencePrice?.pricePerKg).toBe(5);
    expect(snapshot).not.toHaveProperty('privateOverlay');
    expect(JSON.stringify(snapshot)).not.toContain('Private supplier');
    expect(JSON.stringify(snapshot)).not.toContain('Private note');
  });

  it('fails write-capable module gates closed when the server denied that module', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION',
      resolved: resolved({ state: 'blocked', module: 'SAVE', moduleEligibility: { SAVE: 'blocked' } }),
    });
    expect(productBehaviorModuleGate({ 'line-1': snapshot }, 'SAVE', ['line-1'])).toMatchObject({
      ready: false, blockedLineIds: ['line-1'],
    });
  });

  it('includes product, policy, context and shared facts in the recipe fingerprint', () => {
    const snapshot = snapshotServerResolvedProductBehavior({
      lineId: 'line-1', processScope: 'BASE_FORMULATION', resolved: resolved(),
    });
    const first = productBehaviorSnapshotFingerprint({ 'line-1': snapshot });
    expect(productBehaviorSnapshotFingerprint({
      'line-1': { ...snapshot, mainPolicyVersion: '3' },
    })).not.toBe(first);
    expect(productBehaviorSnapshotFingerprint({
      'line-1': {
        ...snapshot,
        resolutionContext: { ...snapshot.resolutionContext!, temperatureC: -13 },
      },
    })).not.toBe(first);
    expect(productBehaviorSnapshotFingerprint({
      'line-1': {
        ...snapshot,
        sharedFacts: { ...snapshot.sharedFacts!, technicalComposition: { water: 85 } },
      },
    })).not.toBe(first);
  });
});
