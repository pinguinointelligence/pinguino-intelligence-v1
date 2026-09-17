-- ============================================================================
-- ROLLBACK for 20260918120000_commission_dispute_reinstatement
-- ============================================================================
-- Restores 0018's three-value vocabulary. It REFUSES while a reinstatement row
-- exists, because dropping the value under a row that uses it would leave the
-- table failing its own constraint: roll back the ledger decision first, with
-- a compensating `manual` adjustment, and only then this.
--
-- No adjustment, entry or payout is read, written or deleted here.

do $guard$
begin
  if exists (select 1 from public.commission_adjustments where kind = 'dispute_reinstatement') then
    raise exception 'rollback refused: % dispute_reinstatement adjustment(s) exist',
      (select count(*) from public.commission_adjustments where kind = 'dispute_reinstatement');
  end if;
end
$guard$;

alter table public.commission_adjustments
  drop constraint if exists commission_adjustments_kind_check;

alter table public.commission_adjustments
  add constraint commission_adjustments_kind_check
  check (kind = any (array['refund_reversal', 'dispute_reversal', 'manual']));
