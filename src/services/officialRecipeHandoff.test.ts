import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  OFFICIAL_RECIPES,
  officialRecipeById,
} from '@/data/recipes/official/officialRecipeLibrary';
import { officialRecipeReadiness } from '@/data/recipes/official/officialRecipeReadiness';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { ServerResolvedProductBehavior } from '@/features/product-intelligence';
import { parseCsv } from '@/lib/csv';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  materializeOfficialRecipe,
  openOfficialRecipe,
  type OfficialMaterializeDependencies,
} from './officialRecipeHandoff';

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const triState = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (triState.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const mapperRows = new Map(
  grid.slice(1).map((row) => {
    const parsed = Object.fromEntries(
      header.map((name, index) => [name, cell(row[index] ?? '', name)]),
    ) as unknown as IngredientRow;
    return [parsed.ingredient_id, parsed] as const;
  }),
);
/** Mirrors the runtime gate: only active, base-approved Mapper rows are served. */
const approvedRow = async (pi: string) => {
  const row = mapperRows.get(pi);
  return row && row.approved_for_base === true ? row : null;
};

const eligible = (
  entityKind: 'mapper' | 'catalog_product_version',
  entityId: string,
): ServerResolvedProductBehavior => ({
  schemaVersion: 1,
  resolverVersion: 'test-resolver-v1',
  entityKind,
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
  processBehavior: { decision: 'HEAT_PROCESS' },
  approvedLiquidDairyCarrier: true,
  context: {
    accountId: 'user-a',
    productProfile: 'milk_gelato',
    temperatureC: -11,
    mode: 'optimal',
    processScope: 'BASE_FORMULATION',
    requestedRole: 'STANDARD',
    module: 'BASE_RECIPE',
  },
  module: 'BASE_RECIPE',
  state: 'eligible',
  moduleEligibility: {
    BASE_RECIPE: 'eligible',
    TOPPING: 'eligible',
    SAVE: 'eligible',
    PRODUCTION: 'eligible',
    NUTRITION: 'eligible',
    ALLERGENS: 'eligible',
    PROCESS: 'eligible',
    MAIN: 'blocked',
    OPTIMAL: 'eligible',
    ECO: 'eligible',
  },
  mainPolicy: null,
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: {
      water: 0,
      totalSolids: 100,
      fat: 0,
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
    },
    nutritionPer100g: {
      basis: 'per_100g',
      energyKcal: 100,
      fat: 1,
      saturatedFat: 0,
      carbohydrate: 20,
      sugars: 10,
      protein: 2,
      salt: 0.1,
      fibre: 1,
    },
    allergens: {
      ingredientsText: 'Test',
      allergensText: 'milk',
      declared: ['milk'],
      mayContain: [],
      evidenceVersion: 'test-allergens-v1',
    },
    processEvidence: [],
    profileEligibility: ['milk_gelato'],
    veganEligibility: 'unknown',
    proteinBehavior: 'neutral',
    referencePrice: { pricePerKg: 2, currency: 'EUR', sourceVersion: 'mapper-v1' },
  },
  privateOverlay: null,
  warnings: [],
  blockReasons: [],
});

const laciate = {
  id: 'prod-laciate',
  entityKind: 'commercial_product',
  mappedIngredientId: 'PI-ING-000236',
  currentVersionId: 'version-laciate',
  displayName: 'Mleko płynne Łaciate 3,5%',
  brand: 'Łaciate',
  productCode: 'PR-ING-007172',
  status: 'manual_adjusted',
  publicData: {},
  usableInBase: true,
  usableAsTopping: false,
} as unknown as CatalogProductSearchHit;

const dependencies = (
  overrides: Partial<OfficialMaterializeDependencies> = {},
): OfficialMaterializeDependencies => ({
  getIngredient: vi.fn(approvedRow),
  resolveBehavior: vi.fn(async ({ entity }) => eligible(entity.entityKind, entity.entityId)),
  marketCountry: vi.fn(async () => 'PL'),
  resolveCountryProducts: vi.fn(async () => []),
  currentServingModeId: () => 'temp_minus_12',
  ...overrides,
});

describe('official recipe → working recipe handoff', () => {
  beforeEach(() => {
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
  });

  it('builds #001 on its canonical PIs with the exact source grams', async () => {
    const recipe = officialRecipeById('classic-dark-chocolate')!;
    const result = await materializeOfficialRecipe(
      'classic-dark-chocolate',
      'user-a',
      dependencies(),
    );
    expect(
      result.input.items.map((item) => [item.id, item.planned_grams, item.ingredient.id]),
    ).toEqual(
      recipe.lines.map((line) => [
        `classic-dark-chocolate-line-${line.line}`,
        line.grams,
        line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : null,
      ]),
    );
    expect(result.input.items.every((item) => item.lock_type === 'unlocked')).toBe(true);
    expect(result.input.items.map((item) => item.user_intent_anchor_grams)).toEqual(
      recipe.lines.map((line) => line.grams),
    );
    expect(result.input.target_batch_grams).toBe(1000);
    expect(result.input.target_temperature_c).toBe(-12);
    expect(result.input.category).toBe('chocolate_gelato');
    expect(result.country).toBe('PL');
    expect(result.countryResolution).toBe('resolved');
    expect(result.lines.every((line) => line.marketProduct === null)).toBe(true);
    expect(Object.keys(result.composition.behaviorSnapshots ?? {})).toHaveLength(9);
    expect(result.composition.ownerReviewGate).toBeUndefined();
  });

  it('never mutates the official source while building or editing the working copy', async () => {
    const before = structuredClone(officialRecipeById('classic-dark-chocolate'));
    const result = await materializeOfficialRecipe(
      'classic-dark-chocolate',
      'user-a',
      dependencies(),
    );
    result.input.items[0]!.planned_grams = 1;
    (result.recipe.lines[0] as { grams: number }).grams = 5;
    expect(officialRecipeById('classic-dark-chocolate')).toEqual(before);
  });

  it('uses the exact country product the existing resolver returns, keeping its identity', async () => {
    const resolveCountryProducts = vi.fn(async () => [
      {
        mapperIngredientId: 'PI-ING-000236',
        source: 'COUNTRY_PRIMARY_DEFAULT' as const,
        country: 'PL',
        product: laciate,
      },
    ]);
    const resolveBehavior = vi.fn(
      async ({
        entity,
      }: {
        entity: { entityKind: 'mapper' | 'catalog_product_version'; entityId: string };
      }) => eligible(entity.entityKind, entity.entityId),
    );
    const result = await materializeOfficialRecipe(
      'classic-dark-chocolate',
      'user-a',
      dependencies({ resolveCountryProducts, resolveBehavior }),
    );
    expect(resolveCountryProducts).toHaveBeenCalledWith({
      mapperIngredientIds: expect.arrayContaining(['PI-ING-000236', 'PI-ING-000180']),
      productCountry: 'PL',
      productProfile: 'chocolate_gelato',
    });
    const milk = result.input.items[0]!;
    expect(milk.planned_grams).toBe(490);
    expect(milk.ingredient).toMatchObject({
      id: 'catalog:prod-laciate',
      canonical_ingredient_id: 'PI-ING-000236',
      private_product_id: 'catalog:prod-laciate:version:version-laciate',
      identity_provenance: 'reference',
    });
    expect(result.lines[0]!.marketProduct).toMatchObject({
      productCode: 'PR-ING-007172',
      source: 'COUNTRY_PRIMARY_DEFAULT',
      country: 'PL',
      ownEngineProfile: false,
    });
    expect(resolveBehavior).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: { entityKind: 'catalog_product_version', entityId: 'version-laciate' },
      }),
    );
    // Every other line stays on its canonical PI: nothing similar is substituted.
    expect(result.lines.slice(1).every((line) => line.marketProduct === null)).toBe(true);
  });

  it('refuses a route that points at a different PI and keeps the canonical ingredient', async () => {
    const result = await materializeOfficialRecipe(
      'classic-dark-chocolate',
      'user-a',
      dependencies({
        resolveCountryProducts: vi.fn(async () => [
          {
            mapperIngredientId: 'PI-ING-000236',
            source: 'COUNTRY_PRIMARY_DEFAULT' as const,
            country: 'PL',
            product: { ...laciate, mappedIngredientId: 'PI-ING-000180' } as CatalogProductSearchHit,
          },
        ]),
      }),
    );
    expect(result.lines[0]).toMatchObject({
      marketProduct: null,
      marketProductRejected: 'mapping_mismatch',
    });
    expect(result.input.items[0]!.ingredient.id).toBe('PI-ING-000236');
  });

  it('says so when country resolution is unavailable, and keeps the canonical PIs', async () => {
    const result = await materializeOfficialRecipe(
      'classic-dark-chocolate',
      'user-a',
      dependencies({
        resolveCountryProducts: vi.fn(async () => Promise.reject(new Error('offline'))),
      }),
    );
    expect(result.countryResolution).toBe('unavailable');
    expect(result.lines.every((line) => line.marketProduct === null)).toBe(true);
  });

  it('blocks a recipe waiting for an exact product before resolving anything', async () => {
    const deps = dependencies();
    const recipe = OFFICIAL_RECIPES.find(
      (candidate) => officialRecipeReadiness(candidate).state === 'PRODUCT_BLOCKED',
    )!;
    const waitingFor = officialRecipeReadiness(recipe).blockingLines.find(
      (entry) => entry.state === 'PRODUCT_BLOCKED',
    )!.line.label;
    await expect(materializeOfficialRecipe(recipe.recipeId, 'user-a', deps)).rejects.toMatchObject({
      code: 'unresolved_identity',
      message: expect.stringContaining(waitingFor),
    });
    expect(deps.getIngredient).not.toHaveBeenCalled();
    expect(deps.resolveCountryProducts).not.toHaveBeenCalled();
  });

  it('blocks a recipe on a PI the FINAL Mapper does not approve, whatever else it waits for (#020)', async () => {
    const deps = dependencies();
    const recipe20 = OFFICIAL_RECIPES.find((recipe) => recipe.number === 20)!;
    await expect(
      materializeOfficialRecipe(recipe20.recipeId, 'user-a', deps),
    ).rejects.toMatchObject({ code: 'ingredient_unavailable' });
    expect(deps.getIngredient).not.toHaveBeenCalled();
    expect(deps.resolveCountryProducts).not.toHaveBeenCalled();
  });

  it('keeps the Sorbet scaffold Main dynamic: the template cannot open without a Main', async () => {
    const deps = dependencies();
    await expect(materializeOfficialRecipe('tech-sorbet-11', 'user-a', deps)).rejects.toMatchObject(
      {
        code: 'dynamic_main_required',
        lineNumber: 1,
      },
    );
    expect(deps.getIngredient).not.toHaveBeenCalled();
  });

  it.each([
    ['tech-protein-11', 'protein_gelato', -11],
    ['tech-gelato-11', 'milk_gelato', -11],
    ['tech-gelato-13-v2', 'milk_gelato', -13],
    ['tech-vegan-11-v2', 'vegan_gelato', -11],
    ['tech-vegan-13', 'vegan_gelato', -13],
  ])(
    'opens Technical Base %s on its stated profile and temperature',
    async (id, category, temperature) => {
      const result = await materializeOfficialRecipe(id, 'user-a', dependencies());
      expect(result.input.category).toBe(category);
      expect(result.input.target_temperature_c).toBe(temperature);
    },
  );

  it('classifies a Heritage Gelato / Sorbet record with the existing Gelato derivation', async () => {
    const mora = OFFICIAL_RECIPES.find((recipe) => recipe.number === 152)!;
    const sambayon = OFFICIAL_RECIPES.find((recipe) => recipe.number === 151)!;
    expect(
      (await materializeOfficialRecipe(mora.recipeId, 'user-a', dependencies())).input.category,
    ).toBe('sorbet');
    expect(
      (await materializeOfficialRecipe(sambayon.recipeId, 'user-a', dependencies())).input.category,
    ).toBe('milk_gelato');
  });

  it('loads the working copy as a new unsaved draft, and never touches a dirty draft', async () => {
    const before = structuredClone(useRecipeStore.getState().items);
    await expect(
      openOfficialRecipe(
        'classic-dark-chocolate',
        'user-a',
        { hasUnsavedChanges: () => true },
        dependencies(),
      ),
    ).rejects.toMatchObject({ code: 'unsaved_changes' });
    expect(useRecipeStore.getState().items).toEqual(before);

    await openOfficialRecipe(
      'classic-dark-chocolate',
      'user-a',
      { hasUnsavedChanges: () => false },
      dependencies(),
    );
    const state = useRecipeStore.getState();
    expect(state.items.map((item) => item.planned_grams)).toEqual([
      490, 80, 25, 80, 65, 53, 150, 55, 2,
    ]);
    expect(state.items.map((item) => item.ingredient.id)).toContain('PI-ING-001579');
    // A new unsaved working copy that knows its source (RL-13).
    expect(state.savedRecipeId).toBeNull();
    expect(state.provenance).toMatchObject({
      kind: 'official',
      officialRecipeId: 'classic-dark-chocolate',
      officialRecipeNumber: 1,
    });
  });
});
