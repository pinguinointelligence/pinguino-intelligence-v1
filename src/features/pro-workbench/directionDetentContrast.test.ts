/**
 * Direction detent contrast contract — the UNAVAILABLE state.
 *
 * A blocked axis (`blocked_science` for Vegan/Protein, `blocked_data`,
 * `blocked_runtime`) still renders its chosen detent: the control doubles as a
 * read-only display of `direction_targets`. It used to carry a blanket
 * `disabled:opacity-35`, which composites the whole button group over the white
 * card — the orange fill flattened to #fcd6a8 while the numeral stayed pure
 * white, leaving the reported value at 1.37:1 and effectively invisible.
 *
 * Group opacity cannot be repaired by recolouring the numeral (ink at 35 %
 * lands at 1.66:1), so the state carries explicit colours instead. This
 * contract recomputes the ratios from the source and from tokens.css rather
 * than matching a class string, so it also fails if a token is retuned.
 *
 * The ENABLED selected point is deliberately NOT covered: white on #f58a07
 * (2.46:1) is the owner-approved V2.1 treatment
 * (`gellatti-global-page-preview-gate-20260828-v2-1/pro-workbench.css`,
 * `.pro-adjustment-scale button.active`). Changing it needs owner approval.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const axes = readFileSync(resolve(import.meta.dirname, 'ProfileDirectionAxes.tsx'), 'utf8');
const tokens = readFileSync(resolve(import.meta.dirname, '../../styles/tokens.css'), 'utf8');

/** The card behind the detents — `bg-white` on the axes section. */
const CARD = '#ffffff';

/** First capture of `pattern`, or a named failure — never `undefined`. */
function capture(source: string, pattern: RegExp, what: string): string {
  const found = source
    .match(pattern)
    ?.slice(1)
    .find((group) => group !== undefined);
  if (found === undefined) throw new Error(`${what} not found`);
  return found;
}

function token(name: string): string {
  return capture(tokens, new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`), `token --${name}`);
}

function channel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve `var(--g-x)`, `#rrggbb`, or a bare Tailwind colour name. */
const BARE: Record<string, string> = { white: '#ffffff', black: '#000000' };

function colour(raw: string): string {
  const varied = raw.match(/^var\(--(.+)\)$/)?.[1];
  if (varied !== undefined) return token(varied);
  return BARE[raw] ?? raw;
}

function disabledClass(branch: 'selected' | 'unselected', property: string): string {
  // The two disabled branches are the last ternary in the detent's `cn(...)`.
  const branches = axes.match(/disabled:border-\[[^\]]+\][^']*/g) ?? [];
  if (branches.length !== 2) {
    throw new Error(`expected 2 disabled branches, found ${branches.length}`);
  }
  const source = branches[branch === 'selected' ? 0 : 1] ?? '';
  const raw = capture(
    source,
    new RegExp(`disabled:${property}-(?:\\[([^\\]]+)\\]|([a-z]+))`),
    `disabled:${property} on the ${branch} branch`,
  );
  return colour(raw);
}

describe('Direction detent contrast — unavailable axes', () => {
  it('never dims the detents with a group opacity', () => {
    // Group opacity flattens fill AND numeral together; no colour survives it.
    expect(axes).not.toContain('disabled:opacity-35');
    expect(axes).not.toMatch(/disabled:opacity-/);
  });

  it('keeps the selected detent readable while it still reports the value', () => {
    const fill = disabledClass('selected', 'bg');
    const numeral = disabledClass('selected', 'text');

    expect(contrast(numeral, fill)).toBeGreaterThanOrEqual(4.5);
    // The fill stays the muted orange the opacity used to produce, so the
    // unavailable state reads exactly as before — only the numeral changed.
    expect(fill).toBe('#fcd6a8');
  });

  it('keeps the unselected detents readable on the card', () => {
    const numeral = disabledClass('unselected', 'text');

    expect(disabledClass('unselected', 'bg')).toBe(CARD);
    expect(contrast(numeral, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('offers no hover affordance on a blocked axis', () => {
    expect(axes).toContain('enabled:hover:border-[#f58a07]/60');
    expect(axes).not.toMatch(/[^:]hover:border-\[#f58a07\]/);
  });

  it('leaves the owner-approved V2.1 enabled treatment untouched', () => {
    expect(axes).toContain("'border-[#f58a07] bg-[#f58a07] text-white'");
  });
});
