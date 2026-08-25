import {
  computeOptimizePreview,
  type OptimizePreviewComputationRequest,
} from './optimizePreviewComputation';

interface WorkerRequest {
  id: string;
  request: OptimizePreviewComputationRequest;
}

type WorkerResponse =
  | { id: string; ok: true; computation: ReturnType<typeof computeOptimizePreview> }
  | { id: string; ok: false; message: string };

interface OptimizeWorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (response: WorkerResponse) => void;
}

const scope = self as unknown as OptimizeWorkerScope;

scope.onmessage = (event) => {
  const { id, request } = event.data;
  try {
    scope.postMessage({ id, ok: true, computation: computeOptimizePreview(request) });
  } catch {
    // Runtime errors are intentionally sanitized at the Worker boundary. The
    // visible terminal owns the recovery copy; raw internals never reach UI.
    scope.postMessage({ id, ok: false, message: 'Optimize worker failed.' });
  }
};
