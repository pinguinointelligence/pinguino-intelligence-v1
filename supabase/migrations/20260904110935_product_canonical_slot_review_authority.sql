-- Canonical Product Picker v1.9: version-bound exact-product slot review.
-- The filename matches the staging migration ledger's UTC apply identity.
--
-- ProductBehavior deliberately keeps commercial articles product-owned and
-- therefore leaves product_behavior_bindings.mapper_ingredient_id NULL.  A
-- picker still needs a reviewed answer to the separate question "may this
-- exact product replace this canonical recipe slot?".  This relation answers
-- only that eligibility question.  Country/default ranking remains solely in
-- country_product_slot_assignments, and no Mapper or ProductBehavior row is
-- written here.

select pg_advisory_xact_lock(
  hashtextextended('product-canonical-slot-review-authority-v1', 0)
);

create table public.product_canonical_slot_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  mapper_ingredient_id text not null,
  active boolean not null default true,
  approval_reason text not null,
  review_evidence jsonb not null,
  approved_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint product_canonical_slot_reviews_mapper_check check (
    mapper_ingredient_id = btrim(mapper_ingredient_id)
    and mapper_ingredient_id <> ''
  ),
  constraint product_canonical_slot_reviews_reason_check
    check (btrim(approval_reason) <> ''),
  constraint product_canonical_slot_reviews_evidence_check check (
    jsonb_typeof(review_evidence) = 'object'
    and btrim(coalesce(review_evidence->>'slotMatchBasis', '')) <> ''
  )
);

create unique index product_canonical_slot_one_active_slot_idx
  on public.product_canonical_slot_reviews(product_id)
  where active;

create index product_canonical_slot_lookup_idx
  on public.product_canonical_slot_reviews(mapper_ingredient_id, product_id)
  where active;

comment on table public.product_canonical_slot_reviews is
  'CATALOG-reviewed, immutable-version evidence that an exact product may replace one canonical Mapper recipe slot. It is not country/default authority and never supplies product physics.';
comment on column public.product_canonical_slot_reviews.product_version_id is
  'Exact immutable product version reviewed. A later version invalidates this review until separately approved.';
comment on column public.product_canonical_slot_reviews.review_evidence is
  'Admin-reviewed factual basis for the slot match. Must include a non-empty slotMatchBasis.';

create or replace function private.product_canonical_slot_candidate_is_valid_v1(
  p_product_id uuid,
  p_product_version_id uuid,
  p_mapper_ingredient_id text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.products product
    join public.product_versions version
      on version.id = p_product_version_id
     and version.product_id = product.id
     and version.id = product.current_version_id
    join public.product_behavior_bindings binding
      on binding.id = product.current_behavior_binding_id
     and binding.product_id = product.id
     and binding.product_version_id = version.id
     and binding.is_current
    join public.mapper_basement mapper
      on mapper.ingredient_id = btrim(p_mapper_ingredient_id)
     and mapper.is_active
     and mapper.approved_for_base
     and mapper.approved_for_engines
     and lower(coalesce(mapper.verification_status, '')) like 'verified%'
    where product.id = p_product_id
      and product.product_kind in ('commercial_product', 'customer_provisional')
      and product.is_active
      and product.merged_into_product_id is null
      and product.canonical_verification_status <> 'blocked'
      and binding.binding_status = 'ready'
      and coalesce((binding.profile_permissions->>'BASE_RECIPE')::boolean, false)
      and (
        coalesce(version.facts->'public_data', version.facts)
          #>> '{productIntelligence,engineUsable}'
      ) = 'true'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,water}'
      ) = 'number'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,totalSolids}'
      ) = 'number'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,fat}'
      ) = 'number'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,protein}'
      ) = 'number'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,carbohydrate}'
      ) = 'number'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,sugars}'
      ) = 'number'
      and jsonb_typeof(
        coalesce(version.facts->'public_data', version.facts)
          #> '{technicalComposition,salt}'
      ) = 'number'
  )
$function$;

revoke all on function private.product_canonical_slot_candidate_is_valid_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.product_has_current_canonical_slot_review_v1(
  p_mapper_ingredient_id text,
  p_product_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.product_canonical_slot_reviews review
    where review.product_id = p_product_id
      and review.mapper_ingredient_id = btrim(p_mapper_ingredient_id)
      and review.active
      and private.product_canonical_slot_candidate_is_valid_v1(
        review.product_id,
        review.product_version_id,
        review.mapper_ingredient_id
      )
  )
$function$;

revoke all on function private.product_has_current_canonical_slot_review_v1(text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.validate_product_canonical_slot_review_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  new.mapper_ingredient_id := btrim(new.mapper_ingredient_id);
  new.approval_reason := btrim(new.approval_reason);

  if new.active and not private.product_canonical_slot_candidate_is_valid_v1(
    new.product_id,
    new.product_version_id,
    new.mapper_ingredient_id
  ) then
    raise exception 'product_canonical_slot_review_mismatch' using errcode = '23514';
  end if;

  new.updated_at := statement_timestamp();
  if tg_op = 'UPDATE' and (
    new.product_id,
    new.product_version_id,
    new.mapper_ingredient_id,
    new.active,
    new.approval_reason,
    new.review_evidence
  ) is distinct from (
    old.product_id,
    old.product_version_id,
    old.mapper_ingredient_id,
    old.active,
    old.approval_reason,
    old.review_evidence
  ) then
    new.approved_by := auth.uid();
    new.approved_at := statement_timestamp();
  end if;
  return new;
end
$function$;

revoke all on function private.validate_product_canonical_slot_review_v1()
  from public, anon, authenticated, service_role;

create trigger product_canonical_slot_reviews_validate
before insert or update on public.product_canonical_slot_reviews
for each row execute function private.validate_product_canonical_slot_review_v1();

alter table public.product_canonical_slot_reviews enable row level security;

create policy product_canonical_slot_reviews_catalog_admin
  on public.product_canonical_slot_reviews
  for all to authenticated
  using ((select public.gellatti_admin_has_permission_v1('CATALOG')))
  with check ((select public.gellatti_admin_has_permission_v1('CATALOG')));

revoke all on table public.product_canonical_slot_reviews
  from public, anon, authenticated;
grant select, insert, update, delete on table public.product_canonical_slot_reviews
  to authenticated, service_role;

-- The exact picker profile is product-owned. Slot eligibility is supplied by
-- the review relation above, never by the runtime ProductBehavior identity.
create or replace function private.exact_product_has_picker_profile_v1(
  p_mapper_ingredient_id text,
  p_product_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select private.product_has_current_canonical_slot_review_v1(
    p_mapper_ingredient_id,
    p_product_id
  )
$function$;

revoke all on function private.exact_product_has_picker_profile_v1(text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.user_preferred_product_slot_is_usable_v1(
  p_user_id uuid,
  p_mapper_ingredient_id text,
  p_product_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    p_user_id is not null
    and public.can_use_product_relation_v1(p_user_id, p_product_id)
    and private.product_has_current_canonical_slot_review_v1(
      p_mapper_ingredient_id,
      p_product_id
    )
$function$;

revoke all on function private.user_preferred_product_slot_is_usable_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.country_product_slot_assignment_is_usable_v1(
  p_country_code text,
  p_mapper_ingredient_id text,
  p_product_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    p_country_code is not null
    and upper(btrim(p_country_code)) ~ '^[A-Z]{2}$'
    and p_mapper_ingredient_id is not null
    and btrim(p_mapper_ingredient_id) <> ''
    and p_product_id is not null
    and private.product_has_current_canonical_slot_review_v1(
      p_mapper_ingredient_id,
      p_product_id
    )
    and exists (
      select 1
      from public.products product
      join public.product_versions version
        on version.id = product.current_version_id
       and version.product_id = product.id
      where product.id = p_product_id
        and product.product_kind = 'commercial_product'
        and product.visibility = 'shared'
        and product.is_active
        and product.merged_into_product_id is null
        and product.canonical_verification_status <> 'blocked'
        and exists (
          select 1
          from public.product_variants variant
          left join public.product_variant_markets variant_market
            on variant_market.variant_id = variant.id
          where variant.product_id = product.id
            and variant.is_current
            and upper(coalesce(variant_market.market, variant.market)) = upper(btrim(p_country_code))
        )
    )
$function$;

revoke all on function private.country_product_slot_assignment_is_usable_v1(text, text, uuid)
  from public, anon, authenticated, service_role;

-- Return the exact product while carrying the requested slot as resolution
-- context. ProductBehavior remains product-owned and mapper_ingredient_id on
-- its runtime binding is intentionally never consulted.
create or replace function public.resolve_country_product_slots_v1(
  p_mapper_ingredient_ids text[],
  p_product_country text default null,
  p_product_profile text default null
) returns table (
  requested_mapper_ingredient_id text,
  resolution_source text,
  resolution_country text,
  id uuid,
  current_version_id uuid,
  entity_kind text,
  status text,
  verification_method text,
  provenance text,
  display_name text,
  original_name text,
  original_language text,
  brand text,
  canonical_family text,
  category text,
  product_form text,
  mapped_ingredient_id text,
  markets text[],
  retailers text[],
  eans text[],
  aliases text[],
  favorite boolean,
  recently_used_at timestamptz,
  usable_in_base boolean,
  main_allowed boolean,
  usable_as_topping boolean,
  blocked_reason text,
  missing_fields text[],
  invalid_fields text[],
  public_data jsonb,
  private_price numeric,
  private_currency text,
  relevance numeric
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with requested as (
    select distinct btrim(value) as mapper_ingredient_id
    from unnest(coalesce(p_mapper_ingredient_ids, '{}'::text[])) value
    where value is not null and btrim(value) <> ''
  ), effective_country as (
    select coalesce(
      (
        select upper(pref.primary_market)
        from public.account_product_market_preferences pref
        where pref.user_id = auth.uid()
          and pref.primary_market ~* '^[a-z]{2}$'
      ),
      case
        when btrim(coalesce(p_product_country, '')) ~* '^[a-z]{2}$'
          then upper(btrim(p_product_country))
        else null
      end
    ) as country_code
  ), preferred_candidates as (
    select
      requested.mapper_ingredient_id,
      preference.preferred_product_id as product_id,
      'USER_PREFERRED'::text as resolution_source,
      effective_country.country_code as resolution_country,
      0 as authority_rank,
      0 as fallback_rank
    from requested
    cross join effective_country
    join public.user_preferred_product_slots preference
      on preference.user_id = auth.uid()
     and preference.mapper_ingredient_id = requested.mapper_ingredient_id
    where auth.uid() is not null
      and private.user_preferred_product_slot_is_usable_v1(
        auth.uid(),
        preference.mapper_ingredient_id,
        preference.preferred_product_id
      )
  ), country_candidates as (
    select
      requested.mapper_ingredient_id,
      assignment.product_id,
      case assignment.assignment_kind
        when 'PRIMARY_DEFAULT' then 'COUNTRY_PRIMARY_DEFAULT'
        else 'COUNTRY_SAFE_FALLBACK'
      end as resolution_source,
      assignment.country_code as resolution_country,
      case assignment.assignment_kind
        when 'PRIMARY_DEFAULT' then 1
        else 2
      end as authority_rank,
      coalesce(assignment.fallback_priority, 0)::integer as fallback_rank
    from requested
    cross join effective_country
    join public.country_product_slot_assignments assignment
      on assignment.country_code = effective_country.country_code
     and assignment.mapper_ingredient_id = requested.mapper_ingredient_id
     and assignment.active
    where private.country_product_slot_assignment_is_usable_v1(
      assignment.country_code,
      assignment.mapper_ingredient_id,
      assignment.product_id
    )
  ), candidate_sets as (
    select
      requested.mapper_ingredient_id,
      effective_country.country_code as resolution_country,
      (
        select preferred.product_id
        from preferred_candidates preferred
        where preferred.mapper_ingredient_id = requested.mapper_ingredient_id
      ) as user_preferred_product_id,
      (
        select country_candidate.product_id
        from country_candidates country_candidate
        where country_candidate.mapper_ingredient_id = requested.mapper_ingredient_id
          and country_candidate.resolution_source = 'COUNTRY_PRIMARY_DEFAULT'
      ) as country_primary_product_id,
      array(
        select country_candidate.product_id
        from country_candidates country_candidate
        where country_candidate.mapper_ingredient_id = requested.mapper_ingredient_id
          and country_candidate.resolution_source = 'COUNTRY_SAFE_FALLBACK'
        order by country_candidate.fallback_rank
      ) as same_country_fallback_product_ids
    from requested
    cross join effective_country
  ), winner as (
    select
      candidate_sets.mapper_ingredient_id,
      choice.product_id,
      choice.resolution_source,
      candidate_sets.resolution_country
    from candidate_sets
    cross join lateral private.choose_country_product_resolution_v1(
      candidate_sets.user_preferred_product_id,
      candidate_sets.country_primary_product_id,
      candidate_sets.same_country_fallback_product_ids
    ) choice
  )
  select
    winner.mapper_ingredient_id,
    winner.resolution_source,
    winner.resolution_country,
    product.id,
    product.current_version_id,
    'commercial_product'::text,
    product.canonical_verification_status,
    product.canonical_verification_method,
    product.canonical_provenance,
    product.product_name_display,
    product.product_name_internal,
    version.facts->>'originalLanguage',
    product.brand,
    product.canonical_family,
    product.product_category,
    coalesce(binding.form_id, version.facts#>>'{public_data,formId}'),
    winner.mapper_ingredient_id,
    array(
      select distinct market
      from unnest(array_remove(array[
        version.facts->>'market',
        version.facts#>>'{public_data,market}'
      ] || coalesce((
        select array_agg(coalesce(variant_market.market, variant.market))
        from public.product_variants variant
        left join public.product_variant_markets variant_market
          on variant_market.variant_id = variant.id
        where variant.product_id = product.id and variant.is_current
      ), '{}'::text[]), null)) market
    ),
    array(
      select distinct offer.retailer
      from public.product_variants variant
      join public.product_retailer_offers offer on offer.variant_id = variant.id
      where variant.product_id = product.id and variant.is_current
    ),
    array(
      select distinct ean
      from unnest(array_remove(array[product.ean_code_normalized] || coalesce((
        select array_agg(variant.ean)
        from public.product_variants variant
        where variant.product_id = product.id and variant.is_current
      ), '{}'::text[]), null)) ean
    ),
    array(
      select distinct alias
      from unnest(array_remove(array[
        product.product_name_display,
        product.product_name_internal,
        product.brand,
        product.canonical_family,
        product.product_category,
        binding.family_id,
        binding.subfamily_id,
        binding.form_id
      ] || coalesce((
        select array_agg(product_alias.alias)
        from public.product_aliases product_alias
        where product_alias.product_id = product.id
      ), '{}'::text[]), null)) alias
    ),
    coalesce(relation.favorite, false),
    relation.recently_used_at,
    (
      product.canonical_verification_status <> 'blocked'
      and mapper.ingredient_id is not null
      and mapper.is_active
      and mapper.approved_for_base
      and mapper.approved_for_engines
      and lower(coalesce(mapper.verification_status, '')) like 'verified%'
      and coalesce((binding.profile_permissions->>'BASE_RECIPE')::boolean, false)
    ),
    (
      binding.behavior_role in ('MAIN_ALLOWED', 'MAIN_PROFILE_SPECIFIC')
      and binding.main_policy_status = 'COVERED'
      and (p_product_profile is null or binding.profile_applicability ? p_product_profile)
    ),
    (
      product.canonical_verification_status <> 'blocked'
      and coalesce((binding.profile_permissions->>'TOPPING')::boolean, false)
    ),
    case
      when not (
        product.canonical_verification_status <> 'blocked'
        and mapper.ingredient_id is not null
        and mapper.is_active
        and mapper.approved_for_base
        and mapper.approved_for_engines
        and lower(coalesce(mapper.verification_status, '')) like 'verified%'
        and coalesce((binding.profile_permissions->>'BASE_RECIPE')::boolean, false)
      ) then 'Brak aktualnego mapowania PINGÜINO Base'
      else null
    end,
    coalesce((
      select array_agg(item.value)
      from jsonb_array_elements_text(coalesce(version.facts->'missingFields', '[]'::jsonb)) item(value)
    ), '{}'::text[]),
    coalesce((
      select array_agg(item.value)
      from jsonb_array_elements_text(coalesce(version.facts->'invalidFields', '[]'::jsonb)) item(value)
    ), '{}'::text[]),
    coalesce(version.facts->'public_data', version.facts),
    relation.private_price,
    relation.currency,
    0::numeric
  from winner
  join public.products product on product.id = winner.product_id
  join public.product_versions version
    on version.id = product.current_version_id
   and version.product_id = product.id
  join public.product_behavior_bindings binding
    on binding.id = product.current_behavior_binding_id
   and binding.product_id = product.id
   and binding.product_version_id = version.id
   and binding.is_current
  left join public.mapper_basement mapper
    on mapper.ingredient_id = winner.mapper_ingredient_id
  left join public.user_product_relations relation
    on relation.user_id = auth.uid()
   and relation.product_id = product.id
  where binding.binding_status = 'ready'
    and private.product_has_current_canonical_slot_review_v1(
      winner.mapper_ingredient_id,
      product.id
    )
$function$;

revoke all on function public.resolve_country_product_slots_v1(text[], text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_country_product_slots_v1(text[], text, text)
  to anon, authenticated, service_role;

comment on function public.resolve_country_product_slots_v1(text[], text, text) is
  'Resolves user preference, country primary, then same-country fallback through version-bound exact-product slot reviews. ProductBehavior remains product-owned; no row means generic Mapper fallback.';
