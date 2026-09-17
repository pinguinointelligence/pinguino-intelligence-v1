-- ============================================================================
-- ROLLBACK for 20260918130000_stripe_recovery_scheduler
-- ============================================================================
-- Removes the schedule, the tick and the backlog reader. pg_net is left alone
-- (other work uses it), and no webhook event, commission entry or adjustment is
-- read, written or deleted.
--
-- After this, nothing retries a parked delivery again: an event whose
-- dependency is missing stays `received` with its reason, exactly as before.

do $rollback$
begin
  if exists (select 1 from cron.job where jobname = 'gellatti-stripe-recovery') then
    perform cron.unschedule('gellatti-stripe-recovery');
  end if;
end
$rollback$;

drop function if exists public.gellatti_admin_webhook_backlog_v1(integer);
drop function if exists public.gellatti_stripe_recovery_tick_v1();
