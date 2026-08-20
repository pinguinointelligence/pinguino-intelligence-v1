-- Production process authority is separate from recipe mathematics. This
-- forward-only migration does not mutate Mapper source data or historical
-- recipe versions. UNKNOWN is advisory only for the exact Owner-approved set.

create table if not exists public.production_process_advisory_registry (
  ingredient_id text primary key references public.mapper_basement(ingredient_id) on delete restrict,
  advisory_code text not null check (advisory_code ~ '^[A-Z][A-Z0-9_]{2,80}$'),
  source_process_status text not null,
  cold_process_eligibility text not null,
  hydration_mode text not null,
  source_dataset_version text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$')
);

insert into public.production_process_advisory_registry (
  ingredient_id, advisory_code, source_process_status,
  cold_process_eligibility, hydration_mode, source_dataset_version, source_sha256
) values
  ('PI-ING-000236', 'PROCESS_DATA_INSUFFICIENT', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN',
    '2026-08-08-process-v1',
    'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4'),
  ('PI-ING-000180', 'PROCESS_DATA_INSUFFICIENT', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN',
    '2026-08-08-process-v1',
    'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4'),
  ('PI-ING-000270', 'SMP_PROCESS_GRADE_DEPENDENT', 'UNKNOWN', 'CONDITIONAL', 'GRADE_DEPENDENT',
    '2026-08-08-process-v1',
    'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4')
on conflict (ingredient_id) do update set
  advisory_code = excluded.advisory_code,
  source_process_status = excluded.source_process_status,
  cold_process_eligibility = excluded.cold_process_eligibility,
  hydration_mode = excluded.hydration_mode,
  source_dataset_version = excluded.source_dataset_version,
  source_sha256 = excluded.source_sha256;

alter table public.production_process_advisory_registry enable row level security;
revoke all on public.production_process_advisory_registry
  from public, anon, authenticated, service_role;

comment on table public.production_process_advisory_registry is
  'Exact Owner-approved UNKNOWN process advisories. Rows are authority bounds, not evidence.';

-- Preserve staging behavior as the private non-process gate. The public
-- wrapper below adds only Production process authority.
alter function public.resolve_product_behavior_v1(text,text,jsonb)
  rename to resolve_product_behavior_evidence_gate_v1;

revoke all on function public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.product_process_readiness_v1(
  p_resolved jsonb,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_scope text := coalesce(nullif(p_context->>'processScope', ''), 'BASE_FORMULATION');
  v_thermal_mode text := nullif(p_context->>'thermalMode', '');
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

  if v_thermal_mode is null then
    v_detail := jsonb_build_object(
      'code', 'PROCESS_THERMAL_MODE_REQUIRED',
      'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
      'decision', v_decision, 'verificationStatus', v_verification
    );
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(v_detail), 'advisories', '[]'::jsonb
    );
  end if;

  if v_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE') then
    v_detail := jsonb_build_object(
      'code', 'PROCESS_THERMAL_MODE_INVALID',
      'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
      'decision', v_decision, 'verificationStatus', v_verification
    );
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(v_detail), 'advisories', '[]'::jsonb
    );
  end if;

  if v_mapper_id is null then
    v_detail := jsonb_build_object(
      'code', 'MAPPER_PROCESS_IDENTITY_MISSING',
      'productId', v_product_id, 'mapperIngredientId', null,
      'decision', v_decision, 'verificationStatus', v_verification
    );
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(v_detail), 'advisories', '[]'::jsonb
    );
  end if;

  if v_thermal_mode = 'COLD_ONLY'
    and v_verification = 'verified'
    and v_decision in (
      'HEAT_REQUIRED_FOR_FUNCTION',
      'HEAT_REQUIRED_FOR_SAFETY',
      'HEAT_REQUIRED_FOR_BOTH'
    ) then
    v_detail := jsonb_build_object(
      'code', 'PROCESS_HEAT_REQUIRED_CONFLICT',
      'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
      'decision', v_decision, 'verificationStatus', v_verification
    );
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(v_detail), 'advisories', '[]'::jsonb
    );
  end if;

  if v_decision = 'UNKNOWN' or v_verification <> 'verified' then
    select registry.advisory_code, registry.source_process_status,
      registry.cold_process_eligibility, registry.hydration_mode
    into v_advisory_code, v_source_process_status,
      v_cold_process_eligibility, v_hydration_mode
    from public.production_process_advisory_registry registry
    where registry.ingredient_id = v_mapper_id;

    if v_advisory_code is null then
      v_detail := jsonb_build_object(
        'code', 'PROCESS_ADVISORY_AUTHORITY_MISSING',
        'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
        'decision', v_decision, 'verificationStatus', v_verification
      );
      return jsonb_build_object(
        'schemaVersion', 1, 'status', 'BLOCKED',
        'blockers', jsonb_build_array(v_detail), 'advisories', '[]'::jsonb
      );
    end if;

    v_detail := jsonb_build_object(
      'code', v_advisory_code,
      'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
      'decision', v_decision, 'verificationStatus', v_verification,
      'sourceProcessStatus', v_source_process_status,
      'coldProcessEligibility', v_cold_process_eligibility,
      'hydrationMode', v_hydration_mode
    );
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'READY_WITH_INFO',
      'blockers', '[]'::jsonb, 'advisories', jsonb_build_array(v_detail)
    );
  end if;

  if v_decision not in (
    'COLD_PROCESS_OK',
    'HEAT_REQUIRED_FOR_FUNCTION',
    'HEAT_REQUIRED_FOR_SAFETY',
    'HEAT_REQUIRED_FOR_BOTH'
  ) then
    v_detail := jsonb_build_object(
      'code', 'PROCESS_DECISION_UNSUPPORTED',
      'productId', v_product_id, 'mapperIngredientId', v_mapper_id,
      'decision', v_decision, 'verificationStatus', v_verification
    );
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(v_detail), 'advisories', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1, 'status', 'READY',
    'blockers', '[]'::jsonb, 'advisories', '[]'::jsonb
  );
end;
$$;

revoke all on function public.product_process_readiness_v1(jsonb,jsonb)
  from public, anon, authenticated, service_role;

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
  v_process_only_block boolean;
begin
  if p_context ? 'thermalMode'
    and nullif(p_context->>'thermalMode', '') is not null
    and p_context->>'thermalMode' not in ('COLD_ONLY', 'HEAT_CAPABLE') then
    raise exception 'invalid behavior thermal context' using errcode = '22023';
  end if;

  v_resolved := public.resolve_product_behavior_evidence_gate_v1(
    p_entity_kind, p_entity_id, p_context
  );
  v_readiness := public.product_process_readiness_v1(v_resolved, p_context);
  v_resolved := jsonb_set(v_resolved, '{processReadiness}', v_readiness, true);

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  into v_block_reasons
  from jsonb_array_elements(
    coalesce(v_resolved->'blockReasons', '[]'::jsonb)
  ) with ordinality entry(value, ordinality)
  where entry.value#>>'{}' <> 'process_evidence_missing'
    and entry.value#>>'{}' not like 'process_evidence_unknown:%';

  v_process_only_block := jsonb_array_length(v_block_reasons) = 0;
  v_engine_ready :=
    coalesce(v_resolved#>>'{moduleEligibility,OPTIMAL}', 'blocked') = 'eligible'
    and coalesce(v_resolved#>>'{moduleEligibility,ECO}', 'blocked') = 'eligible';
  -- MAIN eligibility in the staging resolver also includes verified process
  -- evidence. Separate that factor here so a bounded advisory can remain MAIN
  -- only when the independent Main policy is actually present.
  v_role_ready := coalesce(p_context->>'requestedRole', 'STANDARD') = 'STANDARD'
    or (
      coalesce(v_resolved->>'mainEligibility', 'UNKNOWN') in (
        'MAIN_ALLOWED', 'MAIN_PROFILE_SPECIFIC'
      )
      and jsonb_typeof(v_resolved->'mainPolicy') = 'object'
    );

  if coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED' then
    v_resolved := jsonb_set(
      v_resolved, '{moduleEligibility,PRODUCTION}', '"blocked"'::jsonb, true
    );
    if coalesce(p_context->>'module', 'SEARCH') = 'PRODUCTION' then
      v_resolved := jsonb_set(v_resolved, '{state}', '"blocked"'::jsonb, true);
    end if;
    v_block_reasons := v_block_reasons || jsonb_build_array('process_readiness_blocked');
    v_resolved := jsonb_set(v_resolved, '{blockReasons}', v_block_reasons, true);
  elsif coalesce(p_context->>'processScope', 'BASE_FORMULATION') = 'BASE_FORMULATION'
    and nullif(v_resolved->>'mapperIngredientId', '') is not null
    and v_engine_ready and v_role_ready and v_process_only_block then
    v_resolved := jsonb_set(
      v_resolved, '{moduleEligibility,PRODUCTION}', '"eligible"'::jsonb, true
    );
    if coalesce(p_context->>'module', 'SEARCH') = 'PRODUCTION' then
      v_resolved := jsonb_set(v_resolved, '{state}', '"eligible"'::jsonb, true);
    end if;
    v_resolved := jsonb_set(v_resolved, '{blockReasons}', v_block_reasons, true);
  end if;

  return v_resolved;
end;
$$;

revoke all on function public.resolve_product_behavior_v1(text,text,jsonb)
  from public, anon;
grant execute on function public.resolve_product_behavior_v1(text,text,jsonb)
  to authenticated, service_role;

-- The existing terminal validator remains the complete identity/fingerprint/
-- policy gate. This wrapper reports process readiness separately so a process
-- blocker never masquerades as stale recipe mathematics.
alter function public.validate_recipe_behavior_v1(jsonb,jsonb)
  rename to validate_recipe_behavior_identity_gate_v1;

revoke all on function public.validate_recipe_behavior_identity_gate_v1(jsonb,jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.validate_recipe_behavior_v1(
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
  v_blockers jsonb := '[]'::jsonb;
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
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'PROCESS_AUTHORITY_UNAVAILABLE',
        'productId', v_line->>'productId',
        'mapperIngredientId', v_line->>'mapperIngredientId',
        'decision', 'UNKNOWN', 'verificationStatus', 'unknown'
      )),
      'advisories', '[]'::jsonb
    ));

    select coalesce(jsonb_agg(reason.value order by reason.ordinality), '[]'::jsonb)
    into v_reasons
    from jsonb_array_elements(coalesce(v_identity_line->'reasons', '[]'::jsonb))
      with ordinality reason(value, ordinality)
    where not (
      reason.value#>>'{}' = 'requested_module_not_eligible'
      and coalesce(v_resolved->'blockReasons', '[]'::jsonb)
        <@ jsonb_build_array('process_readiness_blocked')
      and coalesce(v_resolved->'blockReasons', '[]'::jsonb)
        ? 'process_readiness_blocked'
    );

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'lineId', v_line_id,
      'state', case when jsonb_array_length(v_reasons) = 0 then 'ready' else 'stale' end,
      'reasons', v_reasons
    ));
    if jsonb_array_length(v_reasons) > 0 then
      v_stale_ids := v_stale_ids || jsonb_build_array(v_line_id);
    end if;

    select v_blockers || coalesce(jsonb_agg(
      detail.value || jsonb_build_object('lineId', v_line_id)
      order by detail.ordinality
    ), '[]'::jsonb)
    into v_blockers
    from jsonb_array_elements(coalesce(v_readiness->'blockers', '[]'::jsonb))
      with ordinality detail(value, ordinality);
    select v_advisories || coalesce(jsonb_agg(
      detail.value || jsonb_build_object('lineId', v_line_id)
      order by detail.ordinality
    ), '[]'::jsonb)
    into v_advisories
    from jsonb_array_elements(coalesce(v_readiness->'advisories', '[]'::jsonb))
      with ordinality detail(value, ordinality);
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
        when jsonb_array_length(v_blockers) > 0 then 'BLOCKED'
        when jsonb_array_length(v_advisories) > 0 then 'READY_WITH_INFO'
        else 'READY'
      end,
      'blockers', v_blockers,
      'advisories', v_advisories
    )
  );
end;
$$;

revoke all on function public.validate_recipe_behavior_v1(jsonb,jsonb)
  from public, anon;
grant execute on function public.validate_recipe_behavior_v1(jsonb,jsonb)
  to authenticated, service_role;

-- Re-resolve each positive Base line. Names, categories and Engine score never
-- create process permission; only exact frozen product identities are used.
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
  v_blockers jsonb := '[]'::jsonb;
  v_advisories jsonb := '[]'::jsonb;
begin
  if p_thermal_mode is null or p_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE') then
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
    if v_line_id is null or jsonb_typeof(v_snapshot) <> 'object'
      or v_snapshot->>'resolutionState' <> 'RESOLVED' then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'PROCESS_READINESS_SNAPSHOT_MISSING',
        'lineId', v_line_id,
        'productId', v_snapshot->>'productId',
        'mapperIngredientId', v_snapshot->>'mapperIngredientId',
        'decision', 'UNKNOWN', 'verificationStatus', 'unknown'
      ));
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
        'requestedRole', case when v_item->>'lock_type' = 'main' then 'MAIN' else 'STANDARD' end,
        'thermalMode', p_thermal_mode
      )
    );
    v_readiness := coalesce(v_resolved->'processReadiness', jsonb_build_object(
      'schemaVersion', 1, 'status', 'BLOCKED',
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'PROCESS_AUTHORITY_UNAVAILABLE',
        'productId', v_snapshot->>'productId',
        'mapperIngredientId', v_snapshot->>'mapperIngredientId',
        'decision', 'UNKNOWN', 'verificationStatus', 'unknown'
      )),
      'advisories', '[]'::jsonb
    ));

    select v_blockers || coalesce(jsonb_agg(
      detail.value || jsonb_build_object('lineId', v_line_id)
      order by detail.ordinality
    ), '[]'::jsonb)
    into v_blockers
    from jsonb_array_elements(coalesce(v_readiness->'blockers', '[]'::jsonb))
      with ordinality detail(value, ordinality);
    select v_advisories || coalesce(jsonb_agg(
      detail.value || jsonb_build_object('lineId', v_line_id)
      order by detail.ordinality
    ), '[]'::jsonb)
    into v_advisories
    from jsonb_array_elements(coalesce(v_readiness->'advisories', '[]'::jsonb))
      with ordinality detail(value, ordinality);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', case
      when jsonb_array_length(v_blockers) > 0 then 'BLOCKED'
      when jsonb_array_length(v_advisories) > 0 then 'READY_WITH_INFO'
      else 'READY'
    end,
    'blockers', v_blockers,
    'advisories', v_advisories
  );
end;
$$;

revoke all on function public.recipe_process_readiness_v1(jsonb,jsonb,text)
  from public, anon, authenticated, service_role;

alter table public.production_runs
  add column if not exists thermal_mode text,
  add column if not exists process_readiness text,
  add column if not exists process_advisories jsonb;

alter table public.production_runs
  drop constraint if exists production_runs_process_authority;
alter table public.production_runs
  add constraint production_runs_process_authority check (
    (thermal_mode is null and process_readiness is null and process_advisories is null)
    or (
      thermal_mode in ('COLD_ONLY', 'HEAT_CAPABLE')
      and process_readiness in ('READY', 'READY_WITH_INFO')
      and jsonb_typeof(process_advisories) = 'array'
      and (
        (process_readiness = 'READY' and jsonb_array_length(process_advisories) = 0)
        or (process_readiness = 'READY_WITH_INFO' and jsonb_array_length(process_advisories) > 0)
      )
    )
  );

comment on column public.production_runs.thermal_mode is
  'Explicit operator Production route. NULL is legacy history, never implicit COLD_ONLY.';
comment on column public.production_runs.process_readiness is
  'Current server-frozen authority for the run; Rescue may replace it atomically.';
comment on column public.production_runs.process_advisories is
  'Server-frozen bounded advisory details for the current run composition.';

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
    and old.thermal_mode is null
    and old.process_readiness is null
    and old.process_advisories is null
    and new.status = 'draft'
    and new.thermal_mode in ('COLD_ONLY', 'HEAT_CAPABLE');
  v_rescue_freeze := old.status = 'in_progress'
    and new.status = 'in_progress'
    and new.thermal_mode is not distinct from old.thermal_mode
    and new.rescue_revision = old.rescue_revision + 1
    and new.rescue_recipe_input is distinct from old.rescue_recipe_input;

  if new.thermal_mode is distinct from old.thermal_mode and not v_initial_freeze then
    raise exception 'production thermal authority is immutable after initial freeze'
      using errcode = '23514';
  end if;

  if new.process_readiness is distinct from old.process_readiness
    or new.process_advisories is distinct from old.process_advisories then
    if not (v_initial_freeze or v_rescue_freeze) then
      raise exception 'production process authority is server-owned'
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
    if coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED'
      or new.process_readiness is distinct from v_readiness->>'status'
      or new.process_advisories is distinct from v_readiness->'advisories' then
      raise exception 'production process authority freeze mismatch' using errcode = '23514';
    end if;
  end if;

  if old.status = 'planned' and new.status = 'in_progress' then
    if old.thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE')
      or old.process_readiness not in ('READY', 'READY_WITH_INFO')
      or jsonb_typeof(old.process_advisories) <> 'array' then
      raise exception 'production run requires explicit thermal authority'
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
    if coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED'
      or old.process_readiness is distinct from v_readiness->>'status'
      or old.process_advisories is distinct from v_readiness->'advisories' then
      raise exception 'production process authority changed before start'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.production_enforce_process_authority_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists production_run_process_authority_v1 on public.production_runs;
create trigger production_run_process_authority_v1
before update on public.production_runs
for each row execute function public.production_enforce_process_authority_v1();

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
  if not found or v_run.process_readiness is null or v_run.thermal_mode is null then
    raise exception 'production start event requires process authority' using errcode = '23514';
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

drop trigger if exists production_run_event_process_authority_v1
  on public.production_run_events;
create trigger production_run_event_process_authority_v1
before insert on public.production_run_events
for each row execute function public.production_freeze_process_event_v1();

-- Only this RPC starts a new run after the migration. The legacy start RPC is
-- revoked, and the status trigger also blocks any legacy/direct transition.
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
  if p_thermal_mode is null or p_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE') then
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
    if v_existing.thermal_mode is distinct from p_thermal_mode
      or v_existing.process_readiness is null then
      raise exception 'active Production run has different process authority'
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
  if coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED' then
    raise exception 'production process readiness is blocked' using errcode = '23514';
  end if;

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

revoke all on function public.production_start_run_v1(
  uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.production_start_run_v2(
  uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.production_start_run_v2(
  uuid, uuid, numeric, jsonb, uuid, uuid, uuid, jsonb, text
) to authenticated;

-- Preserve every staging Rescue structural/physical gate, then re-evaluate
-- Production process authority for the accepted resulting composition.
create or replace function public.production_apply_rescue_v1(
  p_run_id uuid, p_expected_rescue_revision integer, p_expected_actual_revision integer,
  p_recipe_input jsonb, p_product_composition jsonb, p_event_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_run public.production_runs%rowtype;
  v_version public.recipe_versions%rowtype;
  v_readiness jsonb;
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
    select 1 from jsonb_array_elements(coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)) prior
    where not exists (
      select 1 from jsonb_array_elements(p_recipe_input->'items') candidate
      where candidate->>'id' = prior->>'id'
    )
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(v_run.rescue_recipe_input->'items', '[]'::jsonb)) prior
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
    select coalesce(sum((item->>'planned_grams')::numeric), 0)
    from jsonb_array_elements(p_recipe_input->'items') item
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
            and (candidate->>'planned_grams')::numeric + 0.000001
              < (recorded->>'actualGrams')::numeric
        )
      )
  ) then
    raise exception 'rescue cannot reduce physically recorded material'
      using errcode = '23514';
  end if;

  perform public.assert_recipe_behavior_authority_v1(
    p_recipe_input, p_product_composition, 'BATCH_RESCUE'
  );
  v_readiness := public.recipe_process_readiness_v1(
    p_recipe_input, p_product_composition, v_run.thermal_mode
  );
  if coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED' then
    raise exception 'rescue process readiness is blocked' using errcode = '23514';
  end if;

  update public.production_runs set
    rescue_recipe_input = p_recipe_input,
    rescue_product_composition = p_product_composition,
    rescue_accepted_by = v_uid,
    rescue_accepted_at = v_at,
    rescue_revision = rescue_revision + 1,
    process_readiness = v_readiness->>'status',
    process_advisories = v_readiness->'advisories',
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
      'revision', v_run.rescue_revision + 1,
      'thermalMode', v_run.thermal_mode,
      'previousProcessReadiness', v_run.process_readiness,
      'previousProcessAdvisories', v_run.process_advisories,
      'processReadiness', v_readiness->>'status',
      'processAdvisories', v_readiness->'advisories'
    ),
    v_uid, v_at
  );
  return p_run_id;
end;
$$;

revoke all on function public.production_apply_rescue_v1(
  uuid, integer, integer, jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;

do $$
begin
  if exists (
    select 1 from public.mapper_process_metadata
    where ingredient_id in ('PI-ING-000236', 'PI-ING-000180', 'PI-ING-000270')
      and (process_decision <> 'UNKNOWN' or verification_status <> 'unknown')
  ) then
    raise exception 'process authority migration must not invent verified evidence';
  end if;
  if (
    select count(*) from public.production_process_advisory_registry
    where ingredient_id in ('PI-ING-000236', 'PI-ING-000180', 'PI-ING-000270')
  ) <> 3 then
    raise exception 'Owner-approved process advisory registry is incomplete';
  end if;
end;
$$;
