// @vitest-environment jsdom

/**
 * OWNER BRIEF 2026-09-11 — the managed PRO pass must re-establish the
 * ProductBehavior authority a Crown role change invalidates, in every draft.
 *
 * Crown ON marks the crowned line REVALIDATION_REQUIRED (the role changed).
 * The managed pass re-resolved it, but outside a fresh starter it committed the
 * refresh through `applyVerifiedRecipeInput` — the terminal full-recipe door —
 * which refuses any recipe the user is still building. Every crowned line then
 * stayed REVALIDATION_REQUIRED ("Brak zatwierdzonego uprawnienia BASE_RECIPE")
 * with its grams control closed. And a line returned to 0 g by Crown OFF was
 * never visited at all, because a 0 g line is outside the required set.
 *
 * The REAL hook (`useLegacyRecipeBehaviorRevalidation`, mounted by
 * ProWorkspacePage) runs here against mocked server answers.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { EngineIngredient } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { productBehaviorTestSnapshots } from './productBehaviorTestFixture';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), getRow: vi.fn() }));
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

const STRAWBERRIES = 'PI-ING-001553';
const CRANBERRY = 'PI-ING-001556';
const WATERMELON = 'PI-ING-000405';
const FRUIT = new Set([STRAWBERRIES, CRANBERRY, WATERMELON]);

const st = () => useRecipeStore.getState();
const state = (lineId: string) => st().productBehaviorSnapshots[lineId]?.resolutionState;

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
    vegan: 'unknown',
    dairy_free: 'unknown',
    gluten_free: 'unknown',
    contains_alcohol: 'unknown',
    dataset_version: 'runtime-fixture',
  }) as IngredientRow;

/**
 * Server stand-in. It answers for whatever the draft holds, with the SAME
 * product version and facts the picker froze — unless a test says the product
 * is refused or was republished as a new version.
 */
const installServer = (
  overrides: {
    blocked?: ReadonlySet<string>;
    republished?: ReadonlySet<string>;
  } = {},
) => {
  const current = () => {
    const recipe = buildRecipeInput(st());
    const snapshots = productBehaviorTestSnapshots(recipe);
    return new Map(
      recipe.items.map((item) => [
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        { item, snapshot: snapshots[item.id]! },
      ]),
    );
  };
  mocks.resolve.mockImplementation(async ({ reference }) => {
    const mapperId = reference.mapperIngredientId ?? reference.canonicalIdentity;
    const fixture = current().get(mapperId);
    if (!fixture) return null;
    const snapshot = fixture.snapshot;
    const republished = overrides.republished?.has(mapperId) === true;
    return {
      schemaVersion: 1,
      resolverVersion: snapshot.resolverVersion,
      entityKind: 'mapper',
      productId: snapshot.productId,
      productVersionId: republished ? `${snapshot.productVersionId}:v2` : snapshot.productVersionId,
      factsFingerprint: republished ? `${snapshot.factsFingerprint}:v2` : snapshot.factsFingerprint,
      catalogStatus: 'pi_base',
      provenance: 'mapper',
      behaviorBindingId: snapshot.behaviorBindingId,
      behaviorBindingVersion: snapshot.behaviorBindingVersion,
      taxonomyVersion: snapshot.taxonomyVersion,
      mapperIngredientId: mapperId,
      familyId: null,
      subfamilyId: null,
      formId: null,
      mainEligibility: FRUIT.has(mapperId) ? 'MAIN_PROFILE_SPECIFIC' : 'STANDARD_ONLY',
      ...(FRUIT.has(mapperId) ? { mainCapability: 'MAIN_CAPABLE_UNCALIBRATED' } : {}),
      veganEligibility: 'unknown',
      proteinBehavior: 'unknown',
      processBehavior: {},
      sharedFacts: snapshot.sharedFacts,
      approvedLiquidDairyCarrier: false,
      context: {},
      module: 'BASE_RECIPE',
      state: overrides.blocked?.has(mapperId) === true ? 'blocked' : 'eligible',
      moduleEligibility: snapshot.moduleEligibility,
      mainPolicy: null,
      warnings: [],
      blockReasons: overrides.blocked?.has(mapperId) === true ? ['profile_not_approved'] : [],
    };
  });
  mocks.getRow.mockImplementation(async (mapperId: string) => {
    const fixture = current().get(mapperId);
    return fixture ? rowFromEngine(fixture.item.ingredient) : null;
  });
};

function Harness() {
  useLegacyRecipeBehaviorRevalidation();
  return null;
}

/** The picker door: the fruit arrives at 0 g with the snapshot the server froze. */
const addFruitAtZero = (mapperId: string): string => {
  let lineId = '';
  act(() => {
    const added = st().addIngredient(sorbetMapperIngredient(mapperId), 0);
    if (added.status !== 'added') throw new Error(`add failed ${added.status}`);
    const snapshot = productBehaviorTestSnapshots(buildRecipeInput(st()))[added.lineId]!;
    st().setProductBehaviorSnapshot(added.lineId, {
      ...snapshot,
      lineId: added.lineId,
      mainClassification: 'MAIN_ALLOWED',
      mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
    });
    lineId = added.lineId;
  });
  return lineId;
};

const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
};

describe('managed PRO pass — Crown role changes keep Fresh Fruit BASE_RECIPE authority', () => {
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

  /** A fresh Sorbet starter (`starter`), or the state every saved / reopened
   * / re-saved draft is in — markSaved and loadRecipeInput null these fields. */
  const open = async (starter: boolean) => {
    act(() => st().startNewRecipe('sorbet'));
    await act(async () => root.render(<Harness />));
    await settle();
    if (!starter) {
      act(() =>
        useRecipeStore.setState({
          newRecipeStarterTemplateId: null,
          newRecipeStarterKey: null,
          newRecipeStarterMaterialFingerprint: null,
        }),
      );
    }
  };

  it('a fresh starter: three crowned 0 g fruits are resolved (starter branch unchanged)', async () => {
    installServer();
    await open(true);
    const ids = [STRAWBERRIES, CRANBERRY, WATERMELON].map(addFruitAtZero);
    for (const id of ids) act(() => st().setMainIngredient(id));
    for (const id of ids) expect(state(id)).toBe('REVALIDATION_REQUIRED');

    await settle();

    for (const id of ids) expect(state(id)).toBe('RESOLVED');
    expect(st().compositionMigrationAmbiguities).toEqual([]);
  });

  it('a saved/reopened draft: the crowned lines are re-authorized without re-judging the recipe', async () => {
    installServer();
    await open(false);
    const ids = [STRAWBERRIES, CRANBERRY, WATERMELON].map(addFruitAtZero);
    for (const id of ids) act(() => st().setMainIngredient(id));
    const vector = JSON.stringify(st().items);

    await settle();

    for (const id of ids) {
      expect(state(id)).toBe('RESOLVED');
      expect(st().items.find((item) => item.id === id)).toMatchObject({
        planned_grams: 1,
        lock_type: 'main',
      });
    }
    // Authority only: the recipe the user is building is byte-identical.
    expect(JSON.stringify(st().items)).toBe(vector);
    expect(st().compositionMigrationAmbiguities).toEqual([]);
    // ...and the lines can be edited again.
    act(() => st().setPlannedGrams(ids[0]!, 120));
    expect(st().items.find((item) => item.id === ids[0])?.planned_grams).toBe(120);
  });

  it('an on-batch reopened draft (3 × 200 g) is re-authorized the same way', async () => {
    installServer();
    await open(false);
    const ids = [STRAWBERRIES, CRANBERRY, WATERMELON].map((mapperId) => {
      const lineId = addFruitAtZero(mapperId);
      act(() => st().setPlannedGrams(lineId, 200));
      return lineId;
    });
    for (const id of ids) act(() => st().setMainIngredient(id));

    await settle();

    for (const id of ids) expect(state(id)).toBe('RESOLVED');
    expect(st().compositionMigrationAmbiguities).toEqual([]);
  });

  it('Crown ON then OFF before the pass answered: the stale 0 g line is refreshed and editable', async () => {
    installServer();
    await open(false);
    const id = addFruitAtZero(STRAWBERRIES);
    act(() => {
      st().setMainIngredient(id);
      st().setStandardIngredient(id);
    });
    expect(st().items.find((item) => item.id === id)?.planned_grams).toBe(0);
    expect(state(id)).toBe('REVALIDATION_REQUIRED');

    await settle();

    expect(state(id)).toBe('RESOLVED');
    act(() => st().setPlannedGrams(id, 1));
    expect(st().items.find((item) => item.id === id)?.planned_grams).toBe(1);
  });

  it('a product the server refuses stays stale and blocked — fail closed', async () => {
    installServer({ blocked: new Set([CRANBERRY]) });
    await open(false);
    const strawberry = addFruitAtZero(STRAWBERRIES);
    const cranberry = addFruitAtZero(CRANBERRY);
    act(() => st().setMainIngredient(strawberry));
    act(() => st().setMainIngredient(cranberry));

    await settle();

    expect(state(cranberry)).toBe('REVALIDATION_REQUIRED');
    expect(
      st().compositionMigrationAmbiguities.some(
        (issue) => issue.lineId === cranberry && issue.reason.startsWith('LEGACY_BEHAVIOR:'),
      ),
    ).toBe(true);
    act(() => st().setPlannedGrams(cranberry, 50));
    expect(st().items.find((item) => item.id === cranberry)?.planned_grams).toBe(1);
  });

  it('a republished product version is not an authority-only refresh — the verified write still owns it', async () => {
    installServer({ republished: new Set([STRAWBERRIES]) });
    await open(false);
    const id = addFruitAtZero(STRAWBERRIES);
    act(() => st().setMainIngredient(id));

    await settle();

    // The upgraded facts would change the recipe, so the refresh still goes
    // through the full verified write, which refuses this half-built draft.
    expect(state(id)).toBe('REVALIDATION_REQUIRED');
    expect(
      st().compositionMigrationAmbiguities.some(
        (issue) =>
          issue.lineId === id && issue.reason.startsWith('LEGACY_BEHAVIOR:zapis working copy'),
      ),
    ).toBe(true);
  });
});
