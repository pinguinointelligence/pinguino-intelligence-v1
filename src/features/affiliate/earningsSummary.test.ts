/**
 * H-DASH-02 — this month, held and eligible, from the commission ledger.
 */
import { describe, expect, it } from 'vitest';
import { earningsSummary, madridMonth } from './earningsSummary';

const NOW = new Date('2026-09-15T12:00:00.000Z');

describe('the month is the Madrid calendar month', () => {
  it('00:30 on the 1st in Madrid is the new month, though UTC still says the 31st', () => {
    expect(madridMonth('2026-08-31T22:30:00.000Z')).toBe('2026-09');
    expect(madridMonth('2026-08-31T21:30:00.000Z')).toBe('2026-08');
  });

  it('anything that is not a date has no month', () => {
    expect(madridMonth('not a date')).toBeNull();
    expect(madridMonth(undefined)).toBeNull();
    expect(madridMonth(42)).toBeNull();
  });
});

describe('earningsSummary', () => {
  const ledger = [
    { status: 'held', amountCents: 499, earnedAt: '2026-09-02T10:00:00.000Z' },
    { status: 'eligible', amountCents: 900, earnedAt: '2026-08-10T10:00:00.000Z' },
    { status: 'reversed', amountCents: 499, earnedAt: '2026-09-03T10:00:00.000Z' },
    { status: 'paid', amountCents: 1400, earnedAt: '2026-09-05T10:00:00.000Z' },
    { status: 'held', amountCents: 250, earnedAt: '2026-07-20T10:00:00.000Z' },
  ];

  it('this month counts everything earned in it except reversals', () => {
    expect(earningsSummary(ledger, NOW).monthCents).toBe(499 + 1400);
  });

  it('held and eligible are the ledger states, whatever the month', () => {
    const summary = earningsSummary(ledger, NOW);
    expect(summary.heldCents).toBe(499 + 250);
    expect(summary.eligibleCents).toBe(900);
  });

  it('an empty ledger is all zeros, and a malformed amount counts as nothing', () => {
    expect(earningsSummary([], NOW)).toEqual({ monthCents: 0, heldCents: 0, eligibleCents: 0 });
    expect(
      earningsSummary([{ status: 'held', amountCents: '499', earnedAt: '2026-09-02' }], NOW),
    ).toEqual({ monthCents: 0, heldCents: 0, eligibleCents: 0 });
  });
});
