// @vitest-environment jsdom
/**
 * Production v3 §5 — the recipe label's „Zmień ustawienia” opens THIS recipe's label
 * settings (Produkcja → Etykiety, context B: `/labels?labelView=recipe`) with a return
 * named after the recipe; the legacy `/label` address keeps that return route.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyDestinationRedirect } from '@/app/router';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import type { LabelRepository } from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { DraftLabelPanel } from './DraftLabelPanel';

vi.mock('@/services/labels/labelRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/labels/labelRepository')>();
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    ...actual,
    resolveLabelRepository: (): LabelRepository => ({
      getAccountProfile: async () => null,
      createLogoSignedUrl: async (path: string) => path,
      saveAccountProfile: unused,
      getCompletedSnapshot: async () => null,
      freezeCompletedSnapshot: unused,
      getRunLabelSnapshot: async () => null,
      getRunLabelSnapshotById: async () => null,
      listRunLabelSnapshots: async () => [],
      saveRunLabelSnapshot: unused,
      uploadLogo: unused,
    }),
  };
});

function LabelsProbe() {
  const location = useLocation();
  return (
    <output
      data-testid="labels-probe"
      data-path={`${location.pathname}${location.search}`}
      data-state={JSON.stringify(location.state ?? null)}
    />
  );
}

describe('recipe label → Etykiety (context B)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useRecipeStore.getState().resetToDemo();
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'draft-link-owner', email: null, displayName: null },
      available: true,
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('opens /labels?labelView=recipe with a return to the exact recipe route', async () => {
    const recipeInput = buildRecipeInput(useRecipeStore.getState());
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pro/recipe?panel=summary&version=v1']}>
          <Routes>
            <Route
              path="/pro/recipe"
              element={<DraftLabelPanel recipeInput={recipeInput} fallback={<p>fallback</p>} />}
            />
            <Route path="/labels" element={<LabelsProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="draft-label-change"]')).not.toBeNull(),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="draft-label-change"]')!.click(),
    );
    const probe = host.querySelector<HTMLElement>('[data-testid="labels-probe"]')!;
    expect(probe.dataset.path).toBe('/labels?labelView=recipe');
    expect(JSON.parse(probe.dataset.state!)).toEqual({
      labelSettingsReturn: {
        to: '/pro/recipe?panel=summary&version=v1',
        scrollTop: 0,
        origin: 'recipe',
      },
    });
  });

  it('keeps the navigation state through the legacy /label redirect', async () => {
    const state = { labelSettingsReturn: { to: '/pro/recipe?panel=summary', scrollTop: 88 } };
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[{ pathname: '/label', search: '?labelView=recipe', state }]}>
          <Routes>
            <Route path="/label" element={<LegacyDestinationRedirect pathname="/labels" />} />
            <Route path="/labels" element={<LabelsProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    const probe = host.querySelector<HTMLElement>('[data-testid="labels-probe"]')!;
    expect(probe.dataset.path).toBe('/labels?labelView=recipe');
    expect(JSON.parse(probe.dataset.state!)).toEqual(state);
  });
});
