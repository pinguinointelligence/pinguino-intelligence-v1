/**
 * Nutrition-label OCR — INTERFACE ONLY. This module defines the accepted image types, the
 * planned extraction schema, and the adapter seam a future keyless/LOCAL OCR engine (e.g.
 * browser Tesseract.js) will implement. It deliberately performs NO extraction today:
 * `parseNutritionLabelImage` always returns `not_implemented` with a null extraction — never
 * fabricated text, never a paid vision API.
 *
 * PURE: no DB, no service, no network, no OCR engine import, no npac. Deterministic.
 */

export const ACCEPTED_LABEL_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

export interface LabelImageMeta {
  filename: string;
  size_bytes: number | null;
  mime: string | null;
}

/** The PLANNED output schema of a future label extraction (all fields honest-nullable). */
export interface NutritionLabelExtraction {
  product_name: string | null;
  brand: string | null;
  ean: string | null;
  nutrition: {
    fat_percent: number | null;
    saturated_fat_percent: number | null;
    carbohydrate_percent: number | null;
    total_sugars_percent: number | null;
    protein_percent: number | null;
    salt_percent: number | null;
    kcal_per_100g: number | null;
  };
  ingredients_text: string | null;
  allergens: string | null;
  image: LabelImageMeta;
}

export interface LabelOcrResult {
  /** the ONLY status this module can produce today. */
  status: 'not_implemented';
  extraction: null;
  note: string;
  image: LabelImageMeta;
}

/** Whether a chosen file is an acceptable label image (by mime, falling back to extension). */
export function isAcceptedLabelImage(mime: string | null, filename: string): boolean {
  if (mime && (ACCEPTED_LABEL_IMAGE_TYPES as readonly string[]).includes(mime.toLowerCase())) return true;
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  return ACCEPTED_EXTENSIONS.includes(ext);
}

/**
 * The OCR adapter seam. TODAY: always `not_implemented` (extraction null). A future
 * implementation must be keyless/local, must keep unknown fields null (never invented), and its
 * output must still pass the red-flag `incomplete_text` guard before any product is created.
 */
export function parseNutritionLabelImage(image: LabelImageMeta): LabelOcrResult {
  return {
    status: 'not_implemented',
    extraction: null,
    note: 'OCR is not connected. Planned: keyless/LOCAL OCR only (an in-browser engine) — never a paid vision API, never fabricated text.',
    image,
  };
}
