/**
 * The executor between a built batch and money leaving the platform.
 *
 * The ledger has had a claim, a settle and a `stripe_transfer_id` column since
 * the payout package was written, and nothing ever called them: there was no
 * `transfers.create` anywhere in this project, so a batch stopped at `pending`
 * and the QA campaign could only show a synthetic settlement. These assertions
 * pin the order that makes a double payment impossible, and the boundary
 * between a Transfer and a bank payout.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');

const EXECUTOR = read('supabase', 'functions', 'payout-execute', 'index.ts');
const EXECUTION = read('supabase', 'migrations', '20260831202500_payout_execution.sql');
const BINDING = read('supabase', 'migrations', '20260917140000_payout_execution_batch_binding.sql');

describe('who may run it', () => {
  it('authorises the service role in constant time, before it reads or sends anything', () => {
    expect(EXECUTOR).toContain('secretEquals(presented, serviceRoleKey)');
    expect(EXECUTOR).toContain('diff |= a.charCodeAt(index) ^ b.charCodeAt(index)');
    const auth = EXECUTOR.indexOf('secretEquals(presented, serviceRoleKey)');
    // …measured against the CALLS, not the docblock that names them.
    expect(auth).toBeLessThan(EXECUTOR.indexOf("admin.rpc('gellatti_claim_payout_lines_v1'"));
    expect(auth).toBeLessThan(EXECUTOR.indexOf('await stripe.transfers.create('));
  });

  it('takes the amount from the claimed line, never from the request', () => {
    /* The body carries a batch id and a page size. Everything that decides
       money — amount, destination, currency, mode — comes from the ledger. */
    expect(EXECUTOR).toContain('amount: line.amount_cents');
    expect(EXECUTOR).toContain('destination: line.stripe_connect_account_id');
    expect(EXECUTOR).toContain("currency: batch.currency ?? 'eur'");
    expect(EXECUTOR).not.toMatch(/amount:\s*(Number\()?body\./);
    expect(EXECUTOR).not.toMatch(/destination:\s*body\./);
  });
});

describe('a double payment must be impossible', () => {
  it('sends with the line’s own idempotency key', () => {
    expect(EXECUTOR).toContain('{ idempotencyKey: line.idempotency_key }');
    // …which the ledger builds as month:partner:currency:mode and never reuses.
    expect(EXECUTION).toContain("v_month::text || ':' || partner_id::text || ':eur:' || case when p_livemode then 'live' else 'test' end");
  });

  it('claims through the ledger, which hands each line to one worker only', () => {
    expect(EXECUTOR).toContain("admin.rpc('gellatti_claim_payout_lines_v1'");
    expect(BINDING).toContain('for update of pp skip locked');
  });

  it('an unknown outcome is rebound, never re-sent under a new key', () => {
    /* Transfer accepted, ledger not updated: the line stays claimable and the
       next run presents the SAME key, so Stripe returns that transfer. */
    expect(EXECUTOR).toContain('transferred_settle_failed');
    expect(EXECUTOR).toMatch(/the next run presents the same key/i);
    expect(EXECUTOR).not.toMatch(/idempotencyKey:\s*`[^`]*\$\{Date\.now\(\)/);
    expect(EXECUTOR).not.toMatch(/idempotencyKey:\s*crypto\.randomUUID/);
  });

  it('settles with the transfer id it received, through the batch-bound settler', () => {
    expect(EXECUTOR).toContain("admin.rpc('gellatti_settle_payout_line_v2'");
    expect(EXECUTOR).toContain('p_stripe_transfer_id: transferId');
    // The settler refuses a second, different transfer for the same line.
    expect(BINDING).toContain('payout_line_already_paid_by_another_transfer');
  });

  it('a failed transfer is recorded as a failure, not left pending', () => {
    expect(EXECUTOR).toContain("admin.rpc('gellatti_mark_payout_failed_v1'");
  });
});

describe('the test hook cannot touch real money', () => {
  it('the stop-after-transfer flag is refused unless the batch is test mode', () => {
    expect(EXECUTOR).toContain("body.qaStopAfterTransfer === true && batch.livemode === false");
    expect(EXECUTOR).toContain("error: 'qa_stop_refused_in_livemode'");
  });
});

describe('a Transfer is not a bank payout', () => {
  it('says so, and writes no payout-level linkage it cannot prove', () => {
    expect(EXECUTOR.replace(/\s+\*?\s*/g, ' ')).toMatch(
      /It is NOT the payout from that account to the partner's bank/,
    );
    expect(EXECUTOR).not.toContain('stripe.payouts.create');
    expect(EXECUTOR).not.toContain('stripe_payout_id');
  });

  it('labels the transfer with the batch, partner and month for the Stripe side', () => {
    expect(EXECUTOR).toContain('transfer_group: `payout_batch:${batch.id}`');
    expect(EXECUTOR).toContain('gellatti_payout_id: line.payout_id');
    expect(EXECUTOR).toContain('gellatti_partner_id: line.partner_id');
  });
});
