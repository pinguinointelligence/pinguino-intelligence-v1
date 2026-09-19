/// <reference types="node" />
/**
 * Scheduled-plan-change migration guard — Account → Plan i rozliczenia.
 *
 * The period-end downgrade mirror EXTENDS the 0015 `customer_subscriptions`
 * cache: two nullable columns, a shape CHECK so a half-described change can
 * never be stored, a catalog FK so the offer key is always real, and NO new
 * table and NO client write grant (financial state stays service-role only).
 *
 * Static SQL guard, CRLF-safe (same convention as billingPlatform.migration.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const FILE = '20260919120000_customer_subscriptions_scheduled_change.sql';

const SQL = readFileSync(join(REPO, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n?/g, '\n');
const ROLLBACK = readFileSync(
  join(REPO, 'supabase', 'rollbacks', FILE.replace(/\.sql$/, '.rollback.sql')),
  'utf8',
).replace(/\r\n?/g, '\n');
const EXEC = SQL.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');
const FLAT = EXEC.replace(/\s+/g, ' ');

describe('customer_subscriptions scheduled-change columns', () => {
  it('ALTERS the existing cache — it never creates a second subscription table', () => {
    expect(FLAT).toContain('alter table public.customer_subscriptions');
    expect(/create table/i.test(EXEC)).toBe(false);
  });

  it('adds exactly the two mirror columns, idempotently', () => {
    expect(FLAT).toContain('add column if not exists scheduled_offer_key text');
    expect(FLAT).toContain('add column if not exists scheduled_change_at timestamptz');
  });

  it('the offer key is a real catalog offer (FK), never free text', () => {
    expect(FLAT).toContain('references public.billing_price_catalog (offer_key)');
  });

  it('a pending change is all-or-nothing (both columns set, or both null)', () => {
    expect(FLAT).toContain('customer_subscriptions_scheduled_change_shape');
    expect(FLAT).toContain(
      '(scheduled_offer_key is null and scheduled_change_at is null) or (scheduled_offer_key is not null and scheduled_change_at is not null)',
    );
    // re-runnable: the constraint is dropped before being added
    expect(FLAT).toContain('drop constraint if exists customer_subscriptions_scheduled_change_shape');
  });

  it('grants NOTHING to clients — the webhook (service role) stays the only writer', () => {
    expect(/grant\s+(insert|update|delete)/i.test(EXEC)).toBe(false);
    expect(/to\s+(anon|authenticated)/i.test(EXEC)).toBe(false);
    expect(/create policy/i.test(EXEC)).toBe(false);
  });

  it('ships a rollback file that drops the CHECK before the columns and nothing else', () => {
    const flat = ROLLBACK.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ').replace(/\s+/g, ' ');
    expect(flat).toContain('drop constraint if exists customer_subscriptions_scheduled_change_shape');
    expect(flat).toContain('drop column if exists scheduled_offer_key');
    expect(flat).toContain('drop column if exists scheduled_change_at');
    // the CHECK references both columns, so it must go first
    expect(flat.indexOf('drop constraint')).toBeLessThan(flat.indexOf('drop column'));
    // a mirror rollback never touches rows, entitlements or other tables
    expect(/delete from|truncate|drop table|entitlements/i.test(flat)).toBe(false);
  });

  it('carries a rollback plan and touches no other table', () => {
    expect(SQL).toContain('ROLLBACK PLAN');
    // The only table altered is the cache; the only other table named is the
    // catalog the FK points at. No second subscription source is introduced.
    const altered = [...EXEC.matchAll(/alter table\s+public\.([a-z_]+)/g)].map((m) => m[1]);
    expect([...new Set(altered)]).toEqual(['customer_subscriptions']);
    const referenced = [...EXEC.matchAll(/references\s+public\.([a-z_]+)/g)].map((m) => m[1]);
    expect([...new Set(referenced)]).toEqual(['billing_price_catalog']);
  });
});
