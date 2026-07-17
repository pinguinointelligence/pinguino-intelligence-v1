/**
 * LIGHT-FIRST theme contract (UIUX master Slice A).
 *
 * HONEST REWRITE of the former `darkTheme.test.ts`: the owner decision (light-first
 * everywhere on the landing + customer shell; dark reserved for a possible later
 * Monitor Pro focal panel — spec §21.1, audit finding #4) inverted the shell's
 * direction, so the old assertions (deep dark backdrop, near-white ink, inverted
 * stone ramp) were not deleted silently — they are REPLACED here by the equivalent
 * assertions for the decided light direction:
 *  1. the scoped dark remap is gone from the token module (no `customerDarkVars` /
 *     `customerDarkPageBg` exports),
 *  2. the shell root renders NO dark CSS-variable remap and no dark backdrop,
 *  3. the global light palette is structurally light and readable (same WCAG
 *     luminance/contrast math as before, now pinning the light invariants),
 *  4. disabled primary actions keep READABLE text (spec §21.2, audit #17).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CustomerShellV1 } from '../CustomerShellV1';
import { TouchButton } from './TouchButton';
import * as tokens from './tokens';

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

/** Read a --color-* value from the global theme file (source of the light palette). */
function themeVar(name: string): string {
  const css = readFileSync(resolve(import.meta.dirname, '../../../styles/tokens.css'), 'utf8');
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m || m[1] === undefined) throw new Error(`--color-${name} not found in tokens.css`);
  return m[1];
}

describe('customer shell is light-first (owner decision, Slice A)', () => {
  it('exports NO scoped dark remap from the token module anymore', () => {
    const t = tokens as Record<string, unknown>;
    expect(t['customerDarkVars']).toBeUndefined();
    expect(t['customerDarkPageBg']).toBeUndefined();
  });

  it('renders the shell root with no dark CSS-variable remap and no dark backdrop', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerShellV1 />
      </MemoryRouter>,
    );
    // The retired dark remap worked via inline custom properties + a near-black
    // page backdrop — none of it may reach the DOM any longer.
    expect(html).not.toContain('#0c0d0f');
    expect(html).not.toContain('--color-ink');
    expect(html).not.toContain('--color-paper');
    // The light backdrop class is on the shell root instead.
    expect(html).toContain('bg-paper');
  });

  it('keeps the global light palette structurally light and readable', () => {
    const paper = themeVar('paper');
    const ink = themeVar('ink');
    // White-side surface below near-black text — the inverse of the old dark pins.
    expect(luminance(paper)).toBeGreaterThan(0.9);
    expect(luminance(ink)).toBeLessThan(0.05);
    expect(contrast(ink, paper)).toBeGreaterThan(12);
  });

  it('keeps the Golden Range accent AA-readable as text on paper (gold = optimum only)', () => {
    expect(contrast(themeVar('gold'), themeVar('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives disabled primary buttons a readable label, not a washed 30%-alpha fill (§21.2, audit #17)', () => {
    const html = renderToStaticMarkup(
      <TouchButton disabled>Dalej</TouchButton>,
    );
    expect(html).toContain('disabled:bg-stone-200');
    expect(html).toContain('disabled:text-stone-600');
    expect(html).not.toContain('disabled:bg-ink/30');
  });
});
