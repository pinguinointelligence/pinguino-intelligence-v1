import {
  computeOptimizePreview,
  type OptimizePreviewComputation,
  type OptimizePreviewComputationRequest,
} from './optimizePreviewComputation';

interface WorkerSuccess {
  id: string;
  ok: true;
  computation: OptimizePreviewComputation;
}

interface WorkerFailure {
  id: string;
  ok: false;
  message: string;
}

type WorkerResponse = WorkerSuccess | WorkerFailure;

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
  new DOMException('Optimize preview was cancelled.', 'AbortError');

const defaultWorker = (): OptimizePreviewWorkerLike =>
  new Worker(new URL('./optimizePreview.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pinguino-optimize-preview',
  });

/**
 * Runs the unchanged canonical computation outside the browser UI event loop.
 * Terminating the Worker makes Cancel and the hard deadline real preemption,
 * rather than timers that can fire only after a synchronous solver returns.
 */
export function runOptimizePreviewOffMainThread(
  request: OptimizePreviewComputationRequest,
  signal?: AbortSignal,
  workerFactory?: OptimizePreviewWorkerFactory,
): Promise<OptimizePreviewComputation> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!workerFactory && typeof Worker === 'undefined') {
    return Promise.resolve(computeOptimizePreview(request));
  }

  const worker = (workerFactory ?? defaultWorker)();
  const id = `optimize-${Date.now().toString(36)}-${(requestSequence += 1).toString(36)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const onError = () => finish(() => reject(new Error('Optimize worker failed.')));
    const onMessage = (event: MessageEvent<unknown> | Event) => {
      if (!(event instanceof MessageEvent)) return;
      const response = event.data as WorkerResponse;
      if (!response || response.id !== id) return;
      if (response.ok) finish(() => resolve(response.computation));
      else finish(() => reject(new Error(response.message)));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, request });
  });
}
