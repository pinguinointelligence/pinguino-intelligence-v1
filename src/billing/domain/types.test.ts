/**
 * Shared domain primitives — integer-cents guards and round-half-up division
 * (locked architecture decision #2: integer cents, documented rounding).
 */

import { describe, expect, it } from 'vitest';
import {
  assertIntegerCents,
  assertUtcMs,
  divideRoundHalfUp,
  InvalidCentsError,
  InvalidTimestampError,
} from './types';

describe('divideRoundHalfUp', () => {
  it('rounds exact halves up', () => {
    expect(divideRoundHalfUp(5, 2)).toBe(3); // 2.5 → 3
    expect(divideRoundHalfUp(1, 2)).toBe(1); // 0.5 → 1
  });

  it('rounds below-half down and above-half up', () => {
    expect(divideRoundHalfUp(7, 3)).toBe(2); // 2.33 → 2
    expect(divideRoundHalfUp(8, 3)).toBe(3); // 2.67 → 3
  });

  it('exact division stays exact', () => {
    expect(divideRoundHalfUp(900, 2)).toBe(450);
    expect(divideRoundHalfUp(0, 7)).toBe(0);
  });

  it('uses pure integer arithmetic (no float drift on large cents)', () => {
    // 4900 × 490000 = 2,401,000,000 — safely inside Number range, exact.
    expect(divideRoundHalfUp(4900 * 490000, 490000)).toBe(4900);
  });

  it('rejects negative numerators, non-integers and non-positive denominators', () => {
    expect(() => divideRoundHalfUp(-1, 2)).toThrow(InvalidCentsError);
    expect(() => divideRoundHalfUp(1.5, 2)).toThrow(InvalidCentsError);
    expect(() => divideRoundHalfUp(1, 0)).toThrow(InvalidCentsError);
    expect(() => divideRoundHalfUp(1, -2)).toThrow(InvalidCentsError);
  });
});

describe('integer-cents and timestamp guards', () => {
  it('assertIntegerCents accepts integers and rejects floats/negatives by default', () => {
    expect(() => assertIntegerCents(199, 'test')).not.toThrow();
    expect(() => assertIntegerCents(0, 'test')).not.toThrow();
    expect(() => assertIntegerCents(1.99, 'test')).toThrow(InvalidCentsError);
    expect(() => assertIntegerCents(-1, 'test')).toThrow(InvalidCentsError);
    expect(() => assertIntegerCents(-1, 'test', true)).not.toThrow();
    expect(() => assertIntegerCents(Number.NaN, 'test', true)).toThrow(InvalidCentsError);
  });

  it('assertUtcMs rejects NaN, infinities and fractional milliseconds', () => {
    expect(() => assertUtcMs(Date.UTC(2026, 0, 1), 'test')).not.toThrow();
    expect(() => assertUtcMs(Number.NaN, 'test')).toThrow(InvalidTimestampError);
    expect(() => assertUtcMs(Number.POSITIVE_INFINITY, 'test')).toThrow(InvalidTimestampError);
    expect(() => assertUtcMs(1.5, 'test')).toThrow(InvalidTimestampError);
  });
});
