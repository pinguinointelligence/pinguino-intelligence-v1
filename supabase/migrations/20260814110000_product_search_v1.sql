-- P0 served-search recovery. One authenticated search authority for canonical
-- Mapper references and commercial products. Mapper science remains read-only.

create extension if not exists pg_trgm with schema extensions;

-- Selection is a separate trust boundary from search. The legacy authenticated
-- view exposed PAC/POD but omitted most composition columns; casting that partial
-- row to IngredientRow silently turned every omitted scientific fact into zero at
-- the Engine seam. Keep the existing column order and append the complete
-- non-administrative technical projection needed by EngineIngredient.
create or replace view public.mapper_basement_search
with (security_invoker = false) as
select
  ingredient_id,
  ingredient_name_display,
  ingredient_name_internal,
  ingredient_category,
  ingredient_subcategory,
  ean_code,
  pac_value,
  pod_value,
  total_solids_percent,
  total_sugars_percent,
  fat_percent,
  non_fat_milk_solids_percent,
  protein_percent,
  alcohol_percent,
  sweetness_factor,
  freezing_factor,
  recommended_dosage_percent_min,
  recommended_dosage_percent_max,
  allergens,
  vegan,
  dairy_free,
  gluten_free,
  contains_alcohol,
  data_confidence_percent,
  verification_status,
  dataset_version,
  approved_for_base,
  approved_for_engines,
  water_percent,
  saturated_fat_percent,
  milk_fat_percent,
  aerating_protein_percent,
  carbohydrate_percent,
  sucrose_percent,
  dextrose_percent,
  glucose_percent,
  fructose_percent,
  lactose_percent,
  polyol_percent,
  fiber_percent,
  salt_percent,
  ash_percent,
  acidity_percent,
  brix,
  dry_matter_percent,
  de_value,
  stabilizer_activity,
  kcal_per_100g,
  cost_per_kg,
  currency
from public.mapper_basement
where is_active and approved_for_base;
revoke all on public.mapper_basement_search from public,anon;
grant select on public.mapper_basement_search to authenticated;

-- Mapper aliases are governed catalogue data, not a frontend synonym table.
-- Seed the accepted multilingual family vocabulary against the canonical
-- mapper_reference products without changing mapper_basement itself.
select set_config('app.canonical_product_ingest','v1',true);
with alias_registry(mapper_ingredient_id,language,alias) as (values
  ('PI-ING-001553','pl','truskawka'),
  ('PI-ING-001553','pl','truskawki'),
  ('PI-ING-001553','en','strawberry'),
  ('PI-ING-001553','es','fresa'),
  ('PI-ING-001553','de','Erdbeere'),
  ('PI-ING-001553','it','fragola')
)
insert into public.product_aliases(product_id,alias,normalized_alias,language,kind)
select p.id,a.alias,
  trim(regexp_replace(extensions.unaccent(lower(a.alias)),'[^a-z0-9]+',' ','g')),
  a.language,'synonym'
from public.products p
join alias_registry a on p.normalized_identity='mapper:'||a.mapper_ingredient_id
where p.product_kind='mapper_reference' and p.is_active and p.merged_into_product_id is null
on conflict(product_id,normalized_alias,language) do nothing;

-- Repair the case-sensitive 10300 import classification from the exact live
-- Mapper trust vocabulary. This changes only canonical lifecycle metadata;
-- the immutable Mapper facts and mapper_basement remain untouched.
update public.products p
set canonical_verification_status=case
      when lower(coalesce(m.verification_status,'')) like 'verified%' then 'verified'
      else 'manual_unverified' end,
    canonical_verification_method=case
      when lower(coalesce(m.verification_status,'')) like 'verified%' then 'human'
      else 'manual_unverified' end,
    status=case
      when lower(coalesce(m.verification_status,'')) like 'verified%' then 'pi_verified'
      else 'manual_adjusted' end,
    updated_at=now()
from public.mapper_basement m
where p.product_kind='mapper_reference'
  and p.normalized_identity='mapper:'||m.ingredient_id
  and p.is_active and p.merged_into_product_id is null
  and (
    p.canonical_verification_status is distinct from case
      when lower(coalesce(m.verification_status,'')) like 'verified%' then 'verified'
      else 'manual_unverified' end
    or p.canonical_verification_method is distinct from case
      when lower(coalesce(m.verification_status,'')) like 'verified%' then 'human'
      else 'manual_unverified' end
  );

-- Keep the indexed canonical document aligned with governed aliases. Search
-- may still calculate a richer ranking projection, but candidate discovery is
-- backed by these indexes instead of a full 2,088-row concatenation scan.
update public.products p
set search_document=trim(concat_ws(' ',p.search_document,(
      select string_agg(a.normalized_alias,' ' order by a.normalized_alias)
      from public.product_aliases a where a.product_id=p.id
    ))),updated_at=now()
where p.is_active and exists(select 1 from public.product_aliases a where a.product_id=p.id);
select set_config('app.canonical_product_ingest','',true);

create index if not exists product_aliases_normalized_trgm_idx
  on public.product_aliases using gin(normalized_alias extensions.gin_trgm_ops);
create index if not exists products_search_document_trgm_idx
  on public.products using gin(search_document extensions.gin_trgm_ops);

drop function if exists public.search_products_v1(text,text,text,text[],boolean,text,integer,integer);
drop function if exists public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer);
create or replace function public.search_products_v1(
  p_query text default '',
  p_context text default 'BASE',
  p_market_scope text default 'my_markets_and_global',
  p_selected_markets text[] default '{}',
  p_favorites_only boolean default false,
  p_product_profile text default null,
  p_entity_kind text default null,
  p_limit integer default 100,
  p_cursor integer default 0
) returns table(
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
) language sql stable security definer
set search_path=public,extensions
as $$
  with input as (
    select
      trim(regexp_replace(extensions.unaccent(lower(coalesce(p_query,''))),'[^a-z0-9]+',' ','g')) q,
      upper(coalesce(p_context,'BASE')) context,
      lower(coalesce(p_market_scope,'my_markets_and_global')) market_scope
  ), expanded as (
    select i.*,array(
      select distinct term from (
        select i.q term
        union all
        select a.normalized_alias from public.product_aliases a
        where i.q<>'' and (
          (a.normalized_alias % i.q and extensions.similarity(a.normalized_alias,i.q)>=0.45)
          or a.normalized_alias like i.q||'%'
          or i.q like a.normalized_alias||'%'
        )
      ) candidate_terms
      where term<>''
    )::text[] terms
    from input i
  ), mapper_candidates as (
    select
      p.id,p.current_version_id,'pi_base'::text entity_kind,'pi_base'::text status,
      'pi_base'::text verification_method,'mapper'::text provenance,
      coalesce(nullif(m.ingredient_name_display,''),m.ingredient_name_internal) display_name,
      nullif(m.ingredient_name_internal,'') original_name,null::text original_language,m.brand,
      coalesce(b.family_id,p.canonical_family) canonical_family,m.ingredient_category category,
      coalesce(b.form_id,m.ingredient_subcategory) product_form,m.ingredient_id mapped_ingredient_id,
      '{}'::text[] markets,'{}'::text[] retailers,
      array_remove(array[m.ean_code],null)::text[] eans,
      array_remove(array[
        m.ingredient_name_display,m.ingredient_name_internal,m.ingredient_category,
        m.ingredient_subcategory,b.family_id,b.subfamily_id,b.form_id
      ]||coalesce((select array_agg(a.alias) from public.product_aliases a
        where a.product_id=p.id),'{}'::text[]),null)::text[] aliases,
      (f.id is not null) favorite,ru.last_used_at recently_used_at,
      (m.is_active and m.approved_for_base and m.approved_for_engines
        and lower(coalesce(m.verification_status,'')) like 'verified%') usable_in_base,
      (b.behavior_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
        and b.main_policy_status='COVERED'
        and (p_product_profile is null or b.profile_applicability ? p_product_profile)) main_allowed,
      (m.is_active and m.approved_for_base and m.approved_for_engines
        and lower(coalesce(m.verification_status,'')) like 'verified%') usable_as_topping,
      case
        when e.context='BASE' and not (m.approved_for_base and m.approved_for_engines)
          then 'Brak zatwierdzenia PINGÜINO Base'
        when e.context='BASE' and lower(coalesce(m.verification_status,'')) not like 'verified%'
          then 'Wymaga weryfikacji Mapper'
        when e.context='TOPPING' and not (m.approved_for_base and m.approved_for_engines
          and lower(coalesce(m.verification_status,'')) like 'verified%')
          then 'Niedostępny jako topping'
        else null
      end blocked_reason,
      '{}'::text[] missing_fields,'{}'::text[] invalid_fields,
      '{}'::jsonb public_data,r.private_price,r.currency private_currency,
      (
        case when e.q='' then 1
          when exists(select 1 from unnest(e.terms) t where
            trim(regexp_replace(extensions.unaccent(lower(coalesce(m.ingredient_name_display,''))),'[^a-z0-9]+',' ','g'))=t)
            then 140
          when exists(select 1 from unnest(e.terms) t where
            concat_ws(' ',m.ingredient_name_display,m.ingredient_name_internal,m.ingredient_category,
              m.ingredient_subcategory,m.ingredient_id) ilike '%'||t||'%') then 100
          else 60 * extensions.similarity(
            trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',m.ingredient_name_display,
              m.ingredient_name_internal,m.ingredient_category,m.ingredient_subcategory))),'[^a-z0-9]+',' ','g')),
            e.q)
        end
        + case when e.context='BASE' then 25 else 8 end
        + case when lower(coalesce(b.form_id,m.ingredient_subcategory,'')) in ('fresh','fresh_fruit','puree','frozen') then 24 else 0 end
        + case when lower(coalesce(m.verification_status,'')) like 'verified%' then 8 else -12 end
        + case when f.id is not null then 8 else 0 end
      )::numeric relevance,
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',m.ingredient_name_display,
        m.ingredient_name_internal,m.ingredient_category,m.ingredient_subcategory,m.ingredient_id,
        b.family_id,b.subfamily_id,b.form_id,array_to_string(array(select a.alias
          from public.product_aliases a where a.product_id=p.id),' ')))),'[^a-z0-9]+',' ','g')) search_text,
      p.search_document indexed_search_text
    from expanded e
    join public.mapper_basement m on m.is_active
    join public.products p on p.product_kind='mapper_reference'
      and p.normalized_identity='mapper:'||m.ingredient_id
      and p.is_active and p.merged_into_product_id is null
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.global_catalog_favorites f on f.user_id=auth.uid()
      and f.entity_kind='pi_base' and f.mapper_ingredient_id=m.ingredient_id
    left join public.global_catalog_recent_usage ru on ru.user_id=auth.uid()
      and ru.entity_kind='pi_base' and ru.mapper_ingredient_id=m.ingredient_id
    left join public.user_product_relations r on r.user_id=auth.uid() and r.product_id=p.id
  ), commercial_base as (
    select
      p.id,p.current_version_id,'commercial_product'::text entity_kind,
      p.canonical_verification_status status,p.canonical_verification_method verification_method,
      p.canonical_provenance provenance,
      p.product_name_display display_name,p.product_name_internal original_name,
      v.facts->>'originalLanguage' original_language,p.brand,p.canonical_family,
      p.product_category category,coalesce(b.form_id,v.facts#>>'{public_data,formId}') product_form,
      b.mapper_ingredient_id mapped_ingredient_id,
      array(select distinct x from unnest(array_remove(array[
        v.facts->>'market',v.facts#>>'{public_data,market}'
      ]||coalesce((select array_agg(coalesce(vm.market,pv.market)) from public.product_variants pv
        left join public.product_variant_markets vm on vm.variant_id=pv.id
        where pv.product_id=p.id and pv.is_current),'{}'::text[]),null)) x) markets,
      array(select distinct x from unnest(array_remove(array[
        v.facts->>'retailer',v.facts#>>'{public_data,retailer}'
      ]||coalesce((select array_agg(o.retailer) from public.product_variants pv
        join public.product_retailer_offers o on o.variant_id=pv.id
        where pv.product_id=p.id and pv.is_current),'{}'::text[]),null)) x) retailers,
      array(select distinct x from unnest(array_remove(array[p.ean_code_normalized]
        ||coalesce((select array_agg(pv.ean) from public.product_variants pv
          where pv.product_id=p.id and pv.is_current),'{}'::text[]),null)) x) eans,
      array(select distinct x from unnest(array_remove(array[
        p.product_name_display,p.product_name_internal,p.brand,p.canonical_family,p.product_category,
        b.family_id,b.subfamily_id,b.form_id
      ]||coalesce((select array_agg(a.alias) from public.product_aliases a
        where a.product_id=p.id),'{}'::text[]),null)) x) aliases,
      coalesce(r.favorite,false) favorite,r.recently_used_at,
      (p.canonical_verification_status<>'blocked' and m.ingredient_id is not null
        and m.is_active and m.approved_for_base and m.approved_for_engines
        and lower(coalesce(m.verification_status,'')) like 'verified%') usable_in_base,
      (b.behavior_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
        and b.main_policy_status='COVERED'
        and (p_product_profile is null or b.profile_applicability ? p_product_profile)) main_allowed,
      (p.canonical_verification_status<>'blocked'
        and coalesce((b.profile_permissions->>'TOPPING')::boolean,false)) usable_as_topping,
      coalesce((select array_agg(x.value) from jsonb_array_elements_text(
        coalesce(v.facts->'missingFields','[]'::jsonb)) x(value)),'{}') missing_fields,
      coalesce((select array_agg(x.value) from jsonb_array_elements_text(
        coalesce(v.facts->'invalidFields','[]'::jsonb)) x(value)),'{}') invalid_fields,
      coalesce(v.facts->'public_data',v.facts) public_data,r.private_price,r.currency private_currency,
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',p.product_name_display,
        p.product_name_internal,p.brand,p.canonical_family,p.product_category,b.family_id,b.subfamily_id,
        b.form_id,array_to_string(array(select a.alias from public.product_aliases a where a.product_id=p.id),' ')))),'[^a-z0-9]+',' ','g')) search_text,
      p.search_document indexed_search_text
    from public.products p
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    left join public.user_product_relations r on r.user_id=auth.uid() and r.product_id=p.id
    where p.product_kind<>'mapper_reference' and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
        or exists(select 1 from public.product_ingest_events ev
          where ev.product_id=p.id and ev.actor_user_id=auth.uid()))
  ), commercial_candidates as (
    select
      c.id,c.current_version_id,c.entity_kind,c.status,c.verification_method,c.provenance,
      c.display_name,c.original_name,c.original_language,c.brand,c.canonical_family,c.category,
      c.product_form,c.mapped_ingredient_id,c.markets,c.retailers,c.eans,c.aliases,c.favorite,
      c.recently_used_at,c.usable_in_base,c.main_allowed,c.usable_as_topping,
      case
        when e.context='BASE' and not c.usable_in_base then 'Brak aktualnego mapowania PINGÜINO Base'
        when e.context='TOPPING' and not c.usable_as_topping then 'Brak kompletnych danych Topping'
        else null
      end blocked_reason,
      c.missing_fields,c.invalid_fields,c.public_data,c.private_price,c.private_currency,
      (
        case when e.q='' then 1
          when exists(select 1 from unnest(e.terms) t where c.search_text=t) then 135
          when exists(select 1 from unnest(e.terms) t where c.search_text like '%'||t||'%') then 95
          else 60*extensions.similarity(c.search_text,e.q)
        end
        + case when c.favorite then 8 else 0 end
        + case when c.status='verified' then 4 else 0 end
        + case when cardinality(p_selected_markets)>0 and c.markets&&p_selected_markets then 6 else 0 end
        + case when c.retailers&&coalesce((select pref.preferred_retailers
            from public.account_product_market_preferences pref
            where pref.user_id=auth.uid()),'{}'::text[]) then 3 else 0 end
      )::numeric relevance,
      c.search_text,c.indexed_search_text
    from commercial_base c cross join expanded e
    where e.market_scope='global'
      or (e.market_scope='my_markets_and_global' and (
        cardinality(p_selected_markets)=0 or cardinality(c.markets)=0
        or c.markets&&p_selected_markets or c.markets&&array['GLOBAL']::text[]
      ))
      or (e.market_scope in ('my_markets','strict_market')
        and cardinality(p_selected_markets)>0 and c.markets&&p_selected_markets)
  ), candidates as (
    select * from mapper_candidates
    union all
    select * from commercial_candidates
  )
  select c.id,c.current_version_id,c.entity_kind,c.status,c.verification_method,c.provenance,
    c.display_name,c.original_name,c.original_language,c.brand,c.canonical_family,c.category,
    c.product_form,c.mapped_ingredient_id,c.markets,c.retailers,c.eans,c.aliases,c.favorite,
    c.recently_used_at,c.usable_in_base,c.main_allowed,c.usable_as_topping,c.blocked_reason,
    c.missing_fields,c.invalid_fields,c.public_data,c.private_price,c.private_currency,c.relevance
  from candidates c cross join expanded e
  where auth.uid() is not null
    and e.context in ('BASE','TOPPING')
    and e.market_scope in ('my_markets','my_markets_and_global','global','strict_market')
    and (p_entity_kind is null or c.entity_kind=p_entity_kind)
    and (not p_favorites_only or c.favorite)
    and (e.q='' or exists(select 1 from unnest(e.terms) t where
        c.indexed_search_text ilike '%'||t||'%'
        or to_tsvector('simple',c.indexed_search_text) @@
          to_tsquery('simple',regexp_replace(t,' +',':* & ','g')||':*'))
      or exists(select 1 from unnest(e.terms) t where c.search_text like '%'||t||'%')
      or extensions.similarity(c.search_text,e.q)>=0.28
      or exists(select 1 from unnest(c.eans) x where x=regexp_replace(p_query,'\D','','g')))
  order by c.relevance desc,c.favorite desc,c.recently_used_at desc nulls last,
    c.entity_kind='pi_base' desc,c.display_name,c.id
  offset greatest(coalesce(p_cursor,0),0)
  limit least(greatest(coalesce(p_limit,100),1),500);
$$;

revoke all on function public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer)
  from public,anon;
grant execute on function public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer)
  to authenticated;

-- Legacy saved recipes can carry any one of the historical stable references.
-- Resolve those references server-side to the same immutable version authority;
-- never guess from translated display text in the browser.
drop function if exists public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb);
create or replace function public.resolve_legacy_recipe_behavior_v1(
  p_reference jsonb,
  p_context jsonb
) returns jsonb
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare
  v_kind text;
  v_entity_id text;
  v_uuid uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  if coalesce(p_reference->>'behaviorBindingId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := (p_reference->>'behaviorBindingId')::uuid;
    select b.product_version_id::text into v_entity_id
    from public.product_behavior_bindings b
    join public.products p on p.id=b.product_id
    where b.id=v_uuid and b.is_current and p.current_behavior_binding_id=b.id
      and p.current_version_id=b.product_version_id
      and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid())
    limit 1;
    if v_entity_id is not null then v_kind := 'catalog_product_version'; end if;
  end if;
  if v_entity_id is null
    and coalesce(p_reference->>'productVersionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := (p_reference->>'productVersionId')::uuid;
    select v.id::text into v_entity_id
    from public.product_versions v
    join public.products p on p.id=v.product_id and p.current_version_id=v.id
    where v.id=v_uuid and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid())
    limit 1;
    if v_entity_id is not null then v_kind := 'catalog_product_version'; end if;
  end if;
  if v_entity_id is null
    and coalesce(p_reference->>'productId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := (p_reference->>'productId')::uuid;
    select p.current_version_id::text into v_entity_id
    from public.products p
    where p.id=v_uuid and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid())
    limit 1;
    if v_entity_id is not null then v_kind := 'catalog_product_version'; end if;
  end if;
  if v_entity_id is null and coalesce(p_reference->>'mapperIngredientId','') like 'PI-ING-%' then
    v_entity_id := p_reference->>'mapperIngredientId';
    v_kind := 'mapper';
  end if;
  if v_entity_id is null and coalesce(p_reference->>'canonicalIdentity','') like 'PI-ING-%' then
    v_entity_id := p_reference->>'canonicalIdentity';
    v_kind := 'mapper';
  end if;
  if v_entity_id is null and nullif(p_reference->>'normalizedIdentity','') is not null then
    select p.current_version_id::text into v_entity_id
    from public.products p
    where p.normalized_identity=p_reference->>'normalizedIdentity'
      and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid())
    order by p.created_at,p.id limit 1;
    if v_entity_id is not null then v_kind := 'catalog_product_version'; end if;
  end if;

  if v_kind is null or v_entity_id is null then
    return jsonb_build_object(
      'schemaVersion',1,'state','blocked','module',coalesce(p_context->>'module','SEARCH'),
      'blockReasons',jsonb_build_array('legacy_product_reference_unresolved')
    );
  end if;
  return public.resolve_product_behavior_v1(v_kind,v_entity_id,p_context);
end;
$$;
revoke all on function public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb) from public,anon;
grant execute on function public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb) to authenticated;

-- Safe, account-aware duplicate preview used immediately after local label analysis.
-- It exposes only the concise candidate facts shown by the customer UI. The ingest
-- transaction remains the final authority and repeats duplicate checks under lock.
drop function if exists public.preview_product_duplicates_v1(jsonb);
create or replace function public.preview_product_duplicates_v1(p_facts jsonb)
returns table(
  product_id uuid,
  strength text,
  score numeric,
  reasons text[],
  display_name text,
  brand text,
  net_quantity text,
  market text,
  ean text
) language sql stable security definer
set search_path=public,extensions
as $$
  with incoming as (
    select
      nullif(regexp_replace(coalesce(p_facts->>'ean',''),'\D','','g'),'') ean,
      nullif(trim(p_facts->>'displayName'),'') display_name,
      nullif(trim(p_facts->>'brand'),'') brand,
      nullif(trim(p_facts->>'packageSize'),'') package_size,
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',
        p_facts->>'displayName',p_facts->>'brand',p_facts->>'packageSize'
      ))),'[^a-z0-9]+',' ','g')) identity_text,
      encode(extensions.digest(convert_to(concat_ws('|',
        lower(coalesce(p_facts->>'ingredientsText','')),
        coalesce(p_facts->'nutrition','null'::jsonb)::text
      ),'utf8'),'sha256'),'hex') facts_fingerprint,
      coalesce(array(
        select lower(value)
        from jsonb_array_elements_text(case
          when jsonb_typeof(p_facts->'imagePhashes')='array' then p_facts->'imagePhashes'
          else '[]'::jsonb
        end) hashes(value)
        where value ~* '^[0-9a-f]{16}$'
      ),'{}'::text[]) image_phashes
  ), candidates as (
    select p.id,p.product_name_display,p.brand,
      coalesce(v.facts#>>'{public_data,packageSize}',v.facts->>'packageSize') net_quantity,
      coalesce(v.facts->>'market',v.facts#>>'{public_data,market}') market,
      p.ean_code_normalized ean,
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',
        p.product_name_display,p.brand,
        coalesce(v.facts#>>'{public_data,packageSize}',v.facts->>'packageSize')
      ))),'[^a-z0-9]+',' ','g')) identity_text,
      encode(extensions.digest(convert_to(concat_ws('|',
        lower(coalesce(v.facts->>'ingredientsText',v.facts#>>'{public_data,ingredientsText}','')),
        coalesce(v.facts->'nutrition',v.facts#>'{public_data,nutrition}','null'::jsonb)::text
      ),'utf8'),'sha256'),'hex') facts_fingerprint,
      coalesce(array(
        select lower(stored.hash)
        from public.product_variants pv
        cross join lateral unnest(pv.image_phashes) stored(hash)
        where pv.product_id=p.id and pv.is_current
          and stored.hash ~* '^[0-9a-f]{16}$'
      ),'{}'::text[]) image_phashes
    from public.products p
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    where p.product_kind<>'mapper_reference' and p.is_active and p.merged_into_product_id is null
      and ((p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
        or exists(select 1 from public.product_ingest_events ev
          where ev.product_id=p.id and ev.actor_user_id=auth.uid()))
  ), scored as (
    select c.*,
      case
        when i.ean is not null and c.ean=i.ean then 'exact'
        when i.display_name is not null and c.identity_text=i.identity_text then 'exact'
        when coalesce(p_facts->>'ingredientsText','')<>'' and c.facts_fingerprint=i.facts_fingerprint then 'likely'
        when exists(select 1 from unnest(i.image_phashes) incoming(hash)
          cross join lateral unnest(c.image_phashes) stored(hash)
          where public.global_catalog_phash_distance(incoming.hash,stored.hash)<=4) then 'likely'
        when i.display_name is not null and extensions.similarity(c.identity_text,i.identity_text)>=0.5 then 'likely'
        else 'none'
      end strength,
      greatest(
        case when i.ean is not null and c.ean=i.ean then 1 else 0 end,
        case when i.display_name is not null and c.identity_text=i.identity_text then 0.98 else 0 end,
        case when coalesce(p_facts->>'ingredientsText','')<>'' and c.facts_fingerprint=i.facts_fingerprint then 0.9 else 0 end,
        coalesce((select greatest(0,0.96-min(public.global_catalog_phash_distance(incoming.hash,stored.hash))::numeric*0.02)
          from unnest(i.image_phashes) incoming(hash)
          cross join lateral unnest(c.image_phashes) stored(hash)),0),
        extensions.similarity(c.identity_text,i.identity_text)
      )::numeric score,
      array_remove(array[
        case when i.ean is not null and c.ean=i.ean then 'ean' end,
        case when i.display_name is not null and c.identity_text=i.identity_text then 'normalized_identity' end,
        case when coalesce(p_facts->>'ingredientsText','')<>'' and c.facts_fingerprint=i.facts_fingerprint then 'label_facts' end,
        case when exists(select 1 from unnest(i.image_phashes) incoming(hash)
          cross join lateral unnest(c.image_phashes) stored(hash)
          where public.global_catalog_phash_distance(incoming.hash,stored.hash)<=4)
          then 'package_image_near_exact' end,
        case when extensions.similarity(c.identity_text,i.identity_text)>=0.5 then 'similar_name_brand_package' end
      ],null)::text[] reasons
    from candidates c cross join incoming i
  )
  select s.id,s.strength,s.score,s.reasons,s.product_name_display,s.brand,
    s.net_quantity,s.market,s.ean
  from scored s
  where auth.uid() is not null and s.strength<>'none'
  order by s.score desc,s.id
  limit 8;
$$;

revoke all on function public.preview_product_duplicates_v1(jsonb) from public,anon;
grant execute on function public.preview_product_duplicates_v1(jsonb) to authenticated;

-- The concise preview and final ingest must use the same server-side likely
-- predicate. This helper is intentionally not client-callable; ingest invokes
-- it only after locking and reloading the selected accessible candidate.
create or replace function public.product_duplicate_candidate_matches_v1(
  p_product_id uuid,
  p_input jsonb
) returns boolean
language sql stable security definer
set search_path=public,extensions
as $$
  with incoming as (
    select
      nullif(trim(coalesce(p_input->>'displayName',p_input->>'originalName','')),'') display_name,
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',
        coalesce(p_input->>'displayName',p_input->>'originalName'),p_input->>'brand',
        coalesce(p_input->>'packageSize',p_input#>>'{facts,packageSize}')
      ))),'[^a-z0-9]+',' ','g')) identity_text,
      coalesce(p_input#>>'{facts,ingredientsText}',p_input->>'ingredientsText','') ingredients_text,
      encode(extensions.digest(convert_to(concat_ws('|',
        lower(coalesce(p_input#>>'{facts,ingredientsText}',p_input->>'ingredientsText','')),
        coalesce(p_input#>'{facts,nutrition}',p_input->'nutrition','null'::jsonb)::text
      ),'utf8'),'sha256'),'hex') facts_fingerprint
  ), candidate as (
    select
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(' ',
        p.product_name_display,p.brand,coalesce(v.facts->>'packageSize',v.facts#>>'{public_data,packageSize}')
      ))),'[^a-z0-9]+',' ','g')) identity_text,
      encode(extensions.digest(convert_to(concat_ws('|',
        lower(coalesce(v.facts->>'ingredientsText',v.facts#>>'{public_data,ingredientsText}','')),
        coalesce(v.facts->'nutrition',v.facts#>'{public_data,nutrition}','null'::jsonb)::text
      ),'utf8'),'sha256'),'hex') facts_fingerprint
    from public.products p
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
  )
  select exists(
    select 1 from incoming i cross join candidate c
    where (i.ingredients_text<>'' and c.facts_fingerprint=i.facts_fingerprint)
      or (i.display_name is not null and extensions.similarity(c.identity_text,i.identity_text)>=0.5)
  );
$$;
revoke all on function public.product_duplicate_candidate_matches_v1(uuid,jsonb)
  from public,anon,authenticated;

-- 10300 is already present in linked staging. Patch its final duplicate guard
-- in place rather than replaying or editing applied history. The replacement is
-- assertion-guarded so a drifted function aborts the migration transaction.
do $migration$
declare
  v_definition text;
  v_patched text;
  v_old text:=E'  if v_duplicate_decision=\'same\' and v_duplicate_product_id is not null and not v_same_from_candidate and not (\n    (v_ean is not null and v_existing.ean_code_normalized=v_ean)\n    or v_existing.normalized_identity=v_identity\n  ) then';
  v_new text:=E'  if v_duplicate_decision=\'same\' and v_duplicate_product_id is not null and not v_same_from_candidate and not (\n    (v_ean is not null and v_existing.ean_code_normalized=v_ean)\n    or v_existing.normalized_identity=v_identity\n    or public.product_duplicate_candidate_matches_v1(v_existing.id,p_input)\n    or exists(\n      select 1 from public.product_variants pv\n      cross join lateral unnest(pv.image_phashes) stored(hash)\n      cross join lateral unnest(v_image_phashes) incoming(hash)\n      where pv.product_id=v_existing.id and pv.is_current\n        and public.global_catalog_phash_distance(incoming.hash,stored.hash)<=4\n    )\n  ) then';
  v_languages_old text:=E'    \'market\',p_input->>\'market\',\'retailer\',p_input->>\'retailer\',\'packageLanguage\',p_input->>\'packageLanguage\'\n  ));';
  v_languages_new text:=E'    \'market\',p_input->>\'market\',\'retailer\',p_input->>\'retailer\',\'packageLanguage\',p_input->>\'packageLanguage\',\n    \'labelLanguages\',case when jsonb_typeof(p_input#>\'{facts,labelLanguages}\')=\'array\'\n      then p_input#>\'{facts,labelLanguages}\' else null end\n  ));';
  v_favorite_old text:=E'      else (select canonical_verification_status<>\'blocked\' from public.products where id=v_product_id) end,';
  v_favorite_new text:=E'      else (p_source=\'ocr\' or (select canonical_verification_status<>\'blocked\' from public.products where id=v_product_id)) end,';
begin
  v_definition:=pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  if strpos(v_definition,v_old)=0 then
    raise exception 'ingest_product_v1 duplicate guard drifted; refusing unsafe patch';
  end if;
  if strpos(v_definition,v_languages_old)=0 then
    raise exception 'ingest_product_v1 facts allowlist drifted; refusing unsafe patch';
  end if;
  if strpos(v_definition,v_favorite_old)=0 then
    raise exception 'ingest_product_v1 favorite projection drifted; refusing unsafe patch';
  end if;
  v_patched:=replace(v_definition,v_old,v_new);
  v_patched:=replace(v_patched,v_languages_old,v_languages_new);
  v_patched:=replace(v_patched,v_favorite_old,v_favorite_new);
  execute v_patched;
end;
$migration$;

-- Fix the legacy PI Base private relation policies. The dataset stores
-- title-cased statuses (`Verified`, `Verified / PI Calculated`), never the
-- lowercase literal used by the retired search path.
drop policy if exists global_catalog_favorites_pi_base_own on public.global_catalog_favorites;
create policy global_catalog_favorites_pi_base_own on public.global_catalog_favorites
for all to authenticated
using(user_id=auth.uid() and entity_kind='pi_base')
with check(user_id=auth.uid() and entity_kind='pi_base' and catalog_product_id is null
  and mapper_ingredient_id is not null and exists(
    select 1 from public.mapper_basement m
    where m.ingredient_id=mapper_ingredient_id and m.is_active
  ));

drop policy if exists global_catalog_recent_pi_base_own on public.global_catalog_recent_usage;
create policy global_catalog_recent_pi_base_own on public.global_catalog_recent_usage
for all to authenticated
using(user_id=auth.uid() and entity_kind='pi_base')
with check(user_id=auth.uid() and entity_kind='pi_base' and catalog_product_id is null
  and mapper_ingredient_id is not null and exists(
    select 1 from public.mapper_basement m
    where m.ingredient_id=mapper_ingredient_id and m.is_active
  ));

comment on function public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer)
is 'One authenticated PINGÜINO search authority: all active Mapper references plus RLS-allowed commercial products; private favorites/prices projected only for auth.uid().';

comment on function public.preview_product_duplicates_v1(jsonb)
is 'Concise authenticated duplicate preview after analysis; ingest_product_v1 remains the locked final authority.';
