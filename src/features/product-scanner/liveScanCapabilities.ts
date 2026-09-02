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
import type { OcrRunOutcome } from '@/features/ocr-intake/intakeContracts';

/** How much of a read label is worth searching for. */
const OCR_MIN_TEXT_LENGTH = 3;

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

type OcrRecognize = (input: {
  imageId: string;
  bytes: Uint8Array;
  mime: 'image/png';
  languages: string[];
}) => Promise<OcrRunOutcome>;

/**
 * ONE OCR engine for the whole sweep.
 *
 * The provider owns a WASM worker. Building a new one per attempt would spawn a worker,
 * load the language data and tear it all down again every 1.5 s — far more expensive than
 * the recognition it performs. The engine is also imported LAZILY, so a sweep that only
 * ever sees barcodes never downloads it at all.
 */
let ocrProvider: Promise<{ recognize: OcrRecognize }> | null = null;

function sharedOcrProvider(): Promise<{ recognize: OcrRecognize }> {
  ocrProvider ??= import('@/features/ocr-intake/provider/tesseractProvider').then(
    ({ TesseractOcrProvider }) => new TesseractOcrProvider() as { recognize: OcrRecognize },
  );
  return ocrProvider;
}

export interface LiveCapabilityOptions {
  /** Off by default: the sweep is barcode-first, and OCR costs a second of CPU a frame. */
  readonly enableOcr?: boolean;
  readonly languages?: readonly string[];
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

  if (options.enableOcr !== true) return base;

  return {
    ...base,
    async readLabelText(source) {
      if (!(source instanceof ImageData)) return null;
      const bytes = await encodeFrame(source);
      if (!bytes) return null;
      const outcome = await (
        await sharedOcrProvider()
      ).recognize({
        imageId: `live-${Date.now()}`,
        bytes,
        mime: 'image/png',
        languages: [...(options.languages ?? ['pol', 'eng'])],
      });
      return outcome.ok ? outcome.result.fullText : null;
    },
  };
}

/** Re-exported so callers do not reach past this adapter into the decoder internals. */
export { validateBarcode };
