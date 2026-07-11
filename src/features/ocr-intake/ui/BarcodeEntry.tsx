/**
 * BarcodeEntry — manual EAN/GTIN field (spec §4, §17.9).
 *
 * Presentational: the raw typed value is page-owned; this component shows the
 * normalized digit string and an HONEST checksum verdict (GS1 mod-10 over
 * 8/12/13/14 digits). An invalid checksum is a WARNING, never a block — the
 * label may genuinely carry a non-GTIN code and the reviewer decides.
 */
import { ocrCopy } from '../ocrCopy';
import { eanChecksumState, normalizeEan } from './intakeUiSupport';

export interface BarcodeEntryProps {
  /** Raw typed value (page-owned state). */
  value: string;
  onChange: (value: string) => void;
}

export function BarcodeEntry({ value, onChange }: BarcodeEntryProps) {
  const normalized = normalizeEan(value);
  const checksum = eanChecksumState(normalized);
  const warning =
    checksum === 'invalid'
      ? ocrCopy.barcode.checksumInvalid
      : checksum === 'incomplete'
        ? ocrCopy.barcode.incomplete
        : null;

  return (
    <section aria-label={ocrCopy.barcode.title} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <h3 className="font-medium">{ocrCopy.barcode.title}</h3>
      <p className="mt-1 text-xs text-stone-500">{ocrCopy.barcode.help}</p>
      <input
        aria-label={ocrCopy.barcode.label}
        aria-describedby={warning ? 'ocr-ean-warning' : undefined}
        inputMode="numeric"
        className="mt-2 w-full rounded border border-stone-200 px-3 py-1.5 font-mono text-sm"
        placeholder="8480000610928"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {normalized.length > 0 ? (
        <p className="mt-1 font-mono text-xs text-stone-500">
          {ocrCopy.barcode.normalized}: {normalized}
          {checksum === 'valid' ? ' · ✓' : ''}
        </p>
      ) : null}
      {warning ? (
        <p id="ocr-ean-warning" role="status" className="mt-1 text-xs text-amber-700">
          {warning}
        </p>
      ) : null}
    </section>
  );
}
