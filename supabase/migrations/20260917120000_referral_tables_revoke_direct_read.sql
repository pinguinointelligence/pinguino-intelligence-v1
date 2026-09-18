-- J-REF-17 — a referrer never reads the referred person's identifiers.
--
-- STATUS: READY / NOT APPLIED. WAITING OWNER DB APPROVAL (package 6 in
-- reports/GELLATTI_WWU_DB_APPROVAL_PACKAGES.md). Never part of a bulk push.
--
-- The referral panel reads everything through SECURITY DEFINER RPCs
-- (gellatti_my_referral_dashboard_v1, gellatti_claim_referral_code_v1), and they
-- return nothing about the other person. But `authenticated` also holds a
-- table-level SELECT on the two relationship tables, and their own-row policies
-- let a referrer read, straight through the REST API:
--   referral_rewards            referred_user_id, attribution_id,
--                               stripe_subscription_id, stripe_invoice_id,
--                               reversal_reason
--   user_referral_attributions  referred_user_id
--
-- Nothing uses that grant. No client code reads either table; every function
-- that does is SECURITY DEFINER or not executable by `authenticated`; no view
-- and no policy on another table reads them (checked read-only against the live
-- catalog on 2026-09-17).
--
-- The own-row policies stay. Without the grant they are inert, and if a grant
-- is ever restored they still scope the rows.
--
-- No data is read, written or deleted.

revoke select on public.referral_rewards from authenticated;
revoke select on public.user_referral_attributions from authenticated;
