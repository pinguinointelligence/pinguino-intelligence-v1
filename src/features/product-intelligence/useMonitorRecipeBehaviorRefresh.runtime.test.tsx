// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import type { ProductBehaviorSnapshot } from './contracts';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorModuleGate,
} from './recipeBehaviorAuthority';
import { productBehaviorTestSnapshots } from './productBehaviorTestFixture';

const mocks = vi.hoisted(() => ({
  resolveSnapshots: vi.fn(),
  validate: vi.fn(),
}));

vi.mock('@/services/productIntelligence', async () => ({
  ...(await vi.importActual<typeof import('@/services/productIntelligence')>(
    '@/services/productIntelligence',
  )),
  resolveRecipeProposalBehaviorSnapshots: mocks.resolveSnapshots,
  validateRecipeBehaviorOnServer: mocks.validate,
}));

const actualProductIntelligence = await vi.importActual<
  typeof import('@/services/productIntelligence')
>('@/services/productIntelligence');
const { useMonitorRecipeBehaviorRefresh } = await import('./useMonitorRecipeBehaviorRefresh');

const OWNER_ID = 'owner-monitor-refresh';

function catalogTopping(lineId: string, grams: number): RecipeToppingItem {
  const ingredient: CatalogLabelToppingIngredient = {
    kind: 'catalog_label_topping',
    id: `catalog:${lineId}`,
    canonical_ingredient_id: `catalog:${lineId}`,
    private_product_id: `catalog:product-${lineId}:version:version-${lineId}`,
    name: `Catalog ${lineId}`,
    catalog_product_id: `product-${lineId}`,
    catalog_version_id: `version-${lineId}`,
    verification_status: 'verified',
    label_nutrition_per_100g: {
      basis: 'per_100g',
      energyKcal: 410,
      fat: 24,
      saturatedFat: 8,
      carbohydrate: 48,
      sugars: 35,
      protein: 6,
      salt: 0.2,
      fibre: 3,
    },
    ingredients_text: 'Test catalog topping',
    allergens_text: '',
    cost_per_kg: null,
    cost_currency: null,
  };
  return {
    id: lineId,
    ingredient,
    planned_grams: grams,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: grams > 0 ? 0 : 1,
  };
}

function withMonitorContext(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot>>,
  recipe = starterMilkBase(),
): Record<string, ProductBehaviorSnapshot> {
  return Object.fromEntries(
    Object.entries(snapshots).map(([lineId, snapshot]) => [
      lineId,
      {
        ...structuredClone(snapshot),
        moduleEligibility: {
          ...snapshot.moduleEligibility,
          MONITOR: snapshot.processScope === 'POST_PROCESS_ADDON' ? 'label_only' : 'eligible',
        },
        resolutionContext: {
          accountId: OWNER_ID,
          productProfile: recipe.category,
          temperatureC: recipe.target_temperature_c,
          mode: recipe.mode === 'eco' ? 'eco' : 'optimal',
          processScope: snapshot.processScope,
          requestedRole: 'STANDARD',
          module: 'MONITOR',
        },
      },
    ]),
  );
}

function staleMonitorSnapshots(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot>>,
): Record<string, ProductBehaviorSnapshot> {
  return Object.fromEntries(
    Object.entries(snapshots).map(([lineId, snapshot]) => [
      lineId,
      {
        ...structuredClone(snapshot),
        moduleEligibility: { ...snapshot.moduleEligibility, MONITOR: 'blocked' },
      },
    ]),
  );
}

function MonitorRefreshHarness() {
  const state = useRecipeStore();
  const authority = buildRecipeBehaviorAuthority({
    items: state.items,
    toppings: state.toppings,
    snapshots: state.productBehaviorSnapshots,
  });
  const gate = recipeBehaviorModuleGate(authority, 'MONITOR');
  useMonitorRecipeBehaviorRefresh({
    enabled: !gate.ready && authority.requiredLineIds.length > 0,
    blockedLineIds: gate.blockedLineIds,
  });
  return <output data-testid="monitor-refresh-gate">{gate.ready ? 'ready' : 'skeleton'}</output>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('MONITOR ProductBehavior runtime refresh', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
    useRecipeStore.setState(useRecipeStore.getInitialState(), true);
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER_ID, email: null, displayName: null },
      available: true,
    });
    mocks.resolveSnapshots.mockReset();
    mocks.validate.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('recovers an applied-style current recipe and its positive topping through exact MONITOR authority', async () => {
    const recipe = starterMilkBase();
    const positive = catalogTopping('monitor-positive-topping', 24);
    const zero = catalogTopping('monitor-zero-topping', 0);
    const refreshed = withMonitorContext(productBehaviorTestSnapshots(recipe, [positive]), recipe);
    const stale = staleMonitorSnapshots(refreshed);
    useRecipeStore.getState().loadRecipeInput(recipe);
    useRecipeStore.setState({
      toppings: [positive, zero],
      productBehaviorSnapshots: stale,
      dirty: false,
    });
    mocks.resolveSnapshots.mockImplementation(async (request) => {
      expect(request.module).toBe('MONITOR');
      expect(request.toppings.map((item: RecipeToppingItem) => item.id)).toEqual([
        positive.id,
        zero.id,
      ]);
      expect(
        Object.values(request.snapshots).every(
          (snapshot) =>
            (snapshot as ProductBehaviorSnapshot).resolutionState === 'REVALIDATION_REQUIRED',
        ),
      ).toBe(true);
      return { snapshots: refreshed, unresolvedLineIds: [] };
    });
    mocks.validate.mockResolvedValue({
      ready: true,
      module: 'MONITOR',
      staleLineIds: [],
      lines: [],
    });

    await act(async () => root.render(<MonitorRefreshHarness />));
    await vi.waitFor(() => expect(host.textContent).toBe('ready'));

    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'MONITOR', snapshots: refreshed }),
    );
    expect(useRecipeStore.getState().productBehaviorSnapshots[positive.id]).toMatchObject({
      processScope: 'POST_PROCESS_ADDON',
      moduleEligibility: { MONITOR: 'label_only' },
    });
    expect(useRecipeStore.getState().productBehaviorSnapshots[zero.id]).toBeUndefined();
    expect(useRecipeStore.getState().dirty).toBe(false);
  });

  it('ignores a late response after the draft revision changes', async () => {
    const recipe = starterMilkBase();
    const refreshed = withMonitorContext(productBehaviorTestSnapshots(recipe), recipe);
    const stale = staleMonitorSnapshots(refreshed);
    const first = deferred<{ snapshots: Record<string, ProductBehaviorSnapshot>; unresolvedLineIds: string[] }>();
    useRecipeStore.getState().loadRecipeInput(recipe);
    useRecipeStore.setState({ productBehaviorSnapshots: stale, dirty: false });
    mocks.resolveSnapshots
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue({ snapshots: stale, unresolvedLineIds: [recipe.items[0]!.id] });
    mocks.validate.mockResolvedValue({
      ready: true,
      module: 'MONITOR',
      staleLineIds: [],
      lines: [],
    });

    await act(async () => root.render(<MonitorRefreshHarness />));
    await vi.waitFor(() => expect(mocks.resolveSnapshots).toHaveBeenCalledTimes(1));
    await act(async () => {
      useRecipeStore
        .getState()
        .setPlannedGrams(recipe.items[0]!.id, recipe.items[0]!.planned_grams + 1);
    });
    await vi.waitFor(() => expect(mocks.resolveSnapshots).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve({ snapshots: refreshed, unresolvedLineIds: [] }));

    expect(mocks.validate).not.toHaveBeenCalled();
    expect(host.textContent).toBe('skeleton');
  });

  it('does not overwrite a newer snapshot fingerprint with a late response', async () => {
    const recipe = starterMilkBase();
    const refreshed = withMonitorContext(productBehaviorTestSnapshots(recipe), recipe);
    const stale = staleMonitorSnapshots(refreshed);
    const late = deferred<{ snapshots: Record<string, ProductBehaviorSnapshot>; unresolvedLineIds: string[] }>();
    useRecipeStore.getState().loadRecipeInput(recipe);
    useRecipeStore.setState({ productBehaviorSnapshots: stale, dirty: false });
    mocks.resolveSnapshots.mockImplementationOnce(() => late.promise);
    mocks.validate.mockResolvedValue({
      ready: true,
      module: 'MONITOR',
      staleLineIds: [],
      lines: [],
    });

    await act(async () => root.render(<MonitorRefreshHarness />));
    await vi.waitFor(() => expect(mocks.resolveSnapshots).toHaveBeenCalledTimes(1));
    const newer = Object.fromEntries(
      Object.entries(refreshed).map(([lineId, snapshot]) => [
        lineId,
        { ...snapshot, factsFingerprint: `${snapshot.factsFingerprint}:newer` },
      ]),
    );
    await act(async () => useRecipeStore.getState().syncProductBehaviorSnapshots(newer));
    await vi.waitFor(() => expect(host.textContent).toBe('ready'));
    await act(async () => late.resolve({ snapshots: refreshed, unresolvedLineIds: [] }));

    expect(mocks.validate).not.toHaveBeenCalled();
    expect(
      Object.values(useRecipeStore.getState().productBehaviorSnapshots).every((snapshot) =>
        snapshot.factsFingerprint.endsWith(':newer'),
      ),
    ).toBe(true);
  });

  it('keeps the skeleton when terminal MONITOR validation is blocked', async () => {
    const recipe = starterMilkBase();
    const refreshed = withMonitorContext(productBehaviorTestSnapshots(recipe), recipe);
    const stale = staleMonitorSnapshots(refreshed);
    useRecipeStore.getState().loadRecipeInput(recipe);
    useRecipeStore.setState({ productBehaviorSnapshots: stale, dirty: false });
    mocks.resolveSnapshots.mockResolvedValue({ snapshots: refreshed, unresolvedLineIds: [] });
    mocks.validate.mockResolvedValue({
      ready: false,
      module: 'MONITOR',
      staleLineIds: [recipe.items[0]!.id],
      lines: [],
    });

    await act(async () => root.render(<MonitorRefreshHarness />));
    await vi.waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));

    expect(host.textContent).toBe('skeleton');
    expect(useRecipeStore.getState().productBehaviorSnapshots).toEqual(stale);
  });

  it('keeps the skeleton when the resolver fails', async () => {
    const recipe = starterMilkBase();
    const refreshed = withMonitorContext(productBehaviorTestSnapshots(recipe), recipe);
    const stale = staleMonitorSnapshots(refreshed);
    useRecipeStore.getState().loadRecipeInput(recipe);
    useRecipeStore.setState({ productBehaviorSnapshots: stale, dirty: false });
    mocks.resolveSnapshots.mockRejectedValue(new Error('network unavailable'));

    await act(async () => root.render(<MonitorRefreshHarness />));
    await vi.waitFor(() => expect(mocks.resolveSnapshots).toHaveBeenCalledTimes(1));

    expect(host.textContent).toBe('skeleton');
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(useRecipeStore.getState().productBehaviorSnapshots).toEqual(stale);
  });

  it('includes a positive topping and excludes a zero-gram topping at the canonical resolver seam', async () => {
    const recipe = starterMilkBase();
    const positive = catalogTopping('resolver-positive-topping', 15);
    const zero = catalogTopping('resolver-zero-topping', 0);
    const snapshots = withMonitorContext(productBehaviorTestSnapshots(recipe), recipe);
    const resolveSelection = vi.fn(async () => null);

    const result = await actualProductIntelligence.resolveRecipeProposalBehaviorSnapshots({
      recipe,
      toppings: [positive, zero],
      snapshots,
      accountId: OWNER_ID,
      module: 'MONITOR',
      resolveSelection,
    });

    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(resolveSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: {
          entityKind: 'catalog_product_version',
          entityId: `version-${positive.id}`,
        },
        context: expect.objectContaining({
          processScope: 'POST_PROCESS_ADDON',
          // Product resolution remains scope-authoritative: a post-process
          // line is resolved as TOPPING, then the full recipe is terminally
          // validated for MONITOR by the refresh hook.
          module: 'TOPPING',
        }),
      }),
    );
    expect(result.unresolvedLineIds).toEqual([positive.id]);
    expect(result.unresolvedLineIds).not.toContain(zero.id);
  });
});
