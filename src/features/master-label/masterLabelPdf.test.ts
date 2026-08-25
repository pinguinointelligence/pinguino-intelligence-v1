import { Buffer } from 'node:buffer';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { MasterLabelData } from './masterLabel';
import {
  composeMasterLabelPdf,
  masterLabelPdfFilename,
  masterLabelPdfGeometry,
} from './masterLabelPdf';

const whitePixel = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8J0AAAAASUVORK5CYII=',
    'base64',
  ),
);

const label = {
  masterLabelId: 'label-pdf',
  sourceCompletionSessionId: 'run-pdf',
  sourceCompletedAt: '2026-08-25T10:00:00.000Z',
  market: 'EU',
  lotCode: 'LOT-20260825-PDF-01',
  businessName: 'Gellatti Łódź',
  operator: { operatorName: 'Gellatti', address: 'Łódź' },
  copies: 2,
  size: { widthMm: 80, heightMm: 50 },
  printer: { profileId: 'generic_thermal_80', dpi: 203, copies: 2 },
} as MasterLabelData;

describe('Master Label direct PDF', () => {
  it('uses deterministic immutable-snapshot naming and physical geometry', () => {
    expect(masterLabelPdfFilename(label)).toBe(
      'gellatti-label-lot-20260825-pdf-01-eu-80x50mm.pdf',
    );
    expect(masterLabelPdfFilename(label, true)).toContain('gellatti-draft-');
    expect(masterLabelPdfGeometry(label)).toMatchObject({ rasterDpi: 203, copies: 2 });
  });

  it('creates one exact-size PDF page per requested copy with frozen metadata', async () => {
    const artifact = await composeMasterLabelPdf(label, whitePixel);
    const repeated = await composeMasterLabelPdf(label, whitePixel);
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(artifact).toMatchObject({
      pageCount: 2,
      widthMm: 80,
      heightMm: 50,
      rasterDpi: 203,
    });
    expect(pdf.getPages()).toHaveLength(2);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo((80 * 72) / 25.4, 5);
      expect(page.getHeight()).toBeCloseTo((50 * 72) / 25.4, 5);
    }
    expect(pdf.getTitle()).toBe('LOT-20260825-PDF-01 - EU');
    expect(pdf.getCreationDate()?.toISOString()).toBe('2026-08-25T10:00:00.000Z');
    expect(repeated.bytes).toEqual(artifact.bytes);
  });

  it('marks draft files and preserves exact physical page size', async () => {
    const artifact = await composeMasterLabelPdf(label, whitePixel, { draft: true });
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(artifact.filename).toMatch(/^gellatti-draft-/);
    expect(pdf.getTitle()).toContain('DRAFT');
    expect(pdf.getPageCount()).toBe(2);
  });
});
