-- A full 820-product JSON export exceeds the HTTP gateway duration. Export is
-- therefore paged by the maintenance client, then registered only if its exact
-- PR ID set still matches the database. Restricted archive rows are exposed
-- only through this service-role function.
create or replace function public.product_import_restricted_snapshot_v1(
  p_actor_user_id uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_ids uuid[]; v_versions uuid[];
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'import owner authorization required'; end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_ids
    from public.products where product_code like 'PR-ING-%';
  select coalesce(array_agg(id),'{}'::uuid[]) into v_versions
    from public.product_versions where product_id=any(v_ids);
  return jsonb_build_object(
    'legacyUnifiedIngestEvents',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.unified_product_ingest_events_archive_20260813 x
      where x.source_product_id=any(v_ids)),
    'ownerDosagePolicies',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.owner_product_dosage_policy_versions x
      where x.exact_catalog_product_version_id=any(v_versions)),
    'behaviorPolicies',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.product_behavior_policy_versions x
      where x.exact_catalog_product_version_id=any(v_versions))
  );
end;
$$;

create or replace function public.register_product_import_external_snapshot_v1(
  p_actor_user_id uuid,p_reason text,p_snapshot_sha256 text,p_artifact_name text,
  p_manifest jsonb,p_target_product_ids uuid[]
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  v_current_ids uuid[];
  v_input_ids uuid[];
  v_pi integer;
  v_audit_id uuid;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'import owner authorization required'; end if;
  if p_snapshot_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid snapshot SHA-256'; end if;
  if nullif(trim(p_artifact_name),'') is null or p_artifact_name like '%/%'
    or p_artifact_name like '%\\%' then raise exception 'invalid snapshot artifact name'; end if;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_current_ids
    from public.products where product_code like 'PR-ING-%';
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_input_ids
    from unnest(p_target_product_ids) x(id);
  if v_input_ids is distinct from v_current_ids then
    raise exception 'snapshot registration blocked: PR identity set drifted';
  end if;
  select count(*) into v_pi from public.products
    where product_kind='mapper_reference' and product_code like 'PI-ING-%';
  if v_pi<>2088 then raise exception 'Mapper count guard failed: %',v_pi; end if;
  insert into public.product_import_reset_audits(
    actor_user_id,reason,pi_count,pr_count,snapshot,snapshot_sha256,
    reset_status,target_product_ids
  ) values(
    p_actor_user_id,p_reason,v_pi,cardinality(v_current_ids),
    jsonb_build_object('storage','local-export','artifactName',p_artifact_name,'manifest',p_manifest),
    p_snapshot_sha256,'SNAPSHOT_READY',v_current_ids
  ) returning id into v_audit_id;
  return jsonb_build_object(
    'auditId',v_audit_id,'status','SNAPSHOT_READY','pi',v_pi,
    'pr',cardinality(v_current_ids),'snapshotSha256',p_snapshot_sha256,
    'artifactName',p_artifact_name
  );
end;
$$;

revoke all on function public.product_import_restricted_snapshot_v1(uuid)
  from public,anon,authenticated;
revoke all on function public.register_product_import_external_snapshot_v1(
  uuid,text,text,text,jsonb,uuid[]
) from public,anon,authenticated;
grant execute on function public.product_import_restricted_snapshot_v1(uuid) to service_role;
grant execute on function public.register_product_import_external_snapshot_v1(
  uuid,text,text,text,jsonb,uuid[]
) to service_role;

notify pgrst,'reload schema';
