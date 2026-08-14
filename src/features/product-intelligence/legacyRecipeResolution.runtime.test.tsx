// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { EngineIngredient } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { productBehaviorTestSnapshots } from './productBehaviorTestFixture';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  getRow: vi.fn(),
}));

vi.mock('@/services/productIntelligence', async () => ({
  ...(await vi.importActual<typeof import('@/services/productIntelligence')>(
    '@/services/productIntelligence'
  )),
  resolveLegacyRecipeBehaviorForSelection: mocks.resolve,
}));
vi.mock('@/services/ingredients', async () => ({
  ...(await vi.importActual<typeof import('@/services/ingredients')>('@/services/ingredients')),
  getEngineApprovedIngredientById: mocks.getRow,
}));

import { useLegacyRecipeBehaviorRevalidation } from './useLegacyRecipeBehaviorRevalidation';

const rowFromEngine = (ingredient: EngineIngredient): IngredientRow => ({
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
} as IngredientRow);

function Harness() {
  useLegacyRecipeBehaviorRevalidation();
  return null;
}

describe('legacy recipe runtime resolution', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'owner-runtime', email: null, displayName: null },
      available: true,
    });
    mocks.resolve.mockReset();
    mocks.getRow.mockReset();
    useRecipeProfileStore.setState({ awaitingRecalculation: false });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('hydrates all canonical lines atomically as RESOLVED without mutating the saved input', async () => {
    const saved = starterMilkBase();
    const savedBytes = JSON.stringify(saved);
    const expected = productBehaviorTestSnapshots(saved);
    const byMapper = new Map(saved.items.map((item) => [
      item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      { item, snapshot: expected[item.id]! },
    ]));
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
      expect(Object.values(state.productBehaviorSnapshots).every(
        (snapshot) => snapshot.resolutionState === 'RESOLVED',
      )).toBe(true);
    });

    expect(mocks.resolve).toHaveBeenCalledTimes(saved.items.length);
    expect(buildRecipeInput(useRecipeStore.getState()).items).toHaveLength(saved.items.length);
    expect(JSON.stringify(saved)).toBe(savedBytes);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });
});
