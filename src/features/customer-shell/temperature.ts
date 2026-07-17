/**
 * Customer-shell temperature formatting (presentational only).
 *
 * ONE formatter for every dynamically rendered temperature (audit finding #27):
 * negative values always use the typographic MINUS SIGN U+2212 (“−12°C”), never
 * the ASCII hyphen a raw `${number}°C` template produces (“-12°C”). Static copy
 * in `customerShellCopy.ts` already uses U+2212 — this keeps computed renders
 * identical to it. Display-only; never feeds numbers back into any engine math.
 */

/** Typographic minus sign (U+2212) — matches the static copy glyphs. */
export const MINUS_SIGN = '−';

/**
 * Format a Celsius temperature for display, e.g. `-12` → `−12°C`, `4` → `4°C`.
 * Rounding is NOT performed here — callers pass already-approved display values.
 */
export function formatTemperatureC(celsius: number): string {
  const abs = Math.abs(celsius);
  const sign = celsius < 0 ? MINUS_SIGN : '';
  return `${sign}${abs}°C`;
}
