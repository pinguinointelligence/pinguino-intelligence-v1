-- Rollback for 20260918160000_partner_commission_netting.sql
--
-- Drops the three read-only functions and nothing else. No ledger row, payout
-- line or grant on any other object is touched. After this the panels have no
-- net figure to read and show "—" until the migration is applied again.

drop function if exists public.gellatti_admin_partner_pending_commission_v1();
drop function if exists public.gellatti_partner_pending_commission_v1();
drop function if exists public.gellatti_partner_commission_netting_v1(uuid, boolean);
