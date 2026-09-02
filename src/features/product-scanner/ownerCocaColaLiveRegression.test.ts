import { describe, expect, it } from 'vitest';
import { mergeProductScanResults } from '../../../supabase/functions/_shared/productScanner';
import type { ProductScanResult } from './contracts';

const ownerFrameResult = (): ProductScanResult => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: 'Coca-Cola Zero',
    originalName: 'Coca-Cola Zero Sugar',
    brand: 'Coca-Cola',
    explicitlyUnbranded: false,
    category: 'soft drink',
    variant: 'Zero',
    countryOfOrigin: null,
    labelLanguages: ['pl'],
  },
  // Replays the owner defect: the structured value lost a trailing zero while
  // the directly visible label text still correctly says 330 ml.
  package: { netQuantity: 33, unit: 'ml', netQuantityText: '330 ml' },
  barcodes: [],
  nutrition: {
    basis: 'per_100ml',
    energyKj: 1.4,
    energyKcal: 0.3,
    fat: 0,
    saturatedFat: 0,
    carbohydrate: 0,
    sugars: 0,
    protein: 0,
    salt: 0.02,
    fibre: null,
  },
  ingredientsText: 'Woda gazowana, barwnik, kwas, substancje słodzące.',
  allergensText: null,
  mayContainAllergens: [],
  claims: [],
  storageInstructions: null,
  manufacturer: 'The Coca-Cola Company',
  externalSources: [],
  evidence: [
    {
      assetId: 'owner-front',
      field: 'package.netQuantity',
      source: 'label',
      confidence: 'high',
      region: 'package',
      directVisibility: true,
    },
  ],
  missingFields: ['allergen_confirmation'],
  conflicts: [],
  warnings: [],
});

describe('owner Coca-Cola Zero live Scanner regression', () => {
  it('preserves the visible 330 ml label quantity and never presents 33 ml', () => {
    const merged = mergeProductScanResults(null, ownerFrameResult(), '5449000131805');
    expect(merged.package).toMatchObject({
      netQuantity: 330,
      unit: 'ml',
      netQuantityText: '330 ml',
    });
    expect(merged.warnings).toContain('package_quantity_normalized_from_visible_label_text');
  });

  it('keeps the locally decoded EAN authoritative even when Vision returned none', () => {
    const merged = mergeProductScanResults(null, ownerFrameResult(), '5449000131805');
    expect(merged.barcodes).toEqual([{ value: '5449000131805', format: 'EAN_13' }]);
  });
});
