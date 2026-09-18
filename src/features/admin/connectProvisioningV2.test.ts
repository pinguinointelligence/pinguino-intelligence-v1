/// <reference types="node" />
/**
 * Provisioning a Partner's payout account.
 *
 * Measured on the Stripe sandbox (2026-09-18, acct_1UGdTdAi07MMapq2) with
 * Connect enabled: `POST /v1/accounts` is refused outright —
 *
 *   "Stripe no longer recommends Accounts v1 for new Connect integrations.
 *    Create connected accounts with POST /v2/core/accounts instead."
 *
 * — while `POST /v2/core/accounts` creates the account. The old call also asked
 * for NO capabilities, so Express defaults decided what the account could do,
 * including taking card payments it must never take.
 *
 * These assertions fail on the v1 call, pass on the v2 one, pin the exact
 * payload, and hold the REST of the flow still: the same admin RPC binds the
 * account, the same onboarding link sends the Partner to Stripe, the same
 * retrieve reads it back and the same transfer pays it. Only the create moved.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');

const ADMIN_CONTROL = read('supabase', 'functions', 'admin-control', 'index.ts');
const ONBOARDING_LINK = read('supabase', 'functions', 'create-connect-onboarding-link', 'index.ts');
const WEBHOOK = read('supabase', 'functions', 'stripe-webhook', 'index.ts');
const EXECUTOR = read('supabase', 'functions', 'payout-execute', 'index.ts');

/** The PROVISION_CONNECT branch only — other actions may create other objects. */
const PROVISION = ADMIN_CONTROL.slice(
  ADMIN_CONTROL.indexOf("if (action === 'PROVISION_CONNECT')"),
);

describe('the account is created through Accounts v2', () => {
  it('does not call the refused v1 endpoint', () => {
    expect(PROVISION).not.toMatch(/stripe\.accounts\.create\(/);
    expect(PROVISION).not.toContain("type: 'express',");
  });

  it('posts to /v2/core/accounts with that API version and the partner-scoped key', () => {
    expect(PROVISION).toContain("stripe.rawRequest('POST', '/v2/core/accounts'");
    expect(ADMIN_CONTROL).toContain("const CONNECT_ACCOUNTS_API_VERSION = '2026-08-26.dahlia';");
    expect(PROVISION).toContain('apiVersion: CONNECT_ACCOUNTS_API_VERSION');
    // Unchanged from the v1 call: one account per partner, whatever the retries.
    expect(PROVISION).toContain('idempotencyKey: `gellatti-partner-connect-${partnerId}`');
  });

  it('asks for the Recipient configuration and exactly one capability', () => {
    expect(PROVISION).toContain(
      "recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },",
    );
  });

  it('asks for nothing that could take a payment', () => {
    // No Merchant configuration, and none of the payment capabilities.
    expect(PROVISION).not.toContain('merchant:');
    expect(PROVISION).not.toContain('card_payments');
    expect(PROVISION).not.toContain('automatic_indirect_tax');
    expect(PROVISION).not.toContain('customer:');
  });

  it('keeps the hosted dashboard the onboarding link already uses, with the responsibilities Stripe requires with it', () => {
    expect(PROVISION).toContain("dashboard: 'express',");
    expect(PROVISION).toContain("responsibilities: { fees_collector: 'application', losses_collector: 'application' },");
  });

  it('names the account holder and the country, and carries the partner id', () => {
    expect(PROVISION).toContain('contact_email: authUser.user?.email,');
    expect(PROVISION).toContain("identity: { country, entity_type: 'individual' },");
    expect(PROVISION).toMatch(/const country = \/\^\[A-Za-z\]\{2\}\$\/\.test\(String\(body\.country/);
    expect(PROVISION).toContain('metadata: { gellatti_partner_id: partnerId, environment: \'staging\' },');
  });
});

describe('everything around the create call is unchanged', () => {
  it('still refuses a partner that is not active, and stays idempotent on a second run', () => {
    expect(PROVISION).toContain("if (partner.status !== 'active') return json(409, { error: 'active_partner_required' });");
    expect(PROVISION).toContain('if (partner.stripe_connect_account_id) {');
    expect(PROVISION).toContain('idempotent: true');
  });

  it('still binds the account through the admin RPC, not a column write', () => {
    expect(PROVISION).toContain("userClient.rpc('gellatti_admin_register_partner_connect_v1'");
    expect(PROVISION).not.toMatch(/from\('partners'\)[\s\S]{0,80}\.update\(/);
  });

  it('still tells the Partner, in the words the panel uses', () => {
    /* The old notification said "Dokończ konfigurację wypłat" and named the
       vendor — the two things #406 removed from the panel. The Partner
       configures no payout; they confirm identity and data. */
    expect(PROVISION).toContain("title: 'Potwierdź dane do wypłat',");
    expect(PROVISION).not.toMatch(/Dokończ konfigurację/);
    expect(PROVISION.slice(PROVISION.indexOf('user_notifications'))).not.toMatch(/\bstripe\b/i);
  });

  it('leaves the v1 calls that still work exactly where they were', () => {
    expect(ONBOARDING_LINK).toContain('stripe.accountLinks.create({');
    expect(WEBHOOK).toContain('stripe.accounts.retrieve(id)');
    expect(EXECUTOR).toContain('await stripe.transfers.create(');
    // …and no second Connect module grew beside them (code, not the comments
    // that name those calls).
    const code = ADMIN_CONTROL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('accountLinks.create');
    expect(code).not.toContain('transfers.create');
  });
});
