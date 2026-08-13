-- 0043_global_product_catalog.sql
-- Shared commercial-product catalog built from authenticated OCR submissions.
-- It is deliberately separate from the immutable Mapper `mapper_basement` (PI Base),
-- the legacy owner-private `products` intake rows, and customer-private pricing.
-- No table below stores supplier terms, private price, notes, stock, purchase history,
-- recipe use or the submitter's identity in a customer-readable row.

create table if not exists public.global_catalog_products (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('verified','manual_unverified','blocked')),
  verification_method text not null check (verification_method in ('automatic','human','manual_unverified','blocked')),
  provenance text not null check (provenance in ('ocr_automatic','manual_completion','catalog_import','admin_corrected','human_verified','automatic_verified')),
  display_name text not null,
  original_name text,
  original_language text,
  brand text,
  explicitly_unbranded boolean not null default false,
  canonical_family text,
  category text,
  mapped_ingredient_id text,
  country_of_origin text,
  normalized_identity text not null,
  composition_fingerprint text,
  missing_fields text[] not null default '{}',
  invalid_fields text[] not null default '{}',
  public_data jsonb not null default '{}'::jsonb,
  search_document text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- RED is allowed to retain an honestly missing brand decision. Usable BLUE/GREEN
  -- must have exactly one of a real brand or an explicit unbranded declaration.
  check (
    status = 'blocked'
    or ((brand is not null and not explicitly_unbranded)
      or (brand is null and explicitly_unbranded))
  ),
  check (status <> 'verified' or (verification_method in ('automatic','human') and cardinality(missing_fields) = 0 and cardinality(invalid_fields) = 0))
);
create index if not exists global_catalog_products_search_idx on public.global_catalog_products using gin (to_tsvector('simple', search_document));
create index if not exists global_catalog_products_identity_idx on public.global_catalog_products (normalized_identity);
create index if not exists global_catalog_products_family_idx on public.global_catalog_products (canonical_family, status);
drop trigger if exists global_catalog_products_touch on public.global_catalog_products;
create trigger global_catalog_products_touch before update on public.global_catalog_products
  for each row execute function public.touch_updated_at();

create table if not exists public.global_catalog_product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.global_catalog_products(id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  provenance text not null,
  verification_method text not null,
  effective_at timestamptz not null default now(),
  supersedes uuid references public.global_catalog_product_versions(id),
  created_at timestamptz not null default now(),
  unique (product_id, version)
);
create index if not exists global_catalog_versions_product_idx on public.global_catalog_product_versions (product_id, version desc);

create table if not exists public.global_catalog_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.global_catalog_products(id) on delete cascade,
  ean text,
  net_quantity numeric,
  net_unit text check (net_unit is null or net_unit in ('g','kg','ml','l')),
  market text not null,
  package_language text,
  package_revision text,
  original_package_name text,
  image_phashes text[] not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  check (ean is null or ean ~ '^[0-9]{8,14}$'),
  check (net_quantity is null or net_quantity > 0)
);
create unique index if not exists global_catalog_variants_ean_uniq on public.global_catalog_variants (ean) where ean is not null;
create index if not exists global_catalog_variants_product_idx on public.global_catalog_variants (product_id, market);

create table if not exists public.global_catalog_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.global_catalog_products(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  language text,
  kind text not null check (kind in ('original_name','localized_name','canonical_family','synonym','ocr_variant')),
  created_at timestamptz not null default now(),
  unique (product_id, normalized_alias, language)
);
create index if not exists global_catalog_aliases_search_idx on public.global_catalog_aliases (normalized_alias);

create table if not exists public.global_catalog_retailer_offers (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.global_catalog_variants(id) on delete cascade,
  retailer text not null,
  market text not null,
  source_url text,
  reference_price numeric,
  currency text,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  check (reference_price is null or reference_price >= 0),
  check ((reference_price is null and currency is null) or (reference_price is not null and currency ~ '^[A-Z]{3}$'))
);
create index if not exists global_catalog_offers_variant_idx on public.global_catalog_retailer_offers (variant_id, market, retailer);

-- Private account relationships. None of these rows is customer-readable across accounts.
create table if not exists public.global_catalog_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_key text not null,
  entity_kind text not null check (entity_kind in ('pi_base','commercial_product')),
  catalog_product_id uuid references public.global_catalog_products(id) on delete cascade,
  mapper_ingredient_id text,
  created_at timestamptz not null default now(),
  unique (user_id, entity_key),
  check ((entity_kind = 'pi_base' and mapper_ingredient_id is not null and catalog_product_id is null and entity_key = 'pi:' || mapper_ingredient_id)
      or (entity_kind = 'commercial_product' and catalog_product_id is not null and mapper_ingredient_id is null and entity_key = 'catalog:' || catalog_product_id::text))
);
create unique index if not exists global_catalog_favorite_commercial_uniq
  on public.global_catalog_favorites (user_id, catalog_product_id) where catalog_product_id is not null;
create unique index if not exists global_catalog_favorite_base_uniq
  on public.global_catalog_favorites (user_id, mapper_ingredient_id) where mapper_ingredient_id is not null;

create table if not exists public.global_catalog_recent_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_key text not null,
  entity_kind text not null check (entity_kind in ('pi_base','commercial_product')),
  catalog_product_id uuid references public.global_catalog_products(id) on delete cascade,
  mapper_ingredient_id text,
  last_used_at timestamptz not null default now(),
  use_count integer not null default 1 check (use_count >= 1),
  unique (user_id, entity_key),
  check ((entity_kind = 'pi_base' and mapper_ingredient_id is not null and catalog_product_id is null and entity_key = 'pi:' || mapper_ingredient_id)
      or (entity_kind = 'commercial_product' and catalog_product_id is not null and mapper_ingredient_id is null and entity_key = 'catalog:' || catalog_product_id::text))
);
create unique index if not exists global_catalog_recent_commercial_uniq
  on public.global_catalog_recent_usage (user_id, catalog_product_id) where catalog_product_id is not null;
create unique index if not exists global_catalog_recent_base_uniq
  on public.global_catalog_recent_usage (user_id, mapper_ingredient_id) where mapper_ingredient_id is not null;

create table if not exists public.account_product_market_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_market text,
  additional_markets text[] not null default '{}',
  preferred_retailers text[] not null default '{}',
  default_scope text not null default 'my_markets_and_global'
    check (default_scope in ('my_markets','my_markets_and_global','global')),
  updated_at timestamptz not null default now(),
  check (primary_market is null or not (primary_market = any(additional_markets)))
);
drop trigger if exists account_product_market_preferences_touch on public.account_product_market_preferences;
create trigger account_product_market_preferences_touch before update on public.account_product_market_preferences
  for each row execute function public.touch_updated_at();

-- Private submissions retain submitter/evidence linkage. Shared product rows never do.
create table if not exists public.global_catalog_submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid not null references auth.users(id) on delete cascade,
  private_product_id uuid references public.products(id) on delete set null,
  ocr_session_id uuid references public.ocr_intake_sessions(id) on delete set null,
  catalog_product_id uuid references public.global_catalog_products(id) on delete set null,
  idempotency_key text not null,
  payload_hash text not null,
  source text not null check (source in ('ocr_automatic','manual_completion','catalog_import')),
  outcome text not null check (outcome in ('existing','created','likely_duplicate','blocked','rate_limited','failed')),
  market text,
  duplicate_decision text check (duplicate_decision is null or duplicate_decision in ('same','different')),
  distinguishing_evidence jsonb not null default '{}'::jsonb,
  -- Immutable server-captured OCR facts and archived evidence paths. This is
  -- owner-readable only; it is never joined into the shared catalog search.
  evidence_snapshot jsonb not null default '{}'::jsonb,
  result_snapshot jsonb not null default '{}'::jsonb,
  ip_hash text,
  device_hash text,
  created_at timestamptz not null default now(),
  unique (submitter_user_id, idempotency_key)
);
create index if not exists global_catalog_submissions_product_idx on public.global_catalog_submissions (catalog_product_id, created_at desc);
create index if not exists global_catalog_submissions_payload_idx on public.global_catalog_submissions (payload_hash, created_at desc);

-- Consolidated server-only review queue. One key aggregates repeated submissions.
create table if not exists public.global_catalog_review_cases (
  id uuid primary key default gen_random_uuid(),
  consolidation_key text not null unique,
  catalog_product_id uuid references public.global_catalog_products(id) on delete set null,
  kind text not null check (kind in ('manual_unverified','duplicate_dispute','verification_failed','correction','conflict','suspicious')),
  status text not null default 'open' check (status in ('open','needs_evidence','in_review','resolved','rejected')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  submission_count integer not null default 1 check (submission_count >= 1),
  markets text[] not null default '{}',
  missing_fields text[] not null default '{}',
  duplicate_candidates jsonb not null default '[]'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  latest_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists global_catalog_review_cases_touch on public.global_catalog_review_cases;
create trigger global_catalog_review_cases_touch before update on public.global_catalog_review_cases
  for each row execute function public.touch_updated_at();

create table if not exists public.global_catalog_review_case_submissions (
  case_id uuid not null references public.global_catalog_review_cases(id) on delete cascade,
  submission_id uuid not null references public.global_catalog_submissions(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (case_id, submission_id)
);

create table if not exists public.global_catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid references public.global_catalog_products(id) on delete set null,
  review_case_id uuid references public.global_catalog_review_cases(id) on delete set null,
  submission_id uuid references public.global_catalog_submissions(id) on delete set null,
  event_type text not null,
  actor_kind text not null check (actor_kind in ('system','customer','reviewer','migration')),
  actor_user_id uuid,
  payload jsonb not null default '{}'::jsonb,
  correlation_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.global_catalog_rate_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('ocr_scan','manual_candidate','review_escalation','duplicate_dispute')),
  idempotency_key text not null,
  payload_hash text,
  ip_hash text,
  device_hash text,
  created_at timestamptz not null default now(),
  unique (user_id, action, idempotency_key)
);
create index if not exists global_catalog_rate_user_idx on public.global_catalog_rate_events (user_id, action, created_at desc);
create index if not exists global_catalog_rate_ip_idx on public.global_catalog_rate_events (ip_hash, created_at desc) where ip_hash is not null;
create index if not exists global_catalog_rate_device_idx on public.global_catalog_rate_events (device_hash, created_at desc) where device_hash is not null;

create table if not exists public.global_catalog_trusted_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  multiplier integer not null default 5 check (multiplier between 1 and 100),
  reason text not null,
  granted_at timestamptz not null default now()
);

create table if not exists public.global_catalog_migration_ledger (
  source_kind text not null,
  source_id text not null,
  destination_product_id uuid references public.global_catalog_products(id) on delete set null,
  classification text not null check (classification in ('pi_base_gold','verified_green','manual_blue','blocked_red','ambiguous_report','skipped_private_only')),
  reason text not null,
  migrated_at timestamptz not null default now(),
  primary key (source_kind, source_id)
);

-- Review evidence is copied by the service-role edge function. There are no
-- customer policies on this bucket: a customer may see their original intake
-- files, but the durable review copy is server/reviewer evidence only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'global-catalog-evidence',
  'global-catalog-evidence',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- RLS: shared facts are authenticated-readable; there is no client DML path.
alter table public.global_catalog_products enable row level security;
alter table public.global_catalog_product_versions enable row level security;
alter table public.global_catalog_variants enable row level security;
alter table public.global_catalog_aliases enable row level security;
alter table public.global_catalog_retailer_offers enable row level security;
create policy global_catalog_products_read on public.global_catalog_products for select to authenticated using (is_active);
create policy global_catalog_versions_read on public.global_catalog_product_versions for select to authenticated using (exists (select 1 from public.global_catalog_products p where p.id = product_id and p.is_active));
create policy global_catalog_variants_read on public.global_catalog_variants for select to authenticated using (exists (select 1 from public.global_catalog_products p where p.id = product_id and p.is_active));
create policy global_catalog_aliases_read on public.global_catalog_aliases for select to authenticated using (exists (select 1 from public.global_catalog_products p where p.id = product_id and p.is_active));
create policy global_catalog_offers_read on public.global_catalog_retailer_offers for select to authenticated using (exists (select 1 from public.global_catalog_variants v join public.global_catalog_products p on p.id = v.product_id where v.id = variant_id and p.is_active));
grant select on public.global_catalog_products, public.global_catalog_product_versions, public.global_catalog_variants, public.global_catalog_aliases, public.global_catalog_retailer_offers to authenticated;

alter table public.global_catalog_favorites enable row level security;
alter table public.global_catalog_recent_usage enable row level security;
alter table public.account_product_market_preferences enable row level security;
create policy global_catalog_favorites_own on public.global_catalog_favorites for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (entity_kind='commercial_product' and exists (
        select 1 from public.global_catalog_products p where p.id=catalog_product_id and p.is_active
      ))
      or
      (entity_kind='pi_base' and exists (
        select 1 from public.mapper_basement m
        where m.ingredient_id=mapper_ingredient_id and m.is_active and m.approved_for_base
      ))
    )
  );
create policy global_catalog_recent_own on public.global_catalog_recent_usage for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (entity_kind='commercial_product' and exists (
        select 1 from public.global_catalog_products p where p.id=catalog_product_id and p.is_active
      ))
      or
      (entity_kind='pi_base' and exists (
        select 1 from public.mapper_basement m
        where m.ingredient_id=mapper_ingredient_id and m.is_active and m.approved_for_base
      ))
    )
  );
create policy account_product_market_preferences_own on public.account_product_market_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.global_catalog_favorites, public.global_catalog_recent_usage to authenticated;
grant select, insert, update, delete on public.account_product_market_preferences to authenticated;

alter table public.global_catalog_submissions enable row level security;
create policy global_catalog_submissions_own_read on public.global_catalog_submissions for select to authenticated using (submitter_user_id = auth.uid());
grant select on public.global_catalog_submissions to authenticated;

-- Queue, audit, rate, trust and migration are service-role only. RLS is enabled with no client policy/grant.
alter table public.global_catalog_review_cases enable row level security;
alter table public.global_catalog_review_case_submissions enable row level security;
alter table public.global_catalog_audit_events enable row level security;
alter table public.global_catalog_rate_events enable row level security;
alter table public.global_catalog_trusted_accounts enable row level security;
alter table public.global_catalog_migration_ledger enable row level security;

-- Search reads only public catalog facts plus the current caller's own relationships.
create or replace function public.search_global_catalog(
  p_query text,
  p_market text[] default '{}',
  p_favorites_only boolean default false,
  p_limit integer default 100
) returns table (
  id uuid, status text, verification_method text, display_name text, original_name text,
  original_language text, brand text, canonical_family text, category text,
  mapped_ingredient_id text, markets text[], retailers text[], eans text[], aliases text[],
  favorite boolean, recently_used_at timestamptz, missing_fields text[], public_data jsonb
) language sql stable security invoker set search_path = public as $$
  with q as (
    select lower(regexp_replace(translate(coalesce(p_query,''),
      'ąćęłńóśźżÁÀÂÄÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
      'acelnoszzAAAAAACEEEEIIIINOOOOOUUUUYY'), '[^a-zA-Z0-9]+', ' ', 'g')) as value
  ), facts as (
    select p.*,
      coalesce(array_agg(distinct v.market) filter (where v.market is not null), '{}') as markets,
      coalesce(array_agg(distinct o.retailer) filter (where o.retailer is not null), '{}') as retailers,
      coalesce(array_agg(distinct v.ean) filter (where v.ean is not null), '{}') as eans,
      coalesce(array_agg(distinct a.alias) filter (where a.alias is not null), '{}') as aliases
    from public.global_catalog_products p
    left join public.global_catalog_variants v on v.product_id = p.id and v.is_current
    left join public.global_catalog_retailer_offers o on o.variant_id = v.id
    left join public.global_catalog_aliases a on a.product_id = p.id
    where p.is_active
    group by p.id
  )
  select f.id, f.status, f.verification_method, f.display_name, f.original_name,
    f.original_language, f.brand, f.canonical_family, f.category, f.mapped_ingredient_id,
    f.markets, f.retailers, f.eans, f.aliases,
    (fav.user_id is not null) as favorite, recent.last_used_at, f.missing_fields, f.public_data
  from facts f cross join q
  left join public.global_catalog_favorites fav on fav.user_id = auth.uid() and fav.catalog_product_id = f.id
  left join public.global_catalog_recent_usage recent on recent.user_id = auth.uid() and recent.catalog_product_id = f.id
  where (q.value = '' or lower(f.search_document) like '%' || q.value || '%'
      or exists (select 1 from unnest(f.aliases) x where lower(x) like '%' || q.value || '%')
      or exists (select 1 from unnest(f.eans) x where x like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'))
    and (cardinality(p_market) = 0 or f.markets && p_market)
    and (not p_favorites_only or fav.user_id is not null)
  order by fav.user_id is not null desc, recent.last_used_at desc nulls last,
    f.status = 'verified' desc, f.display_name asc
  limit least(greatest(p_limit, 1), 200);
$$;
grant execute on function public.search_global_catalog(text,text[],boolean,integer) to authenticated;

-- Service-role-only rate reservation. The edge function supplies trusted IP/device hashes.
create or replace function public.reserve_global_catalog_rate_slot(
  p_actor_user_id uuid,
  p_action text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_device_hash text,
  p_risk_challenge_passed boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_multiplier integer := 1;
  v_now timestamptz := now();
  v_count integer;
  v_retry timestamptz;
begin
  if p_actor_user_id is null or p_action not in ('ocr_scan','manual_candidate','review_escalation','duplicate_dispute') then
    raise exception 'invalid catalog rate request';
  end if;
  select multiplier into v_multiplier from public.global_catalog_trusted_accounts where user_id = p_actor_user_id;
  v_multiplier := coalesce(v_multiplier, 1);
  if exists (select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('allowed', true, 'idempotent', true, 'retryAt', null);
  end if;
  if p_payload_hash is not null and exists (
    select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and payload_hash=p_payload_hash and created_at > v_now - interval '24 hours'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_payload', 'retryAt', null);
  end if;
  if p_action='ocr_scan' then
    select count(*), min(created_at)+interval '1 minute' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 minute';
    if v_count >= 3*v_multiplier then return jsonb_build_object('allowed',false,'reason','burst','retryAt',v_retry); end if;
    select count(*), min(created_at)+interval '1 hour' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 hour';
    if v_count >= 20*v_multiplier then return jsonb_build_object('allowed',false,'reason','hourly','retryAt',v_retry); end if;
    select count(*), min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count >= 100*v_multiplier then return jsonb_build_object('allowed',false,'reason','daily','retryAt',v_retry); end if;
  elsif p_action='manual_candidate' then
    select count(*), min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count >= 10*v_multiplier then return jsonb_build_object('allowed',false,'reason','daily','retryAt',v_retry); end if;
  elsif p_action='duplicate_dispute' then
    select count(*), min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count >= 2*v_multiplier then return jsonb_build_object('allowed',false,'reason','daily','retryAt',v_retry); end if;
  else
    select count(*), min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count >= 2*v_multiplier then return jsonb_build_object('allowed',false,'reason','daily','retryAt',v_retry); end if;
    if exists (select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 hour') then
      select max(created_at)+interval '1 hour' into v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action;
      return jsonb_build_object('allowed',false,'reason','cooldown','retryAt',v_retry);
    end if;
    select count(*), min(created_at)+interval '30 days' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '30 days';
    if v_count >= 10*v_multiplier then return jsonb_build_object('allowed',false,'reason','rolling_30d','retryAt',v_retry); end if;
  end if;
  if not p_risk_challenge_passed and p_ip_hash is not null and (select count(*) from public.global_catalog_rate_events where ip_hash=p_ip_hash and created_at>v_now-interval '1 minute') >= 10*v_multiplier then
    return jsonb_build_object('allowed',false,'reason','ip_risk','retryAt',v_now+interval '1 minute');
  end if;
  if not p_risk_challenge_passed and p_device_hash is not null and (select count(*) from public.global_catalog_rate_events where device_hash=p_device_hash and created_at>v_now-interval '1 minute') >= 5*v_multiplier then
    return jsonb_build_object('allowed',false,'reason','device_risk','retryAt',v_now+interval '1 minute');
  end if;
  insert into public.global_catalog_rate_events(user_id,action,idempotency_key,payload_hash,ip_hash,device_hash)
  values(p_actor_user_id,p_action,p_idempotency_key,p_payload_hash,p_ip_hash,p_device_hash);
  return jsonb_build_object('allowed',true,'idempotent',false,'retryAt',null);
end;
$$;
revoke all on function public.reserve_global_catalog_rate_slot(uuid,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.reserve_global_catalog_rate_slot(uuid,text,text,text,text,text,boolean) to service_role;

create or replace function public.global_catalog_valid_gtin(p_value text)
returns boolean language plpgsql immutable as $$
declare
  v_digits text := regexp_replace(coalesce(p_value,''),'\D','','g');
  v_sum integer := 0;
  v_position integer := 1;
  v_index integer;
begin
  if length(v_digits) not in (8,12,13,14) then return false; end if;
  for v_index in reverse length(v_digits)-1..1 loop
    v_sum := v_sum + substring(v_digits,v_index,1)::integer * (case when v_position % 2 = 1 then 3 else 1 end);
    v_position := v_position + 1;
  end loop;
  return ((10 - (v_sum % 10)) % 10) = right(v_digits,1)::integer;
end;
$$;
revoke all on function public.global_catalog_valid_gtin(text) from public,anon,authenticated;
grant execute on function public.global_catalog_valid_gtin(text) to service_role;

-- 64-bit perceptual hashes are represented as sixteen hexadecimal characters.
-- Compare bits, not hexadecimal characters, so one nibble does not count as a
-- single visual difference. Service-role only because it is review plumbing.
create or replace function public.global_catalog_phash_distance(p_left text, p_right text)
returns integer language plpgsql immutable as $$
declare
  v_distance integer := 0;
  v_index integer;
  v_xor integer;
  v_left text := lower(coalesce(p_left,''));
  v_right text := lower(coalesce(p_right,''));
begin
  if v_left !~ '^[0-9a-f]{16}$' or v_right !~ '^[0-9a-f]{16}$' then return null; end if;
  for v_index in 1..16 loop
    v_xor := (position(substring(v_left,v_index,1) in '0123456789abcdef')-1)
      # (position(substring(v_right,v_index,1) in '0123456789abcdef')-1);
    v_distance := v_distance + substring('0112122312232334',v_xor+1,1)::integer;
  end loop;
  return v_distance;
end;
$$;
revoke all on function public.global_catalog_phash_distance(text,text) from public,anon,authenticated;
grant execute on function public.global_catalog_phash_distance(text,text) to service_role;

-- Deterministic OCR contribution. Only service_role (the edge function) can call it.
-- Verification status is derived from persisted owner OCR/product evidence; no client status is accepted.
create or replace function public.submit_owned_product_to_global_catalog(
  p_actor_user_id uuid,
  p_private_product_id uuid,
  p_ocr_session_id uuid,
  p_idempotency_key text,
  p_market text,
  p_package_language text,
  p_image_phashes text[],
  p_archived_image_paths text[],
  p_duplicate_decision text,
  p_distinguishing_evidence jsonb,
  p_ip_hash text,
  p_device_hash text,
  p_risk_challenge_passed boolean default false,
  p_rate_reservation_id uuid default null,
  p_resume_catalog_product_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
  v_existing public.global_catalog_products%rowtype;
  v_catalog_id uuid;
  v_variant_id uuid;
  v_submission_id uuid;
  v_version_id uuid;
  v_status text;
  v_method text;
  v_outcome text;
  v_missing text[] := '{}';
  v_invalid text[] := '{}';
  v_ean text;
  v_name text;
  v_identity text;
  v_composition text;
  v_ocr_conf numeric;
  v_norm_conf numeric;
  v_ingredients text;
  v_allergens text;
  v_action text;
  v_payload_hash text;
  v_rate jsonb;
  v_case_id uuid;
  v_case_key text;
  v_result jsonb;
  v_quantity numeric;
  v_unit text;
  v_front_images integer := 0;
  v_nutrition_images integer := 0;
  v_explicitly_unbranded boolean := false;
  v_energy_estimate numeric;
  v_family text;
  v_mapped_ingredient_id text;
  v_nutrition_basis text;
  v_evidence_snapshot jsonb := '{}'::jsonb;
  v_complete_existing boolean := false;
  v_next_version integer := 1;
begin
  select * into v_product from public.products where id=p_private_product_id and owner_user_id=p_actor_user_id;
  if not found then raise exception 'owned source product not found'; end if;
  if p_ocr_session_id is not null and not exists(select 1 from public.ocr_intake_sessions where id=p_ocr_session_id and user_id=p_actor_user_id and state in ('saved','cancelled')) then
    raise exception 'owned saved OCR session not found';
  end if;
  if p_market is null then
    select primary_market into p_market from public.account_product_market_preferences where user_id=p_actor_user_id;
  end if;
  -- A private products row is customer-writable and therefore cannot authorize
  -- an Engine mapping by itself. Only an immutable service-created signoff plus
  -- a currently active, Engine-approved Mapper row may cross this seam.
  select v_product.matched_basement_id into v_mapped_ingredient_id
  where v_product.matched_basement_id is not null
    and exists (
      select 1
      from public.verification_cases c
      join public.verification_signoffs s on s.case_id=c.id and s.status='pi_verified'
      join public.mapper_basement m on m.ingredient_id=v_product.matched_basement_id
      where c.owner_user_id=p_actor_user_id
        and c.product_id=p_private_product_id::text
        and m.is_active and m.approved_for_base and m.approved_for_engines
        and m.verification_status='verified'
    );
  select result_snapshot into v_result from public.global_catalog_submissions where submitter_user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  if found then return v_result; end if;
  v_name := coalesce(nullif(trim(v_product.product_name_display),''), nullif(trim(v_product.product_name_internal),''));
  v_ean := nullif(regexp_replace(coalesce(v_product.ean_code,v_product.barcode,''),'\D','','g'),'');
  -- Market belongs to the SKU/availability relation, not to product-core
  -- identity. The same no-EAN formulation scanned in two markets must resolve
  -- to one core and two market variants instead of two shared products.
  v_identity := lower(regexp_replace(coalesce(v_product.brand,'')||'|'||coalesce(v_name,''),'[^a-zA-Z0-9|]+','','g'));
  v_composition := md5(coalesce(v_product.extracted_json::text,'')||'|'||coalesce(v_product.allergens,''));
  v_payload_hash := md5(v_identity||'|'||coalesce(v_ean,'')||'|'||v_composition);
  v_action := case when p_duplicate_decision='different' then 'duplicate_dispute' when v_product.source_type='manual' then 'manual_candidate' else 'ocr_scan' end;
  if p_rate_reservation_id is null then
    v_rate := public.reserve_global_catalog_rate_slot(p_actor_user_id,v_action,p_idempotency_key,v_payload_hash,p_ip_hash,p_device_hash,p_risk_challenge_passed);
  else
    if not exists(
      select 1 from public.global_catalog_rate_events e
      where e.id=p_rate_reservation_id and e.user_id=p_actor_user_id
        and e.action='ocr_scan' and e.idempotency_key=p_idempotency_key
    ) then raise exception 'valid pre-reserved catalog rate slot required'; end if;
    v_rate:=jsonb_build_object('allowed',true,'idempotent',true,'reservationId',p_rate_reservation_id);
  end if;
  if not coalesce((v_rate->>'allowed')::boolean,false) then
    v_result := jsonb_build_object(
      'kind','rate_limited','productId',null,'status',null,'autoFavorited',false,
      'duplicateCandidates','[]'::jsonb,'missingFields','[]'::jsonb,'reviewCaseKey',null,
      'retryAt',v_rate->>'retryAt','rateReason',v_rate->>'reason',
      'challengeRequired',(v_rate->>'reason') in ('ip_risk','device_risk')
    );
    -- Do not persist a rate-limit response under the idempotency key. Once the
    -- retry window passes (or a valid risk challenge succeeds), the same safe
    -- request must be able to continue rather than replay a permanent failure.
    return v_result;
  end if;
  -- Snapshot original evidence before any early duplicate return. The archive
  -- paths come from a service-side copy; checksums, OCR runs and reviewed field
  -- candidates are re-read from the owned session and never accepted in JSON
  -- from the browser.
  select max(normalized_value) filter(where field_key='ingredients_text'),
         max(normalized_value) filter(where field_key='allergens_text'),
         max(normalized_value) filter(where field_key='nutrition_basis'),
         avg(normalization_confidence)
    into v_ingredients,v_allergens,v_nutrition_basis,v_norm_conf
    from public.ocr_field_evidence
    where session_id=p_ocr_session_id and review_status in ('auto_accepted','confirmed','edited');
  select avg(overall_confidence) into v_ocr_conf
    from public.ocr_extraction_runs where session_id=p_ocr_session_id;
  select count(*) filter(where role='front'),count(*) filter(where role in ('nutrition_table','back'))
    into v_front_images,v_nutrition_images
    from public.ocr_intake_images where session_id=p_ocr_session_id and state='ready';
  v_evidence_snapshot := jsonb_build_object(
    'ocrSessionId',p_ocr_session_id,
    'images',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'role',i.role,'displayOrder',i.display_order,'fileName',i.file_name,
        'mime',i.mime,'byteSize',i.byte_size,'checksumSha256',i.checksum_sha256,
        'width',i.width,'height',i.height,'state',i.state
      ) order by i.display_order)
      from public.ocr_intake_images i where i.session_id=p_ocr_session_id
    ),'[]'::jsonb),
    'archivedImagePaths',to_jsonb(coalesce(p_archived_image_paths,'{}'::text[])),
    'imagePhashes',to_jsonb(coalesce(p_image_phashes,'{}'::text[])),
    'ocrRuns',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.ocr_extraction_runs r where r.session_id=p_ocr_session_id),'[]'::jsonb),
    'fieldEvidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.field_key,e.created_at) from public.ocr_field_evidence e where e.session_id=p_ocr_session_id),'[]'::jsonb),
    'ocrConfidence',v_ocr_conf,
    'normalizationConfidence',v_norm_conf
  );
  if p_resume_catalog_product_id is not null then
    select p.* into v_existing from public.global_catalog_products p
      where p.id=p_resume_catalog_product_id and p.is_active and p.status='blocked';
    if not found then raise exception 'resumable blocked catalog product not found'; end if;
    v_catalog_id:=v_existing.id;
    v_complete_existing:=true;
  end if;
  if v_catalog_id is null and v_ean is not null then
    select p.* into v_existing from public.global_catalog_products p join public.global_catalog_variants v on v.product_id=p.id where v.ean=v_ean and p.is_active limit 1;
    if found then
      if p_rate_reservation_id is null and v_existing.status='blocked'
        and exists(select 1 from public.ocr_field_evidence where session_id=p_ocr_session_id and review_status='edited') then
        v_catalog_id:=v_existing.id;
        v_complete_existing:=true;
      else
        if v_existing.status<>'blocked' then
          insert into public.global_catalog_favorites(user_id,entity_key,entity_kind,catalog_product_id) values(p_actor_user_id,'catalog:'||v_existing.id,'commercial_product',v_existing.id) on conflict do nothing;
        end if;
        update public.ocr_intake_sessions set saved_product_id=v_existing.id::text where id=p_ocr_session_id and user_id=p_actor_user_id;
        v_result := jsonb_build_object('kind','existing','productId',v_existing.id,'status',v_existing.status,'autoFavorited',v_existing.status<>'blocked','duplicateCandidates',jsonb_build_array(jsonb_build_object('productId',v_existing.id,'strength','exact','score',1,'reasons',jsonb_build_array('ean_gtin_exact'))),'missingFields',to_jsonb(v_existing.missing_fields),'reviewCaseKey',null,'retryAt',null);
        insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,catalog_product_id,idempotency_key,payload_hash,source,outcome,market,evidence_snapshot,result_snapshot,ip_hash,device_hash)
        values(p_actor_user_id,p_private_product_id,p_ocr_session_id,v_existing.id,p_idempotency_key,v_payload_hash,'ocr_automatic','existing',p_market,v_evidence_snapshot,v_result,p_ip_hash,p_device_hash);
        return v_result;
      end if;
    end if;
  end if;
  -- Layer 2: a server-derived perceptual image match is a likely duplicate.
  -- It pauses for a customer decision; it never silently merges a near match.
  if v_catalog_id is null and cardinality(coalesce(p_image_phashes,'{}'))>0 then
    select p.* into v_existing
    from public.global_catalog_products p
    join public.global_catalog_variants v on v.product_id=p.id and v.is_current
    where p.is_active and exists (
      select 1 from unnest(coalesce(p_image_phashes,'{}')) incoming(hash)
      cross join lateral unnest(v.image_phashes) existing(hash)
      where public.global_catalog_phash_distance(incoming.hash,existing.hash) <= 4
    )
    order by p.created_at asc limit 1;
    if found and p_duplicate_decision is null then
      v_result:=jsonb_build_object('kind','likely_duplicate','productId',null,'status',null,'autoFavorited',false,
        'duplicateCandidates',jsonb_build_array(jsonb_build_object('productId',v_existing.id,'strength','likely','score',0.9,'reasons',jsonb_build_array('package_image_near_exact'))),
        'missingFields','[]'::jsonb,'reviewCaseKey',null,'retryAt',null);
      insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,idempotency_key,payload_hash,source,outcome,market,evidence_snapshot,result_snapshot,ip_hash,device_hash)
      values(p_actor_user_id,p_private_product_id,p_ocr_session_id,p_idempotency_key,v_payload_hash,'ocr_automatic','likely_duplicate',p_market,v_evidence_snapshot,v_result,p_ip_hash,p_device_hash);
      return v_result;
    elsif found and p_duplicate_decision='same' then
      insert into public.global_catalog_favorites(user_id,entity_key,entity_kind,catalog_product_id) values(p_actor_user_id,'catalog:'||v_existing.id,'commercial_product',v_existing.id) on conflict do nothing;
      update public.ocr_intake_sessions set saved_product_id=v_existing.id::text where id=p_ocr_session_id and user_id=p_actor_user_id;
      v_result:=jsonb_build_object('kind','existing','productId',v_existing.id,'status',v_existing.status,'autoFavorited',true,
        'duplicateCandidates',jsonb_build_array(jsonb_build_object('productId',v_existing.id,'strength','likely','score',0.9,'reasons',jsonb_build_array('customer_confirmed_same_image'))),
        'missingFields',to_jsonb(v_existing.missing_fields),'reviewCaseKey',null,'retryAt',null);
      insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,catalog_product_id,idempotency_key,payload_hash,source,outcome,market,duplicate_decision,evidence_snapshot,result_snapshot,ip_hash,device_hash)
      values(p_actor_user_id,p_private_product_id,p_ocr_session_id,v_existing.id,p_idempotency_key,v_payload_hash,'ocr_automatic','existing',p_market,'same',v_evidence_snapshot,v_result,p_ip_hash,p_device_hash);
      return v_result;
    elsif found and p_duplicate_decision='different' and coalesce(p_distinguishing_evidence,'{}'::jsonb)='{}'::jsonb then
      raise exception 'distinguishing duplicate evidence is required';
    end if;
  end if;
  if v_catalog_id is null then select p.* into v_existing from public.global_catalog_products p
  where p.normalized_identity=v_identity and p.composition_fingerprint<>v_composition and p.is_active
  order by p.created_at asc limit 1; end if;
  if v_catalog_id is null and found and p_duplicate_decision is null then
    v_result:=jsonb_build_object('kind','likely_duplicate','productId',null,'status',null,'autoFavorited',false,
      'duplicateCandidates',jsonb_build_array(jsonb_build_object('productId',v_existing.id,'strength','likely','score',0.8,'reasons',jsonb_build_array('normalized_identity_similar','composition_differs'))),
      'missingFields','[]'::jsonb,'reviewCaseKey',null,'retryAt',null);
    insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,idempotency_key,payload_hash,source,outcome,market,evidence_snapshot,result_snapshot,ip_hash,device_hash)
    values(p_actor_user_id,p_private_product_id,p_ocr_session_id,p_idempotency_key,v_payload_hash,'ocr_automatic','likely_duplicate',p_market,v_evidence_snapshot,v_result,p_ip_hash,p_device_hash);
    return v_result;
  elsif v_catalog_id is null and found and p_duplicate_decision='same' then
    insert into public.global_catalog_favorites(user_id,entity_key,entity_kind,catalog_product_id) values(p_actor_user_id,'catalog:'||v_existing.id,'commercial_product',v_existing.id) on conflict do nothing;
    update public.ocr_intake_sessions set saved_product_id=v_existing.id::text where id=p_ocr_session_id and user_id=p_actor_user_id;
    v_result:=jsonb_build_object('kind','existing','productId',v_existing.id,'status',v_existing.status,'autoFavorited',true,'duplicateCandidates',jsonb_build_array(jsonb_build_object('productId',v_existing.id,'strength','likely','score',0.8,'reasons',jsonb_build_array('customer_confirmed_same'))),'missingFields',to_jsonb(v_existing.missing_fields),'reviewCaseKey',null,'retryAt',null);
    insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,catalog_product_id,idempotency_key,payload_hash,source,outcome,market,duplicate_decision,evidence_snapshot,result_snapshot,ip_hash,device_hash)
    values(p_actor_user_id,p_private_product_id,p_ocr_session_id,v_existing.id,p_idempotency_key,v_payload_hash,'ocr_automatic','existing',p_market,'same',v_evidence_snapshot,v_result,p_ip_hash,p_device_hash);
    return v_result;
  elsif v_catalog_id is null and found and p_duplicate_decision='different' and coalesce(p_distinguishing_evidence,'{}'::jsonb)='{}'::jsonb then
    raise exception 'distinguishing duplicate evidence is required';
  end if;
  if v_catalog_id is null then select p.* into v_existing from public.global_catalog_products p where p.normalized_identity=v_identity and p.composition_fingerprint=v_composition and p.is_active limit 1; end if;
  if v_catalog_id is null and found then
    -- A hardened call that discovers an existing RED core must not manufacture
    -- a new package row before v2 resolves the exact existing variant.
    if v_existing.status<>'blocked' or p_rate_reservation_id is null then
      insert into public.global_catalog_variants(product_id,ean,market,package_language,original_package_name,image_phashes)
      values(v_existing.id,v_ean,coalesce(p_market,'GLOBAL'),p_package_language,v_name,coalesce(p_image_phashes,'{}')) on conflict do nothing;
      insert into public.global_catalog_favorites(user_id,entity_key,entity_kind,catalog_product_id) values(p_actor_user_id,'catalog:'||v_existing.id,'commercial_product',v_existing.id) on conflict do nothing;
    end if;
    update public.ocr_intake_sessions set saved_product_id=v_existing.id::text where id=p_ocr_session_id and user_id=p_actor_user_id;
    v_result := jsonb_build_object('kind','existing','productId',v_existing.id,'status',v_existing.status,'autoFavorited',true,'duplicateCandidates','[]'::jsonb,'missingFields',to_jsonb(v_existing.missing_fields),'reviewCaseKey',null,'retryAt',null);
    insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,catalog_product_id,idempotency_key,payload_hash,source,outcome,market,evidence_snapshot,result_snapshot,ip_hash,device_hash)
    values(p_actor_user_id,p_private_product_id,p_ocr_session_id,v_existing.id,p_idempotency_key,v_payload_hash,'ocr_automatic','existing',p_market,v_evidence_snapshot,v_result,p_ip_hash,p_device_hash);
    return v_result;
  end if;
  if v_name is null then v_missing := array_append(v_missing,'product_name'); end if;
  v_explicitly_unbranded := coalesce((v_product.extracted_json->>'explicitlyUnbranded')::boolean,false);
  if v_product.brand is null and not v_explicitly_unbranded then v_missing := array_append(v_missing,'brand_or_unbranded'); end if;
  if p_market is null or trim(p_market)='' then v_missing := array_append(v_missing,'market_of_sale'); end if;
  if v_product.package_size is not null then
    v_quantity := nullif(substring(replace(v_product.package_size,',','.') from '([0-9]+(?:\.[0-9]+)?)'),'')::numeric;
    v_unit := lower(substring(v_product.package_size from '(kg|ml|g|l)'));
  end if;
  if v_quantity is null or v_quantity<=0 or v_unit is null then v_missing := array_append(v_missing,'net_quantity_unit'); end if;
  if v_product.kcal_per_100g is null then v_missing := array_append(v_missing,'nutrition_energyKcal'); end if;
  if v_product.fat_percent is null then v_missing := array_append(v_missing,'nutrition_fat'); end if;
  if v_product.carbohydrate_percent is null then v_missing := array_append(v_missing,'nutrition_carbohydrate'); end if;
  if v_product.protein_percent is null then v_missing := array_append(v_missing,'nutrition_protein'); end if;
  if v_product.salt_percent is null then v_missing := array_append(v_missing,'nutrition_salt'); end if;
  if coalesce(v_nutrition_basis,'') not in ('per_100g','per_100ml') then v_missing := array_append(v_missing,'nutrition_basis'); end if;
  if v_ingredients is null then v_missing := array_append(v_missing,'ingredients_text'); end if;
  if v_allergens is null then v_missing := array_append(v_missing,'allergens_text'); end if;
  if v_front_images=0 then v_missing := array_append(v_missing,'front_package_image'); end if;
  if v_nutrition_images=0 then v_missing := array_append(v_missing,'nutrition_image'); end if;
  if v_ean is not null and not public.global_catalog_valid_gtin(v_ean) then v_invalid:=array_append(v_invalid,'ean_gtin_check_digit'); end if;
  if v_product.total_sugars_percent is not null and v_product.carbohydrate_percent is not null and v_product.total_sugars_percent>v_product.carbohydrate_percent+0.01 then v_invalid:=array_append(v_invalid,'nutrition_sugars_gt_carbohydrate'); end if;
  if v_product.fat_percent is not null and (v_product.fat_percent<0 or v_product.fat_percent>100) then v_invalid:=array_append(v_invalid,'nutrition_fat'); end if;
  if v_product.saturated_fat_percent is not null and (v_product.saturated_fat_percent<0 or v_product.saturated_fat_percent>100 or (v_product.fat_percent is not null and v_product.saturated_fat_percent>v_product.fat_percent+0.01)) then v_invalid:=array_append(v_invalid,'nutrition_saturated_fat'); end if;
  if v_product.carbohydrate_percent is not null and (v_product.carbohydrate_percent<0 or v_product.carbohydrate_percent>100) then v_invalid:=array_append(v_invalid,'nutrition_carbohydrate'); end if;
  if v_product.total_sugars_percent is not null and (v_product.total_sugars_percent<0 or v_product.total_sugars_percent>100) then v_invalid:=array_append(v_invalid,'nutrition_sugars'); end if;
  if v_product.protein_percent is not null and (v_product.protein_percent<0 or v_product.protein_percent>100) then v_invalid:=array_append(v_invalid,'nutrition_protein'); end if;
  if v_product.salt_percent is not null and (v_product.salt_percent<0 or v_product.salt_percent>100) then v_invalid:=array_append(v_invalid,'nutrition_salt'); end if;
  if v_product.fiber_percent is not null and (v_product.fiber_percent<0 or v_product.fiber_percent>100) then v_invalid:=array_append(v_invalid,'nutrition_fibre'); end if;
  if v_product.kcal_per_100g is not null and (v_product.kcal_per_100g<0 or v_product.kcal_per_100g>1000) then v_invalid:=array_append(v_invalid,'nutrition_energyKcal'); end if;
  if coalesce(v_product.fat_percent,0)+coalesce(v_product.carbohydrate_percent,0)+coalesce(v_product.protein_percent,0)+coalesce(v_product.fiber_percent,0)+coalesce(v_product.salt_percent,0)>105 then v_invalid:=array_append(v_invalid,'nutrition_macro_mass_conflict'); end if;
  if v_product.kcal_per_100g is not null and v_product.fat_percent is not null and v_product.carbohydrate_percent is not null and v_product.protein_percent is not null then
    v_energy_estimate := v_product.fat_percent*9 + v_product.carbohydrate_percent*4 + v_product.protein_percent*4 + coalesce(v_product.fiber_percent,0)*2;
    if abs(v_product.kcal_per_100g-v_energy_estimate)>greatest(35,v_energy_estimate*0.25) then v_invalid:=array_append(v_invalid,'nutrition_energy_macro_conflict'); end if;
  end if;
  v_family := case
    when lower(coalesce(v_name,'')) ~ 'trusk|strawber|fresa|erdbeer|fragol|fraise' then 'strawberry'
    when lower(coalesce(v_name,'')) ~ 'czekol|chocol|schokol|cioccol' then 'chocolate'
    when lower(coalesce(v_name,'')) ~ 'pistac' then 'pistachio'
    when lower(coalesce(v_name,'')) ~ 'wanil|vanil|vanigl' then 'vanilla'
    when lower(coalesce(v_name,'')) ~ 'kaw|coffee|kaffee|cafe|caffe' then 'coffee'
    when lower(coalesce(v_name,'')) ~ 'banan' then 'banana'
    when lower(coalesce(v_name,'')) ~ 'mango' then 'mango'
    else v_product.normalized_category end;
  if cardinality(v_missing)=0 and cardinality(v_invalid)=0 and coalesce(v_ocr_conf,0)>=85 and coalesce(v_norm_conf,0)>=90 and v_product.source_type='label_scan' then
    v_status:='verified'; v_method:='automatic';
  elsif v_name is not null and v_product.brand is not null and v_product.package_size is not null and p_market is not null
    and v_product.kcal_per_100g is not null and v_product.fat_percent is not null and v_product.carbohydrate_percent is not null
    and v_product.protein_percent is not null and v_product.salt_percent is not null and cardinality(v_invalid)=0 then
    v_status:='manual_unverified'; v_method:='manual_unverified';
  else v_status:='blocked'; v_method:='blocked'; end if;
  -- The hardened v2 wrapper owns every customer-visible status decision for a
  -- pre-reserved submission. Seed a new core as RED so malformed/XOR input can
  -- never trip a table constraint before v2 returns an honest exact defect.
  if p_rate_reservation_id is not null then
    v_status:='blocked';
    v_method:='blocked';
  end if;
  if v_catalog_id is null then
    insert into public.global_catalog_products(status,verification_method,provenance,display_name,original_name,original_language,brand,explicitly_unbranded,canonical_family,category,mapped_ingredient_id,country_of_origin,normalized_identity,composition_fingerprint,missing_fields,invalid_fields,public_data,search_document)
    values(v_status,v_method,case when v_status='verified' then 'automatic_verified' when v_status='manual_unverified' then 'manual_completion' else 'ocr_automatic' end,
      coalesce(v_name,'Nieznany produkt'),v_name,p_package_language,v_product.brand,v_explicitly_unbranded,v_family,v_product.product_category,v_mapped_ingredient_id,v_product.country,v_identity,v_composition,v_missing,v_invalid,
      jsonb_strip_nulls(jsonb_build_object('nutrition',jsonb_build_object('basis',v_nutrition_basis,'energyKcal',v_product.kcal_per_100g,'fat',v_product.fat_percent,'saturatedFat',v_product.saturated_fat_percent,'carbohydrate',v_product.carbohydrate_percent,'sugars',v_product.total_sugars_percent,'protein',v_product.protein_percent,'salt',v_product.salt_percent,'fibre',v_product.fiber_percent),'ingredientsText',v_ingredients,'allergensText',v_allergens)),
      lower(coalesce(v_name,'')||' '||coalesce(v_product.brand,'')||' '||coalesce(v_product.product_category,'')||' '||coalesce(v_product.normalized_category,'')||' '||coalesce(v_ean,''))) returning id into v_catalog_id;
  elsif p_rate_reservation_id is null then
    -- Legacy callers own this update. A pre-reserved v2 call must leave an
    -- existing core byte-for-byte unchanged until the hardened wrapper has
    -- evaluated the complete GREEN/BLUE/RED contract. In particular, changing
    -- status here before brand + explicitly_unbranded are written atomically
    -- can violate the catalog XOR constraint during RED manual completion.
    update public.global_catalog_products set status=v_status,verification_method=v_method,provenance='manual_completion',display_name=coalesce(v_name,display_name),original_name=coalesce(v_name,original_name),brand=coalesce(v_product.brand,brand),canonical_family=v_family,category=v_product.product_category,mapped_ingredient_id=v_mapped_ingredient_id,country_of_origin=v_product.country,normalized_identity=v_identity,composition_fingerprint=v_composition,missing_fields=v_missing,invalid_fields=v_invalid,
      public_data=jsonb_strip_nulls(jsonb_build_object('nutrition',jsonb_build_object('basis',v_nutrition_basis,'energyKcal',v_product.kcal_per_100g,'fat',v_product.fat_percent,'saturatedFat',v_product.saturated_fat_percent,'carbohydrate',v_product.carbohydrate_percent,'sugars',v_product.total_sugars_percent,'protein',v_product.protein_percent,'salt',v_product.salt_percent,'fibre',v_product.fiber_percent),'ingredientsText',v_ingredients,'allergensText',v_allergens))
    where id=v_catalog_id;
  end if;
  -- A v2 manual resume already owns one catalog core and must resolve its
  -- existing package variant under the hardened ambiguity gate. Creating a
  -- fresh no-EAN row here would make every retry look unambiguously exact.
  if p_resume_catalog_product_id is null then
    insert into public.global_catalog_variants(product_id,ean,net_quantity,net_unit,market,package_language,original_package_name,image_phashes)
    values(v_catalog_id,v_ean,v_quantity,v_unit,coalesce(p_market,'GLOBAL'),p_package_language,v_name,coalesce(p_image_phashes,'{}'))
    on conflict(ean) where ean is not null do update set net_quantity=excluded.net_quantity,net_unit=excluded.net_unit,market=excluded.market,package_language=excluded.package_language,original_package_name=excluded.original_package_name,image_phashes=excluded.image_phashes returning id into v_variant_id;
  end if;
  -- A pre-reserved call is owned by the hardened v2 wrapper. It may use this
  -- resolver to identify/create the shared row, but only the post-gate wrapper
  -- may publish the immutable version and current-version pointer. Otherwise a
  -- legacy confidence result could leave a shared-readable false GREEN version
  -- even when v2 correctly downgraded the current product to BLUE/RED.
  if p_rate_reservation_id is null then
    select coalesce(max(version),0)+1 into v_next_version from public.global_catalog_product_versions where product_id=v_catalog_id;
    insert into public.global_catalog_product_versions(product_id,version,snapshot,evidence_snapshot,provenance,verification_method)
    values(
      v_catalog_id,
      v_next_version,
      (select to_jsonb(p) from public.global_catalog_products p where p.id=v_catalog_id),
      -- Versions are shared-readable, so retain only non-identifying evidence
      -- sufficiency facts here. Original OCR rows and archive paths stay in the
      -- owner submission and service-only review case.
      jsonb_build_object(
        'imageCount',v_front_images+v_nutrition_images,
        'hasFrontImage',v_front_images>0,
        'hasNutritionImage',v_nutrition_images>0,
        'hasIngredientsText',v_ingredients is not null,
        'hasAllergensText',v_allergens is not null,
        'nutritionBasis',v_nutrition_basis,
        'ocrConfidenceBand',case when coalesce(v_ocr_conf,0)>=85 then 'high' when coalesce(v_ocr_conf,0)>=60 then 'medium' else 'low' end
      ),
      case when v_complete_existing then 'manual_completion' when v_status='verified' then 'automatic_verified' else 'ocr_automatic' end,
      v_method
    ) returning id into v_version_id;
  end if;
  if p_rate_reservation_id is null then
    insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind) values(v_catalog_id,coalesce(v_name,'Nieznany produkt'),lower(coalesce(v_name,'Nieznany produkt')),p_package_language,'original_name') on conflict do nothing;
    if v_family='strawberry' then
      insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind)
      select v_catalog_id,x,x,null,'canonical_family' from unnest(array['truskawka','truskawki','strawberry','strawberries','fresa','fresas','Erdbeere','Erdbeeren','fragola','fraise']) x on conflict do nothing;
    elsif v_family='chocolate' then
      insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind)
      select v_catalog_id,x,x,null,'canonical_family' from unnest(array['czekolada','chocolate','Schokolade','chocolat','cioccolato']) x on conflict do nothing;
    elsif v_family='pistachio' then
      insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind)
      select v_catalog_id,x,x,null,'canonical_family' from unnest(array['pistacja','pistachio','Pistazie','pistacho','pistacchio','pistache']) x on conflict do nothing;
    end if;
  end if;
  v_outcome := case when v_status='blocked' then 'blocked' when v_complete_existing then 'existing' else 'created' end;
  if v_status<>'blocked' then insert into public.global_catalog_favorites(user_id,entity_key,entity_kind,catalog_product_id) values(p_actor_user_id,'catalog:'||v_catalog_id,'commercial_product',v_catalog_id) on conflict do nothing; end if;
  update public.ocr_intake_sessions set saved_product_id=v_catalog_id::text where id=p_ocr_session_id and user_id=p_actor_user_id;
  v_result:=jsonb_build_object('kind',v_outcome,'productId',v_catalog_id,'status',v_status,'autoFavorited',v_status<>'blocked','duplicateCandidates','[]'::jsonb,'missingFields',to_jsonb(v_missing),'reviewCaseKey',null,'retryAt',null);
  insert into public.global_catalog_submissions(submitter_user_id,private_product_id,ocr_session_id,catalog_product_id,idempotency_key,payload_hash,source,outcome,market,duplicate_decision,distinguishing_evidence,evidence_snapshot,result_snapshot,ip_hash,device_hash)
  values(p_actor_user_id,p_private_product_id,p_ocr_session_id,v_catalog_id,p_idempotency_key,v_payload_hash,case when v_method='manual_unverified' then 'manual_completion' else 'ocr_automatic' end,v_outcome,p_market,p_duplicate_decision,coalesce(p_distinguishing_evidence,'{}'),v_evidence_snapshot,v_result,p_ip_hash,p_device_hash) returning id into v_submission_id;
  if v_status in ('manual_unverified','blocked') or p_duplicate_decision='different' then
    v_case_key:=case when p_duplicate_decision='different' then 'duplicate:' else 'product:' end||v_catalog_id::text;
    insert into public.global_catalog_review_cases(consolidation_key,catalog_product_id,kind,priority,markets,missing_fields,normalized_data,latest_evidence)
    values(v_case_key,v_catalog_id,case when p_duplicate_decision='different' then 'duplicate_dispute' when v_status='blocked' then 'verification_failed' else 'manual_unverified' end,'normal',array[coalesce(p_market,'GLOBAL')],v_missing,(select to_jsonb(p) from public.global_catalog_products p where p.id=v_catalog_id),v_evidence_snapshot||jsonb_build_object('distinguishingEvidence',p_distinguishing_evidence))
    on conflict(consolidation_key) do update set submission_count=global_catalog_review_cases.submission_count+1,markets=(select array(select distinct unnest(global_catalog_review_cases.markets||excluded.markets))),latest_evidence=excluded.latest_evidence
    returning id into v_case_id;
    insert into public.global_catalog_review_case_submissions(case_id,submission_id) values(v_case_id,v_submission_id) on conflict do nothing;
    v_result:=jsonb_set(v_result,'{reviewCaseKey}',to_jsonb(v_case_key));
    update public.global_catalog_submissions set result_snapshot=v_result where id=v_submission_id;
  end if;
  insert into public.global_catalog_audit_events(catalog_product_id,review_case_id,submission_id,event_type,actor_kind,actor_user_id,payload,correlation_key)
  values(v_catalog_id,v_case_id,v_submission_id,'catalog_submission_resolved','system',null,v_result,'submission:'||v_submission_id::text);
  return v_result;
end;
$$;
revoke all on function public.submit_owned_product_to_global_catalog(uuid,uuid,uuid,text,text,text,text[],text[],text,jsonb,text,text,boolean,uuid,uuid) from public,anon,authenticated;
grant execute on function public.submit_owned_product_to_global_catalog(uuid,uuid,uuid,text,text,text,text[],text[],text,jsonb,text,text,boolean,uuid,uuid) to service_role;

-- Deterministic migration ledger. Existing private rows are NOT copied blindly or exposed.
-- Mapper rows are represented live as GOLD PI Base by the existing picker and are ledgered only.
insert into public.global_catalog_migration_ledger(source_kind,source_id,classification,reason)
select 'mapper_basement', ingredient_id, 'pi_base_gold', 'Canonical Mapper row remains immutable and is rendered live as PINGUINO Base.'
from public.mapper_basement
on conflict do nothing;

insert into public.global_catalog_migration_ledger(source_kind,source_id,classification,reason)
select 'legacy_product', id::text,
  case
    when status='pi_verified' and product_name_display is not null and brand is not null then 'verified_green'
    when status='rejected' then 'blocked_red'
    when product_name_display is not null and package_size is not null and kcal_per_100g is not null then 'manual_blue'
    when supplier is not null or cost_per_kg is not null then 'skipped_private_only'
    else 'ambiguous_report'
  end,
  case
    when status='pi_verified' and product_name_display is not null and brand is not null then 'Eligible for a reviewed catalog migration; no automatic copy in this migration.'
    when status='rejected' then 'Rejected legacy row; no shared publication.'
    when product_name_display is not null and package_size is not null and kcal_per_100g is not null then 'Usable label facts exist, but owner must run the server migration/import so private fields are stripped.'
    when supplier is not null or cost_per_kg is not null then 'Contains private commercial data; never copied to shared catalog.'
    else 'Ambiguous evidence; no status fabricated and no shared row created.'
  end
from public.products
on conflict do nothing;
