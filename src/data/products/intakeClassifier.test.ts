import { describe, expect, it } from 'vitest';
import { classifyIntakeInput, looksLikeBarcode } from './intakeClassifier';

describe('looksLikeBarcode', () => {
  it('accepts 8–14 digit EAN/UPC (with spaces/dashes), rejects everything else', () => {
    expect(looksLikeBarcode('8480000610928')).toBe(true);
    expect(looksLikeBarcode('8480-0006-10928')).toBe(true);
    expect(looksLikeBarcode('12345678')).toBe(true);
    expect(looksLikeBarcode('1234567')).toBe(false); // too short
    expect(looksLikeBarcode('123456789012345')).toBe(false); // too long
    expect(looksLikeBarcode('Leche entera')).toBe(false);
    expect(looksLikeBarcode('')).toBe(false);
  });
});

describe('classifyIntakeInput', () => {
  it('routes spreadsheets to the working table import', () => {
    for (const f of ['catalog.csv', 'MERCADONA.XLSX', 'data.tsv', 'sheet.xls']) {
      const c = classifyIntakeInput({ filename: f });
      expect(c.kind, f).toBe('table');
      expect(c.route, f).toBe('/products/import');
      expect(c.available, f).toBe(true);
    }
  });

  it('routes images to the OCR-pending path (NOT available, no route)', () => {
    for (const f of ['label.jpg', 'photo.PNG', 'scan.heic', 'x.webp']) {
      const c = classifyIntakeInput({ filename: f });
      expect(c.kind, f).toBe('image_ocr_pending');
      expect(c.available, f).toBe(false);
      expect(c.route, f).toBeNull();
      expect(c.note, f).toMatch(/OCR NOT available/);
    }
  });

  it('routes a barcode-shaped text input to the keyless enrichment lookup WITH the EAN prefilled', () => {
    const c = classifyIntakeInput({ text: '8480000610928' });
    expect(c.kind).toBe('barcode');
    expect(c.route).toBe('/dev/enrichment-preview?ean=8480000610928');
    expect(c.available).toBe(true);
    // spaces/dashes are normalized into the routed EAN
    expect(classifyIntakeInput({ text: '8480-0006-10928' }).route).toBe('/dev/enrichment-preview?ean=8480000610928');
  });

  it('a filename wins over text; unknown ext + non-barcode text → unknown', () => {
    expect(classifyIntakeInput({ filename: 'notes.pdf' }).kind).toBe('unknown');
    expect(classifyIntakeInput({ text: 'Leche entera' }).kind).toBe('unknown');
    expect(classifyIntakeInput({}).kind).toBe('unknown');
    // a file always wins, even alongside a barcode text
    expect(classifyIntakeInput({ filename: 'a.csv', text: '8480000610928' }).kind).toBe('table');
  });
});

describe('intakeClassifier — purity (static scan)', () => {
  it('never does OCR / network / DB (it only routes)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const src = readFileSync(join(resolve(import.meta.dirname), 'intakeClassifier.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/tesseract|createWorker|fetch\(|supabase|@\/services\//i.test(src)).toBe(false);
    expect(/npac_value/i.test(src)).toBe(false);
  });
});
