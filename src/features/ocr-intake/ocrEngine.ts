/**
 * REAL label-OCR engine — tesseract.js (pinned 7.0.0), keyless, 100% local recognition.
 * Runs the SAME WASM engine in the browser (dev review page) and in Node (vitest proof
 * against real image fixtures). No mock text, no fixture fallback, no paid vision API.
 *
 * Asset / reproducibility strategy (all versions pinned by package-lock.json):
 *   • engine code + WASM core: `tesseract.js` 7.0.0 + `tesseract.js-core` 7.0.0.
 *     Node loads BOTH locally from node_modules (no network). The browser loads the
 *     worker script + core from jsdelivr pinned to the exact installed version
 *     (tesseract.js derives the URL from its own package.json version).
 *   • language models (eng + spa): vendored as npm packages `@tesseract.js-data/eng`
 *     + `@tesseract.js-data/spa` 1.0.0. Node tests point `langPath` at a local
 *     directory prepared from those packages (fully offline). In the browser the
 *     default pinned CDN `https://cdn.jsdelivr.net/npm/@tesseract.js-data/{lang}/4.0.0_best_int`
 *     is used and cached by the engine.
 *   • ONLY those engine assets/models are ever fetched. The label image itself NEVER
 *     leaves the machine — recognition happens in-process (WASM), no upload, no API key.
 *
 * The image is held in memory only; nothing here persists or transmits it.
 */

import * as Tesseract from 'tesseract.js';
import { isAcceptedLabelImage } from '@/data/products/nutritionLabelOcr';
import type { ParsedOcrLine } from './labelTextParser';

/** Languages loaded for EU labels — English + Spanish (kept deliberately small). */
export const OCR_LANGS = ['eng', 'spa'] as const;

export const MAX_LABEL_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Minimum alphanumeric characters for a recognition to count as readable. */
const MIN_READABLE_CHARS = 8;

export interface OcrProgress {
  /** engine phase, e.g. "recognizing text". */
  status: string;
  /** 0..1 within the phase. */
  progress: number;
}

export interface OcrSuccess {
  status: 'ok';
  /** full raw recognized text (exactly what the engine produced — never edited). */
  text: string;
  /** recognized lines with per-line confidence (0–100), for per-field confidence. */
  lines: ParsedOcrLine[];
  /** page-level confidence (0–100). */
  overallConfidence: number;
  durationMs: number;
}

export type OcrFailureReason = 'invalid_image' | 'unreadable_image' | 'cancelled' | 'engine_error';

export interface OcrFailure {
  status: 'failed';
  reason: OcrFailureReason;
  message: string;
}

export type OcrRunResult = OcrSuccess | OcrFailure;

export interface OcrEngineOptions {
  /** Base path/URL for {lang}.traineddata.gz. Node tests pass a local vendored dir;
   * browser default = tesseract.js's pinned jsdelivr URL. */
  langPath?: string;
  /** Where the engine may cache loaded language models (Node: a local dir). */
  cachePath?: string;
  onProgress?: (progress: OcrProgress) => void;
}

/** What the engine accepts as input: a browser File/Blob, or (Node) a local file path. */
export type OcrImageInput = File | Blob | string;

export interface LabelImageValidation {
  ok: boolean;
  /** honest human-readable reason when not ok. */
  reason: string | null;
}

/** Validate a chosen label image BEFORE any OCR: type (PNG/JPEG/WebP) + size. */
export function validateLabelImage(meta: {
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
}): LabelImageValidation {
  if (!isAcceptedLabelImage(meta.mime, meta.filename)) {
    return { ok: false, reason: `"${meta.filename}" is not a supported label image — use PNG, JPEG or WebP.` };
  }
  if (meta.sizeBytes !== null && meta.sizeBytes > MAX_LABEL_IMAGE_BYTES) {
    const mb = (meta.sizeBytes / (1024 * 1024)).toFixed(1);
    return { ok: false, reason: `image is ${mb} MB — the limit is ${MAX_LABEL_IMAGE_BYTES / (1024 * 1024)} MB.` };
  }
  if (meta.sizeBytes !== null && meta.sizeBytes === 0) {
    return { ok: false, reason: 'the file is empty (0 bytes).' };
  }
  return { ok: true, reason: null };
}

/**
 * Optional preprocess: downscale an over-large image in the BROWSER before OCR (keeps
 * memory bounded, often improves recognition of phone photos). In Node (no canvas)
 * the input is returned unchanged — fixtures are already reasonably sized.
 */
export async function downscaleImageIfNeeded(image: Blob, maxDimension = 2200): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return image; // Node / non-DOM environment: pass through unchanged
  }
  const bitmap = await createImageBitmap(image);
  const { width, height } = bitmap;
  if (Math.max(width, height) <= maxDimension) {
    bitmap.close();
    return image;
  }
  const scale = maxDimension / Math.max(width, height);
  const canvas = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return image;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Extract per-line text + confidence from a recognized page. */
function linesFromPage(page: Tesseract.Page): ParsedOcrLine[] {
  const lines: ParsedOcrLine[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.replace(/\s+/g, ' ').trim();
        if (text !== '') lines.push({ text, confidence: Math.round(line.confidence) });
      }
    }
  }
  if (lines.length === 0 && page.text.trim() !== '') {
    // blocks unavailable — fall back to plain text lines with the page confidence
    for (const raw of page.text.split(/\r?\n/)) {
      const text = raw.trim();
      if (text !== '') lines.push({ text, confidence: Math.round(page.confidence) });
    }
  }
  return lines;
}

export interface OcrJob {
  done: Promise<OcrRunResult>;
  /** Stop the engine immediately; `done` resolves to a `cancelled` failure. */
  cancel: () => void;
}

/**
 * Run REAL OCR on a label image. One automatic retry on a transient engine error
 * (never on cancel). The image stays in memory; nothing is persisted or uploaded.
 */
export function startLabelOcr(image: OcrImageInput, options: OcrEngineOptions = {}): OcrJob {
  let cancelled = false;
  let activeWorker: Tesseract.Worker | null = null;

  const runOnce = async (): Promise<OcrRunResult> => {
    const startedAt = Date.now();
    const worker = await Tesseract.createWorker(
      [...OCR_LANGS],
      undefined, // default OEM (LSTM only — matches the vendored *_best_int models)
      {
        ...(options.langPath !== undefined ? { langPath: options.langPath } : {}),
        ...(options.cachePath !== undefined ? { cachePath: options.cachePath } : {}),
        gzip: true,
        logger: (m) => {
          if (options.onProgress && typeof m.progress === 'number') {
            options.onProgress({ status: m.status, progress: m.progress });
          }
        },
      },
    );
    activeWorker = worker;
    try {
      if (cancelled) return { status: 'failed', reason: 'cancelled', message: 'OCR cancelled before recognition started.' };
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      const text = data.text.trim();
      const alphanumeric = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
      if (alphanumeric < MIN_READABLE_CHARS) {
        return {
          status: 'failed',
          reason: 'unreadable_image',
          message: 'No readable label text found in this image (too blurry, dark, or not a text label).',
        };
      }
      return {
        status: 'ok',
        text: data.text,
        lines: linesFromPage(data),
        overallConfidence: Math.round(data.confidence),
        durationMs: Date.now() - startedAt,
      };
    } finally {
      activeWorker = null;
      await worker.terminate().catch(() => undefined);
    }
  };

  const done = (async (): Promise<OcrRunResult> => {
    const maxAttempts = 2;
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (cancelled) return { status: 'failed', reason: 'cancelled', message: 'OCR cancelled.' };
      try {
        return await runOnce();
      } catch (error) {
        if (cancelled) return { status: 'failed', reason: 'cancelled', message: 'OCR cancelled.' };
        lastError = errorMessage(error);
      }
    }
    return {
      status: 'failed',
      reason: 'engine_error',
      message: `The OCR engine failed after ${maxAttempts} attempts: ${lastError}`,
    };
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      if (activeWorker) void activeWorker.terminate().catch(() => undefined);
    },
  };
}
