// @vitest-environment jsdom
/**
 * The workbench must never let a historical snapshot pass for the current recipe (owner v1.4 §7),
 * and the only write it offers must APPEND (§8).
 *
 * Fixture is the owner's real recipe: v1/v2/v3, viewing v1. Restoring it must produce v4 and leave
 * v1/v2/v3 alone — here that is proven by what the component asks the repository for (restore of
 * the VIEWED version) and by how it re-links the draft afterwards (to the NEW latest).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';

const V1_AT = '2026-08-22T23:29:59.494922+00:00';
const V4_AT = '2026-08-23T09:00:00.000000+00:00';
const RECIPE_ID = 'recipe-1';

const input = (grams: number) =>
  ({
    items: [
      {
        id: 'line-milk',
        ingredient: { id: 'milk', name: 'MILK' },
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
  }) as unknown as RecipeInput;

const restore = vi.fn(async (recipeId: string, targetVersionNumber: number) => ({
  versionId: 'ver-4',
  recipeId,
  ownerUserId: 'u1',
  versionNumber: 4,
  recipeInput: input(510),
  productComposition: null,
  totalBatchG: 1000,
  productProfile: 'protein',
  temperatureC: -12,
  engineVersion: 'e',
  configVersion: 'c',
  mapperDatasetVersion: null,
  source: 'restored' as const,
  createdBy: 'u1',
  createdAt: V4_AT,
  // Echo what was actually asked for, so the assertions below check a real round trip.
  restoredFromVersion: targetVersionNumber,
  note: null,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ available: true, status: 'authed', user: { id: 'u1' } }),
}));
vi.mock('./useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('./proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({
    repository: { restore },
    unavailable: false,
    isLocalDev: false,
    mode: 'supabase',
  }),
}));

const { HistoricalVersionNotice } = await import('./HistoricalVersionNotice');
const { useRecipeStore } = await import('@/stores/recipeStore');

const linkStore = (versionNumber: number | null, latest: number | null) =>
  useRecipeStore.setState({
    savedRecipeId: versionNumber === null ? null : RECIPE_ID,
    savedRecipeName: 'QA Protein v2 -12C',
    currentVersionNumber: versionNumber,
    savedRecipeLatestVersionNumber: latest,
    currentVersionDate: V1_AT,
  });

describe('HistoricalVersionNotice', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    restore.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const mount = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <HistoricalVersionNotice />
        </QueryClientProvider>,
      );
    });
  };

  it('says nothing when the newest version is open', async () => {
    linkStore(3, 3);
    await mount();
    expect(host.querySelector('[data-testid="historical-version-notice"]')).toBeNull();
  });

  it('says nothing for an unsaved draft', async () => {
    linkStore(null, null);
    await mount();
    expect(host.querySelector('[data-testid="historical-version-notice"]')).toBeNull();
  });

  it('names the open version and its own date when viewing history', async () => {
    linkStore(1, 3);
    await mount();
    const notice = host.querySelector('[data-testid="historical-version-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('Wersja v1');
    expect(notice!.textContent).toContain('23.08.2026'); // v1's own immutable timestamp, local day
    expect(notice!.textContent).toContain('v3'); // and what the newest is
  });

  it('promises that saving will not overwrite the open version', async () => {
    linkStore(1, 3);
    await mount();
    const notice = host.querySelector('[data-testid="historical-version-notice"]')!;
    expect(notice.textContent).toContain('nie nadpisze');
  });

  it('offers exactly one write action — Przywróć tę wersję', async () => {
    linkStore(2, 3);
    await mount();
    const button = host.querySelector('[data-testid="historical-version-restore"]');
    expect(button?.textContent).toContain('Przywróć tę wersję');
  });

  it('restores the VIEWED version and re-links the draft to the NEW latest', async () => {
    linkStore(1, 3);
    await mount();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="historical-version-restore"]')!.click();
    });

    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore.mock.calls[0]![1]).toBe(1); // restore v1, the one on screen

    const state = useRecipeStore.getState();
    expect(state.currentVersionNumber).toBe(4); // a NEW version, not v1 overwritten
    expect(state.savedRecipeLatestVersionNumber).toBe(4);
  });

  it('stops showing history once the restore made the draft the newest version', async () => {
    linkStore(1, 3);
    await mount();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="historical-version-restore"]')!.click();
    });
    expect(host.querySelector('[data-testid="historical-version-notice"]')).toBeNull();
  });
});
