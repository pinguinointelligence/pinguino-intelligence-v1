-- Rollback for 20260918150000_payout_reclaim_stale_lines.sql
--
-- Drops the function and nothing else. No payout line, audit row or reservation
-- is touched: a line this function reopened stays where the executor left it,
-- and the audit rows it wrote stay as the record of why.

drop function if exists public.gellatti_reclaim_stale_payout_lines_v1(uuid, interval, integer, timestamptz);
