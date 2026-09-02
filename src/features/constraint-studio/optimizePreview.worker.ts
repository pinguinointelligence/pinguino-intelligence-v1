import {
  computeOptimizePreviewRescueAdvice,
  computeOptimizePreviewResult,
  optimizePreviewNeedsRescueAssessment,
  type OptimizePreviewComputation,
  type OptimizePreviewComputationRequest,
} from './optimizePreviewComputation';

interface WorkerRequest {
  id: string;
  request: OptimizePreviewComputationRequest;
}

type WorkerResponse =
  | {
      id: string;
      ok: true;
      stage: 'result';
      result: OptimizePreviewComputation['result'];
      rescuePending: boolean;
    }
  | { id: string; ok: true; stage: 'complete'; computation: OptimizePreviewComputation }
  | { id: string; ok: false; message: string };

interface OptimizeWorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (response: WorkerResponse) => void;
}

const scope = self as unknown as OptimizeWorkerScope;

scope.onmessage = (event) => {
  const { id, request } = event.data;
  let result: OptimizePreviewComputation['result'];
  try {
    result = computeOptimizePreviewResult(request);
  } catch {
    // Runtime errors are intentionally sanitized at the Worker boundary. The
    // visible terminal owns the recovery copy; raw internals never reach UI.
    scope.postMessage({ id, ok: false, message: 'Przeliczanie nie powiodło się.' });
    return;
  }

  const rescuePending = optimizePreviewNeedsRescueAssessment(result);
  scope.postMessage({ id, ok: true, stage: 'result', result, rescuePending });
  if (!rescuePending) return;

  try {
    const rescueAdvice = computeOptimizePreviewRescueAdvice(request, result);
    scope.postMessage({
      id,
      ok: true,
      stage: 'complete',
      computation: { result, rescueAdvice },
    });
  } catch {
    // Rescue is optional enrichment. Its failure must not erase the canonical
    // domain result that was already published to the customer.
    scope.postMessage({
      id,
      ok: true,
      stage: 'complete',
      computation: { result, rescueAdvice: null },
    });
  }
};
