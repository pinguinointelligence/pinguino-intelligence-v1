/**
 * Pure intake-input classifier. Given a filename and/or a raw text input, it decides WHICH intake
 * path an item belongs to — WITHOUT doing any OCR, network call, or parsing. It only routes:
 *   • a spreadsheet (csv/tsv/xlsx/xls) → the working table-import path;
 *   • an image (png/jpg/…) → the label-OCR intake page (keyless LOCAL engine; the page itself
 *     validates the exact format and rejects e.g. HEIC honestly);
 *   • an EAN/UPC-shaped digit string → the keyless barcode/enrichment lookup;
 *   • anything else → unknown (no route).
 *
 * PURE: no DB, no service, no IO, no OCR here (it only routes), no network, no secrets.
 * Deterministic. No npac.
 */

export type IntakeKind = 'table' | 'image_label_ocr' | 'barcode' | 'unknown';

export interface IntakeClassification {
  kind: IntakeKind;
  /** in-app route for the path, or null when there is nothing to open (unknown input). */
  route: string | null;
  /** whether this path is actually usable today. */
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
 * barcode-shaped text input; otherwise unknown.
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
      return { kind: 'image_label_ocr', route: '/dev/ocr-intake', available: true, label: 'image (label photo)', note: 'Keyless LOCAL OCR (in-browser engine — the image never leaves this machine). PNG/JPEG/WebP; the page rejects other formats honestly.' };
    }
    return { kind: 'unknown', route: null, available: false, label: 'unrecognised file', note: `No intake path for ".${ext || '?'}".` };
  }

  if (text !== '' && looksLikeBarcode(text)) {
    const digits = text.replace(/[\s-]+/g, '');
    return {
      kind: 'barcode',
      // carries the EAN so the enrichment page can PREFILL it — the lookup itself stays
      // user-triggered (no automatic network call).
      route: `/dev/enrichment-preview?ean=${digits}`,
      available: true,
      label: 'barcode / EAN',
      note: 'Keyless read-only OpenFoodFacts lookup by EAN (prefilled — press Look up).',
    };
  }

  return { kind: 'unknown', route: null, available: false, label: 'unknown', note: 'Enter an EAN, or choose a CSV/XLSX or a label image.' };
}
