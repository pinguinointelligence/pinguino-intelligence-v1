/**
 * Direction readability contract — the reported value, in BOTH states.
 *
 * A blocked axis (`blocked_science` for Vegan/Protein, `blocked_data`,
 * `blocked_runtime`) still renders its chosen position: the control doubles as
 * a read-only display of `direction_targets`. That value therefore has to stay
 * legible when the control cannot be touched.
 *
 * History, because it explains the shape of this file. The value used to be a
 * numeral printed INSIDE the selected detent. Enabled that was white on
 * #f58a07 — 2.46:1, carried as an owner-approved V2.1 exception. Disabled it
 * was worse: a blanket `disabled:opacity-35` composited fill and numeral
 * together and flattened it to white on #fcd6a8, 1.37:1, hiding the very value
 * the control existed to report. Recolouring could not repair a group opacity
 * (ink at 35 % lands at 1.66:1), so the state carried explicit colours.
 *
 * The frozen PRO visual removes the exception rather than re-granting it: the
 * value moved OUT of the thumb and became an ink readout beside the track, so
 * the enabled state is no longer a 2.46:1 exception and the disabled state is
 * attention ink on the page ground. Both are asserted below against real
 * computed ratios, from source and tokens rather than matched class strings,
 * so the contract also fails if a token is retuned.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const axes = readFileSync(resolve(import.meta.dirname, 'ProfileDirectionAxes.tsx'), 'utf8');
const tokens = readFileSync(resolve(import.meta.dirname, '../../styles/tokens.css'), 'utf8');

/** Every ground the readout can sit on — the section itself is transparent. */
const GROUNDS = ['#ffffff', 'var(--g-ivory)', 'var(--g-ivory-deep)'] as const;

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

/** The readout's two colours are the ternary on `profile-regulator-*-value`. */
const READOUT = axes.match(/disabled\s*\?\s*'text-\[([^\]]+)\]'\s*:\s*'text-\[([^\]]+)\]'/);

function readoutColour(state: 'unavailable' | 'interactive'): string {
  const raw = READOUT?.[state === 'unavailable' ? 1 : 2];
  if (raw === undefined) throw new Error(`readout colour for ${state} not found`);
  return colour(raw);
}

describe('Direction readability — the reported value', () => {
  it('never dims the control with a group opacity', () => {
    // Group opacity flattens fill AND value together; no colour survives it.
    expect(axes).not.toContain('disabled:opacity-35');
    expect(axes).not.toMatch(/disabled:opacity-/);
  });

  it('never prints the value inside the orange thumb again', () => {
    // The 2.46:1 exception existed only because the numeral lived in the fill.
    expect(axes).not.toMatch(/bg-\[#f58a07\][^"']*text-white/);
    expect(axes).toContain('profile-regulator-${id}-value');
  });

  it('keeps the value readable on every ground it can sit on, in both states', () => {
    for (const state of ['unavailable', 'interactive'] as const) {
      const ink = readoutColour(state);
      for (const ground of GROUNDS) {
        expect(
          contrast(ink, colour(ground)),
          `${state} readout ${ink} on ${ground}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('still marks the chosen position when the axis is blocked', () => {
    // The thumb keeps the muted orange the old opacity used to produce, so an
    // unavailable axis reads as before — it just no longer carries the numeral.
    expect(axes).toContain("disabled ? 'bg-[#fcd6a8]' : 'bg-[#f58a07]'");
  });

  it('offers no hover affordance that could imply a blocked axis is live', () => {
    // The frozen track has one mark, positioned by state — there is no per-
    // detent surface left to tint, so no hover treatment exists to leak.
    expect(axes).not.toMatch(/hover:bg-\[#f58a07\]/);
    expect(axes).not.toMatch(/hover:border-\[#f58a07\]/);
  });
});
