import { describe, expect, it } from 'vitest';
import { ALLOWED_ENGINE_FUNCTIONS } from './__fixtures__/allowedEngineFunctions';
import { ICE_ANCHOR_ROWS, ICE_TEMPERATURE_SLOPE_PER_C, type IceAnchorRow } from './config/iceAnchors';
import { estimateIceFraction, type IceFractionInput } from './iceFraction';
import * as engine from './index';

const milk = (npac: number | null, temperature_c = -11): IceFractionInput => ({
  npac,
  temperature_c,
  category: 'milk_gelato',
});

/** Band slope of the seeded −11 °C row: (45 − 54.5) / (42 − 33). */
const BAND_SLOPE = (45 - 54.5) / (42 - 33);

describe('seeded milk_gelato band @ −11 °C (spec §9)', () => {
  it('NPAC 33 → approximately 54.5 % ice', () => {
    expect(estimateIceFraction(milk(33))).toBeCloseTo(54.5, 9);
  });

  it('NPAC 42 → approximately 45 % ice', () => {
    expect(estimateIceFraction(milk(42))).toBeCloseTo(45, 9);
  });

  it('NPAC midpoint 37.5 interpolates linearly → 49.75', () => {
    expect(estimateIceFraction(milk(37.5))).toBeCloseTo(49.75, 9);
  });

  it('higher NPAC lowers the ice fraction (softer)', () => {
    expect(estimateIceFraction(milk(40))!).toBeLessThan(estimateIceFraction(milk(35))!);
  });

  it('lower NPAC raises the ice fraction (harder)', () => {
    expect(estimateIceFraction(milk(34))!).toBeGreaterThan(estimateIceFraction(milk(41))!);
  });
});

describe('outside the anchor band — finite extrapolation, clamped to [0, 100]', () => {
  it('just past the band continues the band slope (NPAC 43)', () => {
    expect(estimateIceFraction(milk(43))).toBeCloseTo(45 + BAND_SLOPE, 9); // ≈ 43.944
  });

  it('far below and far above the band stay finite within [0, 100]', () => {
    for (const npac of [0, 10, 80, 200]) {
      const ice = estimateIceFraction(milk(npac));
      expect(ice).not.toBeNull();
      expect(Number.isFinite(ice!)).toBe(true);
      expect(ice!).toBeGreaterThanOrEqual(0);
      expect(ice!).toBeLessThanOrEqual(100);
    }
  });

  it('extreme NPAC clamps to the physical floor of 0', () => {
    expect(estimateIceFraction(milk(200))).toBe(0);
  });
});

describe('seeded milk_gelato bands @ −12 / −13 °C (CONFIG 0.7.0 — approved G15/G17, G11/G18)', () => {
  // −12: G15 (NPAC 44.98 → 50.35), G17 (NPAC 46.18 → 50.34) — exact reproduction.
  it('−12: reproduces the approved clean anchors exactly (no temperature slope shift)', () => {
    expect(estimateIceFraction(milk(44.98, -12))).toBeCloseTo(50.35, 9);
    expect(estimateIceFraction(milk(46.18, -12))).toBeCloseTo(50.34, 9);
  });

  // −13: G11 (NPAC 51.77 → 49.73), G18 (NPAC 53.15 → 49.69) — exact reproduction.
  it('−13: reproduces the approved clean anchors exactly (no temperature slope shift)', () => {
    expect(estimateIceFraction(milk(51.77, -13))).toBeCloseTo(49.73, 9);
    expect(estimateIceFraction(milk(53.15, -13))).toBeCloseTo(49.69, 9);
  });

  it('−11 is untouched by the new rows — its own seeded anchors still hold', () => {
    expect(estimateIceFraction(milk(33, -11))).toBeCloseTo(54.5, 9);
    expect(estimateIceFraction(milk(42, -11))).toBeCloseTo(45, 9);
    expect(estimateIceFraction(milk(37.5, -11))).toBeCloseTo(49.75, 9);
  });

  it('a −12 recipe near the band stays inside the −12 ice band [46,54] (joint satisfiability)', () => {
    // Across the whole −12 NPAC band [42,50], ice stays ≈ the approved clean level.
    for (const npac of [42, 44, 46, 48, 50]) {
      const ice = estimateIceFraction(milk(npac, -12))!;
      expect(ice).toBeGreaterThanOrEqual(46);
      expect(ice).toBeLessThanOrEqual(54);
    }
  });

  it('a −13 recipe across the band stays inside the −13 ice band [46,52] (joint satisfiability)', () => {
    for (const npac of [48, 50, 52, 54, 55]) {
      const ice = estimateIceFraction(milk(npac, -13))!;
      expect(ice).toBeGreaterThanOrEqual(46);
      expect(ice).toBeLessThanOrEqual(52);
    }
  });
});

describe('temperature awareness (slope fallback for NON-seeded temperatures)', () => {
  // −14 has no seeded row → nearest seeded is −13; the −13 estimate then shifts by
  // (row.temperature − target) × slope = (−13 − −14) × 2 = +2 ice.
  it('a colder non-seeded temperature (−14) shifts the nearest seeded (−13) row by +slope', () => {
    const at13 = estimateIceFraction(milk(51.77, -13))!; // exactly 49.73
    expect(estimateIceFraction(milk(51.77, -14))).toBeCloseTo(at13 + ICE_TEMPERATURE_SLOPE_PER_C, 9);
  });

  it('a warmer non-seeded temperature (−8) shifts the nearest seeded (−11) row by −slope', () => {
    const at11 = estimateIceFraction(milk(37.5, -11))!; // 49.75
    expect(estimateIceFraction(milk(37.5, -8))).toBeCloseTo(at11 - 3 * ICE_TEMPERATURE_SLOPE_PER_C, 9);
  });

  it('colder ⇒ more ice for non-seeded temperatures below the seeded range', () => {
    const at = (t: number) => estimateIceFraction(milk(51.77, t))!;
    expect(at(-18)).toBeGreaterThan(at(-16));
    expect(at(-16)).toBeGreaterThan(at(-14));
  });

  it('the temperature slope is configurable (calibration what-ifs)', () => {
    const at13 = estimateIceFraction(milk(51.77, -13))!;
    expect(estimateIceFraction(milk(51.77, -14), { temperature_slope: 3 })).toBeCloseTo(at13 + 3, 9);
  });

  it('temperature at or above 0 °C → 0 ice', () => {
    expect(estimateIceFraction(milk(37.5, 0))).toBe(0);
    expect(estimateIceFraction(milk(37.5, 4))).toBe(0);
  });
});

describe('category awareness', () => {
  const sorbetRow: IceAnchorRow = {
    category: 'sorbet',
    temperature_c: -11,
    npac_low: 30,
    ice_at_npac_low: 60,
    npac_high: 40,
    ice_at_npac_high: 50,
    status: 'estimated', // test-only row — NOT real calibration data
  };
  const milkRow = ICE_ANCHOR_ROWS[0]!;

  it('filters anchors by category when category rows exist', () => {
    const anchors = [milkRow, sorbetRow];
    const sorbet = estimateIceFraction(
      { npac: 35, temperature_c: -11, category: 'sorbet' },
      { anchors },
    );
    const milkResult = estimateIceFraction(
      { npac: 37.5, temperature_c: -11, category: 'milk_gelato' },
      { anchors },
    );
    expect(sorbet).toBeCloseTo(55, 9); // 60 + 5 × (−1.0) from the sorbet band
    expect(milkResult).toBeCloseTo(49.75, 9); // milk band untouched
  });

  it('unseeded category falls back to milk_gelato rows (calibration-pending fallback)', () => {
    const viaSorbet = estimateIceFraction({ npac: 37.5, temperature_c: -11, category: 'sorbet' });
    expect(viaSorbet).toBeCloseTo(estimateIceFraction(milk(37.5))!, 12);
  });

  it('returns null when neither category nor milk_gelato rows exist', () => {
    const fruitOnly: IceAnchorRow[] = [{ ...sorbetRow, category: 'fruit_gelato' }];
    expect(
      estimateIceFraction(
        { npac: 35, temperature_c: -11, category: 'sorbet' },
        { anchors: fruitOnly },
      ),
    ).toBeNull();
  });

  it('no fake anchors are invented — exactly three seeded milk_gelato rows, all approved-sourced', () => {
    // Every seeded row carries a traceable provenance and covers milk_gelato only.
    expect(ICE_ANCHOR_ROWS).toHaveLength(3);
    for (const row of ICE_ANCHOR_ROWS) {
      expect(row.category).toBe('milk_gelato');
      expect(row.status).toBe('seeded');
      expect(typeof row.source).toBe('string');
    }
    expect(ICE_ANCHOR_ROWS.map((r) => r.temperature_c)).toEqual([-11, -12, -13]);
    // −11 verbatim from the locked spec (unchanged).
    expect(ICE_ANCHOR_ROWS[0]).toMatchObject({
      temperature_c: -11,
      npac_low: 33,
      ice_at_npac_low: 54.5,
      npac_high: 42,
      ice_at_npac_high: 45,
    });
    // −12 = the exact G15/G17 clean-anchor coordinates.
    expect(ICE_ANCHOR_ROWS[1]).toMatchObject({
      temperature_c: -12,
      npac_low: 44.98,
      ice_at_npac_low: 50.35,
      npac_high: 46.18,
      ice_at_npac_high: 50.34,
      source: 'golden_fixtures:G15,G17',
    });
    // −13 = the exact G11/G18 clean-anchor coordinates.
    expect(ICE_ANCHOR_ROWS[2]).toMatchObject({
      temperature_c: -13,
      npac_low: 51.77,
      ice_at_npac_low: 49.73,
      npac_high: 53.15,
      ice_at_npac_high: 49.69,
      source: 'golden_fixtures:G11,G18',
    });
  });
});

describe('safety', () => {
  it('invalid NPAC values return null', () => {
    expect(estimateIceFraction(milk(null))).toBeNull();
    expect(estimateIceFraction(milk(Number.NaN))).toBeNull();
    expect(estimateIceFraction(milk(-5))).toBeNull();
  });

  it('invalid temperature returns null', () => {
    expect(estimateIceFraction(milk(37.5, Number.NaN))).toBeNull();
  });

  it('empty anchor list returns null', () => {
    expect(estimateIceFraction(milk(37.5), { anchors: [] })).toBeNull();
  });

  it('is deterministic — same input gives same output', () => {
    expect(estimateIceFraction(milk(37.5, -14))).toBe(estimateIceFraction(milk(37.5, -14)));
  });

  it('does not mutate input or anchor objects', () => {
    const input = milk(37.5, -14);
    const anchors = [{ ...ICE_ANCHOR_ROWS[0]! }];
    const inputSnapshot = JSON.parse(JSON.stringify(input)) as unknown;
    const anchorsSnapshot = JSON.parse(JSON.stringify(anchors)) as unknown;
    estimateIceFraction(input, { anchors });
    expect(input).toEqual(inputSnapshot);
    expect(anchors).toEqual(anchorsSnapshot);
  });
});

describe('scope guard (no scoring/corrections yet)', () => {
  it('creates no scoring/correction functions', () => {
    const allowed = new Set(ALLOWED_ENGINE_FUNCTIONS);
    const extraFunctions = Object.entries(engine)
      .filter(([name, value]) => typeof value === 'function' && !allowed.has(name))
      .map(([name]) => name);
    expect(extraFunctions).toEqual([]);
  });
});
