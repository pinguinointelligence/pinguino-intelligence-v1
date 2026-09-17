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

drop table if exists public.partner_job_runs;

commit;
