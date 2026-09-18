-- ============================================================================
-- The retry worker the webhook always assumed
-- ============================================================================
-- STATUS: READY / WAITING FOR OWNER DB APPROVAL — NOT APPLIED.
--
-- stripe-webhook answers Stripe 200 as soon as a delivery is durably stored,
-- then applies its effects. When an effect cannot run yet — the paid invoice
-- arrived before its subscription, the month's tier snapshot does not exist,
-- a refund landed before the commission was booked — the row is left `received`
-- with the reason in `last_error`, for "the retry worker". There was no retry
-- worker. Measured on the QA branch: a renewal paid after the Madrid month
-- turned over sat at `tier_snapshot_missing:2026-10-01` and its commission was
-- never booked.
--
-- This schedules the existing caller shape: pg_net + pg_cron presenting the
-- dispatch key from Vault BY NAME, exactly as gellatti-email-dispatch does, so
-- it is INERT in every environment until those two secrets exist.
--
-- THE WINDOW, and why it is hours rather than five attempts. The tier snapshot
-- is written by a nightly job at 02:30 UTC while the Madrid month turns over at
-- 22:00/23:00 UTC the previous day, so a renewal paid inside that gap waits
-- three to four and a half hours for its dependency. A five-attempt budget over
-- fifteen minutes would throw that commission away. The worker retries with
-- exponential backoff (1, 2, 4, 8, 16 minutes, then every 30) for 72 hours and
-- then marks the row `dead_letter` — escalated and visible, never dropped.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- One entry point for both modes: the schedule calls it with no arguments, an
-- operator calls it with `reconcile` when a repair is needed. The credential
-- never leaves the database either way.
drop function if exists public.gellatti_stripe_recovery_tick_v1();

create or replace function public.gellatti_stripe_recovery_tick_v1(
  p_mode text default 'retry',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_base_url text;
  v_dispatch_key text;
  v_due integer;
  v_request_id bigint;
begin
  if p_mode not in ('retry', 'reconcile') then
    raise exception 'unknown recovery mode: %', p_mode;
  end if;
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'gellatti_edge_functions_base_url';
  select decrypted_secret into v_dispatch_key
    from vault.decrypted_secrets where name = 'gellatti_edge_dispatch_key';

  -- Inert until an operator deliberately configures it: no endpoint, no key,
  -- no call, and the cron run still succeeds so the absence is visible.
  if v_base_url is null or v_dispatch_key is null then
    return jsonb_build_object('skipped', 'not_configured');
  end if;

  -- The SAME due rule the worker applies, so the two cannot drift: a delivery
  -- that already recorded a failure, whose backoff has elapsed.
  if p_mode = 'retry' then
    select count(*) into v_due
      from public.stripe_webhook_events e
     where e.state in ('received', 'failed')
       and e.attempts > 0
       and e.updated_at <= now() - make_interval(secs => least(60 * power(2, greatest(e.attempts - 1, 0)), 1800));
    if v_due = 0 then
      return jsonb_build_object('skipped', 'nothing_due');
    end if;
  end if;

  select net.http_post(
    url => rtrim(v_base_url, '/') || '/stripe-recovery',
    body => jsonb_build_object('mode', p_mode) || coalesce(p_payload, '{}'::jsonb),
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_dispatch_key
    ),
    timeout_milliseconds => 30000
  ) into v_request_id;

  return jsonb_build_object('dispatched', true, 'mode', p_mode, 'due', v_due, 'requestId', v_request_id);
end
$$;

revoke all on function public.gellatti_stripe_recovery_tick_v1(text, jsonb) from public, anon, authenticated;

-- ── what is stuck, for a human ───────────────────────────────────────────────
-- A retry that keeps failing must be visible without a SQL console. Read-only,
-- admin-gated, and it never exposes the payload — just what failed and for how
-- long.
create or replace function public.gellatti_admin_webhook_backlog_v1(
  p_limit integer default 50
) returns table (
  event_id text,
  event_type text,
  state text,
  attempts integer,
  last_error text,
  received_at timestamptz,
  updated_at timestamptz,
  waiting_minutes integer
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
    select e.event_id, e.event_type, e.state, e.attempts, e.last_error, e.received_at, e.updated_at,
           (extract(epoch from (now() - e.received_at)) / 60)::integer
      from public.stripe_webhook_events e
     where e.state in ('received', 'failed', 'dead_letter')
       and e.attempts > 0
     order by e.received_at asc
     limit greatest(coalesce(p_limit, 50), 1);
end
$$;

revoke all on function public.gellatti_admin_webhook_backlog_v1(integer) from public, anon;
grant execute on function public.gellatti_admin_webhook_backlog_v1(integer) to authenticated;

-- ── schedule ────────────────────────────────────────────────────────────────
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'gellatti-stripe-recovery') then
    perform cron.unschedule('gellatti-stripe-recovery');
  end if;
end
$schedule$;

select cron.schedule(
  'gellatti-stripe-recovery',
  '*/5 * * * *',
  $cron$select public.gellatti_stripe_recovery_tick_v1()$cron$
);
