/**
 * Module 4 — holdCalendar (Europe/Madrid business calendar).
 *
 * LOCKED RULES implemented here (cited as H1..H4 in code):
 *  H1  Two FULL calendar months hold: a commission earned at ANY instant inside
 *      Madrid month M becomes payout-eligible on the 1st of M+3 (Madrid):
 *      Jan → Apr 1, Feb → May 1, Dec → Mar 1 of the next year.
 *  H2  CALENDAR arithmetic only — never "60 days" or any fixed duration.
 *  H3  Month membership is resolved in the Europe/Madrid timezone from a UTC
 *      input instant (e.g. 2026-03-31T22:30:00Z is April 1st 00:30 in Madrid
 *      → April month → eligible July 1).
 *  H4  The returned eligibility instant is the UTC instant of MADRID MIDNIGHT
 *      on the eligibility date (DST-correct in both directions, leap years,
 *      year boundaries).
 *
 * Implementation uses Intl.DateTimeFormat with timeZone 'Europe/Madrid'
 * (available in Node 24) — no external dependencies, no Date.now() defaults:
 * timestamps are always inputs. All functions are pure and deterministic.
 */

import { BillingDomainError, assertUtcMs, type MonthKey, type UtcMs } from './types';

export const BUSINESS_TIMEZONE = 'Europe/Madrid' as const;

/**
 * H1: full-calendar-month hold expressed as a month offset. Earned in M →
 * eligible on the 1st of M+3 (two FULL months in between).
 */
export const HOLD_ELIGIBILITY_MONTH_OFFSET = 3 as const;

export class InvalidMonthKeyError extends BillingDomainError {
  constructor(value: unknown) {
    super('invalid_month_key', `expected month key 'YYYY-MM', got ${String(value)}`);
    this.name = 'InvalidMonthKeyError';
  }
}

/** Wall-clock parts of a UTC instant as seen in Europe/Madrid. */
export interface MadridWallClock {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number;
  readonly second: number;
}

// A single cached formatter: Intl.DateTimeFormat construction is expensive and
// the format is fixed, so this stays deterministic while keeping tests fast.
const madridPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** H3: resolve the Madrid wall-clock reading of a UTC instant via Intl. */
export function madridWallClock(utcMs: UtcMs): MadridWallClock {
  assertUtcMs(utcMs, 'madridWallClock.utcMs');
  const parts = madridPartsFormatter.formatToParts(new Date(utcMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) {
      throw new BillingDomainError('intl_parts_missing', `Intl part '${type}' missing`);
    }
    return Number(part.value);
  };
  // Intl may report midnight as hour 24 with hourCycle quirks; normalize.
  const rawHour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * H3: Madrid-calendar month key ('YYYY-MM') of a UTC instant.
 * Exposed for tier snapshots and payout batches (spec: monthKeyMadrid).
 */
export function monthKeyMadrid(utcMs: UtcMs): MonthKey {
  const wall = madridWallClock(utcMs);
  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}`;
}

/** Parse + validate a 'YYYY-MM' month key. */
export function parseMonthKey(monthKey: MonthKey): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new InvalidMonthKeyError(monthKey);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new InvalidMonthKeyError(monthKey);
  return { year, month };
}

/** H1/H2: add whole calendar months to a month key (calendar arithmetic only). */
export function addMonths(monthKey: MonthKey, monthsToAdd: number): MonthKey {
  if (!Number.isInteger(monthsToAdd)) {
    throw new BillingDomainError('invalid_month_offset', `monthsToAdd must be an integer, got ${String(monthsToAdd)}`);
  }
  const { year, month } = parseMonthKey(monthKey);
  const zeroBased = year * 12 + (month - 1) + monthsToAdd;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = (zeroBased - newYear * 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

/**
 * Milliseconds offset of Madrid wall time relative to UTC at a given instant
 * (+1h in CET, +2h in CEST). Derived purely from Intl output.
 */
export function madridOffsetMs(utcMs: UtcMs): number {
  const wall = madridWallClock(utcMs);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Truncate the input to whole seconds to compare like with like (formatter
  // has second granularity).
  const truncated = Math.floor(utcMs / 1000) * 1000;
  return wallAsUtc - truncated;
}

/**
 * H4: UTC instant at which Madrid wall clock reads exactly
 * `year-month-day 00:00:00.000`.
 *
 * Uses the standard two-pass offset convergence: guess = wall time read as
 * UTC, then subtract the Madrid offset observed at the guess, then re-check.
 * Madrid DST transitions happen at 02:00→03:00 (spring) and 03:00→02:00
 * (autumn) LOCAL time, so local midnight always exists and is unambiguous;
 * convergence is guaranteed in two passes.
 */
export function madridMidnightUtcMs(year: number, month: number, day: number): UtcMs {
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    month < 1 || month > 12 || day < 1 || day > 31
  ) {
    throw new BillingDomainError(
      'invalid_calendar_date',
      `invalid Madrid calendar date ${String(year)}-${String(month)}-${String(day)}`,
    );
  }
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let candidate = wallAsUtc - madridOffsetMs(wallAsUtc);
  candidate = wallAsUtc - madridOffsetMs(candidate);
  const check = madridWallClock(candidate);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== 0 || check.minute !== 0) {
    throw new BillingDomainError(
      'madrid_midnight_unresolved',
      `could not resolve Madrid midnight for ${String(year)}-${String(month)}-${String(day)}`,
    );
  }
  return candidate;
}

/** UTC instant of Madrid midnight on the 1st of the given Madrid month. */
export function madridMonthStartUtcMs(monthKey: MonthKey): UtcMs {
  const { year, month } = parseMonthKey(monthKey);
  return madridMidnightUtcMs(year, month, 1);
}

/**
 * H1+H3+H4: payout-eligibility instant for a commission earned at `earnedAtUtcMs`.
 *
 * Earned any time inside Madrid month M → eligible at Madrid midnight on the
 * 1st of M+3, returned as a UTC instant.
 *   Jan 2026 → 2026-04-01 00:00 Madrid (CEST) = 2026-03-31T22:00:00Z
 *   Feb 2026 → 2026-05-01 00:00 Madrid (CEST) = 2026-04-30T22:00:00Z
 *   Dec 2025 → 2026-03-01 00:00 Madrid (CET)  = 2026-02-28T23:00:00Z
 *   2026-03-31T22:30:00Z (= Apr 1 00:30 Madrid) → 2026-07-01 Madrid → 2026-06-30T22:00:00Z
 */
export function holdEligibilityUtcMs(earnedAtUtcMs: UtcMs): UtcMs {
  assertUtcMs(earnedAtUtcMs, 'holdEligibilityUtcMs.earnedAtUtcMs');
  const earnedMonth = monthKeyMadrid(earnedAtUtcMs);
  const eligibleMonth = addMonths(earnedMonth, HOLD_ELIGIBILITY_MONTH_OFFSET);
  return madridMonthStartUtcMs(eligibleMonth);
}

/** Madrid month key in which a commission earned at `earnedAtUtcMs` becomes eligible. */
export function holdEligibilityMonthKey(earnedAtUtcMs: UtcMs): MonthKey {
  assertUtcMs(earnedAtUtcMs, 'holdEligibilityMonthKey.earnedAtUtcMs');
  return addMonths(monthKeyMadrid(earnedAtUtcMs), HOLD_ELIGIBILITY_MONTH_OFFSET);
}
