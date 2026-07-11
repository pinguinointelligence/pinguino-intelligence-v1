/**
 * TesseractOcrProvider — the REAL OcrProvider adapter (spec §7) over the existing
 * local tesseract.js engine (`ocrEngine.ts`). One reusable core: this adapter
 * delegates validation, retry, progress and cancellation to `startLabelOcr` and only
 * maps shapes — engine capabilities are never duplicated here.
 *
 * Honest failure taxonomy (the locked `OcrRunFailure` contract):
 *   • unsupported mime            → { kind: 'unsupported_format', mime }
 *   • empty file (0 bytes)       → { kind: 'unreadable_image' } (nothing to read)
 *   • over the size cap          → { kind: 'engine_error' } with the honest limit
 *     message (the bytes are readable — the LOCAL engine refuses them by policy)
 *   • no readable text           → { kind: 'unreadable_image' }
 *   • AbortSignal / cancel       → { kind: 'cancelled' }
 *   • engine crash (post-retry)  → { kind: 'engine_error', message }
 *
 * The image bytes stay in memory — nothing is persisted or uploaded (same guarantee
 * as the engine: recognition is in-process WASM, keyless, no vision API).
 */

import type {
  AcceptedMime,
  OcrProvider,
  OcrRunOutcome,
  RawOcrResult,
} from '../intakeContracts';
import {
  MAX_LABEL_IMAGE_BYTES,
  OCR_LANGS,
  startLabelOcr,
  type OcrProgress,
} from '../ocrEngine';

export const TESSERACT_PROVIDER_ID = 'tesseract';

const ACCEPTED_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export interface TesseractProviderOptions {
  /** Base path/URL for {lang}.traineddata.gz (Node tests: local vendored dir). */
  langPath?: string;
  /** Engine model cache directory (Node tests: a local dir). */
  cachePath?: string;
  /** Languages used when recognize() receives an empty list (default eng + spa). */
  defaultLanguages?: readonly string[];
}

/** Map engine progress ({status, progress-in-phase}) to a single 0..1 fraction:
 * only the recognition phase is forwarded — model loading is fast and unbounded. */
const toFraction = (onProgress: (fraction: number) => void) => (p: OcrProgress) => {
  if (p.status === 'recognizing text') onProgress(Math.max(0, Math.min(1, p.progress)));
};

export class TesseractOcrProvider implements OcrProvider {
  readonly providerId = TESSERACT_PROVIDER_ID;

  private readonly options: TesseractProviderOptions;

  constructor(options: TesseractProviderOptions = {}) {
    this.options = options;
  }

  async recognize(input: {
    imageId: string;
    bytes: Uint8Array;
    mime: AcceptedMime;
    languages: string[];
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  }): Promise<OcrRunOutcome> {
    // 1. honest pre-flight checks (no engine start, no retry)
    if (!ACCEPTED_MIMES.includes(input.mime)) {
      return { ok: false, failure: { kind: 'unsupported_format', mime: input.mime } };
    }
    if (input.bytes.byteLength === 0) {
      return { ok: false, failure: { kind: 'unreadable_image' } };
    }
    if (input.bytes.byteLength > MAX_LABEL_IMAGE_BYTES) {
      const mb = (input.bytes.byteLength / (1024 * 1024)).toFixed(1);
      const limitMb = MAX_LABEL_IMAGE_BYTES / (1024 * 1024);
      return {
        ok: false,
        failure: {
          kind: 'engine_error',
          message: `image is ${mb} MB — the local OCR engine's limit is ${limitMb} MB (downscale before retrying).`,
        },
      };
    }
    if (input.signal?.aborted) {
      return { ok: false, failure: { kind: 'cancelled' } };
    }

    // 2. one real engine run (the engine itself performs one retry on engine errors)
    const languages =
      input.languages.length > 0 ? input.languages : [...(this.options.defaultLanguages ?? OCR_LANGS)];
    const job = startLabelOcr(input.bytes, {
      ...(this.options.langPath !== undefined ? { langPath: this.options.langPath } : {}),
      ...(this.options.cachePath !== undefined ? { cachePath: this.options.cachePath } : {}),
      langs: languages,
      ...(input.onProgress ? { onProgress: toFraction(input.onProgress) } : {}),
    });
    const onAbort = () => job.cancel();
    input.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const r = await job.done;
      if (r.status === 'ok') {
        const result: RawOcrResult = {
          providerId: this.providerId,
          imageId: input.imageId,
          fullText: r.text,
          lines: r.richLines,
          overallConfidence: r.overallConfidence,
          languageHints: languages,
          durationMs: r.durationMs,
        };
        return { ok: true, result };
      }
      switch (r.reason) {
        case 'cancelled':
          return { ok: false, failure: { kind: 'cancelled' } };
        case 'unreadable_image':
          return { ok: false, failure: { kind: 'unreadable_image' } };
        case 'invalid_image': // engine-level validation (not reachable via this adapter's pre-flight)
          return { ok: false, failure: { kind: 'engine_error', message: r.message } };
        case 'engine_error':
        default:
          return { ok: false, failure: { kind: 'engine_error', message: r.message } };
      }
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
    }
  }
}
