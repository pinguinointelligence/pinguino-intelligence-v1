-- Product Request approval consumes the readiness assessment stored by the
-- canonical product-owned profile ingest. That assessment is nested beneath
-- facts.productIntelligence; the previous path always read NULL and rejected
-- every otherwise-ready Admin-approved Product Request.
select pg_advisory_xact_lock(
  hashtextextended('canonical-product-request-readiness-path-fix-v1', 0)
);

do $patch_request_readiness_path$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_admin_product_request_action_v1(uuid,text,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text :=
    $old$pv.facts#>>'{productAccuracyAssessment,gellattiReadiness,ready}'$old$;
  v_new text :=
    $new$pv.facts#>>'{productIntelligence,productAccuracyAssessment,gellattiReadiness,ready}'$new$;
begin
  if v_signature is null then
    raise exception 'gellatti_admin_product_request_action_v1_missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;

  if strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'product_request_readiness_path_anchor_drifted';
  end if;

  v_patched := replace(v_definition, v_old, v_new);
  execute v_patched;

  if strpos(
    pg_get_functiondef(v_signature),
    v_new
  ) = 0 then
    raise exception 'product_request_readiness_path_patch_failed';
  end if;
end
$patch_request_readiness_path$;
