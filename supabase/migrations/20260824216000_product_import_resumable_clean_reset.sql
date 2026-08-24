-- Split the large staging PR reset into an immutable snapshot transaction and
-- small, resumable delete transactions. This preserves auditability across API
-- timeouts without ever touching mapper_basement.
alter table public.product_import_reset_audits
  add column if not exists reset_status text not null default 'SNAPSHOT_READY',
  add column if not exists target_product_ids uuid[] not null default '{}',
  add column if not exists deleted_pr_count integer not null default 0,
  add column if not exists completed_at timestamptz;

create or replace function public.snapshot_pr_catalog_v1(
  p_actor_user_id uuid,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions
set statement_timeout='300s' as $$
declare
  v_ids uuid[];
  v_versions uuid[];
  v_variants uuid[];
  v_pi integer;
  v_pr integer;
  v_snapshot jsonb;
  v_audit_id uuid;
  v_sha text;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'import owner authorization required'; end if;
  select coalesce(array_agg(id order by product_code),'{}'::uuid[]),count(*)
    into v_ids,v_pr from public.products where product_code like 'PR-ING-%';
  select count(*) into v_pi from public.products
    where product_kind='mapper_reference' and product_code like 'PI-ING-%';
  if v_pi<>2088 then raise exception 'Mapper count guard failed: %',v_pi; end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_versions
    from public.product_versions where product_id=any(v_ids);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_variants
    from public.product_variants where product_id=any(v_ids);
  if exists(select 1 from public.saved_recipes s,unnest(v_ids) p(id)
      where s.recipe_input::text like '%'||p.id::text||'%')
    or exists(select 1 from public.recipe_versions r,unnest(v_ids) p(id)
      where r.recipe_input::text like '%'||p.id::text||'%') then
    raise exception 'clean reset blocked: PR product is referenced by a saved recipe';
  end if;
  if exists(select 1 from public.owner_product_dosage_policy_versions
      where exact_catalog_product_version_id=any(v_versions))
    or exists(select 1 from public.product_behavior_policy_versions
      where exact_catalog_product_version_id=any(v_versions)) then
    raise exception 'clean reset blocked: PR version has an owner policy';
  end if;
  if exists(select 1 from public.products
      where merged_into_product_id=any(v_ids) and not (id=any(v_ids))) then
    raise exception 'clean reset blocked: non-PR product is merged into a PR product';
  end if;
  if exists(select 1 from public.product_scan_creation_reservations where product_id=any(v_ids))
    or exists(select 1 from public.product_scan_overlay_states
      where product_id=any(v_ids) or product_version_id=any(v_versions)) then
    raise exception 'clean reset blocked: PR product is referenced by Scanner state';
  end if;

  v_snapshot:=jsonb_build_object(
    'capturedAt',now(),'reason',p_reason,'pi',v_pi,'pr',v_pr,
    'products',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_code),'[]'::jsonb)
      from public.products x where x.id=any(v_ids)),
    'versions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.version),'[]'::jsonb)
      from public.product_versions x where x.product_id=any(v_ids)),
    'bindings',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.classified_at),'[]'::jsonb)
      from public.product_behavior_bindings x where x.product_id=any(v_ids)),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_evidence x where x.product_id=any(v_ids)),
    'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_ingest_events x where x.product_id=any(v_ids)),
    'reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_review_cases x where x.product_id=any(v_ids)),
    'relations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id),'[]'::jsonb)
      from public.user_product_relations x where x.product_id=any(v_ids)),
    'aliases',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_aliases x where x.product_id=any(v_ids)),
    'variants',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_variants x where x.product_id=any(v_ids)),
    'variantMarkets',(select coalesce(jsonb_agg(to_jsonb(x) order by x.variant_id,x.market),'[]'::jsonb)
      from public.product_variant_markets x where x.variant_id=any(v_variants)),
    'retailerOffers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.variant_id,x.created_at),'[]'::jsonb)
      from public.product_retailer_offers x where x.variant_id=any(v_variants)),
    'snapshots',(select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,x.created_at),'[]'::jsonb)
      from public.product_snapshots x where x.product_id=any(v_ids)),
    'reclassificationQueue',(select coalesce(jsonb_agg(to_jsonb(x) order by x.queued_at),'[]'::jsonb)
      from public.product_behavior_reclassification_queue x
      where x.entity_kind='catalog_product_version'
        and x.entity_id in (select u.id::text from unnest(v_versions) u(id))),
    'scannerSessionsDetached',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.product_scan_sessions x where x.exact_product_id=any(v_ids)),
    'legacySessionBindings',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.global_catalog_product_session_bindings x where x.private_product_id=any(v_ids)),
    'legacySessionBindingHistory',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.global_catalog_product_session_binding_history x where x.private_product_id=any(v_ids)),
    'legacySubmissions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.global_catalog_submissions x where x.private_product_id=any(v_ids)),
    'legacyUnifiedIngestEvents',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
      from public.unified_product_ingest_events x where x.source_product_id=any(v_ids))
  );
  v_sha:=encode(extensions.digest(convert_to(v_snapshot::text,'utf8'),'sha256'),'hex');
  insert into public.product_import_reset_audits(
    actor_user_id,reason,pi_count,pr_count,snapshot,snapshot_sha256,
    reset_status,target_product_ids
  ) values(
    p_actor_user_id,p_reason,v_pi,v_pr,v_snapshot,v_sha,'SNAPSHOT_READY',v_ids
  ) returning id into v_audit_id;
  return jsonb_build_object(
    'auditId',v_audit_id,'snapshotSha256',v_sha,'status','SNAPSHOT_READY',
    'pi',v_pi,'pr',v_pr,'targetProducts',cardinality(v_ids)
  );
end;
$$;

create or replace function public.clean_pr_catalog_batch_v1(
  p_actor_user_id uuid,p_audit_id uuid,p_batch_size integer default 8
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions
set statement_timeout='30s' as $$
declare
  v_target_ids uuid[];
  v_ids uuid[];
  v_versions uuid[];
  v_variants uuid[];
  v_status text;
  v_expected integer;
  v_deleted integer:=0;
  v_remaining integer;
  v_pi integer;
  v_pr integer;
  v_orphan_versions integer;
  v_orphan_bindings integer;
  v_orphan_matched integer;
begin
  if not public.product_import_actor_authorized_v1(p_actor_user_id)
    then raise exception 'import owner authorization required'; end if;
  if p_batch_size<1 or p_batch_size>20 then raise exception 'invalid reset batch size'; end if;
  select target_product_ids,reset_status,pr_count into v_target_ids,v_status,v_expected
    from public.product_import_reset_audits
    where id=p_audit_id and actor_user_id=p_actor_user_id for update;
  if not found then raise exception 'reset audit not found'; end if;
  if v_status='COMPLETED' then
    return jsonb_build_object('auditId',p_audit_id,'status','COMPLETED','remaining',0);
  end if;
  if v_status not in ('SNAPSHOT_READY','DELETING') then raise exception 'reset audit is not executable'; end if;
  update public.product_import_reset_audits set reset_status='DELETING' where id=p_audit_id;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_ids from (
    select p.id from public.products p where p.id=any(v_target_ids)
    order by p.product_code limit p_batch_size
  ) q;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_versions
    from public.product_versions where product_id=any(v_ids);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_variants
    from public.product_variants where product_id=any(v_ids);
  v_deleted:=cardinality(v_ids);
  perform set_config('app.canonical_product_reset','v1',true);
  delete from public.product_behavior_reclassification_queue
    where entity_kind='catalog_product_version'
      and entity_id in (select u.id::text from unnest(v_versions) u(id));
  delete from public.product_review_cases where product_id=any(v_ids);
  delete from public.product_evidence where product_id=any(v_ids);
  delete from public.product_ingest_events where product_id=any(v_ids);
  delete from public.product_behavior_bindings where product_id=any(v_ids);
  delete from public.product_variant_markets where variant_id=any(v_variants);
  delete from public.product_retailer_offers where variant_id=any(v_variants);
  delete from public.product_variants where product_id=any(v_ids);
  delete from public.product_aliases where product_id=any(v_ids);
  delete from public.user_product_relations where product_id=any(v_ids);
  delete from public.product_snapshots where product_id=any(v_ids);
  delete from public.global_catalog_product_session_bindings where private_product_id=any(v_ids);
  update public.product_scan_sessions set exact_product_id=null where exact_product_id=any(v_ids);
  update public.products set current_version_id=null,current_behavior_binding_id=null,
    matched_basement_id=null,merged_into_product_id=null where id=any(v_ids);
  delete from public.product_versions where product_id=any(v_ids);
  delete from public.products where id=any(v_ids);
  update public.product_import_reset_audits
    set deleted_pr_count=deleted_pr_count+v_deleted where id=p_audit_id;

  select count(*) into v_remaining from public.products where id=any(v_target_ids);
  select count(*) into v_pi from public.products
    where product_kind='mapper_reference' and product_code like 'PI-ING-%';
  select count(*) into v_pr from public.products where product_code like 'PR-ING-%';
  select count(*) into v_orphan_versions from public.product_versions
    where product_id=any(v_target_ids);
  select count(*) into v_orphan_bindings from public.product_behavior_bindings
    where product_id=any(v_target_ids);
  select count(*) into v_orphan_matched from public.products
    where id=any(v_target_ids) and matched_basement_id is not null;
  if v_remaining=0 then
    if v_pi<>2088 or v_pr<>0 or v_orphan_versions<>0
      or v_orphan_bindings<>0 or v_orphan_matched<>0 then
      raise exception 'clean reset final proof failed';
    end if;
    update public.product_import_reset_audits
      set reset_status='COMPLETED',completed_at=now() where id=p_audit_id;
    v_status:='COMPLETED';
  else v_status:='DELETING'; end if;
  return jsonb_build_object(
    'auditId',p_audit_id,'status',v_status,'deletedThisBatch',v_deleted,
    'deletedTotal',v_expected-v_remaining,'remaining',v_remaining,
    'pi',v_pi,'pr',v_pr,'orphanPrVersions',v_orphan_versions,
    'orphanPrBehaviorBindings',v_orphan_bindings,
    'orphanPrMatchedBasementRelations',v_orphan_matched
  );
end;
$$;

revoke all on function public.snapshot_pr_catalog_v1(uuid,text)
  from public,anon,authenticated;
revoke all on function public.clean_pr_catalog_batch_v1(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.snapshot_pr_catalog_v1(uuid,text) to service_role;
grant execute on function public.clean_pr_catalog_batch_v1(uuid,uuid,integer) to service_role;

notify pgrst,'reload schema';
