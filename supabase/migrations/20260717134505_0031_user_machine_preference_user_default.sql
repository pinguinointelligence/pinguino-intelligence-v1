-- 0031_user_machine_preference_user_default.sql
-- PINGÜINO — the user's OWN default batch + own container (owner hotfix 2026-07-17).
-- ADDITIVE ONLY: nullable columns on the table 0030 created. Nothing altered, deleted
-- or backfilled — a row without these values means "no own default, no own container".

alter table public.user_machine_preference
  add column if not exists user_default_batch_grams numeric
    check (user_default_batch_grams is null or user_default_batch_grams > 0),
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
end $$;;
