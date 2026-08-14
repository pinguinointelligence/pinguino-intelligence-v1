const HASH_SIDE = 8;
const HASH_PIXEL_COUNT = HASH_SIDE * HASH_SIDE;
const MAX_RASTER_DIMENSION = 12_000;
const MAX_RASTER_PIXELS = 40_000_000;
// Keep the lossless canonical PNG below the 10 MiB evidence limit even for
// incompressible RGBA phone photos (2M * 4 bytes plus PNG framing).
const MAX_CANONICAL_PIXELS = 2_000_000;
const MAX_CANONICAL_EDGE = 2_200;

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

const uint24le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);

/** Read WebP dimensions from the bounded RIFF header/chunks before asking the
 * browser to decode the image. This prevents a tiny compressed file from
 * allocating an unbounded canvas during evidence normalization. */
export function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = (bytes[offset + 4] ?? 0)
      | ((bytes[offset + 5] ?? 0) << 8)
      | ((bytes[offset + 6] ?? 0) << 16)
      | ((bytes[offset + 7] ?? 0) << 24);
    const data = offset + 8;
    if (type === 'VP8X' && data + 10 <= bytes.length) {
      return { width: uint24le(bytes, data + 4) + 1, height: uint24le(bytes, data + 7) + 1 };
    }
    if (type === 'VP8L' && data + 5 <= bytes.length && bytes[data] === 0x2f) {
      return {
        width: 1 + (((bytes[data + 2] ?? 0) & 0x3f) << 8 | (bytes[data + 1] ?? 0)),
        height: 1 + (((bytes[data + 4] ?? 0) & 0x0f) << 10
          | (bytes[data + 3] ?? 0) << 2
          | ((bytes[data + 2] ?? 0) & 0xc0) >> 6),
      };
    }
    if (
      type === 'VP8 '
      && data + 10 <= bytes.length
      && bytes[data + 3] === 0x9d
      && bytes[data + 4] === 0x01
      && bytes[data + 5] === 0x2a
    ) {
      return {
        width: ((bytes[data + 6] ?? 0) | ((bytes[data + 7] ?? 0) << 8)) & 0x3fff,
        height: ((bytes[data + 8] ?? 0) | ((bytes[data + 9] ?? 0) << 8)) & 0x3fff,
      };
    }
    if (size < 0 || data + size > bytes.length) return null;
    offset = data + size + (size % 2);
  }
  return null;
}

const pngDimensions = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (
    bytes.length < 24
    || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    || ascii(bytes, 12, 4) !== 'IHDR'
  ) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const jpegDimensions = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (bytes.length < 11 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    offset += 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const size = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (size < 2 || offset + size > bytes.length) return null;
    if (JPEG_SOF.has(marker) && size >= 7) {
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      };
    }
    offset += size;
  }
  return null;
};

export function rasterDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  if (mime === 'image/webp') return webpDimensions(bytes);
  if (mime === 'image/png') return pngDimensions(bytes);
  if (mime === 'image/jpeg') return jpegDimensions(bytes);
  return null;
}

const dimensionsAllowed = (dimensions: { width: number; height: number } | null): boolean =>
  dimensions !== null
  && dimensions.width > 0
  && dimensions.height > 0
  && dimensions.width <= MAX_RASTER_DIMENSION
  && dimensions.height <= MAX_RASTER_DIMENSION
  && dimensions.width * dimensions.height <= MAX_RASTER_PIXELS;

/**
 * Produce the same 64-bit average-hash shape as the server evidence adapter.
 * This browser value is only a duplicate-preview hint. The final ingest always
 * recomputes the hash from archived bytes on the server.
 */
export function averageHashFromRgba(rgba: ArrayLike<number>): string | null {
  if (rgba.length !== HASH_PIXEL_COUNT * 4) return null;
  const luminance: number[] = [];
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const alpha = rgba[offset + 3];
    if (red === undefined || green === undefined || blue === undefined || alpha === undefined) return null;
    // Hash the visible pixel on a fixed white background. Hidden RGB below a
    // transparent PNG pixel is decoder-specific and must not affect duplicate
    // identity. The Edge applies the same projection.
    const opacity = alpha / 255;
    const visibleRed = red * opacity + 255 * (1 - opacity);
    const visibleGreen = green * opacity + 255 * (1 - opacity);
    const visibleBlue = blue * opacity + 255 * (1 - opacity);
    luminance.push((visibleRed * 299 + visibleGreen * 587 + visibleBlue * 114) / 1000);
  }
  const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  let hash = '';
  for (let offset = 0; offset < HASH_PIXEL_COUNT; offset += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if (luminance[offset + bit]! >= average) nibble |= 1 << (3 - bit);
    }
    hash += nibble.toString(16);
  }
  return hash;
}

export async function browserPerceptualHash(image: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(image);
    let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext('2d');
    } else if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(1, 1);
      context = canvas.getContext('2d');
    }
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    // Copy each source pixel instead of blending it over the previous 1x1
    // sample. ImageScript reads independent RGBA pixels on the Edge, so the
    // browser preview must not use Canvas' default source-over compositing.
    context.globalCompositeOperation = 'copy';
    const pixels = new Uint8ClampedArray(HASH_PIXEL_COUNT * 4);
    for (let y = 0; y < HASH_SIDE; y += 1) {
      for (let x = 0; x < HASH_SIDE; x += 1) {
        // ImageScript 1.2.15 nearest-neighbour resize samples
        // floor(cell * sourceSize / 8). Read the same exact source pixel.
        const sourceX = Math.floor((x * bitmap.width) / HASH_SIDE);
        const sourceY = Math.floor((y * bitmap.height) / HASH_SIDE);
        context.drawImage(bitmap, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
        pixels.set(context.getImageData(0, 0, 1, 1).data, (y * HASH_SIDE + x) * 4);
      }
    }
    return averageHashFromRgba(pixels);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Normalize formats whose browser and Edge decoders do not share one pixel
 * orientation contract. ImageScript has no stable WebP decoder and does not
 * apply JPEG EXIF orientation, while browsers do. Canonical PNG bytes are used
 * for OCR, checksum, archive and both pHash stages. A failed decode is explicit
 * (`null`) so no unverifiable duplicate preview is offered. */
export async function normalizeEvidenceImage(image: File): Promise<File | null> {
  const dimensions = rasterDimensions(new Uint8Array(await image.arrayBuffer()), image.type);
  if (!dimensionsAllowed(dimensions)) return null;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
    const directDimensions = bitmap.width === dimensions!.width && bitmap.height === dimensions!.height;
    const exifRotatedJpeg = image.type === 'image/jpeg'
      && bitmap.width === dimensions!.height
      && bitmap.height === dimensions!.width;
    if (!directDimensions && !exifRotatedJpeg) return null;
    const edgeScale = Math.min(1, MAX_CANONICAL_EDGE / Math.max(bitmap.width, bitmap.height));
    const pixelScale = Math.min(1, Math.sqrt(MAX_CANONICAL_PIXELS / (bitmap.width * bitmap.height)));
    const scale = Math.min(edgeScale, pixelScale);
    const targetWidth = Math.max(1, Math.floor(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) return null;
    const name = image.name.replace(/\.(?:png|webp|jpe?g)$/i, '') || 'etykieta';
    return new File([png], `${name}.png`, { type: 'image/png', lastModified: image.lastModified });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
