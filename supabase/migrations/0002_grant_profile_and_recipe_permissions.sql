-- Phase 2A.2 follow-up — table/schema GRANTs (discovered in live testing).
--
-- RLS (migration 0001) decides WHICH ROWS a user may touch, but PostgreSQL also
-- needs role-level GRANTs for the table to be reachable at all. Without these the
-- `authenticated` role hit "permission denied for table saved_recipes" on insert.
-- `anon` gets schema usage only (no table grants) so unauthenticated requests
-- still reach nothing. No privileged-server-role grants here.

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.saved_recipes to authenticated;
