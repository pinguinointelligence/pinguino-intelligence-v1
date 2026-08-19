import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineIngredient, RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: h.rpc },
  isSupabaseConfigured: true,
}));

import {
  buildRecipeBehaviorServerValidationGroups,
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

describe('recipe behavior server validation', () => {
  beforeEach(() => h.rpc.mockReset());

  it('validates Main and Standard as one technical Base group without sensory policy', () => {
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
    expect(built.groups).toHaveLength(1);
    expect(built.groups[0]?.context.requestedRole).toBe('STANDARD');
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
    ).resolves.toMatchObject({ ready: true, lines: [] });
    expect(h.rpc).not.toHaveBeenCalled();
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
      studio.indexOf('await currentBaseAuthorityReady'),
    );
    expect(studio).toContain('recipe_changed_during_validation:');
    expect(studio).toContain('Uruchom przeliczenie ponownie dla bieżącej receptury.');
    expect(studio).toContain('catalog_version_identity_mismatch:');
    expect(studio).toContain('mapper_entity_identity_mismatch:');
  });
});
