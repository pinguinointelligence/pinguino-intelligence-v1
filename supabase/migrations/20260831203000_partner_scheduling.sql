-- ============================================================================
-- GELLATTI — WORK WITH US: how production actually INVOKES the partner jobs
-- ============================================================================
-- Owner authority, 2026-08-31: "Do not merely create callable functions. Prove
-- how the production architecture will invoke ... Scheduling must be
-- recoverable after a missed invocation, idempotent, observable in Admin/logs,
-- and safe under duplicate execution."
--
-- ── WHY EVERY JOB HERE IS NATURALLY RECOVERABLE ─────────────────────────────
-- None of these jobs asks "what happened since I last ran". Every one is keyed
-- on a PERIOD or on a TIMESTAMP COMPARISON, so a missed invocation is repaired
-- simply by running again:
--
--   tier snapshot      keyed on (partner, month) + on-conflict-do-nothing, so
--                      running twice writes nothing the second time. But the
--                      writer derives the CURRENT month, so a missed February
--                      would otherwise never be written at all — and a February
--                      commission would defer forever. The monthly job therefore
--                      runs a CATCH-UP first, which finds every month lacking a
--                      snapshot and fills it. See the honesty note in
--                      20260831202000 about what a late count can and cannot
--                      know.
--   eligibility        `where status = 'held' and eligible_at <= now()`.
--                      A missed day simply promotes more entries next run.
--   payout batch       keyed on (month, currency, livemode) + advisory lock +
--                      on-conflict-do-nothing. A missed month loses NO money:
--                      entries stay 'eligible' until a payout settles them, so
--                      the next batch pays them. The skipped month is reported
--                      by gellatti_missing_payout_batch_months_v1 rather than
--                      back-filled, because a retroactive batch would compete
--                      for the same entries and add nothing.
--   payout transfer    claimed with `for update skip locked`; the deterministic
--                      idempotency key is also sent to Stripe.
--   reconciliation     reads Stripe as the truth for ambiguous lines; it never
--                      assumes an outcome.
--
-- That is the whole safety argument: idempotence by construction, not by a
-- "have I run today?" flag that itself becomes state to get wrong.
--
-- ── OBSERVABILITY ────────────────────────────────────────────────────────────
-- Every invocation writes a partner_job_runs row with its result payload, so a
-- missed or failing job is visible in Admin rather than only in pg_cron's log.

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
-- No policies, no grants: service role writes, Admin reads via the function.

-- ── The wrapper every scheduled job goes through ─────────────────────────────
-- Records the run whether it succeeds or fails, and never lets one job's
-- failure abort the others.
--
-- SECURITY: the job is chosen from a FIXED ALLOWLIST, not passed in as SQL.
-- An earlier draft took the statement as a parameter and `execute`d it; that is
-- arbitrary dynamic SQL inside a SECURITY DEFINER function, and even though the
-- function is revoked from every client role it is not a shape worth keeping in
-- a financial path. The caller now names a job; this function decides what that
-- means.
create or replace function public.gellatti_run_partner_job_v1(
  p_job_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid;
  v_result jsonb;
begin
  -- Allowlist: an unknown name is refused before anything is recorded or run.
  if p_job_name not in ('commission_eligibility', 'tier_snapshots', 'tier_snapshot_catchup', 'payout_batch_test') then
    raise exception 'unknown_partner_job:%', p_job_name;
  end if;

  insert into public.partner_job_runs (job_name) values (p_job_name) returning id into v_run;
  begin
    v_result := case p_job_name
      when 'commission_eligibility' then public.gellatti_transition_eligible_commissions_v1()
      when 'tier_snapshots'         then public.gellatti_write_partner_tier_snapshots_v1()
      -- Repairs any month a missed invocation left without a snapshot. Runs
      -- FIRST each month so an old gap is closed before the new month is written.
      when 'tier_snapshot_catchup'  then public.gellatti_catchup_partner_tier_snapshots_v1()
      -- p_livemode => false. A live batch additionally requires the owner
      -- release, so no scheduled path can move real money.
      when 'payout_batch_test'      then public.gellatti_build_payout_batch_v1(null, false)
    end;
    update public.partner_job_runs
      set finished_at = now(), ok = true, result = v_result
      where id = v_run;
    return jsonb_build_object('job', p_job_name, 'ok', true, 'result', v_result);
  exception when others then
    update public.partner_job_runs
      set finished_at = now(), ok = false, error_message = sqlerrm
      where id = v_run;
    -- Swallow deliberately: a scheduled job that raises would abort the whole
    -- cron transaction and hide the failure. The run row IS the alarm.
    return jsonb_build_object('job', p_job_name, 'ok', false, 'error', sqlerrm);
  end;
end $$;

revoke all on function public.gellatti_run_partner_job_v1(text) from public, anon, authenticated;

-- ── The daily/monthly entry points ───────────────────────────────────────────
-- Daily: promote whatever has matured. Cheap, idempotent, and self-healing
-- after any missed day.
create or replace function public.gellatti_partner_daily_jobs_v1()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'eligibility',
    public.gellatti_run_partner_job_v1('commission_eligibility')
  );
$$;

revoke all on function public.gellatti_partner_daily_jobs_v1() from public, anon, authenticated;

-- Monthly, on the 1st, in ORDER: the tier snapshot must exist before the payout
-- batch, because a commission's tier — and therefore its amount — is resolved
-- from that month's snapshot.
--
-- TEST MODE ONLY by default: the batch is built with p_livemode => false.
-- A live batch additionally requires the owner release
-- (gellatti_assert_payout_allowed_v1), so nothing here can move real money.
create or replace function public.gellatti_partner_monthly_jobs_v1()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- catch-up BEFORE the current month, so a missed period is repaired first
    'tierSnapshotCatchup',
    public.gellatti_run_partner_job_v1('tier_snapshot_catchup'),
    'tierSnapshots',
    public.gellatti_run_partner_job_v1('tier_snapshots'),
    'eligibility',
    public.gellatti_run_partner_job_v1('commission_eligibility'),
    'payoutBatch',
    public.gellatti_run_partner_job_v1('payout_batch_test')
  );
$$;

revoke all on function public.gellatti_partner_monthly_jobs_v1() from public, anon, authenticated;

-- ── pg_cron schedules ────────────────────────────────────────────────────────
-- pg_cron is already enabled in this project (20260813110400). Schedules are
-- UTC. Europe/Madrid is UTC+1/+2, so 02:30 UTC is 03:30/04:30 Madrid — safely
-- after midnight local in both DST states, which matters because the month
-- boundary is a Madrid boundary.
--
-- Unscheduling first makes this migration re-runnable.
do $$
begin
  perform cron.unschedule('gellatti-partner-daily');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('gellatti-partner-monthly');
exception when others then null;
end $$;

select cron.schedule(
  'gellatti-partner-daily',
  '30 2 * * *',
  $cron$select public.gellatti_partner_daily_jobs_v1()$cron$
);

select cron.schedule(
  'gellatti-partner-monthly',
  '45 2 1 * *',
  $cron$select public.gellatti_partner_monthly_jobs_v1()$cron$
);

-- The transfer worker and the reconciler are EDGE FUNCTIONS, not SQL: they talk
-- to Stripe. They are invoked by the same pg_cron using pg_net, or by an
-- external scheduler hitting the function URL with the service role. Both are
-- safe to fire repeatedly because the claim is `for update skip locked` and the
-- Stripe call carries the deterministic idempotency key. That wiring needs the
-- deployed function URL, so it is configured at deploy time rather than pinned
-- in a migration that would then carry an environment-specific URL.

-- ── Admin observability ──────────────────────────────────────────────────────
create or replace function public.gellatti_admin_partner_job_runs_v1(
  p_job_name text default null,
  p_limit integer default 100
) returns table (
  id uuid, job_name text, started_at timestamptz, finished_at timestamptz,
  ok boolean, result jsonb, error_message text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', auth.uid()) then
    raise exception 'administrator_required';
  end if;
  return query
    select r.id, r.job_name, r.started_at, r.finished_at, r.ok, r.result, r.error_message
    from public.partner_job_runs r
    where p_job_name is null or r.job_name = p_job_name
    order by r.started_at desc
    limit greatest(coalesce(p_limit, 100), 1);
end $$;

revoke all on function public.gellatti_admin_partner_job_runs_v1(text, integer) from public, anon;
grant execute on function public.gellatti_admin_partner_job_runs_v1(text, integer) to authenticated;

-- ── GRANT SURFACE ───────────────────────────────────────────────────────────
-- The project carries ALTER DEFAULT PRIVILEGES on schema public granting ALL
-- (`arwdDxtm`) on every NEW table to anon and authenticated. A new table is
-- therefore fully writable by any signed-in user the moment it is created, and
-- omitting a grant achieves nothing. RLS contains it, but a table that decides
-- money or holds personal data should not have RLS as its ONLY barrier.
-- Found live after 20260831200500; see
-- 20260831200600_partner_rate_profiles_grant_surface.sql for the full evidence.
revoke all on public.partner_job_runs from anon, authenticated;
-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
--   select cron.unschedule('gellatti-partner-daily');
--   select cron.unschedule('gellatti-partner-monthly');
--   drop function if exists public.gellatti_admin_partner_job_runs_v1(text, integer);
--   drop function if exists public.gellatti_partner_monthly_jobs_v1();
--   drop function if exists public.gellatti_partner_daily_jobs_v1();
--   drop function if exists public.gellatti_run_partner_job_v1(text);
--   drop table if exists public.partner_job_runs;
-- Unscheduling stops tier snapshots being written, which stops commissions
-- resolving a tier. Do it knowingly.
-- ============================================================================
