import { describe, expect, it, vi } from 'vitest';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import type { LabelRepository } from '@/services/labels/labelRepository';
import {
  completedSnapshotMatchesRun,
  loadCanonicalProductionHistory,
} from './productionHistoryTruth';

const ownerUserId = 'owner-a';

const run = (patch: Partial<ProductionRun> = {}): ProductionRun =>
  ({
    runId: 'run-1',
    ownerUserId,
    recipeId: 'recipe-1',
    recipeVersionId: 'version-1',
    recipeVersionNumber: 3,
    status: 'completed',
    completedAt: '2026-08-27T08:30:00.000Z',
    ...patch,
  }) as ProductionRun;

const snapshot = (
  patch: Partial<ProductionCompletionSnapshot> = {},
): ProductionCompletionSnapshot =>
  ({
    sessionId: 'run-1',
    ownerUserId,
    productionCompletedAt: '2026-08-27T08:30:00.000Z',
    source: {
      recipeId: 'recipe-1',
      recipeVersionId: 'version-1',
      recipeVersionNumber: 3,
      recipeName: 'Pistacchio',
    },
    ...patch,
  }) as ProductionCompletionSnapshot;

function repositories(
  items: ProductionRun[],
  snapshots: Map<string, ProductionCompletionSnapshot>,
) {
  const listRuns = vi.fn().mockResolvedValue({
    total: items.length,
    offset: 0,
    limit: 50,
    items,
  });
  const getCompletedSnapshot = vi.fn((runId: string) =>
    Promise.resolve(snapshots.get(runId) ?? null),
  );
  return {
    listRuns,
    getCompletedSnapshot,
    productionRepository: { listRuns } as unknown as ProductionRepository,
    labelRepository: { getCompletedSnapshot } as unknown as LabelRepository,
  };
}

describe('completedSnapshotMatchesRun', () => {
  it('requires the same owner, run, recipe version and completion time', () => {
    expect(completedSnapshotMatchesRun(run(), snapshot(), ownerUserId)).toBe(true);
    expect(
      completedSnapshotMatchesRun(run(), snapshot({ sessionId: 'run-other' }), ownerUserId),
    ).toBe(false);
    expect(
      completedSnapshotMatchesRun(run(), snapshot({ ownerUserId: 'owner-other' }), ownerUserId),
    ).toBe(false);
    expect(
      completedSnapshotMatchesRun(
        run(),
        snapshot({
          source: {
            ...snapshot().source,
            recipeVersionId: 'version-other',
          },
        }),
        ownerUserId,
      ),
    ).toBe(false);
    expect(
      completedSnapshotMatchesRun(
        run(),
        snapshot({ productionCompletedAt: '2026-08-27T08:31:00.000Z' }),
        ownerUserId,
      ),
    ).toBe(false);
  });

  it('rejects unfinished and cross-account runs', () => {
    expect(
      completedSnapshotMatchesRun(run({ status: 'in_progress' }), snapshot(), ownerUserId),
    ).toBe(false);
    expect(
      completedSnapshotMatchesRun(run({ ownerUserId: 'owner-other' }), snapshot(), ownerUserId),
    ).toBe(false);
  });
});

describe('loadCanonicalProductionHistory', () => {
  it('reads only completed owner-scoped runs and returns newest durable identities', async () => {
    const secondRun = run({
      runId: 'run-2',
      completedAt: '2026-08-27T09:30:00.000Z',
    });
    const secondSnapshot = snapshot({
      sessionId: 'run-2',
      productionCompletedAt: '2026-08-27T09:30:00.000Z',
    });
    const repos = repositories(
      [secondRun, run()],
      new Map([
        ['run-2', secondSnapshot],
        ['run-1', snapshot()],
      ]),
    );

    const result = await loadCanonicalProductionHistory({
      productionRepository: repos.productionRepository,
      labelRepository: repos.labelRepository,
      ownerUserId,
    });

    expect(repos.listRuns).toHaveBeenCalledWith(ownerUserId, {
      status: 'completed',
      sort: 'newest',
      limit: 50,
      offset: 0,
    });
    expect(result.entries.map((entry) => entry.run.runId)).toEqual(['run-2', 'run-1']);
    expect(result.unresolvedRunIds).toEqual([]);
    expect(result.total).toBe(2);
    expect(result.readCount).toBe(2);
  });

  it('reports missing and mismatched snapshots without manufacturing rows', async () => {
    const mismatchedRun = run({ runId: 'run-2' });
    const repos = repositories(
      [run(), mismatchedRun],
      new Map([['run-2', snapshot({ sessionId: 'run-other' })]]),
    );

    const result = await loadCanonicalProductionHistory({
      productionRepository: repos.productionRepository,
      labelRepository: repos.labelRepository,
      ownerUserId,
    });

    expect(result.entries).toEqual([]);
    expect(result.unresolvedRunIds).toEqual(['run-1', 'run-2']);
  });

  it('keeps valid rows visible when one snapshot read fails', async () => {
    const secondRun = run({ runId: 'run-2' });
    const repos = repositories([run(), secondRun], new Map([['run-1', snapshot()]]));
    repos.getCompletedSnapshot.mockImplementation((runId: string) =>
      runId === 'run-2'
        ? Promise.reject(new Error('provider unavailable'))
        : Promise.resolve(snapshot()),
    );

    const result = await loadCanonicalProductionHistory({
      productionRepository: repos.productionRepository,
      labelRepository: repos.labelRepository,
      ownerUserId,
    });

    expect(result.entries.map((entry) => entry.run.runId)).toEqual(['run-1']);
    expect(result.unresolvedRunIds).toEqual(['run-2']);
  });

  it('reads history in pages: the limit is a page size, and total counts every completed run', async () => {
    const runs = Array.from({ length: 60 }, (_, index) =>
      run({
        runId: `run-${String(index).padStart(2, '0')}`,
        completedAt: new Date(Date.UTC(2026, 7, 1, 0, 60 - index)).toISOString(),
      }),
    );
    const snapshots = new Map(
      runs.map((item) => [
        item.runId,
        snapshot({ sessionId: item.runId, productionCompletedAt: item.completedAt! }),
      ]),
    );
    const listRuns = vi.fn(async (_owner: string, query: { offset?: number; limit?: number }) => ({
      total: runs.length,
      offset: query.offset ?? 0,
      limit: query.limit ?? null,
      items: runs.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? runs.length)),
    }));
    const getCompletedSnapshot = vi.fn(async (runId: string) => snapshots.get(runId) ?? null);
    const productionRepository = { listRuns } as unknown as ProductionRepository;
    const labelRepository = { getCompletedSnapshot } as unknown as LabelRepository;

    const first = await loadCanonicalProductionHistory({
      productionRepository,
      labelRepository,
      ownerUserId,
    });
    expect(first.entries).toHaveLength(50);
    expect(first.total).toBe(60);
    expect(first.readCount).toBe(50);

    const second = await loadCanonicalProductionHistory({
      productionRepository,
      labelRepository,
      ownerUserId,
      offset: first.offset + first.readCount,
    });
    expect(listRuns).toHaveBeenLastCalledWith(ownerUserId, {
      status: 'completed',
      sort: 'newest',
      limit: 50,
      offset: 50,
    });
    expect(second.entries.map((entry) => entry.run.runId)).toEqual(
      runs.slice(50).map((item) => item.runId),
    );
    expect(second.total).toBe(60);
    expect(second.offset).toBe(50);
  });

  it('counts an unresolved snapshot as read so the next page does not repeat or skip runs', async () => {
    const repos = repositories([run(), run({ runId: 'run-2' })], new Map([['run-1', snapshot()]]));
    const result = await loadCanonicalProductionHistory({
      productionRepository: repos.productionRepository,
      labelRepository: repos.labelRepository,
      ownerUserId,
    });
    expect(result.entries.map((entry) => entry.run.runId)).toEqual(['run-1']);
    expect(result.unresolvedRunIds).toEqual(['run-2']);
    expect(result.readCount).toBe(2);
  });
});
