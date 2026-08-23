-- PROCESS AND DOSAGE ARE INFORMATIONAL ONLY (owner decision, 2026-08-23).
--
-- Gellatti does not decide how a professional ingredient must be processed or
-- dosed; the customer using the ingredient owns that decision. This migration
-- removes process/dosage from RUNTIME AUTHORITY while preserving every factual
-- row. Nothing is deleted: `mapper_process_metadata`,
-- `production_process_advisory_registry` and the Mapper's own
-- `recommended_dosage_percent_*` columns all stay exactly as they are, and
-- `mapper_basement` is not touched at all.
--
-- What changes is only this: no process fact, missing process fact, hot/cold
-- classification or manufacturer dosage may block selection, Engine use,
-- Preview, Apply, Save, Production, Rescue, Monitor or Label. UNKNOWN process
-- is normal, unremarkable information.

-- ---------------------------------------------------------------------------
-- 1. Per-product process readiness: information, never a verdict.
-- ---------------------------------------------------------------------------
-- The advisory registry is still read, because when it holds a row it carries
-- genuine source detail worth showing under the product `?`. Its ABSENCE is no
-- longer a blocker — it is simply "Brak informacji".
create or replace function public.product_process_readiness_v1(
  p_resolved jsonb,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_scope text := coalesce(nullif(p_context->>'processScope', ''), 'BASE_FORMULATION');
  v_mapper_id text := nullif(p_resolved->>'mapperIngredientId', '');
  v_product_id text := nullif(p_resolved->>'productId', '');
  v_decision text := coalesce(nullif(p_resolved#>>'{processBehavior,decision}', ''), 'UNKNOWN');
  v_verification text := coalesce(
    nullif(p_resolved#>>'{processBehavior,verificationStatus}', ''), 'unknown'
  );
  v_advisory_code text;
  v_source_process_status text;
  v_cold_process_eligibility text;
  v_hydration_mode text;
  v_detail jsonb;
begin
  if v_scope = 'POST_PROCESS_ADDON' then
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'READY',
      'blockers', '[]'::jsonb, 'advisories', '[]'::jsonb
    );
  end if;

  -- A verified process decision is simply known information; nothing to say.
  if v_verification = 'verified' and v_decision <> 'UNKNOWN' then
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'READY',
      'blockers', '[]'::jsonb, 'advisories', '[]'::jsonb
    );
  end if;

  if v_mapper_id is not null then
    select registry.advisory_code, registry.source_process_status,
      registry.cold_process_eligibility, registry.hydration_mode
    into v_advisory_code, v_source_process_status,
      v_cold_process_eligibility, v_hydration_mode
    from public.production_process_advisory_registry registry
    where registry.ingredient_id = v_mapper_id;
  end if;

  v_detail := jsonb_build_object(
    'code', coalesce(v_advisory_code, 'PROCESS_INFORMATION_NOT_AVAILABLE'),
    'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
    'decision', v_decision, 'verificationStatus', v_verification
  );
  if v_advisory_code is not null then
    v_detail := v_detail || jsonb_build_object(
      'sourceProcessStatus', v_source_process_status,
      'coldProcessEligibility', v_cold_process_eligibility,
      'hydrationMode', v_hydration_mode
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1, 'status', 'READY_WITH_INFO',
    'blockers', '[]'::jsonb, 'advisories', jsonb_build_array(v_detail)
  );
end;
$$;

revoke all on function public.product_process_readiness_v1(jsonb,jsonb)
  from public, anon, authenticated, service_role;

comment on function public.product_process_readiness_v1(jsonb,jsonb) is
  'Process INFORMATION for one product version. Never returns BLOCKED: process is not runtime authority.';

comment on table public.production_process_advisory_registry is
  'Preserved Owner-curated process detail. Informational only; a missing row is not a blocker.';

-- ---------------------------------------------------------------------------
-- 2. Resolver wrapper: process no longer withholds PROCESS/PRODUCTION.
-- ---------------------------------------------------------------------------
-- The 41 KB evidence gate stays byte-identical. This wrapper keeps the Global
-- Main capability layer from 20260823130000 and drops exactly one thing: the
-- coupling between process readiness and module eligibility.
create or replace function public.resolve_product_behavior_v1(
  p_entity_kind text,
  p_entity_id text,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_resolved jsonb;
  v_readiness jsonb;
  v_block_reasons jsonb;
  v_engine_ready boolean;
  v_role_ready boolean;
  v_capability jsonb;
  v_state text;
  v_module text;
  v_module_state text;
  v_role_request text;
begin
  -- A thermal route is an operator note, not a permission. An unrecognised
  -- value is still rejected as malformed input, but absence is normal.
  if p_context ? 'thermalMode'
    and nullif(p_context->>'thermalMode', '') is not null
    and p_context->>'thermalMode' not in ('COLD_ONLY', 'HEAT_CAPABLE') then
    raise exception 'invalid behavior thermal context' using errcode = '22023';
  end if;

  v_resolved := public.resolve_product_behavior_evidence_gate_v1(
    p_entity_kind, p_entity_id, p_context
  );

  -- GLOBAL MAIN AUTHORITY. Semantic capability first, calibration second.
  v_capability := public.main_capability_v1(v_resolved, p_context);
  v_state := v_capability->>'capability';
  v_module := coalesce(p_context->>'module','SEARCH');
  v_role_request := coalesce(p_context->>'requestedRole','STANDARD');
  v_resolved := jsonb_set(v_resolved,'{mainCapability}',to_jsonb(v_state),true);
  v_resolved := jsonb_set(v_resolved,'{mainAuthority}',to_jsonb(v_capability->>'authority'),true);
  v_resolved := jsonb_set(
    v_resolved,'{mainCalibrationLevel}',to_jsonb(v_capability->>'calibrationLevel'),true
  );
  v_resolved := jsonb_set(
    v_resolved,'{mainCapabilityReason}',to_jsonb(v_capability->>'reason'),true
  );
  if v_state in ('MAIN_CAPABLE','MAIN_CAPABLE_UNCALIBRATED') then
    v_resolved := jsonb_set(v_resolved,'{moduleEligibility,MAIN}','"eligible"'::jsonb,true);
    v_module_state := coalesce(v_resolved->'moduleEligibility'->>v_module,'blocked');
    if v_module_state in ('eligible','label_only') then
      v_resolved := jsonb_set(v_resolved,'{state}','"eligible"'::jsonb,true);
      select coalesce(jsonb_agg(entry.value order by entry.ordinality),'[]'::jsonb)
      into v_block_reasons
      from jsonb_array_elements(coalesce(v_resolved->'blockReasons','[]'::jsonb))
        with ordinality entry(value, ordinality)
      where entry.value#>>'{}' not like 'main_policy_not_approved%'
        and entry.value#>>'{}' <> 'main_policy_missing'
        and entry.value#>>'{}' <> 'context_not_approved';
      v_resolved := jsonb_set(v_resolved,'{blockReasons}',v_block_reasons,true);
    end if;
    if v_state = 'MAIN_CAPABLE_UNCALIBRATED' then
      v_resolved := jsonb_set(
        v_resolved,'{blockReasons}',
        coalesce(v_resolved->'blockReasons','[]'::jsonb)
          || jsonb_build_array('main_user_held_no_calibration'),
        true
      );
    end if;
  end if;

  -- Process information is attached for display only.
  v_readiness := public.product_process_readiness_v1(v_resolved, p_context);
  v_resolved := jsonb_set(v_resolved, '{processReadiness}', v_readiness, true);

  -- Process/dosage reasons are informational and are dropped from the blocker
  -- set entirely. `main_user_held_no_calibration` remains a calibration fact.
  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  into v_block_reasons
  from jsonb_array_elements(
    coalesce(v_resolved->'blockReasons', '[]'::jsonb)
  ) with ordinality entry(value, ordinality)
  where entry.value#>>'{}' <> 'process_evidence_missing'
    and entry.value#>>'{}' not like 'process_evidence_unknown:%'
    and entry.value#>>'{}' <> 'process_readiness_blocked'
    and entry.value#>>'{}' <> 'main_user_held_no_calibration';

  v_engine_ready :=
    coalesce(v_resolved#>>'{moduleEligibility,OPTIMAL}', 'blocked') = 'eligible'
    and coalesce(v_resolved#>>'{moduleEligibility,ECO}', 'blocked') = 'eligible';
  v_role_ready := v_role_request = 'STANDARD'
    or v_state in ('MAIN_CAPABLE','MAIN_CAPABLE_UNCALIBRATED');

  -- PROCESS and PRODUCTION are granted on exactly the same non-process
  -- evidence every other module already satisfied.
  if coalesce(p_context->>'processScope', 'BASE_FORMULATION') = 'BASE_FORMULATION'
    and nullif(v_resolved->>'mapperIngredientId', '') is not null
    and v_engine_ready and v_role_ready
    and jsonb_array_length(v_block_reasons) = 0 then
    v_resolved := jsonb_set(
      v_resolved, '{moduleEligibility,PRODUCTION}', '"eligible"'::jsonb, true
    );
    v_resolved := jsonb_set(
      v_resolved, '{moduleEligibility,PROCESS}', '"eligible"'::jsonb, true
    );
    if v_module in ('PRODUCTION', 'PROCESS') then
      v_resolved := jsonb_set(v_resolved, '{state}', '"eligible"'::jsonb, true);
    end if;
  end if;

  if v_state = 'MAIN_CAPABLE_UNCALIBRATED' then
    v_block_reasons := v_block_reasons
      || jsonb_build_array('main_user_held_no_calibration');
  end if;
  v_resolved := jsonb_set(v_resolved, '{blockReasons}', v_block_reasons, true);

  return v_resolved;
end;
$$;

revoke all on function public.resolve_product_behavior_v1(text,text,jsonb)
  from public, anon;
grant execute on function public.resolve_product_behavior_v1(text,text,jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Recipe-wide process readiness: information for the whole composition.
-- ---------------------------------------------------------------------------
-- A thermal route may now be absent (the operator was never required to
-- declare one), and no line can produce a blocker.
create or replace function public.recipe_process_readiness_v1(
  p_recipe_input jsonb,
  p_product_composition jsonb,
  p_thermal_mode text
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_snapshots jsonb := coalesce(p_product_composition->'behaviorSnapshots', '{}'::jsonb);
  v_item jsonb;
  v_snapshot jsonb;
  v_resolved jsonb;
  v_readiness jsonb;
  v_line_id text;
  v_advisories jsonb := '[]'::jsonb;
begin
  if p_thermal_mode is not null and p_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE') then
    raise exception 'invalid Production thermal mode' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipe_input) <> 'object'
    or jsonb_typeof(coalesce(p_recipe_input->'items', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(v_snapshots) <> 'object' then
    raise exception 'invalid recipe process readiness payload' using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_recipe_input->'items')
    where coalesce(
      nullif(value->>'actual_grams', '')::numeric,
      nullif(value->>'planned_grams', '')::numeric,
      0
    ) > 0
  loop
    v_line_id := nullif(v_item->>'id', '');
    v_snapshot := v_snapshots->v_line_id;
    -- A missing snapshot is a PRODUCT-authority matter, enforced separately by
    -- assert_recipe_behavior_authority_v1. It is not a process statement.
    if v_line_id is null or jsonb_typeof(v_snapshot) <> 'object'
      or v_snapshot->>'resolutionState' <> 'RESOLVED' then
      continue;
    end if;

    v_resolved := public.resolve_product_behavior_v1(
      case when v_snapshot->>'source' = 'mapper'
        then 'mapper' else 'catalog_product_version' end,
      case when v_snapshot->>'source' = 'mapper'
        then v_snapshot->>'mapperIngredientId' else v_snapshot->>'productVersionId' end,
      jsonb_build_object(
        'module', 'PRODUCTION',
        'productProfile', p_recipe_input->>'category',
        'temperatureC', p_recipe_input->'target_temperature_c',
        'mode', coalesce(
          p_recipe_input#>>'{goals,formulation_strategy}', p_recipe_input->>'mode'
        ),
        'processScope', 'BASE_FORMULATION',
        'requestedRole', case when v_item->>'lock_type' = 'main' then 'MAIN' else 'STANDARD' end
      ) || case when p_thermal_mode is null then '{}'::jsonb
        else jsonb_build_object('thermalMode', p_thermal_mode) end
    );
    v_readiness := coalesce(v_resolved->'processReadiness', jsonb_build_object(
      'schemaVersion', 1, 'status', 'READY',
      'blockers', '[]'::jsonb, 'advisories', '[]'::jsonb
    ));

    select v_advisories || coalesce(jsonb_agg(
      detail.value || jsonb_build_object('lineId', v_line_id)
      order by detail.ordinality
    ), '[]'::jsonb)
    into v_advisories
    from jsonb_array_elements(
      coalesce(v_readiness->'blockers', '[]'::jsonb)
        || coalesce(v_readiness->'advisories', '[]'::jsonb)
    ) with ordinality detail(value, ordinality);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', case
      when jsonb_array_length(v_advisories) > 0 then 'READY_WITH_INFO' else 'READY'
    end,
    'blockers', '[]'::jsonb,
    'advisories', v_advisories
  );
end;
$$;

revoke all on function public.recipe_process_readiness_v1(jsonb,jsonb,text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Production run storage: a thermal route becomes an optional note.
-- ---------------------------------------------------------------------------
alter table public.production_runs
  drop constraint if exists production_runs_process_authority;
alter table public.production_runs
  add constraint production_runs_process_authority check (
    (thermal_mode is null and process_readiness is null and process_advisories is null)
    or (
      (thermal_mode is null or thermal_mode in ('COLD_ONLY', 'HEAT_CAPABLE'))
      and process_readiness in ('READY', 'READY_WITH_INFO')
      and jsonb_typeof(process_advisories) = 'array'
      and (
        (process_readiness = 'READY' and jsonb_array_length(process_advisories) = 0)
        or (process_readiness = 'READY_WITH_INFO' and jsonb_array_length(process_advisories) > 0)
      )
    )
  );

comment on column public.production_runs.thermal_mode is
  'Optional operator note about the route actually taken. Never a start condition.';
comment on column public.production_runs.process_readiness is
  'Server-frozen process INFORMATION for the run. READY or READY_WITH_INFO only.';

create or replace function public.production_enforce_process_authority_v1()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_version public.recipe_versions%rowtype;
  v_recipe_input jsonb;
  v_product_composition jsonb;
  v_readiness jsonb;
  v_initial_freeze boolean;
  v_rescue_freeze boolean;
begin
  v_initial_freeze := old.status = 'draft'
    and old.process_readiness is null
    and old.process_advisories is null
    and new.status = 'draft'
    and new.process_readiness is not null;
  v_rescue_freeze := old.status = 'in_progress'
    and new.status = 'in_progress'
    and new.thermal_mode is not distinct from old.thermal_mode
    and new.rescue_revision = old.rescue_revision + 1
    and new.rescue_recipe_input is distinct from old.rescue_recipe_input;

  if new.thermal_mode is distinct from old.thermal_mode and not v_initial_freeze then
    raise exception 'production thermal note is immutable after initial freeze'
      using errcode = '23514';
  end if;

  if new.process_readiness is distinct from old.process_readiness
    or new.process_advisories is distinct from old.process_advisories then
    if not (v_initial_freeze or v_rescue_freeze) then
      raise exception 'production process information is server-owned'
        using errcode = '23514';
    end if;
    select * into v_version from public.recipe_versions
    where id = new.recipe_version_id and owner_user_id = new.owner_user_id;
    if not found then
      raise exception 'exact owned recipe version required' using errcode = '42501';
    end if;
    v_recipe_input := case when v_rescue_freeze
      then new.rescue_recipe_input else v_version.recipe_input end;
    v_product_composition := case when v_rescue_freeze
      then new.rescue_product_composition else v_version.product_composition end;
    v_readiness := public.recipe_process_readiness_v1(
      v_recipe_input, v_product_composition, new.thermal_mode
    );
    if new.process_readiness is distinct from v_readiness->>'status'
      or new.process_advisories is distinct from v_readiness->'advisories' then
      raise exception 'production process information freeze mismatch' using errcode = '23514';
    end if;
  end if;

  if old.status = 'planned' and new.status = 'in_progress' then
    -- Product authority is still asserted below. Process information is not a
    -- start condition, and a thermal note is optional.
    if old.process_readiness not in ('READY', 'READY_WITH_INFO')
      or jsonb_typeof(old.process_advisories) <> 'array' then
      raise exception 'production run requires frozen process information'
        using errcode = '23514';
    end if;
    select * into v_version from public.recipe_versions
    where id = old.recipe_version_id and owner_user_id = old.owner_user_id;
    if not found then
      raise exception 'exact owned recipe version required' using errcode = '42501';
    end if;
    v_recipe_input := coalesce(old.rescue_recipe_input, v_version.recipe_input);
    v_product_composition := coalesce(
      old.rescue_product_composition, v_version.product_composition
    );
    perform public.assert_recipe_behavior_authority_v1(
      v_recipe_input, v_product_composition, 'PRODUCTION'
    );
    v_readiness := public.recipe_process_readiness_v1(
      v_recipe_input, v_product_composition, old.thermal_mode
    );
    if old.process_readiness is distinct from v_readiness->>'status'
      or old.process_advisories is distinct from v_readiness->'advisories' then
      raise exception 'production process information changed before start'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.production_enforce_process_authority_v1()
  from public, anon, authenticated, service_role;

create or replace function public.production_freeze_process_event_v1()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_run public.production_runs%rowtype;
begin
  if new.event_type <> 'started' then return new; end if;
  select * into v_run from public.production_runs
  where id = new.run_id and owner_user_id = new.owner_user_id;
  -- A frozen process record must exist; a thermal note need not.
  if not found or v_run.process_readiness is null then
    raise exception 'production start event requires frozen process information'
      using errcode = '23514';
  end if;
  new.amendment := coalesce(new.amendment, '{}'::jsonb) || jsonb_build_object(
    'thermalMode', v_run.thermal_mode,
    'processReadiness', v_run.process_readiness,
    'processAdvisories', v_run.process_advisories
  );
  return new;
end;
$$;

revoke all on function public.production_freeze_process_event_v1()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Start and Rescue: no process gate, optional thermal note.
-- ---------------------------------------------------------------------------
create or replace function public.production_start_run_v2(
  p_run_id uuid, p_recipe_version_id uuid, p_planned_batch_g numeric,
  p_planned_items jsonb, p_created_event_id uuid, p_planned_event_id uuid,
  p_started_event_id uuid, p_meta jsonb, p_thermal_mode text
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_version public.recipe_versions%rowtype;
  v_readiness jsonb;
  v_status text;
  v_existing public.production_runs%rowtype;
begin
  if p_thermal_mode is not null and p_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE') then
    raise exception 'invalid Production thermal mode' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_uid::text || ':' || p_recipe_version_id::text || ':' || p_planned_batch_g::text, 0
  ));
  select * into v_existing from public.production_runs
  where owner_user_id = v_uid
    and recipe_version_id = p_recipe_version_id
    and planned_batch_g = p_planned_batch_g
    and status = 'in_progress'
  order by created_at asc limit 1;
  if found then
    if v_existing.process_readiness is null then
      raise exception 'active Production run has no frozen process information'
        using errcode = '23514';
    end if;
    return v_existing.id;
  end if;

  perform public.production_create_run_v1(
    p_run_id, p_recipe_version_id, p_planned_batch_g,
    p_planned_items, p_created_event_id, p_meta
  );
  select * into v_version from public.recipe_versions
  where id = p_recipe_version_id and owner_user_id = v_uid;
  if not found then
    raise exception 'exact owned recipe version required' using errcode = '42501';
  end if;
  perform public.assert_recipe_behavior_authority_v1(
    v_version.recipe_input, v_version.product_composition, 'PRODUCTION'
  );
  v_readiness := public.recipe_process_readiness_v1(
    v_version.recipe_input, v_version.product_composition, p_thermal_mode
  );

  update public.production_runs set
    thermal_mode = p_thermal_mode,
    process_readiness = v_readiness->>'status',
    process_advisories = v_readiness->'advisories'
  where id = p_run_id and owner_user_id = v_uid and status = 'draft';
  if not found then
    raise exception 'owned draft Production run required' using errcode = '42501';
  end if;

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

revoke all on function public.production_start_run_v2(
  uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.production_start_run_v2(
  uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Terminal validator: process information never makes a recipe look stale.
-- ---------------------------------------------------------------------------
create or replace function public.validate_recipe_behavior_with_process_envelope_v1(
  p_lines jsonb,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_identity jsonb;
  v_line jsonb;
  v_identity_line jsonb;
  v_resolved jsonb;
  v_readiness jsonb;
  v_reasons jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_stale_ids jsonb := '[]'::jsonb;
  v_advisories jsonb := '[]'::jsonb;
  v_line_id text;
begin
  v_identity := public.validate_recipe_behavior_identity_gate_v1(p_lines, p_context);
  if coalesce(p_context->>'module', '') <> 'PRODUCTION' then
    return v_identity;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_id := v_line->>'lineId';
    select value into v_identity_line
    from jsonb_array_elements(coalesce(v_identity->'lines', '[]'::jsonb))
    where value->>'lineId' = v_line_id;

    v_resolved := public.resolve_product_behavior_v1(
      v_line->>'entityKind', v_line->>'entityId', p_context
    );
    v_readiness := coalesce(v_resolved->'processReadiness', jsonb_build_object(
      'schemaVersion', 1, 'status', 'READY',
      'blockers', '[]'::jsonb, 'advisories', '[]'::jsonb
    ));

    v_reasons := coalesce(v_identity_line->'reasons', '[]'::jsonb);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'lineId', v_line_id,
      'state', case when jsonb_array_length(v_reasons) = 0 then 'ready' else 'stale' end,
      'reasons', v_reasons
    ));
    if jsonb_array_length(v_reasons) > 0 then
      v_stale_ids := v_stale_ids || jsonb_build_array(v_line_id);
    end if;

    select v_advisories || coalesce(jsonb_agg(
      detail.value || jsonb_build_object('lineId', v_line_id)
      order by detail.ordinality
    ), '[]'::jsonb)
    into v_advisories
    from jsonb_array_elements(
      coalesce(v_readiness->'blockers', '[]'::jsonb)
        || coalesce(v_readiness->'advisories', '[]'::jsonb)
    ) with ordinality detail(value, ordinality);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'ready', jsonb_array_length(v_stale_ids) = 0,
    'module', 'PRODUCTION',
    'lines', v_rows,
    'staleLineIds', v_stale_ids,
    'processReadiness', jsonb_build_object(
      'schemaVersion', 1,
      'status', case
        when jsonb_array_length(v_advisories) > 0 then 'READY_WITH_INFO' else 'READY'
      end,
      'blockers', '[]'::jsonb,
      'advisories', v_advisories
    )
  );
end;
$$;

revoke all on function public.validate_recipe_behavior_with_process_envelope_v1(jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Stored classification evidence is deliberately NOT rewritten.
-- ---------------------------------------------------------------------------
-- `mapper_product_behavior_bindings.classification_reason_codes` may still
-- contain `process_evidence_missing` on historical rows. That is a factual
-- record of what the classifier observed and it stays. The resolver above no
-- longer treats it as a blocker, which is the only thing that had to change.

-- ---------------------------------------------------------------------------
-- 8. Assertions: information preserved, authority gone.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.mapper_process_metadata) = 0 then
    raise exception 'process metadata must be preserved, not deleted';
  end if;
  if (select count(*) from public.production_process_advisory_registry) <> 3 then
    raise exception 'Owner-curated process advisory rows must be preserved';
  end if;
  if exists (
    select 1 from public.production_runs
    where process_readiness is not null
      and process_readiness not in ('READY', 'READY_WITH_INFO')
  ) then
    raise exception 'no Production run may carry a blocked process state';
  end if;
end;
$$;
