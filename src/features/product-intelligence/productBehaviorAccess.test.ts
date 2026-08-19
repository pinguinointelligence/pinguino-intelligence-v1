import { describe, expect, it } from 'vitest';
import type { ProductBehaviorSnapshot } from './contracts';
import { productBehaviorModuleGate, productBehaviorRequiredLineIds } from './productBehaviorAccess';

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
  it('requires snapshots for Mapper/private/catalog and exact accepted built-ins', () => {
    expect(
      productBehaviorRequiredLineIds({
        items: [
          { id: 'mapper', ingredient: { identity_provenance: 'mapper' } },
          { id: 'private', ingredient: { identity_provenance: 'private_product' } },
          { id: 'built-in', ingredient: { id: 'raspberry' } },
          { id: 'demo', ingredient: {} },
        ],
        toppings: [
          {
            id: 'catalog-topping',
            ingredient: { kind: 'catalog_label_topping', catalog_product_id: 'catalog-1' },
          },
        ],
      }),
    ).toEqual(['built-in', 'catalog-topping', 'mapper', 'private']);
  });

  it('requires authority only for physically present positive-gram lines', () => {
    expect(
      productBehaviorRequiredLineIds({
        items: [
          {
            id: 'present',
            planned_grams: 1,
            actual_grams: null,
            ingredient: { identity_provenance: 'mapper' },
          },
          {
            id: 'zero',
            planned_grams: 0,
            actual_grams: null,
            ingredient: { identity_provenance: 'mapper' },
          },
          {
            id: 'actual-zero',
            planned_grams: 10,
            actual_grams: 0,
            ingredient: { identity_provenance: 'mapper' },
          },
          {
            id: 'actual-present',
            planned_grams: 0,
            actual_grams: 1,
            ingredient: { identity_provenance: 'mapper' },
          },
        ],
        toppings: [
          {
            id: 'present-topping',
            planned_grams: 1,
            actual_grams: null,
            ingredient: { kind: 'catalog_label_topping' },
          },
          {
            id: 'zero-topping',
            planned_grams: 0,
            actual_grams: null,
            ingredient: { kind: 'catalog_label_topping' },
          },
        ],
      }),
    ).toEqual(['actual-present', 'present', 'present-topping']);
  });

  it('does not let stale snapshots outside the positive-presence set block a module', () => {
    expect(
      productBehaviorModuleGate(
        {
          present: snapshot('present'),
          zero: {
            ...snapshot('zero'),
            resolutionState: 'REVALIDATION_REQUIRED',
          },
        },
        'PRODUCTION',
        ['present'],
      ),
    ).toEqual({ ready: true, blockedLineIds: [], reason: null });
  });

  it('keeps accepted built-ins fail-closed until their exact Mapper snapshot resolves', () => {
    const required = productBehaviorRequiredLineIds({
      items: [{ id: 'milk-line', ingredient: { id: 'milk_3_5' } }],
    });
    expect(productBehaviorModuleGate({}, 'BASE_RECIPE', required)).toMatchObject({
      ready: false,
      blockedLineIds: ['milk-line'],
    });
  });

  it('fails Save/Production closed when a required legacy product snapshot is absent', () => {
    expect(productBehaviorModuleGate({}, 'SAVE', ['legacy-line'])).toEqual({
      ready: false,
      blockedLineIds: ['legacy-line'],
      reason: 'Brak zatwierdzonego uprawnienia SAVE dla: legacy-line.',
    });
    expect(
      productBehaviorModuleGate({ line: snapshot('line') }, 'PRODUCTION', ['line']).ready,
    ).toBe(true);
  });

  it('keeps an unresolved reconstructed line fail-closed in every module', () => {
    const unresolved = {
      ...snapshot('legacy-line'),
      resolutionState: 'REVALIDATION_REQUIRED' as const,
    };
    expect(
      productBehaviorModuleGate({ 'legacy-line': unresolved }, 'RESTORE', ['legacy-line']),
    ).toMatchObject({ ready: false, blockedLineIds: ['legacy-line'] });
  });

  it('allows reconstructed history only in read-only projections', () => {
    const reconstructed = {
      ...snapshot('legacy-line'),
      resolutionState: 'LEGACY_RECONSTRUCTED' as const,
      moduleEligibility: {
        ...snapshot('legacy-line').moduleEligibility,
        MONITOR: 'eligible' as const,
      },
    };
    expect(
      productBehaviorModuleGate({ 'legacy-line': reconstructed }, 'MONITOR', ['legacy-line']).ready,
    ).toBe(true);
    expect(
      productBehaviorModuleGate({ 'legacy-line': reconstructed }, 'SAVE', ['legacy-line']),
    ).toMatchObject({ ready: false, blockedLineIds: ['legacy-line'] });
  });
});
