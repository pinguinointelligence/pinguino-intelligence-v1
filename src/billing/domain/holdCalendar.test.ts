/**
 * Module 4 tests — holdCalendar (Europe/Madrid).
 * Pins H1 (M → 1st of M+3), H2 (calendar arithmetic, never 60 days),
 * H3 (Madrid month membership from UTC instants), H4 (UTC instant of Madrid
 * midnight, DST both directions, leap years, year boundary).
 */

import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TIMEZONE,
  HOLD_ELIGIBILITY_MONTH_OFFSET,
  InvalidMonthKeyError,
  addMonths,
  holdEligibilityMonthKey,
  holdEligibilityUtcMs,
  madridMidnightUtcMs,
  madridMonthStartUtcMs,
  madridOffsetMs,
  madridWallClock,
  monthKeyMadrid,
  parseMonthKey,
} from './holdCalendar';
import { BillingDomainError, InvalidTimestampError } from './types';

describe('holdCalendar constants', () => {
  it('business timezone is Europe/Madrid', () => {
    expect(BUSINESS_TIMEZONE).toBe('Europe/Madrid');
  });

  it('H1: hold offset is exactly 3 calendar months (two FULL months in between)', () => {
    expect(HOLD_ELIGIBILITY_MONTH_OFFSET).toBe(3);
  });
});

describe('monthKeyMadrid (H3)', () => {
  it('plain mid-month instant', () => {
    expect(monthKeyMadrid(Date.UTC(2026, 0, 15, 12, 0, 0))).toBe('2026-01');
  });

  it('H3 locked example: 2026-03-31T22:30:00Z is April 1st 00:30 in Madrid (CEST)', () => {
    expect(monthKeyMadrid(Date.UTC(2026, 2, 31, 22, 30, 0))).toBe('2026-04');
  });

  it('edge instant 2026-03-31T21:59:59.999Z is still March 31 23:59 Madrid', () => {
    expect(monthKeyMadrid(Date.UTC(2026, 2, 31, 21, 59, 59, 999))).toBe('2026-03');
  });

  it('year boundary: 2026-12-31T23:30:00Z is Jan 1st 00:30 Madrid (CET) → 2027-01', () => {
    expect(monthKeyMadrid(Date.UTC(2026, 11, 31, 23, 30, 0))).toBe('2027-01');
  });

  it('winter month boundary: 2026-01-31T23:30:00Z is Feb 1st Madrid (CET)', () => {
    expect(monthKeyMadrid(Date.UTC(2026, 0, 31, 23, 30, 0))).toBe('2026-02');
  });

  it('exactly at Madrid month start belongs to the new month', () => {
    const madridFeb1 = madridMonthStartUtcMs('2026-02');
    expect(monthKeyMadrid(madridFeb1)).toBe('2026-02');
    expect(monthKeyMadrid(madridFeb1 - 1)).toBe('2026-01');
  });

  it('leap day 2028-02-29 stays in February', () => {
    expect(monthKeyMadrid(Date.UTC(2028, 1, 29, 12, 0, 0))).toBe('2028-02');
  });

  it('rejects non-integer timestamps', () => {
    expect(() => monthKeyMadrid(Number.NaN)).toThrow(InvalidTimestampError);
    expect(() => monthKeyMadrid(1.5)).toThrow(InvalidTimestampError);
  });
});

describe('madridWallClock / madridOffsetMs (H3/H4 DST)', () => {
  it('CET winter offset is +1h', () => {
    expect(madridOffsetMs(Date.UTC(2026, 0, 15, 12, 0, 0))).toBe(3_600_000);
  });

  it('CEST summer offset is +2h', () => {
    expect(madridOffsetMs(Date.UTC(2026, 6, 15, 12, 0, 0))).toBe(7_200_000);
  });

  it('spring-forward instant: 2026-03-29T01:30:00Z reads 03:30 Madrid (CEST)', () => {
    const wall = madridWallClock(Date.UTC(2026, 2, 29, 1, 30, 0));
    expect(wall).toMatchObject({ year: 2026, month: 3, day: 29, hour: 3, minute: 30 });
  });

  it('just before spring-forward: 2026-03-29T00:59:00Z reads 01:59 Madrid (CET)', () => {
    const wall = madridWallClock(Date.UTC(2026, 2, 29, 0, 59, 0));
    expect(wall).toMatchObject({ year: 2026, month: 3, day: 29, hour: 1, minute: 59 });
  });

  it('fall-back instant: 2026-10-25T00:30:00Z reads 02:30 Madrid (still CEST)', () => {
    const wall = madridWallClock(Date.UTC(2026, 9, 25, 0, 30, 0));
    expect(wall).toMatchObject({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 });
  });

  it('after fall-back: 2026-10-25T02:30:00Z reads 03:30 Madrid (CET)', () => {
    const wall = madridWallClock(Date.UTC(2026, 9, 25, 2, 30, 0));
    expect(wall).toMatchObject({ year: 2026, month: 10, day: 25, hour: 3, minute: 30 });
  });
});

describe('parseMonthKey / addMonths (H2 calendar arithmetic)', () => {
  it('parses a valid key', () => {
    expect(parseMonthKey('2026-07')).toEqual({ year: 2026, month: 7 });
  });

  it.each(['2026-13', '2026-00', '202-01', '2026-1', '2026/01', ''])(
    'rejects malformed key %s',
    (bad) => {
      expect(() => parseMonthKey(bad)).toThrow(InvalidMonthKeyError);
    },
  );

  it('adds months within a year', () => {
    expect(addMonths('2026-01', 3)).toBe('2026-04');
  });

  it('wraps across the year boundary', () => {
    expect(addMonths('2026-12', 3)).toBe('2027-03');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
  });

  it('supports negative offsets', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('rejects non-integer offsets', () => {
    expect(() => addMonths('2026-01', 1.5)).toThrow(BillingDomainError);
  });
});

describe('madridMidnightUtcMs (H4)', () => {
  it('CEST month start: Madrid 2026-04-01 00:00 = 2026-03-31T22:00:00Z', () => {
    expect(madridMidnightUtcMs(2026, 4, 1)).toBe(Date.UTC(2026, 2, 31, 22, 0, 0));
  });

  it('CET month start: Madrid 2026-01-01 00:00 = 2025-12-31T23:00:00Z', () => {
    expect(madridMidnightUtcMs(2026, 1, 1)).toBe(Date.UTC(2025, 11, 31, 23, 0, 0));
  });

  it('Madrid 2026-03-01 00:00 = 2026-02-28T23:00:00Z (non-leap February)', () => {
    expect(madridMidnightUtcMs(2026, 3, 1)).toBe(Date.UTC(2026, 1, 28, 23, 0, 0));
  });

  it('leap year: Madrid 2028-03-01 00:00 = 2028-02-29T23:00:00Z', () => {
    expect(madridMidnightUtcMs(2028, 3, 1)).toBe(Date.UTC(2028, 1, 29, 23, 0, 0));
  });

  it('midnight on the spring-forward day itself resolves (2026-03-29, CET)', () => {
    // DST switches at 02:00 local; 00:00 local exists and is CET (+1).
    expect(madridMidnightUtcMs(2026, 3, 29)).toBe(Date.UTC(2026, 2, 28, 23, 0, 0));
  });

  it('midnight on the fall-back day itself resolves (2026-10-25, CEST)', () => {
    // DST switches at 03:00 local; 00:00 local exists and is CEST (+2).
    expect(madridMidnightUtcMs(2026, 10, 25)).toBe(Date.UTC(2026, 9, 24, 22, 0, 0));
  });

  it.each([
    [2026, 0, 1],
    [2026, 13, 1],
    [2026, 4, 0],
    [2026, 4, 32],
  ])('rejects invalid calendar date %s-%s-%s', (y, m, d) => {
    expect(() => madridMidnightUtcMs(y, m, d)).toThrow(BillingDomainError);
  });

  it('madridMonthStartUtcMs delegates to day 1', () => {
    expect(madridMonthStartUtcMs('2026-04')).toBe(madridMidnightUtcMs(2026, 4, 1));
  });
});

describe('holdEligibilityUtcMs (H1+H3+H4)', () => {
  it('H1: January earning → eligible April 1 Madrid midnight (CEST)', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2026, 0, 15, 12, 0, 0))).toBe(Date.UTC(2026, 2, 31, 22, 0, 0));
  });

  it('H1: February earning → eligible May 1 Madrid midnight', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2026, 1, 10, 10, 0, 0))).toBe(Date.UTC(2026, 3, 30, 22, 0, 0));
  });

  it('H1: December earning → eligible March 1 of the NEXT year (CET)', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2025, 11, 5, 0, 0, 0))).toBe(Date.UTC(2026, 1, 28, 23, 0, 0));
  });

  it('leap year landing: December 2027 earning → March 1 2028 = 2028-02-29T23:00:00Z', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2027, 11, 20, 8, 0, 0))).toBe(Date.UTC(2028, 1, 29, 23, 0, 0));
  });

  it('H3 locked example: 2026-03-31T22:30:00Z (April 1 00:30 Madrid) → eligible July 1', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2026, 2, 31, 22, 30, 0))).toBe(Date.UTC(2026, 5, 30, 22, 0, 0));
  });

  it('contrast: 2026-03-31T21:59:59.999Z is still March in Madrid → eligible June 1', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2026, 2, 31, 21, 59, 59, 999))).toBe(Date.UTC(2026, 4, 31, 22, 0, 0));
  });

  it('DST fall-back month: October 2026 earning → eligible January 1 2027 (CET)', () => {
    expect(holdEligibilityUtcMs(Date.UTC(2026, 9, 25, 0, 30, 0))).toBe(Date.UTC(2026, 11, 31, 23, 0, 0));
  });

  it('H2: first and last instant of the same Madrid month share ONE eligibility instant', () => {
    const jan1 = madridMonthStartUtcMs('2026-01');
    const jan31LateMadrid = madridMonthStartUtcMs('2026-02') - 1;
    expect(holdEligibilityUtcMs(jan1)).toBe(holdEligibilityUtcMs(jan31LateMadrid));
    expect(holdEligibilityUtcMs(jan1)).toBe(Date.UTC(2026, 2, 31, 22, 0, 0));
  });

  it('H2: hold is NOT a fixed 60-day duration (varies with calendar position)', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const earnedJan1 = madridMonthStartUtcMs('2026-01');
    const earnedJan31 = madridMonthStartUtcMs('2026-02') - dayMs;
    const holdFromJan1 = holdEligibilityUtcMs(earnedJan1) - earnedJan1;
    const holdFromJan31 = holdEligibilityUtcMs(earnedJan31) - earnedJan31;
    expect(holdFromJan1).not.toBe(holdFromJan31);
    expect(holdFromJan1).toBeGreaterThan(60 * dayMs);
  });

  it('holdEligibilityMonthKey returns the eligibility month', () => {
    expect(holdEligibilityMonthKey(Date.UTC(2026, 0, 15))).toBe('2026-04');
    expect(holdEligibilityMonthKey(Date.UTC(2026, 2, 31, 22, 30, 0))).toBe('2026-07');
    expect(holdEligibilityMonthKey(Date.UTC(2025, 11, 5))).toBe('2026-03');
  });

  it('rejects invalid timestamps', () => {
    expect(() => holdEligibilityUtcMs(Number.NaN)).toThrow(InvalidTimestampError);
    expect(() => holdEligibilityMonthKey(0.5)).toThrow(InvalidTimestampError);
  });

  it('deterministic: repeated calls return identical results', () => {
    const input = Date.UTC(2026, 2, 31, 22, 30, 0);
    expect(holdEligibilityUtcMs(input)).toBe(holdEligibilityUtcMs(input));
  });
});
