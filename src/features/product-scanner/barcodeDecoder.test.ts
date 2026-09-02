import { describe, expect, it, vi } from 'vitest';
import {
  RETAIL_BARCODE_FORMATS,
  createBarcodeDecoder,
  type BarcodeDetectorConstructorLike,
} from './barcodeDecoder';

const source = {} as CanvasImageSource;

function detector(
  formats: readonly string[],
  results: Array<{ rawValue: string; format?: string }> = [],
): BarcodeDetectorConstructorLike {
  return class {
    static async getSupportedFormats() {
      return formats;
    }
    async detect() {
      return results;
    }
  } as BarcodeDetectorConstructorLike;
}

describe('cross-platform BarcodeDecoder selection', () => {
  it('uses native detection only when every required retail format is supported', async () => {
    const loadPonyfill = vi.fn();
    const decoder = await createBarcodeDecoder({
      nativeDetector: detector(RETAIL_BARCODE_FORMATS, [
        { rawValue: '5449000131805', format: 'ean_13' },
      ]),
      loadPonyfill,
    });

    expect(decoder.kind).toBe('native');
    expect(loadPonyfill).not.toHaveBeenCalled();
    await expect(decoder.decode(source)).resolves.toMatchObject({
      value: '5449000131805',
      format: 'EAN_13',
    });
  });

  it('guarantees ZXing-WASM when native BarcodeDetector is absent', async () => {
    const warmup = vi.fn().mockResolvedValue(undefined);
    const decoder = await createBarcodeDecoder({
      nativeDetector: null,
      loadPonyfill: async () => ({
        Detector: detector(RETAIL_BARCODE_FORMATS, [{ rawValue: '96385074', format: 'ean_8' }]),
        warmup,
      }),
    });

    expect(decoder.kind).toBe('zxing_wasm');
    expect(warmup).toHaveBeenCalledOnce();
    await expect(decoder.decode(source)).resolves.toMatchObject({
      value: '96385074',
      format: 'EAN_8',
    });
  });

  it('rejects a partial native implementation and selects ZXing-WASM', async () => {
    const decoder = await createBarcodeDecoder({
      nativeDetector: detector(['ean_13']),
      loadPonyfill: async () => ({
        Detector: detector(RETAIL_BARCODE_FORMATS),
        warmup: async () => undefined,
      }),
    });

    expect(decoder.kind).toBe('zxing_wasm');
  });

  it('switches to the warmed ZXing-WASM path when a nominal native decoder fails at runtime', async () => {
    const failingNative = class {
      static async getSupportedFormats() {
        return RETAIL_BARCODE_FORMATS;
      }
      async detect(): Promise<never> {
        throw new Error('native implementation failed');
      }
    } as BarcodeDetectorConstructorLike;
    const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(42);
    const decoder = await createBarcodeDecoder({
      nativeDetector: failingNative,
      now,
      loadPonyfill: async () => ({
        Detector: detector(RETAIL_BARCODE_FORMATS, [{ rawValue: '042100005264', format: 'upc_a' }]),
        warmup: async () => undefined,
      }),
    });

    await expect(decoder.decode(source)).resolves.toMatchObject({
      value: '042100005264',
      format: 'UPC_A',
    });
    expect(decoder.kind).toBe('zxing_wasm');
    expect(decoder.warmupMs).toBe(32);
  });

  it('never surfaces an invalid check digit from either adapter', async () => {
    const decoder = await createBarcodeDecoder({
      nativeDetector: detector(RETAIL_BARCODE_FORMATS, [
        { rawValue: '5449000131804', format: 'ean_13' },
      ]),
      loadPonyfill: vi.fn(),
    });

    await expect(decoder.decode(source)).resolves.toBeNull();
  });
});
