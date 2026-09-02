import { validateBarcode, type ValidBarcode } from './barcode';
import { decodeGtinFromRgba } from './barcodeScanline';

export const RETAIL_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export type BarcodeDecoderKind = 'native' | 'zxing_wasm';
export type BarcodeImageSource = CanvasImageSource | Blob | ImageData;

export interface DetectedBarcodeLike {
  rawValue: string;
  format?: string;
}

export interface BarcodeDetectorLike {
  detect(source: BarcodeImageSource): Promise<DetectedBarcodeLike[]>;
}

export interface BarcodeDetectorConstructorLike {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<readonly string[]>;
}

interface PonyfillModule {
  Detector: BarcodeDetectorConstructorLike;
  warmup: () => Promise<void>;
}

export interface BarcodeDecoder {
  readonly kind: BarcodeDecoderKind;
  readonly warmupMs: number;
  decode(source: BarcodeImageSource): Promise<ValidBarcode | null>;
}

export interface BarcodeDecoderDependencies {
  nativeDetector?: BarcodeDetectorConstructorLike | null;
  loadPonyfill?: () => Promise<PonyfillModule>;
  now?: () => number;
}

const elapsedNow = (): number =>
  typeof performance === 'undefined' ? Date.now() : performance.now();

function nativeBarcodeDetector(): BarcodeDetectorConstructorLike | null {
  if (typeof globalThis === 'undefined') return null;
  return (
    (
      globalThis as typeof globalThis & {
        BarcodeDetector?: BarcodeDetectorConstructorLike;
      }
    ).BarcodeDetector ?? null
  );
}

async function loadSelfHostedPonyfill(): Promise<PonyfillModule> {
  const [{ BarcodeDetector, prepareZXingModule }, wasmAsset] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  const wasmUrl = wasmAsset.default;
  const locateFile = (path: string, prefix: string) =>
    path.endsWith('.wasm') ? wasmUrl : `${prefix}${path}`;
  return {
    Detector: BarcodeDetector as unknown as BarcodeDetectorConstructorLike,
    warmup: async () => {
      await prepareZXingModule({
        overrides: { locateFile },
        fireImmediately: true,
      });
    },
  };
}

async function nativeSupportsRetail(Detector: BarcodeDetectorConstructorLike): Promise<boolean> {
  if (typeof Detector.getSupportedFormats !== 'function') return false;
  try {
    const supported = new Set(await Detector.getSupportedFormats());
    return RETAIL_BARCODE_FORMATS.every((format) => supported.has(format));
  } catch {
    return false;
  }
}

function decodeWithTertiaryReader(source: BarcodeImageSource): ValidBarcode | null {
  if (typeof HTMLCanvasElement === 'undefined' || !(source instanceof HTMLCanvasElement)) {
    return null;
  }
  try {
    const context = source.getContext('2d', { willReadFrequently: true });
    if (!context || source.width < 1 || source.height < 1) return null;
    const image = context.getImageData(0, 0, source.width, source.height);
    const raw = decodeGtinFromRgba(image.data, source.width, source.height);
    return raw ? validateBarcode(raw) : null;
  } catch {
    return null;
  }
}

class AdaptiveBarcodeDecoder implements BarcodeDecoder {
  private detector: BarcodeDetectorLike;
  private activeKind: BarcodeDecoderKind;
  private fallbackPromise: Promise<PonyfillModule> | null = null;

  constructor(
    kind: BarcodeDecoderKind,
    detector: BarcodeDetectorLike,
    private warmupDurationMs: number,
    private readonly loadPonyfill: () => Promise<PonyfillModule>,
    private readonly now: () => number,
  ) {
    this.activeKind = kind;
    this.detector = detector;
  }

  get kind(): BarcodeDecoderKind {
    return this.activeKind;
  }

  get warmupMs(): number {
    return this.warmupDurationMs;
  }

  private async switchToFallback(): Promise<void> {
    this.fallbackPromise ??= this.loadPonyfill();
    const ponyfill = await this.fallbackPromise;
    const startedAt = this.now();
    await ponyfill.warmup();
    this.warmupDurationMs = Math.max(0, this.now() - startedAt);
    this.detector = new ponyfill.Detector({ formats: [...RETAIL_BARCODE_FORMATS] });
    this.activeKind = 'zxing_wasm';
  }

  async decode(source: BarcodeImageSource): Promise<ValidBarcode | null> {
    let found: DetectedBarcodeLike[];
    try {
      found = await this.detector.detect(source);
    } catch {
      if (this.activeKind !== 'native') return decodeWithTertiaryReader(source);
      await this.switchToFallback();
      try {
        found = await this.detector.detect(source);
      } catch {
        return decodeWithTertiaryReader(source);
      }
    }
    const validated = found
      .map((item) => validateBarcode(item.rawValue, item.format))
      .find((item): item is ValidBarcode => item !== null);
    return validated ?? decodeWithTertiaryReader(source);
  }
}

export async function createBarcodeDecoder(
  dependencies: BarcodeDecoderDependencies = {},
): Promise<BarcodeDecoder> {
  const now = dependencies.now ?? elapsedNow;
  const loadPonyfill = dependencies.loadPonyfill ?? loadSelfHostedPonyfill;
  const native =
    dependencies.nativeDetector === undefined
      ? nativeBarcodeDetector()
      : dependencies.nativeDetector;

  if (native && (await nativeSupportsRetail(native))) {
    return new AdaptiveBarcodeDecoder(
      'native',
      new native({ formats: [...RETAIL_BARCODE_FORMATS] }),
      0,
      loadPonyfill,
      now,
    );
  }

  const startedAt = now();
  const ponyfill = await loadPonyfill();
  await ponyfill.warmup();
  return new AdaptiveBarcodeDecoder(
    'zxing_wasm',
    new ponyfill.Detector({ formats: [...RETAIL_BARCODE_FORMATS] }),
    Math.max(0, now() - startedAt),
    loadPonyfill,
    now,
  );
}

let sharedDecoder: Promise<BarcodeDecoder> | null = null;

/** Lazy route-owned singleton. Calling this on Scanner open prewarms the self-hosted WASM. */
export function getSharedBarcodeDecoder(): Promise<BarcodeDecoder> {
  sharedDecoder ??= createBarcodeDecoder();
  return sharedDecoder;
}
