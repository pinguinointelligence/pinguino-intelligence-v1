/// <reference types="node" />
/**
 * Phase 2B.1 — the billing/subscription migration must exist with read-own RLS,
 * NO user write policy/grant (no self-promotion), and no privileged-server-role
 * dependency in the committed SQL.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '0003_billing_subscriptions.sql'),
  'utf8',
);

describe('Phase 2B.1 billing migration (0003)', () => {
  it('creates both billing tables', () => {
    expect(SQL.includes('public.billing_customers')).toBe(true);
    expect(SQL.includes('public.subscriptions')).toBe(true);
  });

  it('enables RLS on both tables', () => {
    expect(SQL.includes('alter table public.billing_customers enable row level security')).toBe(true);
    expect(SQL.includes('alter table public.subscriptions enable row level security')).toBe(true);
  });

  it('exposes read-own SELECT policies only', () => {
    expect(SQL.includes('billing_customers_select_own')).toBe(true);
    expect(SQL.includes('subscriptions_select_own')).toBe(true);
    const ownerChecks = (SQL.match(/auth\.uid\(\) = user_id/g) ?? []).length;
    expect(ownerChecks).toBeGreaterThanOrEqual(2);
    // no user-facing write policies (users cannot self-promote)
    expect(/for\s+(insert|update|delete)/i.test(SQL)).toBe(false);
  });

  it('grants only SELECT to authenticated (no write grants)', () => {
    const normalized = SQL.toLowerCase().replace(/\s+/g, ' ');
    expect(normalized.includes('grant select on public.subscriptions to authenticated')).toBe(true);
    expect(/grant\s+(insert|update|delete)[^;]*to\s+(anon|authenticated)/i.test(SQL)).toBe(false);
  });

  it('does not depend on a privileged server role', () => {
    expect(/service[_-]?role/i.test(SQL)).toBe(false);
  });
});
