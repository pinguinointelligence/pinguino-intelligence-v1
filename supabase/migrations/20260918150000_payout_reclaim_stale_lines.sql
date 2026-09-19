-- ─────────────────────────────────────────────────────────────────────────────
-- Growth ledger — a payout line whose executor died between Stripe and the
-- ledger can be picked up again.
--
-- STATUS: READY / NOT APPLIED — production-shared DB
-- ROLLBACK: supabase/rollbacks/20260918150000_payout_reclaim_stale_lines.rollback.sql
--
-- Measured on the QA branch (2026-09-17, Stripe sandbox acct_1UGdTdAi07MMapq2):
-- the executor was interrupted deliberately after `transfers.create` succeeded
-- and before `gellatti_settle_payout_line_v2`. Stripe held a real transfer; the
-- line stayed `processing` with no transfer id; and every later run answered
-- `nothing_claimable`, because the claim reads `pending` only. The money had
-- moved and nothing in the system would ever bind it: the partner's line would
-- sit unpaid for ever while the platform's balance was already down.
--
-- This adds the missing half of the claim, and nothing else. A line is offered
-- again only when it is `processing`, carries NO transfer id, and has not been
-- touched for `p_stale_after`. It keeps its own idempotency key, so the next
-- `transfers.create` presents that key and Stripe returns THE SAME transfer
-- instead of sending money twice. Every eligibility check stays where it is:
-- this function moves the line back to `pending` and lets
-- `gellatti_claim_payout_lines_v1` decide as it always has.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.gellatti_reclaim_stale_payout_lines_v1(
  p_batch_id uuid,
  p_stale_after interval default interval '15 minutes',
  p_limit integer default 50,
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_livemode boolean;
  v_line record;
  v_count integer := 0;
begin
  select b.livemode into v_livemode from public.payout_batches b where b.id = p_batch_id;
  if v_livemode is null then raise exception 'payout_batch_not_found'; end if;
  -- The same gate the claim and the settle obey: nothing here runs where the
  -- release has not opened live payouts.
  perform public.gellatti_assert_payout_allowed_v1(v_livemode);

  -- A window is mandatory where money is real: a live run must not have its
  -- line taken from under it by a second worker seconds after it claimed it.
  if v_livemode and coalesce(p_stale_after, interval '0') < interval '5 minutes' then
    raise exception 'reclaim_window_too_short_for_livemode';
  end if;

  for v_line in
    select pp.id, pp.amount_cents, pp.updated_at
    from public.partner_payouts pp
    where pp.batch_id = p_batch_id
      and pp.status = 'processing'
      and pp.stripe_transfer_id is null
      and pp.paid_at is null
      and pp.updated_at < p_now - coalesce(p_stale_after, interval '15 minutes')
    order by pp.updated_at, pp.id
    limit greatest(coalesce(p_limit, 50), 0)
    for update of pp skip locked
  loop
    update public.partner_payouts
      set status = 'pending', updated_at = p_now
      where id = v_line.id;

    -- The trail says what was reopened and why; the line's reservation and its
    -- idempotency key are left exactly as they were.
    perform public.gellatti_write_audit_v1(
      'payout.line_reclaimed_stale', 'partner_payouts', v_line.id::text,
      jsonb_build_object(
        'before', jsonb_build_object('status', 'processing', 'amountCents', v_line.amount_cents),
        'after', jsonb_build_object('status', 'pending', 'amountImpactCents', 0,
                                    'staleSince', v_line.updated_at)
      ),
      'executor stopped between Stripe and the ledger', p_batch_id::text, 'system', 'payout-reclaim'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function public.gellatti_reclaim_stale_payout_lines_v1(uuid, interval, integer, timestamptz)
  from public, anon, authenticated;
