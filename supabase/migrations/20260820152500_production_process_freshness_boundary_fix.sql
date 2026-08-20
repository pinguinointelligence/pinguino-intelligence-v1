-- Keep recipe identity/fingerprint freshness separate from Production process
-- readiness. The preceding migration already returns process authority in the
-- dedicated processReadiness envelope, so a process-only blocker must not make
-- an otherwise current recipe look stale to the terminal write assertion.

alter function public.validate_recipe_behavior_v1(jsonb, jsonb)
  rename to validate_recipe_behavior_with_process_envelope_v1;

revoke all on function public.validate_recipe_behavior_with_process_envelope_v1(jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.validate_recipe_behavior_v1(
  p_lines jsonb,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_line jsonb;
  v_reasons jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_stale_ids jsonb := '[]'::jsonb;
begin
  v_result := public.validate_recipe_behavior_with_process_envelope_v1(
    p_lines, p_context
  );

  if coalesce(p_context->>'module', '') <> 'PRODUCTION' then
    return v_result;
  end if;

  for v_line in
    select value from jsonb_array_elements(coalesce(v_result->'lines', '[]'::jsonb))
  loop
    select coalesce(jsonb_agg(reason.value order by reason.ordinality), '[]'::jsonb)
    into v_reasons
    from jsonb_array_elements(coalesce(v_line->'reasons', '[]'::jsonb))
      with ordinality reason(value, ordinality)
    where reason.value#>>'{}' <> 'process_readiness_blocked';

    v_line := jsonb_set(v_line, '{reasons}', v_reasons, true);
    v_line := jsonb_set(
      v_line,
      '{state}',
      to_jsonb(case when jsonb_array_length(v_reasons) = 0 then 'ready' else 'stale' end),
      true
    );
    v_lines := v_lines || jsonb_build_array(v_line);

    if jsonb_array_length(v_reasons) > 0 then
      v_stale_ids := v_stale_ids || jsonb_build_array(v_line->>'lineId');
    end if;
  end loop;

  v_result := jsonb_set(v_result, '{lines}', v_lines, true);
  v_result := jsonb_set(v_result, '{staleLineIds}', v_stale_ids, true);
  v_result := jsonb_set(
    v_result,
    '{ready}',
    to_jsonb(jsonb_array_length(v_stale_ids) = 0),
    true
  );
  return v_result;
end;
$$;

revoke all on function public.validate_recipe_behavior_v1(jsonb, jsonb)
  from public, anon;
grant execute on function public.validate_recipe_behavior_v1(jsonb, jsonb)
  to authenticated, service_role;
