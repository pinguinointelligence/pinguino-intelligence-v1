/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  APPLICATION_MIN_DESKTOP_SCALE,
  APPLICATION_SCALE_REFERENCE_WIDTH_PX,
  HEADER_ACCOUNT_FULL_WIDTH_VIEWPORT_PX,
  HEADER_ACCOUNT_MAX_WIDTH_PX,
  HEADER_ACCOUNT_MIN_WIDTH_PX,
  HEADER_ACCOUNT_RELEASE_GAP_PX,
  HEADER_ACCOUNT_SAFE_GAP_PX,
  applicationScaleGeometry,
  applicationViewportGeometry,
  headerAccountLaneLayoutWidth,
  headerAccountWidthBudget,
  nextApplicationScaleGeometry,
} from './applicationScaleAuthority';
import { PRO_DESKTOP_MIN_WIDTH_PX } from './proFrameGeometry';

describe('one continuous application scale authority', () => {
  it('keeps the accepted 1440 px composition at 100%', () => {
    expect(APPLICATION_SCALE_REFERENCE_WIDTH_PX).toBe(1440);
    expect(applicationScaleGeometry(1440, 900)).toEqual({
      mode: 'desktop',
      scale: 1,
      layoutWidth: 1440,
      layoutHeight: 900,
    });
  });

  it.each([
    [1366, 0.948611],
    [1280, 0.888889],
    [1194, 0.829167],
    [1100, 0.763889],
  ])('scales every desktop width continuously at %i px', (width, expected) => {
    const geometry = applicationScaleGeometry(width, 900);
    expect(geometry.mode).toBe('desktop');
    expect(geometry.scale).toBeCloseTo(expected, 6);
    expect(geometry.layoutWidth).toBeCloseTo(1440, 6);
    expect(geometry.layoutHeight * geometry.scale).toBeCloseTo(900, 6);
  });

  it('keeps wide screens at 100% and uses only their extra canvas', () => {
    expect(applicationScaleGeometry(1920, 1080)).toEqual({
      mode: 'desktop',
      scale: 1,
      layoutWidth: 1920,
      layoutHeight: 1080,
    });
  });

  it('hands off to the existing mobile composition below 1096 px', () => {
    expect(PRO_DESKTOP_MIN_WIDTH_PX).toBe(1096);
    expect(applicationScaleGeometry(1095, 900)).toEqual({
      mode: 'mobile',
      scale: 1,
      layoutWidth: 1095,
      layoutHeight: 900,
    });
  });

  it('maps painted viewport coordinates back into the zoomed application space', () => {
    expect(
      applicationViewportGeometry(
        { left: 320, top: 80, right: 640, bottom: 160, width: 320, height: 80 },
        0.8,
      ),
    ).toEqual({ left: 400, top: 100, right: 800, bottom: 200, width: 400, height: 100 });
  });
});

/**
 * OWNER 2026-09-12 — FINAL RESPONSIVE TRIGGER. The scale also answers to the
 * header: the account lane (frame edge → safe gap → account → frame gutter) must
 * fit, measured with the account's RENDERED width. The smaller scale wins.
 */
describe('the header clearance trigger', () => {
  /** „pro@pro.com" measures 109.2 px; the authority rounds up to a whole pixel. */
  const SHORT = 110;
  const LONG = HEADER_ACCOUNT_MAX_WIDTH_PX;
  const lane = (accountWidth: number, gap = HEADER_ACCOUNT_SAFE_GAP_PX) => ({ accountWidth, gap });

  it('keeps the owner hard minimum and its release band', () => {
    expect(HEADER_ACCOUNT_SAFE_GAP_PX).toBe(40);
    expect(HEADER_ACCOUNT_RELEASE_GAP_PX).toBe(48);
  });

  it('needs the frame plus, on each side, gutter + gap + account', () => {
    expect(headerAccountLaneLayoutWidth(lane(SHORT))).toBeCloseTo(1637.6, 6);
    expect(headerAccountLaneLayoutWidth(lane(LONG))).toBeCloseTo(1833.6, 6);
    expect(headerAccountLaneLayoutWidth(lane(SHORT, 48))).toBeCloseTo(1653.6, 6);
  });

  it('leaves a comfortable width untouched', () => {
    expect(applicationScaleGeometry(1920, 1080, lane(SHORT)).scale).toBe(1);
    expect(applicationScaleGeometry(1700, 1000, lane(SHORT)).scale).toBe(1);
  });

  it.each([
    [1600, SHORT],
    [1486, SHORT],
    [1440, SHORT],
    [1382, SHORT],
    [1280, SHORT],
    [1600, 178],
    [1280, 136],
  ])('at %i px with a %i px account the smaller of the two scales wins', (width, account) => {
    const needed = headerAccountLaneLayoutWidth(lane(account));
    const geometry = applicationScaleGeometry(width, 900, lane(account));
    expect(geometry.scale).toBeCloseTo(Math.min(1, width / 1440, width / needed), 9);
    expect(geometry.scale).toBeCloseTo(width / needed, 9);
    // The lane then fits exactly: the layout width is what the header needs.
    expect(geometry.layoutWidth).toBeCloseTo(needed, 6);
  });

  it('reacts to the actual account width, not to a fixed breakpoint', () => {
    const short = applicationScaleGeometry(1600, 1000, lane(SHORT)).scale;
    const long = applicationScaleGeometry(1600, 1000, lane(178)).scale;
    expect(long).toBeLessThan(short);
  });

  it('lets the viewport rule decide when no account is shown', () => {
    expect(applicationScaleGeometry(1280, 800, lane(0)).scale).toBeCloseTo(1280 / 1440, 9);
    expect(applicationScaleGeometry(1600, 1000, lane(0)).scale).toBe(1);
  });

  it('reduces at once, grows back only past the release gap, and holds in between', () => {
    const at = (gap: number, width: number) =>
      width / headerAccountLaneLayoutWidth(lane(SHORT, gap));
    // First paint: exactly the safe gap.
    let scale = nextApplicationScaleGeometry(null, 1600, 1000, SHORT).scale;
    expect(scale).toBeCloseTo(at(40, 1600), 9);
    // A little wider: the 48 px release gap is not available yet — hold.
    expect(at(48, 1610)).toBeLessThan(scale);
    expect(nextApplicationScaleGeometry(scale, 1610, 1000, SHORT).scale).toBe(scale);
    // Wider: grow, but only as far as the release gap allows.
    scale = nextApplicationScaleGeometry(scale, 1640, 1000, SHORT).scale;
    expect(scale).toBeCloseTo(at(48, 1640), 9);
    // A little narrower: still clear of 40 px — hold.
    expect(nextApplicationScaleGeometry(scale, 1630, 1000, SHORT).scale).toBe(scale);
    // Past the safe gap: reduce at once, exactly to 40 px.
    expect(nextApplicationScaleGeometry(scale, 1590, 1000, SHORT).scale).toBeCloseTo(
      at(40, 1590),
      9,
    );
  });

  it('never oscillates when a window is dragged back and forth across the threshold', () => {
    let scale: number | null = null;
    const seen: number[] = [];
    for (const width of [1650, 1636, 1638, 1636, 1638, 1636, 1638, 1637]) {
      scale = nextApplicationScaleGeometry(scale, width, 1000, SHORT).scale;
      seen.push(scale);
    }
    expect(seen[0]).toBe(1);
    // One reduction at 1636 px, then the ±2 px jitter changes nothing.
    expect(new Set(seen.slice(1)).size).toBe(1);
  });
});

/**
 * OWNER 2026-09-12 — RESPONSIVE HANDOFF CORRECTION. The account yields before
 * the layout changes mode: 208 px at comfortable widths, narrowing with the
 * window down to 112 px; the desktop never paints below 2/3; the handoff is ONE
 * product breakpoint that no account moves.
 */
describe('the account yields before the layout changes mode', () => {
  const lane = (accountWidth: number) => ({ accountWidth, gap: HEADER_ACCOUNT_SAFE_GAP_PX });
  /** The authority's measurement, pessimistically: a quarter pixel of paint, rounded up. */
  const measured = (natural: number, width: number) => {
    const rendered = Math.min(natural, headerAccountWidthBudget(width));
    return rendered > 0 ? Math.ceil(rendered + 0.25) : 0;
  };

  it('keeps the account between its compact minimum and its ceiling', () => {
    expect(HEADER_ACCOUNT_MIN_WIDTH_PX).toBe(112);
    expect(HEADER_ACCOUNT_MAX_WIDTH_PX).toBe(208);
    expect(HEADER_ACCOUNT_FULL_WIDTH_VIEWPORT_PX).toBeCloseTo(1833.6, 6);
  });

  it('narrows the budget evenly from 208 px to 112 px at the handoff', () => {
    expect(headerAccountWidthBudget(2400)).toBe(208);
    expect(headerAccountWidthBudget(HEADER_ACCOUNT_FULL_WIDTH_VIEWPORT_PX)).toBeCloseTo(208, 9);
    expect(headerAccountWidthBudget(PRO_DESKTOP_MIN_WIDTH_PX)).toBe(112);
    expect(headerAccountWidthBudget(1600)).toBeCloseTo(177.6, 1);
    expect(headerAccountWidthBudget(1194)).toBeCloseTo(124.8, 1);
    expect(headerAccountWidthBudget(1180)).toBeCloseTo(122.9, 1);
    let previous = Infinity;
    for (let width = 2400; width >= PRO_DESKTOP_MIN_WIDTH_PX; width -= 3) {
      const budget = headerAccountWidthBudget(width);
      expect(budget).toBeLessThanOrEqual(previous);
      previous = budget;
    }
  });

  it('derives the handoff from the compact account at the 2/3 floor — no account decides it', () => {
    const compact = headerAccountLaneLayoutWidth(lane(HEADER_ACCOUNT_MIN_WIDTH_PX + 1));
    expect(APPLICATION_MIN_DESKTOP_SCALE * compact).toBeCloseTo(1095.7333, 3);
    expect(PRO_DESKTOP_MIN_WIDTH_PX).toBeGreaterThanOrEqual(
      APPLICATION_MIN_DESKTOP_SCALE * compact,
    );
    expect(PRO_DESKTOP_MIN_WIDTH_PX - 1).toBeLessThan(APPLICATION_MIN_DESKTOP_SCALE * compact);
  });

  it('keeps 2/3 and the 40 px lane for any account at any desktop width', () => {
    for (let width = PRO_DESKTOP_MIN_WIDTH_PX; width <= 2400; width += 7) {
      for (const natural of [0, 95, 110, 150, 208, 400]) {
        const account = measured(natural, width);
        const geometry = applicationScaleGeometry(width, 900, lane(account));
        expect(geometry.mode).toBe('desktop');
        expect(geometry.scale).toBeGreaterThanOrEqual(APPLICATION_MIN_DESKTOP_SCALE);
        // The floor never binds above the handoff: the lane truly fits.
        expect(geometry.layoutWidth + 1e-9).toBeGreaterThanOrEqual(
          headerAccountLaneLayoutWidth(lane(account)),
        );
      }
    }
  });

  it('keeps iPad landscape in the desktop composition whatever the account', () => {
    for (const width of [1180, 1194]) {
      for (const natural of [95, 110, 208, 400]) {
        const geometry = applicationScaleGeometry(width, 820, lane(measured(natural, width)));
        expect(geometry.mode).toBe('desktop');
        expect(geometry.scale).toBeGreaterThan(APPLICATION_MIN_DESKTOP_SCALE);
      }
    }
    expect(applicationScaleGeometry(1024, 768).mode).toBe('mobile');
  });

  it('lets a long address cost truncation before it costs the floor', () => {
    // Without a budget the 208 px ceiling alone would hold 1194 px at the floor.
    expect(applicationScaleGeometry(1194, 820, lane(208)).scale).toBe(
      APPLICATION_MIN_DESKTOP_SCALE,
    );
    // With it the address yields to ~125 px and the application keeps ~0.716.
    const account = measured(400, 1194);
    expect(account).toBeLessThanOrEqual(126);
    const scale = applicationScaleGeometry(1194, 820, lane(account)).scale;
    expect(scale).toBeCloseTo(1194 / headerAccountLaneLayoutWidth(lane(account)), 9);
    expect(scale).toBeGreaterThan(0.71);
  });
});
