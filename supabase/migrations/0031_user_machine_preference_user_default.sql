-- 0031_user_machine_preference_user_default.sql
-- PINGÜINO — the user's OWN default batch + own container (owner hotfix 2026-07-17:
-- „PILNA POPRAWKA UX — PROFIL MASZYNY I EDYCJA DOMYŚLNEGO WSADU”, §9 persistence).
--
-- ADDITIVE ONLY: adds nullable columns to the table 0030 created. No existing column is
-- altered, no data is deleted, nothing is backfilled — a row without these values simply
-- means "no own default, no own container", which is exactly the honest pre-hotfix state.
-- Rollback = drop the three columns (they hold only re-creatable preferences).
--
-- Separation the owner mandated (§9): the manufacturer figure lives in capacity_snapshot,
-- PINGÜINO's recommendation in default_batch (with its provenance), and the USER's own
-- setting here. A recommendation is never overwritten by a user value and vice versa.

alter table public.user_machine_preference
  -- The user's own default recipe batch in grams; null = follow the recommendation.
  add column if not exists user_default_batch_grams numeric
    check (user_default_batch_grams is null or user_default_batch_grams > 0),
  -- „Używam innego pojemnika”: the user's own container. BOTH figures or NEITHER —
  -- a half-declared container is never completed with a guess (see the check below).
  add column if not exists custom_container_capacity_ml numeric
    check (custom_container_capacity_ml is null or custom_container_capacity_ml > 0),
  add column if not exists custom_container_recommended_grams numeric
    check (custom_container_recommended_grams is null or custom_container_recommended_grams > 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_machine_preference'::regclass
      and conname = 'user_machine_preference_custom_container_complete'
  ) then
    alter table public.user_machine_preference
      add constraint user_machine_preference_custom_container_complete check (
        (custom_container_capacity_ml is null and custom_container_recommended_grams is null)
        or (custom_container_capacity_ml is not null and custom_container_recommended_grams is not null)
      );
  end if;
end $$;

-- The record shape the app writes is now schema_version 2 (the app upgrades v1 rows on
-- read). The existing `schema_version >= 1` check already admits it; no DDL needed.
-- RLS, policies and grants are unchanged — 0030 already scopes every row to auth.uid()
-- and grants nothing to anon.
