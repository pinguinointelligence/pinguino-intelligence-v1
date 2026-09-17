/**
 * Accounting dates are Madrid calendar days, whatever zone the browser is in.
 *
 * Every expected value below is written out by hand from the Europe/Madrid
 * calendar (CET = UTC+1, CEST = UTC+2 between the last Sundays of March and
 * October). None is computed by the code under test.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { holdEligibilityUtcMs } from '@/billing/domain/holdCalendar';
import { madridAccountingDay } from './accountingDate';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** Browser zones the dashboard must be right in: Madrid itself, UTC, west and east of it. */
const ZONES = ['Europe/Madrid', 'UTC', 'Europe/Lisbon', 'America/New_York', 'Asia/Tokyo'] as const;

const CASES: ReadonlyArray<readonly [instant: string, madridDay: string, why: string]> = [
  ['2026-11-30T23:00:00Z', '1.12.2026', 'September earnings become eligible at 00:00 Madrid on 1 December (CET)'],
  ['2026-03-28T23:00:00Z', '29.03.2026', 'midnight on the day summer time starts, still CET'],
  ['2026-03-29T22:00:00Z', '30.03.2026', 'first midnight in CEST: UTC+2'],
  ['2026-10-24T22:00:00Z', '25.10.2026', 'midnight on the day winter time returns, still CEST'],
  ['2026-10-25T23:00:00Z', '26.10.2026', 'first midnight back in CET'],
  ['2026-12-31T23:00:00Z', '1.01.2027', 'year boundary'],
  ['2028-02-28T23:00:00Z', '29.02.2028', 'leap day'],
  ['2026-12-01T15:30:00Z', '1.12.2026', 'afternoon in Madrid is already the next day in Tokyo'],
  ['2026-11-30T22:59:59Z', '30.11.2026', 'one second before the 1 December deadline'],
];

describe('madridAccountingDay', () => {
  for (const zone of ZONES) {
    for (const [instant, madridDay, why] of CASES) {
      it(`${instant} reads ${madridDay} with the browser in ${zone} (${why})`, () => {
        process.env.TZ = zone;
        expect(madridAccountingDay(instant)).toBe(madridDay);
      });
    }
  }

  it('reproduces the bug it replaces: the browser-zone formatter shows the deadline a day early west of Madrid', () => {
    process.env.TZ = 'Europe/Lisbon';
    expect(new Date('2026-11-30T23:00:00Z').toLocaleDateString('pl-PL')).toBe('30.11.2026');
    expect(madridAccountingDay('2026-11-30T23:00:00Z')).toBe('1.12.2026');
    process.env.TZ = 'Asia/Tokyo';
    expect(new Date('2026-12-01T15:30:00Z').toLocaleDateString('pl-PL')).toBe('2.12.2026');
    expect(madridAccountingDay('2026-12-01T15:30:00Z')).toBe('1.12.2026');
  });

  it('the hold rule and the display agree: a September commission is eligible on 1.12.2026', () => {
    process.env.TZ = 'America/New_York';
    const earned = Date.parse('2026-09-15T10:00:00Z');
    expect(new Date(holdEligibilityUtcMs(earned)).toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(madridAccountingDay(new Date(holdEligibilityUtcMs(earned)))).toBe('1.12.2026');
  });

  it('refuses anything that is not a date instead of printing "Invalid Date"', () => {
    for (const value of [null, undefined, '', 'not a date', 42, {}]) {
      expect(madridAccountingDay(value)).toBeNull();
    }
  });
});
