import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, detectViolations } from '@/engine';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ExecutableRecipeTemplate } from '@/data/recipes/executableRecipeLibrary';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import type { ServerResolvedProductBehavior } from '@/features/product-intelligence';
import { parseCsv } from '@/lib/csv';
import { useRecipeStore } from '@/stores/recipeStore';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  ExecutableRecipeHandoffError,
  materializeExecutableRecipeDefinition,
  materializeExecutableRecipeTemplate,
  openExecutableRecipeTemplate,
} from './executableRecipeHandoff';

const grid = parseCsv(readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
));
const header = grid[0]!;
const mapperRows = new Map(grid.slice(1).map((cells) => {
  const row = Object.fromEntries(header.map((column, index) => {
    const raw = cells[index] ?? '';
    if (raw === '') return [column, null];
    if (raw.toLowerCase() === 'true') return [column, true];
    if (raw.toLowerCase() === 'false') return [column, false];
    const number = Number(raw);
    return [column, Number.isFinite(number) ? number : raw];
  })) as unknown as IngredientRow;
  return [row.ingredient_id, row] as const;
}));

const eligible = (entityId: string, scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON'):
ServerResolvedProductBehavior => ({
  schemaVersion: 1,
  resolverVersion: 'test-resolver-v1',
  entityKind: 'mapper',
  productId: `product-${entityId}`,
  productVersionId: `version-${entityId}`,
  factsFingerprint: `facts-${entityId}`,
  catalogStatus: 'pi_base',
  provenance: 'mapper',
  behaviorBindingId: `binding-${entityId}`,
  behaviorBindingVersion: 'binding-v1',
  taxonomyVersion: 'taxonomy-v1',
  mapperIngredientId: entityId,
  familyId: 'standard',
  subfamilyId: null,
  formId: null,
  mainEligibility: 'NOT_MAIN',
  veganEligibility: 'unknown',
  proteinBehavior: 'neutral',
  processBehavior: { decision: scope === 'BASE_FORMULATION' ? 'HEAT_PROCESS' : 'POST_PROCESS' },
  approvedLiquidDairyCarrier: true,
  context: {
    accountId: 'owner-a', productProfile: 'milk_gelato', temperatureC: -11,
    mode: 'optimal', processScope: scope, requestedRole: 'STANDARD',
    module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
  },
  module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
  state: 'eligible',
  moduleEligibility: {
    BASE_RECIPE: 'eligible', TOPPING: 'eligible', SAVE: 'eligible', PRODUCTION: 'eligible',
    NUTRITION: 'eligible', ALLERGENS: 'eligible', PROCESS: 'eligible',
  },
  mainPolicy: null,
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: {
      water: 0, totalSolids: 100, fat: 0, protein: 0, carbohydrate: 0, sugars: 0,
      sucrose: 0, glucose: 0, dextrose: 0, fructose: 0, lactose: 0, polyols: 0,
      fibre: 0, salt: 0, alcohol: 0, energyKcal: 0, podValue: 0, pacValue: 0,
    },
    nutritionPer100g: {
      basis: 'per_100g', energyKcal: 100, fat: 1, saturatedFat: 0, carbohydrate: 20,
      sugars: 10, protein: 2, salt: 0.1, fibre: 1,
    },
    allergens: {
      ingredientsText: 'Test', allergensText: 'milk', declared: ['milk'],
      mayContain: [], evidenceVersion: 'test-allergens-v1',
    },
    processEvidence: [{
      decision: scope === 'BASE_FORMULATION'
        ? 'heat_required_for_function'
        : 'cold_process_approved',
      reasonType: 'process_requirement',
      affectedIngredientIds: [entityId],
      explanation: 'Synthetic exact process evidence.',
      source: {
        id: `process-${entityId}`, label: 'Synthetic verified process',
        reference: `process-ref-${entityId}`, verificationStatus: 'verified',
      },
    }],
    profileEligibility: ['milk_gelato'],
    veganEligibility: 'unknown',
    proteinBehavior: 'neutral',
    referencePrice: { pricePerKg: 2, currency: 'EUR', sourceVersion: 'mapper-v1' },
  },
  privateOverlay: entityId === 'PI-ING-000236'
    ? {
        favorite: true, recentAt: null, privatePricePerKg: 1.25,
        privatePriceCurrency: 'EUR', supplier: null, note: null, stock: null,
      }
    : null,
  warnings: [],
  blockReasons: [],
});

describe('executable Recipe Library handoff', () => {
  beforeEach(() => {
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
  });

  it('fails before product resolution when the exact Starter Pack powder/dose is blocked', async () => {
    const getIngredient = vi.fn();
    const resolveBehavior = vi.fn();
    await expect(materializeExecutableRecipeTemplate(
      'lost-pl-smietankowe-z-zoltkami-v1',
      'owner-a',
      { getIngredient, resolveBehavior },
    )).rejects.toMatchObject({ code: 'template_blocked' });
    expect(getIngredient).not.toHaveBeenCalled();
    expect(resolveBehavior).not.toHaveBeenCalled();
  });

  it('never destroys the current working recipe when a blocked library template is opened', async () => {
    const before = structuredClone(useRecipeStore.getState().items);
    useConstraintStudioStore.setState({ proCoreRecipeId: 'keep-me', lastSavedVersion: 7 });

    await expect(openExecutableRecipeTemplate(
      'lost-pl-smietankowe-z-zoltkami-v1',
      'owner-a',
      { authorizeOwnerReview: async () => true, hasUnsavedChanges: () => false },
    ))
      .rejects.toBeInstanceOf(ExecutableRecipeHandoffError);

    expect(useRecipeStore.getState().items).toEqual(before);
    expect(useConstraintStudioStore.getState().proCoreRecipeId).toBe('keep-me');
    expect(useConstraintStudioStore.getState().lastSavedVersion).toBe(7);
  });

  it('rejects a direct template handoff without active owner/admin authorization', async () => {
    await expect(openExecutableRecipeTemplate(
      'fantasy-rocero-v1',
      'ordinary-pro',
      { authorizeOwnerReview: async () => false, hasUnsavedChanges: () => false },
    )).rejects.toMatchObject({ code: 'owner_review_forbidden' });
  });

  it('rejects direct handoff over an unsaved draft until the user confirms replacement', async () => {
    await expect(openExecutableRecipeTemplate(
      'fantasy-rocero-v1',
      'owner-a',
      { authorizeOwnerReview: async () => true, hasUnsavedChanges: () => true },
    )).rejects.toMatchObject({ code: 'unsaved_changes' });
  });

  it('materializes exact Base for Owner Review without granting Production/Label or silently loading Toppings', async () => {
    const editable = (await import('@/data/recipes/executableRecipeLibrary'))
      .executableRecipeTemplateById('fantasy-rocero-v1')!;
    const definition: ExecutableRecipeTemplate = {
      ...editable,
      toppings: [{
        lineId: 'synthetic-topping', mapperIngredientId: 'PI-ING-000514',
        requiredProductForm: null, grams: 10, ownerSeedGrams: 10, role: 'standard',
        processScope: 'POST_PROCESS_ADDON', note: 'Synthetic contract topping',
      }],
    };
    const materialized = await materializeExecutableRecipeDefinition(definition, 'owner-a', {
      getIngredient: async (id) => mapperRows.get(id) ?? null,
      resolveBehavior: async ({ entity, context }) => eligible(entity.entityId, context.processScope),
    });

    expect(materialized.input.items).toHaveLength(definition.base.length);
    expect(materialized.input.items).not.toContainEqual(expect.objectContaining({ id: 'synthetic-topping' }));
    expect(materialized.composition.toppings).toHaveLength(0);
    expect(materialized.omittedOwnerReviewToppingLineIds).toEqual(['synthetic-topping']);
    expect(materialized.composition.ownerReviewGate).toEqual({
      status: 'OWNER_REVIEW_EDITABLE',
      productionStatus: 'PRODUCTION_BLOCKED',
      labelStatus: 'LABEL_BLOCKED',
      omittedToppingLineIds: ['synthetic-topping'],
    });
    const snapshots = materialized.composition.behaviorSnapshots;
    expect(snapshots).toBeDefined();
    expect(Object.keys(snapshots!)).toHaveLength(definition.base.length);
    expect(materialized.input.items[0]?.ingredient).toMatchObject({
      cost_per_kg: 1.25, cost_currency: 'EUR', cost_source: 'private',
    });
    expect(snapshots!['synthetic-topping']).toBeUndefined();
    const mainLine = definition.base.find((line) => line.role === 'main')!;
    expect(snapshots![mainLine.lineId]?.moduleEligibility.MAIN).toBe('blocked');
    expect(Object.values(snapshots!).every((snapshot) => (
      snapshot.moduleEligibility.PRODUCTION === 'blocked' &&
      snapshot.moduleEligibility.LABEL === 'blocked' &&
      snapshot.moduleEligibility.MASTER_LABEL === 'blocked' &&
      snapshot.blockReasons.includes('owner_review_production_label_gate')
    ))).toBe(true);
    expect(materialized.template.productionStatus).toBe('PRODUCTION_BLOCKED');
    expect(materialized.template.labelStatus).toBe('LABEL_BLOCKED');
    expect(detectViolations(calculateRecipe(materialized.input))).toEqual([]);

    useRecipeStore.getState().loadRecipeInput(materialized.input, {
      composition: materialized.composition,
    });
    const refreshed = Object.fromEntries(Object.entries(
      useRecipeStore.getState().productBehaviorSnapshots,
    ).map(([lineId, snapshot]) => [lineId, {
      ...snapshot,
      moduleEligibility: {
        ...snapshot.moduleEligibility,
        PRODUCTION: 'eligible' as const,
        PROCESS: 'eligible' as const,
        LABEL: 'eligible' as const,
        MASTER_LABEL: 'eligible' as const,
        EXPORT: 'eligible' as const,
      },
      warnings: [],
      blockReasons: [],
    }]));
    useRecipeStore.getState().syncProductBehaviorSnapshots(refreshed);
    expect(Object.values(useRecipeStore.getState().productBehaviorSnapshots).every(
      (snapshot) => snapshot.moduleEligibility.PRODUCTION === 'blocked' &&
        snapshot.moduleEligibility.LABEL === 'blocked' &&
        snapshot.warnings.includes('owner_review_only') &&
        snapshot.blockReasons.includes('owner_review_production_label_gate'),
    )).toBe(true);

    const persisted = recipeCompositionFromState(useRecipeStore.getState());
    expect(persisted.ownerReviewGate?.omittedToppingLineIds).toEqual(['synthetic-topping']);
    useRecipeStore.getState().resetToDemo();
    useRecipeStore.getState().loadRecipeInput(materialized.input, { composition: persisted });
    expect(useRecipeStore.getState().ownerReviewGate).toEqual(persisted.ownerReviewGate);
    expect(Object.values(useRecipeStore.getState().productBehaviorSnapshots).every(
      (snapshot) => snapshot.moduleEligibility.PRODUCTION === 'blocked' &&
        snapshot.warnings.includes('owner_review_only'),
    )).toBe(true);
  });

  it('fails closed when a raw Mapper row has incomplete Base composition', async () => {
    const definition = (await import('@/data/recipes/executableRecipeLibrary'))
      .executableRecipeTemplateById('fantasy-rocero-v1')!;
    const firstId = definition.base[0]!.mapperIngredientId!;

    await expect(materializeExecutableRecipeDefinition(definition, 'owner-a', {
      getIngredient: async (id) => {
        const row = mapperRows.get(id) ?? null;
        return id === firstId && row ? { ...row, water_percent: null } : row;
      },
      resolveBehavior: async ({ entity, context }) => eligible(entity.entityId, context.processScope),
    })).rejects.toMatchObject({ code: 'behavior_blocked' });
  });

  it('keeps missing process/allergen facts fail-closed in snapshots while Owner Review Base opens', async () => {
    const definition = (await import('@/data/recipes/executableRecipeLibrary'))
      .executableRecipeTemplateById('fantasy-rocero-v1')!;
    const materialized = await materializeExecutableRecipeDefinition(definition, 'owner-a', {
      getIngredient: async (id) => mapperRows.get(id) ?? null,
      resolveBehavior: async ({ entity, context }) => {
        const resolved = eligible(entity.entityId, context.processScope);
        return {
          ...resolved,
          moduleEligibility: {
            ...resolved.moduleEligibility,
            PRODUCTION: 'blocked', PROCESS: 'blocked', ALLERGENS: 'blocked',
          },
          sharedFacts: {
            ...resolved.sharedFacts!,
            allergens: null,
            processEvidence: [],
          },
          warnings: ['production_data_incomplete'],
          blockReasons: ['process_and_allergens_missing'],
        };
      },
    });

    expect(Object.values(materialized.composition.behaviorSnapshots ?? {}).every(
      (snapshot) => snapshot.moduleEligibility.PRODUCTION === 'blocked' &&
        snapshot.moduleEligibility.PROCESS === 'blocked' &&
        snapshot.moduleEligibility.ALLERGENS === 'blocked' &&
        snapshot.moduleEligibility.LABEL === 'blocked' &&
        snapshot.moduleEligibility.MASTER_LABEL === 'blocked',
    )).toBe(true);
    expect(materialized.template.productionStatus).toBe('PRODUCTION_BLOCKED');
    expect(materialized.template.labelStatus).toBe('LABEL_BLOCKED');
    expect(detectViolations(calculateRecipe(materialized.input))).toEqual([]);
  });
});
