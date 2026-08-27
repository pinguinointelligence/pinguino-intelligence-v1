import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createCompleteLabel } from './masterLabelTestFixture';
import {
  composeMasterLabelPdf,
  masterLabelPdfFilename,
  masterLabelPdfGeometry,
} from './masterLabelPdf';

const label = createCompleteLabel('EU', {
  masterLabelId: 'label-pdf',
  sourceCompletionSessionId: 'run-pdf',
  lotCode: 'LOT-20260825-PDF-01',
  businessName: 'Gellatti Łódź',
  copies: 2,
  printer: {
    ...createCompleteLabel('EU').printer,
    widthMm: 104,
    heightMm: 152,
    copies: 2,
  },
});

describe('Master Label direct vector PDF', () => {
  it('uses deterministic immutable-snapshot naming and physical geometry', () => {
    expect(masterLabelPdfFilename(label)).toBe(
      'gellatti-label-lot-20260825-pdf-01-eu-104x152mm.pdf',
    );
    expect(masterLabelPdfFilename(label, true)).toContain('gellatti-draft-');
    expect(masterLabelPdfGeometry(label)).toMatchObject({ rasterDpi: 300, copies: 2 });
  });

  it('creates deterministic exact-size pages with embedded vector text and frozen metadata', async () => {
    const artifact = await composeMasterLabelPdf(label);
    const repeated = await composeMasterLabelPdf(label);
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(artifact).toMatchObject({
      pageCount: 2,
      widthMm: 104,
      heightMm: 152,
      rasterDpi: 300,
      textMode: 'embedded_vector',
    });
    expect(pdf.getPages()).toHaveLength(2);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo((104 * 72) / 25.4, 5);
      expect(page.getHeight()).toBeCloseTo((152 * 72) / 25.4, 5);
    }
    expect(pdf.getTitle()).toBe('LOT-20260825-PDF-01 - EU');
    expect(pdf.getCreationDate()?.toISOString()).toBe('2026-08-25T10:00:00.000Z');
    expect(new TextDecoder('latin1').decode(artifact.bytes)).toContain('/FontFile2');
    // Full static TrueType embedding intentionally avoids the pdf-lib/fontkit
    // subset mapping failure that can make a structurally valid PDF lose glyphs.
    expect(artifact.bytes.byteLength).toBeGreaterThan(100_000);
    expect(repeated.bytes).toEqual(artifact.bytes);
  });

  it('marks draft files and preserves exact physical page size', async () => {
    const artifact = await composeMasterLabelPdf(label, null, { draft: true });
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(artifact.filename).toMatch(/^gellatti-draft-/);
    expect(pdf.getTitle()).toContain('DRAFT');
    expect(pdf.getPageCount()).toBe(2);
  });

  it('renders a production storage instruction containing the Unicode minus sign', async () => {
    const unicodeStorage = createCompleteLabel('EU', {
      storageInstructions: { en: 'Keep frozen at −18 °C or below.' },
      size: { widthMm: 102, heightMm: 152 },
      printer: {
        ...createCompleteLabel('EU').printer,
        profileId: 'zebra_zd421_300',
        widthMm: 102,
        heightMm: 152,
        copies: 2,
        dpi: 300,
      },
    });

    const artifact = await composeMasterLabelPdf(unicodeStorage);

    expect(artifact).toMatchObject({ widthMm: 102, heightMm: 152, pageCount: 2 });
  });

  it('renders the served six-ingredient production label at 102 x 152 mm', async () => {
    const base = createCompleteLabel('WORLD');
    const ingredient = base.ingredients[0]!;
    const served = createCompleteLabel('WORLD', {
      productName: { en: 'd' },
      legalProductName: { en: '' },
      businessName: 'Gellatti QA Laboratory (staging)',
      storageInstructions: { en: 'Keep frozen at -18 C or below.' },
      size: { widthMm: 102, heightMm: 152 },
      ingredients: [
        ['MILK 3.5% · Milk · Chilled', 623, 61.3],
        ['CREAM 30% · Mlekovita Cream · Chilled', 179, 17.6],
        ['SUCROSE SUGAR · Sweetener · Dry', 97, 9.5],
        ['DEXTROSE · Sweetener · Dry', 65, 6.4],
        ['SKIMMED MILK · Milk', 49, 4.8],
        ['TARA GUM · Stabilizer', 4, 0.4],
      ].map(([name, actualGrams, percent], index) => ({
        ...ingredient,
        lineId: `served-${index}`,
        canonicalIngredientId: `PI-SERVED-${index}`,
        names: { en: String(name) },
        actualGrams: Number(actualGrams),
        percent: Number(percent),
        sourceIngredientsText: String(name),
      })),
      printer: {
        ...base.printer,
        widthMm: 102,
        heightMm: 152,
        copies: 2,
        dpi: 300,
      },
    });

    const artifact = await composeMasterLabelPdf(served);

    expect(artifact).toMatchObject({ widthMm: 102, heightMm: 152, pageCount: 2 });
  });

  it('creates the vector FDA dual-column and bilingual Canadian draft geometries', async () => {
    const usBase = createCompleteLabel('US');
    const us = createCompleteLabel('US', {
      packageQuantity: {
        value: 250,
        unit: 'g',
        netWeightG: 250,
        netVolumeMl: null,
        source: 'selected_fill',
        confirmedAt: '2026-08-25T10:05:00.000Z',
      },
      netQuantityG: 250,
      regulatoryNutrition: {
        ...usBase.regulatoryNutrition,
        servingsPerContainer: 2.5,
        usFormatFamily: 'auto',
      },
      size: { widthMm: 104, heightMm: 220 },
      printer: { ...usBase.printer, widthMm: 104, heightMm: 220 },
    });
    const usArtifact = await composeMasterLabelPdf(us);
    expect(usArtifact).toMatchObject({ widthMm: 104, heightMm: 220, textMode: 'embedded_vector' });

    const canadaArtifact = await composeMasterLabelPdf(createCompleteLabel('CA'), null, {
      draft: true,
    });
    expect(canadaArtifact).toMatchObject({
      widthMm: 104,
      heightMm: 220,
      textMode: 'embedded_vector',
    });
  });

  it.each([
    ['tabular', 200, 104, 152],
    ['linear', 70, 104, 152],
  ] as const)(
    'creates an exact-size vector FDA %s small-package PDF',
    async (usFormatFamily, availableDisplaySurfaceCm2, widthMm, heightMm) => {
      const usBase = createCompleteLabel('US');
      const compact = createCompleteLabel('US', {
        availableDisplaySurfaceCm2,
        size: { widthMm, heightMm },
        printer: { ...usBase.printer, widthMm, heightMm },
        regulatoryNutrition: {
          ...usBase.regulatoryNutrition,
          usFormatFamily,
        },
      });

      const artifact = await composeMasterLabelPdf(compact);
      const pdf = await PDFDocument.load(artifact.bytes);
      expect(artifact).toMatchObject({ widthMm, heightMm, textMode: 'embedded_vector' });
      expect(pdf.getPages()[0]?.getWidth()).toBeCloseTo((widthMm * 72) / 25.4, 5);
      expect(pdf.getPages()[0]?.getHeight()).toBeCloseTo((heightMm * 72) / 25.4, 5);
    },
  );
});
