-- ============================================================================
-- Partner self-service, public profile assets and analytics over the accepted
-- referral / commission / payout authority. No parallel financial ledger.
-- ============================================================================

alter table public.partner_codes add column if not exists internal_label text;
alter table public.partner_codes add column if not exists disabled_reason text;
alter table public.partner_codes add column if not exists disabled_by_admin_user_id uuid
  references auth.users(id) on delete set null;
alter table public.partner_codes add column if not exists disabled_at timestamptz;
alter table public.referral_clicks add column if not exists dedupe_key text;
create unique index if not exists referral_clicks_dedupe_key_uniq
  on public.referral_clicks(dedupe_key) where dedupe_key is not null;

alter table public.partner_public_profiles add column if not exists logo_mime_type text;
alter table public.partner_public_profiles add column if not exists logo_byte_size integer;
alter table public.partner_public_profiles add column if not exists logo_width integer;
alter table public.partner_public_profiles add column if not exists logo_height integer;

alter table public.partner_public_profiles drop constraint if exists partner_public_profiles_logo_shape;
alter table public.partner_public_profiles add constraint partner_public_profiles_logo_shape check (
  logo_path is null or (
    logo_mime_type in ('image/jpeg','image/png','image/webp')
    and logo_byte_size between 1 and 2097152
    and logo_width between 128 and 2000
    and logo_height between 128 and 2000
  )
);

-- Reuse the existing public code column but retain the Partner's channel label.
create or replace function public.gellatti_partner_manage_code_v1(
  p_action text,
  p_code text,
  p_label text default null,
  p_code_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_partner uuid;
  v_code text := lower(trim(coalesce(p_code,'')));
  v_id uuid;
begin
  select id into v_partner from public.partners
  where user_id=auth.uid() and status='active';
  if v_partner is null then raise exception 'active_partner_required'; end if;
  if p_action='CREATE' then
    if v_code !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
      raise exception 'partner_code_invalid';
    end if;
    insert into public.partner_codes(partner_id,code,slug,status,internal_label)
      values(v_partner,v_code,v_code,'active',nullif(trim(p_label),'')) returning id into v_id;
    perform public.gellatti_write_audit_v1(
      'partner_code.create','partner_codes',v_id::text,
      jsonb_build_object('code',v_code,'label',nullif(trim(p_label),'')),
      null,v_partner::text,'user',auth.uid()::text
    );
  elsif p_action='ARCHIVE' then
    update public.partner_codes set status='retired'
      where id=p_code_id and partner_id=v_partner and status='active'
      returning id into v_id;
    if v_id is null then raise exception 'active_owned_code_not_found'; end if;
    perform public.gellatti_write_audit_v1(
      'partner_code.archive','partner_codes',v_id::text,'{}'::jsonb,
      null,v_partner::text,'user',auth.uid()::text
    );
  else
    raise exception 'unsupported_code_action';
  end if;
  return jsonb_build_object('id',v_id,'partnerId',v_partner,'action',p_action);
end;
$$;
revoke all on function public.gellatti_partner_manage_code_v1(text,text,text,uuid)
  from public,anon;
grant execute on function public.gellatti_partner_manage_code_v1(text,text,text,uuid)
  to authenticated;

create or replace function public.gellatti_partner_register_logo_v1(
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_partner uuid; v_user uuid := auth.uid();
begin
  select id into v_partner from public.partners where user_id=v_user and status='active';
  if v_partner is null then raise exception 'active_partner_required'; end if;
  if p_storage_path not like v_user::text||'/%'
    or p_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_byte_size not between 1 and 2097152
    or p_width not between 128 and 2000
    or p_height not between 128 and 2000 then
    raise exception 'invalid_partner_logo';
  end if;
  if not exists(select 1 from storage.objects o
    where o.bucket_id='partner-public-assets' and o.name=p_storage_path) then
    raise exception 'partner_logo_object_not_found';
  end if;
  update public.partner_public_profiles set
    logo_path=p_storage_path, logo_mime_type=p_mime_type,
    logo_byte_size=p_byte_size, logo_width=p_width, logo_height=p_height,
    moderation_status='UNDER_REVIEW', updated_by_user_id=v_user
  where partner_id=v_partner;
  return jsonb_build_object('partnerId',v_partner,'logoPath',p_storage_path,'moderationStatus','UNDER_REVIEW');
end;
$$;
revoke all on function public.gellatti_partner_register_logo_v1(text,text,integer,integer,integer)
  from public,anon;
grant execute on function public.gellatti_partner_register_logo_v1(text,text,integer,integer,integer)
  to authenticated;

create or replace function public.gellatti_partner_workspace_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_partner public.partners%rowtype;
begin
  select * into v_partner from public.partners where user_id=auth.uid();
  if v_partner.id is null then
    return jsonb_build_object('ok',false,'reason','not_a_partner');
  end if;
  if v_partner.status<>'active' then
    return jsonb_build_object('ok',false,'reason','partner_not_active','status',v_partner.status);
  end if;
  return jsonb_build_object(
    'ok',true,
    'partner',jsonb_build_object(
      'id',v_partner.id,'status',v_partner.status,'tier',v_partner.tier,
      'onboardingComplete',v_partner.onboarding_complete,
      'payoutsEnabled',v_partner.payouts_enabled,
      'connectAccountPresent',v_partner.stripe_connect_account_id is not null
    ),
    'profile',coalesce((select jsonb_build_object(
      'slug',p.slug,'displayName',p.display_name,'logoPath',p.logo_path,
      'shortDescription',p.short_description,'websiteUrl',p.website_url,
      'socialLinks',p.social_links,'defaultDestinationPath',p.default_destination_path,
      'moderationStatus',p.moderation_status,'updatedAt',p.updated_at
    ) from public.partner_public_profiles p where p.partner_id=v_partner.id),'{}'::jsonb),
    'codes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'code',c.code,'slug',c.slug,'label',c.internal_label,
      'status',c.status,'createdAt',c.created_at,
      'clickCount',(select count(*) from public.referral_clicks rc where rc.partner_code_id=c.id),
      'uniqueVisitors',(select count(distinct rc.visitor_hash) from public.referral_clicks rc
        where rc.partner_code_id=c.id and rc.visitor_hash is not null),
      'signups',(select count(*) from public.referral_attributions ra where ra.partner_code_id=c.id),
      'paidCustomers',(select count(distinct ra.user_id) from public.referral_attributions ra
        where ra.partner_code_id=c.id and ra.status='active'),
      'grossAttributedRevenueCents',coalesce((select sum(invoice_amount.amount_cents)
        from public.commission_entries ce
        join public.referral_attributions ra on ra.id=ce.attribution_id and ra.partner_code_id=c.id
        left join lateral (
          select max(coalesce((swe.payload#>>'{data,object,amount_paid}')::bigint,0)) amount_cents
          from public.stripe_webhook_events swe
          where swe.state='processed'
            and swe.event_type in ('invoice.paid','invoice.payment_succeeded')
            and swe.payload#>>'{data,object,id}'=ce.stripe_invoice_id
        ) invoice_amount on true),0),
      'refundCommissionCents',coalesce((select abs(sum(ca.amount_cents))
        from public.commission_adjustments ca
        join public.commission_entries ce on ce.id=ca.commission_entry_id
        join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ca.amount_cents<0),0),
      'pendingCommissionCents',coalesce((select sum(ce.amount_cents)
        from public.commission_entries ce join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ce.status='held'),0),
      'approvedCommissionCents',coalesce((select sum(ce.amount_cents)
        from public.commission_entries ce join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ce.status='eligible'),0),
      'paidCommissionCents',coalesce((select sum(ce.amount_cents)
        from public.commission_entries ce join public.referral_attributions ra on ra.id=ce.attribution_id
        where ra.partner_code_id=c.id and ce.status='paid'),0)
    ) order by c.created_at) from public.partner_codes c where c.partner_id=v_partner.id),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'linkSlug',l.link_slug,'label',l.label,
      'destinationType',l.destination_type,'destinationPath',l.destination_path,
      'status',l.status,'partnerCodeId',l.partner_code_id,'createdAt',l.created_at,
      'clickCount',(select count(*) from public.referral_clicks rc
        where rc.partner_code_id=l.partner_code_id and rc.context->>'contentLinkId'=l.id::text)
    ) order by l.created_at desc) from public.partner_content_links l
      where l.partner_id=v_partner.id),'[]'::jsonb),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ce.id,'status',ce.status,'product',ce.product,'cadence',ce.cadence,
      'amountCents',ce.amount_cents,'currency',ce.currency,
      'earnedAt',ce.earned_at,'eligibleAt',ce.eligible_at,
      'livemode',ce.livemode,'invoiceId',ce.stripe_invoice_id
    ) order by ce.earned_at desc) from public.commission_entries ce
      where ce.partner_id=v_partner.id),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',pp.id,'status',pp.status,'amountCents',pp.amount_cents,
      'carryForwardCents',pp.carry_forward_cents,'currency',pp.currency,
      'paidAt',pp.paid_at,'createdAt',pp.created_at,
      'failureReason',pp.failure_reason
    ) order by pp.created_at desc) from public.partner_payouts pp
      where pp.partner_id=v_partner.id),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.gellatti_partner_workspace_v1() from public,anon;
grant execute on function public.gellatti_partner_workspace_v1() to authenticated;

create or replace function public.gellatti_admin_partner_code_action_v1(
  p_code_id uuid,
  p_action text,
  p_reason text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_partner uuid; v_before text;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then
    raise exception 'partner_administrator_required';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select partner_id,status into v_partner,v_before from public.partner_codes where id=p_code_id for update;
  if v_partner is null then raise exception 'partner_code_not_found'; end if;
  if p_action='DISABLE' then
    update public.partner_codes set status='blocked',disabled_reason=p_reason,
      disabled_by_admin_user_id=v_admin,disabled_at=statement_timestamp() where id=p_code_id;
  elsif p_action='REACTIVATE' then
    update public.partner_codes set status='active',disabled_reason=null,
      disabled_by_admin_user_id=null,disabled_at=null where id=p_code_id;
  else raise exception 'unsupported_partner_code_action'; end if;
  perform public.gellatti_write_audit_v1(
    'partner_code.'||lower(p_action),'partner_codes',p_code_id::text,
    jsonb_build_object('before',v_before,'after',case when p_action='DISABLE' then 'blocked' else 'active' end),
    p_reason,v_partner::text,'admin',v_admin::text
  );
end;
$$;
revoke all on function public.gellatti_admin_partner_code_action_v1(uuid,text,text)
  from public,anon;
grant execute on function public.gellatti_admin_partner_code_action_v1(uuid,text,text)
  to authenticated;

-- A public click is only evidence. Once the visitor has a real authenticated
-- account this transaction creates/replaces a PENDING attribution in the
-- accepted ledger. A paid/ACTIVE owner is never stolen.
create or replace function public.gellatti_claim_partner_click_v1(
  p_click_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_click public.referral_clicks%rowtype;
  v_existing public.referral_attributions%rowtype;
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select rc.* into v_click from public.referral_clicks rc
    join public.partners p on p.id=rc.partner_id and p.status='active'
    join public.partner_codes c on c.id=rc.partner_code_id and c.status='active'
    where rc.id=p_click_id and rc.occurred_at>=statement_timestamp()-interval '30 days'
    for update of rc;
  if v_click.id is null then raise exception 'eligible_partner_click_not_found'; end if;
  if exists(select 1 from public.partners p where p.id=v_click.partner_id and p.user_id=v_user) then
    raise exception 'self_referral';
  end if;
  select * into v_existing from public.referral_attributions ra
    where ra.user_id=v_user and ra.status in ('active','pending')
    order by (ra.status='active') desc,ra.created_at desc limit 1 for update;
  if v_existing.status='active' then
    return jsonb_build_object('attributionId',v_existing.id,'status','active','locked',true);
  end if;
  if v_existing.status='pending' and v_existing.click_id=p_click_id then
    return jsonb_build_object('attributionId',v_existing.id,'status','pending','locked',false);
  end if;
  if v_existing.status='pending' then
    update public.referral_attributions set status='superseded' where id=v_existing.id;
  end if;
  insert into public.referral_attributions(
    partner_id,partner_code_id,click_id,user_id,method,status,clicked_at,window_expires_at
  ) values(
    v_click.partner_id,v_click.partner_code_id,v_click.id,v_user,'referral_link','pending',
    v_click.occurred_at,v_click.occurred_at+interval '30 days'
  ) returning id into v_id;
  return jsonb_build_object('attributionId',v_id,'status','pending','locked',false);
end;
$$;
revoke all on function public.gellatti_claim_partner_click_v1(uuid) from public,anon;
grant execute on function public.gellatti_claim_partner_click_v1(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'partner-public-assets','partner-public-assets',false,2097152,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set public=false,file_size_limit=2097152,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists partner_public_assets_owner_insert on storage.objects;
create policy partner_public_assets_owner_insert on storage.objects
  for insert to authenticated with check (
    bucket_id='partner-public-assets'
    and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.partners p where p.user_id=auth.uid() and p.status='active')
  );
drop policy if exists partner_public_assets_owner_update on storage.objects;
create policy partner_public_assets_owner_update on storage.objects
  for update to authenticated using (
    bucket_id='partner-public-assets' and (storage.foldername(name))[1]=auth.uid()::text
  ) with check (
    bucket_id='partner-public-assets' and (storage.foldername(name))[1]=auth.uid()::text
  );
