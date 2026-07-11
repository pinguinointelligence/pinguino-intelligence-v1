/// <reference types="node" />
/**
 * Account Access service-boundary guard. Proves the account-access adapters:
 *   • only READ Billing entitlements (via the pure resolver) — never write/rewrite them;
 *   • never touch Stripe / OpenAI / a privileged service_role key;
 *   • never authorize by email;
 *   • never mutate mapper_basement or Billing financial tables.
 * Static source-text guard (comment-stripped).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) =>
  readFileSync(join(import.meta.dirname, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const BRIDGE = read('billingEntitlementBridge.ts');
const INMEM = read('inMemoryAccountAccess.ts');
const ALL = BRIDGE + '\n' + INMEM;

describe('account-access adapters — boundaries', () => {
  it('the bridge only READS Billing entitlements (pure resolver, no write)', () => {
    expect(BRIDGE.includes('resolveEntitlements')).toBe(true);
    for (const verb of ['.insert(', '.update(', '.delete(', '.upsert(']) {
      expect(BRIDGE.includes(verb), verb).toBe(false);
    }
    // never names a Billing financial / catalog table for a write
    expect(/\.from\((['"])(entitlements|subscriptions|partners|commission|payout)/.test(BRIDGE)).toBe(false);
  });

  it('never references Stripe / OpenAI / a privileged key', () => {
    expect(/\b(openai|stripe)\b/i.test(ALL)).toBe(false);
    expect(/service[_-]?role/i.test(ALL)).toBe(false);
  });

  it('never authorizes by email and never touches mapper_basement or engine values', () => {
    // access is keyed on userId, never on email equality
    expect(/if\s*\([^)]*email\s*===|authorize[^]*email/i.test(ALL)).toBe(false);
    expect(/mapper_basement/.test(ALL)).toBe(false);
    expect(/pac_value|pod_value|npac_value/.test(ALL)).toBe(false);
  });
});
