-- ROLLBACK for 20260903120000_email_dispatch_scheduler.sql
--
-- Removes the scheduled caller and its tick. It does NOT drop pg_net (other
-- work may already rely on the extension) and it touches no email_jobs row:
-- the queue keeps whatever state it had, and simply stops being drained.
--
-- After this, nothing calls email-dispatch: queued mail waits for a caller.
do $rollback$
begin
  if exists (select 1 from cron.job where jobname = 'gellatti-email-dispatch') then
    perform cron.unschedule('gellatti-email-dispatch');
  end if;
end
$rollback$;

drop function if exists public.gellatti_dispatch_email_queue_tick_v1();
