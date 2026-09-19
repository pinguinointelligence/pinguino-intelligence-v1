-- QA ONLY — campaign stage "payout eligibility → batch → claim → settle" on the REAL campaign ledger of Partner A.
--
-- Clocks (explicit): Stripe Test Clocks produced the entries; this file moves ONLY the business time p_now of the
-- scheduled jobs. dbNow is recorded next to it. Everything runs inside ONE statement that ends with
-- `raise exception 'QA_PAYOUT_STAGE_RESULTS …'`, so NOTHING persists: the DB payout soak
-- 830782a2-ee40-4d4e-9b0a-645982de6cef keeps its batches and balances untouched.
--
-- Part A uses Partner A exactly as it is (no Connect account). Part B is a SIMULATION inside a rolled-back
-- subtransaction: Connect flags set as if onboarding were complete, and settlement with a synthetic transfer id.
-- Part B is NOT a Stripe transfer and NOT a Connect verification.
do $s12$
declare
  v_partner constant uuid := '4b184129-b5a9-4140-b26e-17846acf8313';
  v_partner_user constant uuid := '05a67899-8ee7-4275-a197-14d6c37056eb';
  v_boundary constant timestamptz := '2026-12-01 00:00:00 Europe/Madrid';
  v_month constant date := '2026-12-01';
  v_res jsonb := jsonb_build_object('dbNow', clock_timestamp(), 'businessTimeBoundary', '2026-12-01 00:00:00 Europe/Madrid',
                                    'businessTimeUtc', '2026-11-30T23:00:00Z');
  v_tmp jsonb;
  v_line record;
  v_batch uuid;
  v_claimed jsonb;
  v_ws jsonb;
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg' and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b') then
    raise exception 'isolation guard: not the QA branch';
  end if;

  -- 0. The campaign ledger of Partner A before any business-time step, and the independently computed expectation.
  v_res := v_res || jsonb_build_object('ledgerByStatus', (
    select jsonb_object_agg(status, jsonb_build_object('entries', n, 'amountCents', amt, 'adjustmentCents', adj))
    from (select ce.status, count(*) n, sum(ce.amount_cents) amt,
                 coalesce(sum((select sum(ca.amount_cents) from public.commission_adjustments ca where ca.commission_entry_id = ce.id)), 0) adj
          from public.commission_entries ce where ce.partner_id = v_partner and ce.livemode = false group by ce.status) s),
    'expectedNetAtBoundary', (
      select coalesce(sum(ce.amount_cents + coalesce((select sum(ca.amount_cents) from public.commission_adjustments ca where ca.commission_entry_id = ce.id), 0)), 0)
      from public.commission_entries ce
      where ce.partner_id = v_partner and ce.livemode = false and ce.status in ('held', 'eligible') and ce.eligible_at <= v_boundary));

  -- A. Partner A as it really is.
  begin
    v_tmp := public.gellatti_transition_eligible_commissions_v1(v_boundary - interval '1 second');
    v_res := v_res || jsonb_build_object('A1_oneSecondBefore', jsonb_build_object('job', v_tmp,
      'partnerEligible', (select count(*) from public.commission_entries where partner_id = v_partner and status = 'eligible' and livemode = false)));
    v_tmp := public.gellatti_transition_eligible_commissions_v1(v_boundary);
    v_res := v_res || jsonb_build_object('A2_atBoundary', jsonb_build_object('job', v_tmp,
      'partnerEligible', (select count(*) from public.commission_entries where partner_id = v_partner and status = 'eligible' and livemode = false),
      'partnerStillHeld', (select count(*) from public.commission_entries where partner_id = v_partner and status = 'held' and livemode = false)));
    v_tmp := public.gellatti_build_payout_batch_v1(v_month, false, v_boundary, 2500);
    v_res := v_res || jsonb_build_object('A3_build', v_tmp, 'A3_partnerLine', (
      select to_jsonb(pp) - 'idempotency_key' from public.partner_payouts pp where pp.batch_id = (v_tmp->>'batchId')::uuid and pp.partner_id = v_partner),
      'A3_partnerConnect', (select jsonb_build_object('connectAccountPresent', p.stripe_connect_account_id is not null,
         'onboardingComplete', p.onboarding_complete, 'payoutsEnabled', p.payouts_enabled, 'status', p.status) from public.partners p where p.id = v_partner));
    raise exception 'qa_rollback_part_a';
  exception when others then
    if sqlerrm <> 'qa_rollback_part_a' then v_res := v_res || jsonb_build_object('A_error', sqlerrm); end if;
  end;

  -- B. SIMULATION: Connect flags as if onboarding were complete (rolled back).
  begin
    update public.partners set stripe_connect_account_id = 'acct_qa_simulated_not_stripe', onboarding_complete = true, payouts_enabled = true
      where id = v_partner;
    perform public.gellatti_transition_eligible_commissions_v1(v_boundary);
    v_tmp := public.gellatti_build_payout_batch_v1(v_month, false, v_boundary, 2500);
    v_batch := (v_tmp->>'batchId')::uuid;
    select * into v_line from public.partner_payouts pp where pp.batch_id = v_batch and pp.partner_id = v_partner;
    v_res := v_res || jsonb_build_object('B1_build', v_tmp, 'B1_partnerLine', jsonb_build_object('status', v_line.status,
      'amountCents', v_line.amount_cents, 'carryForwardCents', v_line.carry_forward_cents,
      'reservedEntries', (select count(*) from public.partner_payout_items i where i.payout_id = v_line.id and i.commission_entry_id is not null),
      'reservedAdjustments', (select count(*) from public.partner_payout_items i where i.payout_id = v_line.id and i.commission_adjustment_id is not null)));
    -- The same month built again (duplicate scheduler run): no second line.
    v_tmp := public.gellatti_build_payout_batch_v1(v_month, false, v_boundary + interval '1 minute', 2500);
    v_res := v_res || jsonb_build_object('B2_rebuild', v_tmp,
      'B2_partnerLines', (select count(*) from public.partner_payouts pp where pp.batch_id = v_batch and pp.partner_id = v_partner));
    select coalesce(jsonb_agg(to_jsonb(c) - 'stripe_connect_account_id'), '[]'::jsonb) into v_claimed
      from public.gellatti_claim_payout_lines_v1(v_batch, 1000, v_boundary + interval '2 minutes') c where c.partner_id = v_partner;
    v_res := v_res || jsonb_build_object('B3_firstClaim', v_claimed);
    select coalesce(jsonb_agg(to_jsonb(c) - 'stripe_connect_account_id'), '[]'::jsonb) into v_claimed
      from public.gellatti_claim_payout_lines_v1(v_batch, 1000, v_boundary + interval '3 minutes') c where c.partner_id = v_partner;
    v_res := v_res || jsonb_build_object('B4_secondClaim', v_claimed);
    v_tmp := public.gellatti_settle_payout_line_v2(v_line.id, 'tr_qa_simulated_1', v_partner, v_line.amount_cents, 'eur', false, v_boundary + interval '4 minutes');
    v_res := v_res || jsonb_build_object('B5_settle', v_tmp);
    begin
      v_tmp := public.gellatti_settle_payout_line_v2(v_line.id, 'tr_qa_simulated_1', v_partner, v_line.amount_cents, 'eur', false, v_boundary + interval '5 minutes');
      v_res := v_res || jsonb_build_object('B6_settleSameTransferAgain', v_tmp);
    exception when others then
      v_res := v_res || jsonb_build_object('B6_settleSameTransferAgain', jsonb_build_object('refused', sqlerrm));
    end;
    begin
      v_tmp := public.gellatti_settle_payout_line_v2(v_line.id, 'tr_qa_simulated_2', v_partner, v_line.amount_cents, 'eur', false, v_boundary + interval '6 minutes');
      v_res := v_res || jsonb_build_object('B7_settleOtherTransfer', v_tmp);
    exception when others then
      v_res := v_res || jsonb_build_object('B7_settleOtherTransfer', jsonb_build_object('refused', sqlerrm));
    end;
    v_res := v_res || jsonb_build_object('B8_after', jsonb_build_object(
      'lineStatus', (select status from public.partner_payouts where id = v_line.id),
      'entriesPaid', (select count(*) from public.commission_entries where partner_id = v_partner and status = 'paid'),
      'nextMonthBuild', public.gellatti_build_payout_batch_v1('2027-01-01', false, '2027-01-01 00:00:00 Europe/Madrid', 2500),
      'nextMonthPartnerLine', (select jsonb_build_object('status', pp.status, 'amountCents', pp.amount_cents, 'carry', pp.carry_forward_cents)
          from public.partner_payouts pp join public.payout_batches b on b.id = pp.batch_id
          where b.month = '2027-01-01' and b.livemode = false and pp.partner_id = v_partner)));
    -- What the Partner panel's RPC returns for the same state (authenticated role, the Partner's user id; NOT a browser login).
    perform set_config('request.jwt.claims', json_build_object('sub', v_partner_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_ws := public.gellatti_partner_workspace_v1();
    execute 'reset role';
    v_res := v_res || jsonb_build_object('B9_partnerWorkspaceMoney', (
      select jsonb_agg(jsonb_build_object('code', c->>'code', 'pendingCommissionCents', c->'pendingCommissionCents',
        'approvedCommissionCents', c->'approvedCommissionCents', 'paidCommissionCents', c->'paidCommissionCents',
        'refundCommissionCents', c->'refundCommissionCents', 'grossAttributedRevenueCents', c->'grossAttributedRevenueCents'))
      from jsonb_array_elements(v_ws->'codes') c), 'B9_partnerPayouts', v_ws->'payouts', 'B9_partnerFlags', v_ws->'partner');
    raise exception 'qa_rollback_part_b';
  exception when others then
    if sqlerrm <> 'qa_rollback_part_b' then v_res := v_res || jsonb_build_object('B_error', sqlerrm); end if;
  end;

  -- Proof nothing persisted from A or B.
  v_res := v_res || jsonb_build_object('afterRollback', jsonb_build_object(
    'decemberBatchExists', exists (select 1 from public.payout_batches where month = '2026-12-01' and livemode = false),
    'partnerEligible', (select count(*) from public.commission_entries where partner_id = v_partner and status = 'eligible'),
    'partnerConnectPresent', (select stripe_connect_account_id is not null from public.partners where id = v_partner)));
  raise exception 'QA_PAYOUT_STAGE_RESULTS %', v_res::text;
end
$s12$;
