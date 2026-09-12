-- PARTNER TIER SNAPSHOT LIFECYCLE — P0 Affiliate reliability.
--
-- THE DEFECT. `partner_tier_snapshots` had no row for 2026-09, and BOTH
-- commission writers refuse without one:
--   dispatch.ts:297  Starter Pack   -> tier_snapshot_missing
--   dispatch.ts:828  subscriptions  -> tier_snapshot_missing
-- So any attributed paid order this month — pack OR subscription — would have
-- been accepted by Stripe and then deferred forever, because the refusal is
-- retryable and no retry worker exists. This was never Starter-Pack-specific.
--
-- WHY IT HAPPENED. The intended lifecycle already exists and is well designed:
-- 20260831203000_partner_scheduling.sql schedules a monthly job that runs a
-- CATCH-UP first and then writes the current month. That migration was never
-- applied, because it also schedules payout batches and depends on the payout
-- execution layer, which the owner is deliberately holding.
--
-- SO THIS APPLIES THE SNAPSHOT HALF ONLY, using the SAME functions, the SAME
-- catch-up-first ordering and the SAME observability table as that migration,
-- so applying the full scheduling file later is compatible rather than a
-- conflict. No parallel tier system is introduced, and nothing here can move
-- money: it only writes (partner, month, tier) rows.

-- Observability, byte-compatible with 20260831203000.
create table if not exists public.partner_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  result jsonb,
  error_message text
);

create index if not exists partner_job_runs_recent_idx
  on public.partner_job_runs (job_name, started_at desc);

alter table public.partner_job_runs enable row level security;
-- No policies, no grants: the scheduler writes as owner, Admin reads via RPC.

-- ── the job ────────────────────────────────────────────────────────────────
-- CATCH-UP FIRST, then the current month. That order is what makes a missed
-- run self-healing: the catch-up finds every month lacking a snapshot and
-- fills it, so a gap can never strand a commission, and only then is the
-- current month written.
--
-- Idempotent by construction: both functions are keyed on (partner, month)
-- with on-conflict-do-nothing, so a duplicate invocation — two schedulers, a
-- manual run, a retry — writes nothing the second time. The advisory lock
-- makes concurrent invocations serialise rather than race at the month
-- boundary; a loser simply records that it was skipped.
create or replace function public.gellatti_partner_tier_snapshot_job_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid;
  v_catchup jsonb;
  v_current jsonb;
begin
  if not pg_try_advisory_lock(hashtext('gellatti_partner_tier_snapshot_job')) then
    insert into public.partner_job_runs (job_name, finished_at, ok, result)
    values ('tier_snapshots', now(), true, jsonb_build_object('skipped', 'already_running'));
    return jsonb_build_object('ok', true, 'skipped', 'already_running');
  end if;

  insert into public.partner_job_runs (job_name) values ('tier_snapshots') returning id into v_run;
  begin
    v_catchup := public.gellatti_catchup_partner_tier_snapshots_v1();
    v_current := public.gellatti_write_partner_tier_snapshots_v1();
    update public.partner_job_runs
      set finished_at = now(), ok = true,
          result = jsonb_build_object('catchup', v_catchup, 'current', v_current)
      where id = v_run;
    perform pg_advisory_unlock(hashtext('gellatti_partner_tier_snapshot_job'));
    return jsonb_build_object('ok', true, 'catchup', v_catchup, 'current', v_current);
  exception when others then
    update public.partner_job_runs
      set finished_at = now(), ok = false, error_message = sqlerrm
      where id = v_run;
    perform pg_advisory_unlock(hashtext('gellatti_partner_tier_snapshot_job'));
    raise;
  end;
end;
$$;

revoke all on function public.gellatti_partner_tier_snapshot_job_v1() from public, anon, authenticated;

-- ── schedule ───────────────────────────────────────────────────────────────
-- DAILY, not monthly. The monthly-only schedule in 20260831203000 is correct
-- for a system that never misses, but one missed run on the 1st leaves the
-- whole month without a snapshot and every commission in it deferred. Running
-- daily costs nothing — the second run of a month writes nothing — and turns a
-- missed invocation into at most a few hours of exposure instead of a month.
--
-- 02:30 UTC is 03:30/04:30 in Madrid in both DST states, safely after the
-- local midnight the month boundary is measured against.
do $$ begin perform cron.unschedule('gellatti-partner-tier-snapshots');
exception when others then null; end $$;

select cron.schedule(
  'gellatti-partner-tier-snapshots',
  '30 2 * * *',
  $cron$select public.gellatti_partner_tier_snapshot_job_v1()$cron$
);
