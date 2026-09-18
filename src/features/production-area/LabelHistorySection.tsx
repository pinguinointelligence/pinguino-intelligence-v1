import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { productionBatchesLabelsCopy } from '@/copy/productionBatchesLabels';
import { filterLabelHistory } from '@/features/master-label/labelHistorySearch';
import { lotCodeForDisplay } from '@/features/master-label/labelPresentation';
import {
  labelSettingsReturn,
  readLabelSettingsRestore,
} from '@/features/master-label/labelSettingsNavigation';
import type { LabelRepository, RunLabelSnapshot } from '@/services/labels/labelRepository';

const c = productionBatchesLabelsCopy.labels;
const dateFormat = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
};

interface LabelHistoryRun {
  runId: string;
  name: string;
  lot: string;
  recipeVersion: number | null;
  versions: RunLabelSnapshot[];
}

const primaryName = (item: RunLabelSnapshot): string =>
  item.label.labelLanguages
    .map((language) => item.label.productName?.[language])
    .find((name) => name?.trim()) ??
  Object.values(item.label.productName ?? {}).find((name) => name?.trim()) ??
  '';

/** Group the saved versions by run, newest run first, each run's versions v1 → vN. */
function groupByRun(items: readonly RunLabelSnapshot[]): LabelHistoryRun[] {
  const runs = new Map<string, LabelHistoryRun>();
  for (const item of items) {
    const run = runs.get(item.runId);
    if (run) run.versions.push(item);
    else {
      runs.set(item.runId, {
        runId: item.runId,
        name: primaryName(item),
        lot: lotCodeForDisplay(item.label.lotCode ?? ''),
        recipeVersion: item.label.sourceRecipeVersionNumber ?? null,
        versions: [item],
      });
    }
  }
  return [...runs.values()].map((run) => ({
    ...run,
    versions: [...run.versions].sort((a, b) => a.version - b.version),
  }));
}

/**
 * Produkcja → Etykiety, context A: „Historia etykiet” — the SAVED label versions of
 * completed runs (`listRunLabelSnapshots`), searchable by name or LOT. The same
 * labels and identifiers as the production history: no second history.
 *
 * A version opens the run's label with a return that keeps the search and the
 * place (`labelSettingsReturn { origin: 'label-history', query, scrollTop }`).
 */
export function LabelHistorySection({ repository }: { repository: LabelRepository }) {
  const location = useLocation();
  const navigate = useNavigate();
  const restore = useMemo(() => {
    const candidate = readLabelSettingsRestore(location.state);
    return candidate?.origin === 'label-history' ? candidate : null;
    // One arrival = one `location.key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const [history, setHistory] = useState<{ items: RunLabelSnapshot[]; failed: boolean } | null>(
    null,
  );
  /* §40 — one plain field over the records this user already has. No AI, no
     Mapper, no network: those answer a different question and would make a
     local lookup slow, chargeable and occasionally wrong. */
  const [query, setQuery] = useState(() => restore?.query ?? '');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await repository.listRunLabelSnapshots();
        if (!cancelled) setHistory({ items, failed: false });
      } catch {
        if (!cancelled) setHistory({ items: [], failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const runs = useMemo(
    () => groupByRun(filterLabelHistory(history?.items ?? [], query)),
    [history, query],
  );

  const restoredKey = useRef<string | null>(null);
  useEffect(() => {
    if (!restore || !history || restoredKey.current === location.key) return;
    restoredKey.current = location.key;
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: restore.scrollTop });
  }, [history, location.key, restore]);

  const openVersion = (event: MouseEvent<HTMLAnchorElement>, item: RunLabelSnapshot) => {
    event.preventDefault();
    navigate(
      `/labels?run=${encodeURIComponent(item.runId)}&snapshot=${encodeURIComponent(item.snapshotId)}`,
      {
        state: {
          labelSettingsReturn: labelSettingsReturn('/labels', '', window.scrollY, {
            origin: 'label-history',
            query,
          }),
        },
      },
    );
  };

  const total = history?.items.length ?? 0;
  return (
    <section className="mt-10 border-t border-[var(--g-line)] pt-8" data-testid="label-history">
      <h2 className="text-xl font-semibold text-ink">{c.historyTitle}</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--g-text-secondary)]">{c.historyHelper}</p>
      {total > 0 ? (
        <label className="mt-4 block sm:max-w-sm">
          <span className="sr-only">{c.historySearch}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={c.historySearch}
            data-testid="label-history-search"
            className="pro-focus-ring min-h-11 w-full rounded-[10px] border border-[var(--g-line)] bg-white px-3 text-sm text-ink"
          />
        </label>
      ) : null}
      {history?.failed ? (
        <p className="mt-4 text-sm text-status-error" role="alert">
          {c.historyUnavailable}
        </p>
      ) : null}
      {runs.length > 0 ? (
        <nav aria-label={c.historyTitle} className="mt-4" data-testid="label-history-list">
          {runs.map((run) => (
            <div
              key={run.runId}
              className="border-b border-[var(--g-line)] py-4"
              data-label-history-run-id={run.runId}
            >
              <strong className="block text-[15px] font-semibold text-ink">{run.name}</strong>
              <span className="text-xs text-[var(--g-text-secondary)]">
                {c.historyRowMeta(run.lot, run.recipeVersion)}
              </span>
              <div className="mt-3 flex flex-wrap gap-2">
                {run.versions.map((item) => (
                  <Link
                    key={item.snapshotId}
                    to={`/labels?run=${encodeURIComponent(item.runId)}&snapshot=${encodeURIComponent(item.snapshotId)}`}
                    onClick={(event) => openVersion(event, item)}
                    aria-label={c.versionChipLabel(item.version, formatDate(item.createdAt))}
                    className={cn(buttonClasses('ghost', 'sm'), 'min-h-11 shrink-0 rounded-full')}
                    data-testid="label-history-version"
                  >
                    {c.versionChip(formatDate(item.createdAt), item.version)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      ) : null}
      {total > 0 && runs.length === 0 ? (
        <p
          className="mt-4 text-sm text-[var(--g-text-secondary)]"
          role="status"
          data-testid="label-history-empty"
        >
          {c.historySearchEmpty}
        </p>
      ) : null}
    </section>
  );
}
