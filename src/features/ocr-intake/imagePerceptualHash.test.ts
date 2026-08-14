import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  averageHashFromRgba,
  browserPerceptualHash,
  normalizeEvidenceImage,
  rasterDimensions,
  webpDimensions,
} from './imagePerceptualHash';

afterEach(() => vi.unstubAllGlobals());

const vp8xWebp = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode('VP8X'), 12);
  bytes[16] = 10;
  const write24 = (offset: number, value: number) => {
    bytes[offset] = value & 255;
    bytes[offset + 1] = (value >> 8) & 255;
    bytes[offset + 2] = (value >> 16) & 255;
  };
  write24(24, width - 1);
  write24(27, height - 1);
  return bytes;
};

const vp8xWebpBuffer = (width: number, height: number): ArrayBuffer => {
  const bytes = vp8xWebp(width, height);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const riffWebp = (type: 'VP8 ' | 'VP8L', payload: number[]): Uint8Array => {
  const bytes = new Uint8Array(20 + payload.length);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode(type), 12);
  bytes[16] = payload.length;
  bytes.set(payload, 20);
  return bytes;
};

describe('OCR duplicate-preview perceptual hash', () => {
  it('creates the server-compatible 16-character 8x8 average hash', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    for (let pixel = 0; pixel < 64; pixel += 1) {
      const value = pixel < 32 ? 0 : 255;
      rgba[pixel * 4] = value;
      rgba[pixel * 4 + 1] = value;
      rgba[pixel * 4 + 2] = value;
      rgba[pixel * 4 + 3] = 255;
    }
    expect(averageHashFromRgba(rgba)).toBe('00000000ffffffff');
  });

  it('rejects a buffer that is not an exact 8x8 RGBA image', () => {
    expect(averageHashFromRgba(new Uint8ClampedArray(8))).toBeNull();
  });

  it('ignores decoder-specific hidden RGB under fully transparent pixels', () => {
    const hiddenRed = new Uint8ClampedArray(8 * 8 * 4);
    const hiddenBlue = new Uint8ClampedArray(8 * 8 * 4);
    for (let pixel = 0; pixel < 64; pixel += 1) {
      const transparent = pixel < 32;
      hiddenRed.set(transparent ? [255, 0, 0, 0] : [50, 50, 50, 255], pixel * 4);
      hiddenBlue.set(transparent ? [0, 0, 255, 0] : [50, 50, 50, 255], pixel * 4);
    }
    expect(averageHashFromRgba(hiddenRed)).toBe(averageHashFromRgba(hiddenBlue));
  });

  it('hashes a WebP image when the browser decoder supports it', async () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    for (let pixel = 0; pixel < 64; pixel += 1) {
      const value = pixel < 32 ? 0 : 255;
      rgba[pixel * 4] = value;
      rgba[pixel * 4 + 1] = value;
      rgba[pixel * 4 + 2] = value;
      rgba[pixel * 4 + 3] = 255;
    }
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 80, height: 40, close })));
    let sample = 0;
    const context = {
      imageSmoothingEnabled: true,
      globalCompositeOperation: 'source-over',
      drawImage: vi.fn(),
      getImageData: () => ({ data: rgba.slice(sample * 4, ++sample * 4) }),
    };
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() {
        return context;
      }
    });

    await expect(browserPerceptualHash(new Blob(['webp'], { type: 'image/webp' })))
      .resolves.toBe('00000000ffffffff');
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.globalCompositeOperation).toBe('copy');
    expect(context.drawImage).toHaveBeenCalledTimes(64);
    expect(close).toHaveBeenCalledOnce();
  });

  it('prefers the page canvas and keeps nearest-neighbour sampling in the customer flow', async () => {
    const close = vi.fn();
    const pageContext = {
      imageSmoothingEnabled: true,
      globalCompositeOperation: 'source-over',
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 80, height: 40, close })));
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => pageContext }),
    });
    vi.stubGlobal('OffscreenCanvas', class {
      constructor() {
        throw new Error('page flow must not select OffscreenCanvas');
      }
    });

    await expect(browserPerceptualHash(new Blob(['png'], { type: 'image/png' })))
      .resolves.toBe('ffffffffffffffff');
    expect(pageContext.imageSmoothingEnabled).toBe(false);
    expect(pageContext.globalCompositeOperation).toBe('copy');
    expect(pageContext.drawImage).toHaveBeenCalledTimes(64);
    expect(pageContext.drawImage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    );
    expect(pageContext.drawImage).toHaveBeenNthCalledWith(
      64,
      expect.anything(),
      70,
      35,
      1,
      1,
      0,
      0,
      1,
      1,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('normalizes WebP to PNG before checksum, OCR, archive and final server pHash', async () => {
    const close = vi.fn();
    const createBitmap = vi.fn(async () => ({ width: 4, height: 3, close }));
    vi.stubGlobal('createImageBitmap', createBitmap);
    const drawImage = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })),
      }),
    });
    const source = new File([vp8xWebpBuffer(4, 3)], 'etykieta.webp', {
      type: 'image/webp',
      lastModified: 123,
    });

    const normalized = await normalizeEvidenceImage(source);

    expect(normalized).toMatchObject({ name: 'etykieta.png', type: 'image/png', lastModified: 123 });
    expect(createBitmap).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4, 3);
    expect(close).toHaveBeenCalledOnce();
  });

  it('normalizes an EXIF-oriented JPEG to the exact PNG bytes used by the Edge', async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x01, 0xe0,
      0x02, 0x80,
      0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00,
      0x03, 0x11, 0x00,
    ]);
    const source = new File([jpeg], 'telefon.jpg', { type: 'image/jpeg', lastModified: 456 });
    const close = vi.fn();
    const createBitmap = vi.fn(async () => ({ width: 480, height: 640, close }));
    vi.stubGlobal('createImageBitmap', createBitmap);
    const drawImage = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })),
      }),
    });

    const normalized = await normalizeEvidenceImage(source);

    expect(normalized).toMatchObject({ name: 'telefon.png', type: 'image/png', lastModified: 456 });
    expect(createBitmap).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 480, 640);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rewrites PNG through canvas so hidden transparent RGB cannot diverge on the Edge', async () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set(new TextEncoder().encode('IHDR'), 12);
    new DataView(png.buffer).setUint32(16, 2);
    new DataView(png.buffer).setUint32(20, 1);
    const source = new File([png], 'alpha.png', { type: 'image/png', lastModified: 789 });
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 1, close })));
    const drawImage = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['canonical'], { type: 'image/png' })),
      }),
    });

    const normalized = await normalizeEvidenceImage(source);

    expect(normalized).toMatchObject({ name: 'alpha.png', type: 'image/png', lastModified: 789 });
    expect(await normalized!.text()).toBe('canonical');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2, 1);
    expect(close).toHaveBeenCalledOnce();
  });

  it('bounds a valid large phone JPEG before lossless PNG encoding', async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x0b, 0xb8,
      0x0f, 0xa0,
      0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00,
      0x03, 0x11, 0x00,
    ]);
    const source = new File([jpeg], 'telefon-12mp.jpg', { type: 'image/jpeg' });
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['bounded'], { type: 'image/png' })),
    };
    vi.stubGlobal('document', { createElement: () => canvas });

    const normalized = await normalizeEvidenceImage(source);

    expect(normalized).toMatchObject({ name: 'telefon-12mp.png', type: 'image/png' });
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(2_000_000);
    expect(canvas.width).toBeLessThanOrEqual(2_200);
    expect(canvas.height).toBeLessThanOrEqual(2_200);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects WebP when it cannot be normalized for matching final evidence', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(normalizeEvidenceImage(new File(['webp'], 'label.webp', { type: 'image/webp' })))
      .resolves.toBeNull();
  });

  it('reads dimensions before decode and rejects a compressed pixel bomb', async () => {
    expect(webpDimensions(vp8xWebp(4, 3))).toEqual({ width: 4, height: 3 });
    const createBitmap = vi.fn(async () => ({ width: 12_000, height: 12_000, close: vi.fn() }));
    vi.stubGlobal('createImageBitmap', createBitmap);
    vi.stubGlobal('document', { createElement: vi.fn() });

    await expect(normalizeEvidenceImage(new File(
      [vp8xWebpBuffer(12_000, 12_000)],
      'huge.webp',
      { type: 'image/webp' },
    ))).resolves.toBeNull();
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('reads VP8 and VP8L dimensions without decoding pixels', () => {
    const vp8 = riffWebp('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]);
    expect(webpDimensions(vp8)).toEqual({ width: 640, height: 480 });

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
    expect(webpDimensions(vp8l)).toEqual({ width, height });
  });

  it('reads PNG and JPEG dimensions before browser decode', () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set(new TextEncoder().encode('IHDR'), 12);
    new DataView(png.buffer).setUint32(16, 1024);
    new DataView(png.buffer).setUint32(20, 768);
    expect(rasterDimensions(png, 'image/png')).toEqual({ width: 1024, height: 768 });

    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x01, 0xe0,
      0x02, 0x80,
      0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00,
      0x03, 0x11, 0x00,
    ]);
    expect(rasterDimensions(jpeg, 'image/jpeg')).toEqual({ width: 640, height: 480 });
  });
});
