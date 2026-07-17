import { describe, expect, it } from 'vitest';
import { MINUS_SIGN, formatTemperatureC } from './temperature';

describe('formatTemperatureC — one minus glyph everywhere (audit #27)', () => {
  it('renders negatives with the typographic minus sign U+2212, never a hyphen', () => {
    expect(formatTemperatureC(-11)).toBe('−11°C');
    expect(formatTemperatureC(-12)).toBe('−12°C');
    expect(formatTemperatureC(-13)).toBe('−13°C');
    expect(formatTemperatureC(-18)).toBe('−18°C');
    // The exact codepoint contract.
    expect(MINUS_SIGN).toBe('−');
    expect(formatTemperatureC(-12).includes('-')).toBe(false); // no ASCII hyphen
  });

  it('renders zero and positives without a sign', () => {
    expect(formatTemperatureC(0)).toBe('0°C');
    expect(formatTemperatureC(4)).toBe('4°C');
  });

  it('matches the static copy glyphs (U+2212 in mode labels)', () => {
    // '−11°C' as written in customerShellCopy.modes.options.temp_minus_11.label
    expect(formatTemperatureC(-11)).toBe('−11°C');
  });
});
