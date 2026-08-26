-- Scanner final customer product flow.
--
-- One exact EAN owns one central, account-linked provisional product. Its
-- immutable technical profile is produced by the existing PRODUCT_PROFILE_V1
-- authority. Admin canonicalization promotes the same UUID to PR, so recipe
-- snapshots and each account's private relation/price remain untouched.

select pg_advisory_xact_lock(hashtextextended('scanner-customer-added-products-v1',0));

-- CA is a lifecycle identity, not a new scientific origin. PR/PM continue to
-- use the same sequence and Mapper PI identifiers remain immutable.
create or replace function public.next_product_code()
returns text language plpgsql volatile set search_path=public as $$
declare
  v_origin text:=case
    when current_setting('app.product_article_origin',true)='PM' then 'PM'
    when current_setting('app.product_article_origin',true)='CUSTOMER_ADDED' then 'CA'
    else 'PR'
  end;
begin
  return v_origin||'-ING-'||lpad(nextval('public.products_code_seq')::text,6,'0');
end;
$$;

alter table public.products drop constraint if exists products_canonical_kind_check;
alter table public.products add constraint products_canonical_kind_check check (product_kind in (
  'commercial_product','customer_provisional','mapper_reference','internal_subproduct',
  'shop_product','franchise_product','internal_admin'
));

create table public.customer_added_products (
  id uuid primary key default gen_random_uuid(),
  normalized_ean text not null check(normalized_ean ~ '^[0-9]{8,14}$'),
  product_id uuid not null unique references public.products(id) on delete restrict,
  status text not null default 'PENDING' check(status in ('PENDING','CANONICALIZED','ARCHIVED')),
  distinct_customer_count integer not null default 0 check(distinct_customer_count>=0),
  first_seen_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  canonicalized_at timestamptz,
  canonicalized_by uuid references auth.users(id) on delete set null,
  canonical_product_id uuid references public.products(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(normalized_ean),
  check ((status='CANONICALIZED')=(canonical_product_id is not null)),
  check (canonical_product_id is null or canonical_product_id=product_id)
);
create index customer_added_products_queue_idx
  on public.customer_added_products(status,distinct_customer_count desc,last_seen_at);

create table public.customer_added_product_accounts (
  customer_added_product_id uuid not null references public.customer_added_products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  first_scan_session_id uuid references public.product_scan_sessions(id) on delete set null,
  last_scan_session_id uuid references public.product_scan_sessions(id) on delete set null,
  first_added_at timestamptz not null default statement_timestamp(),
  last_used_at timestamptz not null default statement_timestamp(),
  primary key(customer_added_product_id,user_id),
  unique(user_id,product_id)
);
create index customer_added_product_accounts_product_idx
  on public.customer_added_product_accounts(product_id,user_id);

create table public.customer_added_product_evidence (
  id uuid primary key default gen_random_uuid(),
  customer_added_product_id uuid not null references public.customer_added_products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  scan_session_id uuid not null references public.product_scan_sessions(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  scan_result jsonb not null,
  product_profile_authority jsonb not null,
  product_behavior_authority jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  unique(user_id,scan_session_id),
  check(octet_length(scan_result::text)<=500000),
  check(octet_length(product_profile_authority::text)<=500000),
  check(octet_length(product_behavior_authority::text)<=250000)
);

alter table public.customer_added_products enable row level security;
alter table public.customer_added_product_accounts enable row level security;
alter table public.customer_added_product_evidence enable row level security;

create policy customer_added_products_linked_read on public.customer_added_products
  for select to authenticated using (
    exists(select 1 from public.customer_added_product_accounts linked
      where linked.customer_added_product_id=id and linked.user_id=auth.uid())
    or public.gellatti_admin_has_permission_v1('CATALOG')
  );
create policy customer_added_product_accounts_own_read on public.customer_added_product_accounts
  for select to authenticated using (
    user_id=auth.uid() or public.gellatti_admin_has_permission_v1('CATALOG')
  );
create policy customer_added_product_evidence_own_read on public.customer_added_product_evidence
  for select to authenticated using (
    user_id=auth.uid() or public.gellatti_admin_has_permission_v1('CATALOG')
  );
grant select on public.customer_added_products,public.customer_added_product_accounts,
  public.customer_added_product_evidence to authenticated;

-- Additive RLS policies: existing shared/owned catalog behavior is unchanged.
create policy products_customer_added_linked_read on public.products
  for select to authenticated using (
    product_kind='customer_provisional' and is_active and merged_into_product_id is null
    and exists(select 1 from public.customer_added_product_accounts linked
      where linked.product_id=products.id and linked.user_id=auth.uid())
  );
create policy product_versions_customer_added_linked_read on public.product_versions
  for select to authenticated using (
    exists(select 1 from public.customer_added_product_accounts linked
      where linked.product_id=product_versions.product_id and linked.user_id=auth.uid())
  );
create policy product_behavior_customer_added_linked_read on public.product_behavior_bindings
  for select to authenticated using (
    exists(select 1 from public.customer_added_product_accounts linked
      where linked.product_id=product_behavior_bindings.product_id and linked.user_id=auth.uid())
  );
create policy product_variants_customer_added_linked_read on public.product_variants
  for select to authenticated using (
    exists(select 1 from public.customer_added_product_accounts linked
      where linked.product_id=product_variants.product_id and linked.user_id=auth.uid())
  );

create or replace function public.can_use_product_relation_v1(
  p_user_id uuid,
  p_product_id uuid
) returns boolean
language sql stable security definer
set search_path=public
as $$
  select p_user_id is not null and exists(
    select 1 from public.products p
    where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
      and (
        (p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=p_user_id or p.created_by=p_user_id
        or exists(select 1 from public.product_ingest_events e
          where e.product_id=p.id and e.actor_user_id=p_user_id)
        or exists(select 1 from public.customer_added_product_accounts linked
          where linked.product_id=p.id and linked.user_id=p_user_id)
      )
  )
$$;
revoke all on function public.can_use_product_relation_v1(uuid,uuid)
  from public,anon,authenticated;

create or replace function public.get_canonical_product_for_account_v1(
  p_product_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=public
as $$
declare v_row jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select to_jsonb(p)||jsonb_build_object(
    'owner_user_id',auth.uid(),
    'created_by',case when p.created_by=auth.uid() then p.created_by else null end,
    'supplier',r.supplier,'cost_per_kg',r.private_price,'currency',r.currency,
    'usage_notes',r.notes,'product_image_url',null,'detected_text',null,
    'extracted_json',null,'reviewed_by',null,'reviewed_at',null,
    'review_notes',null,'mapper_notes',null
  ) into v_row
  from public.products p
  left join public.user_product_relations r
    on r.product_id=p.id and r.user_id=auth.uid()
  where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
    and (
      (p.visibility='shared' and p.canonical_verification_status<>'blocked')
      or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
      or exists(select 1 from public.product_ingest_events e
        where e.product_id=p.id and e.actor_user_id=auth.uid())
      or exists(select 1 from public.customer_added_product_accounts linked
        where linked.product_id=p.id and linked.user_id=auth.uid())
    );
  return v_row;
end $$;
revoke all on function public.get_canonical_product_for_account_v1(uuid) from public,anon;
grant execute on function public.get_canonical_product_for_account_v1(uuid)
  to authenticated,service_role;

-- Persist a server-recomputed profile. This function is service-role only and
-- rebinds it to the owned, unexpired Scanner session before any write.
create or replace function public.gellatti_upsert_customer_added_product_v1(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_idempotency_key text,
  p_scan_result jsonb,
  p_product_profile jsonb,
  p_product_behavior jsonb,
  p_private_overlay jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_session public.product_scan_sessions%rowtype;
  v_ean text;
  v_identity jsonb:=coalesce(p_scan_result->'identity','{}'::jsonb);
  v_package jsonb:=coalesce(p_scan_result->'package','{}'::jsonb);
  v_name text;
  v_brand text;
  v_existing_pr record;
  v_pending public.customer_added_products%rowtype;
  v_product_id uuid;
  v_version_id uuid;
  v_binding_id uuid;
  v_facts jsonb;
  v_quantity numeric;
  v_unit text;
  v_inserted integer:=0;
  v_count integer;
  v_product_code text;
begin
  if p_actor_user_id is null then raise exception 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception 'invalid_idempotency_key';
  end if;
  select * into v_session from public.product_scan_sessions
    where id=p_session_id and user_id=p_actor_user_id for update;
  if v_session.id is null or v_session.expires_at<=statement_timestamp() then
    raise exception 'owned_scan_session_not_found';
  end if;
  if v_session.state not in ('analyzed','finalized') then raise exception 'scan_not_ready'; end if;
  if v_session.result_json is distinct from p_scan_result then
    raise exception 'scanner_result_authority_mismatch';
  end if;
  v_ean:=regexp_replace(coalesce(p_scan_result#>>'{barcodes,0,value}',v_session.barcode,''),'\D','','g');
  if v_ean !~ '^[0-9]{8,14}$' or v_ean is distinct from regexp_replace(coalesce(v_session.barcode,''),'\D','','g') then
    raise exception 'customer_product_valid_ean_required';
  end if;
  if p_product_profile#>>'{authority}'<>'PRODUCT_PROFILE_V1'
    or p_product_profile#>>'{validationMode}'<>'server_recomputed_product_profile'
    or p_product_profile#>>'{articleIdentity}'<>'PRODUCT_OWNED'
    or p_product_profile#>>'{origin}'<>'CUSTOMER_ADDED'
    or coalesce((p_product_profile->>'productAccuracy')::numeric,0)<85
    or p_product_profile#>>'{productAccuracyAssessment,roleReadiness}' not in ('BASE_READY','TOPPING_READY')
    or jsonb_typeof(p_product_profile->'technicalComposition')<>'object'
    or jsonb_typeof(p_product_profile->'fieldTruth')<>'object'
  then raise exception 'customer_product_ready_profile_required'; end if;
  if p_product_behavior#>>'{authority}'<>'PRODUCT_BEHAVIOR_V1'
    or p_product_behavior#>>'{validationMode}'<>'server_recomputed_product_behavior'
    or p_product_behavior#>>'{articleIdentity}'<>'PRODUCT_OWNED'
    or p_product_behavior#>>'{classificationOutcome}'<>'classified'
    or not (coalesce((p_product_behavior->>'baseRecipeEligible')::boolean,false)
      or coalesce((p_product_behavior->>'toppingEligible')::boolean,false))
  then raise exception 'customer_product_behavior_authority_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-added-ean:'||v_ean,0));
  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr
    from public.products p
    where p.is_active and p.merged_into_product_id is null
      and p.visibility='shared' and p.product_kind='commercial_product'
      and p.product_code like 'PR-ING-%' and p.canonical_verification_status<>'blocked'
      and (p.ean_code_normalized=v_ean or exists(select 1 from public.product_variants pv
        where pv.product_id=p.id and pv.is_current and pv.ean=v_ean))
    order by p.canonical_verification_status='verified' desc,p.created_at limit 1;
  if v_existing_pr.id is not null then
    insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)
    values(p_actor_user_id,v_existing_pr.id,true,
      nullif(p_private_overlay->>'price','')::numeric,
      nullif(upper(p_private_overlay->>'currency'),''),nullif(p_private_overlay->>'supplier',''),
      nullif(p_private_overlay->>'notes',''))
    on conflict(user_id,product_id) do update set favorite=true,
      private_price=coalesce(excluded.private_price,user_product_relations.private_price),
      currency=coalesce(excluded.currency,user_product_relations.currency),
      supplier=coalesce(excluded.supplier,user_product_relations.supplier),
      notes=coalesce(excluded.notes,user_product_relations.notes),updated_at=statement_timestamp();
    return jsonb_build_object('kind','existing_product','productId',v_existing_pr.id,
      'productCode',v_existing_pr.product_code,'displayName',v_existing_pr.product_name_display,
      'brand',v_existing_pr.brand,'customerCount',null,'pendingId',null);
  end if;

  select * into v_pending from public.customer_added_products
    where normalized_ean=v_ean and status='PENDING' for update;
  if v_pending.id is null then
    v_name:=coalesce(nullif(trim(v_identity->>'displayName'),''),nullif(trim(v_identity->>'originalName'),''));
    v_brand:=nullif(trim(v_identity->>'brand'),'');
    if v_name is null or (v_brand is null and coalesce((v_identity->>'explicitlyUnbranded')::boolean,false)=false) then
      raise exception 'customer_product_identity_required';
    end if;
    perform set_config('app.canonical_product_ingest','v1',true);
    perform set_config('app.product_article_origin','CUSTOMER_ADDED',true);
    v_facts:=p_scan_result||jsonb_build_object(
      'technicalComposition',p_product_profile->'technicalComposition',
      'productAccuracy',p_product_profile->'productAccuracy',
      'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
      'allergenEvidenceStatus',p_product_profile->>'allergenEvidenceStatus',
      'ingredientsEvidenceStatus',p_product_profile->>'ingredientsEvidenceStatus',
      'productIntelligence',jsonb_build_object(
        'version',1,'authority','PRODUCT_PROFILE_V1','articleIdentity','PRODUCT_OWNED',
        'origin','CUSTOMER_ADDED','compositionReadiness',p_product_profile->>'readiness',
        'engineUsable',p_product_profile->'engineUsable',
        'criticalReadiness',p_product_profile->'criticalReadiness',
        'missingCritical',coalesce(p_product_profile->'missingCritical','[]'::jsonb),
        'missingEngineFields',coalesce(p_product_profile->'missingEngineFields','[]'::jsonb),
        'criticalPhysicsBlockers',coalesce(p_product_profile->'criticalPhysicsBlockers','[]'::jsonb),
        'fieldTruth',p_product_profile->'fieldTruth',
        'estimatedFromMapperIds',coalesce(p_product_profile->'estimatedFromMapperIds','[]'::jsonb),
        'mapperSimilarity',p_product_profile->'mapperSimilarity',
        'mapperProfileBasis',p_product_profile->'mapperProfileBasis',
        'mapperFingerprint',p_product_profile->'mapperFingerprint',
        'legacyEvidenceAccuracy',p_product_profile->'legacyEvidenceAccuracy',
        'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
        'productProfileAuthority',p_product_profile,
        'productBehaviorAuthority',p_product_behavior
      ),
      'missingFields','[]'::jsonb,'invalidFields','[]'::jsonb
    );
    insert into public.products(
      owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,
      product_category,country,status,source_type,is_active,product_kind,visibility,
      canonical_verification_status,canonical_verification_method,canonical_provenance,
      explicitly_unbranded,canonical_family,normalized_identity,search_document
    ) values(
      null,p_actor_user_id,v_brand,v_ean,v_ean,
      coalesce(nullif(v_identity->>'originalName',''),v_name),v_name,
      nullif(v_identity->>'category',''),nullif(v_identity->>'countryOfOrigin',''),
      'manual_adjusted','label_scan',true,'customer_provisional','internal',
      'manual_unverified','manual_unverified','customer_added_scanner_v1',
      coalesce((v_identity->>'explicitlyUnbranded')::boolean,false),
      nullif(p_product_profile#>>'{recognition,ingredientFamily}','unknown'),
      'ean:'||v_ean,trim(concat_ws(' ',v_brand,v_name,v_identity->>'category',v_ean))
    ) returning id,product_code into v_product_id,v_product_code;
    insert into public.product_versions(
      product_id,version,facts,evidence_snapshot,verification_status,verification_method,
      provenance,facts_fingerprint
    ) values(
      v_product_id,1,v_facts,jsonb_build_object('scanSessionId',p_session_id),
      'manual_unverified','manual_unverified','customer_added_scanner_v1',
      encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex')
    ) returning id into v_version_id;
    update public.products set current_version_id=v_version_id where id=v_product_id;
    select public.classify_catalog_product_behavior_v2(v_version_id,'product-behavior-v2')
      into v_binding_id;
    update public.products set current_behavior_binding_id=v_binding_id where id=v_product_id;
    begin
      v_quantity:=nullif(v_package->>'netQuantity','')::numeric;
    exception when invalid_text_representation then v_quantity:=null; end;
    v_unit:=nullif(lower(v_package->>'unit'),'');
    -- Historical canonical retirement preserves immutable variant evidence and
    -- therefore may still own the global variant-EAN slot. The new central
    -- product always owns the EAN on products; add a package variant only when
    -- no historical variant already retains that exact evidence key.
    if not exists(select 1 from public.product_variants where ean=v_ean) then
      insert into public.product_variants(
        product_id,ean,net_quantity,net_unit,market,original_package_name
      ) values(v_product_id,v_ean,v_quantity,v_unit,'GLOBAL',v_name);
    end if;
    insert into public.customer_added_products(normalized_ean,product_id)
      values(v_ean,v_product_id) returning * into v_pending;
  else
    v_product_id:=v_pending.product_id;
    select current_version_id,product_code into v_version_id,v_product_code
      from public.products where id=v_product_id and is_active
        and product_kind='customer_provisional' and merged_into_product_id is null;
    if v_version_id is null then raise exception 'customer_product_pending_state_invalid'; end if;
  end if;

  insert into public.customer_added_product_accounts(
    customer_added_product_id,user_id,product_id,first_scan_session_id,last_scan_session_id
  ) values(v_pending.id,p_actor_user_id,v_product_id,p_session_id,p_session_id)
  on conflict(customer_added_product_id,user_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then
    update public.customer_added_product_accounts set last_scan_session_id=p_session_id,
      last_used_at=statement_timestamp()
      where customer_added_product_id=v_pending.id and user_id=p_actor_user_id;
  end if;
  select count(*) into v_count from public.customer_added_product_accounts
    where customer_added_product_id=v_pending.id;
  update public.customer_added_products set distinct_customer_count=v_count,
    last_seen_at=statement_timestamp(),updated_at=statement_timestamp() where id=v_pending.id;

  insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)
  values(p_actor_user_id,v_product_id,true,
    nullif(p_private_overlay->>'price','')::numeric,
    nullif(upper(p_private_overlay->>'currency'),''),nullif(p_private_overlay->>'supplier',''),
    nullif(p_private_overlay->>'notes',''))
  on conflict(user_id,product_id) do update set favorite=true,
    private_price=coalesce(excluded.private_price,user_product_relations.private_price),
    currency=coalesce(excluded.currency,user_product_relations.currency),
    supplier=coalesce(excluded.supplier,user_product_relations.supplier),
    notes=coalesce(excluded.notes,user_product_relations.notes),updated_at=statement_timestamp();

  insert into public.customer_added_product_evidence(
    customer_added_product_id,user_id,scan_session_id,product_version_id,scan_result,
    product_profile_authority,product_behavior_authority
  ) values(v_pending.id,p_actor_user_id,p_session_id,v_version_id,p_scan_result,
    p_product_profile,p_product_behavior)
  on conflict(user_id,scan_session_id) do nothing;
  update public.product_scan_sessions set state='finalized',exact_product_id=v_product_id,
    overlay_state='USABLE_FOR_OWNER',updated_at=statement_timestamp()
    where id=p_session_id and user_id=p_actor_user_id;

  select product_code into v_product_code from public.products where id=v_product_id;
  return jsonb_build_object(
    'kind','customer_added_product','productId',v_product_id,'productCode',v_product_code,
    'displayName',(select product_name_display from public.products where id=v_product_id),
    'brand',(select brand from public.products where id=v_product_id),
    'pendingId',v_pending.id,'customerCount',v_count,'engineUsable',true,
    'productAccuracy',p_product_profile->'productAccuracy'
  );
end;
$$;
revoke all on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.gellatti_upsert_customer_added_product_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb,jsonb
) to service_role;

create or replace function public.gellatti_admin_customer_added_products_v1(
  p_status text default 'PENDING',
  p_limit integer default 500
) returns jsonb
language plpgsql stable security definer
set search_path=public
as $$
declare v_result jsonb;
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG') then
    raise exception 'catalog_administrator_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'ean',c.normalized_ean,'productId',c.product_id,
    'productCode',p.product_code,'name',p.product_name_display,'brand',p.brand,
    'status',c.status,'distinctCustomerCount',c.distinct_customer_count,
    'firstSeenAt',c.first_seen_at,'lastSeenAt',c.last_seen_at,
    'productAccuracy',v.facts->'productAccuracy','profile',v.facts#>'{productIntelligence,productProfileAuthority}',
    'behavior',v.facts#>'{productIntelligence,productBehaviorAuthority}'
  ) order by c.distinct_customer_count desc,c.last_seen_at,c.id),'[]'::jsonb)
  into v_result
  from (
    select queued.*
    from public.customer_added_products queued
    join public.products queued_product on queued_product.id=queued.product_id
    where (p_status='ALL' or queued.status=p_status)
      and (p_status<>'PENDING' or (
        queued_product.is_active and queued_product.product_kind='customer_provisional'
      ))
    order by queued.distinct_customer_count desc,queued.last_seen_at,queued.id
    limit least(greatest(p_limit,1),1000)
  ) c
  join public.products p on p.id=c.product_id
  join public.product_versions v on v.id=p.current_version_id
  ;
  return v_result;
end;
$$;
revoke all on function public.gellatti_admin_customer_added_products_v1(text,integer)
  from public,anon;
grant execute on function public.gellatti_admin_customer_added_products_v1(text,integer)
  to authenticated,service_role;

-- Final promotion is exact-EAN only and preserves the product UUID. The Admin
-- profile update is performed through catalog-submit before this transition.
create or replace function public.gellatti_admin_canonicalize_customer_added_v1(
  p_customer_added_product_id uuid
) returns jsonb
language plpgsql security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  v_pending public.customer_added_products%rowtype;
  v_product public.products%rowtype;
  v_version public.product_versions%rowtype;
  v_binding public.product_behavior_bindings%rowtype;
  v_code text;
  v_new_version_id uuid;
  v_new_binding_id uuid;
  v_facts jsonb;
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG',v_admin) then
    raise exception 'catalog_administrator_required';
  end if;
  select * into v_pending from public.customer_added_products
    where id=p_customer_added_product_id for update;
  if v_pending.id is null or v_pending.status<>'PENDING' then
    raise exception 'pending_customer_product_required';
  end if;
  select * into v_product from public.products where id=v_pending.product_id for update;
  select * into v_version from public.product_versions where id=v_product.current_version_id;
  select * into v_binding from public.product_behavior_bindings
    where id=v_product.current_behavior_binding_id;
  if not v_product.is_active or v_product.product_kind<>'customer_provisional'
    or v_product.ean_code_normalized<>v_pending.normalized_ean
    or coalesce((v_version.facts->>'productAccuracy')::numeric,0)<85
    or v_binding.binding_status<>'ready'
    or not (coalesce((v_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
      or coalesce((v_binding.profile_permissions->>'TOPPING')::boolean,false))
  then raise exception 'publishable_customer_product_authority_required'; end if;
  if exists(select 1 from public.products p where p.id<>v_product.id and p.is_active
    and p.merged_into_product_id is null and p.visibility='shared'
    and p.product_kind='commercial_product' and p.ean_code_normalized=v_pending.normalized_ean)
  then raise exception 'canonical_ean_already_exists'; end if;

  perform set_config('app.canonical_product_ingest','v1',true);
  perform set_config('app.product_article_origin','PR',true);
  -- Canonical retirement is a soft delete and the shared EAN index deliberately
  -- preserves its row. Exact-EAN Admin verification supersedes only inactive
  -- historical roots so the new, already customer-linked UUID can own the one
  -- canonical PR identity without deleting history.
  update public.products set merged_into_product_id=v_product.id,
    updated_at=statement_timestamp()
    where id<>v_product.id and not is_active and merged_into_product_id is null
      and visibility='shared' and product_kind='commercial_product'
      and ean_code_normalized=v_pending.normalized_ean;
  v_code:=public.next_product_code();
  v_facts:=jsonb_set(
    jsonb_set(v_version.facts,'{productIntelligence,origin}','"PR"'::jsonb,true),
    '{productIntelligence,productProfileAuthority,origin}','"PR"'::jsonb,true
  );
  insert into public.product_versions(
    product_id,version,facts,evidence_snapshot,verification_status,
    verification_method,provenance,facts_fingerprint,supersedes
  ) values(
    v_product.id,v_version.version+1,v_facts,
    coalesce(v_version.evidence_snapshot,'{}'::jsonb)||jsonb_build_object(
      'customerAddedCanonicalization',jsonb_build_object(
        'pendingId',v_pending.id,'adminUserId',v_admin,'verifiedAt',statement_timestamp()
      )
    ),
    'verified','human','customer_added_admin_canonicalization_v1',
    encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex'),v_version.id
  ) returning id into v_new_version_id;
  update public.products set product_code=v_code,product_kind='commercial_product',
    visibility='shared',owning_account_id=null,owner_user_id=null,
    current_version_id=v_new_version_id,canonical_verification_status='verified',
    canonical_verification_method='human',
    canonical_provenance='customer_added_admin_canonicalization_v1',
    updated_at=statement_timestamp() where id=v_product.id;
  select public.classify_catalog_product_behavior_v2(
    v_new_version_id,'customer-added-admin-canonicalization-v1'
  ) into v_new_binding_id;
  update public.products set current_behavior_binding_id=v_new_binding_id,
    updated_at=statement_timestamp() where id=v_product.id;
  update public.customer_added_products set status='CANONICALIZED',
    canonical_product_id=v_product.id,canonicalized_at=statement_timestamp(),
    canonicalized_by=v_admin,updated_at=statement_timestamp() where id=v_pending.id;
  perform public.gellatti_write_audit_v1(
    'customer_added_product.canonicalize','customer_added_products',v_pending.id::text,
    jsonb_build_object('ean',v_pending.normalized_ean,'productId',v_product.id,'productCode',v_code),
    'Exact-EAN customer product canonicalization',v_pending.normalized_ean,'admin',v_admin::text
  );
  return jsonb_build_object('productId',v_product.id,'productCode',v_code,
    'pendingId',v_pending.id,'ean',v_pending.normalized_ean,'status','CANONICALIZED');
end;
$$;
revoke all on function public.gellatti_admin_canonicalize_customer_added_v1(uuid)
  from public,anon;
grant execute on function public.gellatti_admin_canonicalize_customer_added_v1(uuid)
  to authenticated;

-- The account-safe search function is security-definer, so explicitly add the
-- linked-account predicate to its commercial candidate source.
do $patch_search$
declare v_definition text; v_patched text; v_old text; v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'::regprocedure
  );
  v_patched:=v_definition;
  v_old:=$old$        or exists(select 1 from public.product_ingest_events ev
          where ev.product_id=p.id and ev.actor_user_id=auth.uid()))$old$;
  v_new:=$new$        or exists(select 1 from public.product_ingest_events ev
          where ev.product_id=p.id and ev.actor_user_id=auth.uid())
        or exists(select 1 from public.customer_added_product_accounts linked
          where linked.product_id=p.id and linked.user_id=auth.uid()))$new$;
  if strpos(v_patched,'customer_added_product_accounts linked')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'customer product search anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_search$;

comment on table public.customer_added_products is
  'One exact-EAN central customer-added product. Demand is distinct linked accounts, never scan count.';
comment on function public.gellatti_admin_canonicalize_customer_added_v1(uuid) is
  'Promotes the same customer provisional UUID to one exact-EAN PR; recipes and per-user price relations remain intact.';
