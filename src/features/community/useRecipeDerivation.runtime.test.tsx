// @vitest-environment jsdom
/**
 * Community „Zrób te lody" end to end, with only the network stubbed: the entitlement-gated
 * read returns the author's immutable version, and the hook must open it as the customer's
 * unsaved working copy — in HOME for a HOME customer, in the PRO editor for Pro — without
 * saving anything and without touching the source.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';

const mocks = vi.hoisted(() => ({
  persona: 'home' as 'home' | 'pro',
  getPublicationFull: vi.fn(),
  recordDerivation: vi.fn(),
  createRecipe: vi.fn(),
}));

vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mocks.persona,
}));
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({
    repository: { createRecipe: mocks.createRecipe },
    unavailable: false,
    isLocalDev: false,
  }),
}));
vi.mock('@/services/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/community')>()),
  getPublicationFull: mocks.getPublicationFull,
  recordDerivation: mocks.recordDerivation,
}));

const { useRecipeDerivation } = await import('./useRecipeDerivation');
const { useRecipeStore } = await import('@/stores/recipeStore');
const { useHomeDraftStore } = await import('@/features/home-creator/homeDraftStore');
const { useAuthStore } = await import('@/stores/authStore');

const TARGET = {
  source: { kind: 'publication', publicationId: 'pub-1', handle: 'anna', slug: 'qa-gelato' },
  sourceTitle: 'QA Gelato',
  sourceCreatorDisplayName: 'Anna QA',
} as const;

const sourceInput = (): RecipeInput => ({
  items: structuredClone(DEFAULT_PRESET.items),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

function Harness() {
  const derivation = useRecipeDerivation(TARGET);
  return (
    <>
      <button type="button" data-testid="make" onClick={() => void derivation.useThisRecipe()}>
        make
      </button>
      <output data-testid="status">{derivation.state.status}</output>
    </>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('Community „Zrób te lody" opens a working copy', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let published: RecipeInput;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.persona = 'home';
    mocks.createRecipe.mockReset();
    mocks.recordDerivation.mockReset();
    published = sourceInput();
    mocks.getPublicationFull.mockReset().mockResolvedValue({
      ok: true,
      entitlement: 'full',
      recipe_input: published,
      product_composition: null,
      recipe_id: 'author-recipe',
      version_number: 3,
      total_batch_g: 1000,
      engine_version: 'engine-test',
      config_version: 'config-test',
    });
    useAuthStore.setState({ user: { id: 'customer-1' } as never, status: 'authed' });
    useRecipeStore.getState().resetToDemo();
    useHomeDraftStore.getState().startNew();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  /** Rendered per test, AFTER the test chose its persona. */
  const render = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/community/anna/qa-gelato']}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <LocationProbe />
                  <Harness />
                </>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });
  };

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const make = async () => {
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="make"]')!.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const location = () => host.querySelector('[data-testid="location"]')?.textContent;

  it('HOME: the copy opens in HOME as its recipe — nothing saved, the source untouched', async () => {
    const before = structuredClone(published);
    await make();
    const state = useRecipeStore.getState();
    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('done');
    expect(mocks.createRecipe).not.toHaveBeenCalled();
    expect(mocks.recordDerivation).not.toHaveBeenCalled();
    expect(state.savedRecipeId).toBeNull();
    expect(state.items.map((item) => item.ingredient.id)).toEqual(
      published.items.map((item) => item.ingredient.id),
    );
    expect(state.provenance).toEqual({
      schemaVersion: 1,
      kind: 'community',
      relation: 'copy',
      publicationId: 'pub-1',
      shareLinkId: null,
      sourceTitle: 'QA Gelato',
      sourceCreatorDisplayName: 'Anna QA',
      sourceVersionNumber: 3,
    });
    expect(useHomeDraftStore.getState().recipeReady).toBe(true);
    expect(useHomeDraftStore.getState().derivedFromPublicationId).toBe('pub-1');
    expect(location()).toBe('/home');
    expect(published).toEqual(before);
  });

  it('PRO: the copy opens in the PRO editor', async () => {
    mocks.persona = 'pro';
    await make();
    expect(useRecipeStore.getState().provenance?.kind).toBe('community');
    expect(useRecipeStore.getState().savedRecipeId).toBeNull();
    expect(useHomeDraftStore.getState().recipeReady).toBe(false);
    expect(location()).toBe('/pro/recipe');
  });

  it('a customer the server does not entitle gets a refusal and keeps the current draft', async () => {
    mocks.getPublicationFull.mockResolvedValue({ ok: false, reason: 'entitlement_required' });
    const before = structuredClone(useRecipeStore.getState().items);
    await make();
    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('failed');
    expect(useRecipeStore.getState().items).toEqual(before);
    expect(useRecipeStore.getState().provenance).toBeNull();
    expect(location()).toBe('/community/anna/qa-gelato');
  });
});
