import { describe, expect, it } from 'vitest';
import {
  decodeGtinFromLuminance,
  decodeGtinFromRow,
  luminanceFromRgba,
  scanlineRuns,
} from './barcodeScanline';

/**
 * A real encoder, so the decoder is proved against the actual GS1 module layout
 * rather than against a fixture that was itself produced by the decoder.
 */
const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const G = L.map((code) => [...code].reverse().map((bit) => (bit === '0' ? '1' : '0')).join(''));
const R = L.map((code) => [...code].map((bit) => (bit === '0' ? '1' : '0')).join(''));
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

function ean13Modules(value: string): string {
  const digits = [...value].map(Number);
  const parity = PARITY[digits[0]!]!;
  const left = digits
    .slice(1, 7)
    .map((digit, index) => (parity[index] === 'L' ? L[digit]! : G[digit]!))
    .join('');
  const right = digits.slice(7).map((digit) => R[digit]!).join('');
  return `101${left}01010${right}101`;
}

function ean8Modules(value: string): string {
  const digits = [...value].map(Number);
  const left = digits.slice(0, 4).map((digit) => L[digit]!).join('');
  const right = digits.slice(4).map((digit) => R[digit]!).join('');
  return `101${left}01010${right}101`;
}

/** Modules → one scanline: dark module = 0 luminance, quiet zone included. */
function renderRow(modules: string, scale: number, quietModules = 10): Uint8Array {
  const quiet = new Array(quietModules * scale).fill(240);
  const bars = [...modules].flatMap((module) => new Array(scale).fill(module === '1' ? 20 : 240));
  return Uint8Array.from([...quiet, ...bars, ...quiet]);
}

describe('scanline GTIN decoding (no BarcodeDetector)', () => {
  it('reads an EAN-13 the way it is printed', () => {
    // Coca-Cola Zero 330 ml — the owner's regression product.
    expect(decodeGtinFromRow(renderRow(ean13Modules('5449000131805'), 3))).toBe('5449000131805');
  });

  it('reads the same code at several camera distances', () => {
    for (const scale of [2, 3, 4, 6, 9]) {
      expect(decodeGtinFromRow(renderRow(ean13Modules('5900497010115'), scale))).toBe(
        '5900497010115',
      );
    }
  });

  it('reads a package held upside down', () => {
    const row = renderRow(ean13Modules('5449000131805'), 4);
    expect(decodeGtinFromRow(Uint8Array.from([...row].reverse()))).toBe('5449000131805');
  });

  it('reads UPC-A as the 13-digit GTIN it is', () => {
    expect(decodeGtinFromRow(renderRow(ean13Modules('0012000161155'), 4))).toBe('0012000161155');
  });

  it('reads EAN-8', () => {
    expect(decodeGtinFromRow(renderRow(ean8Modules('96385074'), 5))).toBe('96385074');
  });

  it('survives sensor noise and uneven lighting', () => {
    const row = [...renderRow(ean13Modules('5449000131805'), 5)].map((value, index) => {
      const shading = Math.round((index / 40) % 12); // a gradient across the label
      const noise = (index * 37) % 7;
      return Math.max(0, Math.min(255, value - shading + noise));
    });
    expect(decodeGtinFromRow(Uint8Array.from(row))).toBe('5449000131805');
  });

  it('refuses text, gradients and flat surfaces rather than inventing a code', () => {
    expect(decodeGtinFromRow(new Uint8Array(600).fill(200))).toBeNull();
    expect(decodeGtinFromRow(Uint8Array.from({ length: 600 }, (_, i) => (i / 600) * 255))).toBeNull();
    expect(
      decodeGtinFromRow(Uint8Array.from({ length: 600 }, (_, i) => ((i * 13) % 5 < 2 ? 30 : 230))),
    ).toBeNull();
  });

  it('refuses a code whose check digit does not hold', () => {
    // Same layout, one digit corrupted: a wrong EAN is worse than none.
    const modules = ean13Modules('5449000131805');
    const broken = `${modules.slice(0, 3 + 42 + 5)}${R[4]!}${modules.slice(3 + 42 + 5 + 7)}`;
    expect(decodeGtinFromRow(renderRow(broken, 4))).toBeNull();
  });

  it('finds the code anywhere in the frame, not only on the centre line', () => {
    const width = 420;
    const height = 60;
    const barRow = renderRow(ean13Modules('5449000131805'), 3);
    const frame = new Uint8Array(width * height).fill(235);
    for (let y = 40; y < 52; y += 1) {
      frame.set(barRow.subarray(0, width), y * width);
    }
    expect(decodeGtinFromLuminance(frame, width, height)).toBe('5449000131805');
  });

  it('reads the luminance the camera loop actually produces', () => {
    const row = renderRow(ean13Modules('5449000131805'), 3);
    const rgba = new Uint8ClampedArray(row.length * 4);
    row.forEach((value, index) => {
      rgba.set([value, value, value, 255], index * 4);
    });
    const luminance = luminanceFromRgba(rgba, row.length, 1);
    expect(decodeGtinFromLuminance(luminance, row.length, 1, 1)).toBe('5449000131805');
  });

  it('describes a blank row as no runs at all', () => {
    expect(scanlineRuns(new Uint8Array(100).fill(128))).toEqual([]);
  });
});
