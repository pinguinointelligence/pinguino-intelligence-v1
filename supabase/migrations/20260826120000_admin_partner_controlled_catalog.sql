-- ============================================================================
-- Gellatti Admin / Partner / controlled product catalog
-- STAGING-safe, additive authority layer. No Engine/Mapper/scoring mutation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Permission-bearing Admin roles (admin and Partner remain separate)
-- ---------------------------------------------------------------------------

alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in (
  'super_admin', 'catalog_admin', 'support_admin', 'partner_admin',
  'finance_admin', 'content_moderator'
));

create or replace function public.gellatti_admin_has_permission_v1(
  p_permission text,
  p_actor_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p_actor_user_id is not null and exists (
    select 1
    from public.admin_users a
    where a.user_id = p_actor_user_id
      and a.revoked_at is null
      and (
        a.role = 'super_admin'
        or (p_permission = 'CATALOG' and a.role = 'catalog_admin')
        or (p_permission = 'SUPPORT' and a.role = 'support_admin')
        or (p_permission = 'PARTNER' and a.role = 'partner_admin')
        or (p_permission = 'FINANCE' and a.role = 'finance_admin')
        or (p_permission = 'CONTENT' and a.role = 'content_moderator')
        or (p_permission = 'ADMIN_READ' and a.role in (
          'catalog_admin','support_admin','partner_admin','finance_admin','content_moderator'
        ))
      )
  );
$$;
revoke all on function public.gellatti_admin_has_permission_v1(text,uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_admin_has_permission_v1(text,uuid) to authenticated;

create or replace function public.gellatti_write_audit_v1(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_diff jsonb,
  p_reason text,
  p_correlation_id text,
  p_actor_type text default 'admin',
  p_actor_id text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  insert into public.audit_log(
    actor_type, actor_id, action, entity_type, entity_id, diff, reason, correlation_id
  ) values (
    p_actor_type,
    coalesce(p_actor_id, auth.uid()::text),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_diff,'{}'::jsonb) || jsonb_build_object('environment','staging'),
    p_reason,
    p_correlation_id
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.gellatti_write_audit_v1(
  text,text,text,jsonb,text,text,text,text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Canonical market-country vocabulary. Market remains separate from origin.
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_market_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name_pl text not null,
  name_en text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists catalog_market_countries_touch on public.catalog_market_countries;
create trigger catalog_market_countries_touch before update on public.catalog_market_countries
  for each row execute function public.touch_updated_at();
alter table public.catalog_market_countries enable row level security;
drop policy if exists catalog_market_countries_read on public.catalog_market_countries;
create policy catalog_market_countries_read on public.catalog_market_countries
  for select to authenticated using (is_active);
grant select on public.catalog_market_countries to authenticated;

insert into public.catalog_market_countries(code,name_pl,name_en,sort_order) values
  ('PL','Polska','Poland',10),('ES','Hiszpania','Spain',20),
  ('DE','Niemcy','Germany',30),('FR','Francja','France',40),
  ('IT','Włochy','Italy',50),('PT','Portugalia','Portugal',60),
  ('AT','Austria','Austria',70),('BE','Belgia','Belgium',80),
  ('NL','Holandia','Netherlands',90),('CZ','Czechy','Czechia',100),
  ('SK','Słowacja','Slovakia',110),('DK','Dania','Denmark',120),
  ('SE','Szwecja','Sweden',130),('FI','Finlandia','Finland',140),
  ('IE','Irlandia','Ireland',150),('GB','Wielka Brytania','United Kingdom',160),
  ('US','Stany Zjednoczone','United States',170),('PH','Filipiny','Philippines',180)
on conflict (code) do update set
  name_pl=excluded.name_pl,name_en=excluded.name_en,sort_order=excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3. Product Add Request state machine and private evidence metadata
-- ---------------------------------------------------------------------------

create table if not exists public.product_add_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  request_number bigint generated always as identity unique,
  idempotency_key text not null,
  source text not null check (source in ('SCANNER','MANUAL_EVIDENCE','ADMIN')),
  status text not null default 'SUBMITTED' check (status in (
    'SUBMITTED','ADMIN_REVIEW','NEEDS_INFO','RESUBMITTED','APPROVED',
    'REJECTED','DUPLICATE','USER_CANCELED'
  )),
  scan_session_id uuid references public.product_scan_sessions(id) on delete set null,
  assigned_admin_user_id uuid references auth.users(id) on delete set null,
  market_country_code text references public.catalog_market_countries(code),
  country_of_origin text,
  detected_ean text,
  product_name text,
  brand text,
  variant text,
  net_quantity text,
  manufacturer text,
  extracted_data jsonb not null default '{}'::jsonb,
  user_corrections jsonb not null default '{}'::jsonb,
  admin_verified_data jsonb not null default '{}'::jsonb,
  scanner_provenance jsonb not null default '{}'::jsonb,
  raw_scanner_result jsonb not null default '{}'::jsonb,
  duplicate_product_id uuid references public.products(id) on delete restrict,
  approved_product_id uuid references public.products(id) on delete restrict,
  admin_note text,
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  review_started_at timestamptz,
  needs_info_at timestamptz,
  resubmitted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_user_id,idempotency_key),
  check (octet_length(extracted_data::text) <= 250000),
  check (octet_length(user_corrections::text) <= 100000),
  check (octet_length(admin_verified_data::text) <= 100000),
  check (octet_length(scanner_provenance::text) <= 100000),
  check (octet_length(raw_scanner_result::text) <= 300000),
  check ((status='APPROVED') = (approved_product_id is not null)),
  check ((status='DUPLICATE') = (duplicate_product_id is not null)),
  check (status<>'REJECTED' or rejection_reason is not null),
  check (status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED') or resolved_at is not null)
);
create index if not exists product_add_requests_queue_idx
  on public.product_add_requests(status,submitted_at);
create index if not exists product_add_requests_requester_idx
  on public.product_add_requests(requester_user_id,updated_at desc);
create index if not exists product_add_requests_ean_idx
  on public.product_add_requests(detected_ean) where detected_ean is not null;
drop trigger if exists product_add_requests_touch on public.product_add_requests;
create trigger product_add_requests_touch before update on public.product_add_requests
  for each row execute function public.touch_updated_at();

create table if not exists public.product_add_request_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.product_add_requests(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in (
    'FRONT_PHOTO','BARCODE_PHOTO','INGREDIENTS_PHOTO','NUTRITION_PHOTO',
    'ALLERGEN_PHOTO','TECHNICAL_DOCUMENT','SOURCE_URL','RAW_SCANNER_RESULT','OTHER'
  )),
  storage_bucket text,
  storage_path text,
  source_url text,
  mime_type text,
  byte_size integer check (byte_size is null or byte_size between 1 and 10485760),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((storage_path is not null)::int + (source_url is not null)::int +
         (evidence_payload <> '{}'::jsonb)::int >= 1),
  check (storage_path is null or (
    storage_bucket='product-request-evidence'
    and mime_type in ('image/jpeg','image/png','image/webp','application/pdf')
  ))
);
create index if not exists product_add_request_evidence_request_idx
  on public.product_add_request_evidence(request_id,created_at);

create table if not exists public.product_add_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.product_add_requests(id) on delete restrict,
  actor_type text not null check (actor_type in ('USER','ADMIN','SYSTEM')),
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists product_add_request_events_request_idx
  on public.product_add_request_events(request_id,created_at,id);

create table if not exists public.product_add_request_missing_fields (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.product_add_requests(id) on delete restrict,
  field_type text not null check (field_type in (
    'FRONT_PHOTO','BARCODE_OR_EAN','PRODUCT_NAME','BRAND','VARIANT','NET_QUANTITY',
    'INGREDIENTS','NUTRITION_TABLE','ALLERGEN_INFORMATION','MANUFACTURER',
    'COUNTRY_OF_ORIGIN','MARKET_AVAILABILITY','PROFESSIONAL_DOSAGE',
    'USAGE_INSTRUCTIONS','TECHNICAL_DOCUMENT','OTHER'
  )),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','SUPPLIED','ACCEPTED','WAIVED')),
  instruction text,
  requested_by_admin_user_id uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  supplied_at timestamptz,
  resolved_at timestamptz,
  unique(request_id,field_type,status) deferrable initially immediate
);
create index if not exists product_add_request_missing_open_idx
  on public.product_add_request_missing_fields(request_id,status);

create table if not exists public.product_add_request_user_state (
  request_id uuid not null references public.product_add_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  user_archived_at timestamptz,
  reopened_at timestamptz,
  startup_notice_acknowledged_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(request_id,user_id)
);
drop trigger if exists product_add_request_user_state_touch on public.product_add_request_user_state;
create trigger product_add_request_user_state_touch before update on public.product_add_request_user_state
  for each row execute function public.touch_updated_at();

create table if not exists public.user_contributed_products (
  user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique references public.product_add_requests(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(user_id,product_id,request_id)
);

-- ---------------------------------------------------------------------------
-- 4. Durable user/Admin notification center
-- ---------------------------------------------------------------------------

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  admin_permission text check (admin_permission is null or admin_permission in (
    'ADMIN_READ','CATALOG','SUPPORT','PARTNER','FINANCE','CONTENT'
  )),
  notification_type text not null,
  entity_type text not null,
  entity_id text,
  title text not null,
  body text not null,
  deep_link text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  is_test boolean not null default false,
  sound_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  check ((recipient_user_id is not null) <> (admin_permission is not null)),
  check (deep_link is null or (deep_link like '/%' and deep_link not like '//%'))
);
create index if not exists user_notifications_recipient_idx
  on public.user_notifications(recipient_user_id,created_at desc);
create index if not exists user_notifications_admin_idx
  on public.user_notifications(admin_permission,created_at desc);

create table if not exists public.user_notification_receipts (
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  acknowledged_at timestamptz,
  sound_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(notification_id,user_id),
  check (sound_played_at is null or read_at is not null)
);
drop trigger if exists user_notification_receipts_touch on public.user_notification_receipts;
create trigger user_notification_receipts_touch before update on public.user_notification_receipts
  for each row execute function public.touch_updated_at();

create table if not exists public.admin_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sales_sound_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
drop trigger if exists admin_user_preferences_touch on public.admin_user_preferences;
create trigger admin_user_preferences_touch before update on public.admin_user_preferences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Partner public identity, invitations and tracked content links
-- ---------------------------------------------------------------------------

create table if not exists public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null,
  proposed_slug text not null,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  invited_by_admin_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_by_user_id uuid references auth.users(id) on delete restrict,
  partner_id uuid references public.partners(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists partner_invitations_open_email_uniq
  on public.partner_invitations(lower(email)) where status='PENDING';
drop trigger if exists partner_invitations_touch on public.partner_invitations;
create trigger partner_invitations_touch before update on public.partner_invitations
  for each row execute function public.touch_updated_at();

create table if not exists public.partner_public_profiles (
  partner_id uuid primary key references public.partners(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  logo_path text,
  short_description text check (short_description is null or length(short_description)<=500),
  website_url text,
  social_links jsonb not null default '{}'::jsonb,
  default_destination_path text not null default '/subscription',
  moderation_status text not null default 'APPROVED' check (
    moderation_status in ('APPROVED','UNDER_REVIEW','DISABLED')
  ),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (website_url is null or website_url ~ '^https://'),
  check (default_destination_path like '/%' and default_destination_path not like '//%'),
  check (octet_length(social_links::text)<=8000)
);
drop trigger if exists partner_public_profiles_touch on public.partner_public_profiles;
create trigger partner_public_profiles_touch before update on public.partner_public_profiles
  for each row execute function public.touch_updated_at();

create table if not exists public.partner_content_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  partner_code_id uuid not null references public.partner_codes(id) on delete restrict,
  link_slug text not null unique check (link_slug ~ '^[a-z0-9][a-z0-9-]{5,79}$'),
  label text,
  destination_type text not null check (destination_type in (
    'PUBLIC_PROFILE','COMMUNITY_RECIPE','SHARED_RECIPE','PRICING','PUBLIC_PAGE'
  )),
  destination_path text not null check (
    destination_path like '/%' and destination_path not like '//%'
  ),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED','BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_content_links_partner_idx
  on public.partner_content_links(partner_id,status,created_at desc);
drop trigger if exists partner_content_links_touch on public.partner_content_links;
create trigger partner_content_links_touch before update on public.partner_content_links
  for each row execute function public.touch_updated_at();

-- Codes are permanent public identifiers. Existing partial indexes remain for
-- compatibility; these all-history indexes prevent retired-code reassignment.
create unique index if not exists partner_codes_code_permanent_uniq
  on public.partner_codes(lower(code));
create unique index if not exists partner_codes_slug_permanent_uniq
  on public.partner_codes(lower(slug));

create or replace function public.gellatti_partner_code_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status='active' and (
    select count(*) from public.partner_codes c
    where c.partner_id=new.partner_id and c.status='active' and c.id<>new.id
  ) >= 3 then
    raise exception 'partner_active_code_limit_reached';
  end if;
  if lower(new.slug) in (
    'admin','api','login','logout','home','pro','partner','products','recipes',
    'settings','account','auth','pricing','community','support','system','gellatti','pinguino'
  ) then raise exception 'partner_code_reserved'; end if;
  if lower(new.slug) !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'partner_code_invalid';
  end if;
  return new;
end;
$$;
drop trigger if exists partner_codes_controlled_guard on public.partner_codes;
create trigger partner_codes_controlled_guard before insert or update on public.partner_codes
  for each row execute function public.gellatti_partner_code_guard_v1();

-- ---------------------------------------------------------------------------
-- 6. RLS: read ownership, immutable histories, server-authorized transitions
-- ---------------------------------------------------------------------------

alter table public.product_add_requests enable row level security;
alter table public.product_add_request_evidence enable row level security;
alter table public.product_add_request_events enable row level security;
alter table public.product_add_request_missing_fields enable row level security;
alter table public.product_add_request_user_state enable row level security;
alter table public.user_contributed_products enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_notification_receipts enable row level security;
alter table public.admin_user_preferences enable row level security;
alter table public.partner_invitations enable row level security;
alter table public.partner_public_profiles enable row level security;
alter table public.partner_content_links enable row level security;

create policy product_add_requests_owner_read on public.product_add_requests
  for select to authenticated using (requester_user_id=auth.uid());
create policy product_add_requests_admin_read on public.product_add_requests
  for select to authenticated using (public.gellatti_admin_has_permission_v1('CATALOG'));
create policy product_add_request_evidence_owner_read on public.product_add_request_evidence
  for select to authenticated using (owner_user_id=auth.uid());
create policy product_add_request_evidence_admin_read on public.product_add_request_evidence
  for select to authenticated using (public.gellatti_admin_has_permission_v1('CATALOG'));
create policy product_add_request_events_owner_read on public.product_add_request_events
  for select to authenticated using (exists(
    select 1 from public.product_add_requests r
    where r.id=request_id and r.requester_user_id=auth.uid()
  ));
create policy product_add_request_events_admin_read on public.product_add_request_events
  for select to authenticated using (public.gellatti_admin_has_permission_v1('CATALOG'));
create policy product_add_request_missing_owner_read on public.product_add_request_missing_fields
  for select to authenticated using (exists(
    select 1 from public.product_add_requests r
    where r.id=request_id and r.requester_user_id=auth.uid()
  ));
create policy product_add_request_missing_admin_read on public.product_add_request_missing_fields
  for select to authenticated using (public.gellatti_admin_has_permission_v1('CATALOG'));
create policy product_add_request_user_state_owner_read on public.product_add_request_user_state
  for select to authenticated using (user_id=auth.uid());
create policy user_contributed_products_owner_read on public.user_contributed_products
  for select to authenticated using (user_id=auth.uid());

create policy user_notifications_recipient_read on public.user_notifications
  for select to authenticated using (
    recipient_user_id=auth.uid()
    or (admin_permission is not null and public.gellatti_admin_has_permission_v1(admin_permission))
  );
create policy user_notification_receipts_own on public.user_notification_receipts
  for select to authenticated using (user_id=auth.uid());
create policy admin_user_preferences_own_read on public.admin_user_preferences
  for select to authenticated using (
    user_id=auth.uid() and public.gellatti_admin_has_permission_v1('ADMIN_READ')
  );

create policy partner_invitations_admin_read on public.partner_invitations
  for select to authenticated using (public.gellatti_admin_has_permission_v1('PARTNER'));
create policy partner_public_profiles_owner_read on public.partner_public_profiles
  for select to authenticated using (exists(
    select 1 from public.partners p where p.id=partner_id and p.user_id=auth.uid()
  ));
create policy partner_public_profiles_admin_read on public.partner_public_profiles
  for select to authenticated using (public.gellatti_admin_has_permission_v1('PARTNER'));
create policy partner_content_links_owner_read on public.partner_content_links
  for select to authenticated using (exists(
    select 1 from public.partners p where p.id=partner_id and p.user_id=auth.uid()
  ));
create policy partner_content_links_admin_read on public.partner_content_links
  for select to authenticated using (public.gellatti_admin_has_permission_v1('PARTNER'));

grant select on public.product_add_requests, public.product_add_request_evidence,
  public.product_add_request_events, public.product_add_request_missing_fields,
  public.product_add_request_user_state, public.user_contributed_products,
  public.user_notifications, public.user_notification_receipts,
  public.admin_user_preferences, public.partner_invitations,
  public.partner_public_profiles, public.partner_content_links to authenticated;

-- No INSERT/UPDATE/DELETE grants: every transition below is a checked RPC.

-- ---------------------------------------------------------------------------
-- 7. User request / notification RPCs
-- ---------------------------------------------------------------------------

create or replace function public.gellatti_submit_product_request_v1(
  p_scan_session_id uuid,
  p_market_country_code text,
  p_payload jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.product_add_requests%rowtype;
  v_result jsonb := coalesce(p_payload->'result','{}'::jsonb);
  v_identity jsonb := coalesce(v_result->'identity','{}'::jsonb);
  v_package jsonb := coalesce(v_result->'package','{}'::jsonb);
  v_ean text;
  v_exact record;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception 'invalid_idempotency_key';
  end if;
  if octet_length(coalesce(p_payload,'{}'::jsonb)::text)>500000 then
    raise exception 'request_payload_too_large';
  end if;
  if p_scan_session_id is not null and not exists(
    select 1 from public.product_scan_sessions s
    where s.id=p_scan_session_id and s.user_id=v_user
      and s.expires_at>statement_timestamp()
  ) then raise exception 'owned_scan_session_not_found'; end if;

  select regexp_replace(coalesce(
    v_result#>>'{barcodes,0,value}', p_payload->>'detectedEan', ''
  ),'\D','','g') into v_ean;
  if v_ean='' then v_ean:=null; end if;

  -- Fail closed against duplicate creation: an exact approved catalog EAN is
  -- returned directly and no request row is created.
  if v_ean is not null then
    select p.id,p.product_code,p.product_name_display into v_exact
    from public.products p
    where p.is_active and p.merged_into_product_id is null
      and p.visibility='shared' and p.canonical_verification_status<>'blocked'
      and (
        regexp_replace(coalesce(p.ean_code_normalized,''),'\D','','g')=v_ean
        or exists(select 1 from public.product_variants pv
          where pv.product_id=p.id and pv.is_current
            and regexp_replace(coalesce(pv.ean,''),'\D','','g')=v_ean)
      )
    order by p.canonical_verification_status='verified' desc,p.created_at
    limit 1;
    if v_exact.id is not null then
      return jsonb_build_object(
        'kind','existing_product','productId',v_exact.id,
        'productCode',v_exact.product_code,'displayName',v_exact.product_name_display
      );
    end if;
  end if;

  insert into public.product_add_requests(
    requester_user_id,idempotency_key,source,scan_session_id,market_country_code,
    country_of_origin,detected_ean,product_name,brand,variant,net_quantity,
    manufacturer,extracted_data,user_corrections,scanner_provenance,raw_scanner_result
  ) values (
    v_user,p_idempotency_key,case when p_scan_session_id is null then 'MANUAL_EVIDENCE' else 'SCANNER' end,
    p_scan_session_id,nullif(upper(trim(p_market_country_code)),''),
    nullif(v_identity->>'countryOfOrigin',''),v_ean,
    coalesce(nullif(v_identity->>'displayName',''),nullif(v_identity->>'originalName','')),
    nullif(v_identity->>'brand',''),nullif(v_identity->>'variant',''),
    coalesce(nullif(v_package->>'netQuantityText',''),
      nullif(concat_ws(' ',v_package->>'netQuantity',v_package->>'unit'),' ')),
    nullif(v_result->>'manufacturer',''),v_result,
    coalesce(p_payload->'userCorrections','{}'::jsonb),
    coalesce(p_payload->'provenance','{}'::jsonb),p_payload
  )
  on conflict(requester_user_id,idempotency_key) do update
    set idempotency_key=excluded.idempotency_key
  returning * into v_request;

  insert into public.product_add_request_user_state(request_id,user_id)
    values(v_request.id,v_user) on conflict do nothing;
  insert into public.product_add_request_events(
    request_id,actor_type,actor_user_id,event_type,to_status,event_data
  ) values(v_request.id,'USER',v_user,'REQUEST_SUBMITTED','SUBMITTED',
    jsonb_build_object('source',v_request.source,'marketCountry',v_request.market_country_code));
  insert into public.user_notifications(
    admin_permission,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
  ) values(
    'CATALOG','PRODUCT_REQUEST_NEW','product_add_request',v_request.id::text,
    'Nowe zgłoszenie produktu',
    coalesce(v_request.product_name,'Produkt bez rozpoznanej nazwy'),
    '/admin/product-requests?request='||v_request.id,
    'product-request:new:'||v_request.id
  ) on conflict(dedupe_key) do nothing;
  return jsonb_build_object(
    'kind','product_request','requestId',v_request.id,
    'requestNumber',v_request.request_number,'status',v_request.status
  );
end;
$$;
revoke all on function public.gellatti_submit_product_request_v1(uuid,text,jsonb,text)
  from public,anon;
grant execute on function public.gellatti_submit_product_request_v1(uuid,text,jsonb,text)
  to authenticated;

create or replace function public.gellatti_register_product_request_evidence_v1(
  p_request_id uuid,
  p_kind text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size integer,
  p_checksum_sha256 text,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if not exists(select 1 from public.product_add_requests r
    where r.id=p_request_id and r.requester_user_id=v_user
      and r.status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED')) then
    raise exception 'open_owned_request_required';
  end if;
  if p_storage_path not like v_user::text||'/'||p_request_id::text||'/%' then
    raise exception 'invalid_evidence_path';
  end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf')
     or p_byte_size not between 1 and 10485760 then
    raise exception 'invalid_evidence_file';
  end if;
  if not exists(select 1 from storage.objects o
    where o.bucket_id='product-request-evidence' and o.name=p_storage_path) then
    raise exception 'evidence_object_not_found';
  end if;
  insert into public.product_add_request_evidence(
    request_id,owner_user_id,evidence_kind,storage_bucket,storage_path,mime_type,
    byte_size,checksum_sha256,evidence_payload,created_by_user_id
  ) values(
    p_request_id,v_user,p_kind,'product-request-evidence',p_storage_path,p_mime_type,
    p_byte_size,p_checksum_sha256,coalesce(p_payload,'{}'::jsonb),v_user
  ) returning id into v_id;
  insert into public.product_add_request_events(
    request_id,actor_type,actor_user_id,event_type,event_data
  ) values(p_request_id,'USER',v_user,'EVIDENCE_ADDED',jsonb_build_object(
    'evidenceId',v_id,'kind',p_kind,'mimeType',p_mime_type,'byteSize',p_byte_size
  ));
  return v_id;
end;
$$;
revoke all on function public.gellatti_register_product_request_evidence_v1(
  uuid,text,text,text,integer,text,jsonb
) from public,anon;
grant execute on function public.gellatti_register_product_request_evidence_v1(
  uuid,text,text,text,integer,text,jsonb
) to authenticated;

create or replace function public.gellatti_product_request_user_action_v1(
  p_request_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid:=auth.uid();
  v_request public.product_add_requests%rowtype;
  v_now timestamptz:=statement_timestamp();
begin
  select * into v_request from public.product_add_requests
    where id=p_request_id and requester_user_id=v_user for update;
  if v_request.id is null then raise exception 'owned_request_not_found'; end if;

  if p_action='ARCHIVE' then
    insert into public.product_add_request_user_state(request_id,user_id,user_archived_at)
      values(p_request_id,v_user,v_now)
      on conflict(request_id,user_id) do update set user_archived_at=v_now;
    insert into public.product_add_request_events(request_id,actor_type,actor_user_id,event_type,event_data)
      values(p_request_id,'USER',v_user,'USER_ARCHIVED','{}');
  elsif p_action='REOPEN' then
    insert into public.product_add_request_user_state(request_id,user_id,user_archived_at,reopened_at)
      values(p_request_id,v_user,null,v_now)
      on conflict(request_id,user_id) do update set user_archived_at=null,reopened_at=v_now;
    insert into public.product_add_request_events(request_id,actor_type,actor_user_id,event_type,event_data)
      values(p_request_id,'USER',v_user,'USER_REOPENED','{}');
  elsif p_action='CANCEL' then
    if v_request.status in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED') then
      raise exception 'request_already_terminal';
    end if;
    update public.product_add_requests set status='USER_CANCELED',resolved_at=v_now
      where id=p_request_id;
    insert into public.product_add_request_events(
      request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
    ) values(p_request_id,'USER',v_user,'REQUEST_CANCELED',v_request.status,'USER_CANCELED',
      jsonb_build_object('reason',nullif(p_payload->>'reason','')));
    insert into public.user_notifications(
      admin_permission,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
    ) values('CATALOG','PRODUCT_REQUEST_CANCELED','product_add_request',p_request_id::text,
      'Użytkownik anulował zgłoszenie',coalesce(v_request.product_name,'Produkt'),
      '/admin/product-requests?request='||p_request_id,'product-request:canceled:'||p_request_id)
      on conflict(dedupe_key) do nothing;
  elsif p_action='RESUBMIT' then
    if v_request.status<>'NEEDS_INFO' then raise exception 'needs_info_request_required'; end if;
    update public.product_add_requests set
      status='RESUBMITTED',resubmitted_at=v_now,
      user_corrections=user_corrections||coalesce(p_payload->'corrections','{}'::jsonb)
    where id=p_request_id;
    update public.product_add_request_missing_fields set status='SUPPLIED',supplied_at=v_now
    where request_id=p_request_id and status='REQUESTED'
      and field_type in (select jsonb_array_elements_text(coalesce(p_payload->'suppliedFields','[]'::jsonb)));
    update public.product_add_request_user_state set user_archived_at=null
      where request_id=p_request_id and user_id=v_user;
    insert into public.product_add_request_events(
      request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
    ) values(p_request_id,'USER',v_user,'REQUEST_RESUBMITTED','NEEDS_INFO','RESUBMITTED',
      jsonb_build_object('suppliedFields',coalesce(p_payload->'suppliedFields','[]'::jsonb)));
    insert into public.user_notifications(
      admin_permission,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
    ) values('CATALOG','PRODUCT_REQUEST_RESUBMITTED','product_add_request',p_request_id::text,
      'Użytkownik uzupełnił zgłoszenie',coalesce(v_request.product_name,'Produkt'),
      '/admin/product-requests?request='||p_request_id,
      'product-request:resubmitted:'||p_request_id||':'||extract(epoch from v_now)::bigint)
      on conflict(dedupe_key) do nothing;
  else raise exception 'unsupported_user_action';
  end if;
  return jsonb_build_object('requestId',p_request_id,'action',p_action,'ok',true);
end;
$$;
revoke all on function public.gellatti_product_request_user_action_v1(uuid,text,jsonb)
  from public,anon;
grant execute on function public.gellatti_product_request_user_action_v1(uuid,text,jsonb)
  to authenticated;

create or replace function public.gellatti_notification_action_v1(
  p_notification_id uuid,
  p_action text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid:=auth.uid();
begin
  if not exists(select 1 from public.user_notifications n where n.id=p_notification_id and (
    n.recipient_user_id=v_user or (
      n.admin_permission is not null and public.gellatti_admin_has_permission_v1(n.admin_permission,v_user)
    )
  )) then raise exception 'notification_not_accessible'; end if;
  insert into public.user_notification_receipts(notification_id,user_id,read_at,acknowledged_at,sound_played_at)
  values(
    p_notification_id,v_user,
    case when p_action in ('READ','ACKNOWLEDGE','SOUND_PLAYED') then statement_timestamp() end,
    case when p_action='ACKNOWLEDGE' then statement_timestamp() end,
    case when p_action='SOUND_PLAYED' then statement_timestamp() end
  )
  on conflict(notification_id,user_id) do update set
    read_at=coalesce(user_notification_receipts.read_at,excluded.read_at),
    acknowledged_at=coalesce(user_notification_receipts.acknowledged_at,excluded.acknowledged_at),
    sound_played_at=coalesce(user_notification_receipts.sound_played_at,excluded.sound_played_at);
end;
$$;
revoke all on function public.gellatti_notification_action_v1(uuid,text) from public,anon;
grant execute on function public.gellatti_notification_action_v1(uuid,text) to authenticated;

create or replace function public.gellatti_set_admin_preference_v1(
  p_sales_sound_enabled boolean
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('ADMIN_READ') then
    raise exception 'administrator_required';
  end if;
  insert into public.admin_user_preferences(user_id,sales_sound_enabled)
    values(auth.uid(),p_sales_sound_enabled)
    on conflict(user_id) do update set sales_sound_enabled=excluded.sales_sound_enabled;
end;
$$;
revoke all on function public.gellatti_set_admin_preference_v1(boolean) from public,anon;
grant execute on function public.gellatti_set_admin_preference_v1(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Admin request decisions. Approval links only a canonical PR ingest result.
-- ---------------------------------------------------------------------------

create or replace function public.gellatti_admin_product_request_action_v1(
  p_request_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin uuid:=auth.uid();
  v_request public.product_add_requests%rowtype;
  v_now timestamptz:=statement_timestamp();
  v_product public.products%rowtype;
  v_field text;
  v_reason text:=nullif(trim(p_payload->>'reason'),'');
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG',v_admin) then
    raise exception 'catalog_administrator_required';
  end if;
  select * into v_request from public.product_add_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED') then
    raise exception 'request_already_terminal';
  end if;

  if p_action='ADMIN_EVIDENCE_PATCH' then
    if jsonb_typeof(p_payload->'patch')<>'object'
      or p_payload->'patch'='{}'::jsonb then raise exception 'non_empty_evidence_patch_required'; end if;
    if v_reason is null then raise exception 'evidence_reason_required'; end if;
    update public.product_add_requests set
      admin_verified_data=admin_verified_data||(p_payload->'patch'),
      assigned_admin_user_id=v_admin where id=p_request_id;
    insert into public.product_add_request_evidence(
      request_id,owner_user_id,evidence_kind,evidence_payload,provenance,created_by_admin_user_id
    ) values(
      p_request_id,v_request.requester_user_id,'OTHER',p_payload->'patch',
      jsonb_build_object('authority','ADMIN_VERIFIED_EVIDENCE_V1','reason',v_reason),v_admin
    );
    insert into public.product_add_request_events(
      request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
    ) values(p_request_id,'ADMIN',v_admin,'ADMIN_VERIFIED_EVIDENCE_ADDED',v_request.status,v_request.status,
      jsonb_build_object('patch',p_payload->'patch','reason',v_reason));
  elsif p_action='START_REVIEW' then
    if v_request.status not in ('SUBMITTED','RESUBMITTED') then raise exception 'request_not_reviewable'; end if;
    update public.product_add_requests set status='ADMIN_REVIEW',review_started_at=coalesce(review_started_at,v_now),
      assigned_admin_user_id=v_admin where id=p_request_id;
    insert into public.product_add_request_events(
      request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
    ) values(p_request_id,'ADMIN',v_admin,'ADMIN_REVIEW_STARTED',v_request.status,'ADMIN_REVIEW','{}');
  elsif p_action='REQUEST_INFO' then
    if v_request.status not in ('SUBMITTED','ADMIN_REVIEW','RESUBMITTED') then
      raise exception 'request_not_open_for_information';
    end if;
    if jsonb_array_length(coalesce(p_payload->'missingFields','[]'::jsonb))=0 and v_reason is null then
      raise exception 'missing_fields_or_explanation_required';
    end if;
    for v_field in select jsonb_array_elements_text(coalesce(p_payload->'missingFields','[]'::jsonb)) loop
      insert into public.product_add_request_missing_fields(
        request_id,field_type,instruction,requested_by_admin_user_id
      ) values(p_request_id,v_field,v_reason,v_admin)
      on conflict do nothing;
    end loop;
    update public.product_add_requests set status='NEEDS_INFO',needs_info_at=v_now,
      assigned_admin_user_id=v_admin,admin_note=v_reason where id=p_request_id;
    insert into public.product_add_request_events(
      request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
    ) values(p_request_id,'ADMIN',v_admin,'MORE_INFORMATION_REQUESTED',v_request.status,'NEEDS_INFO',
      jsonb_build_object('missingFields',coalesce(p_payload->'missingFields','[]'::jsonb),'note',v_reason));
    insert into public.user_notifications(
      recipient_user_id,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
    ) values(v_request.requester_user_id,'PRODUCT_REQUEST_NEEDS_INFO','product_add_request',p_request_id::text,
      'Potrzebujemy jeszcze informacji o produkcie',
      'Produkt zostanie dodany wyłącznie wtedy, gdy będziemy mogli jednoznacznie ustalić jego tożsamość i potwierdzić dane wymagane przez Gellatti.',
      '/account?request='||p_request_id,'product-request:needs-info:'||p_request_id||':'||extract(epoch from v_now)::bigint);
  elsif p_action='REJECT' then
    if v_reason is null then raise exception 'rejection_reason_required'; end if;
    if v_request.status in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED') then
      raise exception 'request_already_terminal';
    end if;
    update public.product_add_requests set status='REJECTED',rejection_reason=v_reason,
      assigned_admin_user_id=v_admin,resolved_at=v_now where id=p_request_id;
    insert into public.product_add_request_events(
      request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
    ) values(p_request_id,'ADMIN',v_admin,'REQUEST_REJECTED',v_request.status,'REJECTED',
      jsonb_build_object('reason',v_reason));
    insert into public.user_notifications(
      recipient_user_id,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
    ) values(v_request.requester_user_id,'PRODUCT_REQUEST_REJECTED','product_add_request',p_request_id::text,
      'Zgłoszenie produktu zostało odrzucone',v_reason,'/account?request='||p_request_id,
      'product-request:rejected:'||p_request_id) on conflict(dedupe_key) do nothing;
  elsif p_action in ('DUPLICATE','APPROVE_LINK') then
    select * into v_product from public.products where id=(p_payload->>'productId')::uuid
      and is_active and merged_into_product_id is null;
    if v_product.id is null then raise exception 'canonical_product_not_found'; end if;
    if p_action='DUPLICATE' then
      if v_product.visibility<>'shared' or v_product.canonical_verification_status='blocked' then
        raise exception 'approved_duplicate_required';
      end if;
      update public.product_add_requests set status='DUPLICATE',duplicate_product_id=v_product.id,
        assigned_admin_user_id=v_admin,resolved_at=v_now where id=p_request_id;
      insert into public.product_add_request_events(
        request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
      ) values(p_request_id,'ADMIN',v_admin,'REQUEST_MARKED_DUPLICATE',v_request.status,'DUPLICATE',
        jsonb_build_object('productId',v_product.id,'productCode',v_product.product_code));
    else
      if v_product.product_code not like 'PR-ING-%'
        or not exists(select 1 from public.product_ingest_events e
          where e.product_id=v_product.id and e.actor_user_id=v_admin and e.source='admin'
            and e.status in ('accepted','review')) then
        raise exception 'canonical_admin_pr_ingest_required';
      end if;
      if v_product.current_version_id is null or v_product.current_behavior_binding_id is null
        or v_product.canonical_verification_status='blocked'
        or not exists(
          select 1
          from public.product_versions pv
          join public.product_behavior_bindings pb
            on pb.id=v_product.current_behavior_binding_id
           and pb.product_id=v_product.id
           and pb.product_version_id=pv.id
           and pb.is_current
          where pv.id=v_product.current_version_id
            and coalesce((pv.facts->>'productAccuracy')::numeric,0)>=85
            and pb.binding_status='ready'
            and (
              (pb.behavior_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','STRUCTURAL_ONLY','PROTEIN_CONTRIBUTOR_ONLY')
                and pb.main_policy_status='COVERED'
                and pv.facts#>>'{productIntelligence,engineUsable}'='true')
              or (pb.behavior_role='TOPPING_ONLY'
                and coalesce((pb.profile_permissions->>'TOPPING')::boolean,false))
              or (pb.main_policy_status='COVERED'
                and pv.facts#>>'{productIntelligence,engineUsable}'='true'
                and coalesce((pb.profile_permissions->>'TOPPING')::boolean,false))
            )
        ) then
        raise exception 'publishable_product_authority_required';
      end if;
      update public.product_add_requests set status='APPROVED',approved_product_id=v_product.id,
        assigned_admin_user_id=v_admin,resolved_at=v_now where id=p_request_id;
      insert into public.user_contributed_products(user_id,request_id,product_id)
        values(v_request.requester_user_id,p_request_id,v_product.id);
      insert into public.product_add_request_events(
        request_id,actor_type,actor_user_id,event_type,from_status,to_status,event_data
      ) values(p_request_id,'ADMIN',v_admin,'REQUEST_APPROVED',v_request.status,'APPROVED',
        jsonb_build_object('productId',v_product.id,'productCode',v_product.product_code));
    end if;
    insert into public.user_product_relations(user_id,product_id,favorite)
      values(v_request.requester_user_id,v_product.id,true)
      on conflict(user_id,product_id) do update set favorite=true,updated_at=v_now;
    insert into public.user_notifications(
      recipient_user_id,notification_type,entity_type,entity_id,title,body,deep_link,payload,dedupe_key
    ) values(
      v_request.requester_user_id,
      case when p_action='DUPLICATE' then 'PRODUCT_REQUEST_DUPLICATE' else 'PRODUCT_REQUEST_APPROVED' end,
      'product_add_request',p_request_id::text,
      case when p_action='DUPLICATE' then 'Ten produkt jest już w Gellatti' else 'Twój produkt został dodany do Gellatti.' end,
      'Artykuł: '||coalesce(v_product.product_code,v_product.id::text)||E'\nNazwa: '||v_product.product_name_display,
      '/products?product='||v_product.id,
      jsonb_build_object('productId',v_product.id,'productCode',v_product.product_code),
      'product-request:'||lower(p_action)||':'||p_request_id
    ) on conflict(dedupe_key) do nothing;
  else raise exception 'unsupported_admin_action';
  end if;

  perform public.gellatti_write_audit_v1(
    'product_request.'||lower(p_action),'product_add_requests',p_request_id::text,
    jsonb_build_object('beforeStatus',v_request.status,'payload',coalesce(p_payload,'{}'::jsonb)),
    v_reason,p_request_id::text,'admin',v_admin::text
  );
  return jsonb_build_object('requestId',p_request_id,'action',p_action,'ok',true);
end;
$$;
revoke all on function public.gellatti_admin_product_request_action_v1(uuid,text,jsonb)
  from public,anon;
grant execute on function public.gellatti_admin_product_request_action_v1(uuid,text,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Partner management RPCs: one accepted Partner spine, maximum 3 codes.
-- ---------------------------------------------------------------------------

create or replace function public.gellatti_activate_partner_for_user_v1(
  p_user_id uuid,
  p_display_name text,
  p_slug text,
  p_reason text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_partner uuid; v_application uuid; v_slug text:=lower(trim(p_slug));
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then
    raise exception 'partner_administrator_required';
  end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_not_found'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' or v_slug in (
    'admin','api','login','logout','home','pro','partner','products','recipes',
    'settings','account','auth','pricing','community','gellatti','pinguino'
  ) then raise exception 'invalid_partner_slug'; end if;
  select id into v_partner from public.partners where user_id=p_user_id;
  if v_partner is null then
    insert into public.partner_applications(
      user_id,status,application_data,submitted_at,reviewed_at,reviewed_by,decision_reason
    ) values(
      p_user_id,'approved',jsonb_build_object('invitedByAdmin',v_admin,'displayName',p_display_name,'slug',v_slug),
      statement_timestamp(),statement_timestamp(),v_admin::text,p_reason
    ) returning id into v_application;
    insert into public.partners(user_id,application_id,status)
      values(p_user_id,v_application,'active') returning id into v_partner;
  else
    update public.partners set status='active' where id=v_partner;
  end if;
  insert into public.partner_public_profiles(partner_id,slug,display_name,updated_by_user_id)
    values(v_partner,v_slug,trim(p_display_name),v_admin)
    on conflict(partner_id) do update set slug=excluded.slug,display_name=excluded.display_name,
      moderation_status='APPROVED',updated_by_user_id=v_admin;
  insert into public.entitlements(user_id,scope,source_type,source_id,granted_by,metadata)
    select p_user_id,s.scope,'approved_partner',v_partner,v_admin::text,jsonb_build_object('partnerId',v_partner)
    from (values('home'),('pro'),('partner')) s(scope)
    on conflict do nothing;
  insert into public.user_notifications(
    recipient_user_id,notification_type,entity_type,entity_id,title,body,deep_link,dedupe_key
  ) values(p_user_id,'PARTNER_ACTIVATED','partners',v_partner::text,
    'Tryb Partner jest aktywny','Masz bezpłatny dostęp Home i Pro oraz panel Partner.',
    '/partner','partner:activated:'||v_partner) on conflict(dedupe_key) do nothing;
  perform public.gellatti_write_audit_v1('partner.activate','partners',v_partner::text,
    jsonb_build_object('userId',p_user_id,'slug',v_slug),p_reason,v_partner::text,'admin',v_admin::text);
  return v_partner;
end;
$$;
revoke all on function public.gellatti_activate_partner_for_user_v1(uuid,text,text,text)
  from public,anon;
grant execute on function public.gellatti_activate_partner_for_user_v1(uuid,text,text,text)
  to authenticated;

create or replace function public.gellatti_admin_partner_status_v1(
  p_partner_id uuid,
  p_status text,
  p_reason text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_admin uuid:=auth.uid(); v_user uuid;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER',v_admin) then
    raise exception 'partner_administrator_required';
  end if;
  if p_status not in ('active','suspended','terminated') or nullif(trim(p_reason),'') is null then
    raise exception 'valid_status_and_reason_required';
  end if;
  update public.partners set status=p_status where id=p_partner_id returning user_id into v_user;
  if v_user is null then raise exception 'partner_not_found'; end if;
  if p_status='active' then
    insert into public.entitlements(user_id,scope,source_type,source_id,granted_by,metadata)
      select v_user,s.scope,'approved_partner',p_partner_id,v_admin::text,jsonb_build_object('partnerId',p_partner_id)
      from (values('home'),('pro'),('partner')) s(scope) on conflict do nothing;
  else
    update public.entitlements set status='revoked',revoked_by=v_admin::text,revoke_reason=p_reason
      where user_id=v_user and source_type='approved_partner' and source_id=p_partner_id and status='active';
  end if;
  perform public.gellatti_write_audit_v1('partner.'||p_status,'partners',p_partner_id::text,
    jsonb_build_object('status',p_status),p_reason,p_partner_id::text,'admin',v_admin::text);
end;
$$;
revoke all on function public.gellatti_admin_partner_status_v1(uuid,text,text) from public,anon;
grant execute on function public.gellatti_admin_partner_status_v1(uuid,text,text) to authenticated;

create or replace function public.gellatti_partner_manage_code_v1(
  p_action text,
  p_code text,
  p_label text default null,
  p_code_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_partner uuid; v_slug text:=lower(trim(p_code)); v_id uuid;
begin
  select id into v_partner from public.partners where user_id=auth.uid() and status='active';
  if v_partner is null then raise exception 'active_partner_required'; end if;
  if p_action='CREATE' then
    if v_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'partner_code_invalid'; end if;
    insert into public.partner_codes(partner_id,code,slug,status)
      values(v_partner,v_slug,v_slug,'active') returning id into v_id;
    perform public.gellatti_write_audit_v1('partner_code.create','partner_codes',v_id::text,
      jsonb_build_object('code',v_slug,'label',nullif(trim(p_label),'')),null,v_partner::text,'user',auth.uid()::text);
  elsif p_action='ARCHIVE' then
    update public.partner_codes set status='retired' where id=p_code_id and partner_id=v_partner
      and status='active' returning id into v_id;
    if v_id is null then raise exception 'active_owned_code_not_found'; end if;
    perform public.gellatti_write_audit_v1('partner_code.archive','partner_codes',v_id::text,
      '{}'::jsonb,null,v_partner::text,'user',auth.uid()::text);
  else raise exception 'unsupported_code_action'; end if;
  return jsonb_build_object('id',v_id,'partnerId',v_partner,'action',p_action);
end;
$$;
revoke all on function public.gellatti_partner_manage_code_v1(text,text,text,uuid) from public,anon;
grant execute on function public.gellatti_partner_manage_code_v1(text,text,text,uuid) to authenticated;

create or replace function public.gellatti_partner_update_profile_v1(
  p_profile jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_partner uuid; v_socials jsonb:=coalesce(p_profile->'socialLinks','{}'::jsonb); v_key text; v_value text;
begin
  select id into v_partner from public.partners where user_id=auth.uid() and status='active';
  if v_partner is null then raise exception 'active_partner_required'; end if;
  if jsonb_typeof(v_socials)<>'object' then raise exception 'invalid_social_links'; end if;
  for v_key,v_value in select key,value#>>'{}' from jsonb_each(v_socials) loop
    if v_key not in ('instagram','tiktok','facebook','youtube','x','pinterest')
      or (v_value is not null and v_value !~ '^https://') then raise exception 'invalid_social_link'; end if;
  end loop;
  if coalesce(nullif(trim(p_profile->>'defaultDestinationPath'),''),'/subscription')
    not in ('/subscription','/community','/partner') then
    raise exception 'default_destination_not_allowed';
  end if;
  update public.partner_public_profiles set
    display_name=trim(p_profile->>'displayName'),
    short_description=nullif(trim(p_profile->>'shortDescription'),''),
    website_url=nullif(trim(p_profile->>'websiteUrl'),''),
    social_links=v_socials,
    logo_path=coalesce(nullif(trim(p_profile->>'logoPath'),''),logo_path),
    default_destination_path=coalesce(nullif(trim(p_profile->>'defaultDestinationPath'),''),default_destination_path),
    moderation_status='UNDER_REVIEW',
    updated_by_user_id=auth.uid()
  where partner_id=v_partner;
  if not found then raise exception 'partner_profile_not_found'; end if;
  return (select to_jsonb(p) from public.partner_public_profiles p where p.partner_id=v_partner);
end;
$$;
revoke all on function public.gellatti_partner_update_profile_v1(jsonb) from public,anon;
grant execute on function public.gellatti_partner_update_profile_v1(jsonb) to authenticated;

create or replace function public.gellatti_partner_create_content_link_v1(
  p_partner_code_id uuid,
  p_destination_type text,
  p_destination_path text,
  p_label text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_partner uuid; v_id uuid; v_slug text;
begin
  select p.id into v_partner from public.partners p join public.partner_codes c on c.partner_id=p.id
    where p.user_id=auth.uid() and p.status='active' and c.id=p_partner_code_id and c.status='active';
  if v_partner is null then raise exception 'active_owned_partner_code_required'; end if;
  if p_destination_type not in ('PUBLIC_PROFILE','COMMUNITY_RECIPE','SHARED_RECIPE','PRICING','PUBLIC_PAGE')
    or p_destination_path not like '/%' or p_destination_path like '//%'
    or not (
      p_destination_path='/subscription' or p_destination_path='/community'
      or p_destination_path='/partner'
      or p_destination_path like '/@%'
      or p_destination_path like '/share/%'
    ) then raise exception 'destination_not_allowed'; end if;
  v_slug:=lower(encode(gen_random_bytes(12),'hex'));
  insert into public.partner_content_links(
    partner_id,partner_code_id,link_slug,label,destination_type,destination_path
  ) values(v_partner,p_partner_code_id,v_slug,nullif(trim(p_label),''),p_destination_type,p_destination_path)
    returning id into v_id;
  return jsonb_build_object('id',v_id,'linkSlug',v_slug,'destinationPath',p_destination_path);
end;
$$;
revoke all on function public.gellatti_partner_create_content_link_v1(uuid,text,text,text)
  from public,anon;
grant execute on function public.gellatti_partner_create_content_link_v1(uuid,text,text,text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Admin operational read models (safe projections, no private recipes)
-- ---------------------------------------------------------------------------

create or replace function public.gellatti_admin_overview_v1()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if not public.gellatti_admin_has_permission_v1('ADMIN_READ') then
    raise exception 'administrator_required';
  end if;
  select jsonb_build_object(
    'users',jsonb_build_object(
      'today',(select count(*) from auth.users where created_at>=date_trunc('day',statement_timestamp())),
      'days7',(select count(*) from auth.users where created_at>=statement_timestamp()-interval '7 days'),
      'days30',(select count(*) from auth.users where created_at>=statement_timestamp()-interval '30 days')
    ),
    'subscriptions',jsonb_build_object(
      'active',(select count(*) from public.customer_subscriptions where status in ('active','trialing')),
      'pastDue',(select count(*) from public.customer_subscriptions where status='past_due'),
      'cancelAtPeriodEnd',(select count(*) from public.customer_subscriptions where cancel_at_period_end),
      'newPaid',(select count(*) from public.stripe_webhook_events where state='processed'
        and event_type='invoice.paid' and payload#>>'{data,object,billing_reason}'='subscription_create'),
      'renewals',(select count(*) from public.stripe_webhook_events where state='processed'
        and event_type='invoice.paid' and payload#>>'{data,object,billing_reason}'='subscription_cycle'),
      'failedPayments',(select count(*) from public.stripe_webhook_events where state='processed'
        and event_type='invoice.payment_failed'),
      'cancellations',(select count(*) from public.stripe_webhook_events where state='processed'
        and event_type='customer.subscription.deleted'),
      'refunds',(select count(*) from public.stripe_webhook_events where state='processed'
        and event_type='refund.created'),
      'grossRevenueCents',coalesce((select sum(nullif(payload#>>'{data,object,amount_paid}','')::bigint)
        from public.stripe_webhook_events where state='processed' and event_type='invoice.paid'),0),
      'refundCents',coalesce((select sum(nullif(payload#>>'{data,object,amount}','')::bigint)
        from public.stripe_webhook_events where state='processed' and event_type='refund.created'),0)
    ),
    'productRequests',jsonb_build_object(
      'open',(select count(*) from public.product_add_requests where status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED')),
      'waitingAdmin',(select count(*) from public.product_add_requests where status in ('SUBMITTED','RESUBMITTED')),
      'waitingUser',(select count(*) from public.product_add_requests where status='NEEDS_INFO'),
      'oldest',(select min(submitted_at) from public.product_add_requests where status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED')),
      'approvedToday',(select count(*) from public.product_add_requests where status='APPROVED' and resolved_at>=date_trunc('day',statement_timestamp()))
    ),
    'partners',jsonb_build_object(
      'active',(select count(*) from public.partners where status='active'),
      'pendingPayouts',(select count(*) from public.partner_payouts where status in ('pending','processing'))
    ),
    'operations',jsonb_build_object(
      'failedStripeWebhooks',(select count(*) from public.stripe_webhook_events where state in ('failed','dead_letter')),
      'activeImports',(select count(*) from public.product_import_runs where status in ('ANALYZING','READY','IMPORTING','CANCELLING','ROLLING_BACK')),
      'failedImports',(select count(*) from public.product_import_runs where status='FAILED'),
      'openCommunityReports',(select count(*) from public.community_reports where status in ('open','reviewing'))
    ),
    'environment','staging',
    'knownIncidents',jsonb_build_array(jsonb_build_object(
      'provider','OpenAI','code','credit_balance_exhausted','scope','suspended INTIMPORT recognition','coreWorkflowBlocked',false
    ))
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.gellatti_admin_overview_v1() from public,anon;
grant execute on function public.gellatti_admin_overview_v1() to authenticated;

create or replace function public.gellatti_admin_product_requests_v1(
  p_status text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('CATALOG') then
    raise exception 'catalog_administrator_required';
  end if;
  return coalesce((select jsonb_agg(row_data order by submitted_at desc) from (
    select r.submitted_at,jsonb_build_object(
      'id',r.id,'requestNumber',r.request_number,'status',r.status,
      'requesterUserId',r.requester_user_id,'requesterEmail',u.email,
      'marketCountryCode',r.market_country_code,'countryOfOrigin',r.country_of_origin,
      'ean',r.detected_ean,'name',r.product_name,'brand',r.brand,'variant',r.variant,
      'netQuantity',r.net_quantity,'manufacturer',r.manufacturer,
      'assignedAdminUserId',r.assigned_admin_user_id,'submittedAt',r.submitted_at,
      'updatedAt',r.updated_at,'adminNote',r.admin_note,'rejectionReason',r.rejection_reason,
      'duplicateProductId',r.duplicate_product_id,'approvedProductId',r.approved_product_id,
      'extractedData',r.extracted_data,'userCorrections',r.user_corrections,
      'adminVerifiedData',r.admin_verified_data,
      'scannerProvenance',r.scanner_provenance,
      'missingFields',coalesce((select jsonb_agg(jsonb_build_object(
        'id',m.id,'fieldType',m.field_type,'status',m.status,'instruction',m.instruction,
        'requestedAt',m.requested_at,'suppliedAt',m.supplied_at
      ) order by m.requested_at) from public.product_add_request_missing_fields m where m.request_id=r.id),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'actorType',e.actor_type,'actorUserId',e.actor_user_id,
        'eventType',e.event_type,'fromStatus',e.from_status,'toStatus',e.to_status,
        'data',e.event_data,'createdAt',e.created_at
      ) order by e.created_at,e.id) from public.product_add_request_events e where e.request_id=r.id),'[]'::jsonb),
      'evidence',coalesce((select jsonb_agg(jsonb_build_object(
        'id',ev.id,'kind',ev.evidence_kind,'storagePath',ev.storage_path,'sourceUrl',ev.source_url,
        'mimeType',ev.mime_type,'byteSize',ev.byte_size,'payload',ev.evidence_payload,
        'provenance',ev.provenance,'createdAt',ev.created_at
      ) order by ev.created_at) from public.product_add_request_evidence ev where ev.request_id=r.id),'[]'::jsonb)
    ) row_data
    from public.product_add_requests r
    join auth.users u on u.id=r.requester_user_id
    where p_status is null or p_status='ALL' or r.status=p_status
    order by r.submitted_at desc limit least(greatest(coalesce(p_limit,100),1),500)
  ) q),'[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_product_requests_v1(text,integer) from public,anon;
grant execute on function public.gellatti_admin_product_requests_v1(text,integer) to authenticated;

create or replace function public.gellatti_admin_directory_v1(
  p_section text,
  p_limit integer default 100
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.gellatti_admin_has_permission_v1('ADMIN_READ') then raise exception 'administrator_required'; end if;
  if p_section='USERS' then
    return coalesce((select jsonb_agg(x order by x->>'createdAt' desc) from (
      select jsonb_build_object(
        'id',u.id,'email',u.email,'createdAt',u.created_at,'lastSignInAt',u.last_sign_in_at,
        'accountState',coalesce((select s.state from public.account_states s where s.user_id=u.id order by s.changed_at desc limit 1),'active'),
        'adminRole',(select a.role from public.admin_users a where a.user_id=u.id and a.revoked_at is null),
        'partnerStatus',(select p.status from public.partners p where p.user_id=u.id),
        'entitlements',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'scope',e.scope,'sourceType',e.source_type,'sourceId',e.source_id,'status',e.status,'endsAt',e.ends_at)) from public.entitlements e where e.user_id=u.id),'[]'::jsonb),
        'marketPreferences',(select to_jsonb(mp) from public.account_product_market_preferences mp where mp.user_id=u.id),
        'favoritesCount',(select count(*) from public.user_product_relations r where r.user_id=u.id and r.favorite),
        'requestsCount',(select count(*) from public.product_add_requests r where r.requester_user_id=u.id),
        'contributedCount',(select count(*) from public.user_contributed_products c where c.user_id=u.id)
      ) x from auth.users u order by u.created_at desc limit least(greatest(p_limit,1),500)
    ) q),'[]'::jsonb);
  elsif p_section='PARTNERS' then
    if not public.gellatti_admin_has_permission_v1('PARTNER') then raise exception 'partner_administrator_required'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'userId',p.user_id,'email',u.email,'status',p.status,'tier',p.tier,
      'connectAccountId',p.stripe_connect_account_id,'onboardingComplete',p.onboarding_complete,
      'payoutsEnabled',p.payouts_enabled,'profile',to_jsonb(pp),
      'codes',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.partner_codes c where c.partner_id=p.id),'[]'::jsonb),
      'links',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.partner_content_links l where l.partner_id=p.id),'[]'::jsonb),
      'clicks',(select count(*) from public.referral_clicks rc where rc.partner_id=p.id),
      'attributions',(select count(*) from public.referral_attributions ra where ra.partner_id=p.id),
      'pendingCommission',coalesce((select sum(ce.amount_cents) from public.commission_entries ce where ce.partner_id=p.id and ce.status in ('held','eligible')),0)
    ) order by p.created_at desc) from public.partners p join auth.users u on u.id=p.user_id
      left join public.partner_public_profiles pp on pp.partner_id=p.id),'[]'::jsonb);
  elsif p_section='FINANCE' then
    if not public.gellatti_admin_has_permission_v1('FINANCE') then raise exception 'finance_administrator_required'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'userId',s.user_id,'email',u.email,'offerKey',s.offer_key,'product',s.product,
      'cadence',s.cadence,'status',s.status,'amountCents',price.amount_cents,'currency',price.currency,
      'firstPaymentAt',(select min(e.received_at) from public.stripe_webhook_events e
        where e.state='processed' and e.event_type='invoice.paid'
          and e.payload#>>'{data,object,subscription}'=s.stripe_subscription_id),
      'latestPaymentAt',(select max(e.received_at) from public.stripe_webhook_events e
        where e.state='processed' and e.event_type='invoice.paid'
          and e.payload#>>'{data,object,subscription}'=s.stripe_subscription_id),
      'periodStart',s.current_period_start,'periodEnd',s.current_period_end,
      'nextRenewal',case when not s.cancel_at_period_end then s.current_period_end end,
      'cancelAtPeriodEnd',s.cancel_at_period_end,'cancelledAt',s.cancelled_at,
      'stripeCustomerId',s.stripe_customer_id,'stripeSubscriptionId',s.stripe_subscription_id,
      'latestInvoiceId',s.latest_invoice_id,'livemode',s.livemode,
      'attributionId',s.attribution_id,
      'partnerAttribution',(select jsonb_build_object('partnerId',ra.partner_id,'codeId',ra.partner_code_id)
        from public.referral_attributions ra where ra.id=s.attribution_id),
      'commissionEffect',coalesce((select sum(ce.amount_cents) from public.commission_entries ce
        where ce.subscription_id=s.id),0)+coalesce((select sum(adj.amount_cents)
        from public.commission_adjustments adj join public.commission_entries ce on ce.id=adj.commission_entry_id
        where ce.subscription_id=s.id),0),
      'refundStatus',case when exists(select 1 from public.commission_entries ce
        join public.commission_adjustments adj on adj.commission_entry_id=ce.id
        where ce.subscription_id=s.id and adj.kind in ('refund_reversal','dispute_reversal')) then 'ADJUSTED' else 'NONE' end,
      'webhookHistory',coalesce((select jsonb_agg(jsonb_build_object(
        'eventId',e.event_id,'type',e.event_type,'state',e.state,'receivedAt',e.received_at,'lastError',e.last_error
      ) order by e.received_at desc) from public.stripe_webhook_events e
        where e.payload#>>'{data,object,subscription}'=s.stripe_subscription_id
          or e.payload#>>'{data,object,id}'=s.latest_invoice_id),'[]'::jsonb)
    ) order by s.updated_at desc) from public.customer_subscriptions s join auth.users u on u.id=s.user_id
      left join public.billing_price_catalog price on price.offer_key=s.offer_key),'[]'::jsonb);
  elsif p_section='AUDIT' then
    return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select * from public.audit_log order by created_at desc limit least(greatest(p_limit,1),500)) a),'[]'::jsonb);
  elsif p_section='COMMUNITY' then
    if not public.gellatti_admin_has_permission_v1('CONTENT') then raise exception 'content_moderator_required'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'reason',r.reason,'detail',r.detail,'status',r.status,'createdAt',r.created_at,
      'publicationId',r.publication_id,'publicationTitle',cp.title,'publicationStatus',cp.status,
      'creatorProfileId',coalesce(r.creator_profile_id,cp.creator_profile_id),
      'creatorDisplayName',creator.display_name,
      'partnerAttribution',case when pcl.id is null then null else jsonb_build_object(
        'linkId',pcl.id,'partnerId',pcl.partner_id,'codeId',pcl.partner_code_id
      ) end
    ) order by r.created_at desc)
      from public.community_reports r
      left join public.community_publications cp on cp.id=r.publication_id
      left join public.creator_profiles creator on creator.id=coalesce(r.creator_profile_id,cp.creator_profile_id)
      left join public.partner_content_links pcl on pcl.destination_type='COMMUNITY_RECIPE'
        and pcl.destination_path like '%/'||cp.slug
    ),'[]'::jsonb);
  else raise exception 'unsupported_admin_section'; end if;
end;
$$;
revoke all on function public.gellatti_admin_directory_v1(text,integer) from public,anon;
grant execute on function public.gellatti_admin_directory_v1(text,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Private request evidence bucket. Retention semantics remain request-owned;
-- no object is public and Admin obtains short-lived signed URLs server-side.
-- ---------------------------------------------------------------------------

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'product-request-evidence','product-request-evidence',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists product_request_evidence_upload_own on storage.objects;
create policy product_request_evidence_upload_own on storage.objects
  for insert to authenticated with check (
    bucket_id='product-request-evidence'
    and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.product_add_requests r
      where r.id=((storage.foldername(name))[2])::uuid
        and r.requester_user_id=auth.uid()
        and r.status not in ('APPROVED','REJECTED','DUPLICATE','USER_CANCELED'))
  );
drop policy if exists product_request_evidence_read_own on storage.objects;
create policy product_request_evidence_read_own on storage.objects
  for select to authenticated using (
    bucket_id='product-request-evidence'
    and (storage.foldername(name))[1]=auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 12. Immutable-history guards
-- ---------------------------------------------------------------------------

create or replace function public.gellatti_reject_mutation_v1()
returns trigger language plpgsql as $$
begin raise exception 'immutable_history'; end;
$$;
drop trigger if exists product_add_request_events_immutable on public.product_add_request_events;
create trigger product_add_request_events_immutable before update or delete on public.product_add_request_events
  for each row execute function public.gellatti_reject_mutation_v1();

-- No client may use the historical Scanner creation reservation RPC as a new
-- product-creation authority. The Edge function is changed in the same release;
-- this grant boundary closes forged authenticated calls.
revoke execute on function public.reserve_product_scan_creation_v1(uuid,uuid,text)
  from authenticated, anon, public;
revoke execute on function public.complete_product_scan_creation_v1(
  uuid,uuid,uuid,boolean,uuid,uuid,text,jsonb
) from authenticated, anon, public;

-- Mapper remains unchanged and receives no grants or writes in this migration.
