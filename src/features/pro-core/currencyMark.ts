/**
 * The approved money MARK (Gellatti V2.1).
 *
 * The approved preview writes prices as `1.20 €/kg` — the symbol, not the ISO
 * code. This helper turns a stored currency code into the mark the owner
 * approved, and falls back to the code itself for any currency without a
 * common single-character mark, so nothing is ever hidden.
 *
 * PRESENTATION ONLY. The stored value stays the ISO code: costing, persistence,
 * exports, the label and every calculation continue to read `cost.currency`.
 * Nothing here rounds, converts or re-bases a price.
 */
const MARKS: Readonly<Record<string, string>> = {
  EUR: '€',
  PLN: 'zł',
  USD: '$',
  GBP: '£',
  CHF: 'CHF',
  CZK: 'Kč',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
};

export function currencyMark(code: string | null | undefined): string {
  if (!code) return '';
  return MARKS[code.toUpperCase()] ?? code;
}
