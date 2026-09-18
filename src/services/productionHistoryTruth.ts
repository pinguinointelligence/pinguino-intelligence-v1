import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import type { LabelRepository } from '@/services/labels/labelRepository';

export interface CanonicalProductionHistoryEntry {
  run: ProductionRun;
  snapshot: ProductionCompletionSnapshot;
}

export interface CanonicalProductionHistory {
  entries: CanonicalProductionHistoryEntry[];
  unresolvedRunIds: string[];
  /** Every completed run of this owner, not only this page (the repository's `total`). */
  total: number;
  /** The offset this page was read from. */
  offset: number;
  /** How many completed runs this page read — resolved and unresolved alike. The next page
   * starts at `offset + readCount`, so an unresolved snapshot never shifts the paging. */
  readCount: number;
}

/** One page of production history. The limit is a page size, never a cap on the history. */
export const PRODUCTION_HISTORY_PAGE_SIZE = 50;

export function completedSnapshotMatchesRun(
  run: ProductionRun,
  snapshot: ProductionCompletionSnapshot,
  ownerUserId: string,
): boolean {
  return (
    run.status === 'completed' &&
    run.ownerUserId === ownerUserId &&
    snapshot.ownerUserId === ownerUserId &&
    snapshot.sessionId === run.runId &&
    snapshot.source.recipeId === run.recipeId &&
    snapshot.source.recipeVersionId === run.recipeVersionId &&
    snapshot.source.recipeVersionNumber === run.recipeVersionNumber &&
    snapshot.productionCompletedAt === run.completedAt
  );
}

/**
 * Production history and Label share the same durable truth:
 * an owner-scoped completed run plus its server-frozen completion snapshot.
 * Missing or mismatched snapshots are reported as contradictions, never
 * manufactured from label UI state or silently presented as an empty history.
 */
export async function loadCanonicalProductionHistory({
  productionRepository,
  labelRepository,
  ownerUserId,
  limit = PRODUCTION_HISTORY_PAGE_SIZE,
  offset = 0,
}: {
  productionRepository: ProductionRepository;
  labelRepository: LabelRepository;
  ownerUserId: string;
  limit?: number;
  offset?: number;
}): Promise<CanonicalProductionHistory> {
  const page = await productionRepository.listRuns(ownerUserId, {
    status: 'completed',
    sort: 'newest',
    limit,
    offset,
  });
  const resolved = await Promise.all(
    page.items.map(async (run) => {
      try {
        return {
          run,
          snapshot: await labelRepository.getCompletedSnapshot(run.runId),
        };
      } catch {
        return { run, snapshot: null };
      }
    }),
  );
  const entries: CanonicalProductionHistoryEntry[] = [];
  const unresolvedRunIds: string[] = [];
  for (const candidate of resolved) {
    if (
      candidate.snapshot &&
      completedSnapshotMatchesRun(candidate.run, candidate.snapshot, ownerUserId)
    ) {
      entries.push({ run: candidate.run, snapshot: candidate.snapshot });
    } else {
      unresolvedRunIds.push(candidate.run.runId);
    }
  }
  return {
    entries,
    unresolvedRunIds,
    total: page.total,
    offset,
    readCount: page.items.length,
  };
}
