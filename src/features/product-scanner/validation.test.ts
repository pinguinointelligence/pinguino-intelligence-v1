import { describe, expect, it } from 'vitest';
import { PRODUCT_SCAN_SCHEMA_VERSION, type ProductScanResult } from './contracts';
import { mergeExternalFacts, validateProductScanResult } from './validation';

const complete = (overrides: Partial<ProductScanResult> = {}): ProductScanResult => ({
  schemaVersion: PRODUCT_SCAN_SCHEMA_VERSION,
  identity: {
    displayName: 'Czekolada deserowa',
    originalName: 'Dark chocolate',
    brand: 'Próba',
    explicitlyUnbranded: false,
    category: 'czekolada',
    variant: null,
    countryOfOrigin: 'PL',
    labelLanguages: ['pl', 'en'],
  },
  package: { netQuantity: 100, unit: 'g', netQuantityText: '100 g' },
  barcodes: [{ value: '4006381333931', format: 'EAN_13' }],
  nutrition: {
    basis: 'per_100g',
    energyKj: 2100,
    energyKcal: 502,
    fat: 28,
    saturatedFat: 17,
    carbohydrate: 51,
    sugars: 44,
    protein: 7,
    salt: 0.1,
    fibre: 7,
  },
  ingredientsText: 'Masa kakaowa, cukier, tłuszcz kakaowy.',
  allergensText: 'Może zawierać mleko i soję.',
  mayContainAllergens: ['mleko', 'soja'],
  claims: [],
  storageInstructions: null,
  manufacturer: null,
  externalSources: [],
  evidence: [
    {
      assetId: 'front-1',
      field: 'identity.displayName',
      source: 'label',
      confidence: 'high',
      region: 'front',
      directVisibility: true,
    },
  ],
  missingFields: [],
  conflicts: [],
  warnings: [],
  ...overrides,
});

describe('deterministic Product Scanner validation', () => {
  it.each([
    ['pl', 'Składniki: cukier. Alergeny: mleko.'],
    ['en', 'Ingredients: sugar. Allergens: milk.'],
    ['es', 'Ingredientes: azúcar. Alérgenos: leche.'],
    ['pt', 'Ingredientes: açúcar. Alérgenos: leite.'],
    ['de', 'Zutaten: Zucker. Allergene: Milch.'],
  ])(
    'retains multilingual label text without translating facts (%s)',
    (_language, ingredientsText) => {
      const result = validateProductScanResult(complete({ ingredientsText }));
      expect(result.ok).toBe(true);
      expect(result.normalized?.ingredientsText).toBe(ingredientsText);
      expect(result.overlayState).toBe('PENDING_PUBLICATION');
    },
  );

  it('keeps missing evidence UNKNOWN instead of manufacturing zero', () => {
    const source = complete({
      nutrition: { ...complete().nutrition, salt: null },
      missingFields: ['nutrition_salt'],
    });
    const result = validateProductScanResult(source);
    expect(result.normalized?.nutrition.salt).toBeNull();
    expect(result.overlayState).toBe('SCAN_DRAFT');
  });

  it('rejects impossible nutrition and invalid barcode checksums', () => {
    const result = validateProductScanResult(
      complete({
        barcodes: [{ value: '4006381333932', format: 'EAN_13' }],
        nutrition: { ...complete().nutrition, sugars: 70, carbohydrate: 50 },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['barcode_checksum_invalid', 'nutrition_sugars_gt_carbohydrate']),
    );
  });

  it('fails high-risk additives closed without dosage evidence', () => {
    const result = validateProductScanResult(
      complete({
        ingredientsText: 'Mleko, cukier, guma tara, karagen.',
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.overlayState).toBe('SCAN_DRAFT');
    expect(result.warnings).toContain('high_risk_additive_requires_behavior_and_dosage_evidence');
  });

  it('accepts may-contain wording as allergen evidence only when directly visible', () => {
    const indirect = complete({
      allergensText: null,
      evidence: [
        {
          assetId: 'front-1',
          field: 'mayContainAllergens',
          source: 'label',
          confidence: 'high',
          region: 'allergen_statement',
          directVisibility: false,
        },
      ],
    });
    expect(validateProductScanResult(indirect).overlayState).toBe('SCAN_DRAFT');
    expect(
      validateProductScanResult({
        ...indirect,
        evidence: [{ ...indirect.evidence[0]!, directVisibility: true }],
      }).overlayState,
    ).toBe('PENDING_PUBLICATION');
  });

  it('blocks unresolved critical conflicts but retains non-critical conflicts for review', () => {
    const nonCritical = complete({
      conflicts: [
        {
          field: 'identity.category',
          labelValue: 'Cacao en polvo',
          externalValue: 'Cocoa powder',
          retainedSource: null,
        },
      ],
    });
    expect(validateProductScanResult(nonCritical).overlayState).toBe('PENDING_PUBLICATION');
    expect(
      validateProductScanResult({
        ...nonCritical,
        conflicts: [
          {
            field: 'nutrition.protein',
            labelValue: 7,
            externalValue: 7.5,
            retainedSource: null,
          },
        ],
      }).overlayState,
    ).toBe('SCAN_DRAFT');
  });

  it('retains label facts and records conflicts with external data', () => {
    const label = complete();
    const merged = mergeExternalFacts(label, {
      identity: { ...label.identity, brand: 'Inna marka' },
      nutrition: { ...label.nutrition, sugars: 33 },
    });
    expect(merged.identity.brand).toBe('Próba');
    expect(merged.nutrition.sugars).toBe(44);
    expect(merged.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'identity.brand', retainedSource: 'label' }),
        expect.objectContaining({ field: 'nutrition.sugars', retainedSource: 'label' }),
      ]),
    );
  });
});
