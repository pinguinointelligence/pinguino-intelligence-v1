import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type {
  PrivateProductBehaviorOverlay,
  ProductBehaviorSnapshot,
  SharedProductBehaviorFacts,
} from './contracts';
import {
  buildRecipeBehaviorAuthority,
  frozenProcessEvidence,
  recipeBehaviorModuleGate,
  recipeVersionBehaviorGate,
  resolveProductCostProjection,
} from './recipeBehaviorAuthority';

const processEvidence = {
  decision: 'cold_process_approved' as const,
  reasonType: 'process_requirement' as const,
  affectedIngredientIds: ['PI-ING-1'],
  explanation: 'Validated cold route.',
  source: {
    id: 'process-1',
    label: 'Process evidence',
    reference: 'process-v1',
    verificationStatus: 'verified' as const,
  },
};

const sharedFacts: SharedProductBehaviorFacts = {
  schemaVersion: 1,
  technicalComposition: { water: 87, fat: 3.5 },
  nutritionPer100g: {
    basis: 'per_100g', energyKcal: 64, fat: 3.5, saturatedFat: 2.2,
    carbohydrate: 4.8, sugars: 4.8, protein: 3.2, salt: 0.1, fibre: 0,
  },
  allergens: {
    ingredientsText: 'Milk', allergensText: 'Milk', declared: ['milk'], mayContain: [],
    evidenceVersion: 'allergen-v1',
  },
  processEvidence: [processEvidence],
  profileEligibility: ['milk_gelato'],
  veganEligibility: 'false',
  proteinBehavior: 'contributor',
  referencePrice: { pricePerKg: 4, currency: 'EUR', sourceVersion: 'price-v1' },
};

const snapshot = (overrides: Partial<ProductBehaviorSnapshot> = {}): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId: 'line-1',
  productId: 'product-1',
  productVersionId: 'version-1',
  source: 'mapper',
  factsFingerprint: 'facts-1',
  behaviorBindingId: 'binding-1',
  behaviorBindingVersion: 'binding-v1',
  taxonomyVersion: 'taxonomy-v1',
  familyId: null,
  subfamilyId: null,
  formId: null,
  verificationState: 'verified',
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
  moduleEligibility: {
    MONITOR: 'eligible', SUMMARY: 'eligible', NUTRITION: 'eligible',
    ALLERGENS: 'eligible', PROCESS: 'eligible', MASTER_LABEL: 'eligible',
    EXPORT: 'eligible', RECIPE_VERSION: 'eligible', RESTORE: 'eligible',
  },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'resolver-v1',
  sharedFacts,
  warnings: [],
  blockReasons: [],
  ...overrides,
});

const recipe = (): RecipeInput => ({
  category: 'milk_gelato',
  mode: 'optimal',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [{
    id: 'line-1',
    ingredient: {
      id: 'PI-ING-1', name: 'Milk', canonical_ingredient_id: 'PI-ING-1',
      identity_provenance: 'mapper', composition: {},
    },
    planned_grams: 1000,
    actual_grams: null,
    lock_type: 'unlocked',
  }],
} as unknown as RecipeInput);

describe('recipe behavior authority', () => {
  it('fails facts-dependent modules closed for a required line without a snapshot', () => {
    const authority = buildRecipeBehaviorAuthority({ items: recipe().items, snapshots: {} });
    expect(recipeBehaviorModuleGate(authority, 'MONITOR')).toMatchObject({
      ready: false,
      blockedLineIds: ['line-1'],
    });
  });

  it('projects only frozen process evidence for the exact recipe snapshots', () => {
    const authority = buildRecipeBehaviorAuthority({
      items: recipe().items,
      snapshots: { 'line-1': snapshot() },
    });
    expect(recipeBehaviorModuleGate(authority, 'PROCESS').ready).toBe(true);
    expect(frozenProcessEvidence(authority)).toEqual({ complete: true, evidence: [processEvidence] });
  });

  it('blocks historical restore when required authority is absent and permits a complete version', () => {
    expect(recipeVersionBehaviorGate(recipe(), null, 'RESTORE').ready).toBe(false);
    expect(recipeVersionBehaviorGate(recipe(), {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: ['line-1'],
      toppings: [],
      behaviorSnapshots: { 'line-1': snapshot() },
      migrationAmbiguities: [],
    }, 'RESTORE').ready).toBe(true);
  });

  it('keeps private price separate and uses private > reference > missing precedence', () => {
    const privateOverlay: PrivateProductBehaviorOverlay = {
      favorite: true, recentAt: null, privatePricePerKg: 3, privatePriceCurrency: 'EUR',
      supplier: 'Private supplier', note: null, stock: null,
    };
    expect(resolveProductCostProjection(snapshot(), privateOverlay)).toMatchObject({
      state: 'known', pricePerKg: 3, source: 'private',
    });
    expect(resolveProductCostProjection(snapshot(), null)).toMatchObject({
      state: 'known', pricePerKg: 4, source: 'reference',
    });
    expect(resolveProductCostProjection(snapshot({ sharedFacts: { ...sharedFacts, referencePrice: null } }), null))
      .toEqual({ state: 'missing', pricePerKg: null, currency: null, source: 'missing' });
  });
});
