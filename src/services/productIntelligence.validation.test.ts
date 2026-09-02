import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineIngredient, RecipeInput } from '@/engine';
import type {
  ProductBehaviorSnapshot,
  ServerResolvedProductBehavior,
} from '@/features/product-intelligence';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: h.rpc },
  isSupabaseConfigured: true,
}));

import {
  buildRecipeBehaviorServerValidationGroups,
  resolveLegacyRecipeBehaviorForSelection,
  resolveRecipeProposalBehaviorSnapshots,
  resolveProductBehaviorForSelection,
  validateRecipeBehaviorOnServer,
} from './productIntelligence';

const ingredient = (
  id: string,
  identity_provenance: EngineIngredient['identity_provenance'] = 'mapper',
): EngineIngredient => ({
  id,
  name: id,
  identity_provenance,
  category: 'other',
  composition: {
    water_percent: 100,
    solids_percent: 0,
    fat_percent: 0,
    protein_percent: 0,
    carbohydrate_percent: 0,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    salt_percent: 0,
    alcohol_percent: 0,
    kcal_per_100g: 0,
  },
  pod_value: 0,
  pac_value: 0,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 100,
  source_type: 'verified_db',
  is_verified: true,
});

const recipe: RecipeInput = {
  items: [
    {
      id: 'main-line',
      ingredient: ingredient('PI-ING-1'),
      planned_grams: 200,
      actual_grams: null,
      lock_type: 'main',
    },
    {
      id: 'standard-line',
      ingredient: ingredient('PI-ING-2'),
      planned_grams: 800,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'optimal' },
};

const snapshot = (lineId: string, mapperIngredientId: string): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: `product-${lineId}`,
  productVersionId: `version-${lineId}`,
  source: 'mapper',
  factsFingerprint: `facts-${lineId}`,
  behaviorBindingId: `binding-${lineId}`,
  behaviorBindingVersion: 'classifier-2',
  taxonomyVersion: 'taxonomy-2',
  familyId: 'fruit',
  subfamilyId: null,
  formId: 'fresh',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId,
  mainClassification: lineId === 'main-line' ? 'MAIN_ALLOWED' : 'NOT_MAIN',
  mainPolicyId: lineId === 'main-line' ? 'fruit-milk' : null,
  mainPolicyVersion: lineId === 'main-line' ? '1' : null,
  ecoFloorPercent: lineId === 'main-line' ? 15 : null,
  optimalCeilingPercent: lineId === 'main-line' ? 30 : null,
  hardLimitPercent: lineId === 'main-line' ? 45 : null,
  mainEquivalentFactor: lineId === 'main-line' ? 1 : null,
  mainBasis: lineId === 'main-line' ? 'FRUIT_EQUIVALENT' : null,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: lineId === 'standard-line',
  approvedMixedFamilyIds: [],
  moduleEligibility: { BASE_RECIPE: 'eligible', SAVE: 'eligible', PRODUCTION: 'eligible' },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'unified-product-behavior-v2',
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: {
      water: 100,
      totalSolids: 0,
      fat: 0,
      saturatedFat: null,
      protein: 0,
      carbohydrate: 0,
      sugars: 0,
      sucrose: 0,
      glucose: 0,
      dextrose: 0,
      fructose: 0,
      lactose: 0,
      polyols: 0,
      fibre: 0,
      salt: 0,
      alcohol: 0,
      energyKcal: 0,
      podValue: 0,
      pacValue: 0,
      deValue: null,
    },
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: ['milk_gelato'],
    veganEligibility: 'unknown',
    proteinBehavior: 'unknown',
    referencePrice: null,
  },
  warnings: [],
  blockReasons: [],
});

const topping = (lineId: string, mapperIngredientId: string, grams: number): RecipeToppingItem => ({
  id: lineId,
  ingredient: ingredient(mapperIngredientId),
  planned_grams: grams,
  actual_grams: null,
  process_scope: 'POST_PROCESS_ADDON',
  addon_sort_order: 0,
});

const staleToppingSnapshot = (
  lineId: string,
  mapperIngredientId: string,
): ProductBehaviorSnapshot => ({
  ...snapshot(lineId, mapperIngredientId),
  resolutionState: 'REVALIDATION_REQUIRED',
  processScope: 'POST_PROCESS_ADDON',
  blockReasons: ['recipe_context_changed'],
});

describe('recipe behavior server validation', () => {
  beforeEach(() => h.rpc.mockReset());

  it('validates Main and Standard through their exact server-authority roles', () => {
    const built = buildRecipeBehaviorServerValidationGroups({
      recipe,
      snapshots: {
        'main-line': snapshot('main-line', 'PI-ING-1'),
        'standard-line': snapshot('standard-line', 'PI-ING-2'),
      },
      module: 'BASE_RECIPE',
      accountId: 'account-1',
    });
    expect(built.invalidLineIds).toEqual([]);
    expect(built.groups).toHaveLength(2);
    expect(built.groups.map((group) => group.context.requestedRole).sort()).toEqual([
      'MAIN',
      'STANDARD',
    ]);
    expect(built.groups.find((group) => group.context.requestedRole === 'MAIN')?.lines).toEqual([
      expect.objectContaining({
        lineId: 'main-line',
        entityKind: 'mapper',
        entityId: 'PI-ING-1',
        mainPolicyId: 'fruit-milk',
      }),
    ]);
    expect(built.groups.flatMap((group) => group.lines)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineId: 'main-line',
          entityKind: 'mapper',
          entityId: 'PI-ING-1',
          mainPolicyId: 'fruit-milk',
        }),
      ]),
    );
    expect(JSON.stringify(built.groups)).toContain('technicalComposition');
    expect(JSON.stringify(built.groups)).not.toContain('privateOverlay');
  });

  it('preserves the existing Production role authority outside this solver repair', () => {
    const built = buildRecipeBehaviorServerValidationGroups({
      recipe: { ...recipe, items: [recipe.items[0]!] },
      snapshots: { 'main-line': snapshot('main-line', 'PI-ING-1') },
      module: 'PRODUCTION',
      accountId: 'account-1',
    });
    expect(built.invalidLineIds).toEqual([]);
    expect(built.groups[0]?.context.requestedRole).toBe('MAIN');
  });

  it('keeps an authorized Owner Review technical Main STANDARD even in Production validation', () => {
    const built = buildRecipeBehaviorServerValidationGroups({
      recipe: { ...recipe, items: [recipe.items[0]!] },
      snapshots: { 'main-line': snapshot('main-line', 'PI-ING-1') },
      module: 'PRODUCTION',
      accountId: 'owner-1',
      technicalOnlyMainLineIds: ['main-line'],
    });
    expect(built.invalidLineIds).toEqual([]);
    expect(built.groups[0]?.context.requestedRole).toBe('STANDARD');
  });

  it('keeps an Owner Review Main lock visible while validating its technical-only line as STANDARD', () => {
    const built = buildRecipeBehaviorServerValidationGroups({
      recipe,
      snapshots: {
        'main-line': snapshot('main-line', 'PI-ING-1'),
        'standard-line': snapshot('standard-line', 'PI-ING-2'),
      },
      module: 'OPTIMAL',
      accountId: 'owner-1',
      technicalOnlyMainLineIds: ['main-line'],
    });
    expect(recipe.items[0]?.lock_type).toBe('main');
    expect(built.invalidLineIds).toEqual([]);
    expect(built.groups).toHaveLength(1);
    expect(built.groups[0]?.context.requestedRole).toBe('STANDARD');
    expect(built.groups[0]?.lines.map((line) => line.lineId).sort()).toEqual([
      'main-line',
      'standard-line',
    ]);
  });

  it('treats a stripped optional DE null as equal to the Engine null value', () => {
    const resolved = snapshot('main-line', 'PI-ING-1');
    const technicalComposition = { ...resolved.sharedFacts!.technicalComposition! };
    delete technicalComposition.deValue;
    const built = buildRecipeBehaviorServerValidationGroups({
      recipe: { ...recipe, items: [recipe.items[0]!] },
      snapshots: {
        'main-line': {
          ...resolved,
          sharedFacts: { ...resolved.sharedFacts!, technicalComposition },
        },
      },
      module: 'SAVE',
      accountId: 'account-1',
    });
    expect(built.invalidLineIds).toEqual([]);
    expect(built.groups).toHaveLength(1);
  });

  it('matches a stripped optional Mapper component to the Engine zero seam without weakening core facts', () => {
    const resolved = snapshot('main-line', 'PI-ING-1');
    const optionalTechnical = { ...resolved.sharedFacts!.technicalComposition! };
    delete optionalTechnical.polyols;
    const optional = buildRecipeBehaviorServerValidationGroups({
      recipe: { ...recipe, items: [recipe.items[0]!] },
      snapshots: {
        'main-line': {
          ...resolved,
          sharedFacts: { ...resolved.sharedFacts!, technicalComposition: optionalTechnical },
        },
      },
      module: 'SAVE',
      accountId: 'account-1',
    });
    expect(optional.invalidLineIds).toEqual([]);

    const missingCoreTechnical = { ...resolved.sharedFacts!.technicalComposition! };
    delete missingCoreTechnical.water;
    const missingCore = buildRecipeBehaviorServerValidationGroups({
      recipe: { ...recipe, items: [recipe.items[0]!] },
      snapshots: {
        'main-line': {
          ...resolved,
          sharedFacts: { ...resolved.sharedFacts!, technicalComposition: missingCoreTechnical },
        },
      },
      module: 'SAVE',
      accountId: 'account-1',
    });
    expect(missingCore.invalidLineIds).toEqual(['main-line']);
  });

  it('binds the effective catalog price without leaking it into shared facts', () => {
    const catalogIngredient: EngineIngredient = {
      ...recipe.items[1]!.ingredient,
      id: 'catalog-product-1',
      identity_provenance: 'reference',
      private_product_id: 'catalog:catalog-product-1:version:catalog-version-1',
      cost_per_kg: 18.75,
      cost_currency: 'EUR',
      cost_source: 'private',
    };
    const catalogSnapshot: ProductBehaviorSnapshot = {
      ...snapshot('catalog-line', 'PI-ING-2'),
      source: 'ocr',
      productId: 'catalog-product-1',
      productVersionId: 'catalog-version-1',
    };
    const built = buildRecipeBehaviorServerValidationGroups({
      recipe: {
        ...recipe,
        items: [
          {
            ...recipe.items[1]!,
            id: 'catalog-line',
            ingredient: catalogIngredient,
          },
        ],
      },
      snapshots: { 'catalog-line': catalogSnapshot },
      module: 'ECO',
      accountId: 'account-1',
    });
    expect(built.invalidLineIds).toEqual([]);
    expect(built.groups[0]?.lines[0]).toMatchObject({
      entityKind: 'catalog_product_version',
      costPerKg: 18.75,
      costCurrency: 'EUR',
    });
    expect(built.groups[0]?.lines[0]?.sharedFacts).not.toHaveProperty('privateOverlay');
  });

  it('fails closed when the server reports a stale binding', async () => {
    h.rpc.mockResolvedValue({
      data: {
        schemaVersion: 1,
        ready: false,
        module: 'SAVE',
        lines: [
          {
            lineId: 'main-line',
            state: 'stale',
            reasons: ['behavior_binding_stale'],
          },
        ],
        staleLineIds: ['main-line'],
      },
      error: null,
    });
    const single = { ...recipe, items: [recipe.items[0]!] };
    await expect(
      validateRecipeBehaviorOnServer({
        recipe: single,
        snapshots: { 'main-line': snapshot('main-line', 'PI-ING-1') },
        module: 'SAVE',
        accountId: 'account-1',
      }),
    ).resolves.toMatchObject({
      ready: false,
      staleLineIds: ['main-line'],
      lines: [
        {
          lineId: 'main-line',
          reasons: [
            'behavior_binding_stale:product-main-line:PI-ING-1:version-main-line:SAVE:refresh_product_data',
          ],
        },
      ],
    });
    expect(h.rpc).toHaveBeenCalledWith(
      'validate_recipe_behavior_v1',
      expect.objectContaining({
        p_context: expect.objectContaining({ module: 'SAVE', productProfile: 'milk_gelato' }),
      }),
    );
  });

  it('keeps recipe authority ready while returning bounded Production process information', async () => {
    h.rpc.mockResolvedValue({
      data: {
        schemaVersion: 1,
        ready: true,
        module: 'PRODUCTION',
        lines: [{ lineId: 'main-line', state: 'ready', reasons: [] }],
        staleLineIds: [],
        processReadiness: {
          schemaVersion: 1,
          status: 'READY_WITH_INFO',
          blockers: [],
          advisories: [
            {
              code: 'PROCESS_DATA_INSUFFICIENT',
              lineId: 'main-line',
              productId: 'product-main-line',
              mapperIngredientId: 'PI-ING-000236',
              decision: 'UNKNOWN',
              verificationStatus: 'unknown',
            },
          ],
        },
      },
      error: null,
    });
    const single = { ...recipe, items: [recipe.items[0]!] };
    const approved = snapshot('main-line', 'PI-ING-000236');

    await expect(
      validateRecipeBehaviorOnServer({
        recipe: single,
        snapshots: { 'main-line': approved },
        module: 'PRODUCTION',
        accountId: 'account-1',
        thermalMode: 'COLD_ONLY',
      }),
    ).resolves.toMatchObject({
      ready: true,
      staleLineIds: [],
      processReadiness: {
        status: 'READY_WITH_INFO',
        advisories: [
          {
            lineId: 'main-line',
            mapperIngredientId: 'PI-ING-000236',
            productName: 'PI-ING-1',
          },
        ],
      },
    });
    expect(h.rpc).toHaveBeenCalledWith(
      'validate_recipe_behavior_v1',
      expect.objectContaining({
        p_context: expect.objectContaining({
          module: 'PRODUCTION',
          thermalMode: 'COLD_ONLY',
        }),
      }),
    );
  });

  it('preserves an exact blocked resolver envelope instead of collapsing it to null', async () => {
    h.rpc.mockResolvedValue({
      data: {
        schemaVersion: 1,
        entityKind: 'catalog_product_version',
        entityId: 'version-1',
        productId: 'product-1',
        productVersionId: 'version-1',
        mapperIngredientId: 'PI-ING-000405',
        state: 'blocked',
        module: 'BASE_RECIPE',
        blockReasons: [
          'behavior_binding_missing:product-1:PI-ING-000405:version-1:BASE_RECIPE:refresh_product_data',
        ],
      },
      error: null,
    });
    await expect(
      resolveProductBehaviorForSelection({
        entity: { entityKind: 'catalog_product_version', entityId: 'version-1' },
        context: {
          accountId: 'account-1',
          productProfile: 'milk_gelato',
          temperatureC: -12,
          mode: 'optimal',
          processScope: 'BASE_FORMULATION',
          requestedRole: 'STANDARD',
          module: 'BASE_RECIPE',
        },
      }),
    ).resolves.toMatchObject({
      state: 'blocked',
      productId: 'product-1',
      productVersionId: 'version-1',
      mapperIngredientId: 'PI-ING-000405',
      blockReasons: [
        'behavior_binding_missing:product-1:PI-ING-000405:version-1:BASE_RECIPE:refresh_product_data',
      ],
    });
  });

  it('fails before RPC when recipe science differs from the frozen Mapper facts', async () => {
    const forged = {
      ...recipe,
      items: [
        {
          ...recipe.items[0]!,
          ingredient: {
            ...recipe.items[0]!.ingredient,
            composition: { ...recipe.items[0]!.ingredient.composition, water_percent: 99 },
          },
        },
      ],
    };
    await expect(
      validateRecipeBehaviorOnServer({
        recipe: forged,
        snapshots: { 'main-line': snapshot('main-line', 'PI-ING-1') },
        module: 'SAVE',
        accountId: 'account-1',
      }),
    ).resolves.toMatchObject({
      ready: false,
      staleLineIds: ['main-line'],
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('does not call the server for an unmanaged built-in recipe', async () => {
    const unmanaged = {
      ...recipe,
      items: recipe.items.map((item) => ({
        ...item,
        ingredient: ingredient(item.ingredient.id, 'demo'),
      })),
    };
    await expect(
      validateRecipeBehaviorOnServer({
        recipe: unmanaged,
        snapshots: {},
        module: 'PRODUCTION',
        accountId: null,
      }),
    ).resolves.toMatchObject({
      ready: true,
      lines: [],
      // No thermal route was declared and none is required: process is
      // informational (owner decision, 2026-08-23).
      processReadiness: { status: 'READY', blockers: [] },
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('accepts a Production validation with no process envelope at all', async () => {
    h.rpc.mockResolvedValue({
      data: {
        schemaVersion: 1,
        ready: true,
        module: 'PRODUCTION',
        lines: [{ lineId: 'main-line', state: 'ready', reasons: [] }],
        staleLineIds: [],
      },
      error: null,
    });
    // Product authority still decides `ready`. A silent process envelope is
    // simply an absence of information, not a reason to fail the recipe.
    await expect(
      validateRecipeBehaviorOnServer({
        recipe: { ...recipe, items: [recipe.items[0]!] },
        snapshots: { 'main-line': snapshot('main-line', 'PI-ING-1') },
        module: 'PRODUCTION',
        accountId: 'account-1',
        thermalMode: 'HEAT_CAPABLE',
      }),
    ).resolves.toMatchObject({
      ready: true,
      processReadiness: { status: 'READY', blockers: [] },
    });
  });

  it('resolves a solver-added Inulin line by canonical Mapper identity, never by its local correction id', async () => {
    const addedLineId = 'correction-inulin-0';
    const proposed: RecipeInput = {
      ...recipe,
      items: [
        {
          ...recipe.items[1]!,
          id: addedLineId,
          ingredient: {
            ...recipe.items[1]!.ingredient,
            id: 'inulin',
            canonical_ingredient_id: 'PI-ING-000456',
            name: 'INULIN · Specialty',
          },
          planned_grams: 10,
        },
      ],
    };
    const resolveSelection = vi.fn().mockResolvedValue({
      ...snapshot(addedLineId, 'PI-ING-000456'),
      state: 'eligible',
      entityKind: 'mapper',
      entityId: 'PI-ING-000456',
      module: 'OPTIMAL',
      context: {
        accountId: 'account-1',
        productProfile: 'milk_gelato',
        temperatureC: -12,
        mode: 'optimal',
        processScope: 'BASE_FORMULATION',
        requestedRole: 'STANDARD',
        module: 'OPTIMAL',
      },
    });

    const result = await resolveRecipeProposalBehaviorSnapshots({
      recipe: proposed,
      snapshots: {},
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
    });

    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(resolveSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: { entityKind: 'mapper', entityId: 'PI-ING-000456' },
      }),
    );
    expect(JSON.stringify(resolveSelection.mock.calls)).not.toContain(addedLineId);
    expect(result.unresolvedLineIds).toEqual([]);
    expect(result.snapshots[addedLineId]).toMatchObject({
      lineId: addedLineId,
      mapperIngredientId: 'PI-ING-000456',
      productVersionId: `version-${addedLineId}`,
      behaviorBindingId: `binding-${addedLineId}`,
      factsFingerprint: `facts-${addedLineId}`,
    });
  });

  it('keeps the current BASE_READY Cacao version eligible as Standard and rechecks Crown independently', async () => {
    const productId = '55bd0ed2-2d13-4c6b-9020-5c563188f1ef';
    const productVersionId = '6a463055-ac6d-41d1-8fbb-01e662ba943b';
    const behaviorBindingId = '639f48f5-9d1c-4948-86a0-02ed20205203';
    const cacaoLineId = 'cacao-line';
    const cacaoRecipe: RecipeInput = {
      ...recipe,
      items: [
        {
          ...recipe.items[1]!,
          id: cacaoLineId,
          ingredient: {
            ...recipe.items[1]!.ingredient,
            id: 'CA-ING-007141',
            canonical_ingredient_id: 'CA-ING-007141',
            private_product_id: `catalog:${productId}:version:${productVersionId}`,
            identity_provenance: 'private_product',
            name: 'Cacao Puro',
          },
          planned_grams: 30,
          lock_type: 'unlocked',
        },
      ],
    };
    const staleCurrent: ProductBehaviorSnapshot = {
      ...snapshot(cacaoLineId, 'PI-ING-001313'),
      resolutionState: 'REVALIDATION_REQUIRED',
      source: 'manual',
      productId,
      productVersionId,
      behaviorBindingId,
      behaviorBindingVersion: 'product-behavior-layered-v2-64f3abe0346d1123',
      mapperIngredientId: null,
      technicalAuthority: 'none',
      mainClassification: 'MAIN_BLOCKED_POLICY',
      mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
      mainAuthority: 'USER_HELD',
      mainCalibrationLevel: 'NONE',
      resolutionContext: {
        accountId: 'account-1',
        productProfile: 'milk_gelato',
        temperatureC: -12,
        mode: 'optimal',
        processScope: 'BASE_FORMULATION',
        requestedRole: 'STANDARD',
        module: 'BASE_RECIPE',
      },
    };
    const resolveSelection = vi.fn(
      async ({
        entity,
        context,
      }: Parameters<
        typeof resolveProductBehaviorForSelection
      >[0]): Promise<ServerResolvedProductBehavior> => ({
        ...staleCurrent,
        schemaVersion: 1,
        resolverVersion: 'global-main-capability-v1',
        entityKind: entity.entityKind,
        catalogStatus: 'verified',
        provenance: 'customer_added_admin_canonicalization_v1',
        mapperIngredientId: null,
        familyId: 'chocolate_cocoa',
        subfamilyId: null,
        formId: 'cocoa_powder',
        behaviorRole: 'MAIN_ALLOWED',
        mainEligibility: 'MAIN_BLOCKED_POLICY',
        veganEligibility: 'verified',
        proteinBehavior: 'neutral',
        processBehavior: {},
        approvedLiquidDairyCarrier: false,
        context: { ...context },
        module: context.module,
        state: 'eligible',
        moduleEligibility: {
          BASE_RECIPE: 'eligible',
          OPTIMAL: 'eligible',
          SAVE: 'eligible',
          PRODUCTION: 'eligible',
          MAIN: 'eligible',
        },
        mainPolicy: null,
        warnings: [],
        blockReasons: ['profile_main_policy_missing', 'main_user_held_no_calibration'],
      }),
    );

    const standard = await resolveRecipeProposalBehaviorSnapshots({
      recipe: cacaoRecipe,
      snapshots: { [cacaoLineId]: staleCurrent },
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
    });

    expect(standard.unresolvedLineIds).toEqual([]);
    expect(resolveSelection).toHaveBeenLastCalledWith({
      entity: { entityKind: 'catalog_product_version', entityId: productVersionId },
      context: expect.objectContaining({ requestedRole: 'STANDARD', module: 'OPTIMAL' }),
    });
    expect(standard.snapshots[cacaoLineId]).toMatchObject({
      productId,
      productVersionId,
      behaviorBindingId,
      resolutionState: 'RESOLVED',
      resolutionContext: { requestedRole: 'STANDARD', module: 'OPTIMAL' },
      mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
      mainAuthority: 'USER_HELD',
    });

    const crownRecipe: RecipeInput = {
      ...cacaoRecipe,
      items: cacaoRecipe.items.map((item) => ({ ...item, lock_type: 'main' })),
    };
    const crown = await resolveRecipeProposalBehaviorSnapshots({
      recipe: crownRecipe,
      snapshots: standard.snapshots,
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
    });

    expect(crown.unresolvedLineIds).toEqual([]);
    expect(resolveSelection).toHaveBeenCalledTimes(2);
    expect(resolveSelection).toHaveBeenLastCalledWith({
      entity: { entityKind: 'catalog_product_version', entityId: productVersionId },
      context: expect.objectContaining({ requestedRole: 'MAIN', module: 'OPTIMAL' }),
    });
    expect(crown.snapshots[cacaoLineId]).toMatchObject({
      resolutionContext: { requestedRole: 'MAIN', module: 'OPTIMAL' },
      mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
      mainAuthority: 'USER_HELD',
      mainCalibrationLevel: 'NONE',
    });
  });

  it('revalidates historical identity for Recalculate without replacing frozen effective facts', async () => {
    const historicalRecipe: RecipeInput = {
      ...recipe,
      items: [
        {
          ...recipe.items[1]!,
          id: 'cacao-line',
          ingredient: {
            ...recipe.items[1]!.ingredient,
            id: 'CA-ING-007141',
            canonical_ingredient_id: 'CA-ING-007141',
            private_product_id:
              'catalog:55bd0ed2-2d13-4c6b-9020-5c563188f1ef:version:2b000db4-7e18-4b74-936d-8ca991beecb9',
            name: 'Cacao Puro',
          },
          planned_grams: 1000,
        },
      ],
    };
    const frozen: ProductBehaviorSnapshot = {
      ...snapshot('cacao-line', 'PI-ING-001313'),
      source: 'manual',
      mapperIngredientId: null,
      technicalAuthority: 'none',
      productId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
      productVersionId: '2b000db4-7e18-4b74-936d-8ca991beecb9',
      behaviorBindingId: '6f1a7e48-2725-4d73-90c1-8a00e8a9d8c6',
      factsFingerprint: 'frozen-cacao-facts',
      resolutionContext: {
        accountId: 'account-1',
        productProfile: 'milk_gelato',
        temperatureC: -12,
        mode: 'optimal',
        processScope: 'BASE_FORMULATION',
        requestedRole: 'STANDARD',
        module: 'BASE_RECIPE',
      },
      historicalIdentity: {
        schemaVersion: 1,
        sourceRecipeId: 'd7246dcf-50e1-4e57-80e3-4facbfcf6e1c',
        sourceRecipeVersionId: '374bd44b-901c-46ce-9e8d-57c4a5b49704',
        sourceProductId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
        sourceProductVersionId: '2b000db4-7e18-4b74-936d-8ca991beecb9',
        sourceBehaviorBindingId: '6f1a7e48-2725-4d73-90c1-8a00e8a9d8c6',
        canonicalProductId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
        canonicalProductVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
        canonicalBehaviorBindingId: '639f48f5-9d1c-4948-86a0-02ed20205203',
        canonicalProductCode: 'PR-ING-007142',
        resolutionKind: 'VERSION_SUCCESSOR',
      },
    };
    const frozenFacts = structuredClone(frozen.sharedFacts);
    const currentSuccessor: ServerResolvedProductBehavior = {
      ...frozen,
      resolverVersion: 'unified-product-behavior-v2',
      entityKind: 'catalog_product_version',
      catalogStatus: 'verified',
      provenance: 'customer_added_admin_canonicalization_v1',
      state: 'eligible',
      module: 'OPTIMAL',
      context: { ...frozen.resolutionContext, module: 'OPTIMAL' },
      productVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
      behaviorBindingId: '639f48f5-9d1c-4948-86a0-02ed20205203',
      factsFingerprint: 'new-facts-must-not-enter-history',
      sharedFacts: {
        ...frozen.sharedFacts!,
        technicalComposition: { ...frozen.sharedFacts!.technicalComposition!, fat: 99 },
      },
      mainEligibility: 'MAIN_BLOCKED_POLICY',
      veganEligibility: 'verified',
      proteinBehavior: 'neutral',
      processBehavior: {},
      mainPolicy: null,
      canonicalProductCode: 'PR-ING-007142',
      historicalResolutionKind: 'VERSION_SUCCESSOR',
    };
    const resolveLegacySelection = vi.fn(
      async ({ context }: Parameters<typeof resolveLegacyRecipeBehaviorForSelection>[0]) => ({
        ...currentSuccessor,
        context: { ...context },
      }),
    );
    const resolveSelection = vi.fn();

    const result = await resolveRecipeProposalBehaviorSnapshots({
      recipe: historicalRecipe,
      snapshots: { 'cacao-line': frozen },
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
      resolveLegacySelection,
    });

    expect(result.unresolvedLineIds).toEqual([]);
    expect(resolveSelection).not.toHaveBeenCalled();
    expect(resolveLegacySelection).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.objectContaining({
          productVersionId: '2b000db4-7e18-4b74-936d-8ca991beecb9',
          sourceRecipeVersionId: '374bd44b-901c-46ce-9e8d-57c4a5b49704',
        }),
        context: expect.objectContaining({ module: 'OPTIMAL' }),
      }),
    );
    expect(result.snapshots['cacao-line']).toMatchObject({
      productVersionId: '2b000db4-7e18-4b74-936d-8ca991beecb9',
      factsFingerprint: 'frozen-cacao-facts',
      resolutionContext: { module: 'OPTIMAL' },
      historicalIdentity: {
        canonicalProductCode: 'PR-ING-007142',
        canonicalProductVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
      },
    });
    expect(result.snapshots['cacao-line']?.sharedFacts).toEqual(frozenFacts);

    const crownResult = await resolveRecipeProposalBehaviorSnapshots({
      recipe: {
        ...historicalRecipe,
        items: historicalRecipe.items.map((item) => ({ ...item, lock_type: 'main' })),
      },
      snapshots: { 'cacao-line': frozen },
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
      resolveLegacySelection,
    });

    expect(crownResult.unresolvedLineIds).toEqual([]);
    expect(resolveSelection).not.toHaveBeenCalled();
    expect(resolveLegacySelection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reference: expect.objectContaining({
          productVersionId: '2b000db4-7e18-4b74-936d-8ca991beecb9',
        }),
        context: expect.objectContaining({ requestedRole: 'MAIN', module: 'OPTIMAL' }),
      }),
    );
    expect(crownResult.snapshots['cacao-line']).toMatchObject({
      productVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
      behaviorBindingId: '639f48f5-9d1c-4948-86a0-02ed20205203',
      factsFingerprint: 'new-facts-must-not-enter-history',
      resolutionContext: { requestedRole: 'MAIN', module: 'OPTIMAL' },
    });
    expect(crownResult.snapshots['cacao-line']).not.toHaveProperty('historicalIdentity');
    expect(crownResult.snapshots['cacao-line']?.sharedFacts?.technicalComposition?.fat).toBe(99);
  });

  it.each(['gelato', 'sorbet', 'vegan', 'protein'] as const)(
    'hydrates every fresh %s native-starter line against the current Base context',
    async (visibleProductType) => {
      const starter = buildCanonicalNewRecipeStarter({
        visibleProductType,
        servingModeId: 'fresh',
      });
      const native: RecipeInput = {
        items: starter.items,
        mode: 'classic',
        category: starter.category,
        target_temperature_c: starter.targetTemperatureC,
        target_batch_grams: starter.targetBatchGrams,
        machine_capacity_grams: null,
        goals: { formulation_strategy: starter.formulationStrategy },
      };
      const resolveSelection = vi.fn().mockImplementation(async ({ entity, context }) => ({
        ...snapshot(entity.entityId, entity.entityId),
        state: 'eligible',
        entityKind: entity.entityKind,
        entityId: entity.entityId,
        module: context.module,
        context,
      }));

      const result = await resolveRecipeProposalBehaviorSnapshots({
        recipe: native,
        snapshots: {},
        accountId: 'new-working-recipe-account',
        module: 'OPTIMAL',
        resolveSelection,
      });

      expect(result.unresolvedLineIds).toEqual([]);
      expect(resolveSelection).toHaveBeenCalledTimes(native.items.length);
      expect(Object.keys(result.snapshots).sort()).toEqual(
        native.items.map((item) => item.id).sort(),
      );
      for (const item of native.items) {
        expect(result.snapshots[item.id]).toMatchObject({
          lineId: item.id,
          mapperIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          processScope: 'BASE_FORMULATION',
          resolutionContext: {
            accountId: 'new-working-recipe-account',
            productProfile: native.category,
            processScope: 'BASE_FORMULATION',
            module: 'OPTIMAL',
          },
        });
      }
    },
  );

  it('refreshes stale POST_PROCESS scope when Vegan formulation promotes Coconut Oil into the Base', async () => {
    const addedLineId = 'formulation-PI-ING-000163';
    const proposed: RecipeInput = {
      ...recipe,
      category: 'vegan_gelato',
      items: [
        {
          ...recipe.items[1]!,
          id: addedLineId,
          ingredient: {
            ...recipe.items[1]!.ingredient,
            id: 'PI-ING-000163',
            canonical_ingredient_id: 'PI-ING-000163',
            name: 'REFINED COCONUT OIL · Elstar Fats Coconut · Dry',
          },
          planned_grams: 112,
        },
      ],
    };
    const context = {
      accountId: 'account-1',
      productProfile: 'vegan_gelato' as const,
      temperatureC: -12,
      mode: 'optimal' as const,
      processScope: 'BASE_FORMULATION' as const,
      requestedRole: 'STANDARD' as const,
      module: 'OPTIMAL' as const,
    };
    // Historical CROSS failure: the context was Base-current but the durable
    // snapshot still carried the former topping scope. The database correctly
    // refused Save for this exact formulation line id.
    const staleScope: ProductBehaviorSnapshot = {
      ...snapshot(addedLineId, 'PI-ING-000163'),
      processScope: 'POST_PROCESS_ADDON',
      resolutionContext: context,
    };
    const resolveSelection = vi.fn().mockResolvedValue({
      ...snapshot(addedLineId, 'PI-ING-000163'),
      state: 'eligible',
      entityKind: 'mapper',
      entityId: 'PI-ING-000163',
      module: 'OPTIMAL',
      context,
    });

    const result = await resolveRecipeProposalBehaviorSnapshots({
      recipe: proposed,
      snapshots: { [addedLineId]: staleScope },
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
    });

    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(result.unresolvedLineIds).toEqual([]);
    expect(result.snapshots[addedLineId]).toMatchObject({
      lineId: addedLineId,
      mapperIngredientId: 'PI-ING-000163',
      processScope: 'BASE_FORMULATION',
      resolutionContext: { processScope: 'BASE_FORMULATION', module: 'OPTIMAL' },
    });
  });

  it('revalidates the complete 8-run Vegan Apply→Save F11 matrix as Base formulation authority', async () => {
    const historicalRuns = [
      ['classic-raspberry', 'optimal', ['PI-ING-000163']],
      ['classic-raspberry', 'eco', ['PI-ING-000163']],
      ['classic-guava-sorbet', 'optimal', ['PI-ING-000163']],
      ['classic-guava-sorbet', 'eco', ['PI-ING-000163']],
      ['classic-mango', 'optimal', ['PI-ING-001565', 'PI-ING-000163']],
      ['classic-mango', 'eco', ['PI-ING-001565', 'PI-ING-000163']],
      ['cocktail-whisky-sour', 'optimal', ['PI-ING-001565', 'PI-ING-000163']],
      ['cocktail-whisky-sour', 'eco', ['PI-ING-001565', 'PI-ING-000163']],
    ] as const;

    for (const [recipeId, mode, canonicalIds] of historicalRuns) {
      const module: 'ECO' | 'OPTIMAL' = mode === 'eco' ? 'ECO' : 'OPTIMAL';
      const items = canonicalIds.map((canonicalId, index) => ({
        ...recipe.items[1]!,
        id: `formulation-${canonicalId}`,
        ingredient: {
          ...recipe.items[1]!.ingredient,
          id: canonicalId,
          canonical_ingredient_id: canonicalId,
        },
        planned_grams: index === 0 ? 98 : 116,
      }));
      const proposed: RecipeInput = {
        ...recipe,
        category: 'vegan_gelato',
        goals: { formulation_strategy: mode },
        items,
      };
      const snapshots = Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            ...snapshot(item.id, item.ingredient.canonical_ingredient_id!),
            processScope: 'POST_PROCESS_ADDON' as const,
            resolutionContext: {
              accountId: 'account-1',
              productProfile: 'vegan_gelato' as const,
              temperatureC: -12,
              mode,
              processScope: 'BASE_FORMULATION' as const,
              requestedRole: 'STANDARD' as const,
              module,
            },
          },
        ]),
      );
      const resolveSelection = vi.fn().mockImplementation(async ({ entity, context }) => ({
        ...snapshot(`formulation-${entity.entityId}`, entity.entityId),
        state: 'eligible',
        entityKind: 'mapper',
        entityId: entity.entityId,
        module: context.module,
        context,
      }));

      const result = await resolveRecipeProposalBehaviorSnapshots({
        recipe: proposed,
        snapshots,
        accountId: 'account-1',
        module,
        resolveSelection,
      });

      expect(result.unresolvedLineIds, `${recipeId}/${mode}`).toEqual([]);
      expect(resolveSelection, `${recipeId}/${mode}`).toHaveBeenCalledTimes(canonicalIds.length);
      for (const item of items) {
        expect(result.snapshots[item.id], `${recipeId}/${mode}/${item.id}`).toMatchObject({
          lineId: item.id,
          mapperIngredientId: item.ingredient.canonical_ingredient_id,
          processScope: 'BASE_FORMULATION',
          resolutionContext: { processScope: 'BASE_FORMULATION', module },
        });
      }
    }
  });

  it('fails closed and creates no synthetic authority when a solver-added line cannot resolve', async () => {
    const addedLineId = 'correction-inulin-0';
    const proposed: RecipeInput = {
      ...recipe,
      items: [
        {
          ...recipe.items[1]!,
          id: addedLineId,
          ingredient: {
            ...recipe.items[1]!.ingredient,
            id: 'inulin',
            canonical_ingredient_id: 'PI-ING-000456',
          },
        },
      ],
    };
    const resolveSelection = vi.fn().mockResolvedValue(null);

    const result = await resolveRecipeProposalBehaviorSnapshots({
      recipe: proposed,
      snapshots: {},
      accountId: 'account-1',
      module: 'OPTIMAL',
      resolveSelection,
    });

    expect(result).toEqual({ snapshots: {}, unresolvedLineIds: [addedLineId] });
    expect(resolveSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: { entityKind: 'mapper', entityId: 'PI-ING-000456' },
      }),
    );
  });

  it('refreshes a positive Mapper topping as TOPPING after an ECO switch and ignores a zero topping', async () => {
    const basil = topping('basil-line', 'PI-ING-001654', 1);
    const strawberry = topping('strawberry-line', 'PI-ING-001553', 0);
    const resolveSelection = vi.fn().mockImplementation(async ({ entity, context }) => ({
      ...snapshot('basil-line', entity.entityId),
      schemaVersion: 1,
      resolverVersion: 'unified-product-behavior-v2',
      entityKind: entity.entityKind,
      entityId: entity.entityId,
      catalogStatus: 'pi_base',
      provenance: 'mapper',
      processBehavior: {},
      privateOverlay: null,
      context,
      module: context.module,
      state: 'eligible',
      moduleEligibility: {
        TOPPING: 'eligible',
        SAVE: 'label_only',
        PRODUCTION: 'label_only',
      },
      mainPolicy: null,
    }));

    const result = await resolveRecipeProposalBehaviorSnapshots({
      recipe: {
        ...recipe,
        items: [],
        goals: { formulation_strategy: 'eco' },
      },
      toppings: [basil, strawberry],
      snapshots: {
        'basil-line': staleToppingSnapshot('basil-line', 'PI-ING-001654'),
        'strawberry-line': staleToppingSnapshot('strawberry-line', 'PI-ING-001553'),
      },
      accountId: 'account-1',
      module: 'ECO',
      resolveSelection,
    });

    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(resolveSelection).toHaveBeenCalledWith({
      entity: { entityKind: 'mapper', entityId: 'PI-ING-001654' },
      context: {
        accountId: 'account-1',
        productProfile: 'milk_gelato',
        temperatureC: -12,
        mode: 'eco',
        processScope: 'POST_PROCESS_ADDON',
        requestedRole: 'STANDARD',
        module: 'TOPPING',
      },
    });
    expect(result.unresolvedLineIds).toEqual([]);
    expect(result.snapshots['basil-line']).toMatchObject({
      resolutionState: 'RESOLVED',
      processScope: 'POST_PROCESS_ADDON',
      resolutionContext: { mode: 'eco', module: 'TOPPING' },
    });
    expect(result.snapshots['strawberry-line']?.resolutionState).toBe('REVALIDATION_REQUIRED');
  });

  it('fails closed when a positive topping cannot refresh', async () => {
    const basil = topping('basil-line', 'PI-ING-001654', 1);
    const resolveSelection = vi.fn().mockResolvedValue(null);

    const result = await resolveRecipeProposalBehaviorSnapshots({
      recipe: { ...recipe, items: [], goals: { formulation_strategy: 'eco' } },
      toppings: [basil],
      snapshots: {
        'basil-line': staleToppingSnapshot('basil-line', 'PI-ING-001654'),
      },
      accountId: 'account-1',
      module: 'ECO',
      resolveSelection,
    });

    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(result.unresolvedLineIds).toEqual(['basil-line']);
    expect(result.snapshots['basil-line']?.resolutionState).toBe('REVALIDATION_REQUIRED');
  });

  it('pins every terminal Pro runtime surface to the server-validation wrapper', () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
    const studio = read('src/features/constraint-studio/constraintStudioStore.ts');
    const pro = read('src/pages/pro/ProWorkspacePage.tsx');
    const section = read('src/features/constraint-studio/ui/ConstraintStudioSection.tsx');
    const save = read('src/features/recipes/useCanonicalRecipeSave.ts');
    const production = read('src/features/production-workspace/useProductionWorkspace.ts');
    const productionRescueAuthorization = read(
      'supabase/migrations/20260819024500_production_rescue_authorization.sql',
    );
    expect(pro).toContain('runPiRecalculationWithTerminal');
    expect(studio).toContain('createOptimizePreviewWithServerAuthority');
    expect(studio).toContain('createExplicitStandardRemovalPreviewWithServerAuthority');
    expect(studio).toContain('.createExplicitStandardRemovalPreview(lineId, proposedSnapshots)');
    expect(read('src/features/pro-core/ProRecalcPanel.tsx')).toContain(
      'createExplicitStandardRemovalPreviewWithServerAuthority(lineId)',
    );
    expect(section).toContain('applyPreviewWithServerAuthority');
    expect(studio).toContain("? 'ECO'");
    expect(studio).toContain(": 'OPTIMAL'");
    expect(save).toContain("module: 'SAVE'");
    expect(production).toContain("module: 'PRODUCTION'");
    expect(productionRescueAuthorization).toContain("'BATCH_RESCUE'");
    expect(studio.indexOf('markRecalculationRequired()')).toBeLessThan(
      studio.indexOf('await currentRecipeAuthorityReady'),
    );
    expect(studio).toContain('recipe_changed_during_validation:');
    expect(studio).toContain('Uruchom przeliczenie ponownie dla bieżącej receptury');
    expect(studio).toContain('catalog_version_identity_mismatch:');
    expect(studio).toContain('mapper_entity_identity_mismatch:');
  });
});
