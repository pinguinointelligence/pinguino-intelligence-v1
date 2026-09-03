// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { newRecipeStarterMaterialFingerprint } from '@/features/recipes/newRecipeStarter';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { WorkbenchSettingsLine } from '@/features/pro-workbench/WorkbenchSettingsLine';
import { productBehaviorTestSnapshots } from './productBehaviorTestFixture';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  getRow: vi.fn(),
}));

vi.mock('@/services/productIntelligence', async () => ({
  ...(await vi.importActual<typeof import('@/services/productIntelligence')>(
    '@/services/productIntelligence',
  )),
  resolveLegacyRecipeBehaviorForSelection: mocks.resolve,
}));
vi.mock('@/services/ingredients', async () => ({
  ...(await vi.importActual<typeof import('@/services/ingredients')>('@/services/ingredients')),
  getEngineApprovedIngredientById: mocks.getRow,
}));

import { useLegacyRecipeBehaviorRevalidation } from './useLegacyRecipeBehaviorRevalidation';

const rowFromEngine = (ingredient: EngineIngredient): IngredientRow =>
  ({
    ingredient_id: ingredient.canonical_ingredient_id ?? ingredient.id,
    ingredient_name_internal: ingredient.name,
    ingredient_name_display: ingredient.name,
    ingredient_category: ingredient.category,
    ingredient_subcategory: ingredient.category,
    approved_for_base: true,
    approved_for_engines: true,
    verification_status: 'Verified',
    data_confidence_percent: 100,
    water_percent: ingredient.composition.water_percent,
    total_solids_percent: ingredient.composition.solids_percent,
    fat_percent: ingredient.composition.fat_percent,
    saturated_fat_percent: ingredient.composition.saturated_fat_percent ?? null,
    protein_percent: ingredient.composition.protein_percent,
    carbohydrate_percent: ingredient.composition.carbohydrate_percent,
    total_sugars_percent: ingredient.composition.sugar_percent,
    sucrose_percent: ingredient.composition.sucrose_percent,
    glucose_percent: ingredient.composition.glucose_percent,
    dextrose_percent: ingredient.composition.dextrose_percent,
    fructose_percent: ingredient.composition.fructose_percent,
    lactose_percent: ingredient.composition.lactose_percent,
    polyol_percent: ingredient.composition.polyol_percent,
    fiber_percent: ingredient.composition.fiber_percent,
    salt_percent: ingredient.composition.salt_percent,
    alcohol_percent: ingredient.composition.alcohol_percent,
    kcal_per_100g: ingredient.composition.kcal_per_100g,
    pod_value: ingredient.pod_value,
    pac_value: ingredient.pac_value,
    de_value: ingredient.de_value,
    vegan: ingredient.flags?.is_animal_origin ? 'false' : 'unknown',
    dairy_free: 'unknown',
    gluten_free: 'unknown',
    contains_alcohol: 'unknown',
    dataset_version: 'runtime-fixture',
  }) as IngredientRow;

function Harness() {
  useLegacyRecipeBehaviorRevalidation();
  return null;
}

function FullRecipeHarness() {
  useLegacyRecipeBehaviorRevalidation();
  return <WorkbenchSettingsLine compact />;
}

const mockResolvedBehaviorFor = (recipe: RecipeInput): void => {
  const expected = productBehaviorTestSnapshots(recipe);
  const byMapper = new Map(
    recipe.items.map((item) => [
      item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      { item, snapshot: expected[item.id]! },
    ]),
  );
  mocks.resolve.mockImplementation(async ({ reference }) => {
    const fixture = byMapper.get(reference.mapperIngredientId ?? reference.canonicalIdentity);
    if (!fixture) return null;
    const snapshot = fixture.snapshot;
    return {
      schemaVersion: 1,
      resolverVersion: snapshot.resolverVersion,
      entityKind: 'mapper',
      productId: snapshot.productId,
      productVersionId: snapshot.productVersionId,
      factsFingerprint: snapshot.factsFingerprint,
      catalogStatus: 'pi_base',
      provenance: 'mapper',
      behaviorBindingId: snapshot.behaviorBindingId,
      behaviorBindingVersion: snapshot.behaviorBindingVersion,
      taxonomyVersion: snapshot.taxonomyVersion,
      mapperIngredientId: reference.mapperIngredientId,
      familyId: null,
      subfamilyId: null,
      formId: null,
      mainEligibility: 'STANDARD_ONLY',
      veganEligibility: 'unknown',
      proteinBehavior: 'unknown',
      processBehavior: {},
      sharedFacts: snapshot.sharedFacts,
      approvedLiquidDairyCarrier: false,
      context: {},
      module: 'BASE_RECIPE',
      state: 'eligible',
      moduleEligibility: snapshot.moduleEligibility,
      mainPolicy: null,
      warnings: [],
      blockReasons: [],
    };
  });
  mocks.getRow.mockImplementation(async (mapperId: string) => {
    const fixture = byMapper.get(mapperId);
    return fixture ? rowFromEngine(fixture.item.ingredient) : null;
  });
};

describe('legacy recipe runtime resolution', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'owner-runtime', email: null, displayName: null },
      available: true,
    });
    mocks.resolve.mockReset();
    mocks.getRow.mockReset();
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.setState({ awaitingRecalculation: false });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('hydrates all canonical lines atomically as RESOLVED without mutating the saved input', async () => {
    const saved = starterMilkBase();
    const savedBytes = JSON.stringify(saved);
    const expected = productBehaviorTestSnapshots(saved);
    const byMapper = new Map(
      saved.items.map((item) => [
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        { item, snapshot: expected[item.id]! },
      ]),
    );
    mocks.resolve.mockImplementation(async ({ reference }) => {
      const fixture = byMapper.get(reference.mapperIngredientId ?? reference.canonicalIdentity);
      if (!fixture) return null;
      const snapshot = fixture.snapshot;
      return {
        schemaVersion: 1,
        resolverVersion: snapshot.resolverVersion,
        entityKind: 'mapper',
        productId: snapshot.productId,
        productVersionId: snapshot.productVersionId,
        factsFingerprint: snapshot.factsFingerprint,
        catalogStatus: 'pi_base',
        provenance: 'mapper',
        behaviorBindingId: snapshot.behaviorBindingId,
        behaviorBindingVersion: snapshot.behaviorBindingVersion,
        taxonomyVersion: snapshot.taxonomyVersion,
        mapperIngredientId: reference.mapperIngredientId,
        familyId: null,
        subfamilyId: null,
        formId: null,
        mainEligibility: 'STANDARD_ONLY',
        veganEligibility: 'unknown',
        proteinBehavior: 'unknown',
        processBehavior: {},
        sharedFacts: snapshot.sharedFacts,
        approvedLiquidDairyCarrier: false,
        context: {},
        module: 'BASE_RECIPE',
        state: 'eligible',
        moduleEligibility: snapshot.moduleEligibility,
        mainPolicy: null,
        warnings: [],
        blockReasons: [],
      };
    });
    mocks.getRow.mockImplementation(async (mapperId: string) => {
      const fixture = byMapper.get(mapperId);
      return fixture ? rowFromEngine(fixture.item.ingredient) : null;
    });

    useRecipeStore.getState().loadRecipeInput(saved, { savedId: 'colina', savedName: 'Colina' });
    await act(async () => {
      root.render(<Harness />);
    });
    await vi.waitFor(() => {
      const state = useRecipeStore.getState();
      expect(Object.keys(state.productBehaviorSnapshots)).toHaveLength(saved.items.length);
      expect(
        Object.values(state.productBehaviorSnapshots).every(
          (snapshot) => snapshot.resolutionState === 'RESOLVED',
        ),
      ).toBe(true);
    });

    expect(mocks.resolve).toHaveBeenCalledTimes(saved.items.length);
    expect(buildRecipeInput(useRecipeStore.getState()).items).toHaveLength(saved.items.length);
    expect(JSON.stringify(saved)).toBe(savedBytes);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });

  it('reopens a canonicalized catalog product without Mapper and preserves frozen grams, Crown and physics', async () => {
    const saved = starterMilkBase();
    const cacaoLine = saved.items.at(-1)!;
    cacaoLine.ingredient = {
      ...cacaoLine.ingredient,
      id: 'CA-ING-007141',
      canonical_ingredient_id: 'CA-ING-007141',
      private_product_id:
        'catalog:55bd0ed2-2d13-4c6b-9020-5c563188f1ef:version:2b000db4-7e18-4b74-936d-8ca991beecb9',
      name: 'Cacao Puro',
      composition: {
        ...cacaoLine.ingredient.composition,
        water_percent: 0,
        solids_percent: 100,
        fat_percent: 16,
        protein_percent: 25.5,
        carbohydrate_percent: 16.3,
        sugar_percent: 0.7,
        fiber_percent: 31.7,
        salt_percent: 0.03,
      },
      pac_value: 1.102,
      pod_value: 0.4,
    };
    cacaoLine.planned_grams = 30;
    cacaoLine.lock_type = 'unlocked';
    saved.items[0] = {
      ...saved.items[0]!,
      planned_grams: saved.items[0]!.planned_grams - 27,
    };

    const snapshots = productBehaviorTestSnapshots(saved);
    const frozen = snapshots[cacaoLine.id]!;
    snapshots[cacaoLine.id] = {
      ...frozen,
      resolutionState: 'REVALIDATION_REQUIRED',
      source: 'manual',
      productId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
      productVersionId: '2b000db4-7e18-4b74-936d-8ca991beecb9',
      behaviorBindingId: '6f1a7e48-2725-4d73-90c1-8a00e8a9d8c6',
      behaviorBindingVersion: 'customer-added-runtime-null-v1',
      factsFingerprint: '606e35153e7e86761c739a61e10b3394fb51f4f338140677659afedd7802a34e',
      mapperIngredientId: null,
      technicalAuthority: 'none',
      sharedFacts: {
        ...frozen.sharedFacts!,
        technicalComposition: {
          ...frozen.sharedFacts!.technicalComposition!,
          water: 0,
          totalSolids: 100,
          fat: 16,
          protein: 25.5,
          carbohydrate: 16.3,
          sugars: 0.7,
          fibre: 31.7,
          salt: 0.03,
          pacValue: 1.102,
          podValue: 0.4,
        },
      },
    };
    const frozenIngredient = structuredClone(cacaoLine.ingredient);

    mocks.resolve.mockImplementation(async ({ reference }) => {
      if (reference.productId === snapshots[cacaoLine.id]!.productId) {
        return {
          schemaVersion: 1,
          resolverVersion: 'historical-recipe-successor-v1',
          entityKind: 'catalog_product_version',
          productId: '55bd0ed2-2d13-4c6b-9020-5c563188f1ef',
          productVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
          factsFingerprint: 'current-facts-deliberately-different',
          catalogStatus: 'verified',
          provenance: 'admin',
          behaviorBindingId: '639f48f5-9d1c-4948-86a0-02ed20205203',
          behaviorBindingVersion: 'current-binding-v2',
          taxonomyVersion: frozen.taxonomyVersion,
          mapperIngredientId: null,
          familyId: frozen.familyId,
          subfamilyId: frozen.subfamilyId,
          formId: frozen.formId,
          mainEligibility: frozen.mainClassification,
          veganEligibility: 'verified',
          proteinBehavior: 'neutral',
          processBehavior: {},
          sharedFacts: {
            ...frozen.sharedFacts!,
            technicalComposition: {
              ...frozen.sharedFacts!.technicalComposition!,
              fat: 99,
            },
          },
          approvedLiquidDairyCarrier: false,
          context: {
            accountId: 'owner-runtime',
            productProfile: saved.category,
            temperatureC: saved.target_temperature_c,
            mode: 'optimal',
            processScope: 'BASE_FORMULATION',
            requestedRole: 'STANDARD',
            module: 'BASE_RECIPE',
          },
          module: 'BASE_RECIPE',
          state: 'eligible',
          moduleEligibility: frozen.moduleEligibility,
          mainPolicy: null,
          warnings: [],
          blockReasons: [],
          canonicalProductCode: 'PR-ING-007142',
          historicalResolutionKind: 'VERSION_SUCCESSOR',
        };
      }
      const mapperId = reference.mapperIngredientId ?? reference.canonicalIdentity;
      const line = saved.items.find(
        (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === mapperId,
      );
      if (!line) return null;
      const snapshot = snapshots[line.id]!;
      return {
        schemaVersion: 1,
        resolverVersion: snapshot.resolverVersion,
        entityKind: 'mapper',
        productId: snapshot.productId,
        productVersionId: snapshot.productVersionId,
        factsFingerprint: snapshot.factsFingerprint,
        catalogStatus: 'pi_base',
        provenance: 'mapper',
        behaviorBindingId: snapshot.behaviorBindingId,
        behaviorBindingVersion: snapshot.behaviorBindingVersion,
        taxonomyVersion: snapshot.taxonomyVersion,
        mapperIngredientId: mapperId,
        familyId: null,
        subfamilyId: null,
        formId: null,
        mainEligibility: 'STANDARD_ONLY',
        veganEligibility: 'unknown',
        proteinBehavior: 'unknown',
        processBehavior: {},
        sharedFacts: snapshot.sharedFacts,
        approvedLiquidDairyCarrier: false,
        context: snapshot.resolutionContext ?? {},
        module: 'BASE_RECIPE',
        state: 'eligible',
        moduleEligibility: snapshot.moduleEligibility,
        mainPolicy: null,
        warnings: [],
        blockReasons: [],
      };
    });
    mocks.getRow.mockImplementation(async (mapperId: string) => {
      const line = saved.items.find(
        (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === mapperId,
      );
      return line ? rowFromEngine(line.ingredient) : null;
    });

    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'd7246dcf-50e1-4e57-80e3-4facbfcf6e1c',
      savedName: 'P0 Cacao proof',
      versionId: '374bd44b-901c-46ce-9e8d-57c4a5b49704',
      versionNumber: 2,
      composition: {
        schemaVersion: 1,
        baseScope: 'BASE_FORMULATION',
        baseOrder: saved.items.map((item) => item.id),
        toppings: [],
        behaviorSnapshots: snapshots,
        migrationAmbiguities: [],
      },
    });

    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => {
      expect(
        useRecipeStore.getState().productBehaviorSnapshots[cacaoLine.id]?.resolutionState,
      ).toBe('RESOLVED');
    });

    const reopened = useRecipeStore.getState();
    const reopenedCacao = reopened.items.find((item) => item.id === cacaoLine.id)!;
    const reopenedSnapshot = reopened.productBehaviorSnapshots[cacaoLine.id]!;
    expect(reopenedCacao.planned_grams).toBe(30);
    expect(reopenedCacao.lock_type).toBe('unlocked');
    expect(reopenedCacao.ingredient).toEqual(frozenIngredient);
    expect(reopenedSnapshot.productVersionId).toBe('2b000db4-7e18-4b74-936d-8ca991beecb9');
    expect(reopenedSnapshot.sharedFacts).toEqual(snapshots[cacaoLine.id]!.sharedFacts);
    expect(reopenedSnapshot.historicalIdentity).toMatchObject({
      canonicalProductCode: 'PR-ING-007142',
      canonicalProductVersionId: '6a463055-ac6d-41d1-8fbb-01e662ba943b',
      resolutionKind: 'VERSION_SUCCESSOR',
    });
    expect(reopened.compositionMigrationAmbiguities).toEqual([]);
    expect(mocks.getRow).not.toHaveBeenCalledWith(null);
  });

  it('re-resolves persisted Owner Review Main seeds as technical STANDARD without changing the visible lock', async () => {
    const saved = starterMilkBase();
    saved.items[0] = { ...saved.items[0]!, lock_type: 'main' };
    mockResolvedBehaviorFor(saved);
    useRecipeStore
      .getState()
      .loadRecipeInput(saved, { savedId: 'owner-review', savedName: 'Owner' });
    useRecipeStore.setState({
      ownerReviewGate: {
        status: 'OWNER_REVIEW_EDITABLE',
        productionStatus: 'PRODUCTION_BLOCKED',
        labelStatus: 'LABEL_BLOCKED',
        omittedToppingLineIds: [],
        technicalOnlyMainLineIds: [saved.items[0]!.id],
      },
    });

    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => {
      expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots)).toHaveLength(
        saved.items.length,
      );
    });

    const mainCall = mocks.resolve.mock.calls.find(
      ([input]) =>
        input.reference.mapperIngredientId === saved.items[0]!.ingredient.canonical_ingredient_id,
    );
    expect(mainCall?.[0].context.requestedRole).toBe('STANDARD');
    expect(useRecipeStore.getState().items[0]?.lock_type).toBe('main');
    expect(useRecipeStore.getState().ownerReviewGate).toMatchObject({
      technicalOnlyMainLineIds: [saved.items[0]!.id],
      productionStatus: 'PRODUCTION_BLOCKED',
      labelStatus: 'LABEL_BLOCKED',
    });
  });

  it('hydrates an intentionally incomplete Sorbet starter without inventing its fruit Main', async () => {
    useRecipeStore.getState().startNewRecipe('sorbet');
    const starter = buildRecipeInput(useRecipeStore.getState());
    const expected = productBehaviorTestSnapshots(starter);
    const byMapper = new Map(
      starter.items.map((item) => [
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        { item, snapshot: expected[item.id]! },
      ]),
    );
    mocks.resolve.mockImplementation(async ({ reference }) => {
      const fixture = byMapper.get(reference.mapperIngredientId ?? reference.canonicalIdentity);
      if (!fixture) return null;
      const snapshot = fixture.snapshot;
      return {
        schemaVersion: 1,
        resolverVersion: snapshot.resolverVersion,
        entityKind: 'mapper',
        productId: snapshot.productId,
        productVersionId: snapshot.productVersionId,
        factsFingerprint: snapshot.factsFingerprint,
        catalogStatus: 'pi_base',
        provenance: 'mapper',
        behaviorBindingId: snapshot.behaviorBindingId,
        behaviorBindingVersion: snapshot.behaviorBindingVersion,
        taxonomyVersion: snapshot.taxonomyVersion,
        mapperIngredientId: reference.mapperIngredientId,
        familyId: null,
        subfamilyId: null,
        formId: null,
        mainEligibility: 'STANDARD_ONLY',
        veganEligibility: 'unknown',
        proteinBehavior: 'unknown',
        processBehavior: {},
        sharedFacts: snapshot.sharedFacts,
        approvedLiquidDairyCarrier: false,
        context: {},
        module: 'BASE_RECIPE',
        state: 'eligible',
        moduleEligibility: snapshot.moduleEligibility,
        mainPolicy: null,
        warnings: [],
        blockReasons: [],
      };
    });
    mocks.getRow.mockImplementation(async (mapperId: string) => {
      const fixture = byMapper.get(mapperId);
      return fixture ? rowFromEngine(fixture.item.ingredient) : null;
    });

    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => {
      expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots)).toHaveLength(
        starter.items.length,
      );
    });

    const hydrated = useRecipeStore.getState();
    expect(hydrated.visibleProductType).toBe('sorbet');
    expect(hydrated.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(400, 6);
    expect(hydrated.items.some((item) => item.lock_type === 'main')).toBe(false);
    expect(hydrated.dirty).toBe(false);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('requires full-page confirmation and then loads native Protein P12 after Gelato authority hydration', async () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    const gelato = buildRecipeInput(useRecipeStore.getState());
    mockResolvedBehaviorFor(gelato);

    await act(async () => root.render(<FullRecipeHarness />));
    await vi.waitFor(() => {
      expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots)).toHaveLength(
        gelato.items.length,
      );
    });

    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    const hydratedGelatoItems = structuredClone(useRecipeStore.getState().items);
    const select = host.querySelector(
      '[data-testid="workbench-product-type"]',
    ) as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
        select,
        'protein',
      );
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    expect(useRecipeStore.getState().items).toEqual(hydratedGelatoItems);
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () =>
      (
        document.body.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement
      ).click(),
    );

    const protein = useRecipeStore.getState();
    expect(protein.visibleProductType).toBe('protein');
    expect(protein.category).toBe('protein_gelato');
    expect(protein.newRecipeStarterTemplateId).toBe('protein_dairy_neutral_minus12_v1');
    expect(protein.formulation_strategy).toBe('optimal');
    expect(
      Object.fromEntries(
        protein.items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      'PI-ING-000236': 522,
      'PI-ING-000180': 114,
      'PI-ING-000264': 81,
      'PI-ING-001409': 104,
      'PI-ING-000514': 71,
      'PI-ING-000494': 106,
      'PI-ING-000492': 2,
    });
  });

  it('preserves an edited starter and its dirty/material state across asynchronous hydration', async () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    const first = useRecipeStore.getState().items[0]!;
    const editedGrams = first.planned_grams + 17;
    useRecipeStore.getState().setPlannedGrams(first.id, editedGrams);
    const edited = buildRecipeInput(useRecipeStore.getState());
    mockResolvedBehaviorFor(edited);

    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => {
      expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots)).toHaveLength(
        edited.items.length,
      );
    });

    const hydrated = useRecipeStore.getState();
    expect(hydrated.items.find((item) => item.id === first.id)?.planned_grams).toBe(editedGrams);
    expect(hydrated.dirty).toBe(true);
    expect(
      newRecipeStarterMaterialFingerprint({
        items: hydrated.items,
        toppings: hydrated.toppings,
        excludedIngredientIds: hydrated.excludedIngredientIds,
        unavailableMainIngredientIds: hydrated.unavailableMainIngredientIds,
      }),
    ).not.toBe(hydrated.newRecipeStarterMaterialFingerprint);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });
});
