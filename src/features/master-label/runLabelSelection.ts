import type { RunLabelSnapshot } from '@/services/labels/labelRepository';

/**
 * Which label a `/labels?run=…&snapshot=…` address shows.
 *
 * The run in the address is the authority. A saved label version is shown only
 * when it exists AND belongs to that run — a version of another run never takes
 * the run over, and a version that is not found never falls back to a new label
 * built from the current profile. Without `snapshot` the newest saved version of
 * THIS run is shown (the existing rule); a completed run without a saved label
 * is its own state, not an error.
 */
export type RunLabelSelection =
  | { kind: 'saved'; runId: string; snapshotId: string }
  | { kind: 'newest'; runId: string; snapshotId: string }
  | { kind: 'unsaved'; runId: string }
  | { kind: 'snapshot-not-found'; runId: string }
  | { kind: 'run-not-found' };

export type RunLabelHistoryItem = Pick<
  RunLabelSnapshot,
  'snapshotId' | 'runId' | 'version' | 'createdAt'
>;

/** The saved label versions of one run, oldest first (v1, v2, …). */
export function runLabelVersions<T extends RunLabelHistoryItem>(
  history: readonly T[],
  runId: string,
): T[] {
  return history
    .filter((item) => item.runId === runId)
    .sort((a, b) => a.version - b.version || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Pure selection. `null` means the address is not a run context (no `run`, no
 * `snapshot`). `runExists` is consulted only when the run has no saved label
 * version: `false` → the run is not on this account; `true`/`null` (unknown) →
 * the run is treated as existing and its real state is shown.
 */
export function resolveRunLabelSelection({
  requestedRunId,
  requestedSnapshotId,
  history,
  runExists = null,
}: {
  requestedRunId: string | null;
  requestedSnapshotId: string | null;
  history: readonly RunLabelHistoryItem[];
  runExists?: boolean | null;
}): RunLabelSelection | null {
  const runId = requestedRunId?.trim() || null;
  const snapshotId = requestedSnapshotId?.trim() || null;
  if (!runId && !snapshotId) return null;

  if (!runId) {
    // A bare version link names no run, so its own run is the only candidate.
    const item = history.find((candidate) => candidate.snapshotId === snapshotId);
    return item
      ? { kind: 'saved', runId: item.runId, snapshotId: item.snapshotId }
      : { kind: 'run-not-found' };
  }

  const versions = runLabelVersions(history, runId);
  if (snapshotId) {
    const item = versions.find((candidate) => candidate.snapshotId === snapshotId);
    if (item) return { kind: 'saved', runId, snapshotId: item.snapshotId };
    if (versions.length === 0 && runExists === false) return { kind: 'run-not-found' };
    return { kind: 'snapshot-not-found', runId };
  }

  const newest = versions[versions.length - 1];
  if (newest) return { kind: 'newest', runId, snapshotId: newest.snapshotId };
  if (runExists === false) return { kind: 'run-not-found' };
  return { kind: 'unsaved', runId };
}
