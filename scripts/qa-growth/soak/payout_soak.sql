-- ============================================================================
-- QA ONLY — 72-hour payout executor soak on the Growth QA branch.
-- ============================================================================
-- Refuses to run anywhere except project ncmsonfwbgsqedgnzofg / branch
-- 14d26da6-6ce1-404d-87b7-449f1cbd700b. Re-runnable (create or replace).
--
-- WHAT IT IS. A real executor, driven by pg_cron in the QA database, that
-- repeats the payout lifecycle every 5 minutes for at least 72 hours against the
-- functions applied on this branch (packages P7a/P7b/P7c):
--   :00 prepare  — one new 3000 entry per soak partner, build a batch for this
--                  tick's synthetic month, maybe inject a correction
--   :01 claim A, claim B — two concurrent sessions, 2 lines each
--   :01 claim C  — on fault ticks only: claims, then is killed by
--                  statement_timeout before it commits (a crashed worker)
--   :02 settle   — restart path (claim what is still pending), settle every
--                  processing line, retry the same transfer (no-op), try another
--                  transfer (refused), maybe inject a refund after payout, then
--                  VERIFY the tick against an independent ledger model
--   :17 monitor  — hourly: heartbeat gaps, missed and failing ticks; after the
--                  planned end it sets PASSED or FAILED and unschedules itself
--
-- THE MODEL. qa_harness.soak_model keeps each soak partner's expected unpaid
-- balance, moved only by what the soak itself did (+3000 entry, −500 partial
-- refund, −3000 refund after payout, −amount paid). Before each build the model
-- says what the build must decide per partner: pending for ≥ 2500 (paid, or
-- failed stale when a correction lands between build and claim),
-- skipped_negative_balance below 0, skipped_below_threshold otherwise. The
-- verifier compares the batch the payout functions actually wrote with that.
--
-- PASS RULE (fixed before the start, stored in the run params): after at least
-- 72 hours, zero failing ticks, zero missed ticks, and no gap longer than 15
-- minutes between settle heartbeats. Nothing is declared passed early.

do $guard$
begin
  if not exists (
    select 1 from qa_bootstrap.environment
    where project_ref = 'ncmsonfwbgsqedgnzofg'
      and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b'
  ) then
    raise exception 'isolation guard: not the QA branch';
  end if;
end $guard$;

create table if not exists qa_harness.soak_model (
  run_id uuid not null references qa_harness.runs (run_id),
  label text not null,
  partner_id uuid not null,
  balance_cents integer not null default 0,
  primary key (run_id, label)
);

create table if not exists qa_harness.soak_ticks (
  run_id uuid not null references qa_harness.runs (run_id),
  tick integer not null,
  month date not null,
  batch_id uuid,
  fault text not null,
  expected jsonb not null default '{}'::jsonb,
  prepared_at timestamptz,
  settled_at timestamptz,
  verdict text check (verdict in ('PASS', 'FAIL')),
  detail jsonb,
  primary key (run_id, tick)
);

alter table qa_harness.soak_model enable row level security;
alter table qa_harness.soak_ticks enable row level security;
revoke all on qa_harness.soak_model, qa_harness.soak_ticks from public, anon, authenticated;

create or replace function qa_harness.soak_beat_v1(p_run uuid, p_step text, p_outcome text, p_detail jsonb)
returns void language sql as $$
  insert into qa_harness.heartbeats (run_id, step, outcome, detail) values (p_run, p_step, p_outcome, p_detail);
$$;

create or replace function qa_harness.soak_env_guard_v1()
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from qa_bootstrap.environment
    where project_ref = 'ncmsonfwbgsqedgnzofg' and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b'
  ) then
    raise exception 'isolation guard: not the QA branch';
  end if;
end $$;

-- ── :00 prepare ──────────────────────────────────────────────────────────────
create or replace function qa_harness.soak_prepare_v1(p_run uuid, p_force_fault text default null)
returns jsonb language plpgsql as $$
declare
  v_run qa_harness.runs%rowtype;
  v_tick integer;
  v_month date;
  v_fault text;
  v_build jsonb;
  v_entry uuid;
  v_expected jsonb;
  m record;
begin
  perform qa_harness.soak_env_guard_v1();
  select * into v_run from qa_harness.runs where run_id = p_run for update;
  if not found or v_run.status <> 'RUNNING' then
    return jsonb_build_object('skipped', 'run_not_running');
  end if;
  if clock_timestamp() >= (v_run.params->>'plannedEnd')::timestamptz then
    perform qa_harness.soak_beat_v1(p_run, 'prepare', 'skipped', jsonb_build_object('reason', 'planned_end_reached'));
    return jsonb_build_object('skipped', 'planned_end_reached');
  end if;

  v_tick := floor(extract(epoch from (clock_timestamp() - v_run.started_at)) / 300)::integer;
  if exists (select 1 from qa_harness.soak_ticks where run_id = p_run and tick = v_tick) then
    perform qa_harness.soak_beat_v1(p_run, 'prepare', 'skipped', jsonb_build_object('reason', 'tick_already_prepared', 'tick', v_tick));
    return jsonb_build_object('skipped', 'tick_already_prepared', 'tick', v_tick);
  end if;

  v_month := make_date(2201 + v_tick / 12, v_tick % 12 + 1, 1);
  v_fault := coalesce(p_force_fault, case
    when v_tick % 7 = 3 then 'refund_between_build_and_claim'
    when v_tick % 11 = 5 then 'claimer_aborted'
    when v_tick % 13 = 7 then 'refund_after_payout'
    else 'none' end);

  for m in select label, partner_id from qa_harness.soak_model where run_id = p_run order by label loop
    insert into public.commission_entries (partner_id, stripe_subscription_id, offer_key, product, cadence, tier,
      rule_version, amount_cents, status, earned_at, eligible_at, livemode)
    values (m.partner_id, 'sub_qasoak_' || left(p_run::text, 8) || '_' || lower(m.label) || '_' || v_tick,
      'home_monthly_standard', 'home', 'monthly', 'standard', 1, 3000, 'eligible',
      clock_timestamp() - interval '100 days', clock_timestamp() - interval '1 minute', false)
    returning id into v_entry;
    update qa_harness.soak_model set balance_cents = balance_cents + 3000 where run_id = p_run and label = m.label;
    insert into qa_harness.fixtures (run_id, kind, object_id, label)
      values (p_run, 'commission_entry', v_entry::text, m.label || ':' || v_tick);
  end loop;

  select jsonb_object_agg(label, balance_cents) into v_expected from qa_harness.soak_model where run_id = p_run;
  v_build := public.gellatti_build_payout_batch_v1(v_month, false, clock_timestamp(), 2500);

  insert into qa_harness.soak_ticks (run_id, tick, month, batch_id, fault, expected, prepared_at)
    values (p_run, v_tick, v_month, (v_build->>'batchId')::uuid, v_fault,
            jsonb_build_object('netBeforeBuild', v_expected, 'build', v_build), clock_timestamp());

  if v_fault = 'refund_between_build_and_claim' then
    insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    select sm.partner_id, f.object_id::uuid, -500, 'refund_reversal', 'qa soak: partial refund between build and claim',
           'obj:re_qasoak_' || left(p_run::text, 8) || '_' || v_tick || '_s1'
    from qa_harness.soak_model sm
    join qa_harness.fixtures f on f.run_id = p_run and f.kind = 'commission_entry' and f.label = 'S1:' || v_tick
    where sm.run_id = p_run and sm.label = 'S1';
    update qa_harness.soak_model set balance_cents = balance_cents - 500 where run_id = p_run and label = 'S1';
  end if;

  perform qa_harness.soak_beat_v1(p_run, 'prepare', 'ok',
    jsonb_build_object('tick', v_tick, 'month', v_month, 'fault', v_fault, 'netBeforeBuild', v_expected, 'build', v_build));
  return jsonb_build_object('tick', v_tick, 'fault', v_fault, 'build', v_build);
end $$;

-- ── :01 claim workers ────────────────────────────────────────────────────────
create or replace function qa_harness.soak_claim_v1(p_run uuid, p_worker text)
returns jsonb language plpgsql as $$
declare
  v_tick qa_harness.soak_ticks%rowtype;
  v_rows jsonb;
  v_t0 timestamptz := clock_timestamp();
begin
  perform qa_harness.soak_env_guard_v1();
  select * into v_tick from qa_harness.soak_ticks
    where run_id = p_run and settled_at is null and prepared_at is not null
    order by tick desc limit 1;
  if not found then
    return jsonb_build_object('skipped', 'no_open_tick');
  end if;
  if p_worker = 'C' and v_tick.fault <> 'claimer_aborted' then
    return jsonb_build_object('skipped', 'not_a_crash_tick', 'tick', v_tick.tick);
  end if;

  select coalesce(jsonb_agg(c.payout_id order by c.payout_id), '[]'::jsonb) into v_rows
    from public.gellatti_claim_payout_lines_v1(v_tick.batch_id, case when p_worker = 'C' then 50 else 2 end, clock_timestamp()) c;

  if p_worker = 'C' then
    -- The job runs under statement_timeout = 4s: this sleep is where it dies,
    -- holding its claim, before any commit. Nothing below is ever reached.
    perform pg_sleep(30);
  end if;

  perform qa_harness.soak_beat_v1(p_run, 'claim_' || p_worker, 'ok', jsonb_build_object(
    'tick', v_tick.tick, 'claimed', v_rows, 'pid', pg_backend_pid(), 'tStart', v_t0, 'tDone', clock_timestamp()));
  return jsonb_build_object('tick', v_tick.tick, 'claimed', v_rows);
end $$;

-- ── :02 settle, then verify ──────────────────────────────────────────────────
create or replace function qa_harness.soak_settle_v1(p_run uuid)
returns jsonb language plpgsql as $$
declare
  v_run qa_harness.runs%rowtype;
  v_tick qa_harness.soak_ticks%rowtype;
  v_reclaimed jsonb;
  v_line record;
  v_tr text;
  v_res jsonb;
  v_msg text;
  v_problems text[] := '{}';
  v_paid jsonb := '{}'::jsonb;
  v_expected integer;
  m record;
  l record;
  v_crash jsonb;
  v_ledger jsonb;
begin
  perform qa_harness.soak_env_guard_v1();
  select * into v_run from qa_harness.runs where run_id = p_run;
  select * into v_tick from qa_harness.soak_ticks
    where run_id = p_run and settled_at is null and prepared_at is not null
    order by tick desc limit 1
    for update;
  if not found then
    return jsonb_build_object('skipped', 'no_open_tick');
  end if;

  -- Restart path: whatever no worker holds any more is claimed here.
  select coalesce(jsonb_agg(c.payout_id), '[]'::jsonb) into v_reclaimed
    from public.gellatti_claim_payout_lines_v1(v_tick.batch_id, 50, clock_timestamp()) c;

  for v_line in
    select pp.id, pp.partner_id, pp.amount_cents from public.partner_payouts pp
    where pp.batch_id = v_tick.batch_id and pp.status = 'processing' order by pp.id
  loop
    v_tr := 'tr_qasoak_' || left(p_run::text, 8) || '_' || v_tick.tick || '_' || left(v_line.id::text, 8);
    v_res := public.gellatti_settle_payout_line_v2(v_line.id, v_tr, v_line.partner_id, v_line.amount_cents, 'eur', false, clock_timestamp());
    if v_res->>'status' <> 'paid' then
      v_problems := v_problems || ('settle_not_paid:' || v_line.id);
    end if;
    v_res := public.gellatti_settle_payout_line_v2(v_line.id, v_tr, v_line.partner_id, v_line.amount_cents, 'eur', false, clock_timestamp());
    if coalesce((v_res->>'alreadySettled')::boolean, false) is not true then
      v_problems := v_problems || ('retry_not_noop:' || v_line.id);
    end if;
    begin
      perform public.gellatti_settle_payout_line_v2(v_line.id, v_tr || '_other', v_line.partner_id, v_line.amount_cents, 'eur', false, clock_timestamp());
      v_problems := v_problems || ('second_transfer_accepted:' || v_line.id);
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg <> 'payout_line_already_paid_by_another_transfer' then
        v_problems := v_problems || ('second_transfer_wrong_refusal:' || v_msg);
      end if;
    end;
    update qa_harness.soak_model set balance_cents = balance_cents - v_line.amount_cents
      where run_id = p_run and partner_id = v_line.partner_id;
  end loop;

  -- Verify every soak partner's line against the model taken before the build.
  for m in select label, partner_id from qa_harness.soak_model where run_id = p_run order by label loop
    v_expected := (v_tick.expected->'netBeforeBuild'->>m.label)::integer;
    select pp.status, pp.amount_cents, pp.carry_forward_cents, pp.failure_reason, pp.stripe_transfer_id,
           (select coalesce(sum(i.amount_cents), 0) from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is null) as active_cents,
           (select count(*) from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is null) as active_items,
           (select count(*) from public.audit_log a where a.entity_type = 'partner_payouts' and a.entity_id = pp.id::text and a.action = 'payout.line_settled') as settle_audits
      into l
      from public.partner_payouts pp where pp.batch_id = v_tick.batch_id and pp.partner_id = m.partner_id;
    if not found then
      v_problems := v_problems || (m.label || ':no_line');
      continue;
    end if;
    v_paid := v_paid || jsonb_build_object(m.label, jsonb_build_object('status', l.status, 'amount', l.amount_cents, 'carry', l.carry_forward_cents, 'expectedNet', v_expected));
    if v_expected >= 2500 then
      if m.label = 'S1' and v_tick.fault = 'refund_between_build_and_claim' then
        if l.status <> 'failed' or l.failure_reason <> 'stale_line:correction_arrived_after_build' or l.active_items <> 0 then
          v_problems := v_problems || (m.label || ':expected_failed_stale_got_' || l.status || '/' || coalesce(l.failure_reason, '-'));
        end if;
      elsif l.status <> 'paid' or l.amount_cents <> v_expected or l.active_cents <> v_expected
            or l.stripe_transfer_id is null or l.settle_audits <> 1 then
        v_problems := v_problems || (m.label || ':expected_paid_' || v_expected || '_got_' || l.status || '_' || l.amount_cents || '_items_' || l.active_cents || '_audits_' || l.settle_audits);
      end if;
    elsif v_expected < 0 then
      if l.status <> 'skipped_negative_balance' or l.carry_forward_cents <> v_expected or l.amount_cents <> 0 then
        v_problems := v_problems || (m.label || ':expected_negative_' || v_expected || '_got_' || l.status || '_' || l.carry_forward_cents);
      end if;
    else
      if l.status <> 'skipped_below_threshold' or l.carry_forward_cents <> v_expected or l.amount_cents <> 0 then
        v_problems := v_problems || (m.label || ':expected_below_threshold_' || v_expected || '_got_' || l.status || '_' || l.carry_forward_cents);
      end if;
    end if;
  end loop;

  -- A refund after this tick's payout, netted by the next batch.
  if v_tick.fault = 'refund_after_payout' then
    insert into public.commission_adjustments (partner_id, commission_entry_id, amount_cents, kind, reason, source_event_key)
    select sm.partner_id, i.commission_entry_id, -3000, 'refund_reversal', 'qa soak: refund after payout',
           'obj:re_qasoak_' || left(p_run::text, 8) || '_' || v_tick.tick || '_s2'
    from qa_harness.soak_model sm
    join public.partner_payouts pp on pp.batch_id = v_tick.batch_id and pp.partner_id = sm.partner_id and pp.status = 'paid'
    join public.partner_payout_items i on i.payout_id = pp.id and i.released_at is null and i.commission_entry_id is not null
    join qa_harness.fixtures f on f.run_id = p_run and f.kind = 'commission_entry' and f.object_id = i.commission_entry_id::text and f.label = 'S2:' || v_tick.tick
    where sm.run_id = p_run and sm.label = 'S2';
    if found then
      update qa_harness.soak_model set balance_cents = balance_cents - 3000 where run_id = p_run and label = 'S2';
    end if;
  end if;

  -- The crashed claimer really died holding its claim.
  if v_tick.fault = 'claimer_aborted' then
    select jsonb_build_object('status', d.status, 'message', left(d.return_message, 120), 'start', d.start_time)
      into v_crash
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname = 'qa-soak-' || left(p_run::text, 8) || '-claim-c'
        and d.start_time >= v_tick.prepared_at
      order by d.start_time desc limit 1;
    if v_crash is null or v_crash->>'status' <> 'failed' or v_crash->>'message' not ilike '%statement timeout%' then
      v_problems := v_problems || ('claimer_did_not_crash:' || coalesce(v_crash::text, 'no_run'));
    end if;
  end if;

  -- Global invariants over everything the soak created, and money conservation.
  if exists (select 1 from public.partner_payout_items i where i.commission_entry_id is not null and i.released_at is null
             group by i.commission_entry_id having count(*) > 1) then
    v_problems := v_problems || 'entry_in_two_active_items'::text;
  end if;
  if exists (select 1 from public.partner_payouts pp join qa_harness.soak_model sm on sm.run_id = p_run and sm.partner_id = pp.partner_id
             where pp.status = 'failed' and exists (select 1 from public.partner_payout_items i where i.payout_id = pp.id and i.released_at is null)) then
    v_problems := v_problems || 'failed_line_keeps_reservation'::text;
  end if;
  if exists (select 1 from public.partner_payouts pp where pp.stripe_transfer_id like 'tr_qasoak_' || left(p_run::text, 8) || '%'
             group by pp.stripe_transfer_id having count(*) > 1) then
    v_problems := v_problems || 'transfer_on_two_lines'::text;
  end if;
  select jsonb_object_agg(sm.label, jsonb_build_object(
           'earned', (select coalesce(sum(ce.amount_cents), 0) from public.commission_entries ce
                      where ce.partner_id = sm.partner_id and ce.stripe_subscription_id like 'sub_qasoak_' || left(p_run::text, 8) || '%'),
           'adjusted', (select coalesce(sum(ca.amount_cents), 0) from public.commission_adjustments ca
                        where ca.partner_id = sm.partner_id and ca.source_event_key like 'obj:re_qasoak_' || left(p_run::text, 8) || '%'),
           'paid', (select coalesce(sum(pp.amount_cents), 0) from public.partner_payouts pp
                    where pp.partner_id = sm.partner_id and pp.status = 'paid' and pp.stripe_transfer_id like 'tr_qasoak_' || left(p_run::text, 8) || '%'),
           'model', sm.balance_cents))
    into v_ledger
    from qa_harness.soak_model sm where sm.run_id = p_run;
  for m in select key as label, value as v from jsonb_each(v_ledger) loop
    if (m.v->>'earned')::bigint + (m.v->>'adjusted')::bigint - (m.v->>'paid')::bigint <> (m.v->>'model')::bigint then
      v_problems := v_problems || (m.label || ':conservation_broken:' || m.v::text);
    end if;
  end loop;

  update qa_harness.soak_ticks
    set settled_at = clock_timestamp(),
        verdict = case when cardinality(v_problems) = 0 then 'PASS' else 'FAIL' end,
        detail = jsonb_build_object('lines', v_paid, 'reclaimed', v_reclaimed, 'problems', to_jsonb(v_problems),
                                    'crash', v_crash, 'ledger', v_ledger)
    where run_id = p_run and tick = v_tick.tick;

  perform qa_harness.soak_beat_v1(p_run, 'settle', case when cardinality(v_problems) = 0 then 'ok' else 'fail' end,
    jsonb_build_object('tick', v_tick.tick, 'fault', v_tick.fault, 'reclaimed', v_reclaimed, 'problems', to_jsonb(v_problems)));
  return jsonb_build_object('tick', v_tick.tick, 'verdict', case when cardinality(v_problems) = 0 then 'PASS' else 'FAIL' end,
                            'problems', to_jsonb(v_problems), 'lines', v_paid);
end $$;

-- ── status, and the only place a verdict is set ──────────────────────────────
create or replace function qa_harness.soak_status_v1(p_run uuid)
returns jsonb language sql stable as $$
  with r as (select * from qa_harness.runs where run_id = p_run),
  t as (select * from qa_harness.soak_ticks where run_id = p_run),
  beats as (
    select beat_at, lag(beat_at) over (order by beat_at) as prev
    from qa_harness.heartbeats where run_id = p_run and step = 'settle' and outcome in ('ok', 'fail')
  )
  select jsonb_build_object(
    'runId', p_run,
    'status', (select status from r),
    'startedAt', (select started_at from r),
    'plannedEnd', (select params->>'plannedEnd' from r),
    'elapsedHours', round((extract(epoch from (clock_timestamp() - (select started_at from r))) / 3600)::numeric, 2),
    'ticksDue', floor(extract(epoch from (least(clock_timestamp(), (select (params->>'plannedEnd')::timestamptz from r)) - (select started_at from r))) / 300)::integer,
    'ticksPrepared', (select count(*) from t),
    'ticksPassed', (select count(*) from t where verdict = 'PASS'),
    'ticksFailed', (select count(*) from t where verdict = 'FAIL'),
    'ticksUnsettled', (select count(*) from t where settled_at is null),
    'faultsExercised', (select jsonb_object_agg(fault, n) from (select fault, count(*) n from t group by fault) f),
    'maxSettleGapMinutes', (select round(max(extract(epoch from (beat_at - prev)) / 60)::numeric, 1) from beats where prev is not null),
    'lastHeartbeat', (select max(beat_at) from qa_harness.heartbeats where run_id = p_run),
    'firstFailure', (select jsonb_build_object('tick', tick, 'problems', detail->'problems') from t where verdict = 'FAIL' order by tick limit 1)
  );
$$;

create or replace function qa_harness.soak_monitor_v1(p_run uuid)
returns jsonb language plpgsql as $$
declare
  v_run qa_harness.runs%rowtype;
  v_status jsonb;
  v_pass boolean;
begin
  perform qa_harness.soak_env_guard_v1();
  select * into v_run from qa_harness.runs where run_id = p_run for update;
  if not found or v_run.status <> 'RUNNING' then
    return jsonb_build_object('skipped', 'run_not_running');
  end if;
  v_status := qa_harness.soak_status_v1(p_run);
  perform qa_harness.soak_beat_v1(p_run, 'monitor', 'ok', v_status);

  -- A verdict only after the planned end, and only with a full record.
  if clock_timestamp() >= (v_run.params->>'plannedEnd')::timestamptz + interval '10 minutes' then
    v_pass := (v_status->>'ticksFailed')::integer = 0
          and (v_status->>'ticksUnsettled')::integer = 0
          and (v_status->>'ticksPrepared')::integer >= (v_status->>'ticksDue')::integer
          and coalesce((v_status->>'maxSettleGapMinutes')::numeric, 999) <= 15
          and clock_timestamp() - v_run.started_at >= interval '72 hours';
    update qa_harness.runs
      set status = case when v_pass then 'PASSED' else 'FAILED' end,
          finished_at = clock_timestamp(),
          result = v_status
      where run_id = p_run;
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname like 'qa-soak-' || left(p_run::text, 8) || '-%';
  end if;
  return v_status;
end $$;

revoke all on all functions in schema qa_harness from public, anon, authenticated;

select jsonb_build_object(
  'functions', (select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'qa_harness'),
  'tables', (select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'qa_harness' and c.relkind = 'r')
) as readback;

insert into qa_bootstrap.environment_changes (change, reason)
select 'qa_harness soak executor functions + soak_model/soak_ticks tables (RLS on, no client grants)',
       'QA-only 72h payout executor soak driven by pg_cron; owner directive 2026-09-17 (executor with run ID and heartbeat)'
where not exists (select 1 from qa_bootstrap.environment_changes where change like 'qa_harness soak executor%');
