-- PINGÜINO Production recovery — server-authoritative Pro gate and atomic writes.
-- Forward-only. Apply to confirmed staging before any public-production decision.
-- No recipe, run, ProductBehavior, Mapper, secret, or environment row is rewritten here.

alter table public.production_runs
  drop constraint if exists production_runs_recipe_id_fkey;
alter table public.production_runs
  add constraint production_runs_recipe_id_fkey
  foreign key (recipe_id) references public.saved_recipes(id) on delete restrict;

alter table public.production_runs
  add column if not exists rescue_recipe_input jsonb,
  add column if not exists rescue_product_composition jsonb,
  add column if not exists rescue_accepted_by uuid,
  add column if not exists rescue_accepted_at timestamptz,
  add column if not exists rescue_revision integer not null default 0,
  add column if not exists actual_revision integer not null default 0;

create unique index if not exists production_runs_one_active_exact_batch
  on public.production_runs (owner_user_id, recipe_version_id, planned_batch_g)
  where status = 'in_progress';
alter table public.production_runs
  drop constraint if exists production_runs_rescue_snapshot_complete;
alter table public.production_runs
  add constraint production_runs_rescue_snapshot_complete check (
    (rescue_recipe_input is null and rescue_product_composition is null
      and rescue_accepted_by is null and rescue_accepted_at is null
      and rescue_revision = 0)
    or
    (rescue_recipe_input is not null and rescue_product_composition is not null
      and rescue_accepted_by is not null and rescue_accepted_at is not null
      and rescue_revision > 0)
  );

alter table public.production_run_events
  drop constraint if exists production_run_events_event_type_check;
alter table public.production_run_events
  add constraint production_run_events_event_type_check check (
    event_type in (
      'created','planned','started','actual_recorded','rescue_applied',
      'completed','cancelled','amended','note_added'
    )
  );

create or replace function public.has_active_production_entitlement_v1()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select auth.uid() is not null and exists (
    select 1 from public.entitlements entitlement
    where entitlement.user_id = auth.uid()
      and entitlement.scope = 'pro'
      and entitlement.status = 'active'
      and entitlement.starts_at <= statement_timestamp()
      and (entitlement.ends_at is null or entitlement.ends_at > statement_timestamp())
  );
$$;
revoke all on function public.has_active_production_entitlement_v1()
  from public, anon, authenticated;
grant execute on function public.has_active_production_entitlement_v1() to authenticated;

create or replace function public.assert_production_pro_entitlement_v1()
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.has_active_production_entitlement_v1() then
    raise exception 'active Pro entitlement required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function public.assert_production_pro_entitlement_v1()
  from public, anon, authenticated;

-- Owner-readable history remains available after downgrade. Write policies are Pro-gated as
-- defence in depth; direct authenticated table-write grants are revoked after the RPC cutover.
drop policy if exists production_runs_insert_own on public.production_runs;
create policy production_runs_insert_own on public.production_runs
  for insert with check (
    public.has_active_production_entitlement_v1()
    and auth.uid() = owner_user_id and auth.uid() = created_by
    and exists (
      select 1 from public.saved_recipes recipe
      join public.recipe_versions version on version.recipe_id = recipe.id
      where recipe.id = production_runs.recipe_id and recipe.user_id = auth.uid()
        and version.id = production_runs.recipe_version_id
        and version.owner_user_id = auth.uid()
        and version.version_number = production_runs.recipe_version_number
    )
  );
drop policy if exists production_runs_update_own on public.production_runs;
create policy production_runs_update_own on public.production_runs
  for update using (
    auth.uid() = owner_user_id and public.has_active_production_entitlement_v1()
  ) with check (
    public.has_active_production_entitlement_v1()
    and auth.uid() = owner_user_id and auth.uid() = created_by
  );
drop policy if exists production_planned_items_insert_own
  on public.production_run_planned_items;
create policy production_planned_items_insert_own on public.production_run_planned_items
  for insert with check (
    public.has_active_production_entitlement_v1()
    and auth.uid() = owner_user_id
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_planned_items.run_id
        and run.owner_user_id = auth.uid() and run.status = 'draft'
    )
  );
drop policy if exists production_actuals_insert_own on public.production_run_actuals;
create policy production_actuals_insert_own on public.production_run_actuals
  for insert with check (
    public.has_active_production_entitlement_v1()
    and auth.uid() = owner_user_id and auth.uid() = recorded_by
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_actuals.run_id
        and run.owner_user_id = auth.uid() and run.status = 'in_progress'
    )
  );
drop policy if exists production_actuals_update_own on public.production_run_actuals;
create policy production_actuals_update_own on public.production_run_actuals
  for update using (
    auth.uid() = owner_user_id and public.has_active_production_entitlement_v1()
  ) with check (
    public.has_active_production_entitlement_v1()
    and auth.uid() = owner_user_id and auth.uid() = recorded_by
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_actuals.run_id
        and run.owner_user_id = auth.uid() and run.status = 'in_progress'
    )
  );
drop policy if exists production_events_insert_own on public.production_run_events;
create policy production_events_insert_own on public.production_run_events
  for insert with check (
    public.has_active_production_entitlement_v1()
    and auth.uid() = owner_user_id and auth.uid() = created_by
    and exists (
      select 1 from public.production_runs run
      where run.id = production_run_events.run_id and run.owner_user_id = auth.uid()
    )
  );

-- Freeze the complete scaled plan and its created event in one transaction. The immutable
-- version supplies all owner/recipe/profile/trace authority; none is accepted from the browser.
create or replace function public.production_create_run_v1(
  p_run_id uuid, p_recipe_version_id uuid, p_planned_batch_g numeric,
  p_planned_items jsonb, p_event_id uuid, p_meta jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_version public.recipe_versions%rowtype;
  v_item jsonb;
  v_source jsonb;
  v_scope text;
  v_line_id text;
  v_scope_position integer;
  v_base_count integer;
  v_topping_count integer;
  v_expected_count integer;
  v_expected_grams numeric;
  v_event_at timestamptz := clock_timestamp();
begin
  if p_run_id is null or p_event_id is null or p_planned_batch_g <= 0 then
    raise exception 'positive batch, run id and event id are required' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_planned_items), '') <> 'array' then
    raise exception 'planned production items must be an array' using errcode = '22023';
  end if;

  select version.* into v_version from public.recipe_versions version
  join public.saved_recipes recipe on recipe.id = version.recipe_id
  where version.id = p_recipe_version_id and version.owner_user_id = v_uid
    and recipe.user_id = v_uid;
  if not found then
    raise exception 'exact owned recipe version required' using errcode = '42501';
  end if;
  perform public.assert_recipe_behavior_authority_v1(
    v_version.recipe_input, v_version.product_composition, 'PRODUCTION'
  );

  v_base_count := jsonb_array_length(coalesce(v_version.recipe_input->'items', '[]'::jsonb));
  v_topping_count := jsonb_array_length(
    coalesce(v_version.product_composition->'toppings', '[]'::jsonb)
  );
  v_expected_count := v_base_count + v_topping_count;
  if jsonb_array_length(p_planned_items) <> v_expected_count then
    raise exception 'planned vector is incomplete' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_planned_items) line
    group by line->>'line_id' having count(*) <> 1
  ) then
    raise exception 'planned vector contains duplicate line ids' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_planned_items) line
    where (line->>'planned_grams')::numeric < 0
      or (line->>'display_grams')::numeric < 0
      or line->>'process_scope' not in ('BASE_FORMULATION', 'POST_PROCESS_ADDON')
  ) then
    raise exception 'planned vector has invalid grams or scope' using errcode = '22023';
  end if;
  if abs((select coalesce(sum((line->>'planned_grams')::numeric), 0)
      from jsonb_array_elements(p_planned_items) line
      where line->>'process_scope' = 'BASE_FORMULATION') - p_planned_batch_g) > 0.000001 then
    raise exception 'base planned grams must total the exact batch' using errcode = '22023';
  end if;
  if abs((select coalesce(sum((line->>'display_grams')::numeric), 0)
      from jsonb_array_elements(p_planned_items) line
      where line->>'process_scope' = 'BASE_FORMULATION') - p_planned_batch_g) > 0.000001 then
    raise exception 'base display grams must total the exact batch' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.production_runs run
    where run.id = p_run_id and run.owner_user_id = v_uid
      and run.recipe_version_id = p_recipe_version_id
      and run.planned_batch_g = p_planned_batch_g
  ) then return p_run_id; end if;

  insert into public.production_runs (
    id, owner_user_id, recipe_id, recipe_version_id, recipe_version_number,
    status, planned_batch_g, product_profile, temperature_c,
    engine_version, config_version, mapper_dataset_version,
    planned_date, machine, location, batch_reference, notes,
    created_by, created_at, updated_at
  ) values (
    p_run_id, v_uid, v_version.recipe_id, v_version.id, v_version.version_number,
    'draft', p_planned_batch_g, v_version.product_profile, v_version.temperature_c,
    v_version.engine_version, v_version.config_version, v_version.mapper_dataset_version,
    nullif(p_meta->>'planned_date', '')::date,
    nullif(p_meta->>'machine', ''), nullif(p_meta->>'location', ''),
    nullif(p_meta->>'batch_reference', ''), nullif(p_meta->>'notes', ''),
    v_uid, v_event_at, v_event_at
  );

  for v_item in select value from jsonb_array_elements(p_planned_items)
  loop
    v_scope := v_item->>'process_scope';
    v_line_id := v_item->>'line_id';
    if v_scope = 'BASE_FORMULATION' then
      select item.value, coalesce((
        select ordered.ordinality::integer - 1
        from jsonb_array_elements_text(
          coalesce(v_version.product_composition->'baseOrder', '[]'::jsonb)
        ) with ordinality ordered(line_id, ordinality)
        where ordered.line_id = v_line_id
      ), item.ordinality::integer - 1) into v_source, v_scope_position
      from jsonb_array_elements(v_version.recipe_input->'items') with ordinality item
      where item.value->>'id' = v_line_id;
    else
      select item.value, coalesce(
        (item.value->>'addon_sort_order')::integer, item.ordinality::integer - 1
      ) into v_source, v_scope_position
      from jsonb_array_elements(
        coalesce(v_version.product_composition->'toppings', '[]'::jsonb)
      ) with ordinality item where item.value->>'id' = v_line_id;
    end if;
    if v_source is null then
      raise exception 'planned line is not part of the immutable recipe version'
        using errcode = '22023';
    end if;
    v_expected_grams := (v_source->>'planned_grams')::numeric
      * p_planned_batch_g / v_version.total_batch_g;
    if abs((v_item->>'planned_grams')::numeric - v_expected_grams) > 0.001001
      or abs((v_item->>'display_grams')::numeric - v_expected_grams) > 0.100001 then
      raise exception 'planned line does not match immutable-version scaling'
        using errcode = '22023';
    end if;
    insert into public.production_run_planned_items (
      run_id, owner_user_id, line_id, name, planned_grams, display_grams,
      position, process_scope, canonical_ingredient_id, scope_position
    ) values (
      p_run_id, v_uid, v_line_id, v_source#>>'{ingredient,name}',
      (v_item->>'planned_grams')::numeric, (v_item->>'display_grams')::numeric,
      case when v_scope = 'BASE_FORMULATION'
        then v_scope_position else v_base_count + v_scope_position end,
      v_scope,
      coalesce(nullif(v_source#>>'{ingredient,canonical_ingredient_id}', ''),
        nullif(v_source#>>'{ingredient,id}', '')),
      v_scope_position
    );
    v_source := null;
  end loop;

  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (p_event_id, p_run_id, v_uid, 'created', null, null, v_uid, v_event_at);
  return p_run_id;
end;
$$;

-- Served Production uses one database transaction for plan freeze and explicit start. A lost
-- HTTP response can be retried with the same run/event ids without creating a second physical run.
create or replace function public.production_start_run_v1(
  p_run_id uuid, p_recipe_version_id uuid, p_planned_batch_g numeric,
  p_planned_items jsonb, p_created_event_id uuid, p_planned_event_id uuid,
  p_started_event_id uuid, p_meta jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_status text;
  v_existing_run_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_uid::text || ':' || p_recipe_version_id::text || ':' || p_planned_batch_g::text, 0
  ));
  select id into v_existing_run_id
  from public.production_runs
  where owner_user_id = v_uid
    and recipe_version_id = p_recipe_version_id
    and planned_batch_g = p_planned_batch_g
    and status = 'in_progress'
  order by created_at asc limit 1;
  if found then return v_existing_run_id; end if;
  perform public.production_create_run_v1(
    p_run_id, p_recipe_version_id, p_planned_batch_g,
    p_planned_items, p_created_event_id, p_meta
  );
  select status into v_status from public.production_runs
  where id = p_run_id and owner_user_id = v_uid for update;
  if v_status = 'draft' then
    perform public.production_transition_run_v1(p_run_id, 'planned', p_planned_event_id);
    v_status := 'planned';
  end if;
  if v_status = 'planned' then
    perform public.production_transition_run_v1(p_run_id, 'in_progress', p_started_event_id);
    v_status := 'in_progress';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'run cannot be started from current state' using errcode = '23514';
  end if;
  return p_run_id;
end;
$$;

create or replace function public.production_transition_run_v1(
  p_run_id uuid, p_to_status text, p_event_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_run public.production_runs%rowtype;
  v_event_type text;
  v_at timestamptz := clock_timestamp();
begin
  select * into v_run from public.production_runs
  where id = p_run_id and owner_user_id = v_uid for update;
  if not found then raise exception 'owned production run required' using errcode = '42501'; end if;
  if not ((v_run.status = 'draft' and p_to_status in ('planned', 'cancelled'))
    or (v_run.status = 'planned' and p_to_status in ('in_progress', 'cancelled'))
    or (v_run.status = 'in_progress' and p_to_status in ('completed', 'cancelled'))) then
    raise exception 'illegal production status transition' using errcode = '23514';
  end if;
  if p_to_status = 'completed' and not exists (
    select 1 from public.production_run_actuals actual
    where actual.run_id = p_run_id
      and actual.actual_total_mix_g is not null
      and jsonb_array_length(actual.actual_items) = (
        select count(*) from public.production_run_planned_items planned
        where planned.run_id = p_run_id
      ) + (
        select count(*)
        from jsonb_array_elements(coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)) item
        where not exists (
          select 1 from public.production_run_planned_items planned
          where planned.run_id = p_run_id and planned.line_id = item->>'id'
        )
      )
      and not exists (
        select 1 from jsonb_array_elements(actual.actual_items) item
        where item->>'actualGrams' is null
          or item->>'confirmedAt' is null
          or item->>'confirmationOrder' is null
      )
      and (
        select count(distinct (item->>'confirmationOrder')::integer)
        from jsonb_array_elements(actual.actual_items) item
      ) = jsonb_array_length(actual.actual_items)
      and abs(actual.actual_total_mix_g - (
        select coalesce(sum((item->>'actualGrams')::numeric), 0)
        from jsonb_array_elements(actual.actual_items) item
        where not exists (
          select 1 from public.production_run_planned_items planned
          where planned.run_id = p_run_id and planned.line_id = item->>'id'
            and planned.process_scope = 'POST_PROCESS_ADDON'
        )
      )) <= 0.000001
  ) then
    raise exception 'complete actual vector and coherent Base total required'
      using errcode = '23514';
  end if;
  v_event_type := case p_to_status
    when 'planned' then 'planned' when 'in_progress' then 'started'
    when 'completed' then 'completed' when 'cancelled' then 'cancelled' end;
  update public.production_runs set status = p_to_status,
    completed_at = case when p_to_status = 'completed' then v_at else null end,
    cancelled_at = case when p_to_status = 'cancelled' then v_at else null end,
    updated_at = v_at where id = p_run_id;
  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (p_event_id, p_run_id, v_uid, v_event_type, null, null, v_uid, v_at);
  return p_run_id;
end;
$$;

create or replace function public.production_update_meta_v1(
  p_run_id uuid, p_planned_date date, p_machine text, p_location text,
  p_batch_reference text, p_notes text
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_uid uuid := public.assert_production_pro_entitlement_v1();
begin
  update public.production_runs set planned_date = p_planned_date, machine = p_machine,
    location = p_location, batch_reference = p_batch_reference, notes = p_notes,
    updated_at = clock_timestamp()
  where id = p_run_id and owner_user_id = v_uid and status not in ('completed', 'cancelled');
  if not found then
    raise exception 'owned mutable production run required' using errcode = '42501';
  end if;
  return p_run_id;
end;
$$;

create or replace function public.production_apply_rescue_v1(
  p_run_id uuid, p_expected_rescue_revision integer, p_expected_actual_revision integer,
  p_recipe_input jsonb, p_product_composition jsonb, p_event_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_run public.production_runs%rowtype;
  v_version public.recipe_versions%rowtype;
  v_at timestamptz := clock_timestamp();
begin
  select * into v_run from public.production_runs
  where id = p_run_id and owner_user_id = v_uid and status = 'in_progress' for update;
  if not found then
    raise exception 'owned in-progress production run required' using errcode = '42501';
  end if;
  if v_run.rescue_revision is distinct from p_expected_rescue_revision
    or v_run.actual_revision is distinct from p_expected_actual_revision then
    raise exception 'production rescue revision conflict; reload required'
      using errcode = '40001';
  end if;
  if coalesce(jsonb_typeof(p_recipe_input), '') <> 'object'
    or coalesce(jsonb_typeof(p_recipe_input->'items'), '') <> 'array'
    or coalesce(jsonb_typeof(p_product_composition), '') <> 'object'
    or coalesce(jsonb_typeof(p_recipe_input->'target_batch_grams'), '') <> 'number'
    or (p_recipe_input->>'target_batch_grams')::numeric <= 0 then
    raise exception 'structured rescue snapshot required' using errcode = '22023';
  end if;
  select * into v_version from public.recipe_versions
  where id = v_run.recipe_version_id and owner_user_id = v_uid;
  if not found then
    raise exception 'exact owned recipe version required' using errcode = '42501';
  end if;
  if coalesce(p_product_composition->'toppings', '[]'::jsonb)
    <> coalesce(v_version.product_composition->'toppings', '[]'::jsonb) then
    raise exception 'rescue cannot change the frozen topping plan' using errcode = '22023';
  end if;
  if p_recipe_input->'mode' is distinct from v_version.recipe_input->'mode'
    or p_recipe_input->'category' is distinct from v_version.recipe_input->'category'
    or p_recipe_input->'target_temperature_c'
      is distinct from v_version.recipe_input->'target_temperature_c'
    or p_recipe_input->'machine_capacity_grams'
      is distinct from v_version.recipe_input->'machine_capacity_grams'
    or p_recipe_input->'goals' is distinct from v_version.recipe_input->'goals' then
    raise exception 'rescue cannot change the frozen Engine context' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_recipe_input->'items') item
    group by item->>'id' having count(*) <> 1
  ) or exists (
    select 1 from public.production_run_planned_items planned
    where planned.run_id = p_run_id and planned.process_scope = 'BASE_FORMULATION'
      and not exists (
        select 1 from jsonb_array_elements(p_recipe_input->'items') item
        where item->>'id' = planned.line_id
      )
  ) then
    raise exception 'rescue must preserve every frozen Base line exactly once'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_version.recipe_input->'items') source
    join jsonb_array_elements(p_recipe_input->'items') candidate
      on candidate->>'id' = source->>'id'
    where candidate->'ingredient' is distinct from source->'ingredient'
  ) then
    raise exception 'rescue cannot replace a frozen ingredient identity or Engine facts'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)) prior
    where not exists (
      select 1 from jsonb_array_elements(p_recipe_input->'items') candidate
      where candidate->>'id' = prior->>'id'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)) prior
    join jsonb_array_elements(p_recipe_input->'items') candidate
      on candidate->>'id' = prior->>'id'
    where candidate->'ingredient' is distinct from prior->'ingredient'
  ) then
    raise exception 'rescue must preserve every previously accepted Rescue line and identity'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_recipe_input->'items') item
    where coalesce(jsonb_typeof(item->'planned_grams'), '') <> 'number'
      or coalesce(jsonb_typeof(item->'actual_grams'), '') <> 'null'
      or (item->>'planned_grams')::numeric < 0
      or (item->>'planned_grams')::numeric <> trunc((item->>'planned_grams')::numeric)
  ) then
    raise exception 'rescue targets must be non-negative practical whole grams'
      using errcode = '22023';
  end if;
  if abs((p_recipe_input->>'target_batch_grams')::numeric - (
    select coalesce(sum(coalesce(
      (item->>'planned_grams')::numeric
    )), 0) from jsonb_array_elements(p_recipe_input->'items') item
  )) > 0.000001 then
    raise exception 'rescue target batch must equal its complete Base vector'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.production_run_actuals actual,
      jsonb_array_elements(actual.actual_items) recorded
    where actual.run_id = p_run_id and recorded->>'actualGrams' is not null
      and (
        not exists (
          select 1 from jsonb_array_elements(p_recipe_input->'items') candidate
          where candidate->>'id' = recorded->>'id'
        )
        or exists (
        select 1 from jsonb_array_elements(p_recipe_input->'items') candidate
        where candidate->>'id' = recorded->>'id'
          and (candidate->>'planned_grams')::numeric
            + 0.000001 < (recorded->>'actualGrams')::numeric
        )
      )
  ) then
    raise exception 'rescue cannot reduce physically recorded material'
      using errcode = '23514';
  end if;
  perform public.assert_recipe_behavior_authority_v1(
    p_recipe_input, p_product_composition, 'BATCH_RESCUE'
  );
  update public.production_runs set
    rescue_recipe_input = p_recipe_input,
    rescue_product_composition = p_product_composition,
    rescue_accepted_by = v_uid,
    rescue_accepted_at = v_at,
    rescue_revision = rescue_revision + 1,
    updated_at = v_at
  where id = p_run_id;
  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (
    p_event_id, p_run_id, v_uid, 'rescue_applied',
    'Server-validated BATCH_RESCUE candidate accepted',
    jsonb_build_object(
      'lineCount', jsonb_array_length(p_recipe_input->'items'),
      'recipeInput', p_recipe_input,
      'productComposition', p_product_composition,
      'acceptedAt', v_at,
      'revision', v_run.rescue_revision + 1
    ),
    v_uid, v_at
  );
  return p_run_id;
end;
$$;

create or replace function public.production_record_actual_v1(
  p_run_id uuid, p_expected_actual_revision integer, p_expected_rescue_revision integer,
  p_actual_items jsonb, p_substitutions jsonb,
  p_actual_total_mix_g numeric, p_actual_yield_g numeric, p_waste_g numeric,
  p_operator_notes text, p_deviation_reason text, p_event_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_at timestamptz := clock_timestamp();
  v_clean_items jsonb;
  v_run public.production_runs%rowtype;
  v_expected_count integer;
begin
  select * into v_run from public.production_runs
  where id = p_run_id and owner_user_id = v_uid and status = 'in_progress' for update;
  if not found then
    raise exception 'owned in-progress production run required' using errcode = '42501';
  end if;
  if v_run.actual_revision is distinct from p_expected_actual_revision
    or v_run.rescue_revision is distinct from p_expected_rescue_revision then
    raise exception 'production actual revision conflict; reload required'
      using errcode = '40001';
  end if;
  if coalesce(jsonb_typeof(p_actual_items), '') <> 'array'
    or coalesce(jsonb_typeof(p_substitutions), '') <> 'array' then
    raise exception 'actual items and substitutions must be arrays' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_actual_items) item
    group by item->>'id' having count(*) <> 1
  ) then
    raise exception 'actual vector contains duplicate line ids' using errcode = '22023';
  end if;
  select count(*) + (
    select count(*)
    from jsonb_array_elements(coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)) item
    where not exists (
      select 1 from public.production_run_planned_items planned
      where planned.run_id = p_run_id and planned.line_id = item->>'id'
    )
  ) into v_expected_count
  from public.production_run_planned_items planned where planned.run_id = p_run_id;
  if jsonb_array_length(p_actual_items) <> v_expected_count then
    raise exception 'actual vector must contain every frozen and rescue line exactly once'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_actual_items) item
    where not exists (
      select 1 from public.production_run_planned_items planned
      where planned.run_id = p_run_id and planned.line_id = item->>'id'
    ) and not exists (
      select 1 from jsonb_array_elements(
        coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)
      ) rescue where rescue->>'id' = item->>'id'
    ) or coalesce(jsonb_typeof(item->'actualGrams'), '') not in ('number', 'null') or (
      item->>'actualGrams' is not null and (item->>'actualGrams')::numeric < 0
    )
  ) then
    raise exception 'actual vector contains an unknown line or invalid grams'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_actual_items) item
    where item->>'actualGrams' is not null and (
      jsonb_typeof(item->'confirmedAt') is distinct from 'string'
      or nullif(item->>'confirmedAt', '')::timestamptz is null
      or jsonb_typeof(item->'confirmationOrder') is distinct from 'number'
      or (item->>'confirmationOrder')::numeric <= 0
      or (item->>'confirmationOrder')::numeric
        <> trunc((item->>'confirmationOrder')::numeric)
    )
  ) then
    raise exception 'confirmed actual lines require exact timestamp and positive integer order'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_actual_items) item
    where item->>'actualGrams' is not null
    group by (item->>'confirmationOrder')::integer having count(*) > 1
  ) then
    raise exception 'confirmed actual lines require unique operator chronology'
      using errcode = '22023';
  end if;
  if p_actual_yield_g < 0 or p_waste_g < 0 then
    raise exception 'yield and waste must be non-negative' using errcode = '22023';
  end if;
  if p_actual_total_mix_g is not null and (
    exists (
      select 1 from jsonb_array_elements(p_actual_items) item
      where item->>'actualGrams' is null and not exists (
        select 1 from public.production_run_planned_items planned
        where planned.run_id = p_run_id and planned.line_id = item->>'id'
          and planned.process_scope = 'POST_PROCESS_ADDON'
      )
    ) or abs(p_actual_total_mix_g - (
      select coalesce(sum((item->>'actualGrams')::numeric), 0)
      from jsonb_array_elements(p_actual_items) item
      where item->>'actualGrams' is not null and not exists (
        select 1 from public.production_run_planned_items planned
        where planned.run_id = p_run_id and planned.line_id = item->>'id'
          and planned.process_scope = 'POST_PROCESS_ADDON'
      )
    )) > 0.000001
  ) then
    raise exception 'actual Base total is incomplete or incoherent' using errcode = '22023';
  end if;
  with expected as (
    select planned.line_id, planned.name, planned.position
    from public.production_run_planned_items planned where planned.run_id = p_run_id
    union all
    select rescue.value->>'id', rescue.value#>>'{ingredient,name}',
      100000 + rescue.ordinality::integer
    from jsonb_array_elements(
      coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)
    ) with ordinality rescue
    where not exists (
      select 1 from public.production_run_planned_items planned
      where planned.run_id = p_run_id and planned.line_id = rescue.value->>'id'
    )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', expected.line_id, 'name', expected.name,
    'actualGrams', item.value->'actualGrams',
    'confirmedAt', item.value->'confirmedAt',
    'confirmationOrder', item.value->'confirmationOrder'
  ) order by expected.position), '[]'::jsonb) into v_clean_items
  from jsonb_array_elements(p_actual_items) item
  join expected on expected.line_id = item.value->>'id';
  insert into public.production_run_actuals (
    run_id, owner_user_id, actual_items, substitutions,
    actual_total_mix_g, actual_yield_g, waste_g,
    operator_notes, deviation_reason, recorded_by, recorded_at
  ) values (
    p_run_id, v_uid, v_clean_items, p_substitutions,
    p_actual_total_mix_g, p_actual_yield_g, p_waste_g,
    p_operator_notes, p_deviation_reason, v_uid, v_at
  ) on conflict (run_id) do update set actual_items = excluded.actual_items,
    substitutions = excluded.substitutions, actual_total_mix_g = excluded.actual_total_mix_g,
    actual_yield_g = excluded.actual_yield_g, waste_g = excluded.waste_g,
    operator_notes = excluded.operator_notes, deviation_reason = excluded.deviation_reason,
    recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
  update public.production_runs set
    updated_at = v_at,
    actual_revision = actual_revision + 1
  where id = p_run_id;
  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (
    p_event_id, p_run_id, v_uid, 'actual_recorded', null,
    jsonb_build_object(
      'actualItems', v_clean_items,
      'actualTotalMixG', p_actual_total_mix_g,
      'recordedAt', v_at,
      'revision', v_run.actual_revision + 1
    ),
    v_uid, v_at
  );
  return p_run_id;
end;
$$;

-- Final actual + completeness/coherence validation + terminal event are one transaction.
create or replace function public.production_complete_run_v1(
  p_run_id uuid, p_expected_actual_revision integer, p_expected_rescue_revision integer,
  p_actual_items jsonb, p_substitutions jsonb,
  p_actual_total_mix_g numeric, p_actual_yield_g numeric, p_waste_g numeric,
  p_operator_notes text, p_deviation_reason text,
  p_actual_event_id uuid, p_completed_event_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_status text;
begin
  select status into v_status from public.production_runs
  where id = p_run_id and owner_user_id = v_uid for update;
  if not found then
    raise exception 'owned production run required' using errcode = '42501';
  end if;
  if v_status = 'completed' then return p_run_id; end if;
  if v_status <> 'in_progress' then
    raise exception 'owned in-progress production run required' using errcode = '23514';
  end if;
  perform public.production_record_actual_v1(
    p_run_id, p_expected_actual_revision, p_expected_rescue_revision,
    p_actual_items, p_substitutions, p_actual_total_mix_g,
    p_actual_yield_g, p_waste_g, p_operator_notes, p_deviation_reason,
    p_actual_event_id
  );
  perform public.production_transition_run_v1(
    p_run_id, 'completed', p_completed_event_id
  );
  return p_run_id;
end;
$$;

create or replace function public.production_append_amendment_v1(
  p_run_id uuid, p_event_id uuid, p_detail text, p_amendment jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_at timestamptz := clock_timestamp();
begin
  perform 1 from public.production_runs
  where id = p_run_id and owner_user_id = v_uid and status = 'completed' for share;
  if not found then
    raise exception 'owned completed production run required' using errcode = '42501';
  end if;
  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (p_event_id, p_run_id, v_uid, 'amended', p_detail, p_amendment, v_uid, v_at);
  return p_run_id;
end;
$$;

revoke insert, update, delete on public.production_runs from authenticated;
revoke insert, update, delete on public.production_run_planned_items from authenticated;
revoke insert, update, delete on public.production_run_actuals from authenticated;
revoke insert, update, delete on public.production_run_events from authenticated;

revoke all on function public.production_create_run_v1(uuid, uuid, numeric, jsonb, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.production_start_run_v1(uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.production_transition_run_v1(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.production_update_meta_v1(uuid, date, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.production_record_actual_v1(uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.production_apply_rescue_v1(uuid, integer, integer, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.production_complete_run_v1(uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.production_append_amendment_v1(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.production_create_run_v1(uuid, uuid, numeric, jsonb, uuid, jsonb)
  to authenticated;
grant execute on function public.production_start_run_v1(uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb)
  to authenticated;
grant execute on function public.production_transition_run_v1(uuid, text, uuid) to authenticated;
grant execute on function public.production_update_meta_v1(uuid, date, text, text, text, text)
  to authenticated;
grant execute on function public.production_record_actual_v1(uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric, text, text, uuid)
  to authenticated;
grant execute on function public.production_apply_rescue_v1(uuid, integer, integer, jsonb, jsonb, uuid)
  to authenticated;
grant execute on function public.production_complete_run_v1(uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric, text, text, uuid, uuid)
  to authenticated;
grant execute on function public.production_append_amendment_v1(uuid, uuid, text, jsonb)
  to authenticated;
