-- QA ONLY: soak executor dry run. One transaction that always aborts.
do $dry$
declare
  v_run uuid := gen_random_uuid();
  r jsonb := '[]'::jsonb;
  u uuid; p uuid; i integer;
  v jsonb; v_faults text[] := array['none', 'refund_between_build_and_claim', 'refund_after_payout', 'none', 'none'];
  k integer;
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg') then
    raise exception 'isolation guard: not the QA branch';
  end if;
  insert into qa_harness.runs (run_id, kind, label, status, params, started_at)
    values (v_run, 'SOAK_DB_PAYOUT_DRYRUN', 'dry run', 'RUNNING', jsonb_build_object('plannedEnd', clock_timestamp() + interval '1 hour'), clock_timestamp() - interval '10 seconds');
  for i in 1..4 loop
    u := gen_random_uuid();
    insert into auth.users (id, email) values (u, 'qa.soak.dry.s' || i || '@example.invalid');
    insert into public.partners (user_id, status, stripe_connect_account_id, onboarding_complete, payouts_enabled)
      values (u, 'active', 'acct_qasoak_dry_s' || i, true, true) returning id into p;
    insert into qa_harness.soak_model (run_id, label, partner_id) values (v_run, 'S' || i, p);
  end loop;

  for k in 1..array_length(v_faults, 1) loop
    v := qa_harness.soak_prepare_v1(v_run, v_faults[k]);
    perform qa_harness.soak_claim_v1(v_run, 'A');
    perform qa_harness.soak_claim_v1(v_run, 'B');
    v := v || jsonb_build_object('settle', qa_harness.soak_settle_v1(v_run));
    r := r || jsonb_build_array(v - 'build');
    update qa_harness.runs set started_at = started_at - interval '300 seconds' where run_id = v_run;
  end loop;
  r := jsonb_build_object('ticks', r, 'status', qa_harness.soak_status_v1(v_run),
    'model', (select jsonb_object_agg(label, balance_cents) from qa_harness.soak_model where run_id = v_run));
  raise exception 'QA_SOAK_DRYRUN %', r::text;
end
$dry$;
