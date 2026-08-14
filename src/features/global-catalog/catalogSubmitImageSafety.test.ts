import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evidenceImageDimensionsAllowed } from '../../../supabase/functions/_shared/evidenceImageDimensions';

const EDGE = readFileSync(
  join(process.cwd(), 'supabase/functions/catalog-submit/index.ts'),
  'utf8',
);

const pngHeader = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const jpegHeader = (width: number, height: number): Uint8Array =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 255,
    height & 255,
    (width >> 8) & 255,
    width & 255,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
  ]);

const riffWebp = (type: 'VP8 ' | 'VP8L', payload: number[]): Uint8Array => {
  const bytes = new Uint8Array(20 + payload.length);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode(type), 12);
  bytes[16] = payload.length;
  bytes.set(payload, 20);
  return bytes;
};

const vp8xWebp = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode('VP8X'), 12);
  bytes[16] = 10;
  for (const [offset, value] of [
    [24, width - 1],
    [27, height - 1],
  ] as const) {
    bytes[offset] = value & 255;
    bytes[offset + 1] = (value >> 8) & 255;
    bytes[offset + 2] = (value >> 16) & 255;
  }
  return bytes;
};

describe('catalog-submit evidence image safety', () => {
  it('rejects pixel bombs and accepts a bounded raster before Edge decoding', () => {
    expect(evidenceImageDimensionsAllowed(pngHeader(2_000, 2_000), 'image/png')).toBe(true);
    expect(evidenceImageDimensionsAllowed(pngHeader(12_000, 12_000), 'image/png')).toBe(false);
    expect(evidenceImageDimensionsAllowed(pngHeader(12_001, 100), 'image/png')).toBe(false);
  });

  it('enforces the same server cap for JPEG, VP8 and VP8L headers', () => {
    expect(evidenceImageDimensionsAllowed(jpegHeader(640, 480), 'image/jpeg')).toBe(true);
    expect(evidenceImageDimensionsAllowed(jpegHeader(12_001, 100), 'image/jpeg')).toBe(false);

    const vp8 = riffWebp('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]);
    expect(evidenceImageDimensionsAllowed(vp8, 'image/webp')).toBe(true);
    expect(evidenceImageDimensionsAllowed(vp8xWebp(640, 480), 'image/webp')).toBe(true);
    expect(evidenceImageDimensionsAllowed(vp8xWebp(12_001, 100), 'image/webp')).toBe(false);

    const width = 320;
    const height = 240;
    const widthBits = width - 1;
    const heightBits = height - 1;
    const vp8l = riffWebp('VP8L', [
      0x2f,
      widthBits & 255,
      ((widthBits >> 8) & 0x3f) | ((heightBits & 0x03) << 6),
      (heightBits >> 2) & 255,
      (heightBits >> 10) & 0x0f,
    ]);
    expect(evidenceImageDimensionsAllowed(vp8l, 'image/webp')).toBe(true);
  });

  it('guards archived bytes before ImageScript decode', () => {
    const guard = EDGE.indexOf('if (!evidenceImageDimensionsAllowed(bytes, mime)) return null;');
    const decode = EDGE.indexOf('Image.decode(bytes)');
    expect(guard).toBeGreaterThan(0);
    expect(decode).toBeGreaterThan(guard);
    expect(EDGE).toContain('ocr_evidence_image_dimensions_invalid');
  });
});
