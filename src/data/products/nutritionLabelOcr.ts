/**
 * Nutrition-label image contract — the shared acceptance rules for label-photo intake.
 *
 * The REAL OCR pipeline lives in `src/features/ocr-intake/**` (a keyless LOCAL engine —
 * tesseract.js WASM; label images never leave the machine, never a paid vision API,
 * never fabricated text). This module stays PURE (no OCR engine import, no DB, no
 * service, no network, no npac) and owns only what both the classifier and the engine
 * agree on: which image files are acceptable label inputs.
 *
 * HEIC was dropped from the accepted set: the local engine cannot decode HEIC, and
 * accepting it would be dishonest — the intake UI tells the user to convert instead.
 */

export const ACCEPTED_LABEL_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

export interface LabelImageMeta {
  filename: string;
  size_bytes: number | null;
  mime: string | null;
}

/** Whether a chosen file is an acceptable label image (by mime, falling back to extension). */
export function isAcceptedLabelImage(mime: string | null, filename: string): boolean {
  if (mime && (ACCEPTED_LABEL_IMAGE_TYPES as readonly string[]).includes(mime.toLowerCase())) return true;
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  return ACCEPTED_EXTENSIONS.includes(ext);
}
