/**
 * LIVE SCANNER — the real authorities behind the ladder.
 *
 * `liveRecognition` deliberately knows nothing about the app; this is the adapter that
 * hands it the production implementations. Every one of them already existed:
 *
 *   decodeBarcode   `getSharedBarcodeDecoder()` — the same local decoder the deep Scanner
 *                   uses, including the ponyfill for Safari, which has no BarcodeDetector
 *   resolveBarcode  `lookupExactBarcode` — the SAME exact catalogue resolution the deep
 *                   Scanner performs. It returns null for a code Gellatti does not know,
 *                   and that null is what keeps an unknown product from turning green
 *   readLabelText   the existing in-browser OCR engine, imported LAZILY so a sweep that
 *                   only ever sees barcodes never downloads the WASM
 *   resolveName     `searchProducts` — the same catalogue search the picker uses
 *
 * Nothing here formulates, classifies or profiles. Identification only.
 */
import { validateBarcode } from './barcode';
import { getSharedBarcodeDecoder, type BarcodeImageSource } from './barcodeDecoder';
import type { CatalogHit, RecognitionCapabilities } from './liveRecognition';
import { lookupExactBarcode } from '@/services/productScanner';
import { searchProducts } from '@/services/globalCatalog';
import type { LabelOcrSession } from '@/features/ocr-intake/ocrEngine';
import { identifyLiveFrame } from '@/services/productScanner';

/** How much of a read label is worth searching for. */
const OCR_MIN_TEXT_LENGTH = 3;

/** Encode a frame as a JPEG data payload — one selected still, never a stream. */
async function encodeFrameBase64(pixels: ImageData, quality = 0.8): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(pixels, 0, 0);
  const url = canvas.toDataURL('image/jpeg', quality);
  const comma = url.indexOf(',');
  return comma === -1 ? null : url.slice(comma + 1);
}

/** Encode a frame for the OCR engine, which works on an encoded image, not raw pixels. */
async function encodeFrame(pixels: ImageData): Promise<Uint8Array | null> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Search the catalogue by name and accept only an unambiguous answer.
 *
 * A name is far weaker evidence than a barcode, so a search that comes back with several
 * plausible products resolves to NOTHING rather than to the first row. Picking one would
 * be exactly the quiet guess the owner ruled out.
 */
async function resolveNameExactly(text: string): Promise<CatalogHit | null> {
  const query = text.trim();
  if (query.length < OCR_MIN_TEXT_LENGTH) return null;
  const rows = await searchProducts({ query, context: 'TOPPING', marketScope: 'global', limit: 5 });
  const hit = rows.length === 1 ? rows[0] : undefined;
  if (!hit) return null;
  return { id: hit.id, displayName: hit.displayName, brand: hit.brand };
}

/**
 * ONE OCR worker for the whole sweep.
 *
 * `startLabelOcr` creates a Tesseract worker, recognises once and terminates it — right
 * for the intake flow, where a person picks a photo and waits, and badly wrong for a sweep
 * that reads a frame every second or two. `createLabelOcrSession` is the same engine with
 * the worker lifetime handed to the caller, so the live scanner loads the language data
 * once and keeps it until the camera closes.
 *
 * Still imported LAZILY: a sweep that only ever sees barcodes never downloads the engine.
 */
let ocrSession: Promise<LabelOcrSession> | null = null;

function sharedOcrSession(languages: readonly string[]): Promise<LabelOcrSession> {
  // A type-only import keeps the engine out of the bundle until this rung actually runs.
  ocrSession ??= import('@/features/ocr-intake/ocrEngine').then(({ createLabelOcrSession }) =>
    createLabelOcrSession({ langs: [...languages] }),
  );
  return ocrSession;
}

export interface LiveCapabilityOptions {
  /** Off by default: the sweep is barcode-first, and OCR costs a second of CPU a frame. */
  readonly enableOcr?: boolean;
  readonly languages?: readonly string[];
  /**
   * Identifies the sweep to the identification boundary, for dedupe and cost accounting.
   * Without it the paid rung is simply not offered.
   */
  readonly sessionId?: string | null;
}

/**
 * Release the OCR engine.
 *
 * The worker outlives any single sweep unless it is told not to, so the scanner ends by
 * letting it go rather than leaving a WASM worker resident on a phone.
 */
export async function releaseLiveScanCapabilities(): Promise<void> {
  const pending = ocrSession;
  ocrSession = null;
  if (!pending) return;
  try {
    await (await pending).close();
  } catch {
    // Releasing an engine that never finished loading is not a failure worth reporting.
  }
}

/** The production capability set. */
export function createLiveScanCapabilities(
  options: LiveCapabilityOptions = {},
): RecognitionCapabilities {
  const base: RecognitionCapabilities = {
    async decodeBarcode(source: BarcodeImageSource) {
      const decoder = await getSharedBarcodeDecoder();
      return await decoder.decode(source);
    },
    async resolveBarcode(barcode) {
      const product = await lookupExactBarcode(barcode);
      if (!product) return null;
      return { id: product.id, displayName: product.displayName, brand: product.brand };
    },
    resolveName: resolveNameExactly,
  };

  const sessionId = options.sessionId ?? null;
  const withVision: RecognitionCapabilities = sessionId
    ? {
        ...base,
        async recognizeObject(source, localText) {
          if (!(source instanceof ImageData)) return null;
          const base64 = await encodeFrameBase64(source);
          if (!base64) return null;
          const answer = await identifyLiveFrame({
            sessionId,
            frame: { mime: 'image/jpeg', base64 },
            evidence: { ocrText: localText ?? null },
          });
          if (!answer || !answer.identity?.name) return null;
          return {
            identityKey: answer.identity.name.toLowerCase(),
            label: answer.identity.name,
            confidence: answer.confidence,
            // The CATALOGUE's answer, resolved server-side. Null means Gellatti does not
            // know it, and the sweep will route it to the deep flow rather than name it.
            resolved: answer.resolution
              ? { id: answer.resolution.productId, displayName: answer.resolution.displayName }
              : null,
          };
        },
      }
    : base;

  if (options.enableOcr !== true) return withVision;

  return {
    ...withVision,
    async readLabelText(source) {
      if (!(source instanceof ImageData)) return null;
      const bytes = await encodeFrame(source);
      if (!bytes) return null;
      const session = await sharedOcrSession(options.languages ?? ['pol', 'eng']);
      const outcome = await session.run(bytes).done;
      return outcome.status === 'ok' ? (outcome.text ?? null) : null;
    },
  };
}

/** Re-exported so callers do not reach past this adapter into the decoder internals. */
export { validateBarcode };
