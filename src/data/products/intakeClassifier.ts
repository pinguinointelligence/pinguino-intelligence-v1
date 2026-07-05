/**
 * Pure intake-input classifier. Given a filename and/or a raw text input, it decides WHICH intake
 * path an item belongs to — WITHOUT doing any OCR, network call, or parsing. It only routes:
 *   • a spreadsheet (csv/tsv/xlsx/xls) → the working table-import path;
 *   • an image (png/jpg/…) → the OCR-pending path (NOT available — keyless/local OCR is future work);
 *   • an EAN/UPC-shaped digit string → the keyless barcode/enrichment lookup;
 *   • anything else → unknown (no route).
 *
 * PURE: no DB, no service, no IO, no OCR, no network, no secrets. Deterministic. No npac.
 */

export type IntakeKind = 'table' | 'image_ocr_pending' | 'barcode' | 'unknown';

export interface IntakeClassification {
  kind: IntakeKind;
  /** in-app route for the path, or null when there is nothing to open yet (OCR pending / unknown). */
  route: string | null;
  /** whether this path is actually usable today (false for the OCR-pending placeholder). */
  available: boolean;
  label: string;
  note: string;
}

const TABLE_EXT = ['csv', 'tsv', 'xlsx', 'xls'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff'];

const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).trim().toLowerCase() : '';
};

/** A plausible EAN/UPC: 8–14 digits after stripping spaces/dashes, nothing else. */
export function looksLikeBarcode(text: string): boolean {
  const digits = text.replace(/[\s-]+/g, '');
  return /^\d{8,14}$/.test(digits);
}

/**
 * Classify an intake input. Precedence: a filename extension wins (a file was chosen); otherwise a
 * barcode-shaped text input; otherwise unknown. Never claims OCR works.
 */
export function classifyIntakeInput(input: { filename?: string | null; text?: string | null }): IntakeClassification {
  const filename = (input.filename ?? '').trim();
  const text = (input.text ?? '').trim();

  if (filename !== '') {
    const ext = extensionOf(filename);
    if (TABLE_EXT.includes(ext)) {
      return { kind: 'table', route: '/products/import', available: true, label: 'spreadsheet / table', note: 'CSV/XLSX → the working table-import parser.' };
    }
    if (IMAGE_EXT.includes(ext)) {
      return { kind: 'image_ocr_pending', route: null, available: false, label: 'image (label photo)', note: 'OCR NOT available — planned keyless/local OCR only (no paid vision API, no fabricated text).' };
    }
    return { kind: 'unknown', route: null, available: false, label: 'unrecognised file', note: `No intake path for ".${ext || '?'}".` };
  }

  if (text !== '' && looksLikeBarcode(text)) {
    return { kind: 'barcode', route: '/dev/enrichment-preview', available: true, label: 'barcode / EAN', note: 'Keyless read-only OpenFoodFacts lookup by EAN.' };
  }

  return { kind: 'unknown', route: null, available: false, label: 'unknown', note: 'Enter an EAN, or choose a CSV/XLSX or a label image.' };
}
