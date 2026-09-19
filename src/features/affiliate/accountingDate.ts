/**
 * Accounting dates on the Partner dashboard are days of the Europe/Madrid
 * calendar.
 *
 * The hold rule (holdCalendar H1–H4) makes a commission earned in Madrid month
 * M eligible at 00:00 Europe/Madrid on the 1st of M+3. That instant is stored in
 * UTC — September's deadline is `2026-11-30T23:00:00Z`. Formatting it in the
 * browser's own zone printed 30.11.2026 in Lisbon, London, New York or UTC: a
 * day before the real date, which reads as money due earlier than it is. The
 * accounting day is a Madrid day, so it is formatted in Madrid and the page
 * says so.
 *
 * Only accounting dates go through here. A moment in time the partner simply
 * wants to see in their own zone is a different thing and keeps its own
 * formatter and label.
 */
import { BUSINESS_TIMEZONE } from '@/billing/domain/holdCalendar';

const MADRID_DAY = new Intl.DateTimeFormat('pl-PL', { timeZone: BUSINESS_TIMEZONE });

/** Shown wherever accounting dates are listed, so the calendar is never implicit. */
export const ACCOUNTING_CALENDAR_NOTE = 'Daty rozliczeń według kalendarza Madrytu (Europe/Madrid).';

/** The Europe/Madrid calendar day of an instant (e.g. `1.12.2026`), or null if it is not a date. */
export function madridAccountingDay(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return MADRID_DAY.format(date);
}
