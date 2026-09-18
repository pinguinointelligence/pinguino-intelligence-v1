import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { productionBatchesLabelsCopy } from '@/copy/productionBatchesLabels';
import { LabelWorkspace } from '@/features/master-label/LabelWorkspace';
import { lotCodeForDisplay } from '@/features/master-label/labelPresentation';
import {
  resolveRunLabelSelection,
  runLabelVersions,
  type RunLabelSelection,
} from '@/features/master-label/runLabelSelection';
import type { LabelSettingsOrigin } from '@/features/master-label/labelSettingsNavigation';
import {
  productionLotCodeForRun,
  type ProductionCompletionSnapshot,
} from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
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

type Loaded<T> = { key: string; value: T; failed: boolean };

/**
 * Produkcja → Etykiety, context C: the label of ONE completed run
 * (`/labels?run=<runId>[&snapshot=<labelSnapshotId>]`).
 *
 * Which version is shown is decided by the pure `resolveRunLabelSelection`: the
 * run in the address is the authority, a version of another run never takes it
 * over, and a version that is not found shows „Nie znaleźliśmy tej wersji
 * etykiety” — no preview, no print, no settings. A saved version renders its own
 * frozen label (`LabelWorkspace` → `nextSaved.label`); a run without a saved label
 * shows its real state, and only „Drukuj” / „Zastosuj ustawienia” write v1.
 */
export function RunLabelView({
  requestedRunId,
  requestedSnapshotId,
  settingsView,
  origin,
  repository,
}: {
  requestedRunId: string | null;
  requestedSnapshotId: string | null;
  settingsView: boolean;
  origin: LabelSettingsOrigin | null;
  repository: LabelRepository;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useProductionSessionStore((state) => state.session);
  const activeSnapshot = session?.status === 'completed' ? session.completionSnapshot : null;

  const [history, setHistory] = useState<{ value: RunLabelSnapshot[]; failed: boolean } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await repository.listRunLabelSnapshots();
        if (!cancelled) setHistory({ value: items, failed: false });
      } catch {
        if (!cancelled) setHistory({ value: [], failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const targetRunId =
    requestedRunId ??
    (history && !history.failed
      ? (history.value.find((item) => item.snapshotId === requestedSnapshotId)?.runId ?? null)
      : null);
  const activeMatch =
    activeSnapshot && targetRunId && activeSnapshot.sessionId === targetRunId
      ? activeSnapshot
      : null;

  const [completed, setCompleted] = useState<Loaded<ProductionCompletionSnapshot | null> | null>(
    null,
  );
  useEffect(() => {
    if (!targetRunId || activeMatch) return;
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await repository.getCompletedSnapshot(targetRunId);
        if (!cancelled) setCompleted({ key: targetRunId, value: snapshot, failed: false });
      } catch {
        if (!cancelled) setCompleted({ key: targetRunId, value: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMatch, repository, targetRunId]);

  const completedForRun = activeMatch
    ? { key: targetRunId!, value: activeMatch, failed: false }
    : completed?.key === targetRunId
      ? completed
      : null;
  const runSnapshot = completedForRun?.value ?? null;
  const runExists = completedForRun
    ? completedForRun.failed
      ? null
      : completedForRun.value !== null
    : null;

  const pending = !history || (targetRunId !== null && !completedForRun);
  const selection: RunLabelSelection | null = useMemo(() => {
    if (!history) return null;
    if (history.failed) {
      // Without the saved-version list the workspace validates the address itself.
      return requestedRunId
        ? runExists === false
          ? { kind: 'run-not-found' }
          : requestedSnapshotId
            ? { kind: 'saved', runId: requestedRunId, snapshotId: requestedSnapshotId }
            : { kind: 'unsaved', runId: requestedRunId }
        : { kind: 'run-not-found' };
    }
    return resolveRunLabelSelection({
      requestedRunId,
      requestedSnapshotId,
      history: history.value,
      runExists,
    });
  }, [history, requestedRunId, requestedSnapshotId, runExists]);

  const versions = useMemo(
    () =>
      targetRunId && history && !history.failed ? runLabelVersions(history.value, targetRunId) : [],
    [history, targetRunId],
  );

  const openVersion = (event: MouseEvent<HTMLAnchorElement>, item: RunLabelSnapshot) => {
    event.preventDefault();
    navigate(
      `/labels?run=${encodeURIComponent(item.runId)}&snapshot=${encodeURIComponent(item.snapshotId)}`,
      { state: location.state },
    );
  };

  if (pending || !selection) {
    return (
      <p className="py-6 text-sm text-[var(--g-text-secondary)]" role="status">
        {c.runChecking}
      </p>
    );
  }

  if (selection.kind === 'run-not-found') {
    return (
      <div className="py-2" data-testid="label-run-not-found" role="alert">
        <h2 className="text-[17px] font-semibold text-status-error">{c.runNotFoundTitle}</h2>
        <p className="mt-1.5 max-w-xl text-sm text-[var(--g-text-secondary)]">
          {c.runNotFoundBody}
        </p>
        {origin === 'production-history' || origin === 'label-history' ? null : (
          <Link to="/labels" className={cn(buttonClasses('ghost', 'sm'), 'mt-4')}>
            {c.toLabelHistory}
          </Link>
        )}
      </div>
    );
  }

  const runId = selection.runId;
  const selectedSnapshotId =
    selection.kind === 'saved' || selection.kind === 'newest' ? selection.snapshotId : null;
  const selectedItem = versions.find((item) => item.snapshotId === selectedSnapshotId) ?? null;
  const lot = runSnapshot
    ? lotCodeForDisplay(
        runSnapshot.lotCode ??
          productionLotCodeForRun(runSnapshot.sessionId, runSnapshot.productionCompletedAt),
      )
    : selectedItem
      ? lotCodeForDisplay(selectedItem.label.lotCode)
      : null;
  const recipeName =
    runSnapshot?.source.recipeName ??
    (selectedItem
      ? (Object.values(selectedItem.label.productName ?? {}).find((name) => name?.trim()) ?? '')
      : '');
  const recipeVersion =
    runSnapshot?.source.recipeVersionNumber ??
    selectedItem?.label.sourceRecipeVersionNumber ??
    null;
  const stateLine =
    selection.kind === 'snapshot-not-found'
      ? c.runContextVersionMissing
      : selectedItem
        ? c.runContextSaved(selectedItem.version, formatDate(selectedItem.createdAt))
        : selection.kind === 'unsaved'
          ? c.runContextUnsaved
          : null;

  const chips =
    versions.length > 0 ? (
      <div className="mt-5" data-testid="label-run-versions">
        <p className="text-xs text-[var(--g-text-secondary)]">{c.savedVersions}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {versions.map((item) => {
            const on = item.snapshotId === selectedSnapshotId;
            return (
              <Link
                key={item.snapshotId}
                to={`/labels?run=${encodeURIComponent(item.runId)}&snapshot=${encodeURIComponent(item.snapshotId)}`}
                onClick={(event) => openVersion(event, item)}
                aria-current={on ? 'true' : undefined}
                aria-label={c.versionChipLabel(item.version, formatDate(item.createdAt))}
                className={cn(
                  buttonClasses(on ? 'primary' : 'ghost', 'sm'),
                  'min-h-11 rounded-full',
                )}
                data-testid="label-run-version"
              >
                {c.versionChip(formatDate(item.createdAt), item.version)}
              </Link>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <div data-testid="label-run-context" data-run-id={runId} data-selection={selection.kind}>
      <div className="rounded-[12px] border border-l-2 border-[var(--g-line)] border-l-ink bg-white px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink">{c.runTitle}</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--g-text-secondary)]">
          {[c.runContext(recipeName, recipeVersion, lot), stateLine].filter(Boolean).join(' · ')}
        </p>
      </div>

      {selection.kind === 'snapshot-not-found' ? (
        <>
          <div className="mt-6" role="alert" data-testid="label-snapshot-not-found">
            <h3 className="text-[17px] font-semibold text-status-error">
              {c.snapshotNotFoundTitle}
            </h3>
            <p className="mt-1.5 max-w-xl text-sm text-[var(--g-text-secondary)]">
              {c.snapshotNotFoundBody}
            </p>
          </div>
          {chips ?? (
            <p className="mt-5 text-sm text-[var(--g-text-secondary)]">{c.noSavedVersions}</p>
          )}
        </>
      ) : (
        <>
          {chips}
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-[var(--g-text-secondary)]">
            {selection.kind === 'unsaved' ? c.unsavedNote : c.savedNote}
          </p>
          <div className="mt-4">
            <LabelWorkspace
              key={`${runId}:${selectedSnapshotId ?? 'unsaved'}:${settingsView ? 'settings' : 'label'}`}
              snapshot={runSnapshot}
              runId={runId}
              savedSnapshotId={selection.kind === 'saved' ? selection.snapshotId : null}
              repository={repository}
              initialView={settingsView ? 'settings' : 'label'}
              onSaved={(item) => {
                setHistory((current) =>
                  current
                    ? {
                        ...current,
                        value: [
                          item,
                          ...current.value.filter((entry) => entry.snapshotId !== item.snapshotId),
                        ],
                      }
                    : current,
                );
                navigate(
                  `/labels?run=${encodeURIComponent(item.runId)}&snapshot=${encodeURIComponent(item.snapshotId)}`,
                  { state: location.state },
                );
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
