import { validateLabelImage } from './ocrEngine';
import { normalizeEvidenceImage } from './imagePerceptualHash';

const ACCEPTED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type EvidenceNormalizer = (image: File) => Promise<File | null>;

export type PreparedEvidenceImage = { ok: true; file: File } | { ok: false; reason: string };

/** Validate both the supplied upload and the actual normalized bytes that will
 * be OCRed, checksummed and uploaded. WebP-to-PNG expansion must never bypass
 * the same storage/memory size cap as an ordinary PNG. */
export async function prepareEvidenceImage(
  suppliedFile: File,
  normalize: EvidenceNormalizer = normalizeEvidenceImage,
): Promise<PreparedEvidenceImage> {
  const supplied = validateLabelImage({
    filename: suppliedFile.name,
    mime: suppliedFile.type || null,
    sizeBytes: suppliedFile.size,
  });
  if (!supplied.ok || !ACCEPTED_MIMES.has(suppliedFile.type)) {
    return {
      ok: false,
      reason: supplied.reason ?? `Nieobsługiwany format: ${suppliedFile.name}`,
    };
  }
  const file = await normalize(suppliedFile);
  if (!file) {
    return {
      ok: false,
      reason:
        suppliedFile.type === 'image/webp'
          ? `Nie udało się bezpiecznie odczytać WebP: ${suppliedFile.name}. Zapisz obraz jako PNG lub JPEG.`
          : `Nie udało się bezpiecznie odczytać obrazu: ${suppliedFile.name}.`,
    };
  }
  const normalized = validateLabelImage({
    filename: file.name,
    mime: file.type || null,
    sizeBytes: file.size,
  });
  if (!normalized.ok || !ACCEPTED_MIMES.has(file.type)) {
    return {
      ok: false,
      reason: normalized.reason ?? `Nieobsługiwany format: ${file.name}`,
    };
  }
  return { ok: true, file };
}
