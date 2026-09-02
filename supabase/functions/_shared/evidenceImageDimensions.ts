const MAX_RASTER_DIMENSION = 12_000;
const MAX_RASTER_PIXELS = 40_000_000;

type EvidenceImageMime = 'image/png' | 'image/jpeg' | 'image/webp';
type Dimensions = { width: number; height: number };

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

const uint24le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);

function pngDimensions(bytes: Uint8Array): Dimensions | null {
  if (
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) ||
    ascii(bytes, 12, 4) !== 'IHDR'
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(bytes: Uint8Array): Dimensions | null {
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
}

function webpDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size =
      (bytes[offset + 4] ?? 0) |
      ((bytes[offset + 5] ?? 0) << 8) |
      ((bytes[offset + 6] ?? 0) << 16) |
      ((bytes[offset + 7] ?? 0) << 24);
    const data = offset + 8;
    if (type === 'VP8X' && data + 10 <= bytes.length) {
      return { width: uint24le(bytes, data + 4) + 1, height: uint24le(bytes, data + 7) + 1 };
    }
    if (type === 'VP8L' && data + 5 <= bytes.length && bytes[data] === 0x2f) {
      return {
        width: 1 + ((((bytes[data + 2] ?? 0) & 0x3f) << 8) | (bytes[data + 1] ?? 0)),
        height:
          1 +
          ((((bytes[data + 4] ?? 0) & 0x0f) << 10) |
            ((bytes[data + 3] ?? 0) << 2) |
            (((bytes[data + 2] ?? 0) & 0xc0) >> 6)),
      };
    }
    if (
      type === 'VP8 ' &&
      data + 10 <= bytes.length &&
      bytes[data + 3] === 0x9d &&
      bytes[data + 4] === 0x01 &&
      bytes[data + 5] === 0x2a
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

export function evidenceImageDimensions(
  bytes: Uint8Array,
  mime: EvidenceImageMime,
): Dimensions | null {
  if (mime === 'image/png') return pngDimensions(bytes);
  if (mime === 'image/jpeg') return jpegDimensions(bytes);
  return webpDimensions(bytes);
}

export function evidenceImageDimensionsAllowed(
  bytes: Uint8Array,
  mime: EvidenceImageMime,
): boolean {
  const dimensions = evidenceImageDimensions(bytes, mime);
  return (
    dimensions !== null &&
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width <= MAX_RASTER_DIMENSION &&
    dimensions.height <= MAX_RASTER_DIMENSION &&
    dimensions.width * dimensions.height <= MAX_RASTER_PIXELS
  );
}
