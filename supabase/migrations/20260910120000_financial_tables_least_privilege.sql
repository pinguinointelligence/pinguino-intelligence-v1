-- ============================================================================
-- DB-ACL-02 / DB-ACL-03 — least privilege on the financial tables
-- ============================================================================
-- FORENSIC FIRST. The checklist requires a consumer inventory before any
-- revoke, so this file records the measurement it is based on.
--
-- MEASURED ON THE LIVE DATABASE 2026-09-10:
--   Seven of eight financial tables grant `arwdDxtm` — SELECT, INSERT, UPDATE,
--   DELETE, TRUNCATE, REFERENCES, TRIGGER — to BOTH `anon` and `authenticated`:
--     commission_entries, commission_rules, commission_adjustments,
--     partner_payouts, referral_attributions, partner_benefit_uses,
--     partner_tier_snapshots
--   `partner_rate_profiles` is the exception — postgres + service_role only.
--   It proves the correct shape already works in this application.
--
-- WHY THIS IS NOT AN ACTIVE HOLE TODAY: RLS is enabled on all of them, and
-- every existing policy is SELECT-only. There is no INSERT, UPDATE or DELETE
-- policy anywhere on these tables, so RLS default-denies that DML. TRUNCATE is
-- NOT subject to RLS, but PostgREST exposes no TRUNCATE verb, so that grant is
-- unreachable over the API. The exposure is defence-in-depth, not a live
-- exploit — which matches the wording already in the growth ledger (L10):
-- "RLS is currently the only barrier."
--
-- CONSUMER INVENTORY — who breaks if these grants disappear:
--   * client code (`src/`): ZERO direct reads or writes of any of the seven
--     tables. The partner dashboard goes through
--     `gellatti_partner_workspace_v1`, which is SECURITY DEFINER owned by
--     postgres, so it runs with the owner's rights and needs no role grant.
--   * edge functions: use the service_role key, which bypasses both grants and
--     RLS.
--   * admin surfaces: the same SECURITY DEFINER RPC pattern.
--   Nothing in the application consumes these grants.
--
-- The SELECT policies are deliberately LEFT IN PLACE. They cost nothing, and if
-- a future surface reads a partner's own rows directly the intent is already
-- expressed. This migration removes privileges the application never uses. It
-- changes no policy, no row, and not the project-wide default privileges —
-- DB-ACL-01 stays untouched by owner instruction.
--
-- ############################################################################
-- STATUS: READY / NOT APPLIED — production-shared DB
-- Owner decision 2026-09-10: do NOT apply this yet. Staging and production share
-- ONE Supabase project (A-DEF-02), so applying it changes production's database.
-- No grant may change until a separate, safe deployment decision is taken.
-- This file is kept prepared, with its forensic, for that moment.
-- ############################################################################

revoke all on table
  public.commission_entries,
  public.commission_rules,
  public.commission_adjustments,
  public.partner_payouts,
  public.referral_attributions,
  public.partner_benefit_uses,
  public.partner_tier_snapshots
from anon, authenticated;

-- Restore exactly what the existing SELECT policies are written to serve, and
-- nothing more. `anon` gets nothing back: every policy predicate requires
-- auth.uid(), so an anonymous caller can never match a row in any case.
grant select on table
  public.commission_entries,
  public.commission_adjustments,
  public.partner_payouts,
  public.referral_attributions,
  public.partner_tier_snapshots
to authenticated;

-- commission_rules and partner_benefit_uses have RLS on and ZERO policies, so
-- nothing may read them through the API regardless of grants. They stay fully
-- closed rather than being handed a SELECT that no policy would honour.
