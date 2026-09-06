/**
 * zxing-wasm adapter for the harness. Runs in the decode Worker (and in node tests). Every decode is
 * one `readBarcodes` call on an RGBA pixmap expanded from the luminance plane; the expansion buffer is
 * pooled so a steady stream of frames allocates nothing after warm-up.
 *
 * Isolation: this file must not import from src/features/product-scanner.
 */
import {
  prepareZXingModule,
  readBarcodes,
  ZXING_WASM_VERSION,
  type ReaderOptions,
  type ReadResult,
} from 'zxing-wasm/reader';
import type { DecodeOutcome, DecodeVariant, Quad } from '../types';
import { lumaToRgba } from '../vision/rectify';
import { isChecksumValidGtin, normalizeGtin } from './gtin';

export const RETAIL_FORMATS: NonNullable<ReaderOptions['formats']> = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
];

/** "Cheap": the single-pass reader with every retry knob off — what a live loop can afford per frame. */
export const CHEAP_OPTIONS: ReaderOptions = {
  formats: RETAIL_FORMATS,
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: false,
  binarizer: 'LocalAverage',
  returnErrors: true,
  maxNumberOfSymbols: 4,
  minLineCount: 2,
};

/** "Harder": zxing's own retry ladder (rotation, inversion, downscale, tryHarder) — measured separately. */
export const HARDER_OPTIONS: ReaderOptions = {
  ...CHEAP_OPTIONS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
};

export interface ZxingDecoder {
  /** Loads + instantiates the wasm module; resolves to the warm-up time in ms (0 when already warm). */
  warmup(): Promise<number>;
  decodeLuma(
    luma: Uint8Array,
    width: number,
    height: number,
    variant: DecodeVariant,
    options: ReaderOptions,
  ): Promise<DecodeOutcome>;
  readonly version: string;
}

export interface ZxingDecoderOptions {
  /** URL of zxing_reader.wasm (Vite `?url` import). null → the library's default locateFile. */
  wasmUrl?: string | null;
  /** Pre-loaded wasm bytes (node tests: the Emscripten glue cannot fetch a relative URL under vitest). */
  wasmBinary?: ArrayBuffer | Uint8Array;
  now?: () => number;
}

function quadFromPosition(result: ReadResult): Quad | null {
  const p = result.position;
  if (!p) return null;
  const pts = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
  if (pts.some((q) => !q || typeof q.x !== 'number' || typeof q.y !== 'number')) return null;
  if (pts.every((q) => q.x === 0 && q.y === 0)) return null;
  return {
    points: [
      { x: pts[0]!.x, y: pts[0]!.y },
      { x: pts[1]!.x, y: pts[1]!.y },
      { x: pts[2]!.x, y: pts[2]!.y },
      { x: pts[3]!.x, y: pts[3]!.y },
    ],
  };
}

export function toOutcome(
  variant: DecodeVariant,
  width: number,
  height: number,
  durationMs: number,
  results: readonly ReadResult[],
): DecodeOutcome {
  let errorResultsWithGeometry = 0;
  const mapped = results.map((r) => {
    const quad = quadFromPosition(r);
    const digits = normalizeGtin(r.text ?? '');
    if (!r.isValid && quad) errorResultsWithGeometry += 1;
    return {
      text: r.text ?? '',
      format: r.format ?? '',
      isValid: Boolean(r.isValid),
      error: r.error ?? '',
      checksumValid: Boolean(r.isValid) && digits !== null && isChecksumValidGtin(digits),
      lineCount: typeof r.lineCount === 'number' ? r.lineCount : 0,
      quad,
    };
  });
  return {
    variant,
    inputWidth: width,
    inputHeight: height,
    durationMs,
    results: mapped,
    errorResultsWithGeometry,
  };
}

export function createZxingDecoder(opts: ZxingDecoderOptions = {}): ZxingDecoder {
  const now = opts.now ?? (() => performance.now());
  let rgba: Uint8ClampedArray | undefined;
  let warm: Promise<number> | null = null;

  const warmup = (): Promise<number> => {
    if (warm) return warm;
    const t0 = now();
    const overrides: Record<string, unknown> = {};
    if (opts.wasmBinary) overrides['wasmBinary'] = opts.wasmBinary;
    else if (opts.wasmUrl) {
      overrides['locateFile'] = (path: string, prefix: string) =>
        path.endsWith('.wasm') ? (opts.wasmUrl as string) : `${prefix}${path}`;
    }
    warm = prepareZXingModule({ overrides, fireImmediately: true }).then(() => now() - t0);
    return warm;
  };

  return {
    version: ZXING_WASM_VERSION,
    warmup,
    async decodeLuma(luma, width, height, variant, options) {
      await warmup();
      const t0 = now();
      rgba = lumaToRgba(luma.subarray(0, width * height), rgba);
      // zxing-wasm duck-types `{ data, width, height }` as an RGBA pixmap.
      const pixmap = { data: rgba, width, height } as unknown as ImageData;
      const results = await readBarcodes(pixmap, options);
      return toOutcome(variant, width, height, now() - t0, results);
    },
  };
}
