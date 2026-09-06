/**
 * GTIN checksum validation — an isolated copy for the harness. The harness must not import from
 * src/features/product-scanner (frozen area), so the 3-1 weighted mod-10 rule is restated here.
 */
export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    sum += (payload.charCodeAt(i) - 48) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** True for an 8, 12, 13 or 14 digit string whose last digit is the correct GTIN check digit. */
export function isChecksumValidGtin(text: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(text)) return false;
  return gtinCheckDigit(text.slice(0, -1)) === text.charCodeAt(text.length - 1) - 48;
}

/** Digits only; null when the text is not a plausible retail code. */
export function normalizeGtin(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  return digits.length === 8 || digits.length === 12 || digits.length === 13 ? digits : null;
}
