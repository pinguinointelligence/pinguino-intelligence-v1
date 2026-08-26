// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const INPUT = {
  items: [
    {
      id: 'starter:milk',
      ingredient: {
        id: 'milk_3_5',
        name: 'Mleko 3,5%',
        category: 'dairy',
        composition: {},
        pod_value: 0.752,
        pac_value: 5.285,
        de_value: null,
        cost_per_kg: null,
        confidence_score: 100,
        source_type: 'reference',
        is_verified: true,
      },
      planned_grams: 270,
      actual_grams: null,
      lock_type: 'unlocked',
    },
    {
      id: 'starter:dextrose',
      ingredient: {
        id: 'dextrose',
        name: 'Dekstroza',
        category: 'sugar',
        composition: {},
        pod_value: 70.84,
        pac_value: 174.8,
        de_value: null,
        cost_per_kg: null,
        confidence_score: 100,
        source_type: 'reference',
        is_verified: true,
      },
      planned_grams: 50,
      actual_grams: null,
      lock_type: 'unlocked',
    },
  ],
  mode: 'classic',
  category: 'gelato',
  target_temperature_c: -13,
  target_batch_grams: 450,
  machine_capacity_grams: 450,
  goals: { formulation_strategy: 'optimal' },
};

const ROW = {
  id: 'home-recipe-1',
  user_id: 'home-user',
  name: 'HOME canonical gelato',
  description: null,
  product_type: 'gelato',
  serving_profile: null,
  active_engine_label: null,
  engine_version: 'engine',
  config_version: 'config',
  batch_grams: 450,
  created_at: '2026-08-27T00:00:00.000Z',
  updated_at: '2026-08-27T00:00:00.000Z',
  latest_version_number: 1,
  latest_version_at: '2026-08-27T00:00:00.000Z',
  versions: [{ versionNumber: 1, createdAt: '2026-08-27T00:00:00.000Z' }],
  recipe_input: INPUT,
};

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));
vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'home' }));
vi.mock('@/features/recipes/useSavedRecipes', () => ({
  useSavedRecipes: () => ({ data: [ROW], isLoading: false }),
  useDeleteRecipe: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/community/useCreatorProfile', () => ({ useCreatorProfile: () => false }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ available: true, status: 'authed', user: { id: 'home-user' } }),
}));
vi.mock('@/features/auth/authModalStore', () => ({
  useAuthModalStore: (select: (state: unknown) => unknown) => select({ open: vi.fn() }),
}));
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({
    repository: {
      getRecipe: async () => ({
        recipeId: ROW.id,
        ownerUserId: ROW.user_id,
        workspaceId: null,
        title: ROW.name,
        notes: null,
        productProfile: 'gelato',
        temperatureC: -13,
        latestVersionNumber: 1,
        archived: false,
        createdAt: ROW.created_at,
        updatedAt: ROW.updated_at,
        createdBy: ROW.user_id,
      }),
      getVersion: async () => ({
        versionId: 'home-version-1',
        recipeId: ROW.id,
        ownerUserId: ROW.user_id,
        versionNumber: 1,
        recipeInput: INPUT,
        productComposition: null,
        totalBatchG: 450,
        productProfile: 'gelato',
        temperatureC: -13,
        engineVersion: 'engine',
        configVersion: 'config',
        mapperDatasetVersion: null,
        source: 'manual',
        createdBy: ROW.user_id,
        createdAt: ROW.created_at,
        restoredFromVersion: null,
        note: null,
      }),
    },
    unavailable: false,
    isLocalDev: false,
    mode: 'supabase',
  }),
}));

const { MyRecipesPage } = await import('./MyRecipesPage');

describe('HOME saved recipe reopen', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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

  it('opens the immutable HOME version inline with exact grams instead of an empty HOME shell', async () => {
    const open = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Otwórz',
    );
    expect(open).toBeTruthy();
    await act(async () => open!.click());

    const preview = host.querySelector('[data-testid="home-opened-recipe"]');
    expect(preview?.textContent).toContain('HOME canonical gelato');
    expect(preview?.textContent).toContain('v1 · 450 g · -13°C');
    expect(preview?.textContent).toContain('Mleko 3,5%270 g');
    expect(preview?.textContent).toContain('Dekstroza50 g');
    expect(navigate).not.toHaveBeenCalled();
  });
});
