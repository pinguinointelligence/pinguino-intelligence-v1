import { describe, expect, it } from 'vitest';
import type { ProductScanResult } from './contracts';
import {
  applyExactProduct,
  applyLocalBarcode,
  applyProductScanResult,
  confirmNotOnLabel,
  createLiveFieldState,
  liveScanCompletion,
  missingFieldsForAnalysis,
  nextLiveHint,
} from './liveFieldState';

function result(overrides: Partial<ProductScanResult> = {}): ProductScanResult {
  return {
    schemaVersion: 'gellatti_product_scan_v1',
    identity: {
      displayName: null,
      originalName: null,
      brand: null,
      explicitlyUnbranded: false,
      category: null,
      variant: null,
      countryOfOrigin: null,
      labelLanguages: [],
    },
    package: { netQuantity: null, unit: null, netQuantityText: null },
    barcodes: [],
    nutrition: {
      basis: null,
      energyKj: null,
      energyKcal: null,
      fat: null,
      saturatedFat: null,
      carbohydrate: null,
      sugars: null,
      protein: null,
      salt: null,
      fibre: null,
    },
    ingredientsText: null,
    allergensText: null,
    mayContainAllergens: [],
    claims: [],
    storageInstructions: null,
    manufacturer: null,
    externalSources: [],
    evidence: [],
    missingFields: [],
    conflicts: [],
    warnings: [],
    ...overrides,
  };
}

describe('canonical seven-field live Scanner state', () => {
  it('progresses through a shutter-free front → barcode → nutrition → ingredients sequence', () => {
    let fields = createLiveFieldState();
    fields = applyProductScanResult(
      fields,
      result({
        identity: {
          ...result().identity,
          displayName: 'Coca-Cola Zero',
          brand: 'Coca-Cola',
        },
        package: { netQuantity: 330, unit: 'ml', netQuantityText: '330 ml' },
      }),
      ['nutrition_basis', 'nutrition_energyKcal', 'ingredientsText', 'allergen_confirmation'],
    );
    expect(fields.product_name.status).toBe('FOUND');
    expect(fields.brand.status).toBe('FOUND');
    expect(fields.net_quantity.value).toBe('330 ml');

    fields = applyLocalBarcode(fields, '5449000131805');
    expect(fields.barcode.status).toBe('FOUND');

    fields = applyProductScanResult(
      fields,
      result({
        nutrition: {
          ...result().nutrition,
          basis: 'per_100ml',
          energyKcal: 0.2,
          fat: 0,
          carbohydrate: 0,
          protein: 0,
          salt: 0.02,
        },
        ingredientsText: 'Woda gazowana, barwnik, substancje słodzące.',
      }),
      ['allergen_confirmation'],
    );
    expect(fields.nutrition.status).toBe('FOUND');
    expect(fields.ingredients.status).toBe('FOUND');
    expect(missingFieldsForAnalysis(fields)).not.toEqual(
      expect.arrayContaining(['nutrition', 'ingredientsText', 'barcode']),
    );

    fields = confirmNotOnLabel(fields, 'allergens');
    expect(fields.allergens.status).toBe('USER_CONFIRMED_NOT_ON_LABEL');
    expect(liveScanCompletion(fields)).toBe('COMPLETE_WITH_NOT_ON_LABEL_FIELDS');
  });

  it('a known exact product completes every field with zero further evidence request', () => {
    const fields = applyExactProduct(createLiveFieldState(), {
      displayName: 'Known product',
      brand: 'Known brand',
      barcode: '5449000131805',
    });
    expect(liveScanCompletion(fields)).toBe('COMPLETE');
    expect(missingFieldsForAnalysis(fields)).toEqual([]);
  });

  it('asks for one currently useful surface, never a laundry list', () => {
    const fields = applyLocalBarcode(createLiveFieldState(), '5449000131805');
    expect(nextLiveHint(fields)).toBe('Pokaż przód opakowania');
  });

  it('not-on-package remains an evidence state and never becomes a zero/none fact', () => {
    const fields = confirmNotOnLabel(createLiveFieldState(), 'allergens');
    expect(fields.allergens).toMatchObject({
      status: 'USER_CONFIRMED_NOT_ON_LABEL',
      value: null,
    });
  });

  it('preserves every found fact when a later source or Vision attempt fails to add data', () => {
    const found = applyLocalBarcode(
      applyProductScanResult(
        createLiveFieldState(),
        result({
          identity: { ...result().identity, displayName: 'Cola', brand: 'Brand' },
          package: { netQuantity: 330, unit: 'ml', netQuantityText: '330 ml' },
        }),
        ['nutrition_basis', 'ingredientsText', 'allergen_confirmation'],
      ),
      '5449000131805',
    );

    const afterFailedAddition = applyProductScanResult(found, result(), [
      'nutrition_basis',
      'ingredientsText',
      'allergen_confirmation',
    ]);

    expect(afterFailedAddition.barcode).toEqual(found.barcode);
    expect(afterFailedAddition.product_name).toEqual(found.product_name);
    expect(afterFailedAddition.brand).toEqual(found.brand);
    expect(afterFailedAddition.net_quantity).toEqual(found.net_quantity);
  });

  it('simulates front → barcode → nutrition → ingredients with no shutter and stops solved work', () => {
    let fields = createLiveFieldState();
    let barcodeDecoderRuns = 0;
    const manualShutterEvents = 0;

    const decodeUntilFound = (decoded: string | null) => {
      if (fields.barcode.status === 'FOUND') return;
      barcodeDecoderRuns += 1;
      if (decoded) fields = applyLocalBarcode(fields, decoded);
    };

    decodeUntilFound(null);
    fields = applyProductScanResult(
      fields,
      result({
        identity: { ...result().identity, displayName: 'Coca-Cola Zero', brand: 'Coca-Cola' },
        package: { netQuantity: 330, unit: 'ml', netQuantityText: '330 ml' },
      }),
      ['barcode', 'nutrition_basis', 'ingredientsText', 'allergen_confirmation'],
    );
    decodeUntilFound('5449000131805');

    fields = applyProductScanResult(
      fields,
      result({
        nutrition: {
          ...result().nutrition,
          basis: 'per_100ml',
          energyKcal: 0.2,
          fat: 0,
          carbohydrate: 0,
          protein: 0,
          salt: 0.02,
        },
      }),
      ['ingredientsText', 'allergen_confirmation'],
    );
    expect(missingFieldsForAnalysis(fields)).not.toContain('nutrition');

    decodeUntilFound(null);
    fields = applyProductScanResult(
      fields,
      result({
        ingredientsText: 'Woda gazowana, barwnik, substancje słodzące.',
        allergensText: 'Nie zawiera deklarowanych alergenów.',
      }),
      [],
    );

    expect(barcodeDecoderRuns).toBe(2);
    expect(manualShutterEvents).toBe(0);
    expect(liveScanCompletion(fields)).toBe('COMPLETE');
    expect(nextLiveHint(fields)).toBe('Produkt gotowy ✓');
  });
});
