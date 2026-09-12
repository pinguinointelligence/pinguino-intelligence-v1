/**
 * OWNER 2026-09-12 — GLOBAL ACCENT #F0C44C.
 *
 * The Gellatti accent is set ONCE, at the token (`--g-orange`, whose name
 * predates the colour), and every production surface reaches it through that
 * token. #F0C44C is 1.65:1 on white, so the few things it must never carry
 * alone on a light ground — accent text, focus indicators, hover and pressed
 * marks — take same-hue companions that are at least as strong there as the
 * retired orange was. Colours with their OWN meaning are not the accent and
 * keep their values: the attention family, the score scale, the category icon
 * palette, success green and error red.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = import.meta.dirname;
const SRC = resolve(STYLES, '..');
const tokens = readFileSync(resolve(STYLES, 'tokens.css'), 'utf8');

function token(name: string): string {
  const found = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1];
  if (found === undefined) throw new Error(`token --${name} not found`);
  return found.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function channel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

/** The retired Gellatti orange — only ever a reference point here. */
const RETIRED = '#f58a07';
/** Every light ground an accent mark or accent text sits on. */
const LIGHT_GROUNDS = ['#ffffff', token('g-ivory'), token('g-ivory-deep')];

function productionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionSources(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
const sources = productionSources(SRC).map((file) => ({
  file: relative(SRC, file),
  text: readFileSync(file, 'utf8'),
}));

describe('global accent #F0C44C — the source of truth', () => {
  it('sets the accent once, at the token', () => {
    expect(token('g-orange')).toBe('#f0c44c');
    // The unused Tailwind theme alias follows, so no second value survives.
    expect(token('color-gellatti-orange')).toBe('#f0c44c');
  });

  it("derives every companion from the accent's own hue", () => {
    for (const name of ['g-orange-hover', 'g-orange-line', 'g-orange-ink', 'g-orange-soft']) {
      expect(Math.abs(hue(token(name)) - hue(token('g-orange'))), name).toBeLessThanOrEqual(4);
    }
  });

  it('keeps accent text readable on every light ground', () => {
    for (const ground of LIGHT_GROUNDS) {
      expect(contrast(token('g-orange-ink'), ground), ground).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps focus and pressed marks at least as visible as the retired orange', () => {
    expect(contrast(token('g-orange-line'), '#ffffff')).toBeGreaterThanOrEqual(3);
    for (const ground of LIGHT_GROUNDS) {
      expect(contrast(token('g-orange-line'), ground), ground).toBeGreaterThan(
        contrast(RETIRED, ground),
      );
    }
  });

  it('carries dark text on every accent fill — never white', () => {
    for (const fill of [token('g-orange'), token('g-orange-hover')]) {
      expect(contrast(token('g-ink'), fill)).toBeGreaterThanOrEqual(7);
      expect(contrast(token('g-graphite'), fill)).toBeGreaterThanOrEqual(7);
      expect(contrast('#ffffff', fill)).toBeLessThan(3);
    }
    const whiteOnAccent =
      /bg-\[var\(--g-orange(?:-hover)?\)\][^"'`]*\btext-white\b|\btext-white\b[^"'`]*bg-\[var\(--g-orange(?:-hover)?\)\]/;
    expect(sources.filter(({ text }) => whiteOnAccent.test(text)).map(({ file }) => file)).toEqual(
      [],
    );
  });

  it('leaves no production surface painting the retired orange', () => {
    /* The retired accent and its hand-made derivatives: hover, tints, the
       near-miss tab orange, the tour's own copy, and the rgb halo forms. */
    const retired =
      /#f58a07|#ef8708|#e07f06|#e88419|#fcd6a8|#e0bc8a|#fff4e2|(?<![0-9])245[,_\s]+138[,_\s]+7(?![0-9])/i;
    /* Palettes whose orange carries its OWN meaning (owner brief B/D). */
    const ownMeaning = new Set([
      'components/icons/pinguinoIconTokens.ts', // category icons: Fat & creaminess, Nuts
      'features/pro-workbench/workbenchScoreRingTones.ts', // the score scale, 1–5
    ]);
    expect(
      sources
        .filter(({ file, text }) => !ownMeaning.has(file) && retired.test(text))
        .map(({ file }) => file),
    ).toEqual([]);
  });

  it('keeps the colours that carry their own meaning', () => {
    expect(token('g-attention-ink')).toBe('#8a5300');
    expect(token('g-attention-surface')).toBe('#fffaf3');
    expect(token('color-attention')).toBe('#8a5a2a');
    expect(token('color-gold')).toBe('#8a6c2e');
    expect(token('g-score-green')).toBe('#3f9b58');
    expect(token('color-status-error')).toBe('#a06352');
    expect(token('g-ink')).toBe('#101113');
  });
});
