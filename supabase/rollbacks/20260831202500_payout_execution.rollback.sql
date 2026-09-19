-- ============================================================================
-- ROLLBACK for 20260831202500_payout_execution
-- ============================================================================
-- Removes the payout execution functions and the live-payout release gate, and
-- nothing else. payout_batches, partner_payouts and partner_payout_items existed
-- before this migration; no row in them is touched.
--
-- REFUSES
--   * while 20260917140000_payout_execution_batch_binding or
--     20260831203000_partner_scheduling is applied: their functions call these.
--     Roll those back first;
--   * when live payouts were ever released: that row is the owner's record of
--     the decision and must not disappear with a schema change;
--   * while any payout line is pending or processing: work in flight is finished
--     or failed by its own functions first, never stranded without them.

begin;

do $guard$
begin
  if to_regprocedure('public.gellatti_settle_payout_line_v2(uuid, text, uuid, integer, text, boolean, timestamptz)') is not null then
    raise exception 'rollback refused: roll back 20260917140000_payout_execution_batch_binding first';
  end if;
  if to_regprocedure('public.gellatti_run_partner_job_v1(text)') is not null then
    raise exception 'rollback refused: roll back 20260831203000_partner_scheduling first';
  end if;
  if exists (select 1 from public.payout_release_state where live_payouts_released or released_at is not null) then
    raise exception 'rollback refused: live payouts were released; the release record must stay';
  end if;
  if exists (select 1 from public.partner_payouts where status in ('pending', 'processing')) then
    raise exception 'rollback refused: payout lines are pending or processing';
  end if;
end $guard$;

drop function if exists public.gellatti_admin_payout_batches_v1(integer);
drop function if exists public.gellatti_missing_payout_batch_months_v1(timestamptz, boolean);
drop function if exists public.gellatti_close_payout_batch_v1(uuid, timestamptz);
drop function if exists public.gellatti_stuck_payout_lines_v1(timestamptz, integer);
drop function if exists public.gellatti_mark_payout_failed_v1(uuid, text, timestamptz);
drop function if exists public.gellatti_mark_payout_paid_v1(uuid, text, timestamptz);
drop function if exists public.gellatti_claim_payout_lines_v1(uuid, integer, timestamptz);
drop function if exists public.gellatti_build_payout_batch_v1(date, boolean, timestamptz, integer);
drop function if exists public.gellatti_transition_eligible_commissions_v1(timestamptz);
drop function if exists public.gellatti_assert_payout_allowed_v1(boolean);
drop function if exists public.gellatti_live_payouts_released_v1();

drop table if exists public.payout_release_state;

commit;
