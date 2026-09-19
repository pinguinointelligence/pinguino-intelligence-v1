/// <reference types="node" />
/**
 * F-PAY-04 — nothing a partner reads promises when money arrives in a bank.
 *
 * A payout travels through Gellatti's monthly batch, a Stripe transfer and the
 * partner's bank, and only the first is Gellatti's to schedule. Partner-facing
 * copy may say a payout is scheduled, in progress or paid — never "within N
 * days", "by the 15th" or "arrives on…". This scans every place that copy lives.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMISSION_STATUS_COPY, PAYOUT_STATUS_COPY } from './commissionDisplay';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** A promise of WHEN money lands: a span of time, a deadline, a guarantee, an arrival. */
const DATE_PROMISE = [
  /\b\d+\s*(dni|dzień|dnia|godzin|godziny|tygodni|tydzień|days?|hours?|weeks?)\b/i,
  /w ciągu|najpóźniej|do dnia|gwarant|dotrze|wpłynie|pojawi się na koncie|na koncie w|within|guarantee|arrives? (on|by|in)/i,
];
const promises = (text: string) => DATE_PROMISE.some((pattern) => pattern.test(text));

/** The source of one top-level function component in the page. */
const section = (page: string, name: string) => {
  const start = page.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const end = page.indexOf('\nfunction ', start + 10);
  return page.slice(start, end < 0 ? undefined : end);
};

describe('F-PAY-04 — no bank arrival date is promised', () => {
  it('the guard would catch a real promise, and passes honest wording', () => {
    expect(promises('Przelew dotrze w ciągu 3 dni roboczych.')).toBe(true);
    expect(promises('Środki wpłyną najpóźniej 15. dnia miesiąca.')).toBe(true);
    expect(promises('Wypłata czeka na najbliższy termin.')).toBe(false);
  });

  it('payout and commission status copy promises no date', () => {
    for (const copy of [
      ...Object.values(PAYOUT_STATUS_COPY),
      ...Object.values(COMMISSION_STATUS_COPY),
    ]) {
      expect(`${copy.label} — ${copy.help}`).not.toSatisfy(promises);
    }
  });

  it("the partner page's money sections promise no date", () => {
    const page = read('../../pages/community/PartnerPage.tsx');
    for (const name of ['Overview', 'Earnings', 'Payouts']) {
      const source = section(page, name);
      expect(source, `${name} not found`).not.toBe('');
      const offending = [...source.matchAll(/'([^'\n]{6,})'|>([^<>{}\n]{6,})</g)]
        .map((match) => (match[1] ?? match[2] ?? '').trim())
        .filter(promises);
      expect(offending, name).toEqual([]);
    }
  });

  it('the public Affiliate and cooperation copy promise no payout date', () => {
    for (const file of ['../../copy/affiliate.ts', '../../copy/cooperation.ts']) {
      const payoutLines = read(file)
        .split('\n')
        .filter((line) => /wypłat|przelew|payout|transfer/i.test(line));
      expect(payoutLines.filter(promises), file).toEqual([]);
    }
  });
});
