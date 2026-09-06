import { describe, expect, it } from 'vitest';
import type { ExactCandidate } from '@/scan-import-v2';
import {
  productFieldsNotInLedger,
  confirmationsFromFields,
  manualConfirmedScan,
  gapsFromNote,
  missingDataSentence,
  plainFieldsFor,
  positionHint,
  prefillFromIdentity,
  scanFeedbackText,
  toResolvedScanProduct,
  type FeedbackInput,
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
      completedFromSimilar: false,
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

  it('registry facts are prefilled only where the server session has no fact of its own', () => {
    const fields = {
      identity: { displayName: 'Jogurt', brand: 'Fruvita' },
      nutrition: { basis: 'per_100g', fat: 3 },
      ingredientsText: 'mleko',
      allergensText: 'mleko',
    };
    const serverHasAll = {
      facts: [
        { field: 'identity.displayName', source: 'barcode_registry' },
        { field: 'nutrition.fat', source: 'barcode_registry' },
        { field: 'ingredientsText', source: 'barcode_registry' },
        { field: 'allergensText', source: 'barcode_registry' },
      ],
    };
    expect(productFieldsNotInLedger(fields, serverHasAll)).toEqual({});
    const serverHasNothing = { facts: [{ field: 'barcode', source: 'barcode' }] };
    expect(productFieldsNotInLedger(fields, serverHasNothing)).toEqual(fields);
    const serverHasIdentityOnly = {
      facts: [{ field: 'identity.displayName', source: 'manufacturer' }],
    };
    expect(productFieldsNotInLedger(fields, serverHasIdentityOnly)).toEqual({
      nutrition: fields.nutrition,
      ingredientsText: 'mleko',
      allergensText: 'mleko',
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

describe('SOL-045 — the hint addresses what the customer can actually move', () => {
  const frame = (over: Partial<FeedbackInput> = {}): FeedbackInput => ({
    state: 'FOUND',
    guidance: 'none',
    timedOut: false,
    position: null,
    ...over,
  });

  it('on a computer the PRODUCT moves, never the camera', () => {
    // the owner's own wording, 2026-09-06: a laptop lens is bolted to the screen
    expect(scanFeedbackText(frame({ guidance: 'move_away', formFactor: 'desktop' }))).toBe(
      'Odsuń kod od kamery',
    );
    expect(scanFeedbackText(frame({ guidance: 'move_closer', formFactor: 'desktop' }))).toBe(
      'Przybliż kod',
    );
    expect(scanFeedbackText(frame({ guidance: 'improve_light', formFactor: 'desktop' }))).toBe(
      'Dodaj więcej światła',
    );
    expect(scanFeedbackText(frame({ guidance: 'hold_steady', formFactor: 'desktop' }))).toBe(
      'Przytrzymaj nieruchomo',
    );
    expect(scanFeedbackText(frame({ position: 'left', formFactor: 'desktop' }))).toBe(
      'Przesuń kod w lewo',
    );
  });

  it('in the hand the phone moves — the existing wording is untouched', () => {
    expect(scanFeedbackText(frame({ guidance: 'move_away', formFactor: 'mobile' }))).toBe(
      'Odsuń telefon od kodu',
    );
    expect(scanFeedbackText(frame({ position: 'left', formFactor: 'mobile' }))).toBe(
      'Przesuń telefon w lewo',
    );
    // an unknown form factor keeps the historic phone voice rather than guessing
    expect(scanFeedbackText(frame({ guidance: 'move_away' }))).toBe('Odsuń telefon od kodu');
  });

  it('a code read along the vertical axis asks to turn only what the customer holds', () => {
    const stuck = { readingAxis: 'vertical' as const, trackedWithoutReadMs: 2000 };
    expect(scanFeedbackText(frame({ ...stuck, formFactor: 'desktop' }))).toBe(
      'Obróć produkt, aby kod leżał poziomo',
    );
    expect(scanFeedbackText(frame({ ...stuck, formFactor: 'mobile' }))).toBe(
      'Obróć produkt lub telefon, aby kod leżał poziomo',
    );
  });
});

describe('a refusal names the question to put to the customer (SOL-049)', () => {
  // the owner's Haribo: the registry gave everything except the allergen line, the authority refused
  // with allergen_statement_required, and missingCritical was EMPTY — so nothing was ever asked
  const HARIBO_NOTE =
    'not ready: allergen_statement_required, roleReadiness:REVIEW, recognition:CONFECTIONERY/TOPPING_ONLY';

  it('turns the refusal reason into the field that is actually missing', () => {
    const fields = plainFieldsFor([...[], ...gapsFromNote(HARIBO_NOTE)]);
    expect(fields.map((f) => f.key)).toContain('allergensText');
    expect(fields.find((f) => f.key === 'allergensText')?.label).toMatch(/Alergeny/);
  });

  it('the customer sentence names it too, instead of a shrug', () => {
    expect(missingDataSentence([...gapsFromNote(HARIBO_NOTE)])).toMatch(/Uzupełnij alergeny/);
    // before the fix the empty list produced the "we will check it ourselves" shrug
    expect(missingDataSentence([])).toMatch(/Gdy dojdą kolejne dane/);
  });

  it('carries a missing ingredient statement the same way', () => {
    const fields = plainFieldsFor(gapsFromNote('not ready: ingredients_statement_required'));
    expect(fields.map((f) => f.key)).toContain('ingredientsText');
  });

  it('never invents a field from prose, a readiness word or a recognition class', () => {
    expect(plainFieldsFor(gapsFromNote('not ready: roleReadiness:REVIEW'))).toEqual([]);
    expect(plainFieldsFor(gapsFromNote('recognition:CONFECTIONERY/TOPPING_ONLY'))).toEqual([]);
    expect(gapsFromNote(null)).toEqual([]);
    expect(gapsFromNote('wszystko w porządku')).toEqual([]);
  });
});
