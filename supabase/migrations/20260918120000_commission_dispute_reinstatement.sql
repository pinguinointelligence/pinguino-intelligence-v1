-- ============================================================================
-- A won dispute can put the commission back (R6)
-- ============================================================================
-- STATUS: READY / WAITING FOR OWNER DB APPROVAL — NOT APPLIED.
--
-- WHAT WAS MISSING. WEBHOOK_MATRIX.md gives charge.dispute.funds_reinstated the
-- ledger effect "commission_adjustments (re-credit)", and refundAdjustments.ts
-- has implemented R6 since the rules were written. The database could not store
-- it: 0018's `kind` vocabulary knows only refund_reversal, dispute_reversal and
-- manual, so the runtime recorded the event as an honest no-op and a partner who
-- WON a chargeback kept the reversal for ever.
--
-- WHAT THIS CHANGES. One CHECK constraint, one new value. No row is touched, no
-- column is added, no function is redefined, and 0018 itself is left exactly as
-- it was applied — this is a narrow forward migration, not a rewrite of history.
--
-- WHAT IT DOES NOT CHANGE. The amount is decided by the code that already
-- mirrors R6: a reinstatement restores exactly what THAT dispute reversed, once,
-- and never what a refund took — a refund keeps its own negative adjustment. The
-- append-only rule (R4), the per-source-event uniqueness and the cumulative cap
-- (R3) are untouched, so the two movements of one dispute
-- (`obj:dp_x` withdrawn, `obj:dp_x:reinstated` reinstated) are separate rows
-- that cannot block or double each other.
-- ============================================================================

alter table public.commission_adjustments
  drop constraint if exists commission_adjustments_kind_check;

alter table public.commission_adjustments
  add constraint commission_adjustments_kind_check
  check (kind = any (array['refund_reversal', 'dispute_reversal', 'dispute_reinstatement', 'manual']));

comment on constraint commission_adjustments_kind_check on public.commission_adjustments is
  'R1-R6 vocabulary: refund_reversal / dispute_reversal take money back, dispute_reinstatement puts back exactly what a won dispute reversed, manual is an operator correction.';
