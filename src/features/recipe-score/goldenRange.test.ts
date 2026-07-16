/**
 * recipe-score — Złoty Zakres presentation contract tests (SPEC §15.3, §21.1).
 * The 5-state vocabulary (each state carries text), both existing band shapes,
 * engine-grounded geometry, the anti red–green–red rule, and purity.
 */
import { describe, expect, it } from 'vitest';
import { IDEAL_ZONE_FRACTION, STATUS_SCORES } from '@/engine';
import type { IndicatorStatus, TargetRange } from '@/engine';
import {
  AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS,
  GOLDEN_RANGE_SEVERITY,
  GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS,
  GOLDEN_RANGE_STATE_TEXT,
  bandPosition,
  bandStateForIndicatorStatus,
  type GoldenRangeState,
} from './goldenRange';

/** A representative band in BOTH existing shapes (values arbitrary — the contract
 * never hardcodes real band data, and neither do these tests). */
const TUPLE_BAND: readonly [number, number] = [30, 40];
const RANGE_BAND: TargetRange = { min: 30, max: 40 };

describe('golden range — the §15.3 five-state vocabulary', () => {
  it('has exactly the five states, each with a non-empty Polish text and unique key', () => {
    const states = Object.keys(GOLDEN_RANGE_STATE_TEXT).sort();
    expect(states).toEqual(['amber', 'golden', 'info', 'neutral', 'red']);
    const keys = new Set<string>();
    for (const [state, vocab] of Object.entries(GOLDEN_RANGE_STATE_TEXT)) {
      expect(vocab.state).toBe(state);
      expect(vocab.text.length).toBeGreaterThan(0);
      expect(vocab.textKey).toBe(`golden-range.state.${state}`);
      keys.add(vocab.textKey);
    }
    expect(keys.size).toBe(5);
  });

  it('is a neutral scale — no green state, no percentage in any state text', () => {
    for (const vocab of Object.values(GOLDEN_RANGE_STATE_TEXT)) {
      expect(vocab.text).not.toContain('%');
      expect(vocab.text).not.toMatch(/procent/i);
    }
    expect(Object.keys(GOLDEN_RANGE_STATE_TEXT)).not.toContain('green');
    expect(JSON.stringify(GOLDEN_RANGE_STATE_TEXT)).not.toMatch(/zielon|green/i);
  });

  it('every reading carries the state text — never color-only (§15.3)', () => {
    const samples = [
      bandPosition(35, TUPLE_BAND),
      bandPosition(29, TUPLE_BAND),
      bandPosition(2, TUPLE_BAND),
      bandPosition(null, TUPLE_BAND),
      bandStateForIndicatorStatus('ideal'),
    ];
    for (const reading of samples) {
      expect(reading.text).toBe(GOLDEN_RANGE_STATE_TEXT[reading.state].text);
      expect(reading.textKey).toBe(GOLDEN_RANGE_STATE_TEXT[reading.state].textKey);
      expect(reading.text.length).toBeGreaterThan(0);
    }
  });
});

describe('bandPosition — accepts BOTH existing band shapes (no new band type)', () => {
  it('tuple bands (temperatureAwareTargetBands / pi-monitor) and TargetRange agree', () => {
    for (const value of [24, 25, 29.9, 30, 32, 35, 38, 40, 40.1, 45, 46, 60]) {
      const fromTuple = bandPosition(value, TUPLE_BAND);
      const fromRange = bandPosition(value, RANGE_BAND);
      expect(fromTuple).toEqual(fromRange);
    }
  });
});

describe('bandPosition — engine-grounded geometry', () => {
  // band [30, 40]: center 35, halfWidth 5, ideal zone = center ± IDEAL_ZONE_FRACTION·halfWidth
  const idealEdge = 35 + IDEAL_ZONE_FRACTION * 5;

  it('golden for the optimum ZONE — a range, not a single magic point (§15.3)', () => {
    expect(bandPosition(35, TUPLE_BAND).state).toBe('golden');
    expect(bandPosition(33, TUPLE_BAND).state).toBe('golden');
    expect(bandPosition(idealEdge, TUPLE_BAND).state).toBe('golden'); // inclusive edge — a zone
    expect(bandPosition(35, TUPLE_BAND).side).toBe('inside');
  });

  it('info for correct in-band values outside the ideal zone (gold is optimum-only, §21.1)', () => {
    expect(bandPosition(idealEdge + 0.01, TUPLE_BAND).state).toBe('info');
    expect(bandPosition(30, TUPLE_BAND).state).toBe('info');
    expect(bandPosition(40, TUPLE_BAND).state).toBe('info');
    expect(bandPosition(30, TUPLE_BAND).side).toBe('inside');
  });

  it('amber within one half-width beyond the edge („blisko" — needs attention)', () => {
    expect(bandPosition(29, TUPLE_BAND)).toMatchObject({ state: 'amber', side: 'below' });
    expect(bandPosition(41, TUPLE_BAND)).toMatchObject({ state: 'amber', side: 'above' });
    // boundary: exactly AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS half-widths out is still amber
    expect(bandPosition(30 - 5 * AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS, TUPLE_BAND).state).toBe('amber');
    expect(bandPosition(40 + 5 * AMBER_OVERSHOOT_LIMIT_HALF_WIDTHS, TUPLE_BAND).state).toBe('amber');
  });

  it('red beyond the amber margin („za mało / za dużo" — a real problem)', () => {
    expect(bandPosition(24.99, TUPLE_BAND)).toMatchObject({ state: 'red', side: 'below' });
    expect(bandPosition(45.01, TUPLE_BAND)).toMatchObject({ state: 'red', side: 'above' });
  });

  it('NO red–green–red: symmetric deviations below/above present the SAME state', () => {
    for (const delta of [0.5, 2, 4.99, 5, 5.01, 12]) {
      const below = bandPosition(30 - delta, TUPLE_BAND);
      const above = bandPosition(40 + delta, TUPLE_BAND);
      expect(below.state).toBe(above.state);
    }
  });

  it('severity never decreases as the value moves away from the center', () => {
    for (const direction of [1, -1]) {
      let previous = -1;
      for (let step = 0; step <= 200; step++) {
        const value = 35 + direction * (step * 0.1);
        const { state } = bandPosition(value, TUPLE_BAND);
        const severity = GOLDEN_RANGE_SEVERITY[state];
        expect(severity).toBeGreaterThanOrEqual(previous);
        previous = severity;
      }
    }
  });

  it('neutral for missing values and unusable bands — honest „Brak oceny"', () => {
    expect(bandPosition(null, TUPLE_BAND).state).toBe('neutral');
    expect(bandPosition(undefined, TUPLE_BAND).state).toBe('neutral');
    expect(bandPosition(Number.NaN, TUPLE_BAND).state).toBe('neutral');
    expect(bandPosition(Infinity, TUPLE_BAND).state).toBe('neutral');
    expect(bandPosition(35, null).state).toBe('neutral');
    expect(bandPosition(35, undefined).state).toBe('neutral');
    expect(bandPosition(35, [40, 30]).state).toBe('neutral'); // inverted band
    expect(bandPosition(35, { min: Number.NaN, max: 40 }).state).toBe('neutral');
    expect(bandPosition(null, TUPLE_BAND).side).toBeNull();
    expect(bandPosition(null, TUPLE_BAND).text).toBe('Brak oceny');
  });

  it('honors TargetRange warn thresholds ahead of the band check (engine order)', () => {
    const warned: TargetRange = { min: 30, max: 40, warn_above: 42, warn_below: 27 };
    expect(bandPosition(41.9, warned).state).toBe('amber'); // out of band, warn not crossed
    expect(bandPosition(42.1, warned).state).toBe('red'); // warn crossed → red immediately
    expect(bandPosition(26.9, warned).state).toBe('red');
    expect(bandPosition(28, warned).state).toBe('amber');
  });

  it("one-sided 'safe' directions present as INFO — a risk metric below band is fine", () => {
    const options = { direction: { below: 'safe' as const } };
    expect(bandPosition(2, TUPLE_BAND, options)).toMatchObject({ state: 'info', side: 'below' });
    expect(bandPosition(60, TUPLE_BAND, options).state).toBe('red'); // above stays a deviation
    const warnedSafe: TargetRange = { min: 30, max: 40, warn_below: 27 };
    expect(bandPosition(20, warnedSafe, options).state).toBe('info'); // safe wins over warn too
  });

  it('degenerate single-point band: inside → info, outside → amber (no distance unit)', () => {
    expect(bandPosition(35, [35, 35]).state).toBe('info');
    expect(bandPosition(36, [35, 35]).state).toBe('amber');
    expect(bandPosition(1, [35, 35]).state).toBe('amber');
  });

  it('never mutates the band input (both shapes, frozen)', () => {
    const tuple = Object.freeze([30, 40] as const);
    const range = Object.freeze({ min: 30, max: 40, warn_above: 45 });
    expect(() => bandPosition(50, tuple)).not.toThrow();
    expect(() => bandPosition(50, range)).not.toThrow();
    expect(tuple).toEqual([30, 40]);
    expect(range).toEqual({ min: 30, max: 40, warn_above: 45 });
  });
});

describe('bandStateForIndicatorStatus — consistent with the engine status vocabulary', () => {
  it('maps every engine status onto the five-state vocabulary', () => {
    expect(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.ideal).toBe('golden');
    expect(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.premium).toBe('golden');
    expect(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.good).toBe('info');
    expect(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.risky).toBe('amber');
    expect(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.too_expensive).toBe('amber');
    for (const status of ['too_soft', 'too_hard', 'too_sweet', 'too_weak', 'needs_correction'] as const) {
      expect(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS[status]).toBe('red');
    }
  });

  it('is monotone against the engine own status severity (STATUS_SCORES)', () => {
    const statuses = Object.keys(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS) as IndicatorStatus[];
    for (const a of statuses) {
      for (const b of statuses) {
        if (STATUS_SCORES[a] > STATUS_SCORES[b]) {
          const severityA = GOLDEN_RANGE_SEVERITY[GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS[a]];
          const severityB = GOLDEN_RANGE_SEVERITY[GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS[b]];
          expect(severityA, `${a} scored above ${b} but presents worse`).toBeLessThanOrEqual(severityB);
        }
      }
    }
  });

  it('returns a full reading with text for every status', () => {
    const statuses = Object.keys(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS) as IndicatorStatus[];
    for (const status of statuses) {
      const reading = bandStateForIndicatorStatus(status);
      expect(reading.text.length).toBeGreaterThan(0);
      expect(reading.side).toBeNull();
      expect(GOLDEN_RANGE_STATE_TEXT[reading.state].textKey).toBe(reading.textKey);
    }
  });
});

describe('golden range — geometric and status mappings agree', () => {
  it('geometry mirrors the engine ideal/good split at the same fraction', () => {
    // in-band, inside ideal zone ↔ engine 'ideal' → both golden
    expect(bandPosition(35, TUPLE_BAND).state).toBe(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.ideal);
    // in-band, outside ideal zone ↔ engine 'good' → both info
    expect(bandPosition(40, TUPLE_BAND).state).toBe(GOLDEN_RANGE_STATE_BY_INDICATOR_STATUS.good);
  });

  it('exposes the states as the exact literal union expected by future Monitors', () => {
    const states: GoldenRangeState[] = ['neutral', 'info', 'golden', 'amber', 'red'];
    for (const state of states) {
      expect(GOLDEN_RANGE_STATE_TEXT[state]).toBeDefined();
    }
  });
});
