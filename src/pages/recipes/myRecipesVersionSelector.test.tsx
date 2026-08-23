// @vitest-environment jsdom
/**
 * „Moje receptury" × WERSJA — the page-level contract (owner v1.4 Part A §5/§6/§12).
 *
 * The repository handed to the page fails the test if ANY write method is touched, so §5
 * („selecting an old version must not mutate data") is proven structurally rather than asserted by
 * inspection: no restore, no rename, no archive, no save can happen while the user browses
 * versions. §6 („Otwórz uses the selected version, no silent fallback to latest") is proven by
 * reading what the store was actually loaded with.
 *
 * Row fixture is the owner's real recipe: v1 22.08.2026, v2 and v3 23.08.2026.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAVED_AT_V1 = '2026-08-22T23:29:59.494922+00:00';
const SAVED_AT_V2 = '2026-08-23T08:28:38.846165+00:00';
const SAVED_AT_V3 = '2026-08-23T08:30:14.423624+00:00';
const RECIPE_ID = '1d14a107-9284-4b04-9e7a-1454c6ec9c53';

const recipeInput = (grams: number) => ({
  items: [
    {
      id: 'line-milk',
      ingredient: {
        id: 'milk',
        name: 'MILK',
        category: 'dairy',
        composition: {},
        pod_value: null,
        pac_value: null,
        de_value: null,
        cost_per_kg: null,
        confidence_score: 100,
        source_type: 'manual',
        is_verified: true,
      },
      planned_grams: grams,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'eco' },
  pinguino_profile_v1: {
    visibleProductType: 'protein',
    mode: 'classic',
    formulationStrategy: 'eco',
    targetBatchGrams: 1000,
    machineKind: 'professional',
    machineId: null,
    machineLabel: 'Profesjonalna',
    servingModeId: 'temp_minus_12',
    targetTemperatureC: -12,
    machineCapacityGrams: null,
    directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const ROW = {
  id: RECIPE_ID,
  user_id: 'u1',
  name: 'QA Protein v2 -12C',
  description: null,
  product_type: null,
  serving_profile: null,
  active_engine_label: '−11°C Engine',
  engine_version: '0.4.0',
  config_version: '0.7.0',
  batch_grams: 1000,
  created_at: SAVED_AT_V1,
  updated_at: SAVED_AT_V3,
  latest_version_number: 3,
  latest_version_at: SAVED_AT_V3,
  versions: [
    { versionNumber: 3, createdAt: SAVED_AT_V3 },
    { versionNumber: 2, createdAt: SAVED_AT_V2 },
    { versionNumber: 1, createdAt: SAVED_AT_V1 },
  ],
  recipe_input: recipeInput(510),
};

const GRAMS_BY_VERSION: Record<number, number> = { 1: 510, 2: 460, 3: 510 };

/** Any write here is a test failure: browsing versions must never touch the database. */
const forbiddenWrite = (name: string) => () => {
  throw new Error(`FORBIDDEN WRITE: repository.${name} was called while browsing versions`);
};
const getVersion = vi.fn(async (recipeId: string, versionNumber: number) => ({
  versionId: `ver-${versionNumber}`,
  recipeId,
  ownerUserId: 'u1',
  versionNumber,
  recipeInput: recipeInput(GRAMS_BY_VERSION[versionNumber] ?? 0),
  productComposition: null,
  totalBatchG: 1000,
  productProfile: 'protein',
  temperatureC: -12,
  engineVersion: 'e',
  configVersion: 'c',
  mapperDatasetVersion: null,
  source: 'manual',
  createdBy: 'u1',
  createdAt: { 1: SAVED_AT_V1, 2: SAVED_AT_V2, 3: SAVED_AT_V3 }[versionNumber] ?? SAVED_AT_V3,
  restoredFromVersion: null,
  note: null,
}));
const getRecipe = vi.fn(async () => ({
  recipeId: RECIPE_ID,
  ownerUserId: 'u1',
  workspaceId: null,
  title: ROW.name,
  notes: null,
  productProfile: 'protein',
  temperatureC: -12,
  latestVersionNumber: 3,
  archived: false,
  createdAt: SAVED_AT_V1,
  updatedAt: SAVED_AT_V3,
  createdBy: 'u1',
}));

vi.mock('@/features/recipes/useSavedRecipes', () => ({
  useSavedRecipes: () => ({ data: [ROW], isLoading: false }),
  useDeleteRecipe: () => ({ mutate: () => {} }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ available: true, status: 'authed', user: { id: 'u1' }, signOut: () => {} }),
}));
vi.mock('@/features/auth/authModalStore', () => ({
  useAuthModalStore: (sel: (s: unknown) => unknown) => sel({ open: () => {} }),
}));
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({
    repository: {
      getRecipe,
      getVersion,
      getVersions: async () => [],
      listRecipes: async () => [],
      compare: async () => ({}),
      createRecipe: forbiddenWrite('createRecipe'),
      saveNewVersion: forbiddenWrite('saveNewVersion'),
      renameRecipe: forbiddenWrite('renameRecipe'),
      archiveRecipe: forbiddenWrite('archiveRecipe'),
      restore: forbiddenWrite('restore'),
    },
    unavailable: false,
    isLocalDev: false,
    mode: 'supabase',
  }),
}));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

const { MyRecipesPage } = await import('./MyRecipesPage');
const { useRecipeStore } = await import('@/stores/recipeStore');

describe('Moje receptury — WERSJA selector', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    getVersion.mockClear();
    getRecipe.mockClear();
    navigate.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <MyRecipesPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const click = async (testId: string) => {
    const el = host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    expect(el, testId).not.toBeNull();
    await act(async () => el!.click());
  };
  const openButton = () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Otwórz')!;

  it('defaults to the newest version', () => {
    const selector = host.querySelector(`[data-testid="recipe-version-selector-${ROW.name}"]`);
    expect(selector?.textContent).toContain('v3');
  });

  it('lists v3 → v2 → v1 with their own immutable dates', async () => {
    await click(`recipe-version-selector-${ROW.name}`);
    const rows = [...host.querySelectorAll('[role="option"]')];
    expect(rows.map((o) => o.textContent?.match(/^v\d+/)?.[0])).toEqual(['v3', 'v2', 'v1']);
    expect(rows[2]!.textContent).toContain('23.08.2026'); // v1: 22.08 UTC = 23.08 local
    expect(rows.filter((o) => o.textContent?.includes('Aktualna'))).toHaveLength(1);
  });

  it('selecting v1 writes NOTHING — no restore, no save, no rename', async () => {
    await click(`recipe-version-selector-${ROW.name}`);
    await click(`recipe-version-option-${ROW.name}-v1`);
    // The mocked repository throws on every write; reaching here means none was called.
    const selector = host.querySelector(`[data-testid="recipe-version-selector-${ROW.name}"]`);
    expect(selector?.textContent).toContain('v1');
    expect(getVersion).not.toHaveBeenCalled();
    expect(getRecipe).not.toHaveBeenCalled();
  });

  it('Otwórz opens the EXACT selected version, not the latest', async () => {
    await click(`recipe-version-selector-${ROW.name}`);
    await click(`recipe-version-option-${ROW.name}-v1`);
    await act(async () => openButton().click());

    expect(getVersion).toHaveBeenCalledWith(RECIPE_ID, 1);
    const state = useRecipeStore.getState();
    expect(state.currentVersionNumber).toBe(1);
    expect(state.savedRecipeLatestVersionNumber).toBe(3);
    expect(state.items[0]!.planned_grams).toBe(GRAMS_BY_VERSION[1]);
  });

  it('Otwórz on the default selection opens the latest', async () => {
    await act(async () => openButton().click());
    expect(getVersion).toHaveBeenCalledWith(RECIPE_ID, 3);
    const state = useRecipeStore.getState();
    expect(state.currentVersionNumber).toBe(3);
    expect(state.savedRecipeLatestVersionNumber).toBe(3);
  });

  it('an opened historical version is marked historical in the store', async () => {
    await click(`recipe-version-selector-${ROW.name}`);
    await click(`recipe-version-option-${ROW.name}-v2`);
    await act(async () => openButton().click());
    const state = useRecipeStore.getState();
    expect(state.currentVersionNumber).toBe(2);
    expect(state.savedRecipeLatestVersionNumber).toBe(3);
    expect(state.currentVersionNumber! < state.savedRecipeLatestVersionNumber!).toBe(true);
  });

  it('renders the WERSJA column header', () => {
    expect(host.textContent).toContain('Wersja');
  });
});
