-- The rollback-only helper served its bounded staging diagnostic purpose.
drop function if exists public.diagnose_account_delete_v1(uuid);
