import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THE SHARED DESTINATION TOP — the three defects the owner closed on
 * 2026-09-19, pinned at their source.
 *
 * All three were found on the SERVED render, not in review, and all three are
 * invisible to a jsdom test: a corner that a stylesheet silently rewrote, a
 * photograph meeting the block's edge, and a button leaving its own card at one
 * viewport width. What a unit test CAN do is hold the decision that fixed each
 * one, so the next edit has to argue with it rather than quietly undo it.
 *
 * The measured proof lives with the change itself: radius 16 px and horizontal
 * overflow 0 at 375 / 820 / 1024 / 1440 on Franchise, Affiliate and Shop.
 */
const SRC = join(process.cwd(), 'src');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
/**
 * The file with its prose removed.
 *
 * These contracts assert what the component DOES, and the comments explaining
 * each fix necessarily quote the thing they removed („md:flex-nowrap", „Shop").
 * Matching the raw file would therefore fail on its own documentation, so the
 * assertions run against code only.
 */
const code = (...parts: string[]) =>
  read(...parts)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

describe('the destination top carries the DESIGN corner', () => {
  const css = read('styles', 'gellatti-v2-1.css');

  it('declares 16 px on the shared marker, once', () => {
    const rule = css.match(/\.gellatti-destination\s+\[data-destination-top\]\s*\{[^}]*\}/g);
    expect(rule).toHaveLength(1);
    expect(rule![0]).toMatch(/border-radius:\s*16px\s*!important/);
  });

  it('does NOT reach the fix by moving the whole canvas token', () => {
    // Panels, cards and controls on this canvas are correct at 12 px. Changing
    // the token to 16 would have "fixed" the top by restyling everything else.
    expect(css).toMatch(/\.gellatti-destination\s*\{\s*--radius-pro-studio:\s*12px/);
  });

  it('does NOT reach the fix with per-page overrides', () => {
    // Three page-specific corners is precisely how one hero system becomes
    // three lookalikes that drift.
    for (const page of ['franchise', 'affiliate', 'shop']) {
      expect(css).not.toMatch(new RegExp(`\\.${page}[^{]*border-radius`, 'i'));
    }
  });
});

describe('the photograph returns to the ground at every edge it reaches', () => {
  const top = read('components', 'shared', 'destinationEditorial.tsx');

  it('keeps the copy-side fade that was already approved', () => {
    expect(top).toMatch(/linear-gradient\(180deg,rgba\(14,15,17,0\.28\)/);
    expect(top).toMatch(/md:bg-\[linear-gradient\(90deg,#0e0f11_0%/);
  });

  it('adds a return on the right, and on the top and bottom the picture reaches', () => {
    // A packshot is shot on a WHITE studio ground: without these the block
    // ended in a pale band and a hard vertical edge instead of the graphite.
    expect(top).toMatch(/md:bg-\[linear-gradient\(270deg,#0e0f11_0%/);
    expect(top).toMatch(/linear-gradient\(180deg,#0e0f11_0%/);
    expect(top).toMatch(/linear-gradient\(0deg,#0e0f11_0%/);
  });

  it('is one system, not a Shop-only branch', () => {
    // The return must not be conditional on which page is rendering. Scoped to
    // DestinationTop on purpose: this module also holds the older
    // `DestinationHero`, which legitimately takes a `variant`, and that one is
    // not what the three destinations now share.
    const source = code('components', 'shared', 'destinationEditorial.tsx');
    const start = source.indexOf('export function DestinationTop');
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start + 1);
    const end = rest.indexOf('\nexport function ');
    const body = end === -1 ? rest : rest.slice(0, end);
    expect(body).not.toMatch(/\b(shop|franchise|affiliate|variant)\b/i);
  });
});

describe('a singles card keeps its action inside itself', () => {
  const card = read('features', 'shop', 'ShopProductCard.tsx');

  it('never forces the action row onto one line', () => {
    // `md:flex-nowrap` pushed „Dodaj do koszyka" 106 px outside its own card in
    // the two-column grid, and the page scrolled sideways by 82 px at 820 px.
    const source = code('features', 'shop', 'ShopProductCard.tsx');
    expect(source).not.toMatch(/md:flex-nowrap/);
    expect(source).toMatch(/flex-wrap/);
  });

  it('lets the price block shrink instead of shoving its neighbour out', () => {
    expect(card).toMatch(/flex min-w-0 items-baseline/);
  });

  it('does not hide the problem instead of fixing it', () => {
    const source = code('features', 'shop', 'ShopProductCard.tsx');
    expect(source).not.toMatch(/overflow-hidden|overflow-x-auto|overflow-x-scroll/);
  });
});
