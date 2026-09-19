/// <reference types="node" />
/**
 * create-portal-session — pure logic tests + Deno source scans (customer id
 * only from the server-side mapping, allowlisted return URL).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decidePortalEligibility,
  decidePortalFlow,
} from '../../supabase/functions/create-portal-session/logic.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fnDir = join(ROOT, 'supabase', 'functions', 'create-portal-session');
const indexSource = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const logicSource = readFileSync(join(fnDir, 'logic.ts'), 'utf8');

describe('portal eligibility — auth user must already have a customer mapping', () => {
  it('a mapped customer id passes through', () => {
    expect(decidePortalEligibility({ stripe_customer_id: 'cus_fake_1' })).toEqual({
      ok: true,
      customerId: 'cus_fake_1',
    });
  });

  it('missing mapping / empty / whitespace id → typed refusal', () => {
    expect(decidePortalEligibility(null)).toEqual({ ok: false, reason: 'no_billing_customer' });
    expect(decidePortalEligibility(undefined)).toEqual({ ok: false, reason: 'no_billing_customer' });
    expect(decidePortalEligibility({ stripe_customer_id: '' })).toEqual({
      ok: false,
      reason: 'no_billing_customer',
    });
    expect(decidePortalEligibility({ stripe_customer_id: '   ' })).toEqual({
      ok: false,
      reason: 'no_billing_customer',
    });
  });
});

describe('portal flow — „Zaktualizuj metodę płatności” deep link', () => {
  it('no flow → plain portal; payment_method_update → Stripe flow; anything else refused', () => {
    expect(decidePortalFlow(undefined)).toEqual({ ok: true, flow: null });
    expect(decidePortalFlow(null)).toEqual({ ok: true, flow: null });
    expect(decidePortalFlow('')).toEqual({ ok: true, flow: null });
    expect(decidePortalFlow('payment_method_update')).toEqual({ ok: true, flow: 'payment_method_update' });
    expect(decidePortalFlow('subscription_cancel')).toEqual({ ok: false, reason: 'unknown_portal_flow' });
    expect(decidePortalFlow({ type: 'payment_method_update' })).toEqual({ ok: false, reason: 'unknown_portal_flow' });
  });

  it('the entrypoint forwards the flow as flow_data and never stores card data', () => {
    expect(/flow_data:\s*\{\s*type:\s*flow\.flow\s*\}/.test(indexSource)).toBe(true);
    expect(/card_number|cardNumber|cvc/i.test(indexSource)).toBe(false);
  });
});

describe('Deno entrypoint — source pins', () => {
  it('is labelled NOT DEPLOYED, JWT-authenticated, and reads the mapping server-side only', () => {
    expect(/NOT DEPLOYED/.test(indexSource)).toBe(true);
    expect(/auth\.getUser\(\)/.test(indexSource)).toBe(true);
    expect(/\.from\('billing_customers'\)/.test(indexSource)).toBe(true);
    // the customer id is never read from the request body
    expect(/body\.customer/i.test(indexSource)).toBe(false);
  });

  it('validates the return URL against the env allowlist', () => {
    expect(/BILLING_REDIRECT_URL_ALLOWLIST/.test(indexSource)).toBe(true);
    expect(/redirect_url_not_allowed/.test(indexSource)).toBe(true);
  });

  it('only reads billing_customers — no other table, no writes', () => {
    const tables = [...indexSource.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(tables)]).toEqual(['billing_customers']);
    expect(indexSource.includes('.upsert(')).toBe(false);
    expect(indexSource.includes('.insert(')).toBe(false);
    expect(indexSource.includes('.update(')).toBe(false);
    expect(indexSource.includes('.delete(')).toBe(false);
  });

  it('contains no secrets; the portal configuration id comes from env by NAME', () => {
    expect(/STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID/.test(indexSource)).toBe(true);
    expect(/sk_(live|test)_[A-Za-z0-9]/.test(indexSource)).toBe(false);
    expect(/cus_(?!fake)[A-Za-z0-9]{8,}/.test(indexSource)).toBe(false);
  });

  it('the logic module stays pure (no imports, no Deno, no IO)', () => {
    expect(/^\s*import\s/m.test(logicSource)).toBe(false);
    expect(logicSource.includes('Deno.')).toBe(false);
  });
});
