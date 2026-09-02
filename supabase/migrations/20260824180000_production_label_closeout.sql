-- PRODUCTION -> LIVE RESCUE -> LABEL closeout (staging, additive).
--
-- This migration extends the existing Production Run/event authority. It does
-- not create another production state machine and does not mutate Mapper data.

-- ---------------------------------------------------------------------------
-- 1. Canonical Production audit vocabulary on the existing append-only table.
-- ---------------------------------------------------------------------------
alter table public.production_run_events
  drop constraint if exists production_run_events_event_type_check;
alter table public.production_run_events
  add constraint production_run_events_event_type_check check (
    event_type in (
      -- retained history / compatibility
      'created','planned','started','actual_recorded','rescue_applied',
      'completed','cancelled','amended','note_added',
      -- explicit floor-execution history
      'production_started','heat_information_acknowledged',
      'ingredient_actual_confirmed','actual_entry_corrected','variance_detected',
      'rescue_previewed','rescue_accepted','batch_target_changed',
      'additional_ingredient_requested','ingredient_completed',
      'production_completed','production_cancelled'
    )
  );

create or replace function public.enforce_production_event_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  run_status text;
begin
  select run.status into run_status
  from public.production_runs run
  where run.id = new.run_id and run.owner_user_id = new.owner_user_id;

  if run_status is null then
    raise exception 'Production event requires its owned parent run.' using errcode = '23514';
  end if;

  if not (
    new.event_type = 'note_added'
    or (new.event_type = 'created' and run_status = 'draft')
    or (new.event_type = 'planned' and run_status = 'planned')
    or (
      new.event_type in (
        'started','actual_recorded','rescue_applied','production_started',
        'heat_information_acknowledged','ingredient_actual_confirmed',
        'actual_entry_corrected','variance_detected','rescue_previewed',
        'rescue_accepted','batch_target_changed','additional_ingredient_requested',
        'ingredient_completed'
      ) and run_status = 'in_progress'
    )
    or (
      new.event_type in ('completed','amended','production_completed')
      and run_status = 'completed'
    )
    or (
      new.event_type in ('cancelled','production_cancelled')
      and run_status = 'cancelled'
    )
  ) then
    raise exception 'Production event is incompatible with the current run status.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.production_emit_lifecycle_audit_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public, extensions as $$
declare v_type text;
begin
  if old.status is not distinct from new.status then return new; end if;
  v_type := case new.status
    when 'in_progress' then 'production_started'
    when 'completed' then 'production_completed'
    when 'cancelled' then 'production_cancelled'
    else null end;
  if v_type is not null then
    insert into public.production_run_events (
      id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
    ) values (
      gen_random_uuid(), new.id, new.owner_user_id, v_type,
      old.status || ' -> ' || new.status, null, new.owner_user_id, clock_timestamp()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists production_lifecycle_audit_v1 on public.production_runs;
create trigger production_lifecycle_audit_v1
after update of status on public.production_runs
for each row execute function public.production_emit_lifecycle_audit_v1();

create or replace function public.production_cancel_run_v1(
  p_run_id uuid, p_event_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  perform public.production_transition_run_v1(p_run_id, 'cancelled', p_event_id);
  return p_run_id;
end;
$$;
revoke all on function public.production_cancel_run_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.production_cancel_run_v1(uuid, uuid) to authenticated;
-- Start and completion call the generic transition function internally. The
-- browser receives only the explicit cancel endpoint, so it cannot bypass the
-- atomic completion + snapshot boundary.
revoke execute on function public.production_transition_run_v1(uuid, text, uuid)
  from authenticated;

create or replace function public.production_emit_heat_ack_audit_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public, extensions as $$
begin
  if old.heat_information_acknowledged_at is null
    and new.heat_information_acknowledged_at is not null then
    insert into public.production_run_events (
      id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
    ) values (
      gen_random_uuid(), new.id, new.owner_user_id,
      'heat_information_acknowledged', 'Operator confirmed heat information',
      jsonb_build_object('acknowledgedAt', new.heat_information_acknowledged_at),
      new.owner_user_id, new.heat_information_acknowledged_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists production_heat_ack_audit_v1 on public.production_runs;
create trigger production_heat_ack_audit_v1
after update of heat_information_acknowledged_at on public.production_runs
for each row execute function public.production_emit_heat_ack_audit_v1();

comment on column public.production_runs.heat_information_acknowledged_at is
  'Operator acknowledgement of verified positive heat information. Required before the UI starts that run; never a science or thermal-mode decision.';

create or replace function public.production_emit_rescue_preview_audit_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, private, public, extensions as $$
begin
  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (
    gen_random_uuid(), new.run_id, new.owner_user_id, 'rescue_previewed',
    new.safe_metadata->>'title',
    jsonb_build_object(
      'authorizationId', new.id,
      'stableOptionId', new.stable_option_id,
      'candidateFingerprint', new.candidate_fingerprint,
      'preview', new.safe_metadata
    ),
    new.owner_user_id, new.authorized_at
  );
  return new;
end;
$$;

drop trigger if exists production_rescue_preview_audit_v1
  on private.production_rescue_authorizations;
create trigger production_rescue_preview_audit_v1
after insert on private.production_rescue_authorizations
for each row execute function public.production_emit_rescue_preview_audit_v1();

create or replace function public.production_emit_rescue_acceptance_audit_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public, extensions as $$
declare
  v_new_target numeric;
  v_previous_target numeric;
  v_additional_required boolean := false;
begin
  if new.event_type <> 'rescue_applied' then return new; end if;
  v_new_target := nullif(new.amendment#>>'{recipeInput,target_batch_grams}', '')::numeric;
  select coalesce(
    (
      select nullif(previous.amendment#>>'{recipeInput,target_batch_grams}', '')::numeric
      from public.production_run_events previous
      where previous.run_id = new.run_id
        and previous.owner_user_id = new.owner_user_id
        and previous.event_type = 'rescue_applied'
        and previous.id <> new.id
      order by previous.created_at desc limit 1
    ),
    run.planned_batch_g
  ) into v_previous_target
  from public.production_runs run where run.id = new.run_id;

  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (
    gen_random_uuid(), new.run_id, new.owner_user_id, 'rescue_accepted',
    'Server-authorized Production Rescue accepted', new.amendment,
    new.created_by, new.created_at
  );

  if v_new_target is not null and abs(v_new_target - v_previous_target) > 0.000001 then
    insert into public.production_run_events (
      id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
    ) values (
      gen_random_uuid(), new.run_id, new.owner_user_id, 'batch_target_changed',
      'Production target changed',
      jsonb_build_object('previousTargetG', v_previous_target, 'targetG', v_new_target),
      new.created_by, new.created_at
    );
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(new.amendment#>'{recipeInput,items}', '[]'::jsonb)) candidate
    where not exists (
      select 1 from public.production_run_planned_items planned
      where planned.run_id = new.run_id and planned.line_id = candidate->>'id'
    ) or exists (
      select 1
      from public.production_run_actuals actual,
        jsonb_array_elements(actual.actual_items) recorded
      where actual.run_id = new.run_id
        and recorded->>'id' = candidate->>'id'
        and recorded->>'actualGrams' is not null
        and (candidate->>'planned_grams')::numeric
          > (recorded->>'actualGrams')::numeric + 0.000001
    )
  ) into v_additional_required;

  if v_additional_required then
    insert into public.production_run_events (
      id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
    ) values (
      gen_random_uuid(), new.run_id, new.owner_user_id,
      'additional_ingredient_requested', 'Rescue requires additional material',
      jsonb_build_object('targetG', v_new_target), new.created_by, new.created_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists production_rescue_acceptance_audit_v1
  on public.production_run_events;
create trigger production_rescue_acceptance_audit_v1
after insert on public.production_run_events
for each row execute function public.production_emit_rescue_acceptance_audit_v1();

-- v2 records the operator's intent beside the existing transactional actual
-- write. The actual vector remains validated by production_record_actual_v1.
create or replace function public.production_record_actual_v2(
  p_run_id uuid, p_expected_actual_revision integer, p_expected_rescue_revision integer,
  p_actual_items jsonb, p_substitutions jsonb,
  p_actual_total_mix_g numeric, p_actual_yield_g numeric, p_waste_g numeric,
  p_operator_notes text, p_deviation_reason text, p_event_id uuid,
  p_action text, p_line_id text, p_previous_actual_g numeric
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_at timestamptz := clock_timestamp();
  v_item jsonb;
  v_actual numeric;
  v_target numeric;
  v_name text;
begin
  if p_action not in ('confirm','record_correction','top_up','sync') then
    raise exception 'bounded actual action required' using errcode = '22023';
  end if;
  -- The previously persisted vector is physical truth. A downward change is
  -- accepted only for the one line explicitly confirmed as a record correction.
  if exists (
    select 1
    from public.production_run_actuals persisted,
      jsonb_array_elements(persisted.actual_items) previous,
      jsonb_array_elements(p_actual_items) candidate
    where persisted.run_id = p_run_id and persisted.owner_user_id = v_uid
      and previous->>'id' = candidate->>'id'
      and previous->>'actualGrams' is not null
      and candidate->>'actualGrams' is not null
      and (candidate->>'actualGrams')::numeric + 0.000001
        < (previous->>'actualGrams')::numeric
      and not (
        p_action = 'record_correction'
        and candidate->>'id' = p_line_id
        and p_previous_actual_g is not distinct from (previous->>'actualGrams')::numeric
      )
  ) then
    raise exception 'physically recorded material cannot decrease without an explicit record correction'
      using errcode = '23514';
  end if;
  if p_action = 'record_correction' and not exists (
    select 1
    from public.production_run_actuals persisted,
      jsonb_array_elements(persisted.actual_items) previous
    where persisted.run_id = p_run_id and persisted.owner_user_id = v_uid
      and previous->>'id' = p_line_id
      and previous->>'actualGrams' is not null
      and p_previous_actual_g is not distinct from (previous->>'actualGrams')::numeric
  ) then
    raise exception 'record correction requires the exact previous durable amount'
      using errcode = '40001';
  end if;
  perform public.production_record_actual_v1(
    p_run_id, p_expected_actual_revision, p_expected_rescue_revision,
    p_actual_items, p_substitutions, p_actual_total_mix_g,
    p_actual_yield_g, p_waste_g, p_operator_notes, p_deviation_reason, p_event_id
  );
  if p_action = 'sync' then return p_run_id; end if;

  select item into v_item from jsonb_array_elements(p_actual_items) item
  where item->>'id' = p_line_id;
  if v_item is null or v_item->>'actualGrams' is null then
    raise exception 'confirmed action requires its actual line' using errcode = '22023';
  end if;
  v_actual := (v_item->>'actualGrams')::numeric;
  v_name := coalesce(v_item->>'name', p_line_id);
  select coalesce(
    (
      select (candidate->>'planned_grams')::numeric
      from public.production_runs run,
        jsonb_array_elements(coalesce(run.rescue_recipe_input->'items', '[]'::jsonb)) candidate
      where run.id = p_run_id and candidate->>'id' = p_line_id
    ),
    (
      select planned.planned_grams from public.production_run_planned_items planned
      where planned.run_id = p_run_id and planned.line_id = p_line_id
    )
  ) into v_target;

  insert into public.production_run_events (
    id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
  ) values (
    gen_random_uuid(), p_run_id, v_uid,
    case when p_action = 'record_correction'
      then 'actual_entry_corrected' else 'ingredient_actual_confirmed' end,
    v_name,
    jsonb_build_object(
      'lineId', p_line_id, 'actualGrams', v_actual,
      'previousActualG', p_previous_actual_g, 'action', p_action
    ),
    v_uid, v_at
  );
  if v_target is not null and v_actual + 0.000001 >= v_target then
    insert into public.production_run_events (
      id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
    ) values (
      gen_random_uuid(), p_run_id, v_uid, 'ingredient_completed', v_name,
      jsonb_build_object('lineId', p_line_id, 'actualGrams', v_actual), v_uid, v_at
    );
  end if;
  if v_target is not null and abs(v_actual - v_target) > 0.000001 then
    insert into public.production_run_events (
      id, run_id, owner_user_id, event_type, detail, amendment, created_by, created_at
    ) values (
      gen_random_uuid(), p_run_id, v_uid, 'variance_detected', v_name,
      jsonb_build_object(
        'lineId', p_line_id, 'targetGrams', v_target,
        'actualGrams', v_actual, 'deltaGrams', v_actual - v_target
      ), v_uid, v_at
    );
  end if;
  return p_run_id;
end;
$$;

revoke all on function public.production_record_actual_v2(
  uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric,
  text, text, uuid, text, text, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.production_record_actual_v2(
  uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric,
  text, text, uuid, text, text, numeric
) to authenticated;
revoke execute on function public.production_record_actual_v1(
  uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric,
  text, text, uuid
) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Immutable server-owned snapshot of what was physically produced.
-- ---------------------------------------------------------------------------
create table if not exists public.production_completed_snapshots (
  run_id uuid primary key references public.production_runs(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.saved_recipes(id) on delete restrict,
  recipe_version_id uuid not null references public.recipe_versions(id) on delete restrict,
  recipe_version_number integer not null check (recipe_version_number >= 1),
  actual_items jsonb not null check (jsonb_typeof(actual_items) = 'array'),
  actual_final_batch_g numeric not null check (actual_final_batch_g > 0),
  accepted_rescue_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(accepted_rescue_history) = 'array'),
  batch_target_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(batch_target_history) = 'array'),
  completion_snapshot jsonb not null check (jsonb_typeof(completion_snapshot) = 'object'),
  heat_information_acknowledged_at timestamptz,
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.production_completed_snapshots enable row level security;
drop policy if exists production_completed_snapshots_select_own
  on public.production_completed_snapshots;
create policy production_completed_snapshots_select_own
  on public.production_completed_snapshots for select
  using (auth.uid() = owner_user_id);
grant select on public.production_completed_snapshots to authenticated;
revoke insert, update, delete on public.production_completed_snapshots from authenticated;

create or replace function public.production_freeze_completed_snapshot_v1(
  p_run_id uuid, p_snapshot jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_run public.production_runs%rowtype;
  v_actual public.production_run_actuals%rowtype;
  v_final_mass numeric;
  v_canonical_snapshot jsonb;
begin
  select * into v_run from public.production_runs
  where id = p_run_id and owner_user_id = v_uid and status = 'completed' for share;
  if not found then
    raise exception 'owned completed Production run required' using errcode = '42501';
  end if;
  select * into v_actual from public.production_run_actuals
  where run_id = p_run_id and owner_user_id = v_uid;
  if not found then raise exception 'completed actual vector required' using errcode = '23514'; end if;
  select sum((item->>'actualGrams')::numeric) into v_final_mass
  from jsonb_array_elements(v_actual.actual_items) item
  where item->>'actualGrams' is not null;
  if coalesce(jsonb_typeof(p_snapshot), '') <> 'object'
    or p_snapshot->>'sessionId' is distinct from p_run_id::text
    or p_snapshot#>>'{source,recipeId}' is distinct from v_run.recipe_id::text
    or p_snapshot#>>'{source,recipeVersionId}' is distinct from v_run.recipe_version_id::text
    or (p_snapshot#>>'{source,recipeVersionNumber}')::integer
      is distinct from v_run.recipe_version_number
    or abs((p_snapshot->>'actualFinalMassG')::numeric - v_final_mass) > 0.000001 then
    raise exception 'completion snapshot does not match server actuals and immutable source'
      using errcode = '23514';
  end if;
  v_canonical_snapshot := jsonb_set(
    jsonb_set(p_snapshot, '{ownerUserId}', to_jsonb(v_uid::text), true),
    '{productionCompletedAt}', to_jsonb(v_run.completed_at), true
  );

  insert into public.production_completed_snapshots (
    run_id, owner_user_id, recipe_id, recipe_version_id, recipe_version_number,
    actual_items, actual_final_batch_g, accepted_rescue_history,
    batch_target_history, completion_snapshot,
    heat_information_acknowledged_at, completed_at, created_at
  ) values (
    v_run.id, v_uid, v_run.recipe_id, v_run.recipe_version_id, v_run.recipe_version_number,
    v_actual.actual_items, v_final_mass,
    coalesce((
      select jsonb_agg(event.amendment order by event.created_at)
      from public.production_run_events event
      where event.run_id = p_run_id and event.event_type = 'rescue_accepted'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(event.amendment order by event.created_at)
      from public.production_run_events event
      where event.run_id = p_run_id and event.event_type = 'batch_target_changed'
    ), '[]'::jsonb),
    v_canonical_snapshot, v_run.heat_information_acknowledged_at,
    v_run.completed_at, clock_timestamp()
  ) on conflict (run_id) do nothing;

  if exists (
    select 1 from public.production_completed_snapshots frozen
    where frozen.run_id = p_run_id
      and frozen.owner_user_id = v_uid
      and frozen.completion_snapshot = v_canonical_snapshot
  ) then return p_run_id; end if;
  raise exception 'completed Production snapshot is immutable' using errcode = '23505';
end;
$$;

revoke all on function public.production_freeze_completed_snapshot_v1(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.production_freeze_completed_snapshot_v1(uuid, jsonb)
  to authenticated;

-- Completion and the ACTUAL snapshot are one transaction. If Engine-derived
-- snapshot validation fails, the run remains in progress and can be retried.
create or replace function public.production_complete_run_v2(
  p_run_id uuid, p_expected_actual_revision integer, p_expected_rescue_revision integer,
  p_actual_items jsonb, p_substitutions jsonb,
  p_actual_total_mix_g numeric, p_actual_yield_g numeric, p_waste_g numeric,
  p_operator_notes text, p_deviation_reason text,
  p_actual_event_id uuid, p_completed_event_id uuid, p_snapshot jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
begin
  if exists (
    select 1
    from public.production_run_actuals persisted,
      jsonb_array_elements(persisted.actual_items) previous,
      jsonb_array_elements(p_actual_items) candidate
    where persisted.run_id = p_run_id and persisted.owner_user_id = v_uid
      and previous->>'id' = candidate->>'id'
      and previous->>'actualGrams' is not null
      and candidate->>'actualGrams' is not null
      and (candidate->>'actualGrams')::numeric + 0.000001
        < (previous->>'actualGrams')::numeric
  ) then
    raise exception 'completion cannot reduce physically recorded material'
      using errcode = '23514';
  end if;
  perform public.production_complete_run_v1(
    p_run_id, p_expected_actual_revision, p_expected_rescue_revision,
    p_actual_items, p_substitutions, p_actual_total_mix_g,
    p_actual_yield_g, p_waste_g, p_operator_notes, p_deviation_reason,
    p_actual_event_id, p_completed_event_id
  );
  perform public.production_freeze_completed_snapshot_v1(p_run_id, p_snapshot);
  return p_run_id;
end;
$$;

revoke all on function public.production_complete_run_v2(
  uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric,
  text, text, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.production_complete_run_v2(
  uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric,
  text, text, uuid, uuid, jsonb
) to authenticated;
revoke execute on function public.production_complete_run_v1(
  uuid, integer, integer, jsonb, jsonb, numeric, numeric, numeric,
  text, text, uuid, uuid
) from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Account Label Profile and immutable per-run Label Snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.account_label_profiles (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  market text not null default 'EU'
    check (market in ('EU','US','CA','UK','AU_NZ','CUSTOM')),
  ui_language text not null default 'pl' check (length(ui_language) between 2 and 35),
  label_languages jsonb not null default '["pl"]'::jsonb
    check (jsonb_typeof(label_languages) = 'array' and jsonb_array_length(label_languages) > 0),
  business_name text not null default '',
  logo_path text,
  facility_defaults jsonb not null default '{}'::jsonb
    check (jsonb_typeof(facility_defaults) = 'object'),
  presentation jsonb not null default '{"format":"rectangle","widthMm":90,"heightMm":60,"copies":1}'::jsonb
    check (
      jsonb_typeof(presentation) = 'object'
      and presentation->>'format' in ('rectangle','round')
      and (presentation->>'widthMm')::numeric >= 20
      and (presentation->>'heightMm')::numeric >= 20
      and (presentation->>'copies')::integer >= 1
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_path is null or logo_path like owner_user_id::text || '/%')
);
alter table public.account_label_profiles enable row level security;
drop policy if exists account_label_profiles_select_own on public.account_label_profiles;
create policy account_label_profiles_select_own on public.account_label_profiles
  for select using (auth.uid() = owner_user_id);
drop policy if exists account_label_profiles_insert_own on public.account_label_profiles;
create policy account_label_profiles_insert_own on public.account_label_profiles
  for insert with check (auth.uid() = owner_user_id);
drop policy if exists account_label_profiles_update_own on public.account_label_profiles;
create policy account_label_profiles_update_own on public.account_label_profiles
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
grant select, insert, update on public.account_label_profiles to authenticated;

create table if not exists public.production_run_label_snapshots (
  run_id uuid primary key references public.production_completed_snapshots(run_id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  master_label jsonb not null check (jsonb_typeof(master_label) = 'object'),
  account_profile_snapshot jsonb not null check (jsonb_typeof(account_profile_snapshot) = 'object'),
  logo_path text,
  created_at timestamptz not null default now(),
  check (logo_path is null or logo_path like owner_user_id::text || '/%')
);
alter table public.production_run_label_snapshots enable row level security;
drop policy if exists production_run_label_snapshots_select_own
  on public.production_run_label_snapshots;
create policy production_run_label_snapshots_select_own
  on public.production_run_label_snapshots for select
  using (auth.uid() = owner_user_id);
grant select on public.production_run_label_snapshots to authenticated;
revoke insert, update, delete on public.production_run_label_snapshots from authenticated;

create or replace function public.production_save_label_snapshot_v1(
  p_run_id uuid, p_master_label jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_profile public.account_label_profiles%rowtype;
  v_label_mass numeric;
begin
  perform 1 from public.production_completed_snapshots frozen
  where frozen.run_id = p_run_id and frozen.owner_user_id = v_uid;
  if not found then
    raise exception 'owned completed Production snapshot required' using errcode = '42501';
  end if;
  select * into v_profile from public.account_label_profiles
  where owner_user_id = v_uid;
  if not found then
    raise exception 'Account Label Profile required' using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(p_master_label), '') <> 'object'
    or p_master_label->>'sourceCompletionSessionId' is distinct from p_run_id::text then
    raise exception 'Label snapshot does not match its run/profile authority' using errcode = '23514';
  end if;
  select coalesce(sum((ingredient->>'actualGrams')::numeric), 0)
    into v_label_mass
  from jsonb_array_elements(coalesce(p_master_label->'ingredients', '[]'::jsonb)) ingredient;
  if abs(v_label_mass - (
    select frozen.actual_final_batch_g from public.production_completed_snapshots frozen
    where frozen.run_id = p_run_id and frozen.owner_user_id = v_uid
  )) > 0.000001 then
    raise exception 'Label ingredients must come from the completed ACTUAL batch'
      using errcode = '23514';
  end if;
  insert into public.production_run_label_snapshots (
    run_id, owner_user_id, master_label, account_profile_snapshot, logo_path, created_at
  ) values (
    p_run_id, v_uid, p_master_label,
    jsonb_build_object(
      'market', p_master_label->'market',
      'uiLanguage', p_master_label->'uiLanguage',
      'labelLanguages', p_master_label->'labelLanguages',
      'businessName', p_master_label->'businessName',
      'facilityDefaults', p_master_label->'operator',
      'presentation', jsonb_build_object(
        'format', p_master_label->'format',
        'widthMm', p_master_label#>'{size,widthMm}',
        'heightMm', p_master_label#>'{size,heightMm}',
        'copies', p_master_label->'copies'
      ),
      'updatedAt', v_profile.updated_at
    ),
    nullif(p_master_label->>'logoPath', ''), clock_timestamp()
  ) on conflict (run_id) do nothing;
  if exists (
    select 1 from public.production_run_label_snapshots frozen
    where frozen.run_id = p_run_id and frozen.owner_user_id = v_uid
      and frozen.master_label = p_master_label
  ) then return p_run_id; end if;
  raise exception 'Run Label Snapshot is immutable' using errcode = '23505';
end;
$$;

revoke all on function public.production_save_label_snapshot_v1(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.production_save_label_snapshot_v1(uuid, jsonb)
  to authenticated;

-- Private, immutable logo objects. Every path starts with auth.uid(). Updating
-- the Account Label Profile points future labels at a new object; historical
-- run snapshots keep the old path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'label-profile-assets', 'label-profile-assets', false, 5242880,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
) on conflict (id) do nothing;

drop policy if exists label_profile_assets_insert_own on storage.objects;
create policy label_profile_assets_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'label-profile-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists label_profile_assets_select_own on storage.objects;
create policy label_profile_assets_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'label-profile-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- No UPDATE/DELETE policy: old labels must remain reproducible.

comment on table public.production_completed_snapshots is
  'Immutable actual Production snapshot, frozen from one completed owned run.';
comment on table public.account_label_profiles is
  'Owner-scoped defaults for future labels; never rewrites historical labels.';
comment on table public.production_run_label_snapshots is
  'Immutable exact consumer Label settings saved for a completed Production run.';
