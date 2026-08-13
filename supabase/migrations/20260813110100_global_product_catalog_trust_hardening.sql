-- 0044_global_product_catalog_trust_hardening.sql
-- Closes the trust/rate/version seams found by the four independent reviews of 0043.
-- This migration is additive and does not mutate mapper_basement or Engine science.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.global_catalog_products
  add column if not exists current_version_id uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_source_version text;

alter table public.global_catalog_submissions
  alter column submitter_user_id drop not null;
alter table public.global_catalog_submissions
  drop constraint if exists global_catalog_submissions_submitter_user_id_fkey;
alter table public.global_catalog_submissions
  add constraint global_catalog_submissions_submitter_user_id_fkey
  foreign key (submitter_user_id) references auth.users(id) on delete set null;

alter table public.global_catalog_rate_events
  add column if not exists consumed_at timestamptz;

create table if not exists public.global_catalog_rate_denials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text not null,
  ip_hash text,
  device_hash text,
  created_at timestamptz not null default now()
);
alter table public.global_catalog_rate_denials enable row level security;

-- Automatic GREEN requires a server OCR worker/provider attestation. Browser OCR,
-- customer products and owner-writable evidence can create BLUE/RED only.
create table if not exists public.global_catalog_server_ocr_attestations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  ocr_session_id uuid references public.ocr_intake_sessions(id) on delete set null,
  source_session_key uuid not null,
  provider text not null,
  provider_version text not null,
  image_checksums text[] not null,
  archived_image_paths text[] not null,
  verified_fields jsonb not null,
  overall_confidence numeric not null check (overall_confidence between 0 and 100),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.global_catalog_server_ocr_attestations enable row level security;
create unique index if not exists global_catalog_server_ocr_attestation_evidence_uniq
  on public.global_catalog_server_ocr_attestations(source_session_key,evidence_sha256);

-- The product/session relation is minted by service-role only after the Edge
-- function checks the immutable intake archive and the product's session snapshot.
create table if not exists public.global_catalog_product_session_bindings (
  private_product_id uuid not null references public.products(id) on delete cascade,
  ocr_session_id uuid not null references public.ocr_intake_sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  product_snapshot_sha256 text not null check (product_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (private_product_id, ocr_session_id)
);
alter table public.global_catalog_product_session_bindings enable row level security;

create table if not exists public.global_catalog_product_session_binding_history (
  private_product_id uuid references public.products(id) on delete set null,
  ocr_session_id uuid references public.ocr_intake_sessions(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  product_snapshot_sha256 text not null check (product_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(private_product_id,ocr_session_id,product_snapshot_sha256)
);
alter table public.global_catalog_product_session_binding_history enable row level security;

-- Engine eligibility is a dedicated immutable service-owned relation. It is
-- never inferred from the mutable products.matched_basement_id column.
create table if not exists public.global_catalog_engine_mappings (
  catalog_product_id uuid primary key references public.global_catalog_products(id) on delete cascade,
  catalog_version_id uuid references public.global_catalog_product_versions(id) on delete set null,
  mapper_ingredient_id text not null,
  verification_signoff_id uuid references public.verification_signoffs(id) on delete set null,
  signoff_snapshot jsonb not null,
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.global_catalog_engine_mappings
  add column if not exists catalog_version_id uuid references public.global_catalog_product_versions(id) on delete set null;
alter table public.global_catalog_engine_mappings enable row level security;

-- A SKU may be sold in many markets without duplicating its product core/EAN.
create table if not exists public.global_catalog_variant_markets (
  variant_id uuid not null references public.global_catalog_variants(id) on delete cascade,
  market text not null,
  package_language text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (variant_id, market)
);
alter table public.global_catalog_variant_markets enable row level security;
create policy global_catalog_variant_markets_read on public.global_catalog_variant_markets
  for select to authenticated using (
    exists (
      select 1 from public.global_catalog_variants v
      join public.global_catalog_products p on p.id=v.product_id
      where v.id=variant_id and p.is_active
    )
  );
grant select on public.global_catalog_variant_markets to authenticated;

-- Customer-private commercial SKU data. Search exposes only the caller's own
-- price/currency as a private projection; shared product facts never contain it.
create table if not exists public.account_catalog_product_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_product_id uuid not null references public.global_catalog_products(id) on delete cascade,
  private_price numeric check (private_price is null or private_price >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  supplier text,
  notes text,
  stock numeric check (stock is null or stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, catalog_product_id)
);
alter table public.account_catalog_product_data enable row level security;
create policy account_catalog_product_data_own on public.account_catalog_product_data
  for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update,delete on public.account_catalog_product_data to authenticated;

create unique index if not exists global_catalog_offer_identity_uniq
  on public.global_catalog_retailer_offers(variant_id,market,retailer);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='global_catalog_products_current_version_fk'
  ) then
    alter table public.global_catalog_products
      add constraint global_catalog_products_current_version_fk
      foreign key(current_version_id) references public.global_catalog_product_versions(id)
      on delete set null deferrable initially deferred;
  end if;
end $$;

-- Search facts are normalized once at write/migration time. Runtime search can
-- then use indexed prefix/fuzzy aliases and the existing product tsvector,
-- instead of aggregating every active product before filtering.
update public.global_catalog_aliases
set normalized_alias=trim(regexp_replace(extensions.unaccent(lower(alias)),'[^a-z0-9]+',' ','g'))
where normalized_alias is distinct from trim(regexp_replace(extensions.unaccent(lower(alias)),'[^a-z0-9]+',' ','g'));
create index if not exists global_catalog_aliases_prefix_idx
  on public.global_catalog_aliases(normalized_alias text_pattern_ops);
create index if not exists global_catalog_aliases_trgm_idx
  on public.global_catalog_aliases using gin(normalized_alias extensions.gin_trgm_ops);

create or replace function public.global_catalog_alias_normalize()
returns trigger language plpgsql set search_path=public,extensions as $$
begin
  new.normalized_alias:=trim(regexp_replace(extensions.unaccent(lower(new.alias)),'[^a-z0-9]+',' ','g'));
  return new;
end;
$$;
drop trigger if exists global_catalog_alias_normalize_before_write on public.global_catalog_aliases;
create trigger global_catalog_alias_normalize_before_write
  before insert or update of alias on public.global_catalog_aliases
  for each row execute function public.global_catalog_alias_normalize();

-- Existing variant rows become explicit market relations.
insert into public.global_catalog_variant_markets(variant_id,market,package_language)
select id,market,package_language from public.global_catalog_variants
on conflict do nothing;

-- Favorite/recent PI Base writes must follow current Engine eligibility.
drop policy if exists global_catalog_favorites_own on public.global_catalog_favorites;
create policy global_catalog_favorites_own on public.global_catalog_favorites for all to authenticated
  using (user_id=auth.uid())
  with check (
    user_id=auth.uid() and (
      (entity_kind='commercial_product' and exists (
        select 1 from public.global_catalog_products p
        where p.id=catalog_product_id and p.is_active and p.status<>'blocked'
      )) or
      (entity_kind='pi_base' and exists (
        select 1 from public.mapper_basement m where m.ingredient_id=mapper_ingredient_id
          and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified'
      ))
    )
  );
drop policy if exists global_catalog_recent_own on public.global_catalog_recent_usage;
create policy global_catalog_recent_own on public.global_catalog_recent_usage for all to authenticated
  using (user_id=auth.uid())
  with check (
    user_id=auth.uid() and (
      (entity_kind='commercial_product' and exists (
        select 1 from public.global_catalog_products p
        where p.id=catalog_product_id and p.is_active and p.status<>'blocked'
      )) or
      (entity_kind='pi_base' and exists (
        select 1 from public.mapper_basement m where m.ingredient_id=mapper_ingredient_id
          and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified'
      ))
    )
  );

-- Serialized, service-only rate reservation. Denials are audited, idempotent
-- retries reuse the original reservation, and parallel calls cannot overrun a bucket.
create or replace function public.reserve_global_catalog_rate_slot(
  p_actor_user_id uuid,
  p_action text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_device_hash text,
  p_risk_challenge_passed boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_multiplier integer := 1;
  v_now timestamptz := now();
  v_count integer;
  v_retry timestamptz;
  v_reason text;
  v_existing public.global_catalog_rate_events%rowtype;
  v_id uuid;
begin
  if p_actor_user_id is null or p_action not in ('ocr_scan','manual_candidate','review_escalation','duplicate_dispute')
    or length(coalesce(p_idempotency_key,'')) not between 8 and 160
    or length(coalesce(p_payload_hash,'')) not between 16 and 128 then
    raise exception 'invalid catalog rate request';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_actor_user_id::text||':'||p_action));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtext('catalog-ip:'||p_ip_hash));
  end if;
  if p_device_hash is not null then
    perform pg_advisory_xact_lock(hashtext('catalog-device:'||p_device_hash));
  end if;
  select * into v_existing from public.global_catalog_rate_events
    where user_id=p_actor_user_id and action=p_action and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.payload_hash is distinct from p_payload_hash then
      raise exception 'idempotency key payload mismatch';
    end if;
    return jsonb_build_object('allowed',true,'idempotent',true,'reservationId',v_existing.id,'retryAt',null);
  end if;
  select coalesce(multiplier,1) into v_multiplier from public.global_catalog_trusted_accounts where user_id=p_actor_user_id;
  v_multiplier:=coalesce(v_multiplier,1);
  if p_payload_hash is not null and exists(
    select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action
      and payload_hash=p_payload_hash and created_at>v_now-interval '24 hours'
  ) then
    select min(created_at)+interval '24 hours' into v_retry
      from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action
        and payload_hash=p_payload_hash and created_at>v_now-interval '24 hours';
    v_reason:='duplicate_payload';
  end if;
  if v_reason is null and p_action='ocr_scan' then
    select count(*),min(created_at)+interval '1 minute' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 minute';
    if v_count>=3*v_multiplier then v_reason:='burst'; end if;
    if v_reason is null then
      select count(*),min(created_at)+interval '1 hour' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 hour';
      if v_count>=20*v_multiplier then v_reason:='hourly'; end if;
    end if;
    if v_reason is null then
      select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
      if v_count>=100*v_multiplier then v_reason:='daily'; end if;
    end if;
  elsif v_reason is null and p_action='manual_candidate' then
    select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count>=10*v_multiplier then v_reason:='daily'; end if;
  elsif v_reason is null and p_action='duplicate_dispute' then
    select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count>=2*v_multiplier then v_reason:='daily'; end if;
  elsif v_reason is null then
    select count(*),min(created_at)+interval '1 day' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 day';
    if v_count>=2*v_multiplier then v_reason:='daily'; end if;
    if v_reason is null and exists(select 1 from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '1 hour') then
      select max(created_at)+interval '1 hour' into v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action;
      v_reason:='cooldown';
    end if;
    if v_reason is null then
      select count(*),min(created_at)+interval '30 days' into v_count,v_retry from public.global_catalog_rate_events where user_id=p_actor_user_id and action=p_action and created_at>v_now-interval '30 days';
      if v_count>=10*v_multiplier then v_reason:='rolling_30d'; end if;
    end if;
  end if;
  if v_reason is null and not p_risk_challenge_passed and p_ip_hash is not null and
    (select count(*) from public.global_catalog_rate_events where ip_hash=p_ip_hash and created_at>v_now-interval '1 minute')>=10*v_multiplier then
    v_reason:='ip_risk'; v_retry:=v_now+interval '1 minute';
  end if;
  if v_reason is null and not p_risk_challenge_passed and p_device_hash is not null and
    (select count(*) from public.global_catalog_rate_events where device_hash=p_device_hash and created_at>v_now-interval '1 minute')>=5*v_multiplier then
    v_reason:='device_risk'; v_retry:=v_now+interval '1 minute';
  end if;
  if v_reason is not null then
    insert into public.global_catalog_rate_denials(user_id,action,reason,ip_hash,device_hash)
      values(p_actor_user_id,p_action,v_reason,p_ip_hash,p_device_hash);
    return jsonb_build_object('allowed',false,'reason',v_reason,'retryAt',v_retry,
      'challengeRequired',v_reason in ('ip_risk','device_risk'));
  end if;
  insert into public.global_catalog_rate_events(user_id,action,idempotency_key,payload_hash,ip_hash,device_hash)
    values(p_actor_user_id,p_action,p_idempotency_key,p_payload_hash,p_ip_hash,p_device_hash) returning id into v_id;
  return jsonb_build_object('allowed',true,'idempotent',false,'reservationId',v_id,'retryAt',null);
end;
$$;

-- Cheap preflight: ownership/rate/risk happen before image download, decode or archive.
create or replace function public.begin_global_catalog_submission(
  p_actor_user_id uuid,p_ocr_session_id uuid,p_idempotency_key text,p_payload_hash text,
  p_ip_hash text,p_device_hash text,p_risk_challenge_passed boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.ocr_intake_sessions where id=p_ocr_session_id and user_id=p_actor_user_id and state in ('saved','cancelled')) then
    raise exception 'owned terminal OCR session not found';
  end if;
  return public.reserve_global_catalog_rate_slot(p_actor_user_id,'ocr_scan',p_idempotency_key,p_payload_hash,p_ip_hash,p_device_hash,p_risk_challenge_passed);
end;
$$;
revoke all on function public.begin_global_catalog_submission(uuid,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.begin_global_catalog_submission(uuid,uuid,text,text,text,text,boolean) to service_role;

create or replace function public.global_catalog_product_snapshot_hash(
  p_actor_user_id uuid,p_private_product_id uuid
) returns text language sql stable security definer set search_path=public as $$
  select encode(extensions.digest(convert_to(jsonb_strip_nulls(to_jsonb(p)-'owner_user_id'-'supplier'-'cost_per_kg'-'currency')::text,'utf8'),'sha256'),'hex')
  from public.products p where p.id=p_private_product_id and p.owner_user_id=p_actor_user_id;
$$;
revoke all on function public.global_catalog_product_snapshot_hash(uuid,uuid) from public,anon,authenticated;
grant execute on function public.global_catalog_product_snapshot_hash(uuid,uuid) to service_role;

create or replace function public.global_catalog_resolved_ocr_field(p_payload jsonb,p_field_key text)
returns text language sql immutable as $$
  select case
    when f->>'reviewStatus'='marked_unknown' then null
    when nullif(f->>'editedValue','') is not null then f->>'editedValue'
    when (f->>'chosenCandidate') ~ '^[0-9]+$' then f->'candidates'->((f->>'chosenCandidate')::integer)->>'normalized'
    when f->>'reviewStatus'='auto_accepted' then f->'candidates'->0->>'normalized'
    else null
  end
  from jsonb_array_elements(coalesce(p_payload->'fields','[]'::jsonb)) f
  where f->>'fieldKey'=p_field_key
  limit 1;
$$;
revoke all on function public.global_catalog_resolved_ocr_field(jsonb,text) from public,anon,authenticated;
grant execute on function public.global_catalog_resolved_ocr_field(jsonb,text) to service_role;

-- Bind an Engine mapping to the exact immutable signoff snapshot. This is a
-- future Admin/service operation; normal users receive no EXECUTE grant.
create or replace function public.authorize_global_catalog_engine_mapping(
  p_catalog_product_id uuid,p_signoff_id uuid,p_mapper_ingredient_id text
) returns void language plpgsql security definer set search_path=public as $$
declare v_fields jsonb; v_source_product_id text; v_signoff_snapshot jsonb; v_catalog_version_id uuid;
begin
  select s.final_fields,c.product_id,
    jsonb_build_object(
      'signoffId',s.id,'revision',s.revision,'at',s.at,'reason',s.reason,
      'policyVersion',s.policy_version,'finalFields',s.final_fields,
      'caseId',c.id,'caseProductId',c.product_id
    ) into v_fields,v_source_product_id,v_signoff_snapshot
    from public.verification_signoffs s
    join public.verification_cases c on c.id=s.case_id
    where s.id=p_signoff_id and s.status='pi_verified' and c.state='verified'
      and s.revision=c.revision and s.policy_version=c.policy_version;
  if not found or not (
    v_fields->>'matched_basement_id'=p_mapper_ingredient_id or exists(
      select 1 from jsonb_array_elements(case when jsonb_typeof(v_fields)='array' then v_fields else '[]'::jsonb end) x
      where coalesce(x->>'field_key',x->>'key') in ('matched_basement_id','mapper_ingredient_id')
        and coalesce(x->>'normalized_value',x->>'value')=p_mapper_ingredient_id
    )
  ) then raise exception 'signoff does not attest this Mapper identity'; end if;
  if not exists(
    select 1 from public.global_catalog_submissions s
    where s.catalog_product_id=p_catalog_product_id and s.private_product_id::text=v_source_product_id
  ) then raise exception 'signoff is not bound to this catalog product source'; end if;
  if not exists(select 1 from public.mapper_basement m where m.ingredient_id=p_mapper_ingredient_id
    and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified') then
    raise exception 'Mapper identity is not currently Engine eligible';
  end if;
  select current_version_id into v_catalog_version_id from public.global_catalog_products where id=p_catalog_product_id;
  if v_catalog_version_id is null then raise exception 'catalog product has no immutable current version'; end if;
  insert into public.global_catalog_engine_mappings(catalog_product_id,catalog_version_id,mapper_ingredient_id,verification_signoff_id,signoff_snapshot)
    values(p_catalog_product_id,v_catalog_version_id,p_mapper_ingredient_id,p_signoff_id,v_signoff_snapshot)
    on conflict(catalog_product_id) do update set mapper_ingredient_id=excluded.mapper_ingredient_id,
      catalog_version_id=excluded.catalog_version_id,
      verification_signoff_id=excluded.verification_signoff_id,signoff_snapshot=excluded.signoff_snapshot,
      authorized_at=now(),revoked_at=null;
end;
$$;
revoke all on function public.authorize_global_catalog_engine_mapping(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_global_catalog_engine_mapping(uuid,uuid,text) to service_role;

-- Relevance/search read model. Stored mapping ids are ignored; current service
-- mapping + current Mapper approvals are checked on every read.
drop function if exists public.search_global_catalog(text,text[],boolean,integer);
create function public.search_global_catalog(
  p_query text,p_market text[] default '{}',p_favorites_only boolean default false,p_limit integer default 100
) returns table(
  id uuid,current_version_id uuid,status text,verification_method text,display_name text,original_name text,
  original_language text,brand text,canonical_family text,category text,mapped_ingredient_id text,
  markets text[],retailers text[],eans text[],aliases text[],favorite boolean,recently_used_at timestamptz,
  missing_fields text[],invalid_fields text[],public_data jsonb,private_price numeric,private_currency text
) language sql stable security definer set search_path=public,extensions as $$
  with q as (
    select trim(regexp_replace(extensions.unaccent(lower(coalesce(p_query,''))),
      '[^a-z0-9]+',' ','g')) value
  ), candidate_ids as (
    select p.id
    from public.global_catalog_products p cross join q
    where p.is_active and (
      q.value='' or
      to_tsvector('simple',p.search_document) @@ to_tsquery('simple',regexp_replace(q.value,' +',':* & ','g')||':*')
    )
    union
    select a.product_id
    from public.global_catalog_aliases a cross join q
    where q.value<>'' and (a.normalized_alias like q.value||'%' or a.normalized_alias % q.value)
    union
    select v.product_id
    from public.global_catalog_variants v cross join q
    where q.value<>'' and v.ean=regexp_replace(p_query,'\D','','g')
  ), market_facts as (
    select vm.variant_id,array_agg(distinct vm.market) markets from public.global_catalog_variant_markets vm group by vm.variant_id
  ), facts as (
    select p.id,p.current_version_id,p.status,p.verification_method,p.display_name,p.original_name,p.original_language,p.brand,
      p.canonical_family,p.category,
      case when gm.revoked_at is null and gm.catalog_version_id=p.current_version_id
        and m.ingredient_id is not null and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified'
        then gm.mapper_ingredient_id else null end mapped_ingredient_id,
      coalesce(array_agg(distinct mk) filter(where mk is not null),'{}') markets,
      coalesce(array_agg(distinct o.retailer) filter(where o.retailer is not null),'{}') retailers,
      coalesce(array_agg(distinct v.ean) filter(where v.ean is not null),'{}') eans,
      coalesce(array_agg(distinct a.alias) filter(where a.alias is not null),'{}') aliases,
      p.missing_fields,p.invalid_fields,p.public_data,p.search_document
    from public.global_catalog_products p
    join candidate_ids c on c.id=p.id
    left join public.global_catalog_engine_mappings gm on gm.catalog_product_id=p.id
    left join public.mapper_basement m on m.ingredient_id=gm.mapper_ingredient_id
    left join public.global_catalog_variants v on v.product_id=p.id and v.is_current
    left join market_facts mf on mf.variant_id=v.id
    left join lateral unnest(coalesce(mf.markets,array[v.market])) mk on true
    left join public.global_catalog_retailer_offers o on o.variant_id=v.id
    left join public.global_catalog_aliases a on a.product_id=p.id
    where p.is_active
    group by p.id,gm.revoked_at,gm.catalog_version_id,gm.mapper_ingredient_id,m.ingredient_id,m.is_active,m.approved_for_base,m.approved_for_engines,m.verification_status
  )
  select f.id,f.current_version_id,f.status,f.verification_method,f.display_name,f.original_name,f.original_language,
    f.brand,f.canonical_family,f.category,f.mapped_ingredient_id,f.markets,f.retailers,f.eans,f.aliases,
    fav.user_id is not null,recent.last_used_at,f.missing_fields,f.invalid_fields,f.public_data,
    private_data.private_price,private_data.currency
  from facts f cross join q
  left join public.global_catalog_favorites fav on fav.user_id=auth.uid() and fav.catalog_product_id=f.id
  left join public.global_catalog_recent_usage recent on recent.user_id=auth.uid() and recent.catalog_product_id=f.id
  left join public.account_catalog_product_data private_data
    on private_data.user_id=auth.uid() and private_data.catalog_product_id=f.id
  where auth.uid() is not null
    and (cardinality(p_market)=0 or f.markets&&p_market)
    and (not p_favorites_only or fav.user_id is not null)
  order by
    case
      when q.value='' then 0
      when trim(regexp_replace(extensions.unaccent(lower(f.display_name)),'[^a-z0-9]+',' ','g'))=q.value then 100
      when exists(select 1 from unnest(f.aliases) alias where trim(regexp_replace(extensions.unaccent(lower(alias)),'[^a-z0-9]+',' ','g'))=q.value) then 98
      when trim(regexp_replace(extensions.unaccent(lower(f.display_name)),'[^a-z0-9]+',' ','g')) like q.value||'%' then 90
      when exists(select 1 from unnest(f.aliases) alias where trim(regexp_replace(extensions.unaccent(lower(alias)),'[^a-z0-9]+',' ','g')) like q.value||'%') then 88
      else 60
    end desc,
    fav.user_id is not null desc,recent.last_used_at desc nulls last,f.status='verified' desc,f.display_name
  limit least(greatest(p_limit,1),500);
$$;
revoke all on function public.search_global_catalog(text,text[],boolean,integer) from public,anon;
grant execute on function public.search_global_catalog(text,text[],boolean,integer) to authenticated;

-- All supported family aliases are stored server-side; cross-language lookup
-- does not depend on first retrieving a row in the original package language.
insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind)
select p.id,x.alias,lower(x.alias),x.language,'canonical_family'
from public.global_catalog_products p
cross join lateral (
  values
    ('strawberry','truskawka','pl'),('strawberry','truskawki','pl'),('strawberry','strawberry','en'),('strawberry','strawberries','en'),('strawberry','fresa','es'),('strawberry','fresas','es'),('strawberry','erdbeere','de'),('strawberry','erdbeeren','de'),('strawberry','fragola','it'),('strawberry','fraise','fr'),
    ('chocolate','czekolada','pl'),('chocolate','chocolate','en'),('chocolate','chocolate','es'),('chocolate','schokolade','de'),('chocolate','cioccolato','it'),('chocolate','chocolat','fr'),
    ('pistachio','pistacja','pl'),('pistachio','pistachio','en'),('pistachio','pistacho','es'),('pistachio','pistazie','de'),('pistachio','pistacchio','it'),('pistachio','pistache','fr'),
    ('vanilla','wanilia','pl'),('vanilla','vanilla','en'),('vanilla','vainilla','es'),('vanilla','vanille','de'),('vanilla','vaniglia','it'),('vanilla','vanille','fr'),
    ('coffee','kawa','pl'),('coffee','coffee','en'),('coffee','cafe','es'),('coffee','kaffee','de'),('coffee','caffe','it'),('coffee','cafe','fr'),
    ('banana','banan','pl'),('banana','banana','en'),('banana','platano','es'),('banana','banane','de'),('banana','banana','it'),('banana','banane','fr'),
    ('mango','mango','pl'),('mango','mango','en'),('mango','mango','es'),('mango','mango','de'),('mango','mango','it'),('mango','mangue','fr')
) x(family,alias,language)
where p.canonical_family=x.family
on conflict do nothing;

-- Secure wrapper around the 0043 deterministic resolver. 0043 remains an
-- internal implementation detail; its EXECUTE grant is removed below.
create or replace function public.submit_owned_product_to_global_catalog_v2(
  p_actor_user_id uuid,p_private_product_id uuid,p_ocr_session_id uuid,p_idempotency_key text,
  p_market text,p_retailer text,p_package_language text,p_image_phashes text[],p_archived_image_paths text[],
  p_duplicate_decision text,p_distinguishing_evidence jsonb,p_ip_hash text,p_device_hash text,
  p_rate_reservation_id uuid,p_server_attestation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_product public.products%rowtype;
  v_prior public.global_catalog_submissions%rowtype;
  v_result jsonb;
  v_catalog_id uuid;
  v_submission_id uuid;
  v_attested boolean:=false;
  v_manual_complete boolean:=false;
  v_mapping text;
  v_version uuid;
  v_start_version uuid;
  v_next_version integer;
  v_case_id uuid;
  v_review_rate jsonb;
  v_manual_rate jsonb;
  v_review_required boolean:=false;
  v_manual_rate_denied boolean:=false;
  v_snapshot_hash text;
  v_evidence_ok boolean:=false;
  v_ingredients text;
  v_allergens text;
  v_basis text;
  v_expected_public_facts jsonb;
  v_resuming_blocked boolean:=false;
  v_has_prior boolean:=false;
  v_existing_fact_change boolean:=false;
  v_current_public_data jsonb;
  v_next_public_data jsonb;
  v_quantity numeric;
  v_unit text;
  v_ean text;
  v_variant_id uuid;
  v_variant_candidate_count integer:=0;
  v_variant_correction_ambiguous boolean:=false;
  v_explicitly_unbranded boolean:=false;
  v_name text;
  v_identity text;
  v_composition text;
  v_family text;
  v_search_document text;
  v_current_missing text[]:='{}'::text[];
  v_current_invalid text[]:='{}'::text[];
begin
  if p_duplicate_decision is not null and p_duplicate_decision not in ('same','different') then raise exception 'invalid duplicate decision'; end if;
  if length(coalesce(p_market,''))>64 or length(coalesce(p_retailer,''))>120 or length(coalesce(p_package_language,''))>24 then raise exception 'catalog field too long'; end if;
  select * into v_product from public.products where id=p_private_product_id and owner_user_id=p_actor_user_id;
  if not found then raise exception 'owned source product not found'; end if;
  if not exists(select 1 from public.global_catalog_rate_events where id=p_rate_reservation_id and user_id=p_actor_user_id
    and action='ocr_scan' and idempotency_key=p_idempotency_key
    and payload_hash=encode(extensions.digest(convert_to(p_actor_user_id::text||':'||p_private_product_id::text||':'||p_ocr_session_id::text,'utf8'),'sha256'),'hex')
  ) then raise exception 'valid pre-processing rate reservation required'; end if;
  update public.global_catalog_rate_events set consumed_at=coalesce(consumed_at,now()) where id=p_rate_reservation_id;

  -- The source may be a newly saved OCR product or an owner product explicitly
  -- confirmed by the duplicate flow. Both ownership checks are server-side;
  -- GREEN still additionally requires the independent attestation to match
  -- every published fact from the current session images exactly.
  v_snapshot_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(to_jsonb(v_product)-'owner_user_id'-'supplier'-'cost_per_kg'-'currency')::text,'utf8'),'sha256'),'hex');
  -- Serialize identity resolution before the legacy resolver can create or
  -- mutate a shared core. The later product-id lock protects version updates;
  -- this lock protects concurrent first-seen submissions of the same SKU.
  v_ean:=nullif(regexp_replace(coalesce(v_product.ean_code,v_product.barcode,''),'\D','','g'),'');
  perform pg_advisory_xact_lock(hashtext(
    'catalog-identity:'||coalesce(
      v_ean,
      lower(regexp_replace(
        coalesce(nullif(trim(v_product.brand),''),'')||'|'||coalesce(
          nullif(trim(v_product.product_name_display),''),
          nullif(trim(v_product.product_name_internal),''),
          ''
        ),
        '[^a-zA-Z0-9|]+','','g'
      ))
    )
  ));
  insert into public.global_catalog_product_session_bindings(private_product_id,ocr_session_id,actor_user_id,product_snapshot_sha256)
    values(p_private_product_id,p_ocr_session_id,p_actor_user_id,v_snapshot_hash)
    on conflict(private_product_id,ocr_session_id) do update set
      actor_user_id=excluded.actor_user_id,
      product_snapshot_sha256=excluded.product_snapshot_sha256,
      created_at=now();
  insert into public.global_catalog_product_session_binding_history(
    private_product_id,ocr_session_id,actor_user_id,product_snapshot_sha256
  ) values(p_private_product_id,p_ocr_session_id,p_actor_user_id,v_snapshot_hash)
  on conflict do nothing;

  v_basis:=coalesce(v_product.extracted_json->>'basis','unknown');
  v_explicitly_unbranded:=coalesce((v_product.extracted_json->>'explicitlyUnbranded')::boolean,false);
  v_name:=coalesce(nullif(trim(v_product.product_name_display),''),nullif(trim(v_product.product_name_internal),''));
  v_identity:=lower(regexp_replace(coalesce(v_product.brand,'')||'|'||coalesce(v_name,''),'[^a-zA-Z0-9|]+','','g'));
  v_ingredients:=public.global_catalog_resolved_ocr_field(v_product.extracted_json,'ingredients_text');
  v_allergens:=public.global_catalog_resolved_ocr_field(v_product.extracted_json,'allergens_text');
  v_quantity:=nullif(substring(replace(coalesce(v_product.package_size,''),',','.') from '([0-9]+(?:\.[0-9]+)?)'),'')::numeric;
  v_unit:=lower(substring(coalesce(v_product.package_size,'') from '(kg|ml|g|l)'));
  v_expected_public_facts:=jsonb_strip_nulls(jsonb_build_object(
    'sourceProductSnapshotSha256',v_snapshot_hash,
    'productName',v_product.product_name_display,
    'brand',v_product.brand,
    'explicitlyUnbranded',v_explicitly_unbranded,
    'ean',nullif(regexp_replace(coalesce(v_product.ean_code,v_product.barcode,''),'\D','','g'),''),
    'netQuantityText',v_product.package_size,
    'market',p_market,
    'nutritionBasis',v_basis,
    'nutrition',jsonb_strip_nulls(jsonb_build_object(
      'energyKcal',v_product.kcal_per_100g,'fat',v_product.fat_percent,
      'saturatedFat',v_product.saturated_fat_percent,'carbohydrate',v_product.carbohydrate_percent,
      'sugars',v_product.total_sugars_percent,'protein',v_product.protein_percent,
      'salt',v_product.salt_percent,'fibre',v_product.fiber_percent
    )),
    'ingredientsText',v_ingredients,'allergensText',v_allergens
  ));

  if p_server_attestation_id is not null then
    select exists(
      select 1 from public.global_catalog_server_ocr_attestations a
      where a.id=p_server_attestation_id and a.source_session_key=p_ocr_session_id
        and a.actor_user_id=p_actor_user_id and a.overall_confidence>=85
        and a.image_checksums<@array(select checksum_sha256 from public.ocr_intake_images where session_id=p_ocr_session_id)
        and a.image_checksums@>array(select checksum_sha256 from public.ocr_intake_images where session_id=p_ocr_session_id)
        and a.archived_image_paths<@coalesce(p_archived_image_paths,'{}')
        and a.archived_image_paths@>coalesce(p_archived_image_paths,'{}')
        and a.verified_fields=v_expected_public_facts
        and nullif(trim(coalesce(v_product.product_name_display,'')),'') is not null
        and (
          (nullif(trim(coalesce(v_product.brand,'')),'') is not null and not v_explicitly_unbranded)
          or (v_product.brand is null and v_explicitly_unbranded)
        )
        and (v_ean is null or public.global_catalog_valid_gtin(v_ean))
        and v_quantity>0 and v_unit in ('g','kg','ml','l')
        and nullif(trim(coalesce(p_market,'')),'') is not null
        and v_basis in ('per_100g','per_100ml')
        and v_product.kcal_per_100g between 0 and 1000
        and v_product.fat_percent between 0 and 100
        and v_product.carbohydrate_percent between 0 and 100
        and v_product.protein_percent between 0 and 100
        and v_product.salt_percent between 0 and 100
        and (v_product.saturated_fat_percent is null or (
          v_product.saturated_fat_percent between 0 and 100
          and v_product.saturated_fat_percent<=v_product.fat_percent+0.01
        ))
        and (v_product.total_sugars_percent is null or (
          v_product.total_sugars_percent between 0 and 100
          and v_product.total_sugars_percent<=v_product.carbohydrate_percent+0.01
        ))
        and (v_product.fiber_percent is null or v_product.fiber_percent between 0 and 100)
        and coalesce(v_product.fat_percent,0)+coalesce(v_product.carbohydrate_percent,0)
          +coalesce(v_product.protein_percent,0)+coalesce(v_product.fiber_percent,0)
          +coalesce(v_product.salt_percent,0)<=105
        and abs(v_product.kcal_per_100g-(v_product.fat_percent*9
          +v_product.carbohydrate_percent*4+v_product.protein_percent*4
          +coalesce(v_product.fiber_percent,0)*2))
          <=greatest(35,(v_product.fat_percent*9+v_product.carbohydrate_percent*4
            +v_product.protein_percent*4+coalesce(v_product.fiber_percent,0)*2)*0.25)
        and nullif(trim(coalesce(v_ingredients,'')),'') is not null
        and nullif(trim(coalesce(v_allergens,'')),'') is not null
        and exists(
          select 1 from public.ocr_intake_images i
          where i.session_id=p_ocr_session_id and i.state='ready' and i.role='front'
        )
        and exists(
          select 1 from public.ocr_intake_images i
          where i.session_id=p_ocr_session_id and i.state='ready'
            and i.role in ('nutrition_table','back')
        )
    ) into v_attested;
  end if;

  if p_duplicate_decision='different' then
    v_evidence_ok := jsonb_typeof(coalesce(p_distinguishing_evidence,'{}'))='object' and exists(
      select 1 from jsonb_each(coalesce(p_distinguishing_evidence,'{}')) e
      where e.key in ('ean','netQuantity','ingredientsText','nutrition','market','variant','additionalImageArchivePath')
        and e.value not in ('null'::jsonb,'""'::jsonb,'{}'::jsonb,'[]'::jsonb)
        and (e.key<>'variant' or length(trim(both '"' from e.value::text))>=6)
    );
    if not v_evidence_ok then raise exception 'recognized distinguishing duplicate evidence is required'; end if;
  end if;

  -- Charge the distinct-product dispute before deleting the resumable prior
  -- decision. A denied quota must leave the pending duplicate and its review
  -- linkage intact so the customer can retry after the window.
  if p_duplicate_decision='different' then
    v_review_rate:=public.reserve_global_catalog_rate_slot(
      p_actor_user_id,'duplicate_dispute',left('duplicate:'||p_idempotency_key,160),
      encode(extensions.digest(convert_to(
        v_snapshot_hash||':'||coalesce(p_distinguishing_evidence,'{}'::jsonb)::text,
        'utf8'
      ),'sha256'),'hex'),
      p_ip_hash,p_device_hash,true
    );
    if not coalesce((v_review_rate->>'allowed')::boolean,false) then
      return jsonb_build_object(
        'kind','rate_limited','productId',null,'status',null,'autoFavorited',false,
        'duplicateCandidates','[]'::jsonb,'missingFields','[]'::jsonb,'reviewCaseKey',null,
        'rateReason',v_review_rate->>'reason','retryAt',v_review_rate->>'retryAt',
        'challengeRequired',(v_review_rate->>'reason') in ('ip_risk','device_risk')
      );
    end if;
  end if;

  -- A pending likely-duplicate decision is a resumable state under the SAME
  -- idempotency key, not a terminal replay and not a second submission.
  select * into v_prior from public.global_catalog_submissions where submitter_user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  v_has_prior:=found;
  v_resuming_blocked:=v_has_prior and v_prior.outcome='blocked';
  if v_has_prior and v_prior.outcome in ('likely_duplicate','blocked') then
    select rcs.case_id into v_case_id from public.global_catalog_review_case_submissions rcs where rcs.submission_id=v_prior.id;
    delete from public.global_catalog_review_case_submissions where submission_id=v_prior.id;
    if v_case_id is not null then
      update public.global_catalog_review_cases set submission_count=greatest(0,submission_count-1) where id=v_case_id;
      delete from public.global_catalog_review_cases where id=v_case_id and submission_count=0;
      v_case_id:=null;
    end if;
  end if;
  if v_has_prior and v_prior.outcome='likely_duplicate' and p_duplicate_decision is not null then
    delete from public.global_catalog_submissions where id=v_prior.id;
  elsif v_has_prior and v_prior.outcome='blocked' then
    -- Manual completion is a resumable update of the same private product/session.
    -- The previous RED submission is replaced; immutable catalog versions retain history.
    delete from public.global_catalog_submissions where id=v_prior.id;
  elsif v_has_prior then
    return v_prior.result_snapshot;
  end if;

  if v_has_prior then
    select p.current_version_id into v_start_version
      from public.global_catalog_products p
      where p.id=v_prior.catalog_product_id;
  end if;

  -- A manual completion resumes the exact RED catalog core selected by the
  -- previous submission. It must not run package-similarity resolution again.
  -- The legacy resolver is now reachable only through this checked wrapper.
  v_result:=public.submit_owned_product_to_global_catalog(
    p_actor_user_id,p_private_product_id,p_ocr_session_id,p_idempotency_key,p_market,p_package_language,
    p_image_phashes,p_archived_image_paths,p_duplicate_decision,p_distinguishing_evidence,p_ip_hash,p_device_hash,true,
    p_rate_reservation_id,
    case when v_resuming_blocked then v_prior.catalog_product_id else null end
  );
  v_catalog_id:=nullif(v_result->>'productId','')::uuid;
  if v_catalog_id is null then
    if (v_result->>'kind')='likely_duplicate' then
      v_result:=jsonb_set(v_result,'{duplicateCandidates}',coalesce((
        select jsonb_agg(c.candidate||jsonb_strip_nulls(jsonb_build_object(
          'displayName',p.display_name,'brand',p.brand,
          'netQuantity',case when v.net_quantity is not null then v.net_quantity::text||' '||v.net_unit else null end,
          'market',v.market,'ean',v.ean
        )))
        from jsonb_array_elements(coalesce(v_result->'duplicateCandidates','[]'::jsonb)) c(candidate)
        left join public.global_catalog_products p on p.id=nullif(c.candidate->>'productId','')::uuid
        left join lateral (
          select x.* from public.global_catalog_variants x where x.product_id=p.id and x.is_current order by x.created_at desc limit 1
        ) v on true
      ),'[]'::jsonb));
      update public.global_catalog_submissions set result_snapshot=v_result
        where submitter_user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
    end if;
    return v_result;
  end if;
  -- A blocked shared core discovered by exact identity is a resumable catalog
  -- candidate even when this account did not create the original RED
  -- submission. It must pass the same manual quota/version gate as an owner's
  -- retry; exact server attestation may instead promote it to GREEN.
  if (select status from public.global_catalog_products where id=v_catalog_id)='blocked' then
    v_resuming_blocked:=true;
  end if;
  -- Serialize every mutation of one shared product before changing its current
  -- facts or version pointer. Concurrent scans must never snapshot each other's
  -- half-applied state.
  perform pg_advisory_xact_lock(hashtext('catalog-version:'||v_catalog_id::text));
  v_ean:=nullif(regexp_replace(coalesce(v_product.ean_code,v_product.barcode,''),'\D','','g'),'');
  v_quantity:=nullif(substring(replace(coalesce(v_product.package_size,''),',','.') from '([0-9]+(?:\.[0-9]+)?)'),'')::numeric;
  v_unit:=lower(substring(coalesce(v_product.package_size,'') from '(kg|ml|g|l)'));
  -- A confirmed same product may still be a distinct package/SKU. Preserve the
  -- incoming EAN/quantity/market as a variant instead of attaching availability
  -- to whichever variant happened to be newest.
  if p_duplicate_decision='same' and not v_resuming_blocked and not exists(
    select 1 from public.global_catalog_variants v
    where v.product_id=v_catalog_id and (
      (v_ean is not null and v.ean=v_ean) or
      (v_ean is null and v.ean is null and v.net_quantity is not distinct from v_quantity
        and v.net_unit is not distinct from v_unit and v.market=coalesce(p_market,'GLOBAL'))
    )
  ) then
    insert into public.global_catalog_variants(
      product_id,ean,net_quantity,net_unit,market,package_language,original_package_name,image_phashes
    ) values(
      v_catalog_id,v_ean,v_quantity,v_unit,coalesce(p_market,'GLOBAL'),p_package_language,
      v_product.product_name_display,coalesce(p_image_phashes,'{}')
    ) on conflict(ean) where ean is not null do nothing;
  end if;
  -- A manual RED correction may change the no-EAN quantity that was used to
  -- create the placeholder variant. Retain a single exact product/market row;
  -- multiple candidates are ambiguous and must remain RED for owner review.
  if v_resuming_blocked then
    if v_ean is not null then
      select v.id into v_variant_id from public.global_catalog_variants v
        where v.product_id=v_catalog_id and v.ean=v_ean;
      if v_variant_id is null and exists(
        select 1 from public.global_catalog_variants v
          where v.ean=v_ean and v.product_id<>v_catalog_id
      ) then
        v_variant_correction_ambiguous:=true;
      end if;
    end if;
    if v_variant_id is null and not v_variant_correction_ambiguous then
    select count(*) into v_variant_candidate_count from public.global_catalog_variants v
      where v.product_id=v_catalog_id
        and v.market=coalesce(p_market,'GLOBAL')
        and v.ean is null;
    if v_variant_candidate_count=1 then
      select v.id into v_variant_id from public.global_catalog_variants v
        where v.product_id=v_catalog_id
          and v.market=coalesce(p_market,'GLOBAL')
          and v.ean is null;
    else
      v_variant_correction_ambiguous:=true;
    end if;
    end if;
  else
    select v.id into v_variant_id from public.global_catalog_variants v
      where v.product_id=v_catalog_id and (
        (v_ean is not null and v.ean=v_ean) or
        (v_ean is null and v.ean is null and v.net_quantity is not distinct from v_quantity
          and v.net_unit is not distinct from v_unit and v.market=coalesce(p_market,'GLOBAL'))
      ) order by v.created_at desc limit 1;
  end if;
  -- Neither an automatic attestation nor manual completeness may select one of
  -- several no-EAN packages by accident.
  if v_variant_correction_ambiguous then v_attested:=false; end if;
  -- Recompute the exact RED state on every attempt. The legacy resolver is not
  -- allowed to mutate a pre-reserved core, so retaining its old arrays would
  -- leave resolved defects visible and omit newly introduced defects.
  v_current_missing:=array_remove(array[
    case when nullif(trim(coalesce(v_product.product_name_display,'')),'') is null then 'product_name' end,
    case when nullif(trim(coalesce(v_product.brand,'')),'') is null and not v_explicitly_unbranded then 'brand_or_unbranded' end,
    case when nullif(trim(coalesce(p_market,'')),'') is null then 'market_of_sale' end,
    case when v_quantity is null or v_quantity<=0 or v_unit is null or v_unit not in ('g','kg','ml','l') then 'net_quantity_unit' end,
    case when v_product.kcal_per_100g is null then 'nutrition_energyKcal' end,
    case when v_product.fat_percent is null then 'nutrition_fat' end,
    case when v_product.carbohydrate_percent is null then 'nutrition_carbohydrate' end,
    case when v_product.protein_percent is null then 'nutrition_protein' end,
    case when v_product.salt_percent is null then 'nutrition_salt' end,
    case when v_basis not in ('per_100g','per_100ml') then 'nutrition_basis' end,
    case when nullif(trim(coalesce(v_ingredients,'')),'') is null then 'ingredients_text' end,
    case when nullif(trim(coalesce(v_allergens,'')),'') is null then 'allergens_text' end,
    case when not exists(select 1 from public.ocr_intake_images i where i.session_id=p_ocr_session_id and i.state='ready' and i.role='front') then 'front_package_image' end,
    case when not exists(select 1 from public.ocr_intake_images i where i.session_id=p_ocr_session_id and i.state='ready' and i.role in ('nutrition_table','back')) then 'nutrition_image' end
  ],null);
  v_current_invalid:=array_remove(array[
    case when v_product.brand is not null and v_explicitly_unbranded then 'brand_unbranded_conflict' end,
    case when v_ean is not null and not public.global_catalog_valid_gtin(v_ean) then 'ean_gtin_check_digit' end,
    case when v_product.fat_percent is not null and v_product.fat_percent not between 0 and 100 then 'nutrition_fat' end,
    case when v_product.saturated_fat_percent is not null and (
      v_product.saturated_fat_percent not between 0 and 100
      or (v_product.fat_percent is not null and v_product.saturated_fat_percent>v_product.fat_percent+0.01)
    ) then 'nutrition_saturated_fat' end,
    case when v_product.carbohydrate_percent is not null and v_product.carbohydrate_percent not between 0 and 100 then 'nutrition_carbohydrate' end,
    case when v_product.total_sugars_percent is not null and (
      v_product.total_sugars_percent not between 0 and 100
      or (v_product.carbohydrate_percent is not null and v_product.total_sugars_percent>v_product.carbohydrate_percent+0.01)
    ) then 'nutrition_sugars' end,
    case when v_product.protein_percent is not null and v_product.protein_percent not between 0 and 100 then 'nutrition_protein' end,
    case when v_product.salt_percent is not null and v_product.salt_percent not between 0 and 100 then 'nutrition_salt' end,
    case when v_product.fiber_percent is not null and v_product.fiber_percent not between 0 and 100 then 'nutrition_fibre' end,
    case when v_product.kcal_per_100g is not null and v_product.kcal_per_100g not between 0 and 1000 then 'nutrition_energyKcal' end,
    case when coalesce(v_product.fat_percent,0)+coalesce(v_product.carbohydrate_percent,0)
      +coalesce(v_product.protein_percent,0)+coalesce(v_product.fiber_percent,0)+coalesce(v_product.salt_percent,0)>105
      then 'nutrition_macro_mass_conflict' end,
    case when v_product.kcal_per_100g is not null and v_product.fat_percent is not null
      and v_product.carbohydrate_percent is not null and v_product.protein_percent is not null
      and abs(v_product.kcal_per_100g-(v_product.fat_percent*9+v_product.carbohydrate_percent*4
        +v_product.protein_percent*4+coalesce(v_product.fiber_percent,0)*2))
        >greatest(35,(v_product.fat_percent*9+v_product.carbohydrate_percent*4
          +v_product.protein_percent*4+coalesce(v_product.fiber_percent,0)*2)*0.25)
      then 'nutrition_energy_macro_conflict' end,
    case when v_variant_correction_ambiguous then 'ambiguous_no_ean_variant' end
  ],null);
  select id into v_version from public.global_catalog_product_versions where product_id=v_catalog_id order by version desc limit 1;

  v_next_public_data:=jsonb_strip_nulls(jsonb_build_object(
    'nutrition',coalesce(v_expected_public_facts->'nutrition','{}'::jsonb)
      || jsonb_build_object('basis',v_expected_public_facts->'nutritionBasis'),
    'ingredientsText',v_expected_public_facts->'ingredientsText',
    'allergensText',v_expected_public_facts->'allergensText'
  ));
  -- Discovery data for GREEN must be derived only from independently attested
  -- public facts. Customer-only category/country/arbitrary extracted JSON may
  -- remain visibly manual on BLUE, but cannot ride into a GREEN search index or
  -- deduplication fingerprint behind an otherwise valid OCR attestation.
  v_composition:=md5(v_next_public_data::text);
  v_family:=case
    when lower(coalesce(v_name,'')) ~ 'trusk|strawber|fresa|erdbeer|fragol|fraise' then 'strawberry'
    when lower(coalesce(v_name,'')) ~ 'czekol|chocol|schokol|cioccol' then 'chocolate'
    when lower(coalesce(v_name,'')) ~ 'pistac' then 'pistachio'
    when lower(coalesce(v_name,'')) ~ 'wanil|vanil|vanigl' then 'vanilla'
    when lower(coalesce(v_name,'')) ~ 'kaw|coffee|kaffee|cafe|caffe' then 'coffee'
    when lower(coalesce(v_name,'')) ~ 'banan' then 'banana'
    when lower(coalesce(v_name,'')) ~ 'mango' then 'mango'
    else case when v_attested then null else v_product.normalized_category end end;
  v_search_document:=lower(
    coalesce(v_name,'')||' '||coalesce(v_product.brand,'')||' '||coalesce(v_ean,'')
    ||case when v_attested then '' else ' '||coalesce(v_product.product_category,'')
      ||' '||coalesce(v_product.normalized_category,'') end
  );
  select p.public_data into v_current_public_data from public.global_catalog_products p where p.id=v_catalog_id;
  v_existing_fact_change:=(v_result->>'kind')='existing'
    and (
      jsonb_strip_nulls(coalesce(v_current_public_data,'{}'::jsonb)) is distinct from v_next_public_data
      or exists(select 1 from public.global_catalog_products p where p.id=v_catalog_id and (
        p.display_name is distinct from v_product.product_name_display
        or p.brand is distinct from v_product.brand
        or p.explicitly_unbranded is distinct from v_explicitly_unbranded
        or p.normalized_identity is distinct from v_identity
        or p.composition_fingerprint is distinct from v_composition
        or p.canonical_family is distinct from v_family
        or p.category is distinct from (case when v_attested then null else v_product.product_category end)
        or p.country_of_origin is distinct from (case when v_attested then null else v_product.country end)
        or p.search_document is distinct from v_search_document
      ))
      or exists(select 1 from public.global_catalog_variants v where v.id=v_variant_id and (
        v.ean is distinct from v_ean or v.net_quantity is distinct from v_quantity or v.net_unit is distinct from v_unit
      ))
    );

  -- An exact-EAN repeat is not a license to overwrite history. Only the
  -- independent server attestation may publish changed package facts, and it
  -- does so as a new immutable version. An unattested difference becomes a
  -- correction review case while the currently verified product stays intact.
  if v_existing_fact_change and not v_resuming_blocked and v_attested then
    update public.global_catalog_products set
      display_name=v_product.product_name_display,
      original_name=v_product.product_name_display,
      brand=v_product.brand,
      explicitly_unbranded=v_explicitly_unbranded,
      normalized_identity=v_identity,
      composition_fingerprint=v_composition,
      canonical_family=v_family,
      category=null,
      country_of_origin=null,
      search_document=v_search_document,
      public_data=v_next_public_data,
      status='verified',verification_method='automatic',provenance='automatic_verified',
      verified_at=now(),verified_source_version='catalog-automatic-v2'
    where id=v_catalog_id;
    v_quantity:=nullif(substring(replace(coalesce(v_product.package_size,''),',','.') from '([0-9]+(?:\.[0-9]+)?)'),'')::numeric;
    v_unit:=lower(substring(coalesce(v_product.package_size,'') from '(kg|ml|g|l)'));
    update public.global_catalog_variants set
      ean=coalesce(v_ean,ean),
      net_quantity=coalesce(v_quantity,net_quantity),
      net_unit=coalesce(v_unit,net_unit),
      package_language=coalesce(p_package_language,package_language),
      original_package_name=coalesce(v_product.product_name_display,original_package_name)
    where id=v_variant_id;
    perform pg_advisory_xact_lock(hashtext('catalog-version:'||v_catalog_id::text));
    select coalesce(max(version),0)+1 into v_next_version from public.global_catalog_product_versions where product_id=v_catalog_id;
    insert into public.global_catalog_product_versions(
      product_id,version,snapshot,evidence_snapshot,provenance,verification_method,supersedes
    ) values(
      v_catalog_id,v_next_version,
      (select to_jsonb(p) from public.global_catalog_products p where p.id=v_catalog_id),
      jsonb_build_object(
        'serverAttestationId',p_server_attestation_id,
        'imageChecksums',(select to_jsonb(array_agg(checksum_sha256 order by display_order)) from public.ocr_intake_images where session_id=p_ocr_session_id)
      ),
      'automatic_verified','automatic',v_version
    ) returning id into v_version;
    update public.global_catalog_products set current_version_id=v_version where id=v_catalog_id;
  end if;

  -- Current Engine mapping is service-owned and current approvals are checked.
  select gm.mapper_ingredient_id into v_mapping from public.global_catalog_engine_mappings gm
    join public.global_catalog_products p on p.id=gm.catalog_product_id and p.current_version_id=gm.catalog_version_id
    join public.mapper_basement m on m.ingredient_id=gm.mapper_ingredient_id
    where gm.catalog_product_id=v_catalog_id and gm.revoked_at is null
      and m.is_active and m.approved_for_base and m.approved_for_engines and m.verification_status='verified';
  update public.global_catalog_products set mapped_ingredient_id=v_mapping where id=v_catalog_id;

  v_manual_complete:=nullif(trim(coalesce(v_product.product_name_display,'')),'') is not null
    and ((nullif(trim(coalesce(v_product.brand,'')),'') is not null and not v_explicitly_unbranded)
      or (v_product.brand is null and v_explicitly_unbranded))
    and (v_ean is null or public.global_catalog_valid_gtin(v_ean))
    and v_quantity>0 and v_unit in ('g','kg','ml','l')
    and nullif(trim(coalesce(p_market,'')),'') is not null
    and v_product.kcal_per_100g between 0 and 1000
    and v_product.fat_percent between 0 and 100
    and v_product.carbohydrate_percent between 0 and 100
    and v_product.protein_percent between 0 and 100
    and v_product.salt_percent between 0 and 100
    and (v_product.saturated_fat_percent is null or (
      v_product.saturated_fat_percent between 0 and 100
      and v_product.saturated_fat_percent<=v_product.fat_percent+0.01
    ))
    and (v_product.total_sugars_percent is null or (
      v_product.total_sugars_percent between 0 and 100
      and v_product.total_sugars_percent<=v_product.carbohydrate_percent+0.01
    ))
    and (v_product.fiber_percent is null or v_product.fiber_percent between 0 and 100)
    and coalesce(v_product.fat_percent,0)+coalesce(v_product.carbohydrate_percent,0)
      +coalesce(v_product.protein_percent,0)+coalesce(v_product.fiber_percent,0)
      +coalesce(v_product.salt_percent,0)<=105
    and v_basis in ('per_100g','per_100ml')
    and nullif(trim(coalesce(v_ingredients,'')),'') is not null
    and nullif(trim(coalesce(v_allergens,'')),'') is not null
    and cardinality(v_current_invalid)=0
    and not v_variant_correction_ambiguous;
  if not v_attested and v_manual_complete and ((v_result->>'kind')='created' or v_resuming_blocked) then
    v_manual_rate:=public.reserve_global_catalog_rate_slot(
      p_actor_user_id,'manual_candidate',left('manual:'||p_idempotency_key,160),v_snapshot_hash,
      p_ip_hash,p_device_hash,true
    );
    if not coalesce((v_manual_rate->>'allowed')::boolean,false) then
      v_manual_rate_denied:=true;
      v_manual_complete:=false;
    end if;
  end if;
  if not v_attested and ((v_result->>'kind')='created' or v_resuming_blocked) then
    update public.global_catalog_products set
      status=case when v_manual_complete then 'manual_unverified' else 'blocked' end,
      verification_method=case when v_manual_complete then 'manual_unverified' else 'blocked' end,
      provenance=case when v_manual_complete then 'manual_completion' else 'ocr_automatic' end,
      brand=case when v_manual_complete then v_product.brand else brand end,
      explicitly_unbranded=case when v_manual_complete then v_explicitly_unbranded else explicitly_unbranded end,
      missing_fields=case when v_manual_complete then missing_fields else v_current_missing end,
      invalid_fields=case when v_manual_complete then invalid_fields else v_current_invalid end,
      verified_at=null,verified_source_version=null
      where id=v_catalog_id;
  elsif v_attested and ((v_result->>'kind')='created' or v_resuming_blocked) then
    update public.global_catalog_products set
      status='verified',verification_method='automatic',provenance='automatic_verified',
      display_name=v_product.product_name_display,original_name=v_product.product_name_display,
      brand=v_product.brand,explicitly_unbranded=v_explicitly_unbranded,
      public_data=v_next_public_data,missing_fields='{}'::text[],invalid_fields='{}'::text[],
      verified_at=now(),verified_source_version='catalog-automatic-v2'
    where id=v_catalog_id;
  elsif v_attested then
    update public.global_catalog_products set verified_at=coalesce(verified_at,now()),
      verified_source_version='catalog-automatic-v2' where id=v_catalog_id and status='verified';
  end if;

  if v_attested and v_resuming_blocked and v_variant_id is not null then
    update public.global_catalog_variants set
      ean=coalesce(v_ean,ean),
      net_quantity=v_quantity,
      net_unit=v_unit,
      package_language=coalesce(p_package_language,package_language),
      original_package_name=coalesce(v_product.product_name_display,original_package_name)
    where id=v_variant_id;
  end if;

  if not v_attested and v_manual_complete and v_catalog_id is not null and (
    v_resuming_blocked or
    (select status from public.global_catalog_products where id=v_catalog_id)='blocked'
  ) then
    update public.global_catalog_products set
      status='manual_unverified',verification_method='manual_unverified',provenance='manual_completion',
      display_name=v_product.product_name_display,original_name=v_product.product_name_display,
      brand=v_product.brand,explicitly_unbranded=v_explicitly_unbranded,
      country_of_origin=v_product.country,
      missing_fields=array_remove(array[
        case when v_ingredients is null then 'ingredients_text' end,
        case when v_allergens is null then 'allergens_text' end,
        case when not exists(select 1 from public.ocr_intake_images where session_id=p_ocr_session_id and state='ready' and role='front') then 'front_package_image' end,
        case when not exists(select 1 from public.ocr_intake_images where session_id=p_ocr_session_id and state='ready' and role in ('nutrition_table','back')) then 'nutrition_image' end
      ],null),
      invalid_fields='{}'::text[],verified_at=null,verified_source_version=null,
      public_data=jsonb_strip_nulls(jsonb_build_object(
        'nutrition',jsonb_build_object(
          'basis',v_basis,'energyKcal',v_product.kcal_per_100g,'fat',v_product.fat_percent,
          'saturatedFat',v_product.saturated_fat_percent,'carbohydrate',v_product.carbohydrate_percent,
          'sugars',v_product.total_sugars_percent,'protein',v_product.protein_percent,
          'salt',v_product.salt_percent,'fibre',v_product.fiber_percent
        ),
        'ingredientsText',v_ingredients,'allergensText',v_allergens
      ))
    where id=v_catalog_id;
    update public.global_catalog_variants set
      ean=coalesce(v_ean,ean),
      net_quantity=v_quantity,
      net_unit=v_unit,
      package_language=coalesce(p_package_language,package_language),
      original_package_name=coalesce(v_product.product_name_display,original_package_name)
    where id=v_variant_id;
  end if;

  -- Publish identity/search facts and aliases only after the hardened gate has
  -- accepted the candidate as BLUE or GREEN. A blocked, ambiguous or
  -- rate-denied retry must not mutate shared discovery metadata.
  if v_catalog_id is not null and (
    (v_attested and ((v_result->>'kind')='created' or v_resuming_blocked or v_existing_fact_change))
    or (not v_attested and v_manual_complete and ((v_result->>'kind')='created' or v_resuming_blocked))
  ) then
    update public.global_catalog_products set
      normalized_identity=v_identity,
      composition_fingerprint=v_composition,
      canonical_family=v_family,
      category=case when v_attested then null else v_product.product_category end,
      country_of_origin=case when v_attested then null else v_product.country end,
      search_document=v_search_document
    where id=v_catalog_id;

    insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind)
      values(v_catalog_id,coalesce(v_name,'Nieznany produkt'),lower(coalesce(v_name,'Nieznany produkt')),p_package_language,'original_name')
      on conflict do nothing;
    insert into public.global_catalog_aliases(product_id,alias,normalized_alias,language,kind)
    select v_catalog_id,x.alias,lower(x.alias),x.language,'canonical_family'
    from (values
      ('strawberry','truskawka','pl'),('strawberry','truskawki','pl'),('strawberry','strawberry','en'),('strawberry','strawberries','en'),('strawberry','fresa','es'),('strawberry','fresas','es'),('strawberry','erdbeere','de'),('strawberry','erdbeeren','de'),('strawberry','fragola','it'),('strawberry','fraise','fr'),
      ('chocolate','czekolada','pl'),('chocolate','chocolate','en'),('chocolate','chocolate','es'),('chocolate','schokolade','de'),('chocolate','cioccolato','it'),('chocolate','chocolat','fr'),
      ('pistachio','pistacja','pl'),('pistachio','pistachio','en'),('pistachio','pistacho','es'),('pistachio','pistazie','de'),('pistachio','pistacchio','it'),('pistachio','pistache','fr'),
      ('vanilla','wanilia','pl'),('vanilla','vanilla','en'),('vanilla','vainilla','es'),('vanilla','vanille','de'),('vanilla','vaniglia','it'),('vanilla','vanille','fr'),
      ('coffee','kawa','pl'),('coffee','coffee','en'),('coffee','cafe','es'),('coffee','kaffee','de'),('coffee','caffe','it'),('coffee','cafe','fr'),
      ('banana','banan','pl'),('banana','banana','en'),('banana','platano','es'),('banana','banane','de'),('banana','banana','it'),('banana','banane','fr'),
      ('mango','mango','pl'),('mango','mango','en'),('mango','mango','es'),('mango','mango','de'),('mango','mango','it'),('mango','mangue','fr')
    ) x(family,alias,language)
    where x.family=v_family
    on conflict do nothing;
  end if;

  if not v_manual_rate_denied and v_catalog_id is not null
    and ((v_result->>'kind')='created' or v_resuming_blocked) then
    perform pg_advisory_xact_lock(hashtext('catalog-version:'||v_catalog_id::text));
    select coalesce(max(version),0)+1 into v_next_version from public.global_catalog_product_versions where product_id=v_catalog_id;
    insert into public.global_catalog_product_versions(product_id,version,snapshot,evidence_snapshot,provenance,verification_method,supersedes)
    values(
      v_catalog_id,v_next_version,
      (select to_jsonb(p) from public.global_catalog_products p where p.id=v_catalog_id),
       jsonb_build_object(
         'manualCompletion',v_manual_complete,
         'serverAttestationId',p_server_attestation_id,
         'imageChecksums',(select to_jsonb(array_agg(checksum_sha256 order by display_order)) from public.ocr_intake_images where session_id=p_ocr_session_id)
       ),
      case when v_attested then 'automatic_verified' when v_manual_complete then 'manual_completion' else 'ocr_automatic' end,
      case when v_attested then 'automatic' when v_manual_complete then 'manual_unverified' else 'blocked' end,
      v_version
    ) returning id into v_version;
    update public.global_catalog_products set current_version_id=v_version where id=v_catalog_id;
  end if;

  -- BLOCKED products are never favorites. Completed BLUE/GREEN products are.
  if (select status from public.global_catalog_products where id=v_catalog_id)='blocked' then
    delete from public.global_catalog_favorites where user_id=p_actor_user_id and catalog_product_id=v_catalog_id;
  else
    insert into public.global_catalog_favorites(user_id,entity_key,entity_kind,catalog_product_id)
      values(p_actor_user_id,'catalog:'||v_catalog_id,'commercial_product',v_catalog_id) on conflict do nothing;
  end if;

  -- Preserve market availability for repeated scans of the same EAN/SKU.
  insert into public.global_catalog_variant_markets(variant_id,market,package_language)
    select v.id,coalesce(p_market,'GLOBAL'),p_package_language from public.global_catalog_variants v
      where v.product_id=v_catalog_id and (
        (v_ean is not null and v.ean=v_ean) or
        (v_ean is null and v.net_quantity is not distinct from v_quantity and v.net_unit is not distinct from v_unit)
      ) order by v.created_at desc limit 1
    on conflict(variant_id,market) do update set package_language=coalesce(excluded.package_language,global_catalog_variant_markets.package_language),last_seen_at=now();
  if nullif(trim(p_retailer),'') is not null then
    insert into public.global_catalog_retailer_offers(variant_id,retailer,market,observed_at)
      select v.id,trim(p_retailer),coalesce(p_market,'GLOBAL'),now()
      from public.global_catalog_variants v where v.product_id=v_catalog_id and (
        (v_ean is not null and v.ean=v_ean) or
        (v_ean is null and v.net_quantity is not distinct from v_quantity and v.net_unit is not distinct from v_unit)
      )
      order by v.created_at desc limit 1
      on conflict(variant_id,market,retailer) do update set observed_at=excluded.observed_at;
  end if;

  -- Product versions are immutable. Creation sites above set provenance,
  -- evidence and `supersedes`; here we only publish the latest pointer.
  select id into v_version from public.global_catalog_product_versions where product_id=v_catalog_id order by version desc limit 1;
  if v_version is not null then
    update public.global_catalog_products set current_version_id=v_version where id=v_catalog_id;
  end if;

  select id into v_submission_id from public.global_catalog_submissions where submitter_user_id=p_actor_user_id and idempotency_key=p_idempotency_key;
  v_review_required := (not v_manual_rate_denied) and (
    (select status<>'verified' from public.global_catalog_products where id=v_catalog_id)
    or p_duplicate_decision='different'
    or (v_existing_fact_change and not v_attested)
  );
  if v_review_required and v_submission_id is not null then
    -- The wrapper already consumed the separate duplicate_dispute quota before
    -- the legacy resolver created a distinct candidate. Do not charge it a
    -- second time as human-review work. Other BLUE/RED outcomes reserve review
    -- escalation.
    v_review_rate:=case when p_duplicate_decision='different'
      then jsonb_build_object('allowed',true,'idempotent',true)
      else public.reserve_global_catalog_rate_slot(p_actor_user_id,
        'review_escalation','review:'||v_submission_id::text,
        encode(extensions.digest(convert_to('review:'||v_catalog_id::text,'utf8'),'sha256'),'hex'),
        p_ip_hash,p_device_hash,true)
      end;
    if not coalesce((v_review_rate->>'allowed')::boolean,false) then
      select rcs.case_id into v_case_id from public.global_catalog_review_case_submissions rcs where rcs.submission_id=v_submission_id;
      delete from public.global_catalog_review_case_submissions where submission_id=v_submission_id;
      if v_case_id is not null then
        update public.global_catalog_review_cases set submission_count=greatest(0,submission_count-1) where id=v_case_id;
        delete from public.global_catalog_review_cases where id=v_case_id and submission_count=0;
      end if;
      v_result:=jsonb_set(v_result,'{reviewCaseKey}','null'::jsonb);
      v_result:=v_result||jsonb_build_object(
        'reviewEscalationLimited',true,
        'rateReason',v_review_rate->>'reason','retryAt',v_review_rate->>'retryAt'
      );
    elsif exists(select 1 from public.global_catalog_review_case_submissions where submission_id=v_submission_id) then
      select rcs.case_id into v_case_id
        from public.global_catalog_review_case_submissions rcs
        where rcs.submission_id=v_submission_id;
      update public.global_catalog_review_cases set
        markets=(select array(select distinct unnest(global_catalog_review_cases.markets||array[coalesce(p_market,'GLOBAL')]))),
        duplicate_candidates=case
          when jsonb_array_length(coalesce(v_prior.result_snapshot->'duplicateCandidates','[]'::jsonb))>0
            then v_prior.result_snapshot->'duplicateCandidates'
          else duplicate_candidates
        end,
        latest_evidence=latest_evidence||jsonb_build_object(
          'archivedImagePaths',coalesce(p_archived_image_paths,'{}'),
          'distinguishingEvidence',coalesce(p_distinguishing_evidence,'{}'),
          'proposedPublicFacts',v_expected_public_facts
        )
      where id=v_case_id;
      v_result:=jsonb_set(v_result,'{reviewCaseKey}',to_jsonb((select consolidation_key from public.global_catalog_review_cases where id=v_case_id)));
    else
      insert into public.global_catalog_review_cases(
        consolidation_key,catalog_product_id,kind,priority,markets,missing_fields,duplicate_candidates,normalized_data,latest_evidence
      ) values(
        'product:'||v_catalog_id::text,v_catalog_id,
        case when p_duplicate_decision='different' then 'duplicate_dispute' when v_existing_fact_change and not v_attested then 'correction' when v_manual_complete then 'manual_unverified' else 'verification_failed' end,
        'normal',array[coalesce(p_market,'GLOBAL')],
        (select missing_fields from public.global_catalog_products where id=v_catalog_id),
        case when v_has_prior then coalesce(v_prior.result_snapshot->'duplicateCandidates','[]'::jsonb) else '[]'::jsonb end,
        (select jsonb_strip_nulls(to_jsonb(p)-'mapped_ingredient_id') from public.global_catalog_products p where p.id=v_catalog_id),
        jsonb_build_object(
          'archivedImagePaths',coalesce(p_archived_image_paths,'{}'),
          'distinguishingEvidence',coalesce(p_distinguishing_evidence,'{}'),
          'proposedPublicFacts',v_expected_public_facts
        )
      ) on conflict(consolidation_key) do update set
        submission_count=public.global_catalog_review_cases.submission_count+1,
        latest_evidence=excluded.latest_evidence
      returning id into v_case_id;
      insert into public.global_catalog_review_case_submissions(case_id,submission_id)
        values(v_case_id,v_submission_id) on conflict do nothing;
      v_result:=jsonb_set(v_result,'{reviewCaseKey}',to_jsonb('product:'||v_catalog_id::text));
    end if;
  end if;
  v_result:=jsonb_set(v_result,'{status}',to_jsonb((select status from public.global_catalog_products where id=v_catalog_id)));
  v_result:=jsonb_set(v_result,'{missingFields}',to_jsonb((select missing_fields from public.global_catalog_products where id=v_catalog_id)));
  v_result:=jsonb_set(v_result,'{invalidFields}',to_jsonb((select invalid_fields from public.global_catalog_products where id=v_catalog_id)));
  v_result:=jsonb_set(v_result,'{autoFavorited}',to_jsonb((select status<>'blocked' from public.global_catalog_products where id=v_catalog_id)));
  if v_manual_rate_denied then
    v_result:=v_result||jsonb_build_object(
      'kind','rate_limited','autoFavorited',false,
      'rateReason',v_manual_rate->>'reason','retryAt',v_manual_rate->>'retryAt',
      'challengeRequired',(v_manual_rate->>'reason') in ('ip_risk','device_risk')
    );
    -- Keep this submission explicitly resumable. The Edge function may replay it
    -- before retryAt, then continue the same idempotency key after the window.
    update public.global_catalog_submissions set outcome='blocked' where id=v_submission_id;
  end if;
  if v_variant_correction_ambiguous then
    v_result:=v_result||jsonb_build_object(
      'kind','blocked','autoFavorited',false,
      'rateReason',null,'retryAt',null,'challengeRequired',false
    );
    update public.global_catalog_submissions set outcome='blocked' where id=v_submission_id;
  end if;
  insert into public.global_catalog_audit_events(
    catalog_product_id,review_case_id,submission_id,event_type,actor_kind,payload,correlation_key
  ) values(
    v_catalog_id,v_case_id,v_submission_id,'catalog_submission_hardened','system',
    jsonb_build_object(
      'status',v_result->>'status','serverAttested',v_attested,
      'existingFactsChanged',v_existing_fact_change,'currentVersionId',(select current_version_id from public.global_catalog_products where id=v_catalog_id)
    ),
    'catalog-v2:'||v_submission_id::text
  ) on conflict(correlation_key) do nothing;
  update public.global_catalog_submissions set result_snapshot=v_result where id=v_submission_id;
  return v_result;
end;
$$;

revoke all on function public.submit_owned_product_to_global_catalog(uuid,uuid,uuid,text,text,text,text[],text[],text,jsonb,text,text,boolean,uuid,uuid) from service_role;
revoke all on function public.submit_owned_product_to_global_catalog_v2(uuid,uuid,uuid,text,text,text,text,text[],text[],text,jsonb,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.submit_owned_product_to_global_catalog_v2(uuid,uuid,uuid,text,text,text,text,text[],text[],text,jsonb,text,text,uuid,uuid) to service_role;

-- The migration ledger is an audit classification, not a publication decision.
-- Rows classified by weaker legacy heuristics are downgraded to an honest report.
update public.global_catalog_migration_ledger
set classification='ambiguous_report',reason='Legacy evidence does not satisfy the Global Catalog verification contract; no status or publication was fabricated.'
where source_kind='legacy_product' and classification in ('verified_green','manual_blue');

-- No customer DML on trust/review/rate/mapping tables.
revoke all on public.global_catalog_server_ocr_attestations,public.global_catalog_product_session_bindings,
  public.global_catalog_product_session_binding_history,
  public.global_catalog_engine_mappings,public.global_catalog_rate_denials from public,anon,authenticated;
