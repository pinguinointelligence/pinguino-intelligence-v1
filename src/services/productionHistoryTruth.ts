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
}

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
  limit = 50,
}: {
  productionRepository: ProductionRepository;
  labelRepository: LabelRepository;
  ownerUserId: string;
  limit?: number;
}): Promise<CanonicalProductionHistory> {
  const page = await productionRepository.listRuns(ownerUserId, {
    status: 'completed',
    sort: 'newest',
    limit,
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
  return { entries, unresolvedRunIds };
}
