import { describe, expect, it } from 'vitest';
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

describe('temperature awareness (calibration-pending slope fallback)', () => {
  it('colder serving temperature increases ice by slope × Δ°C (−14 → +6.0)', () => {
    expect(estimateIceFraction(milk(37.5, -14))).toBeCloseTo(
      49.75 + 3 * ICE_TEMPERATURE_SLOPE_PER_C,
      9,
    );
  });

  it('warmer serving temperature decreases ice (−8 → −6.0)', () => {
    expect(estimateIceFraction(milk(37.5, -8))).toBeCloseTo(
      49.75 - 3 * ICE_TEMPERATURE_SLOPE_PER_C,
      9,
    );
  });

  it('supports −12 and −18 with colder ⇒ more ice ordering', () => {
    const at = (t: number) => estimateIceFraction(milk(37.5, t))!;
    expect(at(-12)).toBeCloseTo(51.75, 9);
    expect(at(-18)).toBeCloseTo(63.75, 9);
    expect(at(-18)).toBeGreaterThan(at(-14));
    expect(at(-14)).toBeGreaterThan(at(-12));
    expect(at(-12)).toBeGreaterThan(at(-11));
    expect(at(-11)).toBeGreaterThan(at(-8));
  });

  it('the temperature slope is configurable (calibration what-ifs)', () => {
    expect(estimateIceFraction(milk(37.5, -14), { temperature_slope: 3 })).toBeCloseTo(
      49.75 + 9,
      9,
    );
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

  it('no fake anchors are invented — default config has exactly the one seeded row', () => {
    expect(ICE_ANCHOR_ROWS).toHaveLength(1);
    expect(ICE_ANCHOR_ROWS[0]).toEqual({
      category: 'milk_gelato',
      temperature_c: -11,
      npac_low: 33,
      ice_at_npac_low: 54.5,
      npac_high: 42,
      ice_at_npac_high: 45,
      status: 'seeded',
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
  const ALLOWED_FUNCTIONS = new Set([
    // composition (4C)
    'computeComponentGrams',
    'computeComponentTotals',
    'computeComposition',
    'computePercentages',
    'computeSugarBreakdown',
    'computeTotalBatchGrams',
    'resolveEffectiveItems',
    // POD (4D)
    'computeRecipePod',
    'ingredientPodContribution',
    // PAC/NPAC (4E)
    'computeRecipeNpac',
    'computeRecipePac',
    'ingredientNpacContribution',
    'ingredientPacContribution',
    'interpolateSyrupDeAnchors',
    // ice fraction (4F)
    'estimateIceFraction',
    // statuses (4G)
    'classifyIndicator',
    'classifyRecipeIndicators',
    'classifyValue',
    'computeLactoseSandinessRisk',
    'selectTargetBand',
  ]);

  it('creates no scoring/correction functions', () => {
    const extraFunctions = Object.entries(engine)
      .filter(([name, value]) => typeof value === 'function' && !ALLOWED_FUNCTIONS.has(name))
      .map(([name]) => name);
    expect(extraFunctions).toEqual([]);
  });
});
