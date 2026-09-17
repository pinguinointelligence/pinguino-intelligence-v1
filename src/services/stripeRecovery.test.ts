/**
 * The recovery worker, the schedule that calls it, and the vocabulary a won
 * dispute needs.
 *
 * These pin the three things the QA campaign proved were missing:
 *   - a delivery whose dependency was missing stayed `received` for a worker
 *     that did not exist, so its commission was never booked;
 *   - a refund or dispute answered before the entry existed left no trace and
 *     nothing ever revisited the pair;
 *   - 0018's `kind` vocabulary could not store a reinstatement, so a WON
 *     chargeback kept the reversal for ever.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8');
const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '');

const WORKER = read('supabase', 'functions', 'stripe-recovery', 'index.ts');
const SCHEDULER = strip(read('supabase', 'migrations', '20260918130000_stripe_recovery_scheduler.sql'));
const SCHEDULER_RB = read('supabase', 'rollbacks', '20260918130000_stripe_recovery_scheduler.rollback.sql');
const KIND = strip(read('supabase', 'migrations', '20260918120000_commission_dispute_reinstatement.sql'));
const KIND_RB = read('supabase', 'rollbacks', '20260918120000_commission_dispute_reinstatement.rollback.sql');
const DISPATCH = read('supabase', 'functions', 'stripe-webhook', 'dispatch.ts');

describe('the worker is operator-only, and authorises before it touches anything', () => {
  it('compares the service role key in constant time', () => {
    expect(WORKER).toContain('secretEquals(presented, serviceRoleKey)');
    expect(WORKER).toContain('diff |= a.charCodeAt(index) ^ b.charCodeAt(index)');
    expect(WORKER).toContain("json(403, { error: 'forbidden' })");
  });

  it('authorises BEFORE it reads the queue or calls Stripe', () => {
    const auth = WORKER.indexOf('secretEquals(presented, serviceRoleKey)');
    const claim = WORKER.indexOf("from('stripe_webhook_events')");
    const stripe = WORKER.indexOf('new Stripe(stripeKey');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(stripe);
    expect(auth).toBeLessThan(claim);
  });
});

describe('retry: what it picks up, and what it refuses to lose', () => {
  it('claims only deliveries that already recorded a failure', () => {
    expect(WORKER).toContain(".in('state', ['received', 'failed'])");
    expect(WORKER).toContain(".gt('attempts', 0)");
  });

  it('claims a row from the exact state it read, so two workers cannot share one', () => {
    expect(WORKER).toContain("update({ state: 'processing' })");
    expect(WORKER).toContain(".eq('state', row.state)");
  });

  it('re-applies the payload Stripe signed and this project stored', () => {
    expect(WORKER).toContain('applyEventEffects(deps, {');
    expect(WORKER).toContain('id: row.event_id');
    expect(WORKER).toContain('const payload = row.payload ?? {}');
  });

  it('waits hours, not five attempts, because a month snapshot takes hours', () => {
    expect(WORKER).toContain('const RETRY_WINDOW_HOURS = 72;');
    expect(WORKER).toContain('Math.min(60 * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_SECONDS)');
  });

  it('escalates instead of dropping: an expired retry becomes a visible dead letter', () => {
    expect(WORKER).toContain("state: 'dead_letter'");
    expect(WORKER).toContain('escalated_after_');
    expect(SCHEDULER).toContain('gellatti_admin_webhook_backlog_v1');
    expect(SCHEDULER).toContain("e.state in ('received', 'failed', 'dead_letter')");
  });

  it('a conflict is terminal, a missing dependency is not', () => {
    expect(WORKER).toContain("error.name === 'EffectConflictError'");
    expect(WORKER).toContain("state: terminal ? 'failed' : 'received'");
  });
});

describe('reconcile: the repair for deliveries answered before the entry existed', () => {
  it('reads the money back from Stripe per entry and applies what is missing', () => {
    expect(WORKER).toContain("mode === 'reconcile'");
    expect(WORKER).toContain('reconcileEntryMoney(');
    expect(DISPATCH).toContain('export async function reconcileEntryMoney(');
  });

  it('writes the SAME keys as the live path, so a later delivery still refuses', () => {
    // obj:<refund id> and obj:<dispute id> / obj:<dispute id>:reinstated
    expect(DISPATCH).toContain("buildIdempotencyKey('object', {");
    expect(DISPATCH).toContain('`${disputeKey}:reinstated`');
  });

  it('repairs, never rewrites: no delete, no update of an existing adjustment', () => {
    const reconcile = DISPATCH.slice(DISPATCH.indexOf('async function applyMoneyAlreadyMoved'));
    expect(reconcile).not.toMatch(/\.delete\(/);
    expect(reconcile).not.toMatch(/from\('commission_adjustments'\)\s*\n?\s*\.update\(/);
  });
});

describe('the schedule is the caller shape this project already uses', () => {
  it('reads endpoint and credential from Vault BY NAME', () => {
    expect(SCHEDULER).toContain("where name = 'gellatti_edge_functions_base_url'");
    expect(SCHEDULER).toContain("where name = 'gellatti_edge_dispatch_key'");
  });

  it('is inert until both secrets exist, so applying it changes nothing anywhere', () => {
    expect(SCHEDULER).toContain("jsonb_build_object('skipped', 'not_configured')");
  });

  it('serves both modes from one entry point, and refuses any other', () => {
    /* The schedule calls it with no arguments; an operator calls it with
       `reconcile` when a repair is needed. The credential never leaves the
       database in either case. */
    expect(SCHEDULER).toContain("p_mode text default 'retry'");
    expect(SCHEDULER).toContain("if p_mode not in ('retry', 'reconcile') then");
    expect(SCHEDULER).toContain("jsonb_build_object('mode', p_mode)");
  });

  it('does not wake the worker for an empty backlog, and uses the worker’s own due rule', () => {
    expect(SCHEDULER).toContain("jsonb_build_object('skipped', 'nothing_due')");
    expect(SCHEDULER).toContain('least(60 * power(2, greatest(e.attempts - 1, 0)), 1800)');
  });

  it('registers the schedule and unschedules first, so the migration is re-runnable', () => {
    expect(SCHEDULER).toContain("cron.unschedule('gellatti-stripe-recovery')");
    expect(SCHEDULER).toContain("'gellatti-stripe-recovery',\n  '*/5 * * * *'");
  });

  it('is operator-only in the database too', () => {
    expect(SCHEDULER).toContain('revoke all on function public.gellatti_stripe_recovery_tick_v1(text, jsonb) from public, anon, authenticated');
  });

  it('the rollback removes exactly what it added and touches no row', () => {
    expect(SCHEDULER_RB).toContain("cron.unschedule('gellatti-stripe-recovery')");
    expect(SCHEDULER_RB).toContain('drop function if exists public.gellatti_stripe_recovery_tick_v1');
    expect(SCHEDULER_RB).toContain('drop function if exists public.gellatti_admin_webhook_backlog_v1(integer)');
    expect(SCHEDULER_RB).not.toMatch(/\b(update|delete|truncate|insert)\b/i);
    expect(SCHEDULER_RB).not.toContain('drop extension');
  });
});

describe('whose event is this? (Connect destinations)', () => {
  const WEBHOOK = read('supabase', 'functions', 'stripe-webhook', 'index.ts');

  it('accepts BOTH destinations’ secrets, and the signature still decides', () => {
    /* Stripe delivers platform events and connected-account events through
       different destinations, each with its own signing secret. The Connect
       secret was documented and referenced nowhere, so a connected account's
       account.updated — the delivery that turns payouts_enabled on — could
       never be verified. */
    expect(WEBHOOK).toContain("Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')");
    expect(WEBHOOK).toContain('for (const secret of [signingSecret, connectSigningSecret])');
    expect(WEBHOOK).toContain("if (!event) return json(400, { error: 'invalid_signature' });");
  });

  it('records the scope the event actually came from', () => {
    expect(WEBHOOK).toContain("const eventAccount = typeof event.account === 'string' ? event.account : null;");
    expect(WEBHOOK).toContain("account_scope: eventAccount ? 'connect' : 'platform',");
  });

  it('re-reads every object in the account that owns it', () => {
    /* An object of a connected account does not exist in the platform's
       context: a re-read without the account is a 404 or, worse, another
       account's object. */
    expect(WEBHOOK).toContain('const requestOptions = eventAccount ? { stripeAccount: eventAccount } : undefined;');
    for (const call of [
      'stripe.subscriptions.retrieve(id, requestOptions)',
      'stripe.invoices.retrieve(id, requestOptions)',
      'stripe.charges.retrieve(id, requestOptions)',
      'stripe.refunds.retrieve(id, requestOptions)',
      'stripe.disputes.retrieve(id, requestOptions)',
    ]) {
      expect(WEBHOOK).toContain(call);
    }
    // …and the account itself is always read from the platform, because it IS
    // the connected account.
    expect(WEBHOOK).toContain('stripe.accounts.retrieve(id)');
  });

  it('lists with the same account context', () => {
    expect(WEBHOOK).toContain('stripe.invoicePayments.list({ invoice: filter, limit: 100 }, requestOptions)');
    expect(WEBHOOK).toContain('stripe.refunds.list({ payment_intent: filter, limit: 100 }, requestOptions)');
    expect(WEBHOOK).toContain('stripe.disputes.list({ payment_intent: filter, limit: 100 }, requestOptions)');
  });
});

describe('a won dispute can be stored (R6)', () => {
  it('adds the value without rewriting 0018 or touching a row', () => {
    expect(KIND).toContain("'dispute_reinstatement'");
    expect(KIND).toContain('add constraint commission_adjustments_kind_check');
    expect(KIND).not.toMatch(/\b(update|delete|truncate|insert into)\b/i);
    expect(KIND).not.toContain('drop table');
  });

  it('keeps the vocabulary it already had', () => {
    for (const kind of ['refund_reversal', 'dispute_reversal', 'manual']) {
      expect(KIND).toContain(`'${kind}'`);
    }
  });

  it('the rollback refuses while a reinstatement row exists', () => {
    expect(KIND_RB).toContain("where kind = 'dispute_reinstatement'");
    expect(KIND_RB).toContain('rollback refused');
    expect(KIND_RB).not.toMatch(/\bdelete\b/i);
  });
});
