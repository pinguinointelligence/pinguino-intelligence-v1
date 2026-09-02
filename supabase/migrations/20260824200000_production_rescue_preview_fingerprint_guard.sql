-- Rescue Preview is an append-only audit fact, not mutable Production input.
-- The Preview trigger fires after the authorization row is inserted, so it
-- must not invalidate the database source fingerprint that was just bound to
-- that authorization.

create or replace function private.production_rescue_source_fingerprint_v1(p_run_id uuid)
returns text
language plpgsql stable security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'runId', run.id,
    'ownerUserId', run.owner_user_id,
    'recipeVersionId', run.recipe_version_id,
    'status', run.status,
    'plannedBatchG', run.planned_batch_g,
    'productProfile', run.product_profile,
    'temperatureC', run.temperature_c,
    'actualRevision', run.actual_revision,
    'rescueRevision', run.rescue_revision,
    'engineVersion', run.engine_version,
    'configVersion', run.config_version,
    'rescueRecipeInput', run.rescue_recipe_input,
    'rescueProductComposition', run.rescue_product_composition,
    'recipeVersion', (
      select jsonb_build_object(
        'recipeInput', version.recipe_input,
        'productComposition', version.product_composition,
        'engineVersion', version.engine_version,
        'configVersion', version.config_version,
        'mapperDatasetVersion', version.mapper_dataset_version
      )
      from public.recipe_versions version
      where version.id = run.recipe_version_id
    ),
    'plannedItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lineId', planned.line_id,
        'name', planned.name,
        'plannedGrams', planned.planned_grams,
        'displayGrams', planned.display_grams,
        'position', planned.position,
        'processScope', planned.process_scope,
        'canonicalIngredientId', planned.canonical_ingredient_id,
        'scopePosition', planned.scope_position
      ) order by planned.position, planned.line_id)
      from public.production_run_planned_items planned
      where planned.run_id = run.id
    ), '[]'::jsonb),
    'actual', coalesce((
      select jsonb_build_object(
        'items', actual.actual_items,
        'substitutions', actual.substitutions,
        'actualTotalMixG', actual.actual_total_mix_g,
        'actualYieldG', actual.actual_yield_g,
        'wasteG', actual.waste_g,
        'operatorNotes', actual.operator_notes,
        'deviationReason', actual.deviation_reason,
        'recordedAt', actual.recorded_at
      )
      from public.production_run_actuals actual
      where actual.run_id = run.id
    ), 'null'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', event.id,
        'eventType', event.event_type,
        'detail', event.detail,
        'amendment', event.amendment,
        'createdBy', event.created_by,
        'createdAt', event.created_at
      ) order by event.created_at, event.id)
      from public.production_run_events event
      where event.run_id = run.id
        and event.event_type <> 'rescue_previewed'
    ), '[]'::jsonb)
  ) into v_payload
  from public.production_runs run
  where run.id = p_run_id;

  if v_payload is null then
    raise exception 'production Rescue source is unavailable' using errcode = '22023';
  end if;

  return encode(
    extensions.digest(convert_to(v_payload::text, 'utf8'), 'sha256'),
    'hex'
  );
end;
$$;
