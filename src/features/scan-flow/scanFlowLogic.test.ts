import { describe, expect, it } from 'vitest';
import type { ExactCandidate } from '@/scan-import-v2';
import {
  confirmationsFromFields,
  manualConfirmedScan,
  plainFieldsFor,
  positionHint,
  prefillFromIdentity,
  scanFeedbackText,
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

  it('the customer always reads what the scanner is doing: guidance > position > state', () => {
    const base = {
      state: 'SEARCHING' as const,
      guidance: 'none' as const,
      timedOut: false,
      position: null,
    };
    expect(scanFeedbackText(base)).toBe('Szukam kodu…');
    expect(scanFeedbackText({ ...base, state: 'FOUND' })).toBe('Widzę kod');
    expect(scanFeedbackText({ ...base, state: 'READING' })).toBe('Odczytuję kod…');
    expect(scanFeedbackText({ ...base, state: 'HOLD', guidance: 'hold_steady' })).toBe(
      'Trzymaj telefon nieruchomo',
    );
    expect(scanFeedbackText({ ...base, state: 'FOUND', guidance: 'move_closer' })).toBe(
      'Przybliż telefon do kodu',
    );
    expect(scanFeedbackText({ ...base, state: 'FOUND', guidance: 'move_away' })).toBe(
      'Odsuń telefon od kodu',
    );
    expect(scanFeedbackText({ ...base, state: 'FOUND', guidance: 'improve_light' })).toBe(
      'Potrzeba więcej światła',
    );
    expect(scanFeedbackText({ ...base, state: 'FOUND', position: 'left' })).toBe(
      'Przesuń telefon w lewo',
    );
    expect(scanFeedbackText({ ...base, state: 'READING', position: 'right' })).toBe(
      'Przesuń telefon w prawo',
    );
    expect(scanFeedbackText({ ...base, state: 'READING', timedOut: true })).toMatch(
      /spróbuj bliżej/,
    );
    expect(scanFeedbackText({ ...base, state: 'COMPLETE' })).toBe('Odczytano');
    expect(scanFeedbackText({ ...base, state: 'LOST' })).toMatch(/Zgubiłem kod/);
  });

  it('where the code sits in the frame becomes a left/right/up/down hint', () => {
    expect(positionHint({ x: 0, y: 900, w: 200, h: 100 }, 1080, 1920)).toBe('left');
    expect(positionHint({ x: 880, y: 900, w: 200, h: 100 }, 1080, 1920)).toBe('right');
    expect(positionHint({ x: 440, y: 0, w: 200, h: 100 }, 1080, 1920)).toBe('up');
    expect(positionHint({ x: 440, y: 1800, w: 200, h: 100 }, 1080, 1920)).toBe('down');
    expect(positionHint({ x: 440, y: 900, w: 200, h: 100 }, 1080, 1920)).toBeNull();
    expect(positionHint(null, 1080, 1920)).toBeNull();
  });

  it('registry facts prefill the plain fields the customer would otherwise type', () => {
    const values = prefillFromIdentity({
      displayName: 'Choco brownie',
      brand: 'Milka',
      quantity: '150 g',
      family: 'other',
      sourceUrl: 'u',
      productFields: {
        identity: { displayName: 'Choco brownie', brand: 'Milka' },
        nutrition: { energyKcal: 467.5, fat: 27, basis: 'per_100g' },
        ingredientsText: 'Azúcar, HUEVO',
        allergensText: 'eggs, gluten',
      },
      hasNutrition: true,
      hasIngredients: true,
    });
    expect(values).toEqual({
      displayName: 'Choco brownie',
      brand: 'Milka',
      energyKcal: '467.5',
      fat: '27',
      basis: 'per_100g',
      ingredientsText: 'Azúcar, HUEVO',
      allergensText: 'eggs, gluten',
    });
  });
});
