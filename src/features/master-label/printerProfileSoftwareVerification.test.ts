import { Buffer } from 'node:buffer';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { MasterLabelData } from './masterLabel';
import { composeMasterLabelPdf } from './masterLabelPdf';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { PRINTER_PROFILES, normalizePrinterSettings } from './printerProfiles';
import { buildLabelPreflight } from './masterLabel';
import { createCompleteLabel } from './masterLabelTestFixture';

const whitePixel = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8J0AAAAASUVORK5CYII=',
    'base64',
  ),
);

const calibrationLabel = (profileId: keyof typeof PRINTER_PROFILES): MasterLabelData => {
  const profile = PRINTER_PROFILES[profileId];
  const preset = profile.sizePresets[0] ?? {
    widthMm: profile.minWidthMm,
    heightMm: 50,
  };
  const printer = normalizePrinterSettings({
    profileId,
    connection: profile.supportedConnections[0],
    dpi: profile.dpiOptions[0],
    orientation: 'portrait',
    marginMm: 2,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    copies: 1,
  });
  return {
    schemaVersion: 1,
    masterLabelId: `calibration:${profileId}`,
    sourceCompletionSessionId: 'software-verification',
    sourceCompletedAt: '2026-08-25T12:00:00.000Z',
    purpose: 'internal_production',
    packagingContext: 'prepacked',
    market: 'EU',
    marketProfileVersion: 'software-verification',
    uiLanguage: 'pl',
    labelLanguages: ['pl'],
    productName: { pl: 'Druk testowy' },
    legalProductName: { pl: 'Druk testowy' },
    businessName: 'Gellatti',
    logoPath: null,
    ingredients: [
      {
        lineId: 'test',
        canonicalIngredientId: 'TEST',
        names: { pl: 'Test' },
        actualGrams: 1,
        percent: 100,
        allergenEvidenceStatus: 'verified',
        allergenSourceRevision: 'test',
        sourceIngredientsText: 'Test',
        sourceAllergensText: 'none_declared',
      },
    ],
    allergens: {
      status: 'complete',
      declared: [],
      mayContain: [],
      labelStatements: [],
      reviewedByUser: true,
    },
    nutritionSource: null,
    nutritionDeclaration: null,
    regulatoryNutrition: {
      servingDescription: {},
      servingQuantityG: null,
      servingsPerContainer: null,
      transFatGPer100g: null,
      cholesterolMgPer100g: null,
      sodiumMgPer100g: null,
      addedSugarsGPer100g: null,
      vitaminDMcgPer100g: null,
      calciumMgPer100g: null,
      ironMgPer100g: null,
      potassiumMgPer100g: null,
      canadaReferenceAmountG: null,
      canadaFopProductClass: 'general_food',
      canadaFopExemption: 'unresolved',
      canadaFopExemptionReason: '',
      canadaFopAssetId: null,
    },
    netQuantityG: 1,
    servingQuantityG: null,
    productionDate: '2026-08-25',
    productionDateReviewed: true,
    dateMark: { kind: 'unresolved', date: null, basis: 'none', reviewedByUser: false },
    storageInstructions: { pl: 'Przechowywać zgodnie z instrukcją.' },
    useInstructions: { pl: '' },
    operator: {
      operatorName: 'Gellatti',
      facilityName: 'Gellatti',
      address: 'Test',
      countryCode: 'ES',
      contact: '',
      registrationIds: [],
    },
    lotCode: 'LOT-CALIBRATION',
    origin: { pl: '' },
    customerNote: { pl: '' },
    enabledOptionalFields: [],
    format: 'rectangle',
    size: { widthMm: printer.widthMm, heightMm: printer.heightMm },
    copies: 1,
    systemPrinter: 'system',
    printer,
    regulatoryReview: {
      translations: false,
      ingredientOrderAndQuid: false,
      marketSpecific: false,
    },
    preflightAcknowledged: false,
  };
};

describe('software printer profile verification', () => {
  it.each(Object.keys(PRINTER_PROFILES) as Array<keyof typeof PRINTER_PROFILES>)(
    'keeps %s calibration HTML and direct PDF on one physical geometry',
    async (profileId) => {
      const data = calibrationLabel(profileId);
      const profile = PRINTER_PROFILES[profileId];
      const html = buildMasterLabelPrintHtml(data, null, { calibration: true });
      expect(profile.dpiOptions).toContain(data.printer.dpi);
      expect(data.size.widthMm).toBeGreaterThanOrEqual(profile.minWidthMm);
      expect(data.size.widthMm).toBeLessThanOrEqual(profile.maxWidthMm);
      expect(html).toContain(`width:${data.size.widthMm}mm`);
      expect(html).toContain(`height:${data.size.heightMm}mm`);
      expect(html).toContain(`${data.printer.dpi} dpi`);
      expect(html).toContain(`Margines / margin: ${data.printer.marginMm} mm`);
      expect(html).toContain(data.printer.orientation);

      const artifact = await composeMasterLabelPdf(data, whitePixel, { calibration: true });
      const pdf = await PDFDocument.load(artifact.bytes);
      const page = pdf.getPage(0);
      expect(page.getWidth()).toBeCloseTo((data.size.widthMm * 72) / 25.4, 5);
      expect(page.getHeight()).toBeCloseTo((data.size.heightMm * 72) / 25.4, 5);
      expect(pdf.getPageCount()).toBe(1);
      expect(artifact.textMode).toBe('embedded_vector');
    },
  );

  it.each(Object.keys(PRINTER_PROFILES) as Array<keyof typeof PRINTER_PROFILES>)(
    'verifies every established media preset for %s without driver scaling',
    (profileId) => {
      const profile = PRINTER_PROFILES[profileId];
      expect(profile.sizePresets.length).toBeGreaterThan(0);
      for (const preset of profile.sizePresets) {
        const data = calibrationLabel(profileId);
        data.size = { widthMm: preset.widthMm, heightMm: preset.heightMm };
        data.printer = normalizePrinterSettings({
          ...data.printer,
          widthMm: preset.widthMm,
          heightMm: preset.heightMm,
          presetId: preset.id,
          formatMode: 'preset',
        });
        const html = buildMasterLabelPrintHtml(data, null, { calibration: true });
        expect(html).toContain(`width:${preset.widthMm}mm`);
        expect(html).toContain(`height:${preset.heightMm}mm`);
        expect(data.printer.widthMm).toBe(preset.widthMm);
        expect(data.printer.heightMm).toBe(preset.heightMm);
      }
    },
  );

  it.each(Object.keys(PRINTER_PROFILES) as Array<keyof typeof PRINTER_PROFILES>)(
    'either prints or explicitly rejects representative retail content on %s',
    (profileId) => {
      const profile = PRINTER_PROFILES[profileId];
      const preset = [...profile.sizePresets].sort(
        (a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm,
      )[0]!;
      const base = createCompleteLabel('WORLD');
      const data = createCompleteLabel('WORLD', {
        size: { widthMm: preset.widthMm, heightMm: preset.heightMm },
        printer: normalizePrinterSettings({
          profileId,
          connection: profile.supportedConnections[0],
          dpi: profile.dpiOptions[0],
          widthMm: preset.widthMm,
          heightMm: preset.heightMm,
          copies: 1,
          presetId: preset.id,
          formatMode: 'preset',
        }),
      });
      const preflight = buildLabelPreflight(data);
      if (preflight.geometry.fits) {
        const html = buildMasterLabelPrintHtml(data);
        expect(html).toContain(`width:${preset.widthMm}mm`);
        expect(html).toContain(`height:${preset.heightMm}mm`);
      } else {
        expect(preflight.items).toContainEqual(
          expect.objectContaining({ field: 'geometry', status: 'missing' }),
        );
        expect(() =>
          buildMasterLabelPrintHtml({ ...data, businessName: base.businessName }),
        ).toThrow('Master Label preflight is incomplete.');
      }
    },
  );
});
