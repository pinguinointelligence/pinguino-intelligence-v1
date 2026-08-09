-- PINGÜINO FINAL INTEGRATION — cross-owner relationship hardening.
-- Additive policy/trigger repair for the existing 0027–0029 tables. No product,
-- Mapper, recipe, production or pricing data is rewritten by this migration.

-- A duplicated owner_user_id is not sufficient proof that the referenced parent
-- belongs to the caller. Every child insert/update must also prove the complete
-- parent relationship under auth.uid().

drop policy if exists saved_recipe_meta_insert_own on public.saved_recipe_meta;
create policy saved_recipe_meta_insert_own on public.saved_recipe_meta
  for insert with check (
    auth.uid() = owner_user_id
    and exists (
      select 1 from public.saved_recipes recipe
      where recipe.id = saved_recipe_meta.recipe_id
        and recipe.user_id = auth.uid()
    )
  );

drop policy if exists saved_recipe_meta_update_own on public.saved_recipe_meta;
create policy saved_recipe_meta_update_own on public.saved_recipe_meta
  for update using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id
    and exists (
      select 1 from public.saved_recipes recipe
      where recipe.id = saved_recipe_meta.recipe_id
        and recipe.user_id = auth.uid()
    )
  );

drop policy if exists recipe_versions_insert_own on public.recipe_versions;
create policy recipe_versions_insert_own on public.recipe_versions
  for insert with check (
    auth.uid() = owner_user_id
    and auth.uid() = created_by
    and exists (
      select 1 from public.saved_recipes recipe
      where recipe.id = recipe_versions.recipe_id
        and recipe.user_id = auth.uid()
    )
  );

drop policy if exists production_runs_insert_own on public.production_runs;
create policy production_runs_insert_own on public.production_runs
  for insert with check (
    auth.uid() = owner_user_id
    and auth.uid() = created_by
    and exists (
      select 1
      from public.saved_recipes recipe
      join public.recipe_versions version on version.recipe_id = recipe.id
      where recipe.id = production_runs.recipe_id
        and recipe.user_id = auth.uid()
        and version.id = production_runs.recipe_version_id
        and version.owner_user_id = auth.uid()
        and version.version_number = production_runs.recipe_version_number
    )
  );

drop policy if exists production_runs_update_own on public.production_runs;
create policy production_runs_update_own on public.production_runs
  for update using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id
    and auth.uid() = created_by
    and exists (
      select 1
      from public.saved_recipes recipe
      join public.recipe_versions version on version.recipe_id = recipe.id
      where recipe.id = production_runs.recipe_id
        and recipe.user_id = auth.uid()
        and version.id = production_runs.recipe_version_id
        and version.owner_user_id = auth.uid()
        and version.version_number = production_runs.recipe_version_number
    )
  );

create or replace function public.enforce_production_run_immutability()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled production is immutable.' using errcode = '23514';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
    or new.recipe_id is distinct from old.recipe_id
    or new.recipe_version_id is distinct from old.recipe_version_id
    or new.recipe_version_number is distinct from old.recipe_version_number
    or new.planned_batch_g is distinct from old.planned_batch_g
    or new.product_profile is distinct from old.product_profile
    or new.temperature_c is distinct from old.temperature_c
    or new.engine_version is distinct from old.engine_version
    or new.config_version is distinct from old.config_version
    or new.mapper_dataset_version is distinct from old.mapper_dataset_version
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Production source and frozen plan metadata are immutable.' using errcode = '23514';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('planned', 'cancelled'))
    or (old.status = 'planned' and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'Illegal production status transition.' using errcode = '23514';
  end if;

  if new.status = 'completed' and new.completed_at is null then
    raise exception 'Completed production requires completed_at.' using errcode = '23514';
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    raise exception 'Cancelled production requires cancelled_at.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists production_runs_immutable_source on public.production_runs;
create trigger production_runs_immutable_source
before update on public.production_runs
for each row execute function public.enforce_production_run_immutability();

drop policy if exists production_planned_items_insert_own on public.production_run_planned_items;
create policy production_planned_items_insert_own on public.production_run_planned_items
  for insert with check (
    auth.uid() = owner_user_id
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_planned_items.run_id
        and run.owner_user_id = auth.uid()
        and run.status = 'draft'
    )
  );

drop policy if exists production_actuals_insert_own on public.production_run_actuals;
create policy production_actuals_insert_own on public.production_run_actuals
  for insert with check (
    auth.uid() = owner_user_id
    and auth.uid() = recorded_by
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_actuals.run_id
        and run.owner_user_id = auth.uid()
        and run.status = 'in_progress'
    )
  );

drop policy if exists production_actuals_update_own on public.production_run_actuals;
create policy production_actuals_update_own on public.production_run_actuals
  for update using (auth.uid() = owner_user_id)
  with check (
    auth.uid() = owner_user_id
    and auth.uid() = recorded_by
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_actuals.run_id
        and run.owner_user_id = auth.uid()
        and run.status = 'in_progress'
    )
  );

create or replace function public.enforce_active_production_actuals()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.production_runs run
    where run.id = new.run_id
      and run.owner_user_id = new.owner_user_id
      and run.status = 'in_progress'
  ) then
    raise exception 'Actuals are writable only for an in-progress owned run.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
    new.run_id is distinct from old.run_id
    or new.owner_user_id is distinct from old.owner_user_id
  ) then
    raise exception 'Production actual ownership is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists production_actuals_active_run on public.production_run_actuals;
create trigger production_actuals_active_run
before insert or update on public.production_run_actuals
for each row execute function public.enforce_active_production_actuals();

drop policy if exists production_events_insert_own on public.production_run_events;
create policy production_events_insert_own on public.production_run_events
  for insert with check (
    auth.uid() = owner_user_id
    and auth.uid() = created_by
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_events.run_id
        and run.owner_user_id = auth.uid()
    )
  );

create or replace function public.enforce_production_event_state()
returns trigger language plpgsql set search_path = public as $$
declare
  run_status text;
begin
  select status into run_status
  from public.production_runs
  where id = new.run_id and owner_user_id = new.owner_user_id;

  if run_status is null then
    raise exception 'Production event requires its owned parent run.' using errcode = '23514';
  end if;

  if not (
    new.event_type = 'note_added'
    or (new.event_type = 'created' and run_status = 'draft')
    or (new.event_type = 'planned' and run_status = 'planned')
    or (new.event_type in ('started', 'actual_recorded') and run_status = 'in_progress')
    or (new.event_type in ('completed', 'amended') and run_status = 'completed')
    or (new.event_type = 'cancelled' and run_status = 'cancelled')
  ) then
    raise exception 'Production event is incompatible with the current run status.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists production_events_match_run_state on public.production_run_events;
create trigger production_events_match_run_state
before insert on public.production_run_events
for each row execute function public.enforce_production_event_state();

drop policy if exists cost_entries_insert_own on public.ingredient_cost_entries;
create policy cost_entries_insert_own on public.ingredient_cost_entries
  for insert with check (auth.uid() = owner_user_id and auth.uid() = created_by);

drop policy if exists cost_entries_update_own on public.ingredient_cost_entries;
create policy cost_entries_update_own on public.ingredient_cost_entries
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id and auth.uid() = created_by);

drop policy if exists cost_snapshots_insert_own on public.recipe_cost_snapshots;
create policy cost_snapshots_insert_own on public.recipe_cost_snapshots
  for insert with check (
    auth.uid() = owner_user_id
    and auth.uid() = created_by
    and exists (
      select 1
      from public.saved_recipes recipe
      join public.recipe_versions version on version.recipe_id = recipe.id
      where recipe.id = recipe_cost_snapshots.recipe_id
        and recipe.user_id = auth.uid()
        and version.id = recipe_cost_snapshots.recipe_version_id
        and version.owner_user_id = auth.uid()
    )
    and (
      production_run_id is null
      or exists (
        select 1 from public.production_runs run
        where run.id = recipe_cost_snapshots.production_run_id
          and run.owner_user_id = auth.uid()
          and run.recipe_id = recipe_cost_snapshots.recipe_id
          and run.recipe_version_id = recipe_cost_snapshots.recipe_version_id
      )
    )
  );
