-- The account-private deletion path is proven; remove the bounded helper.
drop function if exists public.diagnose_internal_account_delete_v1(uuid);
