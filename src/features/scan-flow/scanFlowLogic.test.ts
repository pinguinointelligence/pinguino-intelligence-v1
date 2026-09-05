import { describe, expect, it } from 'vitest';
import type { ExactCandidate } from '@/scan-import-v2';
import {
  confirmationsFromFields,
  manualConfirmedScan,
  plainFieldsFor,
  toResolvedScanProduct,
} from './scanFlowLogic';

describe('scan flow — pure rules', () => {
  it('a typed code becomes the same confirmed-scan contract, with manual provenance', () => {
    const scan = manualConfirmedScan(' 8402 0010 47251 ', 1000);
    expect(scan?.symbology).toBe('EAN-13');
    expect(scan?.value).toBe('8402001047251');
    expect(scan?.confirmation.sources).toEqual(['manual']);
    expect(scan?.provenance.trackId).toBe('manual');
    expect(manualConfirmedScan('036000291452')?.symbology).toBe('UPC-A');
    expect(manualConfirmedScan('96385074')?.symbology).toBe('EAN-8');
    expect(manualConfirmedScan('123')).toBeNull();
    expect(manualConfirmedScan('12345678901234')).toBeNull();
  });

  it('a resolved candidate maps onto the shape the recipe picker already consumes', () => {
    const candidate: ExactCandidate = {
      productId: 'p1',
      productCode: 'PR-ING-1',
      displayName: 'Leche entera',
      brand: 'Hacendado',
      ean: '8402001047251',
      strength: 'canonical_shared',
      entityKind: 'commercial_product',
      engineReady: true,
      mapperSlotId: null,
      country: 'ES',
      evidence: { status: 'verified' },
    };
    const resolved = toResolvedScanProduct(candidate, true, '8402001047251');
    expect(resolved).toEqual({
      id: 'p1',
      productCode: 'PR-ING-1',
      displayName: 'Leche entera',
      brand: 'Hacendado',
      entityKind: 'commercial_product',
      status: 'verified',
      engineReady: true,
      barcode: '8402001047251',
    });
    expect(
      toResolvedScanProduct(
        { ...candidate, entityKind: 'customer_provisional', evidence: {} },
        false,
        null,
      ),
    ).toMatchObject({
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      engineReady: false,
    });
    expect(
      toResolvedScanProduct({ ...candidate, entityKind: 'pi_base' }, true, null),
    ).toMatchObject({
      entityKind: 'pi_base',
      status: 'pi_base',
    });
  });

  it('missing critical facts become only the minimal plain fields, never a technical parameter', () => {
    const fields = plainFieldsFor([
      'product_identity',
      'brand_or_unbranded',
      'ingredientsText',
      'allergen_confirmation',
      'nutrition_basis',
      'nutrition_energyKcal',
      'nutrition_fat',
      'nutrition_carbohydrate',
      'nutrition_protein',
      'nutrition_salt',
      'PAC_POD_UNKNOWN_TECHNICAL_CODE',
      'MAPPER_SLOT_REQUIRED',
    ]);
    expect(fields.map((f) => f.key)).toEqual([
      'displayName',
      'brand',
      'unbranded',
      'ingredientsText',
      'allergensText',
      'basis',
      'energyKcal',
      'fat',
      'carbohydrate',
      'protein',
      'salt',
    ]);
    expect(fields.find((f) => f.key === 'fat')).toMatchObject({ kind: 'number', unit: 'g' });
    expect(fields.find((f) => f.key === 'energyKcal')).toMatchObject({ unit: 'kcal' });
    expect(plainFieldsFor(['nutrition_sugars'])).toHaveLength(2); // basis + sugars
    expect(plainFieldsFor([])).toEqual([]);
    expect(plainFieldsFor([], { needIdentity: true }).map((f) => f.key)).toEqual([
      'displayName',
      'brand',
      'unbranded',
    ]);
    expect(plainFieldsFor(['ALCOHOL_ABV_REQUIRED']).map((f) => f.key)).toEqual(['alcoholAbv']);
  });

  it("the customer's answers become finalize confirmations (only what was answered, numbers parsed)", () => {
    const c = confirmationsFromFields({
      displayName: ' Choco Wafers ',
      brand: 'Milka',
      ingredientsText: 'cukier, mąka',
      allergensText: 'mleko, gluten',
      basis: 'per_100g',
      energyKcal: '520',
      fat: '27,5',
      carbohydrate: '60',
      protein: '6.1',
      salt: '',
      alcoholAbv: '',
    });
    expect(c.productFields).toEqual({
      identity: { displayName: 'Choco Wafers', brand: 'Milka' },
      ingredientsText: 'cukier, mąka',
      allergensText: 'mleko, gluten',
      nutrition: { energyKcal: 520, fat: 27.5, carbohydrate: 60, protein: 6.1, basis: 'per_100g' },
    });
    expect(confirmationsFromFields({ unbranded: true, brand: 'ignored' }).productFields).toEqual({
      identity: { explicitlyUnbranded: true },
    });
    expect(confirmationsFromFields({ fat: 'abc' }).productFields).toEqual({});
    expect(confirmationsFromFields({ fat: '1', basis: 'per_100ml' }).productFields).toEqual({
      nutrition: { fat: 1, basis: 'per_100ml' },
    });
  });
});
