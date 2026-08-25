import { describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { BuildPreviewResult } from './applyPipeline';
import {
  runOptimizePreviewOffMainThread,
  type OptimizePreviewWorkerLike,
} from './optimizePreviewRuntime';

const INPUT: RecipeInput = {
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  items: [],
};

const request = {
  input: INPUT,
  constraints: { byLineId: {} },
  createdAt: '2026-08-25T00:00:00.000Z',
  options: {},
};

const fakeWorker = () => {
  const listeners = new Map<string, (event: MessageEvent<unknown> | Event) => void>();
  const worker: OptimizePreviewWorkerLike = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
  };
  return { worker, listeners };
};

describe('off-main-thread Optimize runtime', () => {
  it('returns the canonical worker result and always terminates the worker', async () => {
    const { worker, listeners } = fakeWorker();
    const pending = runOptimizePreviewOffMainThread(request, undefined, () => worker);
    const posted = vi.mocked(worker.postMessage).mock.calls[0]![0] as { id: string };
    const result = { ok: false, code: 'no_proposal' } as BuildPreviewResult;
    listeners.get('message')?.(
      new MessageEvent('message', {
        data: { id: posted.id, ok: true, computation: { result, rescueAdvice: null } },
      }),
    );

    await expect(pending).resolves.toEqual({ result, rescueAdvice: null });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates immediately on AbortSignal so Cancel and deadline remain interactive', async () => {
    const { worker } = fakeWorker();
    const controller = new AbortController();
    const pending = runOptimizePreviewOffMainThread(request, controller.signal, () => worker);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
