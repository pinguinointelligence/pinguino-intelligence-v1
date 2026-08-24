-- PRODUCTION HEAT INFORMATION IS POSITIVE, AND IT IS ACKNOWLEDGED ONCE
-- (owner decision, 2026-08-24).
--
-- Two changes, both informational, neither a gate.
--
-- 1. Until now `product_process_readiness_v1` only spoke when process data was
--    MISSING. The one thing a professional actually needs to be reminded of —
--    "this ingredient is meant to be heated" — was silent, because a verified
--    decision returned an empty advisory list. Verified heat facts now surface
--    as a POSITIVE advisory (`HEAT_TREATMENT_INDICATED`) carrying the exact
--    decision, reason and the Owner-curated Polish handling note.
--
-- 2. Production stores the operator's single "OK" for that reminder, so it does
--    not reappear on every reload of the same batch.
--
-- Nothing here can block selection, Engine use, Preview, Apply, Save,
-- Production, Rescue, Monitor or Label. `mapper_basement`,
-- `mapper_process_metadata` and `production_process_advisory_registry` are read
-- only and are not modified.

-- ---------------------------------------------------------------------------
-- 1. Per-product process information — now including what IS known.
-- ---------------------------------------------------------------------------
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
  v_reason_type text := nullif(p_resolved#>>'{processBehavior,reasonType}', '');
  v_guidance text := nullif(p_resolved#>>'{processBehavior,lateAdditionGuidancePl}', '');
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

  -- POSITIVE HEAT INFORMATION. A verified decision that the product is meant to
  -- be heated is exactly the fact worth putting in front of the operator before
  -- a batch. It is a reminder, never a route selection and never a condition.
  if v_verification = 'verified'
    and v_decision in (
      'HEAT_REQUIRED_FOR_FUNCTION', 'HEAT_REQUIRED_FOR_SAFETY', 'HEAT_REQUIRED_FOR_BOTH'
    ) then
    return jsonb_build_object(
      'schemaVersion', 1, 'status', 'READY_WITH_INFO', 'blockers', '[]'::jsonb,
      'advisories', jsonb_build_array(
        jsonb_build_object(
          'code', 'HEAT_TREATMENT_INDICATED',
          'productId', v_product_id,
          'mapperIngredientId', v_mapper_id,
          'decision', v_decision,
          'verificationStatus', v_verification
        )
        || case when v_reason_type is null then '{}'::jsonb
             else jsonb_build_object('reasonType', v_reason_type) end
        || case when v_guidance is null then '{}'::jsonb
             else jsonb_build_object('handlingNotePl', v_guidance) end
      )
    );
  end if;

  -- Any other verified decision (for example COLD_PROCESS_OK) is known
  -- information with nothing to remind anyone about.
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
  'Process INFORMATION for one product version: a verified heat requirement is stated positively, a missing fact is stated plainly. Never returns BLOCKED.';

-- ---------------------------------------------------------------------------
-- 2. One acknowledgement per run.
-- ---------------------------------------------------------------------------
alter table public.production_runs
  add column if not exists heat_information_acknowledged_at timestamptz;

comment on column public.production_runs.heat_information_acknowledged_at is
  'When the operator confirmed they have read this run''s heat reminder. Never a start condition.';

create or replace function public.production_acknowledge_heat_information_v1(
  p_run_id uuid
) returns timestamptz
language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := public.assert_production_pro_entitlement_v1();
  v_at timestamptz;
begin
  update public.production_runs
  set heat_information_acknowledged_at =
        coalesce(heat_information_acknowledged_at, pg_catalog.now())
  where id = p_run_id and owner_user_id = v_uid and status = 'in_progress'
  returning heat_information_acknowledged_at into v_at;
  if not found then
    raise exception 'active owned Production run required' using errcode = '42501';
  end if;
  return v_at;
end;
$$;

revoke all on function public.production_acknowledge_heat_information_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.production_acknowledge_heat_information_v1(uuid)
  to authenticated;
