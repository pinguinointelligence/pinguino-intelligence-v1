// GS1 GTIN helpers for the country-product layer.
//
// The check-digit rule is the same one the app uses in
// src/features/global-catalog/normalization.ts (isValidGtin). The registry
// test re-verifies every stored GTIN with that app function, so the two
// implementations cannot drift silently.

/** Digits only, or null when nothing numeric is present. */
export function digitsOnly(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** True when the digits form a GTIN-8/12/13/14 with a correct GS1 check digit. */
export function isValidGtin(value) {
  const digits = digitsOnly(value);
  if (!digits || ![8, 12, 13, 14].includes(digits.length)) return false;
  const numbers = digits.split('').map(Number);
  const check = numbers.pop();
  const sum = numbers
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Zero-padded GTIN-14 used for identity comparison (never for display). */
export function toGtin14(value) {
  const digits = digitsOnly(value);
  if (!digits || digits.length > 14) return null;
  return digits.padStart(14, '0');
}

/**
 * Comparison form that ignores leading zeros, so 733739058324 (UPC-A),
 * 0733739058324 and 00733739058324 compare equal. The database stores
 * EAN-13 digits as printed; lookups must therefore be padding-insensitive.
 */
export function gtinComparisonKey(value) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  const stripped = digits.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : null;
}

/** GS1 symbology family implied by the digit count. */
export function gtinSymbology(value) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  switch (digits.length) {
    case 8:
      return 'EAN_8';
    case 12:
      return 'UPC_A';
    case 13:
      return 'EAN_13';
    case 14:
      return 'GTIN_14';
    default:
      return null;
  }
}

/**
 * GS1 prefixes 020–029 (and 040–049) are restricted-circulation numbers that a
 * retailer or distributor may assign internally; they are not globally
 * registered trade items. The workbook itself records this for TH codes.
 */
export function isRestrictedCirculationGtin(value) {
  const gtin14 = toGtin14(value);
  if (!gtin14 || gtin14[0] !== '0') return false;
  const gtin13 = gtin14.slice(1);
  return /^(2|02|04)/.test(gtin13);
}
