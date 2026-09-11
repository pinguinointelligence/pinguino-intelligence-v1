/// <reference types="node" />
/**
 * D-LINK-03 — a partner reads code and link statuses as copy, and a link's
 * numbers only when the RPC actually returned them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_LINK_STATUS_COPY,
  PARTNER_CODE_STATUS_COPY,
  contentLinkStatusCopy,
  countOrNull,
  linkMetrics,
  partnerCodeStatusCopy,
} from './codeLinkDisplay';

const partnerPage = readFileSync(
  new URL('../../pages/community/PartnerPage.tsx', import.meta.url),
  'utf8',
);

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

/**
 * The values a table's status CHECK allows, read from whichever migration
 * creates the table — found by content, so a rename cannot break the lookup.
 */
const statusCheck = (table: string): string[] => {
  const opener = `create table if not exists public.${table} (`;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.indexOf(opener);
    if (start < 0) continue;
    const block = sql.slice(start, sql.indexOf('\n);', start));
    const values = block.match(/\bstatus\b[^,]*?check\s*\(\s*status in \(([^)]*)\)\s*\)/)?.[1];
    if (!values) throw new Error(`public.${table} has no status CHECK`);
    return [...values.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '').sort();
  }
  throw new Error(`no migration creates public.${table}`);
};

describe('every status the database allows has copy', () => {
  it('partner codes', () => {
    expect(Object.keys(PARTNER_CODE_STATUS_COPY).sort()).toEqual(statusCheck('partner_codes'));
  });

  it('campaign links', () => {
    expect(Object.keys(CONTENT_LINK_STATUS_COPY).sort()).toEqual(
      statusCheck('partner_content_links'),
    );
  });

  it('no label is a raw value, and every state explains itself', () => {
    const all = [
      ...Object.values(PARTNER_CODE_STATUS_COPY),
      ...Object.values(CONTENT_LINK_STATUS_COPY),
    ];
    for (const copy of all) {
      expect(copy.label).not.toMatch(/_|^[A-Z]+$|^[a-z]+$/);
      expect(copy.help.length).toBeGreaterThan(0);
    }
  });

  it('an unknown value degrades to a dash instead of leaking', () => {
    expect(partnerCodeStatusCopy('some_new_state').label).toBe('—');
    expect(contentLinkStatusCopy(undefined).label).toBe('—');
    // Not fooled by what every object inherits.
    expect(contentLinkStatusCopy('toString').label).toBe('—');
  });
});

describe('the partner page prints no raw status', () => {
  it('codes and links go through the display maps', () => {
    expect(partnerPage).not.toContain('{item.status}');
    expect(partnerPage).not.toContain('String(link.status)');
    expect(partnerPage).toContain('partnerCodeStatusCopy(item.status)');
    expect(partnerPage).toContain('contentLinkStatusCopy(link.status)');
  });
});

describe('a link shows the numbers the RPC returned — and only those', () => {
  it('before the migration is applied: clicks only, no invented zeros', () => {
    expect(linkMetrics({ clickCount: 7 })).toEqual([{ label: 'Kliknięcia', value: 7 }]);
  });

  it('after it: clicks, signups, customers and active subscriptions, in that order', () => {
    const metrics = linkMetrics({
      clickCount: 7,
      signups: 3,
      paidCustomers: 1,
      activeSubscriptions: 1,
    });
    expect(metrics.map((metric) => metric.label)).toEqual([
      'Kliknięcia',
      'Rejestracje',
      'Klienci',
      'Aktywne subskrypcje',
    ]);
  });

  it('a real zero is shown; a missing or malformed value is not', () => {
    expect(
      linkMetrics({ clickCount: 0, signups: null, paidCustomers: '2', activeSubscriptions: -1 }),
    ).toEqual([{ label: 'Kliknięcia', value: 0 }]);
    expect(countOrNull(Number.NaN)).toBeNull();
  });

  it('uses the same words as the codes table', () => {
    for (const label of ['Kliknięcia', 'Rejestracje', 'Klienci', 'Aktywne subskrypcje']) {
      expect(partnerPage).toContain(`'${label}'`);
    }
  });
});
