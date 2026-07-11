/**
 * BarcodeEntry — GS1 checksum honesty + accessible manual-EAN field.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ocrCopy } from '../ocrCopy';
import { BarcodeEntry } from './BarcodeEntry';
import { eanChecksumState, normalizeEan } from './intakeUiSupport';

const noop = () => undefined;
const render = (value: string) => renderToStaticMarkup(<BarcodeEntry value={value} onChange={noop} />);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('normalizeEan', () => {
  it('keeps digits only (spaces, dashes, letters vanish) and preserves leading zeros', () => {
    expect(normalizeEan('8 480000 610928')).toBe('8480000610928');
    expect(normalizeEan('ean: 0361-4141')).toBe('03614141');
    expect(normalizeEan('')).toBe('');
  });
});

describe('eanChecksumState — GS1 mod-10 over 8/12/13/14 digits', () => {
  it('validates a real EAN-13', () => {
    expect(eanChecksumState('8480000610928')).toBe('valid');
  });

  it('validates a real EAN-8, UPC-A (12) and GTIN-14', () => {
    expect(eanChecksumState('96385074')).toBe('valid');
    expect(eanChecksumState('036000291452')).toBe('valid');
    expect(eanChecksumState('10614141000415')).toBe('valid');
  });

  it('flags a single-digit corruption as invalid', () => {
    expect(eanChecksumState('8480000610929')).toBe('invalid');
    expect(eanChecksumState('96385075')).toBe('invalid');
  });

  it('reports empty and non-GTIN lengths honestly (no premature verdict)', () => {
    expect(eanChecksumState('')).toBe('empty');
    expect(eanChecksumState('12345')).toBe('incomplete');
    expect(eanChecksumState('123456789')).toBe('incomplete');
  });
});

describe('BarcodeEntry — rendering', () => {
  it('renders a labelled numeric input', () => {
    const html = render('');
    expect(html).toContain(`aria-label="${ocrCopy.barcode.label}"`);
    expect(html).toContain('inputMode="numeric"');
    expect(text(html)).toContain(ocrCopy.barcode.help);
  });

  it('shows the normalized digit string for messy input', () => {
    const t = text(render('8 480000 610928'));
    expect(t).toContain(`${ocrCopy.barcode.normalized}: 8480000610928`);
  });

  it('marks a checksum-valid EAN with a check, without any warning', () => {
    const html = render('8480000610928');
    expect(text(html)).toContain('✓');
    expect(text(html)).not.toContain(ocrCopy.barcode.checksumInvalid);
    expect(html).not.toContain('aria-describedby');
  });

  it('renders the checksum-invalid warning as a status region tied to the input', () => {
    const html = render('8480000610929');
    expect(text(html)).toContain(ocrCopy.barcode.checksumInvalid);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-describedby="ocr-ean-warning"');
    expect(html).toContain('id="ocr-ean-warning"');
  });

  it('explains the expected lengths while the code is incomplete', () => {
    expect(text(render('12345'))).toContain(ocrCopy.barcode.incomplete);
  });

  it('stays quiet on empty input (no warning, no normalized line)', () => {
    const t = text(render(''));
    expect(t).not.toContain(ocrCopy.barcode.checksumInvalid);
    expect(t).not.toContain(`${ocrCopy.barcode.normalized}:`);
  });
});
