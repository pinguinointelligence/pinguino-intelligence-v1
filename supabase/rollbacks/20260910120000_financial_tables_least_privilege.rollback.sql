-- ROLLBACK for 20260910120000_financial_tables_least_privilege.sql
--
-- STATUS: READY / NOT APPLIED. Run only if the forward migration was applied.
-- Restores the table grants that are live today: `anon` and `authenticated`
-- hold `arwdDxtm` on all seven tables (read-only ACL check, 2026-09-17,
-- PostgreSQL 17.6, where `m` is MAINTAIN and `grant all` restores it).
-- Policies were never changed by the forward migration, so there is nothing
-- else to restore.

begin;

grant all on table
  public.commission_entries,
  public.commission_rules,
  public.commission_adjustments,
  public.partner_payouts,
  public.referral_attributions,
  public.partner_benefit_uses,
  public.partner_tier_snapshots
to anon, authenticated;

commit;
