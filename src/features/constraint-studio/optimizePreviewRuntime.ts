import {
  computeOptimizePreview,
  type OptimizePreviewComputation,
  type OptimizePreviewComputationRequest,
} from './optimizePreviewComputation';
import OptimizePreviewWorker from './optimizePreview.worker?worker&inline';

interface LegacyWorkerSuccess {
  id: string;
  ok: true;
  computation: OptimizePreviewComputation;
}

interface WorkerResultSuccess {
  id: string;
  ok: true;
  stage: 'result';
  result: OptimizePreviewComputation['result'];
  rescuePending: boolean;
}

interface WorkerCompleteSuccess {
  id: string;
  ok: true;
  stage: 'complete';
  computation: OptimizePreviewComputation;
}

interface WorkerFailure {
  id: string;
  ok: false;
  message: string;
}

type WorkerResponse =
  | LegacyWorkerSuccess
  | WorkerResultSuccess
  | WorkerCompleteSuccess
  | WorkerFailure;

export interface OptimizePreviewWorkerLike {
  postMessage: (message: unknown) => void;
  terminate: () => void;
  addEventListener: (
    type: 'message' | 'error',
    listener: (event: MessageEvent<unknown> | Event) => void,
  ) => void;
  removeEventListener: (
    type: 'message' | 'error',
    listener: (event: MessageEvent<unknown> | Event) => void,
  ) => void;
}

export type OptimizePreviewWorkerFactory = () => OptimizePreviewWorkerLike;

let requestSequence = 0;

const abortError = (): DOMException =>
  new DOMException('Anulowano podgląd przeliczenia.', 'AbortError');

const defaultWorker = (): OptimizePreviewWorkerLike =>
  new OptimizePreviewWorker({
    name: 'pinguino-optimize-preview',
  });

/**
 * Runs the canonical computation outside the browser UI event loop. The
 * canonical domain result resolves first; optional rescue enrichment may be
 * delivered afterward. Terminating the Worker makes Cancel and the hard
 * deadline real preemption rather than an event-loop-only timer.
 */
export function runOptimizePreviewOffMainThread(
  request: OptimizePreviewComputationRequest,
  signal?: AbortSignal,
  workerFactory?: OptimizePreviewWorkerFactory,
  onDeferredRescueAdvice?: (advice: OptimizePreviewComputation['rescueAdvice']) => void,
): Promise<OptimizePreviewComputation> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!workerFactory && typeof Worker === 'undefined') {
    return Promise.resolve(computeOptimizePreview(request));
  }

  const worker = (workerFactory ?? defaultWorker)();
  const id = `optimize-${Date.now().toString(36)}-${(requestSequence += 1).toString(36)}`;
  return new Promise((resolve, reject) => {
    let resultPublished = false;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      signal?.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };
    const failBeforeResult = (error: Error) => {
      if (cleanedUp) return;
      cleanup();
      if (!resultPublished) reject(error);
    };
    const onAbort = () => failBeforeResult(abortError());
    const onError = () => failBeforeResult(new Error('Optimize worker failed.'));
    const onMessage = (event: MessageEvent<unknown> | Event) => {
      if (!(event instanceof MessageEvent)) return;
      const response = event.data as WorkerResponse;
      if (!response || response.id !== id) return;
      if (!response.ok) {
        failBeforeResult(new Error(response.message));
        return;
      }
      if (!('stage' in response)) {
        resultPublished = true;
        cleanup();
        resolve(response.computation);
        return;
      }
      if (response.stage === 'result') {
        if (!resultPublished) {
          resultPublished = true;
          resolve({ result: response.result, rescueAdvice: null });
        }
        if (!response.rescuePending) cleanup();
        return;
      }
      if (!resultPublished) {
        resultPublished = true;
        resolve(response.computation);
      } else {
        onDeferredRescueAdvice?.(response.computation.rescueAdvice);
      }
      cleanup();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, request });
  });
}
