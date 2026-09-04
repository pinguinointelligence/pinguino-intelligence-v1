import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  CHEAP_OPTIONS,
  HARDER_OPTIONS,
  createZxingDecoder,
  toOutcome,
} from '../worker/zxingAdapter';
import { noisePlane, paintEan13 } from './synthetic';

const CODE = '5901234123457';
const wasmBinary = readFileSync(
  createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'),
);
const decoderForNode = () => createZxingDecoder({ wasmBinary });

describe('zxing-wasm adapter (node, real wasm)', () => {
  it('decodes a synthetic EAN-13 with the cheap options and reports geometry', async () => {
    const decoder = decoderForNode();
    const warm = await decoder.warmup();
    expect(warm).toBeGreaterThanOrEqual(0);
    const plane = noisePlane(640, 360, 5, 128, 6);
    paintEan13(plane, CODE, 320, 180, 3, 100, 0);
    const outcome = await decoder.decodeLuma(
      plane.data,
      plane.width,
      plane.height,
      'full_cheap',
      CHEAP_OPTIONS,
    );
    expect(outcome.variant).toBe('full_cheap');
    expect(outcome.inputWidth).toBe(640);
    const hit = outcome.results.find((r) => r.checksumValid);
    expect(hit?.text).toBe(CODE);
    expect(hit?.format).toBe('EAN13');
    expect(hit?.quad).not.toBeNull();
    expect(hit!.lineCount).toBeGreaterThan(0);
  }, 30_000);

  it('returns no valid result on noise and decodes a rotated code only with the harder options', async () => {
    const decoder = decoderForNode();
    const noise = noisePlane(320, 240, 9, 128, 30);
    const none = await decoder.decodeLuma(
      noise.data,
      noise.width,
      noise.height,
      'full_cheap',
      CHEAP_OPTIONS,
    );
    expect(none.results.some((r) => r.checksumValid)).toBe(false);
    const plane = noisePlane(480, 480, 5, 128, 6);
    paintEan13(plane, CODE, 240, 240, 3, 100, 90);
    const cheap = await decoder.decodeLuma(
      plane.data,
      plane.width,
      plane.height,
      'full_cheap',
      CHEAP_OPTIONS,
    );
    const harder = await decoder.decodeLuma(
      plane.data,
      plane.width,
      plane.height,
      'full_harder',
      HARDER_OPTIONS,
    );
    expect(cheap.results.some((r) => r.checksumValid)).toBe(false);
    expect(harder.results.find((r) => r.checksumValid)?.text).toBe(CODE);
  }, 30_000);
});

describe('toOutcome', () => {
  it('maps zxing results, validates the checksum and counts error results with geometry', () => {
    const pos = (x: number) => ({
      topLeft: { x, y: 0 },
      topRight: { x: x + 10, y: 0 },
      bottomRight: { x: x + 10, y: 5 },
      bottomLeft: { x, y: 5 },
    });
    const outcome = toOutcome('roi_cheap', 100, 50, 3.5, [
      {
        text: '5901234123457',
        format: 'EAN-13',
        isValid: true,
        error: '',
        lineCount: 2,
        position: pos(1),
      } as never,
      {
        text: '5901234123458',
        format: 'EAN-13',
        isValid: true,
        error: '',
        lineCount: 1,
        position: pos(20),
      } as never,
      {
        text: '',
        format: 'EAN-13',
        isValid: false,
        error: 'ChecksumError',
        lineCount: 0,
        position: pos(40),
      } as never,
      {
        text: '',
        format: '',
        isValid: false,
        error: 'x',
        lineCount: 0,
        position: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 0, y: 0 },
          bottomRight: { x: 0, y: 0 },
          bottomLeft: { x: 0, y: 0 },
        },
      } as never,
    ]);
    expect(outcome).toMatchObject({
      variant: 'roi_cheap',
      inputWidth: 100,
      inputHeight: 50,
      durationMs: 3.5,
      errorResultsWithGeometry: 1,
    });
    expect(outcome.results.map((r) => r.checksumValid)).toEqual([true, false, false, false]);
    expect(outcome.results[0]!.quad?.points[2]).toEqual({ x: 11, y: 5 });
    expect(outcome.results[3]!.quad).toBeNull();
  });
});
