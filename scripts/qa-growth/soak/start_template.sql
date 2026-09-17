-- Template: replace __RUN_ID__ with a fresh uuid and __RUN8__ with its first 8 characters.
-- QA ONLY: start the 72h payout executor soak.
do $start$
declare
  v_run uuid := '__RUN_ID__';
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  u uuid; p uuid; i integer; v_col text;
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg' and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b') then
    raise exception 'isolation guard: not the QA branch';
  end if;
  if exists (select 1 from qa_harness.runs where kind = 'SOAK_DB_PAYOUT' and status = 'RUNNING') then
    raise exception 'a payout soak is already running';
  end if;
  if exists (select 1 from public.commission_entries where status in ('held', 'eligible') and not livemode) then
    raise exception 'open test-mode entries exist; the soak builds would sweep them';
  end if;
  -- Tick windows are centred on the */5 prepare runs, so a few seconds of cron
  -- jitter can never fold two runs into one tick.
  v_start := date_trunc('minute', v_now) - make_interval(mins => extract(minute from v_now)::integer % 5)
             + interval '5 minutes' - interval '150 seconds';
  insert into qa_harness.runs (run_id, kind, label, status, started_at, params) values (
    v_run, 'SOAK_DB_PAYOUT', '72h payout executor soak (QA DB, pg_cron): two claimers, crashed claimer, corrections, retries', 'RUNNING', v_start,
    jsonb_build_object(
      'plannedEnd', v_start + interval '72 hours',
      'tickSeconds', 300, 'partners', 4, 'thresholdCents', 2500,
      'faults', jsonb_build_object('refund_between_build_and_claim', 'tick % 7 = 3', 'claimer_aborted', 'tick % 11 = 5', 'refund_after_payout', 'tick % 13 = 7'),
      'passRule', 'after >= 72h: zero failing ticks, zero missed ticks, no gap > 15 min between settle heartbeats',
      'script', 'scripts/qa-growth/soak/payout_soak.sql', 'scope', 'DB payout executor only; the Stripe / Test Clock campaign is a separate run'));
  for i in 1..4 loop
    u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa.soak.__RUN8__.s' || i || '@example.invalid', now(),
              '{"provider":"email","providers":["email"]}', '{"qa_fixture":"payout_soak"}', now(), now());
    for v_col in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
        and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'email_change', 'phone_change', 'phone_change_token', 'reauthentication_token') loop
      execute format('update auth.users set %I = '''' where id = $1 and %I is null', v_col, v_col) using u;
    end loop;
    insert into public.partners (user_id, status, stripe_connect_account_id, onboarding_complete, payouts_enabled)
      values (u, 'active', 'acct_qasoak___RUN8__' || '_s' || i, true, true) returning id into p;
    insert into qa_harness.soak_model (run_id, label, partner_id) values (v_run, 'S' || i, p);
    insert into qa_harness.fixtures (run_id, kind, object_id, label) values (v_run, 'auth_user', u::text, 'S' || i), (v_run, 'partner', p::text, 'S' || i);
  end loop;
  perform qa_harness.soak_beat_v1(v_run, 'start', 'ok', jsonb_build_object('startedAt', v_start, 'plannedEnd', v_start + interval '72 hours'));
end $start$;
select cron.schedule('qa-soak-__RUN8__-prepare', '*/5 * * * *', $c$select qa_harness.soak_prepare_v1('__RUN_ID__')$c$) as prepare,
       cron.schedule('qa-soak-__RUN8__-claim-a', '1-59/5 * * * *', $c$select qa_harness.soak_claim_v1('__RUN_ID__', 'A')$c$) as claim_a,
       cron.schedule('qa-soak-__RUN8__-claim-b', '1-59/5 * * * *', $c$select qa_harness.soak_claim_v1('__RUN_ID__', 'B')$c$) as claim_b,
       cron.schedule('qa-soak-__RUN8__-claim-c', '1-59/5 * * * *', $c$begin; set local statement_timeout = '4s'; select qa_harness.soak_claim_v1('__RUN_ID__', 'C'); commit;$c$) as claim_c,
       cron.schedule('qa-soak-__RUN8__-settle', '2-59/5 * * * *', $c$select qa_harness.soak_settle_v1('__RUN_ID__')$c$) as settle,
       cron.schedule('qa-soak-__RUN8__-monitor', '17 * * * *', $c$select qa_harness.soak_monitor_v1('__RUN_ID__')$c$) as monitor;
