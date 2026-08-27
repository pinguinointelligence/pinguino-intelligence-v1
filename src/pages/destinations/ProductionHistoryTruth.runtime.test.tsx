// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import type { ProductionRun } from '@/features/pro-core/productionContracts';

const mocks = vi.hoisted(() => ({
  ownerUserId: 'owner-a',
  listRuns: vi.fn(),
  getCompletedSnapshot: vi.fn(),
}));

vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => 'pro',
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: mocks.ownerUserId }, status: 'authenticated' }),
}));

vi.mock('@/features/production-workspace/productionSessionStore', () => ({
  useProductionSessionStore: (selector: (state: unknown) => unknown) => selector({ session: null }),
}));

vi.mock('@/features/pro-core/proCoreProductionRepo', () => ({
  resolveProductionRepository: () => ({
    repository: { listRuns: mocks.listRuns },
    mode: 'backend',
    isLocalDev: false,
    unavailable: false,
  }),
}));

vi.mock('@/services/labels/labelRepository', () => ({
  resolveLabelRepository: () => ({
    getCompletedSnapshot: mocks.getCompletedSnapshot,
  }),
}));

vi.mock('@/features/master-label/LabelWorkspace', () => ({ LabelWorkspace: () => null }));

const { ProductionHubPage } = await import('./GlobalDestinationPages');

const run = {
  runId: 'run-persisted-1',
  ownerUserId: 'owner-a',
  recipeId: 'recipe-1',
  recipeVersionId: 'version-1',
  recipeVersionNumber: 4,
  status: 'completed',
  completedAt: '2026-08-27T08:30:00.000Z',
} as ProductionRun;

const snapshot = {
  sessionId: run.runId,
  ownerUserId: run.ownerUserId,
  productionCompletedAt: run.completedAt,
  actualFinalMassG: 1002,
  originalBatchTargetG: 1000,
  source: {
    recipeId: 'recipe-1',
    recipeVersionId: 'version-1',
    recipeVersionNumber: 4,
    recipeName: 'Pistacchio 1000',
  },
} as ProductionCompletionSnapshot;

describe('Production History ↔ Label canonical truth', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.ownerUserId = 'owner-a';
    mocks.listRuns.mockReset();
    mocks.getCompletedSnapshot.mockReset();
    mocks.listRuns.mockResolvedValue({ total: 1, offset: 0, limit: 50, items: [run] });
    mocks.getCompletedSnapshot.mockResolvedValue(snapshot);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('reads completed owner history from the durable Production repository and preserves run identity', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/production?tab=history']}>
          <ProductionHubPage />
        </MemoryRouter>,
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Pistacchio 1000');
    });

    expect(mocks.listRuns).toHaveBeenCalledWith('owner-a', {
      status: 'completed',
      sort: 'newest',
      limit: 50,
    });
    expect(mocks.getCompletedSnapshot).toHaveBeenCalledWith(run.runId);
    expect(container.querySelector('[data-production-run-id="run-persisted-1"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Brak zakończonej partii');
  });

  it('does not expose another account history', async () => {
    mocks.ownerUserId = 'owner-b';
    mocks.listRuns.mockResolvedValue({ total: 0, offset: 0, limit: 50, items: [] });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/production?tab=history']}>
          <ProductionHubPage />
        </MemoryRouter>,
      );
    });

    await vi.waitFor(() => {
      expect(mocks.listRuns).toHaveBeenCalledWith('owner-b', {
        status: 'completed',
        sort: 'newest',
        limit: 50,
      });
    });

    expect(container.textContent).not.toContain('Pistacchio 1000');
  });

  it('does not manufacture completed history when a run lacks its persisted completion snapshot', async () => {
    mocks.getCompletedSnapshot.mockResolvedValue(null);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/production?tab=history']}>
          <ProductionHubPage />
        </MemoryRouter>,
      );
    });

    await vi.waitFor(() => {
      expect(mocks.getCompletedSnapshot).toHaveBeenCalledWith(run.runId);
    });

    expect(container.textContent).not.toContain('Pistacchio 1000');
    expect(container.textContent).toContain('Nie udało się odczytać pełnej historii produkcji');
  });
});
