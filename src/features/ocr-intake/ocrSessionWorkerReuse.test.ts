/**
 * ONE worker per session — counted, not assumed.
 *
 * The live scanner reads a frame every second or two. `startLabelOcr` creates a Tesseract
 * worker and terminates it per recognition, which is right for the intake flow and ruinous
 * for a sweep: each frame would spawn a worker and re-load the language data. This proves
 * the session actually reuses one, by counting the workers it builds.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWorker = vi.fn();
const terminate = vi.fn();
const recognize = vi.fn();

// `ocrEngine` uses a namespace import, so the NAMED export is what has to be mocked.
vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}));

const page = {
  text: 'MLEKO 3,2% 1 l zawartość tłuszczu',
  confidence: 90,
  blocks: [],
};

beforeEach(() => {
  createWorker.mockReset();
  terminate.mockReset();
  recognize.mockReset();
  recognize.mockResolvedValue({ data: page });
  createWorker.mockImplementation(async () => ({
    recognize: (...args: unknown[]) => recognize(...args),
    terminate: () => {
      terminate();
      return Promise.resolve();
    },
  }));
});

describe('createLabelOcrSession', () => {
  it('builds ONE worker however many frames it reads', async () => {
    const { createLabelOcrSession } = await import('./ocrEngine');
    const session = createLabelOcrSession();
    for (let frame = 0; frame < 5; frame += 1) {
      const outcome = await session.run(new Uint8Array([1, 2, 3])).done;
      expect(outcome.status).toBe('ok');
    }
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(5);
    // And it is still alive between frames — nothing terminated it.
    expect(terminate).not.toHaveBeenCalled();
  });

  it('releases the worker when the scanner closes', async () => {
    const { createLabelOcrSession } = await import('./ocrEngine');
    const session = createLabelOcrSession();
    await session.run(new Uint8Array([1, 2, 3])).done;
    await session.close();
    expect(terminate).toHaveBeenCalledTimes(1);
    // Closing twice is safe: a scanner may unmount after already stopping.
    await session.close();
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});

describe('startLabelOcr keeps its original one-shot lifetime', () => {
  it('terminates the worker as soon as the single job settles', async () => {
    const { startLabelOcr } = await import('./ocrEngine');
    const outcome = await startLabelOcr(new Uint8Array([1, 2, 3])).done;
    expect(outcome.status).toBe('ok');
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1));
    expect(createWorker).toHaveBeenCalledTimes(1);
  });
});
