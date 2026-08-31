/// <reference types="node" />
/**
 * PAYOUT EXECUTION + SCHEDULING guard (20260831202500, 20260831203000).
 *
 * payoutNetting.ts stays the calculation authority; these migrations are the
 * execution layer around it. This test asserts the SQL reproduces P1..P7 and
 * covers every failure scenario the owner listed.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAYOUT_THRESHOLD_CENTS } from './payoutNetting';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (file: string) => readFileSync(join(REPO, 'supabase', 'migrations', file), 'utf8');

const PAYOUT_RAW = read('20260831202500_payout_execution.sql');
const SCHED_RAW = read('20260831203000_partner_scheduling.sql');
const PAYOUT = PAYOUT_RAW.replace(/--.*$/gm, '');
const SCHED = SCHED_RAW.replace(/--.*$/gm, '');

const fn = (sql: string, name: string) =>
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`).exec(sql)?.[0] ?? '';

const BUILD = fn(PAYOUT, 'gellatti_build_payout_batch_v1');
const CLAIM = fn(PAYOUT, 'gellatti_claim_payout_lines_v1');
const PAID = fn(PAYOUT, 'gellatti_mark_payout_paid_v1');
const FAILED = fn(PAYOUT, 'gellatti_mark_payout_failed_v1');
const STUCK = fn(PAYOUT, 'gellatti_stuck_payout_lines_v1');
const ELIGIBLE = fn(PAYOUT, 'gellatti_transition_eligible_commissions_v1');

// ---------------------------------------------------------------------------
// The live kill switch — the owner's hardest requirement
// ---------------------------------------------------------------------------

describe('ABSOLUTELY NO LIVE TRANSFER until an explicit owner release', () => {
  it('ships a release gate that defaults to NOT released', () => {
    expect(PAYOUT).toContain('create table if not exists public.payout_release_state');
    expect(PAYOUT).toContain('live_payouts_released boolean not null default false');
    expect(PAYOUT).toMatch(
      /insert into public\.payout_release_state \(id, live_payouts_released\)\s*\n?\s*values \(true, false\)/,
    );
  });

  it('every money-moving function asserts the gate', () => {
    expect(BUILD).toContain('gellatti_assert_payout_allowed_v1');
    expect(CLAIM).toContain('gellatti_assert_payout_allowed_v1');
  });

  it('the gate raises for live mode unless released', () => {
    const assertFn = fn(PAYOUT, 'gellatti_assert_payout_allowed_v1');
    expect(assertFn).toContain('if p_livemode and not public.gellatti_live_payouts_released_v1()');
    expect(assertFn).toContain('live_payouts_not_released');
  });

  it('the release table is service-role only — no policy, no grant', () => {
    expect(PAYOUT).toContain('alter table public.payout_release_state enable row level security');
    expect(/create policy[^;]*payout_release_state/i.test(PAYOUT)).toBe(false);
    expect(/grant[^;]*payout_release_state/i.test(PAYOUT)).toBe(false);
  });

  it('the scheduled monthly batch runs in TEST mode only', () => {
    expect(SCHED).toContain('gellatti_build_payout_batch_v1(null, false)');
    expect(SCHED).not.toMatch(/gellatti_build_payout_batch_v1\([^)]*true\)/);
  });
});

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

describe('held → eligible uses the two-calendar-month date already computed', () => {
  it('promotes only entries whose eligible_at has passed', () => {
    expect(ELIGIBLE).toContain("where status = 'held'");
    expect(ELIGIBLE).toContain('eligible_at <= p_now');
  });

  it('never recomputes the hold — the date was set when the entry was created', () => {
    expect(ELIGIBLE).not.toMatch(/interval\s+'\d+\s+(day|month)/i);
    expect(ELIGIBLE).not.toContain('eligible_at =');
  });
});

describe('P2 — the EUR 25 threshold matches payoutNetting.ts', () => {
  it('shares the constant', () => {
    expect(DEFAULT_PAYOUT_THRESHOLD_CENTS).toBe(2500);
    expect(BUILD).toMatch(
      new RegExp(`p_threshold_cents integer default ${DEFAULT_PAYOUT_THRESHOLD_CENTS}`),
    );
  });

  it('below threshold is skipped and carried forward, not paid', () => {
    expect(BUILD).toContain("when net_cents < p_threshold_cents then 'skipped_below_threshold'");
  });

  it('carry-forward records the balance instead of zeroing it', () => {
    expect(BUILD).toContain("case when decision = 'pending' then 0 else net_cents end");
  });
});

describe('P3 — a negative net carries forward and blocks payment', () => {
  it('is its own skip state', () => {
    expect(BUILD).toContain("when net_cents < 0 then 'skipped_negative_balance'");
  });

  it('is checked BEFORE the threshold, so a negative can never read as payable', () => {
    expect(BUILD.indexOf("'skipped_negative_balance'")).toBeLessThan(
      BUILD.indexOf("'skipped_below_threshold'"),
    );
  });

  it('P4 — a zero net produces no transfer', () => {
    expect(BUILD).toContain('when net_cents = 0 then');
  });
});

describe('P1 — adjustments are netted against gross', () => {
  it('sums signed adjustments into the net', () => {
    expect(BUILD).toContain('(gross_cents + adjustment_cents) as net_cents');
  });

  it('counts only amounts not already settled by a previous payout', () => {
    expect(BUILD).toContain('not exists');
    expect(BUILD).toContain('i.commission_entry_id = ce.id');
    expect(BUILD).toContain('i.commission_adjustment_id = ca.id');
  });
});

describe('P6 — the idempotency key is deterministic', () => {
  it('is batchMonth + partner + currency + mode, exactly as the domain specifies', () => {
    expect(BUILD).toContain(
      "v_month::text || ':' || partner_id::text || ':eur:' || case when p_livemode then 'live' else 'test' end",
    );
  });
});

// ---------------------------------------------------------------------------
// The owner's failure scenarios
// ---------------------------------------------------------------------------

describe('failure scenario — duplicate scheduler execution', () => {
  it('is blocked by the batch unique key and an advisory lock', () => {
    expect(BUILD).toContain('pg_advisory_xact_lock');
    expect(BUILD).toContain('on conflict (month, currency, livemode) do nothing');
  });

  it('payout lines cannot be duplicated within a batch', () => {
    expect(BUILD).toContain('on conflict (batch_id, partner_id) do nothing');
  });

  it('two workers claim disjoint lines', () => {
    expect(CLAIM).toContain('for update skip locked');
  });
});

describe('failure scenario — crash after the Stripe transfer, before the local commit', () => {
  it('leaves the line processing with no transfer id, which the reconciler finds', () => {
    expect(STUCK).toContain("pp.status = 'processing'");
    expect(STUCK).toContain('pp.stripe_transfer_id is null');
  });

  it('the reconciler NEVER auto-fails an ambiguous line', () => {
    // assuming failure here could double-pay; Stripe must be asked instead
    expect(STUCK).not.toContain("status = 'failed'");
    expect(STUCK).not.toMatch(/update public\.partner_payouts/);
    expect(PAYOUT_RAW).toContain('NOTHING is auto-failed');
  });

  it('the line carries the deterministic key so Stripe can be asked about it', () => {
    expect(STUCK).toContain('pp.idempotency_key');
  });

  it('only waits past a grace window, so a normal in-flight transfer is not disturbed', () => {
    expect(STUCK).toContain('p_grace_minutes');
    expect(STUCK).toContain('pp.updated_at < p_now - make_interval');
  });
});

describe('failure scenario — Connect incomplete, transfers disabled, payouts disabled', () => {
  it('all three collapse to skipped_not_payable', () => {
    expect(BUILD).toContain(
      "when not (payouts_enabled and onboarding_complete) then 'skipped_not_payable'",
    );
  });

  it('the balance carries forward rather than being lost', () => {
    // a skipped line records carry_forward_cents, and its entries stay eligible
    expect(BUILD).toContain('carry_forward_cents');
  });
});

describe('failure scenario — suspended partner', () => {
  it('is never paid automatically', () => {
    expect(BUILD).toContain("when partner_status <> 'active' then 'skipped_not_payable'");
  });

  it('is checked FIRST, before any payability test', () => {
    expect(BUILD.indexOf("partner_status <> 'active'")).toBeLessThan(
      BUILD.indexOf('payouts_enabled and onboarding_complete'),
    );
  });
});

describe('failure scenario — transfer failure and retry', () => {
  it('a failed line keeps no transfer id and no paid_at', () => {
    expect(FAILED).toContain('stripe_transfer_id = null');
    expect(FAILED).toContain('paid_at = null');
  });

  it('a failed line does not consume its commission entries — they stay eligible', () => {
    expect(FAILED).not.toContain('commission_entries');
    expect(FAILED).not.toContain('partner_payout_items');
  });

  it('settling requires the line to still be in flight, so a double-settle is refused', () => {
    expect(PAID).toContain("status in ('processing', 'pending')");
    expect(PAID).toContain('payout_line_not_claimed_or_already_settled');
    expect(FAILED).toContain('payout_line_not_claimed_or_already_settled');
  });

  it('paying requires a real transfer id', () => {
    expect(PAID).toContain('payout_paid_requires_transfer_id');
  });
});

describe('failure scenario — post-payout reversal and refund after earning', () => {
  it('money already paid is bound to its payout and can never be paid again', () => {
    expect(PAID).toContain('insert into public.partner_payout_items');
    expect(PAID).toContain('on conflict do nothing');
  });

  it('only entries actually linked to THIS payout become paid', () => {
    expect(PAID).toContain('i.payout_id = p_payout_id');
  });

  it('a later negative adjustment lands in the next batch as a negative net', () => {
    // adjustments are netted (P1) and a negative net is its own skip state (P3)
    expect(BUILD).toContain('adjustment_cents');
    expect(BUILD).toContain("'skipped_negative_balance'");
  });
});

describe('batch closing', () => {
  it('will not close while anything is still in flight', () => {
    const close = fn(PAYOUT, 'gellatti_close_payout_batch_v1');
    expect(close).toContain("status in ('pending', 'processing')");
    expect(close).toContain('inFlight');
  });

  it('distinguishes a clean batch from one with failures', () => {
    const close = fn(PAYOUT, 'gellatti_close_payout_batch_v1');
    expect(close).toContain("'completed_with_errors'");
  });
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe('scheduling — production actually invokes these', () => {
  it('schedules a daily and a monthly job through pg_cron', () => {
    expect(SCHED).toContain("cron.schedule(\n  'gellatti-partner-daily'");
    expect(SCHED).toContain("cron.schedule(\n  'gellatti-partner-monthly'");
  });

  it('the monthly job runs on the 1st', () => {
    expect(SCHED).toMatch(/'gellatti-partner-monthly',\s*\n\s*'\d+ \d+ 1 \* \*'/);
  });

  it('writes the tier snapshot BEFORE building the payout batch', () => {
    expect(SCHED.indexOf('tier_snapshots')).toBeLessThan(SCHED.indexOf('payout_batch_test'));
  });

  it('unschedules before scheduling, so the migration is re-runnable', () => {
    expect(SCHED).toContain("cron.unschedule('gellatti-partner-daily')");
    expect(SCHED).toContain("cron.unschedule('gellatti-partner-monthly')");
  });

  it('runs after the Madrid month boundary in both DST states', () => {
    expect(SCHED_RAW).toContain('02:30 UTC is 03:30/04:30 Madrid');
  });
});

describe('scheduling — recoverable, idempotent, observable', () => {
  it('records every invocation with its result', () => {
    expect(SCHED).toContain('create table if not exists public.partner_job_runs');
    expect(SCHED).toContain('result jsonb');
    expect(SCHED).toContain('error_message text');
  });

  it('a failing job records the failure instead of aborting the cron transaction', () => {
    const wrapper = fn(SCHED, 'gellatti_run_partner_job_v1');
    expect(wrapper).toContain('exception when others then');
    expect(wrapper).toContain('ok = false');
    expect(wrapper).toContain('error_message = sqlerrm');
  });

  it('exposes the runs to Admin', () => {
    const admin = fn(SCHED, 'gellatti_admin_partner_job_runs_v1');
    expect(admin).toContain('gellatti_admin_has_permission_v1');
    expect(SCHED).toContain(
      'grant execute on function public.gellatti_admin_partner_job_runs_v1(text, integer) to authenticated',
    );
  });

  it('documents why a missed invocation self-heals', () => {
    expect(SCHED_RAW).toContain('recoverable');
    expect(SCHED_RAW).toContain('idempotence by construction');
  });

  it('the job-run table is service-role only', () => {
    expect(SCHED).toContain('alter table public.partner_job_runs enable row level security');
    expect(/grant (select|insert|update|delete)[^;]*partner_job_runs/i.test(SCHED)).toBe(false);
  });
});

describe('security posture', () => {
  it('no execution function is client-callable', () => {
    for (const name of [
      'gellatti_build_payout_batch_v1',
      'gellatti_claim_payout_lines_v1',
      'gellatti_mark_payout_paid_v1',
      'gellatti_mark_payout_failed_v1',
      'gellatti_transition_eligible_commissions_v1',
      'gellatti_assert_payout_allowed_v1',
      'gellatti_live_payouts_released_v1',
    ]) {
      expect(PAYOUT, name).toMatch(new RegExp(`revoke all on function public\\.${name}`));
      expect(new RegExp(`grant execute on function public\\.${name}`).test(PAYOUT), name).toBe(
        false,
      );
    }
  });

  it('only the admin read functions are granted', () => {
    expect(PAYOUT).toContain(
      'grant execute on function public.gellatti_admin_payout_batches_v1(integer) to authenticated',
    );
  });

  it('both migrations document a rollback', () => {
    expect(PAYOUT_RAW).toContain('ROLLBACK');
    expect(SCHED_RAW).toContain('ROLLBACK');
    expect(PAYOUT_RAW).toContain('Payout rows are NOT removed');
  });
});

// ---------------------------------------------------------------------------
// Owner acceptance point 4 — scheduler recovery after a MISSED invocation
// ---------------------------------------------------------------------------

const TIER_RAW = read('20260831202000_partner_tier_snapshot_writer.sql');
const TIER = TIER_RAW.replace(/--.*$/gm, '');
const CATCHUP = fn(TIER, 'gellatti_catchup_partner_tier_snapshots_v1');
const MISSING_BATCHES = fn(PAYOUT, 'gellatti_missing_payout_batch_months_v1');

describe('tier snapshots — a missed month is reconstructed, never guessed', () => {
  const ASOF = fn(TIER, 'gellatti_partner_referred_count_asof_v1');
  const STATE_ASOF = fn(TIER, 'gellatti_subscription_state_asof_v1');

  it('the plain writer alone would NOT repair a missed month', () => {
    const writer = fn(TIER, 'gellatti_write_partner_tier_snapshots_v1');
    expect(writer).toContain(
      "date_trunc('month', (p_count_at at time zone 'Europe/Madrid'))::date",
    );
  });

  it('THE OWNER RULING: the catch-up never uses today’s count', () => {
    // The rejected design called the live counter. The catch-up must call the
    // AS-OF counter and nothing else.
    expect(CATCHUP).toContain('gellatti_partner_referred_count_asof_v1');
    expect(CATCHUP).not.toContain('gellatti_partner_active_referred_count_v1(');
  });

  it('measures at Madrid midnight on the 1st — the same instant an on-time run would have used', () => {
    expect(CATCHUP).toContain("v_boundary := (v_month::timestamp at time zone 'Europe/Madrid')");
    expect(CATCHUP).toContain('v_boundary');
    // and never "now" for the count
    expect(CATCHUP).not.toMatch(/count_asof_v1\(v_partner\.id,\s*p_now\)/);
  });

  it('reconstructs subscription state from the retained Stripe event payloads', () => {
    expect(STATE_ASOF).toContain('from public.stripe_webhook_events');
    expect(STATE_ASOF).toContain("event_type like 'customer.subscription.%'");
  });

  it('orders by the payload’s own created time, not by when we received it', () => {
    // received_at is when WE got it, which is wrong for late or out-of-order delivery
    expect(STATE_ASOF).toContain("order by (e.payload->>'created')::bigint desc");
    expect(STATE_ASOF).not.toContain('received_at');
  });

  it('applies the same T3 eligibility rule to the reconstructed state', () => {
    expect(ASOF).toContain("st.status in ('active', 'trialing')");
    expect(ASOF).toContain("st.status = 'past_due'");
    expect(ASOF).toContain('st.current_period_end > p_at');
    expect(ASOF).toContain('cs.user_id <> p.user_id');
    expect(ASOF).toContain('count(distinct cs.id)');
  });

  it('never borrows a neighbouring month, the mirror, or a payload tier', () => {
    for (const forbidden of ['partners.tier', 'p.tier', 'lag(', 'lead(']) {
      expect(CATCHUP, forbidden).not.toContain(forbidden);
    }
  });

  it('Elite obeys the same historical-time rule', () => {
    expect(CATCHUP).toContain('gellatti_partner_elite_active_v1(v_partner.id, v_boundary)');
    expect(CATCHUP).not.toContain('gellatti_partner_elite_active_v1(v_partner.id, p_now)');
  });
});

describe('when reconstruction cannot be proven, NOTHING is written', () => {
  const BLOCKER = fn(TIER, 'gellatti_tier_reconstruction_blocker_v1');

  it('refuses when the boundary predates all event history', () => {
    expect(BLOCKER).toContain('boundary_predates_event_history');
    expect(BLOCKER).toContain('no_event_history');
  });

  it('refuses when any attributed subscription has no event at or before the boundary', () => {
    expect(BLOCKER).toContain('subscription_without_event_history');
    expect(BLOCKER).toContain('not exists');
  });

  it('the catch-up skips the partner entirely rather than writing a guess', () => {
    expect(CATCHUP).toContain('if v_blocker is not null then');
    expect(CATCHUP).toContain('continue;');
    // the insert must come AFTER the blocker check
    expect(CATCHUP.indexOf('v_blocker is not null')).toBeLessThan(
      CATCHUP.indexOf('insert into public.partner_tier_snapshots'),
    );
  });

  it('records a typed operational state instead', () => {
    expect(TIER).toContain('create table if not exists public.partner_tier_snapshot_gaps');
    expect(TIER).toContain("'historical_snapshot_reconciliation_required'");
    expect(CATCHUP).toContain('insert into public.partner_tier_snapshot_gaps');
  });

  it('the gap record is idempotent, so repeated runs do not pile up rows', () => {
    expect(CATCHUP).toContain('on conflict (partner_id, month) do nothing');
  });

  it('Admin can see the month, the partner, the reason and what it blocks', () => {
    const admin = fn(TIER, 'gellatti_admin_tier_snapshot_gaps_v1');
    expect(admin).toContain('g.month');
    expect(admin).toContain('g.partner_id');
    expect(admin).toContain('g.reason');
    expect(admin).toContain('affected_commission_entries');
    expect(admin).toContain('affected_amount_cents');
    expect(admin).toContain('gellatti_admin_has_permission_v1');
  });

  it('the partner’s rate is never silently degraded — no snapshot means deferral', () => {
    // dispatch.ts already defers on a missing snapshot; this asserts the
    // catch-up does not paper over that by inventing one.
    const dispatch = readFileSync(
      join(REPO, 'supabase', 'functions', 'stripe-webhook', 'dispatch.ts'),
      'utf8',
    );
    expect(dispatch).toContain('tier_snapshot_missing');
    expect(CATCHUP).not.toContain("'standard'::text");
  });
});

describe('payout batches — a missed month loses no money and is reported, not back-filled', () => {
  it('a skipped month is detectable', () => {
    expect(MISSING_BATCHES).toContain('generate_series');
    expect(MISSING_BATCHES).toContain('not exists');
    expect(MISSING_BATCHES).toContain('b.month = m.month');
  });

  it('nothing auto-creates a retroactive batch', () => {
    expect(MISSING_BATCHES).not.toContain('insert into public.payout_batches');
    // and the scheduler only ever builds the CURRENT month
    expect(SCHED).toContain('gellatti_build_payout_batch_v1(null, false)');
  });

  it('the money self-heals because entries stay eligible until settled', () => {
    // only a successful payout marks entries paid; a missed batch changes nothing
    expect(PAID).toContain("set status = 'paid'");
    expect(BUILD).toContain("ce.status = 'eligible'");
    expect(PAYOUT_RAW).toContain('the money self-heals and the batch row does not');
  });

  it('repeated invocation for the same month stays idempotent', () => {
    expect(BUILD).toContain('on conflict (month, currency, livemode) do nothing');
    expect(BUILD).toContain('on conflict (batch_id, partner_id) do nothing');
    expect(BUILD).toContain('batchCreated');
  });

  it('both gap reporters are service-role only', () => {
    expect(TIER).toMatch(/revoke all on function public\.gellatti_missing_tier_snapshot_months_v1/);
    expect(TIER).toMatch(
      /revoke all on function public\.gellatti_catchup_partner_tier_snapshots_v1/,
    );
    expect(PAYOUT).toMatch(
      /revoke all on function public\.gellatti_missing_payout_batch_months_v1/,
    );
  });
});

// ---------------------------------------------------------------------------
// Owner point E — the payout catch-up contract, pinned
// ---------------------------------------------------------------------------

describe('owner point E — a missed payout month cannot lose or duplicate money', () => {
  it('entries stay eligible until a payout actually settles them', () => {
    // only a successful settle marks them paid; a missed batch changes nothing
    expect(PAID).toContain("set status = 'paid'");
    expect(BUILD).toContain("ce.status = 'eligible'");
  });

  it('the next normal batch picks up whatever was left unsettled', () => {
    // the balance query selects eligible entries not yet linked to any payout,
    // so a month's worth simply rolls into the following batch
    expect(BUILD).toContain('not exists');
    expect(BUILD).toContain('i.commission_entry_id = ce.id');
  });

  it('each commission_entry_id can appear in at most ONE payout item, ever', () => {
    // the global partial-unique index in 0019 is the guarantee; the settle uses
    // on-conflict-do-nothing so a retry is harmless rather than a violation
    const payouts = read('20260716102429_0019_payouts.sql');
    expect(payouts).toContain('create unique index if not exists partner_payout_items_entry_uniq');
    expect(payouts).toContain('on public.partner_payout_items (commission_entry_id)');
    expect(PAID).toContain('on conflict do nothing');
  });

  it('the same holds for adjustments', () => {
    const payouts = read('20260716102429_0019_payouts.sql');
    expect(payouts).toContain(
      'create unique index if not exists partner_payout_items_adjustment_uniq',
    );
  });

  it('the Stripe idempotency key is deterministic, so a repeat cannot create a second transfer', () => {
    expect(BUILD).toContain(
      "v_month::text || ':' || partner_id::text || ':eur:' || case when p_livemode then 'live' else 'test' end",
    );
    // and the line carries it forward to the worker
    expect(CLAIM).toContain('idempotency_key');
  });

  it('a claimed line already carrying a transfer id is never re-claimed', () => {
    expect(CLAIM).toContain('pp.stripe_transfer_id is null');
  });

  it('repeated scheduler execution is a no-op at every level', () => {
    expect(BUILD).toContain('on conflict (month, currency, livemode) do nothing');
    expect(BUILD).toContain('on conflict (batch_id, partner_id) do nothing');
    expect(BUILD).toContain('pg_advisory_xact_lock');
    expect(CLAIM).toContain('for update skip locked');
  });

  it('the skipped period stays observable rather than being silently swallowed', () => {
    const missing = fn(PAYOUT, 'gellatti_missing_payout_batch_months_v1');
    expect(missing).toContain('not exists');
    expect(missing).toContain('b.month = m.month');
    // and every scheduled run is recorded either way
    expect(SCHED).toContain('create table if not exists public.partner_job_runs');
    expect(SCHED).toContain("'payout_batch_test'");
  });

  it('nothing invents a retroactive batch', () => {
    const missing = fn(PAYOUT, 'gellatti_missing_payout_batch_months_v1');
    expect(missing).not.toContain('insert into public.payout_batches');
    expect(SCHED).toContain('gellatti_build_payout_batch_v1(null, false)');
  });
});
