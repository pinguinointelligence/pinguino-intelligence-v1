-- Search relevance: a result must actually match the query.
--
-- Three defects, all visible on one served search for „inulina": the picker
-- reported 500 ingredients and led with BANANA, STRAWBERRIES, WATERMELON and
-- BASIL, while the four real INULIN rows never appeared.
--
-- 1. NO STEM. Matching was raw substring, so „inulina" could not reach a row
--    named INULIN — the Polish ending is one character the catalogue does not
--    carry. The client has stemmed for exactly this since day one; the server
--    never did, so the server path silently answered nothing.
--
-- 2. FUZZY TOO LOOSE. `similarity(search_text, q) >= 0.28` ran against the whole
--    concatenated document — name, category, subcategory, ids, family, aliases.
--    Over text that long a 0.28 trigram score means "shares a few letters", not
--    "is about this", so unrelated rows entered the result set.
--
-- 3. RANK WITHOUT MATCH. Relevance adds +25 for BASE context, +24 for a
--    fresh/fruit/puree form and +8 for verified, none of which depend on the
--    query. A fresh fruit that matched nothing therefore scored 57 and outranked
--    a genuine hit. Those bonuses are only sound as tie-breakers among rows that
--    already matched, which is what the corrected filter now guarantees.
--
-- Favourites that MATCH now lead, then relevance — an unrelated favourite is
-- still not a result.

create or replace function public.gellatti_search_root(p_token text)
returns text language sql immutable
set search_path = pg_catalog, public as $fn$
  -- Mirrors the client's `stem`: strip one inflectional ending, longest first,
  -- and never shorten below four characters (so „soja" stays „soja").
  select coalesce((
    select left(t.tok, length(t.tok) - length(s.suf))
    from (select lower(coalesce(p_token,'')) tok) t
    cross join lateral (
      select suf from unnest(array['owych','owym','owej','owe','owy','owa','ami','ach',
        'om','ow','ie','y','i','a','e']) suf
      where t.tok like '%'||suf and length(t.tok) - length(suf) >= 4
      order by length(suf) desc limit 1
    ) s
  ), lower(coalesce(p_token,'')));
$fn$;

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
        -- An inflected Polish query must reach the catalogue's stem: the rows say
        -- INULIN, the baker types „inulina". Substring matching alone never
        -- bridges that, and the client already stems exactly this way.
        select public.gellatti_search_root(i.q)
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
      or extensions.similarity(c.search_text,e.q)>=0.55
      or exists(select 1 from unnest(c.eans) x where x=regexp_replace(p_query,'\D','','g')))
  order by c.favorite desc,c.relevance desc,c.recently_used_at desc nulls last,
    c.entity_kind='pi_base' desc,c.display_name,c.id
  offset greatest(coalesce(p_cursor,0),0)
  limit least(greatest(coalesce(p_limit,100),1),500);
$$;

revoke all on function public.gellatti_search_root(text) from public, anon;
grant execute on function public.gellatti_search_root(text) to authenticated, service_role;
