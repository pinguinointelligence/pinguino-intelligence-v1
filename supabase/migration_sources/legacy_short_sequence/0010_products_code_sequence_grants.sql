-- Mapper Products — 0010: grant authenticated USAGE on the product-code sequence (fix).
--
-- ROOT CAUSE (found in the 3-row Mercadona import smoke test): inserting into
-- public.products evaluates the product_code DEFAULT = public.next_product_code(), a
-- VOLATILE SECURITY-INVOKER function that calls nextval('public.products_code_seq').
-- The authenticated role has table CRUD (0007) but lacked privilege on the sequence, so
-- Postgres rejected the row: "permission denied for sequence products_code_seq". RLS
-- (which rows a user may touch) is unaffected; this is a missing role-level GRANT, the
-- same class as 0002 for saved_recipes.
--
-- LEAST PRIVILEGE, GRANT-ONLY, to the `authenticated` role ONLY. It touches NO RLS, NO
-- table schema, NO sequence/function logic, NO mapper_basement, NO anon, NO public role,
-- NO service_role; it runs NO DML and uses NO SECURITY DEFINER. Idempotent (GRANT is
-- repeatable). Apply ONCE in the Supabase SQL editor or via `supabase db push`.

-- USAGE is exactly what nextval() needs — the load-bearing fix. We deliberately do NOT
-- grant SELECT (would expose the sequence's current/last value, not needed for inserts)
-- and NOT UPDATE (would also permit setval).
grant usage on sequence public.products_code_seq to authenticated;

-- Belt-and-suspenders: Postgres already grants function EXECUTE to PUBLIC by default, so
-- this is not the load-bearing fix (the sequence USAGE above is). It makes the dependency
-- explicit and survives a future REVOKE of the public default. authenticated only.
grant execute on function public.next_product_code() to authenticated;
