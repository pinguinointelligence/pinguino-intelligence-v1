-- ============================================================================
-- Gellatti Admin operational actions
-- Catalog/country lifecycle, support actions, moderation and invitation state.
-- This migration does not write Mapper, Engine science or Poland import rows.
-- ============================================================================

-- Private evidence stays private, but authorized catalog administrators may
-- request short-lived signed URLs through the admin-control Edge Function.
drop policy if exists product_request_evidence_read_admin on storage.objects;
create policy product_request_evidence_read_admin on storage.objects
  for select to authenticated using (
    bucket_id='product-request-evidence'
    and public.gellatti_admin_has_permission_v1('CATALOG')
  );

-- A durable authority row for complimentary access. Entitlements reference
-- this identity; revocation preserves both rows and their audit trail.
create table if not exists public.admin_complimentary_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope in ('home','pro')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','EXPIRED')),
  reason text not null check (length(trim(reason)) between 3 and 500),
  granted_by_admin_user_id uuid not null references auth.users(id) on delete restrict,
  revoked_by_admin_user_id uuid references auth.users(id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create unique index if not exists admin_complimentary_grants_active_uniq
  on public.admin_complimentary_grants(user_id,scope) where status='ACTIVE';
alter table public.admin_complimentary_grants enable row level security;
drop trigger if exists admin_complimentary_grants_touch on public.admin_complimentary_grants;
create trigger admin_complimentary_grants_touch before update on public.admin_complimentary_grants
  for each row execute function public.touch_updated_at();

-- Operational notes are append-only and never exposed to the Partner.
create table if not exists public.partner_admin_notes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.partner_admin_notes enable row level security;

-- ---------------------------------------------------------------------------
-- Catalog read model. It exposes canonical identity/version/behavior and never
-- exposes a Mapper mutation path.
-- ---------------------------------------------------------------------------
create or replace function public.gellatti_admin_catalog_v1(
  p_query text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG') then
    raise exception 'catalog_administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(row_data order by row_data->>'updatedAt' desc)
    from (
      select jsonb_build_object(
        'id',p.id,
        'articleId',coalesce(p.product_code,p.id::text),
        'origin',case
          when p.normalized_identity like 'mapper:%' then 'PI'
          when coalesce(p.product_code,'') like 'PR-ING-%' then 'PR'
          when coalesce(p.product_code,'') like 'PM-ING-%' then 'LEGACY_PM'
          else upper(coalesce(p.product_kind,'PRODUCT')) end,
        'name',coalesce(p.product_name_display,p.product_name_internal),
        'brand',p.brand,
        'ean',nullif(p.ean_code_normalized,''),
        'productKind',p.product_kind,
        'visibility',p.visibility,
        'active',p.is_active,
        'verificationStatus',p.canonical_verification_status,
        'countryOfOrigin',p.country,
        'mergedIntoProductId',p.merged_into_product_id,
        'currentVersion',case when pv.id is null then null else jsonb_build_object(
          'id',pv.id,'version',pv.version,'verificationStatus',pv.verification_status,
          'verificationMethod',pv.verification_method,'provenance',pv.provenance,
          'facts',pv.facts,'evidence',pv.evidence_snapshot,'effectiveAt',pv.effective_at
        ) end,
        'behavior',case when pb.id is null then null else jsonb_build_object(
          'id',pb.id,'familyId',pb.family_id,'subfamilyId',pb.subfamily_id,
          'formId',pb.form_id,'mainEligibility',pb.main_eligibility,
          'bindingStatus',pb.binding_status,'warnings',pb.warnings,
          'blockReasons',pb.block_reasons,'permissions',pb.profile_permissions
        ) end,
        'variants',coalesce((select jsonb_agg(jsonb_build_object(
          'id',v.id,'ean',v.ean,'quantity',v.net_quantity,'unit',v.net_unit,
          'markets',coalesce((select jsonb_agg(vm.market order by vm.market)
            from public.product_variant_markets vm where vm.variant_id=v.id),'[]'::jsonb)
        ) order by v.created_at) from public.product_variants v
          where v.product_id=p.id and v.is_current),'[]'::jsonb),
        'contributorRequests',coalesce((select jsonb_agg(jsonb_build_object(
          'requestId',c.request_id,'userId',c.user_id,'createdAt',c.created_at
        )) from public.user_contributed_products c where c.product_id=p.id),'[]'::jsonb),
        'updatedAt',p.updated_at
      ) row_data
      from public.products p
      left join public.product_versions pv on pv.id=p.current_version_id
      left join public.product_behavior_bindings pb on pb.id=p.current_behavior_binding_id
      where p.product_kind in ('commercial_product','mapper_reference')
        and (
          nullif(trim(p_query),'') is null
          or p.search_document ilike '%'||trim(p_query)||'%'
          or p.id::text=trim(p_query)
          or coalesce(p.product_code,'') ilike '%'||trim(p_query)||'%'
          or coalesce(p.ean_code_normalized,'')=regexp_replace(trim(p_query),'[^0-9]','','g')
        )
      order by p.updated_at desc
      limit least(greatest(p_limit,1),500)
    ) q
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_catalog_v1(text,integer) from public,anon;
grant execute on function public.gellatti_admin_catalog_v1(text,integer) to authenticated;

create or replace function public.gellatti_admin_country_overview_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG') then
    raise exception 'catalog_administrator_required';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'code',c.code,'name',c.name_pl,'active',c.is_active,
    'totalApprovedProducts',coalesce(x.total_approved,0),
    'pendingRequests',coalesce(r.pending_requests,0),
    'reviewQueue',coalesce(r.review_queue,0),
    'toppingOnly',coalesce(x.topping_only,0),
    'baseReady',coalesce(x.base_ready,0),
    'lastUpdated',greatest(c.updated_at,x.last_updated,r.last_updated)
  ) order by c.sort_order,c.code)
  from public.catalog_market_countries c
  left join lateral (
    select count(distinct p.id) filter(where p.is_active and p.canonical_verification_status='verified') total_approved,
      count(distinct p.id) filter(where pb.main_eligibility='TOPPING_ONLY') topping_only,
      count(distinct p.id) filter(where pb.binding_status='ready' and pb.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')) base_ready,
      max(greatest(p.updated_at,vm.last_seen_at)) last_updated
    from public.product_variant_markets vm
    join public.product_variants v on v.id=vm.variant_id and v.is_current
    join public.products p on p.id=v.product_id and p.merged_into_product_id is null
    left join public.product_behavior_bindings pb on pb.id=p.current_behavior_binding_id
    where vm.market=c.code
  ) x on true
  left join lateral (
    select count(*) filter(where pr.status in ('SUBMITTED','RESUBMITTED')) pending_requests,
      count(*) filter(where pr.status='ADMIN_REVIEW') review_queue,
      max(pr.updated_at) last_updated
    from public.product_add_requests pr where pr.market_country_code=c.code
  ) r on true),'[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_country_overview_v1() from public,anon;
grant execute on function public.gellatti_admin_country_overview_v1() to authenticated;

create or replace function public.gellatti_admin_catalog_action_v1(
  p_product_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin uuid:=auth.uid(); v_product public.products%rowtype; v_variant uuid;
  v_market text:=upper(trim(p_payload->>'market')); v_reason text:=trim(p_payload->>'reason');
  v_target uuid; v_before jsonb;
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG',v_admin) then
    raise exception 'catalog_administrator_required';
  end if;
  if nullif(v_reason,'') is null then raise exception 'reason_required'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if v_product.id is null then raise exception 'product_not_found'; end if;
  if v_product.product_kind='mapper_reference' or v_product.normalized_identity like 'mapper:%' then
    raise exception 'mapper_reference_is_read_only';
  end if;
  v_before:=jsonb_build_object('active',v_product.is_active,'mergedInto',v_product.merged_into_product_id,
    'status',v_product.status,'verificationStatus',v_product.canonical_verification_status);
  if p_action in ('ADD_MARKET','REMOVE_MARKET') then
    if v_market !~ '^[A-Z]{2}$' or not exists(select 1 from public.catalog_market_countries c where c.code=v_market) then
      raise exception 'valid_market_required';
    end if;
    v_variant:=nullif(p_payload->>'variantId','')::uuid;
    if v_variant is null then
      select id into v_variant from public.product_variants
        where product_id=p_product_id and is_current order by created_at desc limit 1;
    end if;
    if not exists(select 1 from public.product_variants where id=v_variant and product_id=p_product_id) then
      raise exception 'product_variant_not_found';
    end if;
    if p_action='ADD_MARKET' then
      insert into public.product_variant_markets(variant_id,market,package_language)
        values(v_variant,v_market,nullif(p_payload->>'packageLanguage',''))
        on conflict(variant_id,market) do update set last_seen_at=statement_timestamp(),
          package_language=coalesce(excluded.package_language,public.product_variant_markets.package_language);
    else
      delete from public.product_variant_markets where variant_id=v_variant and market=v_market;
    end if;
  elsif p_action='PUBLISH' then
    if v_product.canonical_verification_status<>'verified' or v_product.current_version_id is null
      or v_product.current_behavior_binding_id is null
      or not exists(select 1 from public.product_behavior_bindings b
        where b.id=v_product.current_behavior_binding_id and b.binding_status='ready') then
      raise exception 'verified_ready_product_required';
    end if;
    update public.products set is_active=true,status='pi_verified',updated_at=statement_timestamp()
      where id=p_product_id;
  elsif p_action='UNPUBLISH' then
    update public.products set is_active=false,updated_at=statement_timestamp()
      where id=p_product_id;
  elsif p_action='RETIRE' then
    perform public.ingest_product_v1(
      v_admin,'admin','admin-retire:'||p_product_id||':'||gen_random_uuid(),
      jsonb_build_object(
        'operation','retire','productId',p_product_id,'productKind',v_product.product_kind,
        'displayName',coalesce(v_product.product_name_display,v_product.product_name_internal),
        'brand',v_product.brand,'explicitlyUnbranded',v_product.explicitly_unbranded
      ),
      jsonb_build_object('reason',v_reason,'authority','GELLATTI_ADMIN_CATALOG_V1'),
      '{}'::jsonb,'{}'::jsonb
    );
  elsif p_action='MERGE_DUPLICATE' then
    v_target:=nullif(p_payload->>'targetProductId','')::uuid;
    if v_target is null or v_target=p_product_id
      or not exists(select 1 from public.products t where t.id=v_target and t.is_active
        and t.merged_into_product_id is null and t.product_kind='commercial_product') then
      raise exception 'valid_merge_target_required';
    end if;
    update public.products set merged_into_product_id=v_target,is_active=false,
      updated_at=statement_timestamp() where id=p_product_id;
  else
    raise exception 'unsupported_catalog_action';
  end if;
  perform public.gellatti_write_audit_v1(
    'catalog.'||lower(p_action),'products',p_product_id::text,
    jsonb_build_object('before',v_before,'payload',p_payload),v_reason,
    coalesce(v_target::text,p_product_id::text),'admin',v_admin::text
  );
  return jsonb_build_object('ok',true,'productId',p_product_id,'action',p_action);
end;
$$;
revoke all on function public.gellatti_admin_catalog_action_v1(uuid,text,jsonb) from public,anon;
grant execute on function public.gellatti_admin_catalog_action_v1(uuid,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Support and moderation actions.
-- ---------------------------------------------------------------------------
create or replace function public.gellatti_admin_user_action_v1(
  p_user_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin uuid:=auth.uid(); v_reason text:=trim(p_payload->>'reason');
  v_scope text:=lower(trim(p_payload->>'scope')); v_grant uuid; v_ends timestamptz;
begin
  if not public.gellatti_admin_has_permission_v1('SUPPORT',v_admin) then
    raise exception 'support_administrator_required';
  end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_not_found'; end if;
  if nullif(v_reason,'') is null then raise exception 'reason_required'; end if;
  if p_action in ('SUSPEND','REACTIVATE') then
    insert into public.account_states(user_id,state,reason,changed_by)
      values(p_user_id,case when p_action='SUSPEND' then 'suspended' else 'restored' end,v_reason,v_admin);
    insert into public.account_security_events(actor_type,actor_id,affected_user_id,event_type,reason,correlation_key)
      values('admin',v_admin,p_user_id,lower(p_action),v_reason,
        'admin-user-action:'||p_action||':'||p_user_id||':'||gen_random_uuid());
  elsif p_action='GRANT_COMPLIMENTARY' then
    if v_scope not in ('home','pro') then raise exception 'valid_scope_required'; end if;
    v_ends:=nullif(p_payload->>'endsAt','')::timestamptz;
    if v_ends is not null and v_ends<=statement_timestamp() then raise exception 'future_end_required'; end if;
    insert into public.admin_complimentary_grants(
      user_id,scope,reason,granted_by_admin_user_id,ends_at
    ) values(p_user_id,v_scope,v_reason,v_admin,v_ends) returning id into v_grant;
    insert into public.entitlements(user_id,scope,source_type,source_id,ends_at,granted_by,metadata)
      values(p_user_id,v_scope,'admin_grant',v_grant,v_ends,v_admin::text,
        jsonb_build_object('complimentaryGrantId',v_grant,'reason',v_reason));
  elsif p_action='REVOKE_COMPLIMENTARY' then
    v_grant:=nullif(p_payload->>'grantId','')::uuid;
    update public.admin_complimentary_grants set status='REVOKED',revoked_at=statement_timestamp(),
      revoked_by_admin_user_id=v_admin where id=v_grant and user_id=p_user_id and status='ACTIVE';
    if not found then raise exception 'active_complimentary_grant_not_found'; end if;
    update public.entitlements set status='revoked',revoked_by=v_admin::text,revoke_reason=v_reason
      where user_id=p_user_id and source_type='admin_grant' and source_id=v_grant and status='active';
  else
    raise exception 'unsupported_user_action';
  end if;
  perform public.gellatti_write_audit_v1('user.'||lower(p_action),'auth.users',p_user_id::text,
    p_payload,v_reason,p_user_id::text,'admin',v_admin::text);
  return jsonb_build_object('ok',true,'action',p_action,'grantId',v_grant);
end;
$$;
revoke all on function public.gellatti_admin_user_action_v1(uuid,text,jsonb) from public,anon;
grant execute on function public.gellatti_admin_user_action_v1(uuid,text,jsonb) to authenticated;

create or replace function public.gellatti_admin_community_action_v1(
  p_report_id uuid,
  p_action text,
  p_reason text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_report public.community_reports%rowtype; v_before text;
begin
  if not public.gellatti_admin_has_permission_v1('CONTENT',v_admin) then
    raise exception 'content_moderator_required';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_report from public.community_reports where id=p_report_id for update;
  if v_report.id is null then raise exception 'community_report_not_found'; end if;
  v_before:=v_report.status;
  if p_action='START_REVIEW' then
    update public.community_reports set status='reviewing' where id=p_report_id;
  elsif p_action='DISMISS' then
    update public.community_reports set status='dismissed' where id=p_report_id;
  elsif p_action='HIDE_PUBLICATION' then
    if v_report.publication_id is null then raise exception 'publication_report_required'; end if;
    update public.community_publications set status='hidden_by_moderation',ranking_eligible=false,
      unpublished_at=statement_timestamp() where id=v_report.publication_id;
    update public.community_reports set status='actioned' where id=p_report_id;
  elsif p_action='RESTORE_PUBLICATION' then
    if v_report.publication_id is null then raise exception 'publication_report_required'; end if;
    update public.community_publications set status='published',ranking_eligible=true,
      unpublished_at=null where id=v_report.publication_id;
    update public.community_reports set status='actioned' where id=p_report_id;
  else raise exception 'unsupported_community_action'; end if;
  perform public.gellatti_write_audit_v1('community.'||lower(p_action),'community_reports',p_report_id::text,
    jsonb_build_object('beforeStatus',v_before,'publicationId',v_report.publication_id),
    p_reason,coalesce(v_report.publication_id::text,p_report_id::text),'admin',v_admin::text);
end;
$$;
revoke all on function public.gellatti_admin_community_action_v1(uuid,text,text) from public,anon;
grant execute on function public.gellatti_admin_community_action_v1(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitation authorities. Plain tokens/codes never enter the database.
-- ---------------------------------------------------------------------------
insert into public.invite_code_slots(slot_number)
select generate_series(1,5) on conflict(slot_number) do nothing;

create or replace function public.gellatti_admin_create_partner_invitation_v1(
  p_email text,
  p_display_name text,
  p_slug text,
  p_token_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_id uuid; v_email text:=lower(trim(p_email)); v_slug text:=lower(trim(p_slug)); v_user uuid;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then raise exception 'partner_administrator_required'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'valid_email_required'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' or v_slug in (
    'admin','api','login','logout','home','pro','partner','products','recipes','settings','account','auth','pricing','community','gellatti','pinguino'
  ) then raise exception 'invalid_partner_slug'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'valid_token_hash_required'; end if;
  if p_expires_at<=statement_timestamp() then raise exception 'future_expiry_required'; end if;
  update public.partner_invitations set status='REVOKED'
    where lower(email)=v_email and status='PENDING';
  insert into public.partner_invitations(
    email,token_hash,display_name,proposed_slug,invited_by_admin_user_id,expires_at
  ) values(v_email,p_token_hash,trim(p_display_name),v_slug,v_admin,p_expires_at) returning id into v_id;
  select id into v_user from auth.users where lower(email)=v_email limit 1;
  if v_user is not null then
    insert into public.user_notifications(
      recipient_user_id,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
    ) values(v_user,'PARTNER_INVITATION','partner_invitations',v_id::text,
      'Zaproszenie do trybu Partner','Admin zaprosił Cię do programu Partner. Zaproszenie aktywuje się przy następnym bezpiecznym odczycie konta.',
      '/partner','partner-invitation:'||v_id) on conflict(dedupe_key) do nothing;
  end if;
  perform public.gellatti_write_audit_v1('partner.invite','partner_invitations',v_id::text,
    jsonb_build_object('email',v_email,'slug',v_slug,'expiresAt',p_expires_at),
    'Admin Partner invitation',v_id::text,'admin',v_admin::text);
  return v_id;
end;
$$;
revoke all on function public.gellatti_admin_create_partner_invitation_v1(text,text,text,text,timestamptz) from public,anon;
grant execute on function public.gellatti_admin_create_partner_invitation_v1(text,text,text,text,timestamptz) to authenticated;

create or replace function public.gellatti_accept_my_partner_invitation_v1()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_email text; v_inv public.partner_invitations%rowtype; v_partner uuid; v_application uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_inv from public.partner_invitations where lower(email)=v_email
    and status='PENDING' and expires_at>statement_timestamp() order by created_at desc limit 1 for update;
  if v_inv.id is null then return jsonb_build_object('accepted',false); end if;
  select id into v_partner from public.partners where user_id=v_user;
  if v_partner is null then
    insert into public.partner_applications(user_id,status,application_data,submitted_at,reviewed_at,reviewed_by,decision_reason)
      values(v_user,'approved',jsonb_build_object('partnerInvitationId',v_inv.id),statement_timestamp(),statement_timestamp(),
        v_inv.invited_by_admin_user_id::text,'Admin invitation accepted') returning id into v_application;
    insert into public.partners(user_id,application_id,status)
      values(v_user,v_application,'active') returning id into v_partner;
  else
    update public.partners set status='active' where id=v_partner;
  end if;
  insert into public.partner_public_profiles(partner_id,slug,display_name,updated_by_user_id)
    values(v_partner,v_inv.proposed_slug,v_inv.display_name,v_user)
    on conflict(partner_id) do update set display_name=excluded.display_name,
      slug=excluded.slug,moderation_status='APPROVED',updated_by_user_id=v_user;
  insert into public.entitlements(user_id,scope,source_type,source_id,granted_by,metadata)
    select v_user,s.scope,'approved_partner',v_partner,v_inv.invited_by_admin_user_id::text,
      jsonb_build_object('partnerInvitationId',v_inv.id)
    from (values('home'),('pro'),('partner')) s(scope) on conflict do nothing;
  update public.partner_invitations set status='ACCEPTED',accepted_by_user_id=v_user,
    partner_id=v_partner,accepted_at=statement_timestamp() where id=v_inv.id;
  insert into public.user_notifications(recipient_user_id,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key)
    values(v_user,'PARTNER_ACTIVATED','partners',v_partner::text,'Tryb Partner jest aktywny',
      'Masz bezpłatny dostęp Home i Pro oraz panel Partner.','/partner','partner:activated:'||v_partner)
    on conflict(dedupe_key) do nothing;
  perform public.gellatti_write_audit_v1('partner.accept_invitation','partners',v_partner::text,
    jsonb_build_object('invitationId',v_inv.id),'Authenticated invited user accepted',v_inv.id::text,
    'user',v_user::text);
  return jsonb_build_object('accepted',true,'partnerId',v_partner);
end;
$$;
revoke all on function public.gellatti_accept_my_partner_invitation_v1() from public,anon;
grant execute on function public.gellatti_accept_my_partner_invitation_v1() to authenticated;

create or replace function public.gellatti_admin_mint_home_invite_v1(
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_slot uuid; v_version integer; v_id uuid; v_email text:=lower(trim(p_email));
begin
  if not public.gellatti_admin_has_permission_v1('SUPPORT',v_admin) then raise exception 'support_administrator_required'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'valid_email_required'; end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' or p_expires_at<=statement_timestamp() then raise exception 'valid_invite_required'; end if;
  select s.id into v_slot from public.invite_code_slots s
    where s.enabled and not exists(select 1 from public.invite_codes c where c.slot_id=s.id and c.status in ('available','reserved','sent'))
    order by s.slot_number limit 1 for update;
  if v_slot is null then raise exception 'no_home_invite_slot_available'; end if;
  select coalesce(max(version),0)+1 into v_version from public.invite_codes where slot_id=v_slot;
  insert into public.invite_codes(slot_id,version,code_hash,status,reserved_email,expires_at)
    values(v_slot,v_version,p_code_hash,'sent',v_email,p_expires_at) returning id into v_id;
  update public.invite_code_slots set current_code_id=v_id where id=v_slot;
  perform public.gellatti_write_audit_v1('home_invite.mint','invite_codes',v_id::text,
    jsonb_build_object('email',v_email,'expiresAt',p_expires_at),'One-time Home month invitation',v_id::text,'admin',v_admin::text);
  return v_id;
end;
$$;
revoke all on function public.gellatti_admin_mint_home_invite_v1(text,text,timestamptz) from public,anon;
grant execute on function public.gellatti_admin_mint_home_invite_v1(text,text,timestamptz) to authenticated;

create or replace function public.gellatti_redeem_home_invite_v1(p_code_hash text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_email text; v_code public.invite_codes%rowtype; v_entitlement uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_code from public.invite_codes where code_hash=p_code_hash and status in ('available','reserved','sent')
    and (expires_at is null or expires_at>statement_timestamp()) for update;
  if v_code.id is null then raise exception 'invite_invalid_or_consumed'; end if;
  if lower(coalesce(v_code.reserved_email,''))<>v_email then raise exception 'invite_email_mismatch'; end if;
  insert into public.entitlements(user_id,scope,source_type,source_id,starts_at,ends_at,granted_by,metadata)
    values(v_user,'home','invite_home_trial',v_code.id,statement_timestamp(),statement_timestamp()+interval '1 month',
      'system:invite',jsonb_build_object('inviteCodeId',v_code.id)) returning id into v_entitlement;
  update public.invite_codes set status='redeemed',redeemed_by_user_id=v_user,
    redeemed_at=statement_timestamp(),entitlement_id=v_entitlement where id=v_code.id;
  perform public.gellatti_write_audit_v1('home_invite.redeem','invite_codes',v_code.id::text,
    jsonb_build_object('userId',v_user,'entitlementId',v_entitlement),'Exact-email one-time redemption',
    v_code.id::text,'user',v_user::text);
  return jsonb_build_object('ok',true,'entitlementId',v_entitlement,
    'endsAt',statement_timestamp()+interval '1 month');
end;
$$;
revoke all on function public.gellatti_redeem_home_invite_v1(text) from public,anon;
grant execute on function public.gellatti_redeem_home_invite_v1(text) to authenticated;

create or replace function public.gellatti_admin_invites_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('SUPPORT') then raise exception 'support_administrator_required'; end if;
  return jsonb_build_object(
    'home',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'slot',s.slot_number,'version',c.version,'email',c.reserved_email,
      'status',c.status,'expiresAt',c.expires_at,'redeemedAt',c.redeemed_at,
      'redeemedByUserId',c.redeemed_by_user_id,'createdAt',c.created_at
    ) order by c.created_at desc) from public.invite_codes c join public.invite_code_slots s on s.id=c.slot_id),'[]'::jsonb),
    'partner',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'displayName',i.display_name,'slug',i.proposed_slug,
      'status',i.status,'expiresAt',i.expires_at,'acceptedAt',i.accepted_at,'partnerId',i.partner_id,
      'createdAt',i.created_at
    ) order by i.created_at desc) from public.partner_invitations i),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.gellatti_admin_invites_v1() from public,anon;
grant execute on function public.gellatti_admin_invites_v1() to authenticated;

create or replace function public.gellatti_admin_register_partner_connect_v1(
  p_partner_id uuid,
  p_connect_account_id text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_before text;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then raise exception 'partner_administrator_required'; end if;
  if p_connect_account_id !~ '^acct_[A-Za-z0-9]+$' then raise exception 'valid_connect_account_required'; end if;
  select stripe_connect_account_id into v_before from public.partners where id=p_partner_id for update;
  if not found then raise exception 'partner_not_found'; end if;
  if v_before is not null and v_before<>p_connect_account_id then raise exception 'connect_account_already_bound'; end if;
  update public.partners set stripe_connect_account_id=p_connect_account_id where id=p_partner_id;
  perform public.gellatti_write_audit_v1('partner.connect_provision','partners',p_partner_id::text,
    jsonb_build_object('hadAccount',v_before is not null,'hasAccount',true),
    'Stripe Connect Express provisioning',p_partner_id::text,'admin',v_admin::text);
end;
$$;
revoke all on function public.gellatti_admin_register_partner_connect_v1(uuid,text) from public,anon;
grant execute on function public.gellatti_admin_register_partner_connect_v1(uuid,text) to authenticated;

create or replace function public.gellatti_admin_partner_profile_action_v1(
  p_partner_id uuid,
  p_action text,
  p_reason text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_before text;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then raise exception 'partner_administrator_required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select moderation_status into v_before from public.partner_public_profiles where partner_id=p_partner_id for update;
  if not found then raise exception 'partner_profile_not_found'; end if;
  if p_action='APPROVE' then
    update public.partner_public_profiles set moderation_status='APPROVED',updated_by_user_id=v_admin
      where partner_id=p_partner_id;
  elsif p_action='DISABLE' then
    update public.partner_public_profiles set moderation_status='DISABLED',updated_by_user_id=v_admin
      where partner_id=p_partner_id;
  elsif p_action='REMOVE_LOGO' then
    update public.partner_public_profiles set logo_path=null,moderation_status='APPROVED',updated_by_user_id=v_admin
      where partner_id=p_partner_id;
  else raise exception 'unsupported_partner_profile_action'; end if;
  perform public.gellatti_write_audit_v1('partner_profile.'||lower(p_action),'partner_public_profiles',p_partner_id::text,
    jsonb_build_object('before',v_before,'after',p_action),p_reason,p_partner_id::text,'admin',v_admin::text);
end;
$$;
revoke all on function public.gellatti_admin_partner_profile_action_v1(uuid,text,text) from public,anon;
grant execute on function public.gellatti_admin_partner_profile_action_v1(uuid,text,text) to authenticated;

create or replace function public.gellatti_admin_partner_link_action_v1(
  p_link_id uuid,
  p_action text,
  p_reason text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_partner uuid; v_before text;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then raise exception 'partner_administrator_required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select partner_id,status into v_partner,v_before from public.partner_content_links where id=p_link_id for update;
  if v_partner is null then raise exception 'partner_link_not_found'; end if;
  if p_action='DISABLE' then update public.partner_content_links set status='BLOCKED' where id=p_link_id;
  elsif p_action='REACTIVATE' then update public.partner_content_links set status='ACTIVE' where id=p_link_id;
  else raise exception 'unsupported_partner_link_action'; end if;
  perform public.gellatti_write_audit_v1('partner_link.'||lower(p_action),'partner_content_links',p_link_id::text,
    jsonb_build_object('before',v_before,'after',case when p_action='DISABLE' then 'BLOCKED' else 'ACTIVE' end),
    p_reason,v_partner::text,'admin',v_admin::text);
end;
$$;
revoke all on function public.gellatti_admin_partner_link_action_v1(uuid,text,text) from public,anon;
grant execute on function public.gellatti_admin_partner_link_action_v1(uuid,text,text) to authenticated;

create or replace function public.gellatti_admin_partner_note_v1(p_partner_id uuid,p_note text)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_id uuid;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then raise exception 'partner_administrator_required'; end if;
  insert into public.partner_admin_notes(partner_id,admin_user_id,note)
    values(p_partner_id,v_admin,trim(p_note)) returning id into v_id;
  perform public.gellatti_write_audit_v1('partner.note','partners',p_partner_id::text,
    jsonb_build_object('noteId',v_id),'Admin operational note',p_partner_id::text,'admin',v_admin::text);
  return v_id;
end;
$$;
revoke all on function public.gellatti_admin_partner_note_v1(uuid,text) from public,anon;
grant execute on function public.gellatti_admin_partner_note_v1(uuid,text) to authenticated;

create or replace function public.gellatti_admin_commission_rules_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER') then raise exception 'partner_administrator_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.product,r.cadence,r.tier)
    from public.commission_rules r where r.version=(select max(version) from public.commission_rules)),'[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_commission_rules_v1() from public,anon;
grant execute on function public.gellatti_admin_commission_rules_v1() to authenticated;

create or replace function public.gellatti_admin_set_commission_rule_v1(
  p_product text,
  p_cadence text,
  p_tier text,
  p_amount_cents integer,
  p_reason text
) returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_previous integer; v_next integer; v_before integer;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then raise exception 'partner_administrator_required'; end if;
  if p_product not in ('home','pro') or p_cadence not in ('monthly','annual')
    or p_tier not in ('standard','gold','elite') or p_amount_cents<0 then raise exception 'valid_commission_cell_required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gellatti-commission-rules',0));
  select max(version) into v_previous from public.commission_rules;
  if v_previous is null then raise exception 'commission_authority_missing'; end if;
  v_next:=v_previous+1;
  select amount_cents into v_before from public.commission_rules where version=v_previous
    and product=p_product and cadence=p_cadence and tier=p_tier;
  insert into public.commission_rules(version,product,cadence,tier,amount_cents,currency)
    select v_next,product,cadence,tier,amount_cents,currency from public.commission_rules where version=v_previous;
  update public.commission_rules set amount_cents=p_amount_cents where version=v_next
    and product=p_product and cadence=p_cadence and tier=p_tier;
  perform public.gellatti_write_audit_v1('commission_rule.version','commission_rules',v_next::text,
    jsonb_build_object('previousVersion',v_previous,'product',p_product,'cadence',p_cadence,'tier',p_tier,
      'beforeAmountCents',v_before,'afterAmountCents',p_amount_cents,'effectiveAt',statement_timestamp()),
    p_reason,'commission-rules:'||v_next,'admin',v_admin::text);
  return v_next;
end;
$$;
revoke all on function public.gellatti_admin_set_commission_rule_v1(text,text,text,integer,text) from public,anon;
grant execute on function public.gellatti_admin_set_commission_rule_v1(text,text,text,integer,text) to authenticated;

-- One truthful operational projection. Empty ledgers remain empty rather than
-- being replaced by fabricated health data.
create or replace function public.gellatti_admin_operations_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('ADMIN_READ') then raise exception 'administrator_required'; end if;
  return jsonb_build_object(
    'environment','staging',
    'backendProjectRef','tunabqqrwabacxjcxxkz',
    'scannerFailures',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
      select id,user_id,state,overlay_state,barcode,validation_json,created_at,updated_at
      from public.product_scan_sessions where state='blocked' order by updated_at desc limit 50
    ) x),'[]'::jsonb),
    'imports',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'source',r.source,'mode',r.mode,'label',r.label,'status',r.status,
      'totalRows',r.total_rows,'failedRows',(select count(*) from public.product_import_run_rows rr
        where rr.import_run_id=r.id and rr.outcome='FAILED'),
      'createdAt',r.created_at,'updatedAt',r.updated_at,'finishedAt',r.finished_at,'rolledBackAt',r.rolled_back_at
    ) order by r.created_at desc) from (select * from public.product_import_runs order by created_at desc limit 50) r),'[]'::jsonb),
    'stripeFailures',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'eventId',e.event_id,'eventType',e.event_type,'state',e.state,
      'attempts',e.attempts,'lastError',e.last_error,'receivedAt',e.received_at
    ) order by e.received_at desc) from public.stripe_webhook_events e
      where e.state in ('failed','dead_letter') or (e.state='received' and e.attempts>0)),'[]'::jsonb),
    'providerFailures',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'type',n.notification_type,'title',n.title,'entityType',n.entity_type,
      'entityId',n.entity_id,'createdAt',n.created_at
    ) order by n.created_at desc) from public.user_notifications n
      where n.notification_type in ('API_PROVIDER_FAILURE','OPENAI_RATE_LIMIT','BACKGROUND_JOB_FAILED','IMPORT_FAILED','IMPORT_ROLLED_BACK')
        and n.created_at>statement_timestamp()-interval '30 days'),'[]'::jsonb),
    'notificationDeliveryFailures','[]'::jsonb,
    'notificationDeliveryInstrumentation','DURABLE_IN_APP_ONLY_NO_EXTERNAL_DELIVERY_LEDGER',
    'knownIncidents',jsonb_build_array(jsonb_build_object(
      'provider','OpenAI','code','credit_balance_exhausted','scope','INTIMPORT recognition enrichment',
      'coreWorkflowBlocked',false,'source','accepted_closeout_handoff'
    ))
  );
end;
$$;
revoke all on function public.gellatti_admin_operations_v1() from public,anon;
grant execute on function public.gellatti_admin_operations_v1() to authenticated;

-- Durable Admin billing notifications are derived from the verified webhook
-- ledger transition. The HTTP receipt shell continues to touch only that
-- ledger; this database trigger makes the visible record exactly-once via the
-- notification dedupe key. No client checkout/success-page signal is trusted.
create or replace function public.gellatti_stripe_event_notification_v1()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_object jsonb:=coalesce(new.payload#>'{data,object}','{}'::jsonb);
  v_object_id text:=nullif(v_object->>'id','');
  v_subscription_id text:=coalesce(
    nullif(v_object#>>'{parent,subscription_details,subscription}',''),
    nullif(v_object->>'subscription','')
  );
  v_amount bigint:=coalesce((v_object->>'amount_paid')::bigint,0);
  v_currency text:=lower(coalesce(nullif(v_object->>'currency',''),'eur'));
  v_user uuid;
  v_email text;
  v_product text;
  v_cadence text;
  v_partner text:='brak';
  v_code text:='brak';
  v_attribution uuid;
begin
  if old.state is not distinct from new.state then return new; end if;

  if new.state='processed'
    and new.event_type in ('invoice.paid','invoice.payment_succeeded')
    and v_object->>'status'='paid'
    and v_amount>0
    and v_object_id is not null
    and v_subscription_id is not null then
    select s.user_id,s.product,s.cadence,s.attribution_id
      into v_user,v_product,v_cadence,v_attribution
      from public.customer_subscriptions s
      where s.stripe_subscription_id=v_subscription_id;
    if v_user is not null then
      select u.email into v_email from auth.users u where u.id=v_user;
    end if;
    if v_attribution is null then
      select a.id into v_attribution from public.referral_attributions a
        where a.stripe_subscription_id=v_subscription_id and a.status='active'
        order by a.locked_at desc nulls last limit 1;
    end if;
    if v_attribution is not null then
      select coalesce(p.display_name,a.partner_id::text),coalesce(c.code,'brak')
        into v_partner,v_code
        from public.referral_attributions a
        left join public.partner_public_profiles p on p.partner_id=a.partner_id
        left join public.partner_codes c on c.id=a.partner_code_id
        where a.id=v_attribution;
    end if;
    insert into public.user_notifications(
      admin_permission,notification_type,entity_type,entity_id,title,body,
      deep_link,payload,dedupe_key,is_test,sound_eligible
    ) values(
      'FINANCE','SUBSCRIPTION_PAYMENT_SUCCEEDED','stripe_invoice',v_object_id,
      '💰 Nowa płatność',
      'Plan: Gellatti '||upper(coalesce(v_product,'subscription'))||E'\nKwota: '
        ||to_char(v_amount/100.0,'FM999999990D00')||' '||upper(v_currency)
        ||E'\nKlient: '||coalesce(v_email,v_user::text,v_object->>'customer_email','—')
        ||E'\nPartner: '||v_partner||E'\nKod: '||v_code,
      '/admin/revenue',
      jsonb_build_object(
        'stripeEventId',new.event_id,'invoiceId',v_object_id,
        'subscriptionId',v_subscription_id,'amountPaidCents',v_amount,
        'currency',v_currency,'product',v_product,'cadence',v_cadence,
        'partner',v_partner,'code',v_code
      ),
      'stripe-payment:'||case when new.livemode then 'live' else 'test' end||':'||v_object_id,
      not new.livemode,true
    ) on conflict(dedupe_key) do nothing;
  elsif new.state='processed' and (
    new.event_type='invoice.payment_failed'
    or new.event_type like 'charge.refund%'
    or new.event_type like 'charge.dispute%'
  ) then
    insert into public.user_notifications(
      admin_permission,notification_type,entity_type,entity_id,title,body,
      deep_link,payload,dedupe_key,is_test,sound_eligible
    ) values(
      'FINANCE',
      case when new.event_type='invoice.payment_failed'
        then 'SUBSCRIPTION_PAYMENT_FAILED' else 'SUBSCRIPTION_REFUND_OR_DISPUTE' end,
      'stripe_event',new.event_id,
      case when new.event_type='invoice.payment_failed'
        then 'Płatność subskrypcji nie powiodła się' else 'Zwrot lub spór płatniczy' end,
      'Stripe '||new.event_type||' · '||coalesce(v_object_id,'—'),
      '/admin/revenue',jsonb_build_object('eventId',new.event_id,'eventType',new.event_type),
      'stripe-finance-update:'||new.event_id,not new.livemode,false
    ) on conflict(dedupe_key) do nothing;
  elsif new.state in ('failed','dead_letter') then
    insert into public.user_notifications(
      admin_permission,notification_type,entity_type,entity_id,title,body,
      deep_link,payload,dedupe_key,is_test,sound_eligible
    ) values(
      'ADMIN_READ','STRIPE_WEBHOOK_FAILED','stripe_event',new.event_id,
      'Stripe webhook wymaga uwagi',
      new.event_type||' · bez ujawniania payloadu lub sekretów',
      '/admin/operations',jsonb_build_object('eventId',new.event_id,'eventType',new.event_type),
      'stripe-webhook-failed:'||new.event_id,not new.livemode,false
    ) on conflict(dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.gellatti_stripe_event_notification_v1() from public,anon,authenticated;
drop trigger if exists stripe_webhook_admin_notification on public.stripe_webhook_events;
create trigger stripe_webhook_admin_notification
  after update of state on public.stripe_webhook_events
  for each row execute function public.gellatti_stripe_event_notification_v1();
