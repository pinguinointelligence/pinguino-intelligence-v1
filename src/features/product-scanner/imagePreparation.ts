import { prepareEvidenceImage } from '@/features/ocr-intake/prepareEvidenceImage';

export const PRODUCT_SCAN_ACCEPT =
  'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif';

const HEIC_MIMES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export interface ProductScanPreparedFile {
  file: File;
  originalMime: string;
  transformations: string[];
}

export interface ProductScanImageDependencies {
  detectHeic: (file: File) => Promise<boolean>;
  convertHeic: (file: File) => Promise<Blob>;
  normalize: typeof prepareEvidenceImage;
}

const defaultDependencies: ProductScanImageDependencies = {
  detectHeic: async (file) => {
    const { isHeic } = await import('heic-to/csp');
    return isHeic(file);
  },
  convertHeic: async (file) => {
    const { heicTo } = await import('heic-to/csp');
    const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
    return converted instanceof Blob ? converted : new Blob([converted], { type: 'image/jpeg' });
  },
  normalize: prepareEvidenceImage,
};

export async function prepareProductScanImage(
  supplied: File,
  dependencies: ProductScanImageDependencies = defaultDependencies,
): Promise<{ ok: true; value: ProductScanPreparedFile } | { ok: false; reason: string }> {
  const originalMime = supplied.type || 'application/octet-stream';
  let source = supplied;
  const transformations: string[] = [];
  const heicByName = /\.(?:heic|heif)$/i.test(supplied.name);
  let detectedHeic = HEIC_MIMES.has(supplied.type) || heicByName;
  if (!detectedHeic) {
    try {
      detectedHeic = await dependencies.detectHeic(supplied);
    } catch {
      detectedHeic = false;
    }
  }
  if (detectedHeic) {
    try {
      const jpeg = await dependencies.convertHeic(supplied);
      source = new File([jpeg], supplied.name.replace(/\.(?:heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
        lastModified: supplied.lastModified,
      });
      transformations.push('heic_to_jpeg');
    } catch {
      return { ok: false, reason: `Nie udało się odczytać HEIC/HEIF: ${supplied.name}.` };
    }
  }
  const prepared = await dependencies.normalize(source);
  if (!prepared.ok) return prepared;
  if (prepared.file.type !== source.type) transformations.push('normalized_to_png');
  transformations.push('exif_orientation_applied', 'metadata_stripped', 'downscaled_if_needed');
  return {
    ok: true,
    value: { file: prepared.file, originalMime, transformations: [...new Set(transformations)] },
  };
}
