import { describe, expect, it } from 'vitest';
import type { ProductBehaviorSnapshot } from './contracts';
import {
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
} from './productBehaviorAccess';

const snapshot = (lineId: string): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: 'product-1',
  productVersionId: 'version-1',
  source: 'catalog_import',
  factsFingerprint: 'facts-1',
  behaviorBindingId: 'binding-1',
  behaviorBindingVersion: 'classifier-1',
  taxonomyVersion: 'taxonomy-1',
  familyId: null,
  subfamilyId: null,
  formId: null,
  verificationState: 'manual_unverified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId: 'PI-ING-1',
  mainClassification: 'NOT_MAIN',
  mainPolicyId: null,
  mainPolicyVersion: null,
  ecoFloorPercent: null,
  optimalCeilingPercent: null,
  hardLimitPercent: null,
  mainEquivalentFactor: null,
  mainBasis: null,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: false,
  approvedMixedFamilyIds: [],
  moduleEligibility: { SAVE: 'eligible', PRODUCTION: 'eligible' },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'unified-product-behavior-v1',
  warnings: [],
  blockReasons: [],
});

describe('product behavior snapshot completeness', () => {
  it('requires snapshots for Mapper/private/catalog product lines but not demo fixtures', () => {
    expect(productBehaviorRequiredLineIds({
      items: [
        { id: 'mapper', ingredient: { identity_provenance: 'mapper' } },
        { id: 'private', ingredient: { identity_provenance: 'private_product' } },
        { id: 'demo', ingredient: {} },
      ],
      toppings: [{
        id: 'catalog-topping',
        ingredient: { kind: 'catalog_label_topping', catalog_product_id: 'catalog-1' },
      }],
    })).toEqual(['catalog-topping', 'mapper', 'private']);
  });

  it('fails Save/Production closed when a required legacy product snapshot is absent', () => {
    expect(productBehaviorModuleGate({}, 'SAVE', ['legacy-line'])).toEqual({
      ready: false,
      blockedLineIds: ['legacy-line'],
      reason: 'Brak zatwierdzonego uprawnienia SAVE dla: legacy-line.',
    });
    expect(productBehaviorModuleGate({ line: snapshot('line') }, 'PRODUCTION', ['line']).ready)
      .toBe(true);
  });

  it('keeps an unresolved reconstructed line fail-closed in every module', () => {
    const unresolved = {
      ...snapshot('legacy-line'),
      resolutionState: 'REVALIDATION_REQUIRED' as const,
    };
    expect(productBehaviorModuleGate(
      { 'legacy-line': unresolved },
      'RESTORE',
      ['legacy-line'],
    )).toMatchObject({ ready: false, blockedLineIds: ['legacy-line'] });
  });
});
