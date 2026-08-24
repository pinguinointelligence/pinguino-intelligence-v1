import { describe, expect, it } from 'vitest';
import { decodeGtinFromLuminance } from './barcodeScanline';
import { summarizeBarcodeTimings } from './barcodeTiming';

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G = L.map((code) =>
  [...code]
    .reverse()
    .map((bit) => (bit === '0' ? '1' : '0'))
    .join(''),
);
const R = L.map((code) => [...code].map((bit) => (bit === '0' ? '1' : '0')).join(''));
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

function modules(value: string): string {
  const digits = [...value].map(Number);
  const parity = PARITY[digits[0]!]!;
  const left = digits
    .slice(1, 7)
    .map((digit, index) => (parity[index] === 'L' ? L[digit]! : G[digit]!))
    .join('');
  return `101${left}01010${digits
    .slice(7)
    .map((digit) => R[digit]!)
    .join('')}101`;
}

function fixture(
  scale: number,
  barcodeY: number,
): { pixels: Uint8Array; width: number; height: number } {
  const bits = `${'0'.repeat(10)}${modules('5449000131805')}${'0'.repeat(10)}`;
  const row = Uint8Array.from(
    [...bits].flatMap((bit) => Array.from({ length: scale }, () => (bit === '1' ? 20 : 240))),
  );
  const width = row.length;
  const height = 180;
  const pixels = new Uint8Array(width * height).fill(238);
  for (let y = barcodeY; y < Math.min(height, barcodeY + 70); y += 1) pixels.set(row, y * width);
  return { pixels, width, height };
}

describe('time_to_first_valid_barcode_ms synthetic fixture target', () => {
  it('keeps p50/p95/max safely below the 500 ms software target', () => {
    const timings: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const frame = fixture(3 + (index % 3), 18 + (index % 5) * 20);
      const startedAt = performance.now();
      expect(decodeGtinFromLuminance(frame.pixels, frame.width, frame.height)).toBe(
        '5449000131805',
      );
      timings.push(performance.now() - startedAt);
    }
    const summary = summarizeBarcodeTimings(timings);
    expect(summary).toMatchObject({ count: 30 });
    expect(summary.p50).toBeLessThan(500);
    expect(summary.p95).toBeLessThan(500);
    expect(summary.max).toBeLessThan(500);
  });
});
