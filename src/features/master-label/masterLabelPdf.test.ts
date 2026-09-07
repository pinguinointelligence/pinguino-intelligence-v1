import { PDFDocument, PDFPage } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { createCompleteLabel } from './masterLabelTestFixture';
import {
  composeMasterLabelPdf,
  masterLabelPdfFilename,
  masterLabelPdfGeometry,
} from './masterLabelPdf';
import { WORLD_INFORMATIONAL_WARNING_LINES } from './worldUniversal';

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
  it.each(['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD'] as const)(
    'prints an incomplete %s PDF with known allergens and without missing rows',
    async (market) => {
      const base = createCompleteLabel(market);
      const incomplete = createCompleteLabel(market, {
        allergens: {
          status: 'incomplete',
          declared: ['milk'],
          mayContain: [],
          labelStatements: ['Contains milk'],
          reviewedByUser: false,
        },
        nutritionSource: { ...base.nutritionSource!, saturated_fat_g: null },
        saturatedFatAuthority: {
          status: 'missing',
          sourceReferences: [],
          missingIngredientNames: ['Unknown ingredient'],
        },
        preflightAcknowledged: false,
      });
      const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
      try {
        await expect(composeMasterLabelPdf(incomplete)).resolves.toMatchObject({ pageCount: 1 });
        const text = drawText.mock.calls.map(([value]) => value).join(' ');
        expect(text).toContain('Contains milk');
        expect(text).not.toContain('UNKNOWN');
        expect(text).not.toContain('Alergeny nieustalone');
        expect(text).not.toMatch(
          /Of which saturates|Saturated Fat|- saturated|Saturated \/ saturés/,
        );
      } finally {
        drawText.mockRestore();
      }
    },
  );

  it.each(['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD'] as const)(
    'omits entirely unknown %s fields from the vector PDF',
    async (market) => {
      const base = createCompleteLabel(market);
      const blankText = Object.fromEntries(base.labelLanguages.map((language) => [language, '']));
      const incomplete = createCompleteLabel(market, {
        productName: blankText,
        legalProductName: blankText,
        ingredients: base.ingredients.map((ingredient) => ({
          ...ingredient,
          names: blankText,
          sourceAllergensText: 'UNKNOWN',
        })),
        allergens: {
          status: 'incomplete',
          declared: [],
          mayContain: [],
          labelStatements: [],
          reviewedByUser: false,
        },
        nutritionSource: {
          ...base.nutritionSource!,
          saturated_fat_g: null,
          sugars_g: null,
        },
        regulatoryNutrition: {
          ...base.regulatoryNutrition,
          energyKjPer100g: null,
          servingDescription: {},
          servingQuantityG: null,
          servingVolumeMl: null,
          servingsPerContainer: null,
          transFatGPer100g: null,
          cholesterolMgPer100g: null,
          sodiumMgPer100g: null,
          addedSugarsGPer100g: null,
          vitaminDMcgPer100g: null,
          calciumMgPer100g: null,
          ironMgPer100g: null,
          potassiumMgPer100g: null,
        },
        packageQuantity: null,
        netQuantityG: null,
        lotCode: '',
        productionDate: '',
        dateMark: { kind: 'unresolved', date: null, basis: 'none', reviewedByUser: false },
        storageInstructions: blankText,
        origin: blankText,
        businessName: '',
        operator: {
          ...base.operator,
          operatorName: '',
          facilityName: '',
          address: '',
          countryCode: '',
          importerName: '',
          importerAddress: '',
          importerCountryCode: '',
          distributorName: '',
          distributorAddress: '',
          distributorCountryCode: '',
        },
      });
      const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
      try {
        await composeMasterLabelPdf(incomplete);
        const text = drawText.mock.calls.map(([value]) => value).join(' ');
        expect(text).not.toMatch(
          /UNKNOWN|Alergeny nieustalone|Alergeny:|—|Of which saturates|Saturated Fat|- saturated|Saturated \/ saturés/,
        );
        expect(text).not.toMatch(/LOT:|Production:|Net quantity|NET CONTENTS/);
      } finally {
        drawText.mockRestore();
      }
    },
  );

  it('uses deterministic immutable-snapshot naming and physical geometry', () => {
    expect(masterLabelPdfFilename(label)).toBe(
      'gellatti-label-lot-20260825-pdf-01-eu-104x152mm.pdf',
    );
    expect(masterLabelPdfFilename(label, true)).toContain('gellatti-draft-');
    expect(masterLabelPdfGeometry(label)).toMatchObject({ rasterDpi: 300, copies: 1 });
  });

  it('creates deterministic exact-size pages with embedded vector text and frozen metadata', async () => {
    const artifact = await composeMasterLabelPdf(label);
    const repeated = await composeMasterLabelPdf(label);
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(artifact).toMatchObject({
      pageCount: 1,
      widthMm: 104,
      heightMm: 152,
      rasterDpi: 300,
      textMode: 'embedded_vector',
    });
    expect(pdf.getPages()).toHaveLength(1);
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
    expect(pdf.getPageCount()).toBe(1);
  });

  it('creates one exact 70 mm square PDF page for a Basic round label', async () => {
    const round = createCompleteLabel('WORLD', {
      format: 'round',
      size: { widthMm: 70, heightMm: 70 },
      printer: { ...createCompleteLabel('WORLD').printer, widthMm: 70, heightMm: 70, copies: 8 },
      copies: 8,
    });
    const artifact = await composeMasterLabelPdf(round, null, { calibration: true });
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo((70 * 72) / 25.4, 5);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo((70 * 72) / 25.4, 5);
  });

  it('draws both World informational warnings on every physical PDF page', async () => {
    const worldBase = createCompleteLabel('WORLD');
    const world = createCompleteLabel('WORLD', {
      copies: 2,
      printer: { ...worldBase.printer, copies: 2 },
    });
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      const artifact = await composeMasterLabelPdf(world);
      expect(artifact.pageCount).toBe(1);
      for (const warning of WORLD_INFORMATIONAL_WARNING_LINES) {
        expect(drawText.mock.calls.filter(([text]) => text === warning)).toHaveLength(1);
      }
    } finally {
      drawText.mockRestore();
    }
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
