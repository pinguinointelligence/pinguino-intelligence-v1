import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ExecutableRecipeTemplate } from '@/data/recipes/executableRecipeLibrary';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import type { ServerResolvedProductBehavior } from '@/features/product-intelligence';
import { parseCsv } from '@/lib/csv';
import { useRecipeStore } from '@/stores/recipeStore';
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
    technicalComposition: {},
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

  it('fails before product resolution when exact product/process data is blocked', async () => {
    const getIngredient = vi.fn();
    const resolveBehavior = vi.fn();
    await expect(materializeExecutableRecipeTemplate(
      'fantasy-rocero-v1',
      'owner-a',
      { getIngredient, resolveBehavior },
    )).rejects.toMatchObject({ code: 'template_blocked' });
    expect(getIngredient).not.toHaveBeenCalled();
    expect(resolveBehavior).not.toHaveBeenCalled();
  });

  it('never destroys the current working recipe when a blocked library template is opened', async () => {
    const before = structuredClone(useRecipeStore.getState().items);
    useConstraintStudioStore.setState({ proCoreRecipeId: 'keep-me', lastSavedVersion: 7 });

    await expect(openExecutableRecipeTemplate('lost-pl-smietankowe-z-zoltkami-v1', 'owner-a'))
      .rejects.toBeInstanceOf(ExecutableRecipeHandoffError);

    expect(useRecipeStore.getState().items).toEqual(before);
    expect(useConstraintStudioStore.getState().proCoreRecipeId).toBe('keep-me');
    expect(useConstraintStudioStore.getState().lastSavedVersion).toBe(7);
  });

  it('materializes a synthetic eligible definition with exact snapshots, private price and Topping separation', async () => {
    const blocked = (await import('@/data/recipes/executableRecipeLibrary'))
      .executableRecipeTemplateById('lost-pl-smietankowe-z-zoltkami-v1')!;
    const definition: ExecutableRecipeTemplate = {
      ...blocked,
      status: 'EXECUTABLE_OWNER_REVIEW',
      blockers: [],
      processId: 'test-heated-process-v1',
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
    expect(materialized.composition.toppings).toHaveLength(1);
    const snapshots = materialized.composition.behaviorSnapshots;
    expect(snapshots).toBeDefined();
    expect(Object.keys(snapshots!)).toHaveLength(
      definition.base.length + 1,
    );
    expect(materialized.input.items[0]?.ingredient).toMatchObject({
      cost_per_kg: 1.25, cost_currency: 'EUR', cost_source: 'private',
    });
    expect(snapshots!['synthetic-topping']).toMatchObject({
      productVersionId: 'version-PI-ING-000514', processScope: 'POST_PROCESS_ADDON',
    });
  });

  it('fails closed when an executable definition has no exact process ID', async () => {
    const blocked = (await import('@/data/recipes/executableRecipeLibrary'))
      .executableRecipeTemplateById('lost-pl-smietankowe-z-zoltkami-v1')!;
    const definition: ExecutableRecipeTemplate = {
      ...blocked,
      status: 'EXECUTABLE_OWNER_REVIEW',
      blockers: [],
      processId: null,
    };
    const getIngredient = vi.fn();
    const resolveBehavior = vi.fn();

    await expect(materializeExecutableRecipeDefinition(definition, 'owner-a', {
      getIngredient,
      resolveBehavior,
    })).rejects.toMatchObject({ code: 'template_blocked' });
    expect(getIngredient).not.toHaveBeenCalled();
    expect(resolveBehavior).not.toHaveBeenCalled();
  });

  it('fails closed when exact nutrition, allergens or verified process evidence is missing', async () => {
    const blocked = (await import('@/data/recipes/executableRecipeLibrary'))
      .executableRecipeTemplateById('lost-pl-smietankowe-z-zoltkami-v1')!;
    const definition: ExecutableRecipeTemplate = {
      ...blocked,
      status: 'EXECUTABLE_OWNER_REVIEW',
      blockers: [],
      processId: 'test-heated-process-v1',
    };

    await expect(materializeExecutableRecipeDefinition(definition, 'owner-a', {
      getIngredient: async (id) => mapperRows.get(id) ?? null,
      resolveBehavior: async ({ entity, context }) => {
        const resolved = eligible(entity.entityId, context.processScope);
        return {
          ...resolved,
          sharedFacts: {
            ...resolved.sharedFacts!,
            nutritionPer100g: null,
            allergens: null,
            processEvidence: [],
          },
        };
      },
    })).rejects.toMatchObject({ code: 'behavior_blocked' });
  });
});
