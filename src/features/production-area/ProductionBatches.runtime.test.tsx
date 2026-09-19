// @vitest-environment jsdom
/**
 * Production v3 §6 — Partie „W toku” reads the durable sources (server `listRuns`
 * + local `sessionsById`), survives a refresh and a local clear, and „Wróć do
 * partii” asks about unsaved recipe changes before opening the exact run.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { createProductionSession } from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';

const OWNER = 'owner-batches';

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  resume: vi.fn(),
  openDurableRun: vi.fn(),
}));

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('@/features/pro-core/proCoreProductionRepo', () => ({
  resolveProductionRepository: () => ({
    repository: { listRuns: mocks.listRuns, getRun: vi.fn(async () => null) },
    mode: 'backend',
    isLocalDev: false,
    unavailable: false,
  }),
}));
vi.mock('@/services/labels/labelRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/labels/labelRepository')>()),
  resolveLabelRepository: () => ({
    listRunLabelSnapshots: async () => [],
    getCompletedSnapshot: async () => null,
  }),
}));
vi.mock('./resumeProductionRun', () => ({ resumeProductionRun: mocks.resume }));
vi.mock('./openDurableRun', () => ({ openDurableRun: mocks.openDurableRun }));

const { ProductionHubPage } = await import('@/pages/destinations/GlobalDestinationPages');

const input = (): RecipeInput => ({
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

const local = (sessionId: string, startedAt: string) =>
  createProductionSession({
    sessionId,
    ownerUserId: OWNER,
    source: {
      recipeId: 'recipe-straw',
      recipeVersionId: 'version-straw-2',
      recipeVersionNumber: 2,
      recipeName: 'Truskawkowe gelato',
    },
    plannedInput: input(),
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input().items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: {},
      migrationAmbiguities: [],
    },
    startedAt,
  });

const serverRun = (runId: string, createdAt: string) =>
  ({
    runId,
    ownerUserId: OWNER,
    recipeId: 'recipe-straw',
    recipeVersionId: 'version-straw-2',
    recipeVersionNumber: 2,
    status: 'in_progress',
    plannedBatchG: 1000,
    plannedItems: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cancelledAt: null,
    events: [{ type: 'started', at: createdAt }],
  }) as unknown as ProductionRun;

function LocationProbe() {
  const location = useLocation();
  return (
    <output
      data-testid="location"
      data-path={location.pathname}
      data-search={location.search}
    />
  );
}

describe('Partie → W toku', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.listRuns.mockReset();
    mocks.resume.mockReset();
    mocks.openDurableRun.mockReset();
    mocks.openDurableRun.mockResolvedValue({ ok: false, reason: 'run-missing' });
    mocks.listRuns.mockImplementation(async (_owner: string, query: { status?: string }) =>
      query.status === 'in_progress'
        ? {
            total: 2,
            offset: 0,
            limit: 5,
            items: [
              serverRun('run-r2', '2026-09-17T09:00:00.000Z'),
              serverRun('run-r1', '2026-09-17T08:00:00.000Z'),
            ],
          }
        : { total: 0, offset: 0, limit: 50, items: [] },
    );
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    // A refreshed page: the durable local runs exist, the tab projection does not.
    useProductionSessionStore.setState({
      session: null,
      sessionsById: {
        'run-r1': local('run-r1', '2026-09-17T08:00:00.000Z'),
        'run-r2': local('run-r2', '2026-09-17T09:00:00.000Z'),
      },
      selectedSessionIdByAddress: {},
      activeAddressKey: null,
      archivedSessions: [],
    });
    useRecipeStore.getState().resetToDemo();
    useRecipeStore.setState({ dirty: false });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/production']}>
          <LocationProbe />
          <Routes>
            <Route path="/production" element={<ProductionHubPage />} />
            <Route path="/pro/production" element={<p data-testid="workbench-production" />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const rows = () =>
    [...host.querySelectorAll<HTMLElement>('[data-in-progress-run-id]')].map(
      (row) => row.dataset.inProgressRunId,
    );
  const resumeButton = (runId: string) =>
    host.querySelector<HTMLButtonElement>(
      `[data-in-progress-run-id="${runId}"] [data-testid="production-resume-run"]`,
    )!;
  const continueButton = (runId: string) =>
    host.querySelector<HTMLButtonElement>(
      `[data-in-progress-run-id="${runId}"] [data-testid="production-continue-run"]`,
    )!;

  it('shows the runs in progress after a refresh — newest first — instead of „Otwórz recepturę…”', async () => {
    await render();
    await vi.waitFor(() => expect(rows()).toEqual(['run-r2', 'run-r1']));
    expect(host.textContent).toContain('Truskawkowe gelato');
    expect(host.textContent).not.toContain('Nie masz teraz partii w toku.');
    expect(mocks.listRuns).toHaveBeenCalledWith(OWNER, {
      status: 'in_progress',
      sort: 'newest',
      limit: 5,
    });
    /* One black action, and Etap 2 moved WHICH one it is: continuing the batch is the
       thing the operator came for. „Otwórz recepturę partii" replaces the workbench
       context, so it stays quiet — and never black. */
    expect(continueButton('run-r2').className).toContain('bg-ink');
    expect(continueButton('run-r1').className).not.toContain('bg-ink');
    expect(resumeButton('run-r2').className).not.toContain('bg-ink');
  });

  it('„Kontynuuj partię" opens the batch in place, taking nothing from the editor', async () => {
    // A draft the operator has not saved — the thing the old path silently destroyed.
    useRecipeStore.setState({ dirty: true });
    const draftBefore = JSON.stringify(useRecipeStore.getState());
    await render();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));

    await act(async () => continueButton('run-r1').click());

    // The batch lives in the ADDRESS, so a refresh finds it again…
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLElement>('[data-testid="location"]')?.dataset.search,
      ).toContain('run=run-r1'),
    );
    // …the workbench was never asked for, and no gate appeared…
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="confirm-new-recipe"]')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-testid="location"]')?.dataset.path).toBe(
      '/production',
    );
    // …and the draft is exactly where the operator left it.
    expect(JSON.stringify(useRecipeStore.getState())).toBe(draftBefore);
  });

  it('does not strand the batch when the list refetches while it loads', async () => {
    /* The served defect this pins: the loader re-ran when „W toku" refreshed, cancelled
       the request it had already started, and then refused to start another — so
       „Wczytujemy partię…" stayed on screen for ever. The run must still arrive. */
    let settle: ((value: unknown) => void) | undefined;
    mocks.openDurableRun.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    await render();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    await act(async () => continueButton('run-r1').click());
    expect(mocks.openDurableRun).toHaveBeenCalledTimes(1);

    // The list changes identity underneath the in-flight load, exactly as it does live.
    await act(async () => {
      useProductionSessionStore.setState((current) => ({ ...current }));
    });
    expect(mocks.openDurableRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle!({ ok: false, reason: 'run-missing' });
    });
    // Resolved, not stranded: the honest refusal replaced „Wczytujemy partię…".
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="production-opened-run"]')?.textContent).toContain(
        'Nie udało się otworzyć tej partii',
      ),
    );
  });

  it('keeps the list from the server after a local clear („+ Nowa receptura”)', async () => {
    useProductionSessionStore.getState().clear();
    await render();
    await vi.waitFor(() => expect(rows()).toEqual(['run-r2', 'run-r1']));
  });

  it('asks about unsaved recipe changes, then opens exactly the tapped run', async () => {
    useRecipeStore.setState({ dirty: true });
    mocks.resume.mockResolvedValue({ ok: true, to: '/pro/production' });
    await render();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));

    await act(async () => resumeButton('run-r1').click());
    const confirm = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-new-recipe"]',
    );
    expect(confirm).not.toBeNull();
    expect(document.body.textContent).toContain('Otworzyć recepturę tej partii?');
    expect(mocks.resume).not.toHaveBeenCalled();

    await act(async () => confirm!.click());
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="location"]')?.getAttribute('data-path')).toBe(
        '/pro/production',
      ),
    );
    expect(mocks.resume).toHaveBeenCalledTimes(1);
    expect(mocks.resume.mock.calls[0]![0].run).toMatchObject({
      runId: 'run-r1',
      recipeId: 'recipe-straw',
      recipeVersionId: 'version-straw-2',
      recipeVersionNumber: 2,
    });
  });

  it('says honestly when a run cannot be opened and stays in Partie', async () => {
    mocks.resume.mockResolvedValue({ ok: false, reason: 'plan-differs' });
    await render();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    await act(async () => resumeButton('run-r1').click());
    await vi.waitFor(() =>
      expect(
        host.querySelector('[data-in-progress-run-id="run-r1"] [role="alert"]'),
      ).not.toBeNull(),
    );
    expect(host.textContent).toContain('Tej partii nie da się teraz otworzyć');
    expect(host.querySelector('[data-testid="location"]')?.getAttribute('data-path')).toBe(
      '/production',
    );
  });

  it('shows this device’s runs when the server cannot be reached', async () => {
    mocks.listRuns.mockImplementation(async (_owner: string, query: { status?: string }) => {
      if (query.status === 'in_progress') throw new Error('offline');
      return { total: 0, offset: 0, limit: 50, items: [] };
    });
    await render();
    await vi.waitFor(() => expect(rows()).toEqual(['run-r2', 'run-r1']));
    expect(host.textContent).toContain('Pokazujemy partie zapisane na tym urządzeniu.');
  });
});
