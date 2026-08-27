-- Bidirectional, contributor-only product capability reanalysis requests.
--
-- This is a review signal only. Submission cannot change a ProductBehavior
-- binding, product version, readiness, EAN identity or canonical product.
-- The exact Scanner contribution authority is customer_added_product_accounts.

select pg_advisory_xact_lock(hashtextextended('product-capability-reanalysis-v1',0));

create table public.product_capability_reanalysis_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_user_id uuid not null references auth.users(id) on delete restrict,
  canonical_product_id uuid not null references public.products(id) on delete restrict,
  customer_added_product_id uuid not null references public.customer_added_products(id) on delete restrict,
  requested_capability text not null check(requested_capability in ('INGREDIENT','TOPPING')),
  attempted_context text not null check(attempted_context in ('INGREDIENT_PICKER','TOPPING_PICKER')),
  reason_code text not null check(reason_code in (
    'USER_EXPECTS_INGREDIENT_CAPABILITY','USER_EXPECTS_TOPPING_CAPABILITY'
  )),
  current_classification text not null check(
    current_classification in ('INGREDIENT_ONLY','TOPPING_ONLY','BOTH','NEITHER')
  ),
  current_product_version_id uuid not null references public.product_versions(id) on delete restrict,
  current_behavior_binding_id uuid not null references public.product_behavior_bindings(id) on delete restrict,
  identity_snapshot jsonb not null,
  capability_snapshot jsonb not null,
  readiness_snapshot jsonb not null,
  contribution_reference jsonb not null,
  evidence_references jsonb not null default '[]'::jsonb,
  status text not null default 'OPEN' check(status in ('OPEN','IN_REVIEW','ACCEPTED','REJECTED')),
  assigned_admin_user_id uuid references auth.users(id) on delete set null,
  review_reason text,
  resolution_authority jsonb,
  submitted_at timestamptz not null default statement_timestamp(),
  review_started_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  check (
    (requested_capability='INGREDIENT' and attempted_context='INGREDIENT_PICKER')
    or (requested_capability='TOPPING' and attempted_context='TOPPING_PICKER')
  ),
  check (
    (requested_capability='INGREDIENT' and reason_code='USER_EXPECTS_INGREDIENT_CAPABILITY')
    or (requested_capability='TOPPING' and reason_code='USER_EXPECTS_TOPPING_CAPABILITY')
  ),
  check(jsonb_typeof(identity_snapshot)='object'),
  check(jsonb_typeof(capability_snapshot)='object'),
  check(jsonb_typeof(readiness_snapshot)='object'),
  check(jsonb_typeof(contribution_reference)='object'),
  check(jsonb_typeof(evidence_references)='array')
);

create unique index product_capability_reanalysis_active_uniq
  on public.product_capability_reanalysis_requests(
    requesting_user_id,canonical_product_id,requested_capability,current_classification
  ) where status in ('OPEN','IN_REVIEW');
create index product_capability_reanalysis_admin_queue_idx
  on public.product_capability_reanalysis_requests(status,submitted_at,id);

alter table public.product_capability_reanalysis_requests enable row level security;
revoke all on table public.product_capability_reanalysis_requests
  from public,anon,authenticated;

-- Internal projection of the exact current canonical capability authority.
-- A permission alone is insufficient: the current immutable product facts and
-- the exact current binding/version pointers must agree and be ready.
create or replace function public.gellatti_product_capability_authority_v1(
  p_product_id uuid
) returns jsonb
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select jsonb_build_object(
    'productId',p.id,
    'productCode',p.product_code,
    'ean',nullif(p.ean_code_normalized,''),
    'mapperIngredientId',pb.mapper_ingredient_id,
    'canonicalProvenance',p.canonical_provenance,
    'productSourceType',p.source_type,
    'productVersionId',pv.id,
    'behaviorBindingId',pb.id,
    'classification',case
      when caps.ingredient_allowed and caps.topping_allowed then 'BOTH'
      when caps.ingredient_allowed then 'INGREDIENT_ONLY'
      when caps.topping_allowed then 'TOPPING_ONLY'
      else 'NEITHER'
    end,
    'ingredientAllowed',caps.ingredient_allowed,
    'toppingAllowed',caps.topping_allowed,
    'mainEligibility',pb.main_eligibility,
    'behaviorRole',pb.behavior_role,
    'bindingStatus',pb.binding_status,
    'profilePermissions',coalesce(pb.profile_permissions,'{}'::jsonb),
    'canonicalVerificationStatus',p.canonical_verification_status,
    'productAccuracy',pv.facts->'productAccuracy',
    'roleReadiness',pv.facts#>'{productAccuracyAssessment,roleReadiness}',
    'engineUsable',pv.facts#>'{productIntelligence,engineUsable}',
    'profileAuthorityReference',jsonb_build_object(
      'productVersionId',pv.id,
      'factsFingerprint',pv.facts_fingerprint,
      'provenance',pv.provenance
    ),
    'behaviorAuthorityReference',jsonb_build_object(
      'behaviorBindingId',pb.id,
      'classifierVersion',pb.classifier_version,
      'classifiedAt',pb.classified_at
    )
  )
  from public.products p
  join public.product_versions pv
    on pv.id=p.current_version_id and pv.product_id=p.id
  join public.product_behavior_bindings pb
    on pb.id=p.current_behavior_binding_id and pb.product_id=p.id
   and pb.product_version_id=pv.id and pb.is_current
  cross join lateral (
    select
      (
        coalesce(p.status,'')<>'rejected'
        and coalesce((pv.facts#>>'{productIntelligence,engineUsable}')::boolean,false)
        and jsonb_typeof(pv.facts->'technicalComposition')='object'
        and pv.facts->'technicalComposition'<>'{}'::jsonb
        and pb.mapper_ingredient_id is null
        and coalesce((pb.profile_permissions->>'BASE_RECIPE')::boolean,false)
      ) ingredient_allowed,
      (
        p.canonical_verification_status<>'blocked'
        and coalesce((pb.profile_permissions->>'TOPPING')::boolean,false)
      ) topping_allowed
  ) caps
  where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
$$;
revoke all on function public.gellatti_product_capability_authority_v1(uuid)
  from public,anon,authenticated;

-- Customer-safe eligibility projection. It intentionally returns neither the
-- contribution row nor evidence references, even for the requesting account.
create or replace function public.gellatti_product_capability_reanalysis_eligibility_v1(
  p_product_id uuid,
  p_requested_capability text
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare
  v_user uuid:=auth.uid();
  v_authority jsonb;
  v_has_contribution boolean:=false;
  v_existing_status text;
  v_mismatch boolean:=false;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_requested_capability is null
    or p_requested_capability not in ('INGREDIENT','TOPPING') then
    raise exception 'valid_requested_capability_required';
  end if;

  select public.gellatti_product_capability_authority_v1(p_product_id)
    into v_authority;
  if v_authority is null or not exists(
    select 1 from public.products p
    where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
      and (
        p.visibility='shared'
        or exists(
          select 1
          from public.customer_added_product_accounts linked
          join public.customer_added_products contribution
            on contribution.id=linked.customer_added_product_id
           and contribution.product_id=p.id
          where linked.user_id=v_user and linked.product_id=p.id
        )
      )
  ) then
    return jsonb_build_object(
      'eligible',false,'existingRequestStatus',null,'currentClassification',null
    );
  end if;

  select exists(
    select 1
    from public.customer_added_product_accounts linked
    join public.customer_added_products contribution
      on contribution.id=linked.customer_added_product_id
     and contribution.product_id=p_product_id
     and (
       contribution.status='PENDING'
       or (contribution.status='CANONICALIZED' and contribution.canonical_product_id=p_product_id)
     )
    where linked.user_id=v_user and linked.product_id=p_product_id
  ) into v_has_contribution;

  v_mismatch:=case p_requested_capability
    when 'INGREDIENT' then
      coalesce((v_authority->>'toppingAllowed')::boolean,false)
      and not coalesce((v_authority->>'ingredientAllowed')::boolean,false)
    when 'TOPPING' then
      coalesce((v_authority->>'ingredientAllowed')::boolean,false)
      and not coalesce((v_authority->>'toppingAllowed')::boolean,false)
  end;

  select r.status into v_existing_status
  from public.product_capability_reanalysis_requests r
  where r.requesting_user_id=v_user
    and r.canonical_product_id=p_product_id
    and r.requested_capability=p_requested_capability
    and r.current_classification=v_authority->>'classification'
    and r.status in ('OPEN','IN_REVIEW')
  order by r.submitted_at,r.id
  limit 1;

  return jsonb_build_object(
    'eligible',v_has_contribution and v_mismatch and v_existing_status is null,
    'existingRequestStatus',v_existing_status,
    'currentClassification',v_authority->>'classification'
  );
end;
$$;
revoke all on function public.gellatti_product_capability_reanalysis_eligibility_v1(uuid,text)
  from public,anon;
grant execute on function public.gellatti_product_capability_reanalysis_eligibility_v1(uuid,text)
  to authenticated;

-- One-click authenticated submission. Every payload field is rebuilt from the
-- current server authority and the caller's own contribution/evidence rows.
create or replace function public.gellatti_request_product_capability_reanalysis_v1(
  p_product_id uuid,
  p_requested_capability text,
  p_attempted_context text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_user uuid:=auth.uid();
  v_authority jsonb;
  v_contribution public.customer_added_product_accounts%rowtype;
  v_customer_product public.customer_added_products%rowtype;
  v_request_id uuid;
  v_status text;
  v_mismatch boolean:=false;
  v_evidence_references jsonb:='[]'::jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_requested_capability is null
    or p_requested_capability not in ('INGREDIENT','TOPPING') then
    raise exception 'valid_requested_capability_required';
  end if;
  if p_attempted_context is null
    or (p_requested_capability='INGREDIENT' and p_attempted_context<>'INGREDIENT_PICKER')
    or (p_requested_capability='TOPPING' and p_attempted_context<>'TOPPING_PICKER') then
    raise exception 'requested_capability_context_mismatch';
  end if;

  -- Fail closed on exact caller attribution before touching the requested
  -- product. A non-contributor receives one generic error and cannot use this
  -- SECURITY DEFINER endpoint as a private UUID/readiness oracle.
  select linked.*
    into v_contribution
  from public.customer_added_product_accounts linked
  join public.customer_added_products contribution
    on contribution.id=linked.customer_added_product_id
   and contribution.product_id=p_product_id
   and (
     contribution.status='PENDING'
     or (contribution.status='CANONICALIZED' and contribution.canonical_product_id=p_product_id)
   )
  where linked.user_id=v_user and linked.product_id=p_product_id
  limit 1;
  if v_contribution.user_id is null then
    raise exception 'exact_product_contributor_required';
  end if;
  select * into v_customer_product
  from public.customer_added_products
  where id=v_contribution.customer_added_product_id;

  perform 1 from public.products p
    where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
    for share;
  if not found then raise exception 'current_canonical_product_required'; end if;

  select public.gellatti_product_capability_authority_v1(p_product_id)
    into v_authority;
  if v_authority is null then raise exception 'current_capability_authority_required'; end if;

  v_mismatch:=case p_requested_capability
    when 'INGREDIENT' then
      coalesce((v_authority->>'toppingAllowed')::boolean,false)
      and not coalesce((v_authority->>'ingredientAllowed')::boolean,false)
    when 'TOPPING' then
      coalesce((v_authority->>'ingredientAllowed')::boolean,false)
      and not coalesce((v_authority->>'toppingAllowed')::boolean,false)
  end;
  if not v_mismatch then raise exception 'requested_capability_not_missing'; end if;

  -- Serialize repeat clicks on the exact active-uniqueness key, then lock an
  -- existing request so an Admin transition cannot race the duplicate reply.
  perform pg_advisory_xact_lock(hashtextextended(
    'product-capability-reanalysis:'||v_user::text||':'||p_product_id::text||':'||
      p_requested_capability||':'||(v_authority->>'classification'),0
  ));
  select r.id,r.status into v_request_id,v_status
  from public.product_capability_reanalysis_requests r
  where r.requesting_user_id=v_user
    and r.canonical_product_id=p_product_id
    and r.requested_capability=p_requested_capability
    and r.current_classification=v_authority->>'classification'
    and r.status in ('OPEN','IN_REVIEW')
  order by r.submitted_at,r.id
  limit 1
  for update;
  if v_request_id is not null then
    return jsonb_build_object(
      'requestId',v_request_id,'status',v_status,'alreadyExists',true
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'customerAddedEvidenceId',e.id,
    'scanSessionId',e.scan_session_id,
    'productVersionId',e.product_version_id,
    'createdAt',e.created_at
  ) order by e.created_at,e.id),'[]'::jsonb)
  into v_evidence_references
  from public.customer_added_product_evidence e
  where e.customer_added_product_id=v_customer_product.id
    and e.user_id=v_user;

  insert into public.product_capability_reanalysis_requests(
    requesting_user_id,canonical_product_id,customer_added_product_id,
    requested_capability,attempted_context,reason_code,current_classification,
    current_product_version_id,current_behavior_binding_id,
    identity_snapshot,capability_snapshot,readiness_snapshot,
    contribution_reference,evidence_references
  ) values(
    v_user,p_product_id,v_customer_product.id,
    p_requested_capability,p_attempted_context,
    case p_requested_capability
      when 'INGREDIENT' then 'USER_EXPECTS_INGREDIENT_CAPABILITY'
      else 'USER_EXPECTS_TOPPING_CAPABILITY'
    end,
    v_authority->>'classification',
    (v_authority->>'productVersionId')::uuid,(v_authority->>'behaviorBindingId')::uuid,
    jsonb_build_object(
      'canonicalProductUuid',p_product_id,
      'productId',v_authority->>'productCode',
      'mapperIngredientId',v_authority->>'mapperIngredientId',
      'ean',v_authority->>'ean',
      'canonicalProvenance',v_authority->>'canonicalProvenance',
      'productSourceType',v_authority->>'productSourceType'
    ),
    jsonb_build_object(
      'classification',v_authority->>'classification',
      'ingredientAllowed',(v_authority->>'ingredientAllowed')::boolean,
      'toppingAllowed',(v_authority->>'toppingAllowed')::boolean,
      'mainEligibility',v_authority->>'mainEligibility',
      'behaviorRole',v_authority->>'behaviorRole',
      'profilePermissions',v_authority->'profilePermissions'
    ),
    jsonb_build_object(
      'bindingStatus',v_authority->>'bindingStatus',
      'canonicalVerificationStatus',v_authority->>'canonicalVerificationStatus',
      'productAccuracy',v_authority->'productAccuracy',
      'roleReadiness',v_authority->'roleReadiness',
      'engineUsable',v_authority->'engineUsable',
      'profileAuthorityReference',v_authority->'profileAuthorityReference',
      'behaviorAuthorityReference',v_authority->'behaviorAuthorityReference'
    ),
    jsonb_build_object(
      'customerAddedProductId',v_customer_product.id,
      'firstScanSessionId',v_contribution.first_scan_session_id,
      'lastScanSessionId',v_contribution.last_scan_session_id,
      'firstAddedAt',v_contribution.first_added_at
    ),
    v_evidence_references
  )
  on conflict (
    requesting_user_id,canonical_product_id,requested_capability,current_classification
  ) where status in ('OPEN','IN_REVIEW') do nothing
  returning id,status into v_request_id,v_status;

  if v_request_id is null then
    select r.id,r.status into v_request_id,v_status
    from public.product_capability_reanalysis_requests r
    where r.requesting_user_id=v_user
      and r.canonical_product_id=p_product_id
      and r.requested_capability=p_requested_capability
      and r.current_classification=v_authority->>'classification'
      and r.status in ('OPEN','IN_REVIEW')
    order by r.submitted_at,r.id
    limit 1;
    return jsonb_build_object(
      'requestId',v_request_id,'status',v_status,'alreadyExists',true
    );
  end if;

  return jsonb_build_object(
    'requestId',v_request_id,'status',v_status,'alreadyExists',false
  );
end;
$$;
revoke all on function public.gellatti_request_product_capability_reanalysis_v1(uuid,text,text)
  from public,anon;
grant execute on function public.gellatti_request_product_capability_reanalysis_v1(uuid,text,text)
  to authenticated;

-- CATALOG-admin-only queue. Evidence is represented by bounded references;
-- the customer evidence table remains protected by its existing Admin RLS.
create or replace function public.gellatti_admin_product_capability_reanalysis_v1(
  p_status text default 'OPEN',
  p_limit integer default 500
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG') then
    raise exception 'catalog_administrator_required';
  end if;
  if p_status is null
    or p_status not in ('ALL','OPEN','IN_REVIEW','ACCEPTED','REJECTED') then
    raise exception 'valid_reanalysis_status_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,
      'status',r.status,
      'requestingUserId',r.requesting_user_id,
      'canonicalProductId',r.canonical_product_id,
      'productCode',p.product_code,
      'productName',p.product_name_display,
      'brand',p.brand,
      'ean',nullif(p.ean_code_normalized,''),
      'requestedCapability',r.requested_capability,
      'attemptedContext',r.attempted_context,
      'reasonCode',r.reason_code,
      'currentClassification',r.current_classification,
      'identitySnapshot',r.identity_snapshot,
      'capabilitySnapshot',r.capability_snapshot,
      'readinessSnapshot',r.readiness_snapshot,
      'contributionReference',r.contribution_reference,
      'evidenceReferences',r.evidence_references,
      'currentAuthority',public.gellatti_product_capability_authority_v1(r.canonical_product_id),
      'assignedAdminUserId',r.assigned_admin_user_id,
      'reviewReason',r.review_reason,
      'resolutionAuthority',r.resolution_authority,
      'submittedAt',r.submitted_at,
      'reviewStartedAt',r.review_started_at,
      'resolvedAt',r.resolved_at,
      'updatedAt',r.updated_at
    ) order by r.submitted_at,r.id)
    from (
      select queued.*
      from public.product_capability_reanalysis_requests queued
      where p_status='ALL' or queued.status=p_status
      order by queued.submitted_at,queued.id
      limit least(greatest(coalesce(p_limit,500),1),1000)
    ) r
    join public.products p on p.id=r.canonical_product_id
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_product_capability_reanalysis_v1(text,integer)
  from public,anon;
grant execute on function public.gellatti_admin_product_capability_reanalysis_v1(text,integer)
  to authenticated;

-- ACCEPT is a verification of an already-published canonical capability. This
-- function never changes the product: the existing canonical classification
-- workflow must publish the new version/binding first.
create or replace function public.gellatti_admin_product_capability_reanalysis_action_v1(
  p_request_id uuid,
  p_action text,
  p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_admin uuid:=auth.uid();
  v_request public.product_capability_reanalysis_requests%rowtype;
  v_authority jsonb;
  v_reason text:=nullif(trim(p_reason),'');
  v_now timestamptz:=statement_timestamp();
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG',v_admin) then
    raise exception 'catalog_administrator_required';
  end if;
  select * into v_request
  from public.product_capability_reanalysis_requests
  where id=p_request_id for update;
  if v_request.id is null then raise exception 'reanalysis_request_not_found'; end if;
  if v_request.status in ('ACCEPTED','REJECTED') then
    raise exception 'reanalysis_request_already_terminal';
  end if;

  if p_action='START_REVIEW' then
    if v_request.status<>'OPEN' then raise exception 'open_reanalysis_request_required'; end if;
    update public.product_capability_reanalysis_requests
      set status='IN_REVIEW',assigned_admin_user_id=v_admin,
        review_started_at=coalesce(review_started_at,v_now),updated_at=v_now
      where id=p_request_id;
  elsif p_action='REJECT' then
    if v_reason is null then raise exception 'rejection_reason_required'; end if;
    update public.product_capability_reanalysis_requests
      set status='REJECTED',assigned_admin_user_id=v_admin,review_reason=v_reason,
        resolved_at=v_now,updated_at=v_now
      where id=p_request_id;
  elsif p_action='ACCEPT' then
    if v_reason is null then raise exception 'acceptance_reason_required'; end if;
    perform 1 from public.products p
      where p.id=v_request.canonical_product_id and p.is_active
        and p.merged_into_product_id is null
      for share;
    if not found then raise exception 'current_canonical_product_required'; end if;
    select public.gellatti_product_capability_authority_v1(v_request.canonical_product_id)
      into v_authority;
    if v_authority is null then raise exception 'current_capability_authority_required'; end if;
    if (v_request.requested_capability='INGREDIENT'
        and not coalesce((v_authority->>'ingredientAllowed')::boolean,false))
      or (v_request.requested_capability='TOPPING'
        and not coalesce((v_authority->>'toppingAllowed')::boolean,false)) then
      raise exception 'requested_capability_not_canonically_enabled';
    end if;
    update public.product_capability_reanalysis_requests
      set status='ACCEPTED',assigned_admin_user_id=v_admin,review_reason=v_reason,
        resolution_authority=v_authority,resolved_at=v_now,updated_at=v_now
      where id=p_request_id;
  else
    raise exception 'unsupported_reanalysis_action';
  end if;

  perform public.gellatti_write_audit_v1(
    'product_capability_reanalysis.'||lower(p_action),
    'product_capability_reanalysis_requests',p_request_id::text,
    jsonb_build_object(
      'beforeStatus',v_request.status,
      'requestedCapability',v_request.requested_capability,
      'canonicalProductId',v_request.canonical_product_id
    ),v_reason,p_request_id::text,'admin',v_admin::text
  );
  return jsonb_build_object('requestId',p_request_id,'action',p_action,'ok',true);
end;
$$;
revoke all on function public.gellatti_admin_product_capability_reanalysis_action_v1(uuid,text,text)
  from public,anon;
grant execute on function public.gellatti_admin_product_capability_reanalysis_action_v1(uuid,text,text)
  to authenticated;

comment on table public.product_capability_reanalysis_requests is
  'One shared review queue for contributor requests to add INGREDIENT or TOPPING capability; submission never mutates canonical authority.';
