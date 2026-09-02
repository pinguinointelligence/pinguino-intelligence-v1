-- Production records and the trusted Rescue runtime use physical 0.1 g
-- precision. Keep the existing non-negative, immutable-identity and exact
-- vector gates, but do not reject an authorized confirmed-line top-up such as
-- +0.5 g merely because the previous database boundary required whole grams.
-- The existing `rescue target batch must equal its complete Base vector` gate
-- remains byte-identical inside the patched function.

do $patch_production_rescue_decimal_targets$
declare
  v_signature regprocedure :=
    'public.production_apply_rescue_v1(uuid,integer,integer,jsonb,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_patched text;
  v_old_precision text :=
    $old$or (item->>'planned_grams')::numeric <> trunc((item->>'planned_grams')::numeric)$old$;
  v_new_precision text :=
    $new$or (item->>'planned_grams')::numeric * 10
        <> trunc((item->>'planned_grams')::numeric * 10)$new$;
  v_old_message text :=
    $old$rescue targets must be non-negative practical whole grams$old$;
  v_new_message text :=
    $new$rescue targets must be non-negative practical 0.1 g increments$new$;
begin
  v_definition := pg_get_functiondef(v_signature);
  if strpos(v_definition, v_old_precision) = 0
    or strpos(v_definition, v_old_message) = 0 then
    raise exception 'Production Rescue decimal-target anchor drifted for %', v_signature;
  end if;

  v_patched := replace(v_definition, v_old_precision, v_new_precision);
  v_patched := replace(v_patched, v_old_message, v_new_message);
  execute v_patched;
end;
$patch_production_rescue_decimal_targets$;
