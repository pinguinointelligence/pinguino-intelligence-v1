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

/** Every ground the track can sit on — the box itself is transparent. */
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

describe('Direction readability — the reported value', () => {
  it('never dims the control with a group opacity', () => {
    // Group opacity flattens fill AND value together; no colour survives it.
    expect(axes).not.toContain('disabled:opacity-35');
    expect(axes).not.toMatch(/disabled:opacity-/);
  });

  it('never prints the value inside the orange thumb again', () => {
    // The 2.46:1 exception existed only because the numeral lived in the fill.
    // That half of the contract is permanent and unchanged.
    expect(axes).not.toMatch(/bg-\[#f58a07\][^"']*text-white/);
  });

  /* OWNER AUTHORITY 2026-09-03 supersedes the VISIBLE readout, not the
     guarantee behind it. The approved reference prints no numerals: no value
     beside the label, and no numeral row under the track. What the frozen
     contract was actually protecting — that the position is never encoded in
     the 2.46:1 orange alone — now has to hold through the accessible name, so
     that is what is asserted here. A sighted user reads the position from the
     thumb and the fill; assistive tech reads "Słodycz: +1" on the checked
     detent. If the owner ever wants the numeral back on screen, restore the
     ternary AND the ratio loop that used to live in this file. */
  it('still reports the value to assistive tech on every detent', () => {
    /* OWNER 2026-09-03: the numeral is gone from the NAME too, because it was
       never the thing a screen-reader user needed — "Słodycz: -2" told them
       the coordinate, not the meaning. The sentence says what the ball's size
       says to everyone else, so both channels now carry the same statement. */
    expect(axes).toContain('aria-label={`${label}: ${phrases[rampIndex(detent, ascending)]}`}');
    expect(axes).toContain('aria-checked={position === detent}');
    expect(axes).toContain('const PHRASES');
    // Five phrases per direction, so every detent is named, and the neutral one
    // is not silently shared with a signed one.
    for (const phrase of ['mniej słodkie', 'bardziej słodkie', 'średnio']) {
      expect(axes).toContain(phrase);
    }
    expect(axes).not.toMatch(/aria-label=\{`\$\{label\}: \$\{sign/);
  });

  it('encodes the position in more than colour alone', () => {
    // Thumb POSITION and fill WIDTH both carry it, so the reading survives a
    // viewer who cannot separate the orange from the rail.
    expect(axes).toContain('left: at(position)');
    expect(axes).toContain('style={{ left: fillLeft, width: fillWidth }}');
    /* And now by SIZE as well: the mark grows or shrinks with the detent, so
       the reading survives a viewer who cannot separate the orange from the
       rail AND one who cannot judge a small horizontal offset. */
    expect(axes).toContain('const thumbSize = THUMB_PX[rampIndex(position, ascending)]');
  });

  /* With the numerals gone the MARK is the only thing reporting the position,
     so on a blocked axis — the case this whole file exists for — the mark has
     to be findable. The pale fill alone is not: #fcd6a8 sits at 1.07:1 against
     the dots it has to be picked out from. The outline is what carries it, and
     it is measured here against every ground the track can sit on rather than
     matched as a class string, so retuning the token fails this test. */
  it('keeps a blocked position findable without a numeral', () => {
    const outline = colour('var(--g-attention-ink)');
    for (const ground of [...GROUNDS, 'var(--g-rail-track)', '#fcd6a8']) {
      expect(
        contrast(outline, colour(ground)),
        `blocked outline ${outline} on ${ground}`,
      ).toBeGreaterThanOrEqual(3);
    }
    expect(axes).toContain("border-[1.5px] border-[var(--g-attention-ink)] bg-[#fcd6a8]");
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
