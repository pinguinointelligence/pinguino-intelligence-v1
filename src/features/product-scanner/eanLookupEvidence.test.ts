/**
 * EAN-first evidence: what the barcode's own source contributes, and what it may never
 * override. The owner's flow asked for another photograph before it had asked the code.
 */
import { describe, expect, it } from 'vitest';
import {
  EAN_LOOKUP_FIELDS,
  mergeProductScanResults,
  scanResultFromLookupFacts,
  validateServerResult,
} from '../../../supabase/functions/_shared/productScanner';

const fact = (
  field: string,
  value: string,
  authority = 'OFFICIAL_MANUFACTURER',
  sourceUrl = 'https://www.coca-cola.com/pl/pl/brands/coca-cola-zero',
) => ({ field, value, sourceUrl, sourceAuthorityClass: authority, sourceTitle: 'Coca-Cola Zero' });

const labelResult = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: 'Coca-Cola Zero',
    originalName: 'Coca-Cola zero sugar',
    brand: 'Coca-Cola',
    explicitlyUnbranded: false,
    category: null,
    variant: null,
    countryOfOrigin: null,
    labelLanguages: ['pl'],
  },
  package: { netQuantity: 330, unit: 'ml', netQuantityText: '330 ml' },
  barcodes: [{ value: '5449000131805', format: 'EAN_13' }],
  nutrition: {
    basis: 'per_100ml',
    energyKj: 1,
    energyKcal: 0.2,
    fat: 0,
    saturatedFat: 0,
    carbohydrate: 0,
    sugars: 0,
    protein: 0,
    salt: 0.01,
    fibre: null,
  },
  ingredientsText: null,
  allergensText: null,
  mayContainAllergens: [],
  claims: [],
  storageInstructions: null,
  manufacturer: null,
  evidence: [
    'identity.displayName',
    'identity.brand',
    'package.netQuantity',
    'nutrition.energyKcal',
    'nutrition.fat',
    'nutrition.carbohydrate',
    'nutrition.protein',
    'nutrition.salt',
  ].map((field) => ({
    assetId: '11111111-1111-4111-8111-111111111111',
    field,
    source: 'label',
    confidence: 'high',
    region: field.startsWith('package')
      ? 'package'
      : field.startsWith('nutrition')
        ? 'nutrition_table'
        : 'front',
    directVisibility: true,
  })),
  externalSources: [],
  conflicts: [],
  warnings: [],
  missingFields: [],
  ...overrides,
});

describe('the exact GTIN source fills gaps and never overwrites a label', () => {
  it('asks only for fields a scan can use, and never for the product name', () => {
    expect([...EAN_LOOKUP_FIELDS]).toContain('ingredients');
    expect([...EAN_LOOKUP_FIELDS]).toContain('nutritionBasis');
    // Identity is read from the package the owner is holding, never guessed from a page.
    expect([...EAN_LOOKUP_FIELDS]).not.toContain('name');
    expect([...EAN_LOOKUP_FIELDS]).not.toContain('brand');
  });

  it('turns verbatim facts into scan fields with their source attached', () => {
    const result = scanResultFromLookupFacts([
      fact('ingredients', 'Woda, barwnik: karmel E150d, kwas fosforowy'),
      fact('nutritionBasis', 'na 100 ml'),
      fact('energyKcal', '0,2 kcal'),
      fact('salt', '0,01 g'),
      fact('netQuantity', '330 ml'),
    ])!;
    expect(result.ingredientsText).toBe('Woda, barwnik: karmel E150d, kwas fosforowy');
    expect((result.nutrition as Record<string, unknown>).basis).toBe('per_100ml');
    expect((result.nutrition as Record<string, unknown>).energyKcal).toBe(0.2);
    expect((result.package as Record<string, unknown>).netQuantity).toBe(330);
    const sources = result.externalSources as { sourceType: string; fieldsUsed: string[] }[];
    expect(sources[0]?.sourceType).toBe('manufacturer');
    expect(sources[0]?.fieldsUsed).toContain('nutrition.energyKcal');
    expect(sources[0]?.fieldsUsed).toContain('ingredientsText');
  });

  it('drops nutrition numbers that arrive without a declared basis', () => {
    const result = scanResultFromLookupFacts([
      fact('energyKcal', '42'),
      fact('fat', '1,2 g'),
      fact('ingredients', 'Mleko'),
    ])!;
    // Per 100 ml is not per 100 g. Without the basis these are not measurements.
    expect((result.nutrition as Record<string, unknown>).energyKcal).toBeNull();
    expect(result.ingredientsText).toBe('Mleko');
  });

  it('classifies the source from the authority the server derived, not the model claim', () => {
    const sourceTypeFor = (authority: string) =>
      (
        scanResultFromLookupFacts([
          fact('ingredients', 'Woda', authority, 'https://example.com/x'),
        ])!.externalSources as { sourceType: string }[]
      )[0]?.sourceType;
    // The keys are the canonical authority classes. The first served lookup mapped an
    // official specification PDF to „web_search" because they were not.
    expect(sourceTypeFor('OFFICIAL_MANUFACTURER')).toBe('manufacturer');
    expect(sourceTypeFor('OFFICIAL_TECHNICAL_PDF')).toBe('manufacturer');
    expect(sourceTypeFor('OFFICIAL_BRAND')).toBe('manufacturer');
    expect(sourceTypeFor('STRUCTURED_PRODUCT_DATABASE')).toBe('barcode_registry');
    expect(sourceTypeFor('AUTHORITATIVE_RETAILER')).toBe('retailer');
    expect(sourceTypeFor('OFFICIAL_PRIVATE_LABEL')).toBe('retailer');
    expect(sourceTypeFor('OTHER_WEB')).toBe('web_search');
    expect(sourceTypeFor('OWNER_PROVIDED_SOURCE')).toBe('web_search');
  });

  it('returns nothing at all when the source found nothing', () => {
    expect(scanResultFromLookupFacts([])).toBeNull();
    expect(scanResultFromLookupFacts([fact('ingredients', '   ')])).toBeNull();
  });

  it('lets the label win every disagreement with the source', () => {
    const lookup = scanResultFromLookupFacts([
      fact('nutritionBasis', 'per 100 ml'),
      fact('salt', '0,05 g'),
      fact('ingredients', 'Woda gazowana'),
    ])!;
    const merged = mergeProductScanResults(lookup, labelResult(), '5449000131805');
    expect((merged.nutrition as Record<string, unknown>).salt).toBe(0.01);
    // The disagreement is kept, retained on the label side.
    expect(merged.conflicts).toContainEqual(
      expect.objectContaining({ field: 'nutrition.salt', retainedSource: 'label' }),
    );
    // What the label did not carry is filled rather than asked for again.
    expect(merged.ingredientsText).toBe('Woda gazowana');
  });

  it('refuses to pick a winner when neither side carries evidence', () => {
    const lookup = scanResultFromLookupFacts([
      fact('nutritionBasis', 'per 100 ml'),
      fact('salt', '0,05 g'),
    ])!;
    const unevidenced = labelResult({ evidence: [] });
    const merged = mergeProductScanResults(lookup, unevidenced, '5449000131805');
    // An unevidenced disagreement is left open for review, never resolved by guessing.
    expect((merged.nutrition as Record<string, unknown>).salt).toBeNull();
    expect(merged.conflicts).toContainEqual(
      expect.objectContaining({ field: 'nutrition.salt', retainedSource: null }),
    );
  });

  it('counts source-supplied fields as evidence, so no photo is demanded for them', () => {
    const lookup = scanResultFromLookupFacts([
      fact('nutritionBasis', 'na 100 ml'),
      fact('energyKcal', '0,2'),
      fact('fat', '0'),
      fact('carbohydrate', '0'),
      fact('protein', '0'),
      fact('salt', '0,01'),
      fact('ingredients', 'Woda gazowana, barwnik E150d'),
      fact('allergens', 'Brak deklarowanych alergenów'),
    ])!;
    const merged = mergeProductScanResults(
      lookup,
      labelResult({ nutrition: { ...labelResult().nutrition, basis: null, energyKcal: null } }),
      '5449000131805',
    );
    const validation = validateServerResult(merged, ['11111111-1111-4111-8111-111111111111']);
    expect(
      validation.missingCriticalFields.filter((field) => field.startsWith('evidence_')),
    ).toEqual([]);
    expect(validation.missingCriticalFields).not.toContain('ingredientsText');
    expect(validation.missingCriticalFields).not.toContain('allergen_confirmation');
  });

  it('keeps the locally decoded barcode as the authoritative code', () => {
    const merged = mergeProductScanResults(null, labelResult({ barcodes: [] }), '5449000131805');
    expect(merged.barcodes).toEqual([{ value: '5449000131805', format: 'EAN_13' }]);
  });
});
