/**
 * Runs the lock-conflict diagnostic (`diagnoseLockConflict`) in the SAME
 * canonical Preview Worker as the recalculation itself, so its repeated
 * Previews never block the browser UI. Cancelling terminates the Worker, and
 * a runtime without Workers (tests, SSR) runs the identical pure function.
 */
import {
  diagnoseLockConflict,
  type LockConflictDiagnosis,
  type LockConflictRequest,
} from './lockRelaxation';
import type {
  OptimizePreviewWorkerFactory,
  OptimizePreviewWorkerLike,
} from './optimizePreviewRuntime';
import OptimizePreviewWorker from './optimizePreview.worker?worker&inline';

type LockConflictWorkerResponse =
  | { id: string; ok: true; stage: 'lock_conflict'; diagnosis: LockConflictDiagnosis }
  | { id: string; ok: false; message: string }
  | { id: string; ok: true; stage: string };

let requestSequence = 0;

const abortError = (): DOMException =>
  new DOMException('Anulowano podgląd przeliczenia.', 'AbortError');

const defaultWorker = (): OptimizePreviewWorkerLike =>
  new OptimizePreviewWorker({ name: 'pinguino-lock-conflict' });

export function runLockConflictDiagnosisOffMainThread(
  request: LockConflictRequest,
  signal?: AbortSignal,
  workerFactory?: OptimizePreviewWorkerFactory,
): Promise<LockConflictDiagnosis> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!workerFactory && typeof Worker === 'undefined') {
    return Promise.resolve(diagnoseLockConflict(request));
  }
  const worker = (workerFactory ?? defaultWorker)();
  const id = `lock-conflict-${Date.now().toString(36)}-${(requestSequence += 1).toString(36)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(abortError());
    const onError = () => fail(new Error('Lock conflict worker failed.'));
    const onMessage = (event: MessageEvent<unknown> | Event) => {
      if (!(event instanceof MessageEvent)) return;
      const response = event.data as LockConflictWorkerResponse;
      if (!response || response.id !== id) return;
      if (!response.ok) {
        fail(new Error(response.message));
        return;
      }
      if (response.stage !== 'lock_conflict' || !('diagnosis' in response)) return;
      settled = true;
      cleanup();
      resolve(response.diagnosis);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, kind: 'lock_conflict', request });
  });
}
