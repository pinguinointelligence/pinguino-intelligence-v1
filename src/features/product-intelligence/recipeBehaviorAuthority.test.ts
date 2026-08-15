import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import type {
  PrivateProductBehaviorOverlay,
  ProductBehaviorSnapshot,
  SharedProductBehaviorFacts,
} from './contracts';
import {
  buildRecipeBehaviorAuthority,
  frozenProcessEvidence,
  recipeBehaviorModuleGate,
  recipeBehaviorLegacyInspection,
  recipeInputFromFrozenBehavior,
  recipeToppingsFromFrozenBehavior,
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

  it('requires the frozen core composition but leaves Mapper nine-field eligibility to the resolver', () => {
    const exactTechnicalFacts = {
      water: 87, totalSolids: 13, fat: 3.5, protein: 3.2,
      carbohydrate: 4.8, sugars: 4.8, salt: 0.1, podValue: 4.8, pacValue: 4.8,
    };
    const complete = buildRecipeBehaviorAuthority({
      items: recipe().items,
      snapshots: {
        'line-1': snapshot({
          sharedFacts: { ...sharedFacts, technicalComposition: exactTechnicalFacts },
        }),
      },
    });
    expect(recipeBehaviorModuleGate(complete, 'MONITOR').ready).toBe(true);

    const missingWater = buildRecipeBehaviorAuthority({
      items: recipe().items,
      snapshots: {
        'line-1': snapshot({
          sharedFacts: {
            ...sharedFacts,
            technicalComposition: { ...exactTechnicalFacts, water: null },
          },
        }),
      },
    });
    expect(recipeBehaviorModuleGate(missingWater, 'MONITOR')).toMatchObject({
      ready: false,
      blockedLineIds: ['line-1'],
    });
  });

  it('distinguishes saved legacy inspection from an incomplete modern draft', () => {
    const missing = buildRecipeBehaviorAuthority({ items: recipe().items, snapshots: {} });
    expect(recipeBehaviorLegacyInspection(missing, null)).toBe(false);
    expect(recipeBehaviorLegacyInspection(missing, 'saved-recipe-1')).toBe(true);
    const reconstructed = buildRecipeBehaviorAuthority({
      items: recipe().items,
      snapshots: {
        'line-1': snapshot({ resolutionState: 'LEGACY_RECONSTRUCTED' }),
      },
    });
    expect(recipeBehaviorLegacyInspection(reconstructed, 'saved-recipe-1')).toBe(true);
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

  it('erases mutable Base facts that are absent from the frozen product version', () => {
    const mutable = recipe();
    mutable.items[0]!.ingredient.composition = {
      ...mutable.items[0]!.ingredient.composition,
      water_percent: 99,
      protein_percent: 12,
    };
    const authority = buildRecipeBehaviorAuthority({
      items: mutable.items,
      snapshots: { 'line-1': snapshot() },
    });
    const projected = recipeInputFromFrozenBehavior(mutable, authority, 'technical');
    expect(projected.items[0]!.ingredient.composition.water_percent).toBe(87);
    expect(projected.items[0]!.ingredient.composition).not.toHaveProperty('protein_percent');
  });

  it('projects label Topping nutrition and allergens from the exact frozen version', () => {
    const ingredient: CatalogLabelToppingIngredient = {
      kind: 'catalog_label_topping',
      id: 'catalog:sauce',
      canonical_ingredient_id: 'catalog:sauce',
      private_product_id: 'catalog:sauce:version:v1',
      name: 'Mutable sauce',
      catalog_product_id: 'sauce',
      catalog_version_id: 'v1',
      verification_status: 'manual_unverified',
      label_nutrition_per_100g: {
        basis: 'per_100g', energyKcal: 999, fat: 99, saturatedFat: 99,
        carbohydrate: 99, sugars: 99, protein: 99, salt: 99, fibre: 99,
      },
      ingredients_text: 'Mutable ingredients',
      allergens_text: 'Mutable allergens',
      cost_per_kg: null,
      cost_currency: null,
    };
    const topping: RecipeToppingItem = {
      id: 'topping-1', ingredient, planned_grams: 50, actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON', addon_sort_order: 0,
    };
    const toppingSnapshot = snapshot({
      lineId: topping.id,
      source: 'catalog_import',
      mapperIngredientId: null,
      processScope: 'POST_PROCESS_ADDON',
    });
    const authority = buildRecipeBehaviorAuthority({
      items: [], toppings: [topping], snapshots: { [topping.id]: toppingSnapshot },
    });
    const [projected] = recipeToppingsFromFrozenBehavior([topping], authority, 'nutrition');
    expect(projected?.ingredient).toMatchObject({
      label_nutrition_per_100g: { energyKcal: 64, fat: 3.5, protein: 3.2 },
      ingredients_text: 'Milk',
      allergens_text: 'Milk',
    });
  });
});
