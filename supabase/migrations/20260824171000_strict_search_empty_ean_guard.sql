-- Forward-only staging close-out for the exact root cause of the served 393
-- filler results. A text-only query normalizes to an empty digit string; many
-- Mapper rows carry a blank (rather than NULL) EAN, so `x = ''` admitted them
-- as an "exact barcode" match before textual relevance was considered.
--
-- Idempotent for a fresh ledger where 20260824170000 already carries the guard.
-- No product, import, Engine, readiness or Mapper dataset row is changed.

do $migration$
declare
  v_signature regprocedure := to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text;
  v_guarded text;
begin
  if v_signature is null then
    raise exception 'search_products_v1 token-group authority is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  v_old := $old$    and (e.q=''
      or exists(select 1 from unnest(c.eans) x where x=regexp_replace(p_query,'\D','','g'))
      or public.gellatti_search_match_tier(
        c.display_name,c.original_name,c.brand,c.search_text,p_query,p_token_groups
      )>0)$old$;
  v_guarded := $new$    and (e.q=''
      or (nullif(regexp_replace(p_query,'\D','','g'),'') is not null
        and exists(select 1 from unnest(c.eans) x where x=regexp_replace(p_query,'\D','','g')))
      or public.gellatti_search_match_tier(
        c.display_name,c.original_name,c.brand,c.search_text,p_query,p_token_groups
      )>0)$new$;

  if strpos(v_definition,v_guarded) > 0 then return; end if;
  if strpos(v_definition,v_old) = 0 then
    raise exception 'strict search empty-EAN guard anchor drifted';
  end if;
  v_patched := replace(v_definition,v_old,v_guarded);
  execute v_patched;
end;
$migration$;
