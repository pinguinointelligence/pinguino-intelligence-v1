import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadCanonicalProductionHistory,
  PRODUCTION_HISTORY_PAGE_SIZE,
  type CanonicalProductionHistoryEntry,
} from '@/services/productionHistoryTruth';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import type { LabelRepository, RunLabelSnapshot } from '@/services/labels/labelRepository';

export interface ProductionHistoryPages {
  entries: CanonicalProductionHistoryEntry[];
  /** Every completed run of the owner (repository `total`). */
  total: number;
  /** Completed runs read so far (resolved and unresolved) — the next page's offset. */
  readCount: number;
  state: 'loading' | 'ready' | 'error';
  olderState: 'idle' | 'loading' | 'error';
  /** Saved label versions per run, from ONE `listRunLabelSnapshots()` read (null: unknown). */
  labelVersionsByRun: ReadonlyMap<string, number> | null;
  loadOlder: () => void;
  retry: () => void;
}

interface HistoryLoad {
  key: string;
  entries: CanonicalProductionHistoryEntry[];
  total: number;
  readCount: number;
  unresolved: number;
  state: 'loading' | 'ready' | 'error';
  olderState: 'idle' | 'loading' | 'error';
}

/** Page count that covers `shown` runs — a return from a label restores whole pages. */
export const historyLimitFor = (shown: number | null | undefined): number =>
  Math.max(1, Math.ceil(Math.max(shown ?? 0, 1) / PRODUCTION_HISTORY_PAGE_SIZE)) *
  PRODUCTION_HISTORY_PAGE_SIZE;

async function readLabelVersions(
  labelRepository: LabelRepository,
): Promise<ReadonlyMap<string, number> | null> {
  try {
    const items: RunLabelSnapshot[] = await labelRepository.listRunLabelSnapshots();
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.runId, (counts.get(item.runId) ?? 0) + 1);
    return counts;
  } catch {
    return null;
  }
}

/**
 * Produkcja → Partie → Historia produkcji, paged instead of ending at the first 50
 * (Production v3 §6). Rows are completed RUNS (`loadCanonicalProductionHistory`),
 * one per run, never merged by recipe, and never dependent on a saved label.
 */
export function useProductionHistoryPages({
  enabled,
  ownerUserId,
  productionRepository,
  labelRepository,
  initialShown,
}: {
  enabled: boolean;
  ownerUserId: string | null;
  productionRepository: ProductionRepository | null;
  labelRepository: LabelRepository;
  /** Runs that were loaded when the reader left for a label (restores whole pages). */
  initialShown?: number | null;
}): ProductionHistoryPages {
  const [revision, setRevision] = useState(0);
  const key = `${ownerUserId ?? ''}:${revision}`;
  const [load, setLoad] = useState<HistoryLoad | null>(null);
  const [labelVersions, setLabelVersions] = useState<{
    key: string;
    counts: ReadonlyMap<string, number> | null;
  } | null>(null);
  const [pageLimit, setPageLimit] = useState(() => historyLimitFor(initialShown));

  useEffect(() => {
    if (!enabled || !ownerUserId || !productionRepository) return;
    let cancelled = false;
    void loadCanonicalProductionHistory({
      productionRepository,
      labelRepository,
      ownerUserId,
      limit: pageLimit,
      offset: 0,
    })
      .then((result) => {
        if (cancelled) return;
        setLoad({
          key,
          entries: result.entries,
          total: result.total,
          readCount: result.readCount,
          unresolved: result.unresolvedRunIds.length,
          state: result.unresolvedRunIds.length > 0 ? 'error' : 'ready',
          olderState: 'idle',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoad({
          key,
          entries: [],
          total: 0,
          readCount: 0,
          unresolved: 0,
          state: 'error',
          olderState: 'idle',
        });
      });
    void readLabelVersions(labelRepository).then((counts) => {
      if (!cancelled) setLabelVersions({ key, counts });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, labelRepository, ownerUserId, pageLimit, productionRepository]);

  const current = load?.key === key ? load : null;

  const loadOlder = useCallback(() => {
    if (!current || !ownerUserId || !productionRepository) return;
    if (current.olderState === 'loading' || current.readCount >= current.total) return;
    const offset = current.readCount;
    setLoad((previous) =>
      previous && previous.key === key ? { ...previous, olderState: 'loading' } : previous,
    );
    void loadCanonicalProductionHistory({
      productionRepository,
      labelRepository,
      ownerUserId,
      offset,
    })
      .then((result) => {
        setLoad((previous) => {
          if (!previous || previous.key !== key || previous.readCount !== offset) return previous;
          const known = new Set(previous.entries.map((entry) => entry.run.runId));
          const unresolved = previous.unresolved + result.unresolvedRunIds.length;
          return {
            ...previous,
            entries: [
              ...previous.entries,
              ...result.entries.filter((entry) => !known.has(entry.run.runId)),
            ],
            total: result.total,
            readCount: previous.readCount + result.readCount,
            unresolved,
            state: unresolved > 0 ? 'error' : 'ready',
            olderState: 'idle',
          };
        });
      })
      .catch(() => {
        setLoad((previous) =>
          previous && previous.key === key ? { ...previous, olderState: 'error' } : previous,
        );
      });
  }, [current, key, labelRepository, ownerUserId, productionRepository]);

  const retry = useCallback(() => {
    // Retrying keeps the pages the reader already opened.
    setPageLimit(historyLimitFor(current?.readCount || initialShown));
    setLoad(null);
    setRevision((value) => value + 1);
  }, [current?.readCount, initialShown]);

  const labelVersionsByRun = labelVersions?.key === key ? labelVersions.counts : null;
  const unavailable = !ownerUserId || !productionRepository;
  return useMemo(
    () => ({
      entries: current?.entries ?? [],
      total: current?.total ?? 0,
      readCount: current?.readCount ?? 0,
      state: unavailable ? 'error' : (current?.state ?? 'loading'),
      olderState: current?.olderState ?? 'idle',
      labelVersionsByRun,
      loadOlder,
      retry,
    }),
    [current, labelVersionsByRun, loadOlder, retry, unavailable],
  );
}
