const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');

/**
 * Decide whether one receipt belongs to the final exact-GTIN identity.
 *
 * A bounded research plan can discover the barcode only on a later step. Every
 * earlier receipt still belongs to that same product when all non-barcode
 * identity fields match and the complete receipt ledger discovered exactly one
 * checksum-valid GTIN: the final one. Multiple or contradictory discoveries
 * always fail closed.
 */
export function intimportReceiptBarcodeIdentityMatches(input: {
  receiptBarcode: string | null;
  currentBarcode: string | null;
  discoveredBarcodes: ReadonlySet<string>;
}): boolean {
  const receiptBarcode = digits(input.receiptBarcode);
  const currentBarcode = digits(input.currentBarcode);
  const discovered = new Set([...input.discoveredBarcodes].map(digits).filter(Boolean));
  return (
    receiptBarcode === currentBarcode ||
    (receiptBarcode === '' &&
      currentBarcode !== '' &&
      discovered.size === 1 &&
      discovered.has(currentBarcode))
  );
}
