import { describe, expect, it } from 'vitest';
import { resolveRunLabelSelection, runLabelVersions } from './runLabelSelection';

const history = [
  { snapshotId: 'a-v2', runId: 'run-a', version: 2, createdAt: '2026-09-16T12:10:00.000Z' },
  { snapshotId: 'b-v1', runId: 'run-b', version: 1, createdAt: '2026-09-14T10:10:00.000Z' },
  { snapshotId: 'a-v1', runId: 'run-a', version: 1, createdAt: '2026-09-16T12:00:00.000Z' },
];

describe('resolveRunLabelSelection', () => {
  it('is not a run context without run and snapshot', () => {
    expect(
      resolveRunLabelSelection({ requestedRunId: null, requestedSnapshotId: null, history }),
    ).toBeNull();
  });

  it('shows the newest saved version of THIS run when no version is named', () => {
    expect(
      resolveRunLabelSelection({ requestedRunId: 'run-a', requestedSnapshotId: null, history }),
    ).toEqual({ kind: 'newest', runId: 'run-a', snapshotId: 'a-v2' });
    expect(
      resolveRunLabelSelection({ requestedRunId: 'run-b', requestedSnapshotId: null, history }),
    ).toEqual({ kind: 'newest', runId: 'run-b', snapshotId: 'b-v1' });
  });

  it('shows an older named version of the same run', () => {
    expect(
      resolveRunLabelSelection({ requestedRunId: 'run-a', requestedSnapshotId: 'a-v1', history }),
    ).toEqual({ kind: 'saved', runId: 'run-a', snapshotId: 'a-v1' });
  });

  it('never lets a version of another run take the run over', () => {
    expect(
      resolveRunLabelSelection({ requestedRunId: 'run-a', requestedSnapshotId: 'b-v1', history }),
    ).toEqual({ kind: 'snapshot-not-found', runId: 'run-a' });
  });

  it('reports a missing version instead of building a new label', () => {
    expect(
      resolveRunLabelSelection({
        requestedRunId: 'run-a',
        requestedSnapshotId: 'does-not-exist',
        history,
      }),
    ).toEqual({ kind: 'snapshot-not-found', runId: 'run-a' });
  });

  it('keeps a completed run without a saved label as its own state', () => {
    expect(
      resolveRunLabelSelection({
        requestedRunId: 'run-c',
        requestedSnapshotId: null,
        history,
        runExists: true,
      }),
    ).toEqual({ kind: 'unsaved', runId: 'run-c' });
    expect(
      resolveRunLabelSelection({ requestedRunId: 'run-c', requestedSnapshotId: null, history }),
    ).toEqual({ kind: 'unsaved', runId: 'run-c' });
  });

  it('reports a run that is not on this account', () => {
    expect(
      resolveRunLabelSelection({
        requestedRunId: 'run-x',
        requestedSnapshotId: null,
        history,
        runExists: false,
      }),
    ).toEqual({ kind: 'run-not-found' });
    expect(
      resolveRunLabelSelection({
        requestedRunId: 'run-x',
        requestedSnapshotId: 'a-v1',
        history,
        runExists: false,
      }),
    ).toEqual({ kind: 'run-not-found' });
    expect(
      resolveRunLabelSelection({ requestedRunId: null, requestedSnapshotId: 'nope', history }),
    ).toEqual({ kind: 'run-not-found' });
  });

  it('opens a bare version link on its own run', () => {
    expect(
      resolveRunLabelSelection({ requestedRunId: null, requestedSnapshotId: 'b-v1', history }),
    ).toEqual({ kind: 'saved', runId: 'run-b', snapshotId: 'b-v1' });
  });

  it('lists one run’s versions oldest first', () => {
    expect(runLabelVersions(history, 'run-a').map((item) => item.snapshotId)).toEqual([
      'a-v1',
      'a-v2',
    ]);
  });
});
