-- ============================================================================
-- ROLLBACK for 20260918140000_payout_execute_caller
-- ============================================================================
-- Removes the caller. pg_net stays (other work uses it), and no payout, batch,
-- entry or adjustment is read, written or deleted. After this nothing can reach
-- payout-execute from the database, and no transfer can be started that way.

drop function if exists public.gellatti_payout_execute_tick_v1(uuid, integer, jsonb);
