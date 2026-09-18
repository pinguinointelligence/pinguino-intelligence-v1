-- ROLLBACK for 20260917120000_referral_tables_revoke_direct_read.sql
--
-- STATUS: READY / NOT APPLIED. Run only if the forward migration was applied.
-- Restores the table-level SELECT that 20260902100000_refer_a_friend_pro_bonus
-- granted and that is live today. The own-row policies were never dropped, so
-- they scope the rows again the moment the grant returns.

grant select on public.referral_rewards to authenticated;
grant select on public.user_referral_attributions to authenticated;
