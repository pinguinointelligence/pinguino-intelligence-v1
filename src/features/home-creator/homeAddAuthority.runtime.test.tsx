// @vitest-environment jsdom

/**
 * OWNER 2026-09-11 — HOME: a newly added BASE product has usable authority
 * immediately, without a HOME recalculation.
 *
 * Before: HOME had no managed ProductBehavior pass. A HOME starter carries no
 * snapshots; the first „Dodaj składnik" wrote one, which made the workspace
 * managed — and from then on the new line (stale after HOME's auto-crown), every
 * starter line (no snapshot) and every chip-added line (no snapshot) refused
 * every grams write, silently, until a HOME Recalculate synced authority.
 *
 * Now HOME mounts the same authority-only pass PRO runs. This drives the REAL
 * hook through HOME's own store doors, against mocked server answers.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { EngineIngredient } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';

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

import { useLegacyRecipeBehaviorRevalidation } from '@/features/product-intelligence';

const STRAWBERRIES = 'PI-ING-001553';
const CRANBERRY = 'PI-ING-001556';
const WATERMELON = 'PI-ING-000405';
const FRUIT = new Set([STRAWBERRIES, CRANBERRY, WATERMELON]);

const st = () => useRecipeStore.getState();
const line = (id: string) => st().items.find((item) => item.id === id)!;
const state = (id: string) => st().productBehaviorSnapshots[id]?.resolutionState ?? 'MISSING';

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

/** Server stand-in: answers for whatever the draft holds; `blocked` refuses. */
const installServer = (blocked: ReadonlySet<string> = new Set()) => {
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
    const refused = blocked.has(mapperId);
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
      mainEligibility: FRUIT.has(mapperId) ? 'MAIN_PROFILE_SPECIFIC' : 'STANDARD_ONLY',
      ...(FRUIT.has(mapperId) ? { mainCapability: 'MAIN_CAPABLE_UNCALIBRATED' } : {}),
      veganEligibility: 'unknown',
      proteinBehavior: 'unknown',
      processBehavior: {},
      sharedFacts: snapshot.sharedFacts,
      approvedLiquidDairyCarrier: false,
      context: {},
      module: 'BASE_RECIPE',
      state: refused ? 'blocked' : 'eligible',
      moduleEligibility: snapshot.moduleEligibility,
      mainPolicy: null,
      warnings: [],
      blockReasons: refused ? ['profile_not_approved'] : [],
    };
  });
  mocks.getRow.mockImplementation(async (mapperId: string) => {
    const fixture = current().get(mapperId);
    return fixture ? rowFromEngine(fixture.item.ingredient) : null;
  });
};

function HomeAuthority() {
  // Exactly what HomeCreatorPage mounts.
  useLegacyRecipeBehaviorRevalidation();
  return null;
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
};

/** HomeCreatorPage.generateRecipe: the canonical HOME starter. */
const homeStarter = (visibleProductType: 'sorbet' | 'protein') =>
  act(() =>
    st().rebuildNewRecipeStarter({
      visibleProductType,
      servingModeId: 'temp_minus_12',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1000,
    }),
  );

/** HomeCreatorPage.addIngredientLine: add, the picker's snapshot, HOME auto-crown. */
const homePickerAdd = (mapperId: string): string => {
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
    st().setMainIngredient(added.lineId, 'home');
    lineId = added.lineId;
  });
  return lineId;
};

/** useHomeIntentIngredients.addByProductId: add WITHOUT a snapshot, HOME auto-crown. */
const homeChipAdd = (mapperId: string): string => {
  let lineId = '';
  act(() => {
    const added = st().addIngredient(sorbetMapperIngredient(mapperId), 0);
    if (added.status !== 'added') throw new Error(`add failed ${added.status}`);
    st().setMainIngredient(added.lineId, 'home');
    lineId = added.lineId;
  });
  return lineId;
};

const write = (id: string, grams: number) => act(() => st().setPlannedGrams(id, grams));

describe('HOME — a new BASE product is editable right after the add', () => {
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
      user: { id: 'home-runtime', email: null, displayName: null },
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

  it('H1–H3: identity stable, authority resolved, + and typed grams work — no recalculation', async () => {
    installServer();
    homeStarter('sorbet');
    await act(async () => root.render(<HomeAuthority />));
    await settle();
    const starterIds = st().items.map((item) => item.id);
    for (const id of starterIds) expect(state(id)).toBe('RESOLVED');

    const id = homePickerAdd(STRAWBERRIES);
    const identity = line(id).ingredient.canonical_ingredient_id;
    await settle();

    expect(state(id)).toBe('RESOLVED');
    expect(line(id).ingredient.canonical_ingredient_id).toBe(identity);
    const start = line(id).planned_grams;
    write(id, start + 1); // H2: the + control
    expect(line(id).planned_grams).toBe(start + 1);
    write(id, 20); // H3: direct entry
    expect(line(id).planned_grams).toBe(20);

    const water = starterIds[0]!;
    const before = line(water).planned_grams;
    write(water, before + 5); // the rest of the recipe stays editable too
    expect(line(water).planned_grams).toBe(before + 5);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
  });

  it('a chip-added line (no picker snapshot) gets authority the same way', async () => {
    installServer();
    homeStarter('sorbet');
    await act(async () => root.render(<HomeAuthority />));
    await settle();
    homePickerAdd(STRAWBERRIES);
    const chip = homeChipAdd(CRANBERRY);
    await settle();
    expect(state(chip)).toBe('RESOLVED');
    write(chip, 30);
    expect(line(chip).planned_grams).toBe(30);
  });

  it('H4–H6: HOME Crown rules are unchanged — auto-crown on add, Protein mass-neutral, no PRO bootstrap', async () => {
    installServer();
    homeStarter('sorbet');
    await act(async () => root.render(<HomeAuthority />));
    await settle();
    const sorbetFruit = homePickerAdd(STRAWBERRIES);
    expect(line(sorbetFruit).lock_type).toBe('main');
    expect(line(sorbetFruit).amount_provenance).toBeUndefined();

    homeStarter('protein');
    await settle();
    const proteinFruit = homePickerAdd(WATERMELON);
    expect(line(proteinFruit)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(line(proteinFruit).amount_provenance).toBeUndefined();
  });

  it('H7: a product the server refuses stays blocked — fail closed', async () => {
    installServer(new Set([CRANBERRY]));
    homeStarter('sorbet');
    await act(async () => root.render(<HomeAuthority />));
    await settle();
    homePickerAdd(STRAWBERRIES);
    await settle();
    const refused = homeChipAdd(CRANBERRY);
    await settle();
    expect(state(refused)).toBe('MISSING');
    const before = line(refused).planned_grams;
    write(refused, 50);
    expect(line(refused).planned_grams).toBe(before);
  });

  it('HomeCreatorPage mounts the managed pass', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/HomeCreatorPage.tsx'),
      'utf8',
    );
    expect(source).toContain('useLegacyRecipeBehaviorRevalidation();');
  });
});
