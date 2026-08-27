-- Scanner readiness is a capability verdict, not a Product Accuracy threshold.
-- Preserve the accepted one-EAN/customer canonicalization transaction and
-- replace only its admission predicate with the shared V2 readiness verdict.
do $migration$
declare
  v_upsert_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_canonicalize_signature regprocedure := to_regprocedure(
    'public.gellatti_admin_canonicalize_customer_added_v1(uuid)'
  );
  v_request_signature regprocedure := to_regprocedure(
    'public.gellatti_admin_product_request_action_v1(uuid,text,jsonb)'
  );
  v_definition text;
  v_rewritten text;
begin
  if v_upsert_signature is null then
    raise exception 'gellatti_upsert_customer_added_product_v1_missing';
  end if;

  select pg_get_functiondef(v_upsert_signature) into v_definition;
  if position(
    'coalesce((p_product_profile->>''productAccuracy'')::numeric,0)<85'
    in v_definition
  ) = 0 then
    raise exception 'scanner_accuracy_threshold_predicate_not_found';
  end if;

  v_rewritten := replace(
    v_definition,
    'coalesce((p_product_profile->>''productAccuracy'')::numeric,0)<85',
    'coalesce((p_product_profile#>>''{productAccuracyAssessment,gellattiReadiness,ready}'')::boolean,false)=false'
  );
  execute v_rewritten;

  if v_canonicalize_signature is null then
    raise exception 'gellatti_admin_canonicalize_customer_added_v1_missing';
  end if;

  select pg_get_functiondef(v_canonicalize_signature) into v_definition;
  if position(
    'coalesce((v_version.facts->>''productAccuracy'')::numeric,0)<85'
    in v_definition
  ) = 0 then
    raise exception 'scanner_admin_accuracy_threshold_predicate_not_found';
  end if;

  v_rewritten := replace(
    v_definition,
    'coalesce((v_version.facts->>''productAccuracy'')::numeric,0)<85',
    'coalesce((v_version.facts#>>''{productAccuracyAssessment,gellattiReadiness,ready}'')::boolean,false)=false'
  );
  execute v_rewritten;

  if v_request_signature is null then
    raise exception 'gellatti_admin_product_request_action_v1_missing';
  end if;

  select pg_get_functiondef(v_request_signature) into v_definition;
  if position(
    'coalesce((pv.facts->>''productAccuracy'')::numeric,0)>=85'
    in v_definition
  ) = 0 then
    raise exception 'scanner_request_accuracy_threshold_predicate_not_found';
  end if;

  v_rewritten := replace(
    v_definition,
    'coalesce((pv.facts->>''productAccuracy'')::numeric,0)>=85',
    'coalesce((pv.facts#>>''{productAccuracyAssessment,gellattiReadiness,ready}'')::boolean,false)'
  );
  execute v_rewritten;
end
$migration$;

revoke all on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) to service_role;
