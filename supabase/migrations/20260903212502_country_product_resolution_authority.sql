-- Canonical Product Picker v1.9: one country/Mapper-slot product authority.
--
-- This migration deliberately does not infer a commercial winner. A CATALOG
-- administrator must explicitly approve either one PRIMARY_DEFAULT or one or
-- more SAFE_FALLBACK rows with unique, deliberate priorities. When none is
-- valid, the client keeps the already-approved generic Mapper ingredient.

select pg_advisory_xact_lock(
  hashtextextended('country-product-resolution-authority-v1', 0)
);

create table public.country_product_slot_assignments (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.catalog_market_countries(code) on delete restrict,
  mapper_ingredient_id text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  assignment_kind text not null check (
    assignment_kind in ('PRIMARY_DEFAULT', 'SAFE_FALLBACK')
  ),
  fallback_priority smallint,
  active boolean not null default true,
  approval_reason text not null,
  approved_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint country_product_slot_assignments_country_check
    check (country_code = upper(country_code) and country_code ~ '^[A-Z]{2}$'),
  constraint country_product_slot_assignments_mapper_check
    check (mapper_ingredient_id = btrim(mapper_ingredient_id) and mapper_ingredient_id <> ''),
  constraint country_product_slot_assignments_reason_check
    check (btrim(approval_reason) <> ''),
  constraint country_product_slot_assignments_priority_check check (
    (assignment_kind = 'PRIMARY_DEFAULT' and fallback_priority is null)
    or (assignment_kind = 'SAFE_FALLBACK' and fallback_priority between 1 and 32767)
  )
);

create unique index country_product_slot_one_active_primary_idx
  on public.country_product_slot_assignments(country_code, mapper_ingredient_id)
  where active and assignment_kind = 'PRIMARY_DEFAULT';

create unique index country_product_slot_fallback_priority_idx
  on public.country_product_slot_assignments(
    country_code,
    mapper_ingredient_id,
    fallback_priority
  )
  where active and assignment_kind = 'SAFE_FALLBACK';

create unique index country_product_slot_one_active_product_idx
  on public.country_product_slot_assignments(country_code, mapper_ingredient_id, product_id)
  where active;

create index country_product_slot_product_idx
  on public.country_product_slot_assignments(product_id)
  where active;

comment on table public.country_product_slot_assignments is
  'Canonical country-to-Mapper-slot exact-product relationship for the picker. Rows are explicit CATALOG approvals, never inferred search ranking.';
comment on column public.country_product_slot_assignments.assignment_kind is
  'PRIMARY_DEFAULT wins before SAFE_FALLBACK. At most one active primary exists per country/slot.';
comment on column public.country_product_slot_assignments.fallback_priority is
  'Explicit administrator-authored fallback order; never price, recency, brand, or insertion order.';

create or replace function private.exact_product_has_picker_profile_v1(
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
    from public.products product
    join public.product_versions version
      on version.id = product.current_version_id
     and version.product_id = product.id
    join public.product_behavior_bindings binding
      on binding.id = product.current_behavior_binding_id
     and binding.product_id = product.id
     and binding.product_version_id = version.id
     and binding.is_current
    where product.id = p_product_id
      and product.product_kind <> 'mapper_reference'
      and product.is_active
      and product.merged_into_product_id is null
      and product.canonical_verification_status <> 'blocked'
      and binding.binding_status = 'ready'
      and binding.mapper_ingredient_id = btrim(p_mapper_ingredient_id)
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

revoke all on function private.exact_product_has_picker_profile_v1(text, uuid)
  from public, anon, authenticated, service_role;

-- Strengthen CP-36's active-pointer definition now that the final resolver seam
-- exists. A stored pointer without a current exact product-owned Engine profile
-- becomes inactive and the resolver continues to country/generic fallback.
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
    and private.exact_product_has_picker_profile_v1(
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
    and private.exact_product_has_picker_profile_v1(
      p_mapper_ingredient_id,
      p_product_id
    )
    and exists (
      select 1
      from public.products p
      join public.product_versions version
        on version.id = p.current_version_id
       and version.product_id = p.id
      join public.product_behavior_bindings binding
        on binding.id = p.current_behavior_binding_id
       and binding.product_id = p.id
       and binding.product_version_id = version.id
       and binding.is_current
      where p.id = p_product_id
        and p.product_kind <> 'mapper_reference'
        and p.visibility = 'shared'
        and p.is_active
        and p.merged_into_product_id is null
        and p.canonical_verification_status <> 'blocked'
        and binding.binding_status = 'ready'
        and binding.mapper_ingredient_id = btrim(p_mapper_ingredient_id)
        and exists (
          select 1
          from public.product_variants variant
          left join public.product_variant_markets variant_market
            on variant_market.variant_id = variant.id
          where variant.product_id = p.id
            and variant.is_current
            and upper(coalesce(variant_market.market, variant.market)) = upper(btrim(p_country_code))
        )
    )
$function$;

revoke all on function private.country_product_slot_assignment_is_usable_v1(text, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.validate_country_product_slot_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  new.country_code := upper(btrim(new.country_code));
  new.mapper_ingredient_id := btrim(new.mapper_ingredient_id);
  new.approval_reason := btrim(new.approval_reason);

  if new.active and not private.country_product_slot_assignment_is_usable_v1(
    new.country_code,
    new.mapper_ingredient_id,
    new.product_id
  ) then
    raise exception 'country_product_slot_assignment_mismatch' using errcode = '23514';
  end if;

  new.updated_at := statement_timestamp();
  if tg_op = 'UPDATE' and (
    new.country_code,
    new.mapper_ingredient_id,
    new.product_id,
    new.assignment_kind,
    new.fallback_priority,
    new.approval_reason,
    new.active
  ) is distinct from (
    old.country_code,
    old.mapper_ingredient_id,
    old.product_id,
    old.assignment_kind,
    old.fallback_priority,
    old.approval_reason,
    old.active
  ) then
    new.approved_by := auth.uid();
    new.approved_at := statement_timestamp();
  end if;
  return new;
end
$function$;

revoke all on function private.validate_country_product_slot_assignment_v1()
  from public, anon, authenticated, service_role;

create trigger country_product_slot_assignments_validate
before insert or update on public.country_product_slot_assignments
for each row execute function private.validate_country_product_slot_assignment_v1();

alter table public.country_product_slot_assignments enable row level security;

create policy country_product_slot_assignments_catalog_admin
  on public.country_product_slot_assignments
  for all to authenticated
  using ((select public.gellatti_admin_has_permission_v1('CATALOG')))
  with check ((select public.gellatti_admin_has_permission_v1('CATALOG')));

revoke all on table public.country_product_slot_assignments
  from public, anon, authenticated;
grant select, insert, update, delete on table public.country_product_slot_assignments
  to authenticated;
grant select, insert, update, delete on table public.country_product_slot_assignments
  to service_role;

-- Pure precedence kernel used by the live resolver and the database acceptance
-- matrix. Candidate validity is established before this function is called.
create or replace function private.choose_country_product_resolution_v1(
  p_user_preferred_product_id uuid,
  p_country_primary_product_id uuid,
  p_same_country_fallback_product_ids uuid[]
) returns table (
  product_id uuid,
  resolution_source text
)
language sql
immutable
set search_path = pg_catalog
as $function$
  with candidates as (
    select p_user_preferred_product_id as product_id,
      'USER_PREFERRED'::text as resolution_source,
      0 as authority_rank,
      0::bigint as fallback_rank
    where p_user_preferred_product_id is not null
    union all
    select p_country_primary_product_id,
      'COUNTRY_PRIMARY_DEFAULT'::text,
      1,
      0::bigint
    where p_country_primary_product_id is not null
    union all
    select fallback.product_id,
      'COUNTRY_SAFE_FALLBACK'::text,
      2,
      fallback.ordinality
    from unnest(coalesce(p_same_country_fallback_product_ids, '{}'::uuid[]))
      with ordinality fallback(product_id, ordinality)
    where fallback.product_id is not null
  )
  select candidates.product_id, candidates.resolution_source
  from candidates
  order by candidates.authority_rank, candidates.fallback_rank
  limit 1
$function$;

revoke all on function private.choose_country_product_resolution_v1(uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;

-- Return the exact product projection needed by the shared HOME/PRO picker.
-- Missing rows are intentional: the caller must retain the approved generic
-- Mapper ingredient instead of selecting a foreign or arbitrary product.
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
    binding.mapper_ingredient_id,
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
    on mapper.ingredient_id = binding.mapper_ingredient_id
  left join public.user_product_relations relation
    on relation.user_id = auth.uid()
   and relation.product_id = product.id
  where binding.binding_status = 'ready'
    and binding.mapper_ingredient_id = winner.mapper_ingredient_id
$function$;

revoke all on function public.resolve_country_product_slots_v1(text[], text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_country_product_slots_v1(text[], text, text)
  to anon, authenticated, service_role;

comment on function public.resolve_country_product_slots_v1(text[], text, text) is
  'Resolves user preferred exact SKU, then explicit country primary, then explicit same-country fallback. No row means approved generic Mapper fallback; foreign/arbitrary products are never selected.';

-- Guest country is local to the browser. This authenticated RPC owns the only
-- guest-to-account merge policy and returns a conflict instead of inventing a
-- winner when both sides contain different explicit choices.
create or replace function public.merge_guest_product_country_v1(
  p_guest_country text,
  p_guest_source text,
  p_conflict_choice text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_guest_country text := upper(btrim(coalesce(p_guest_country, '')));
  v_guest_source text := upper(btrim(coalesce(p_guest_source, '')));
  v_conflict_choice text := upper(btrim(coalesce(p_conflict_choice, '')));
  v_preference public.account_product_market_preferences%rowtype;
  v_previous_primary text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if v_guest_country !~ '^[A-Z]{2}$' or not exists (
    select 1 from public.catalog_market_countries country
    where country.code = v_guest_country and country.is_active
  ) then
    raise exception 'invalid_product_country' using errcode = '22023';
  end if;
  if v_guest_source not in ('DETECTED', 'EXPLICIT') then
    raise exception 'invalid_guest_country_source' using errcode = '22023';
  end if;
  if v_conflict_choice not in ('', 'ACCOUNT', 'GUEST') then
    raise exception 'invalid_guest_country_choice' using errcode = '22023';
  end if;

  insert into public.account_product_market_preferences(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select preference.* into v_preference
  from public.account_product_market_preferences preference
  where preference.user_id = v_user_id
  for update;

  if v_preference.primary_market is null then
    update public.account_product_market_preferences preference
    set primary_market = v_guest_country,
        additional_markets = array_remove(preference.additional_markets, v_guest_country),
        default_scope = case
          when preference.default_scope = 'global' then 'my_markets'
          else preference.default_scope
        end
    where preference.user_id = v_user_id
    returning * into v_preference;
    return jsonb_build_object(
      'mergeOutcome', 'GUEST_MERGED',
      'primaryMarket', v_preference.primary_market,
      'additionalMarkets', v_preference.additional_markets,
      'preferredRetailers', v_preference.preferred_retailers,
      'defaultScope', v_preference.default_scope
    );
  end if;

  if upper(v_preference.primary_market) = v_guest_country then
    return jsonb_build_object(
      'mergeOutcome', 'ALREADY_MATCHED',
      'primaryMarket', v_preference.primary_market,
      'additionalMarkets', v_preference.additional_markets,
      'preferredRetailers', v_preference.preferred_retailers,
      'defaultScope', v_preference.default_scope
    );
  end if;

  if v_guest_source = 'DETECTED' or v_conflict_choice = 'ACCOUNT' then
    return jsonb_build_object(
      'mergeOutcome', 'ACCOUNT_KEPT',
      'primaryMarket', v_preference.primary_market,
      'additionalMarkets', v_preference.additional_markets,
      'preferredRetailers', v_preference.preferred_retailers,
      'defaultScope', v_preference.default_scope
    );
  end if;

  if v_conflict_choice = '' then
    return jsonb_build_object(
      'mergeOutcome', 'EXPLICIT_CONFLICT',
      'primaryMarket', v_preference.primary_market,
      'additionalMarkets', v_preference.additional_markets,
      'preferredRetailers', v_preference.preferred_retailers,
      'defaultScope', v_preference.default_scope,
      'guestCountry', v_guest_country
    );
  end if;

  v_previous_primary := upper(v_preference.primary_market);
  update public.account_product_market_preferences preference
  set primary_market = v_guest_country,
      additional_markets = array(
        select distinct country_code
        from unnest(preference.additional_markets || array[v_previous_primary]) country_code
        where country_code <> v_guest_country
        order by country_code
      ),
      default_scope = case
        when preference.default_scope = 'global' then 'my_markets'
        else preference.default_scope
      end
  where preference.user_id = v_user_id
  returning * into v_preference;

  return jsonb_build_object(
    'mergeOutcome', 'GUEST_CHOSEN',
    'primaryMarket', v_preference.primary_market,
    'additionalMarkets', v_preference.additional_markets,
    'preferredRetailers', v_preference.preferred_retailers,
    'defaultScope', v_preference.default_scope
  );
end
$function$;

revoke all on function public.merge_guest_product_country_v1(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_guest_product_country_v1(text, text, text)
  to authenticated, service_role;

comment on function public.merge_guest_product_country_v1(text, text, text) is
  'Atomically merges a browser-local Product Country into the signed-in preference. Different explicit values produce EXPLICIT_CONFLICT until the user chooses.';
