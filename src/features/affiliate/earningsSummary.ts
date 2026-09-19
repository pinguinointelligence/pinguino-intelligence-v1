/**
 * H-DASH-02 — the partner's money at a glance: what this month has earned so
 * far, what is still inside its refund window, and what is ready for the next
 * settlement. Computed from the commission ledger the workspace RPC already
 * returns (one row per commission entry), so it needs no database change.
 *
 * "This month" is the calendar month in Europe/Madrid, the boundary the tier
 * snapshot and the monthly settlement run on (GOLD-01, F-PAY-01): a commission
 * earned at 00:30 on the 1st in Madrid belongs to the new month although it is
 * still the previous day in UTC.
 */
export interface EarningsSummary {
  /** Earned in the current Madrid month, reversals excluded. */
  readonly monthCents: number;
  /** Status `held`: earned, still inside the refund window. */
  readonly heldCents: number;
  /** Status `eligible`: through the refund window, waiting for settlement. */
  readonly eligibleCents: number;
}

const MADRID = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
});

/** `YYYY-MM` of an instant in Madrid, or null for anything that is not a date. */
export function madridMonth(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = MADRID.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
}

const cents = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function earningsSummary(
  commissions: readonly Readonly<Record<string, unknown>>[],
  now: Date,
): EarningsSummary {
  const thisMonth = madridMonth(now);
  let monthCents = 0;
  let heldCents = 0;
  let eligibleCents = 0;
  for (const row of commissions) {
    const amount = cents(row.amountCents);
    if (row.status === 'held') heldCents += amount;
    if (row.status === 'eligible') eligibleCents += amount;
    if (
      row.status !== 'reversed' &&
      thisMonth !== null &&
      madridMonth(row.earnedAt) === thisMonth
    ) {
      monthCents += amount;
    }
  }
  return { monthCents, heldCents, eligibleCents };
}
