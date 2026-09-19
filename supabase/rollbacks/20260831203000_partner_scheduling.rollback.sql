-- ============================================================================
-- ROLLBACK for 20260831203000_partner_scheduling
-- ============================================================================
-- Removes the partner job scheduler and nothing else: its two pg_cron schedules,
-- its four functions and its job-run log. No commission, payout, partner or
-- entitlement row is touched.
--
-- WHAT IS LOST. public.partner_job_runs is an operational log (which job ran,
-- when, and what it returned). Dropping it removes that history; no money,
-- entitlement or decision is recorded there. Export it first if it is wanted.
-- It is kept when the applied tier-snapshot job still exists, because that job
-- writes to the same table (see the guard below).
--
-- ORDER. Roll this back BEFORE 20260831202500_payout_execution, whose rollback
-- refuses while these functions exist: the monthly job calls payout functions.

begin;

select cron.unschedule(j.jobid)
  from cron.job j
  where j.jobname in ('gellatti-partner-daily', 'gellatti-partner-monthly');

drop function if exists public.gellatti_admin_partner_job_runs_v1(text, integer);
drop function if exists public.gellatti_partner_monthly_jobs_v1();
drop function if exists public.gellatti_partner_daily_jobs_v1();
drop function if exists public.gellatti_run_partner_job_v1(text);

-- partner_job_runs is NOT this migration's alone. The applied tier-snapshot
-- lifecycle (gellatti_partner_tier_snapshot_job_v1, daily at 02:30) writes a
-- row on every run and creates the table with `create table if not exists`.
-- Dropping it there leaves that job failing every night with "relation
-- public.partner_job_runs does not exist" — no snapshots, and every commission
-- of the month deferred on tier_snapshot_missing. So the table goes only when
-- nothing else writes it.
do $keep$
begin
  if to_regprocedure('public.gellatti_partner_tier_snapshot_job_v1()') is not null then
    raise notice 'partner_job_runs kept: the applied tier-snapshot job still writes to it';
  else
    execute 'drop table if exists public.partner_job_runs';
  end if;
end
$keep$;

commit;
