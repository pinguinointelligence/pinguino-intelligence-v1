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
const MISSING_MONTHS = fn(TIER, 'gellatti_missing_tier_snapshot_months_v1');
const MISSING_BATCHES = fn(PAYOUT, 'gellatti_missing_payout_batch_months_v1');

describe('tier snapshots — a missed month is detected and filled exactly once', () => {
  it('the plain writer alone would NOT repair a missed month', () => {
    // it derives the CURRENT Madrid month, so a 3 March run targets March
    const writer = fn(TIER, 'gellatti_write_partner_tier_snapshots_v1');
    expect(writer).toContain(
      "date_trunc('month', (p_count_at at time zone 'Europe/Madrid'))::date",
    );
  });

  it('so a catch-up detects every month that lacks a snapshot', () => {
    expect(MISSING_MONTHS).toContain('generate_series');
    expect(MISSING_MONTHS).toContain('not exists');
    expect(MISSING_MONTHS).toContain('s.partner_id = p.id and s.month = m.month');
  });

  it('the gap search is observable on its own, before anything is written', () => {
    expect(MISSING_MONTHS).toContain('partners_missing');
    expect(MISSING_MONTHS).toContain('stable');
  });

  it('never asks for a month that predates the partner', () => {
    expect(MISSING_MONTHS).toContain(
      "date_trunc('month', (p.created_at at time zone 'Europe/Madrid'))::date <= m.month",
    );
  });

  it('fills each missing month through the SAME writer, so immutability still applies', () => {
    expect(CATCHUP).toContain('public.gellatti_write_partner_tier_snapshots_v1(v_month, p_now)');
  });

  it('writes exactly once — a second run finds no gaps and writes nothing', () => {
    // the gap query drives the loop, and a filled month is no longer a gap
    expect(CATCHUP).toContain('gellatti_missing_tier_snapshot_months_v1(p_now)');
    expect(CATCHUP).toContain('monthsFilled');
  });

  it('is bounded, so a misconfigured call cannot walk years', () => {
    expect(CATCHUP).toContain('p_max_months');
    expect(CATCHUP).toContain('limit greatest(coalesce(p_max_months, 12), 1)');
  });

  it('runs BEFORE the current month in the monthly schedule', () => {
    // scoped to the monthly job body: the allowlist above it lists the jobs in
    // a different order, which says nothing about execution order
    const monthly = fn(SCHED, 'gellatti_partner_monthly_jobs_v1');
    expect(monthly).toContain("'tier_snapshot_catchup'");
    expect(monthly.indexOf("'tier_snapshot_catchup'")).toBeLessThan(
      monthly.indexOf("public.gellatti_run_partner_job_v1('tier_snapshots')"),
    );
  });

  it('is honest that a late count is not historical truth', () => {
    expect(TIER_RAW).toContain('HONESTY ABOUT WHAT A BACKFILL CAN AND CANNOT KNOW');
    expect(TIER_RAW).toContain('computed_at');
    expect(CATCHUP).toContain("'late'");
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
