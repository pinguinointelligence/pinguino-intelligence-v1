import { describe, expect, it } from 'vitest';
import { intimportReceiptBarcodeIdentityMatches } from './intimportReceiptIdentity';

describe('INTIMPORT enrichment receipt barcode lineage', () => {
  it('keeps earlier receipts when one later step discovers the final exact GTIN', () => {
    expect(
      intimportReceiptBarcodeIdentityMatches({
        receiptBarcode: null,
        currentBarcode: '5900194000273',
        discoveredBarcodes: new Set(['5900194000273']),
      }),
    ).toBe(true);
  });

  it('accepts an unchanged receipt identity', () => {
    expect(
      intimportReceiptBarcodeIdentityMatches({
        receiptBarcode: '5900194000273',
        currentBarcode: '5900194000273',
        discoveredBarcodes: new Set(),
      }),
    ).toBe(true);
  });

  it('fails closed when research discovers multiple GTINs', () => {
    expect(
      intimportReceiptBarcodeIdentityMatches({
        receiptBarcode: null,
        currentBarcode: '5900194000273',
        discoveredBarcodes: new Set(['5900194000273', '5900120025578']),
      }),
    ).toBe(false);
  });

  it('rejects an explicit receipt GTIN that differs from the final identity', () => {
    expect(
      intimportReceiptBarcodeIdentityMatches({
        receiptBarcode: '5900120025578',
        currentBarcode: '5900194000273',
        discoveredBarcodes: new Set(['5900194000273']),
      }),
    ).toBe(false);
  });
});
