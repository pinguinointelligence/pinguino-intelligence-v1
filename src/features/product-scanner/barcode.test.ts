import { describe, expect, it } from 'vitest';
import { barcodeLookupCandidates, expandUpce, gtinCheckDigit, validateBarcode } from './barcode';

describe('Product Scanner barcode authority', () => {
  it('validates EAN-8, EAN-13 and UPC-A check digits', () => {
    expect(validateBarcode('96385074')).toMatchObject({ format: 'EAN_8', value: '96385074' });
    expect(validateBarcode('4006381333931')).toMatchObject({ format: 'EAN_13' });
    expect(validateBarcode('036000291452')).toMatchObject({ format: 'UPC_A' });
    expect(validateBarcode('4006381333932')).toBeNull();
    expect(gtinCheckDigit('400638133393')).toBe(1);
  });

  it('expands valid UPC-E and provides equivalent exact lookup keys', () => {
    const expanded = expandUpce('04252614');
    expect(expanded).toBe('042100005264');
    const barcode = validateBarcode('04252614', 'upc_e');
    expect(barcode).toMatchObject({ format: 'UPC_E', lookupValue: expanded });
    expect(barcodeLookupCandidates(barcode!)).toEqual(['04252614', '042100005264']);
  });

  it('rejects malformed or unsupported payloads instead of guessing', () => {
    expect(validateBarcode('123')).toBeNull();
    expect(validateBarcode('036000291453')).toBeNull();
    expect(validateBarcode('not-a-code')).toBeNull();
  });
});
