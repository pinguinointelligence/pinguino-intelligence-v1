import { describe, expect, it } from 'vitest';
import { customerDarkPageBg, customerDarkVars } from './tokens';

/** Read a required dark-palette variable (fails loudly if it is ever dropped). */
function darkVar(name: string): string {
  const value = customerDarkVars[name];
  if (value === undefined) throw new Error(`missing dark var ${name}`);
  return value;
}

/** WCAG relative luminance of a #rrggbb colour (0 = black, 1 = white). */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || m[1] === undefined) throw new Error(`not a #rrggbb colour: ${hex}`);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const int = parseInt(m[1], 16);
  const r = channel((int >> 16) & 0xff);
  const g = channel((int >> 8) & 0xff);
  const b = channel(int & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two #rrggbb colours (1…21). */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('customer-shell dark palette is structurally dark and readable', () => {
  const ink = darkVar('--color-ink');
  const paper = darkVar('--color-paper');

  it('paints a deep, dark page backdrop below a slightly lifted card surface', () => {
    expect(luminance(customerDarkPageBg)).toBeLessThan(0.05);
    expect(luminance(paper)).toBeLessThan(0.08);
    // Cards sit ABOVE the backdrop (lifted), not below it.
    expect(luminance(paper)).toBeGreaterThan(luminance(customerDarkPageBg));
  });

  it('uses near-white primary text (ink), not dark-on-dark', () => {
    expect(luminance(ink)).toBeGreaterThan(0.8);
    expect(contrast(ink, paper)).toBeGreaterThan(12);
  });

  it('keeps secondary/muted text on the readable (light) side of the ramp — AA', () => {
    // stone-600 (secondary) and stone-500 (muted) must clear AA (4.5) on cards,
    // i.e. never a low-contrast dark-grey on black.
    expect(contrast(darkVar('--color-stone-600'), paper)).toBeGreaterThan(4.5);
    expect(contrast(darkVar('--color-stone-500'), paper)).toBeGreaterThan(4.5);
    // The ramp is inverted for dark: higher stone numbers are LIGHTER (text),
    // lower numbers are surfaces.
    expect(luminance(darkVar('--color-stone-600'))).toBeGreaterThan(
      luminance(darkVar('--color-stone-50')),
    );
  });
});
