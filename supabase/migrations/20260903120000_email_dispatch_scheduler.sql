-- ─────────────────────────────────────────────────────────────────────────────
-- Email dispatch scheduler — the caller that was never built.
--
-- FINDING (2026-09-03). `email_jobs` had a complete state machine, a claim with
-- `for update skip locked`, backoff, and a deployed `email-dispatch` worker —
-- and NOTHING that ever called it. `cron.job` held two jobs, both plain SQL
-- (product-behaviour reclassification, partner tier snapshots); `pg_net` was
-- not installed, so no scheduled job in this project could make an HTTP call at
-- all. Every queued Gellatti email simply sat there.
--
-- 20260831203000_partner_scheduling.sql already recorded the intended shape —
-- "invoked by the same pg_cron using pg_net ... configured at deploy time
-- rather than pinned in a migration that would then carry an
-- environment-specific URL". That deploy-time configuration never happened, so
-- the Stripe transfer worker and reconciler are unscheduled for the same
-- reason. This migration builds the mechanism that intent describes; wiring the
-- other workers onto it is a separate change.
--
-- INERT UNTIL CONFIGURED. The tick reads its endpoint and credential from Vault
-- BY NAME and returns `not_configured` when either is absent. Applying this
-- migration therefore changes no behaviour in any environment — including
-- Production — until someone deliberately adds the two secrets. That is also
-- why the credential is not pinned here: a migration must not carry one.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net with schema extensions;

create or replace function public.gellatti_dispatch_email_queue_tick_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_base_url    text;
  v_dispatch_key text;
  v_due         integer;
  v_request_id  bigint;
begin
  -- Configuration lives in Vault, by name. Absent => do nothing, loudly enough
  -- to be visible in cron.job_run_details but with no side effect.
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'gellatti_edge_functions_base_url';
  select decrypted_secret into v_dispatch_key
    from vault.decrypted_secrets where name = 'gellatti_edge_dispatch_key';

  if coalesce(v_base_url, '') = '' or coalesce(v_dispatch_key, '') = '' then
    return jsonb_build_object('skipped', 'not_configured');
  end if;

  /* Only call the worker when there is genuinely something to do.
     This predicate MIRRORS `gellatti_claim_email_jobs_v1`, which remains the
     authority on what "due" means — the two are pinned together by
     emailDispatchScheduler.test.ts. Checking here is what keeps an idle queue
     from waking the function every five minutes forever, and it is the second
     half of the "do not hammer while a credential is missing" rule: the worker
     itself now refuses to CLAIM without a provider key, so a missing
     RESEND_API_KEY costs one cheap no-op request rather than five spent
     attempts and an abandoned job. */
  select count(*) into v_due
    from public.email_jobs
   where status in ('queued', 'failed')
     and attempts < max_attempts
     and (next_attempt_at is null or next_attempt_at <= now());

  if v_due = 0 then
    return jsonb_build_object('skipped', 'nothing_due');
  end if;

  -- `verify_jwt = true` on the worker: the Authorization header must carry a
  -- valid project JWT. net.http_post is fire-and-forget; the response lands in
  -- net._http_response, and the real outcome is recorded on the jobs
  -- themselves, so nothing here needs to block on it.
  select net.http_post(
    url     => rtrim(v_base_url, '/') || '/email-dispatch',
    body    => '{}'::jsonb,
    headers => jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_dispatch_key
               ),
    timeout_milliseconds => 20000
  ) into v_request_id;

  return jsonb_build_object('dispatched', true, 'due', v_due, 'requestId', v_request_id);
end $$;

comment on function public.gellatti_dispatch_email_queue_tick_v1() is
  'Scheduled caller for the email-dispatch Edge Function. Inert until the Vault '
  'secrets gellatti_edge_functions_base_url and gellatti_edge_dispatch_key exist.';

-- Operator-only: this drives outbound mail and must not be reachable from a
-- client session, the same posture as the partner job functions.
revoke all on function public.gellatti_dispatch_email_queue_tick_v1()
  from public, anon, authenticated;

-- ── Schedule ────────────────────────────────────────────────────────────────
-- Every 5 minutes. Mail is not latency-critical and the backoff ladder starts
-- at 60s, so a tighter cadence would only add empty passes. Unscheduling first
-- keeps the migration re-runnable, matching 20260831203000.
do $$
begin
  perform cron.unschedule('gellatti-email-dispatch');
exception when others then null;
end $$;

select cron.schedule(
  'gellatti-email-dispatch',
  '*/5 * * * *',
  $cron$select public.gellatti_dispatch_email_queue_tick_v1()$cron$
);
