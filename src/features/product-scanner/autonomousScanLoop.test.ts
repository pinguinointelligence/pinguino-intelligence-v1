import { describe, expect, it } from 'vitest';
import type { ProductScanResult } from './contracts';
import {
  nextAutonomousScanAction,
  productFieldsFromScanResult,
  retryablePackageFields,
} from './autonomousScanLoop';

const result = (overrides: Partial<ProductScanResult> = {}): ProductScanResult => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: 'HARIBO Quaxi',
    originalName: 'Quaxi',
    brand: 'HARIBO',
    explicitlyUnbranded: false,
    category: 'Fruchtgummi',
    variant: 'Quaxi',
    countryOfOrigin: 'Deutschland',
    labelLanguages: ['de'],
  },
  package: { netQuantity: 175, unit: 'g', netQuantityText: '175 g' },
  barcodes: [{ value: '4001686322536', format: 'EAN_13' }],
  nutrition: {
    basis: 'per_100g',
    energyKj: 1435,
    energyKcal: 338,
    fat: 0.5,
    saturatedFat: 0.1,
    carbohydrate: 77,
    sugars: 53,
    protein: 6.9,
    salt: 0.07,
    fibre: null,
  },
  productionDeclarations: {
    alcoholAbv: null,
    cocoaButterPercent: null,
    cocoaSolidsPercent: null,
    fruitContentPercent: null,
    brix: null,
    concentrationText: null,
    dosageText: null,
    technicalParametersText: null,
    formDeclaration: 'gummy candy',
  },
  ingredientsText: 'Glukosesirup; Zucker; Dextrose; Gelatine; Säuerungsmittel: Citronensäure.',
  allergensText: 'Kann Spuren von Milch und Weizen enthalten.',
  mayContainAllergens: ['Milch', 'Weizen'],
  claims: [],
  storageInstructions: null,
  manufacturer: 'HARIBO GmbH & Co. KG',
  externalSources: [],
  evidence: [],
  missingFields: [],
  conflicts: [],
  warnings: [],
  ...overrides,
});

describe('goal-driven Scanner loop', () => {
  it('stops immediately on an exact canonical EAN without paid analysis', () => {
    expect(
      nextAutonomousScanAction({
        exactProductFound: true,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: false,
        visionCalls: 0,
        missingCriticalFields: [],
        profilePreviewed: false,
        profileReady: false,
      }),
    ).toEqual({ kind: 'existing_product' });
  });

  it('runs the first Vision pass after EAN evidence without mislabelling it as an accurate retry', () => {
    expect(
      nextAutonomousScanAction({
        exactProductFound: false,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: true,
        visionCalls: 0,
        missingCriticalFields: ['product_identity'],
        profilePreviewed: false,
        profileReady: false,
      }),
    ).toEqual({ kind: 'analyze_image', accurateRetry: false });
  });

  it('researches a checksum-valid Vision EAN before shared profile completion', () => {
    expect(
      nextAutonomousScanAction({
        exactProductFound: false,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: false,
        visionCalls: 1,
        missingCriticalFields: [],
        profilePreviewed: false,
        profileReady: false,
      }),
    ).toEqual({ kind: 'ean_research' });
  });

  it('uses the one accurate pass only for still-readable package facts', () => {
    expect(
      nextAutonomousScanAction({
        exactProductFound: false,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: true,
        visionCalls: 1,
        missingCriticalFields: ['nutrition_salt', 'ingredientsText'],
        profilePreviewed: false,
        profileReady: false,
      }),
    ).toEqual({
      kind: 'analyze_image',
      accurateRetry: true,
      requestedFields: ['nutrition_salt', 'ingredientsText'],
    });
    expect(retryablePackageFields(['water_percent', 'DOSAGE_AUTHORITY_REQUIRED'])).toEqual([]);
  });

  it('does not spend a retry or ask the customer for metadata-only package gaps', () => {
    expect(retryablePackageFields(['net_quantity', 'MISSING_MANUFACTURER'])).toEqual([]);
    expect(
      nextAutonomousScanAction({
        exactProductFound: false,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: true,
        visionCalls: 1,
        missingCriticalFields: ['net_quantity'],
        profilePreviewed: false,
        profileReady: false,
      }),
    ).toEqual({ kind: 'complete_profile' });
  });

  it('hands complete evidence to the shared product-owned profile authority', () => {
    expect(
      nextAutonomousScanAction({
        exactProductFound: false,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: true,
        visionCalls: 1,
        missingCriticalFields: [],
        profilePreviewed: false,
        profileReady: false,
      }),
    ).toEqual({ kind: 'complete_profile' });
  });

  it('passes only exact identity instead of relabelling autonomous facts as customer-confirmed', () => {
    const fields = productFieldsFromScanResult(result(), '4001686322536');
    expect(fields).toEqual({ barcode: '4001686322536' });
    expect(JSON.stringify(fields)).not.toMatch(/water_percent|total_solids|pod|pac|mapper/i);
  });

  it('finishes at a truthful review only after the canonical readiness authority says READY', () => {
    expect(
      nextAutonomousScanAction({
        exactProductFound: false,
        hasImage: true,
        barcode: '4001686322536',
        eanLookupDone: true,
        visionCalls: 1,
        missingCriticalFields: [],
        profilePreviewed: true,
        profileReady: true,
      }),
    ).toEqual({ kind: 'ready_for_customer' });
  });
});
