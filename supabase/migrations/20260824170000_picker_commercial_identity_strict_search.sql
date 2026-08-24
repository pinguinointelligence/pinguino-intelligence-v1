-- Picker-only forward repair:
--   1. project a commercial product's own immutable PR-ING identity;
--   2. make multi-concept search increasingly specific instead of admitting a
--      row because one generic token happens to occur in technical metadata.
--
-- No Engine, inference, readiness, import or Mapper dataset row is changed.

create or replace function public.gellatti_search_match_tier(
  p_display_name text,
  p_original_name text,
  p_brand text,
  p_search_text text,
  p_query text,
  p_token_groups jsonb default '[]'::jsonb
) returns integer
language plpgsql stable
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_identity text := trim(regexp_replace(
    extensions.unaccent(lower(concat_ws(' ',p_display_name,p_original_name,p_brand))),
    '[^a-z0-9]+',' ','g'
  ));
  v_search_text text := trim(regexp_replace(
    extensions.unaccent(lower(coalesce(p_search_text,''))),
    '[^a-z0-9]+',' ','g'
  ));
  v_query text := trim(regexp_replace(
    extensions.unaccent(lower(coalesce(p_query,''))),
    '[^a-z0-9]+',' ','g'
  ));
  v_groups jsonb := coalesce(p_token_groups,'[]'::jsonb);
  v_group jsonb;
  v_group_count integer;
  v_group_hits integer := 0;
  v_group_position integer;
  v_last_position integer := 0;
  v_ordered boolean := true;
  v_near_complete integer;
begin
  if v_query = '' then return 1; end if;

  if jsonb_typeof(v_groups) <> 'array' then v_groups := '[]'::jsonb; end if;
  if jsonb_array_length(v_groups) = 0 then
    select coalesce(jsonb_agg(jsonb_build_array(token)),'[]'::jsonb)
      into v_groups
    from regexp_split_to_table(v_query,' +') token
    where length(token) >= 2;
  end if;

  v_group_count := jsonb_array_length(v_groups);
  if v_group_count = 0 then return 0; end if;

  for v_group in select value from jsonb_array_elements(v_groups)
  loop
    select min(strpos(v_identity,lower(trim(term))))
      into v_group_position
    from jsonb_array_elements_text(v_group) term
    where trim(term) <> '' and strpos(v_identity,lower(trim(term))) > 0;

    if v_group_position is not null then
      v_group_hits := v_group_hits + 1;
      if v_group_position <= v_last_position then v_ordered := false; end if;
      v_last_position := greatest(v_last_position,v_group_position);
    end if;
  end loop;

  -- One-concept searches keep their accepted multilingual/stemmed behaviour.
  -- The technical search document is a fallback here only; it can never admit
  -- a row into a multi-concept result set.
  if v_group_count = 1 then
    if v_identity like '%'||v_query||'%' then return 500; end if;
    if v_group_hits = 1 then return 400; end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_groups->0) term
      where trim(term) <> '' and v_search_text like '%'||lower(trim(term))||'%'
    ) then return 200; end if;
    if extensions.similarity(v_identity,v_query) >= 0.55 then return 100; end if;
    return 0;
  end if;

  -- A-D: exact phrase; all concepts; ordered/near-complete concepts; then a
  -- deliberately conservative fuzzy fallback. One generic word is never enough.
  if v_identity like '%'||v_query||'%' then return 500; end if;
  if v_group_hits = v_group_count then return case when v_ordered then 450 else 400 end; end if;

  v_near_complete := ceil(v_group_count * 0.75)::integer;
  if v_group_hits >= greatest(2,v_near_complete) then
    return case when v_ordered then 300 else 250 end;
  end if;

  if v_group_hits >= greatest(2,ceil(v_group_count * 0.50)::integer)
    and extensions.similarity(v_identity,v_query) >= 0.55
  then return 100; end if;

  return 0;
end;
$fn$;

revoke all on function public.gellatti_search_match_tier(text,text,text,text,text,jsonb)
  from public, anon;
grant execute on function public.gellatti_search_match_tier(text,text,text,text,text,jsonb)
  to authenticated, service_role;

do $migration$
declare
  v_signature regprocedure := to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'search_products_v1 token-group authority is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := v_definition;

  v_old := $old$(coalesce(v.facts->'public_data',v.facts)||jsonb_build_object('lifecycleRejected',coalesce(p.status,'')='rejected','approvedForBase',coalesce(m.approved_for_base,false),'approvedForEngines',coalesce(m.approved_for_engines,false))) public_data$old$;
  v_new := $new$(coalesce(v.facts->'public_data',v.facts)||jsonb_build_object('productCode',p.product_code,'lifecycleRejected',coalesce(p.status,'')='rejected','approvedForBase',coalesce(m.approved_for_base,false),'approvedForEngines',coalesce(m.approved_for_engines,false))) public_data$new$;
  if strpos(v_patched,v_old) = 0 then
    raise exception 'commercial product-code projection anchor drifted';
  end if;
  v_patched := replace(v_patched,v_old,v_new);

  v_old := $old$    and (e.q='' or exists(select 1 from unnest(e.terms) t where
        c.indexed_search_text ilike '%'||t||'%'
        or to_tsvector('simple',c.indexed_search_text) @@
          to_tsquery('simple',regexp_replace(t,' +',':* & ','g')||':*'))
      or exists(select 1 from unnest(e.terms) t where c.search_text like '%'||t||'%')
      or (jsonb_array_length(coalesce(p_token_groups,'[]'::jsonb))>0 and not exists(select 1 from jsonb_array_elements(p_token_groups) g where not exists(select 1 from jsonb_array_elements_text(g) v where c.search_text like '%'||v||'%'))) or (jsonb_array_length(coalesce(p_token_groups,'[]'::jsonb))=0 and extensions.similarity(c.search_text,e.q)>=0.55)
      or exists(select 1 from unnest(c.eans) x where x=regexp_replace(p_query,'\D','','g')))$old$;
  v_new := $new$    and (e.q=''
      or (nullif(regexp_replace(p_query,'\D','','g'),'') is not null
        and exists(select 1 from unnest(c.eans) x where x=regexp_replace(p_query,'\D','','g')))
      or public.gellatti_search_match_tier(
        c.display_name,c.original_name,c.brand,c.search_text,p_query,p_token_groups
      )>0)$new$;
  if strpos(v_patched,v_old) = 0 then
    raise exception 'strict search qualification anchor drifted';
  end if;
  v_patched := replace(v_patched,v_old,v_new);

  v_old := $old$  order by c.favorite desc, (select count(*) from jsonb_array_elements(coalesce(p_token_groups,'[]'::jsonb)) g where exists(select 1 from jsonb_array_elements_text(g) v where trim(regexp_replace(extensions.unaccent(lower(coalesce(c.display_name,''))),'[^a-z0-9]+',' ','g')) like '%'||v||'%')) desc, (case when e.q<>'' and trim(regexp_replace(extensions.unaccent(lower(coalesce(c.display_name,''))),'[^a-z0-9]+',' ','g')) like '%'||e.q||'%' then 1 else 0 end) desc, c.relevance desc,c.recently_used_at desc nulls last,$old$;
  v_new := $new$  order by public.gellatti_search_match_tier(
      c.display_name,c.original_name,c.brand,c.search_text,p_query,p_token_groups
    ) desc,c.favorite desc,c.relevance desc,c.recently_used_at desc nulls last,$new$;
  if strpos(v_patched,v_old) = 0 then
    raise exception 'strict search ordering anchor drifted';
  end if;
  v_patched := replace(v_patched,v_old,v_new);

  execute v_patched;
end;
$migration$;

comment on function public.gellatti_search_match_tier(text,text,text,text,text,jsonb)
is 'Picker relevance gate: exact/all-concept/ordered-near-complete/conservative fuzzy over customer-visible product identity; generic technical metadata cannot qualify multi-token queries.';
