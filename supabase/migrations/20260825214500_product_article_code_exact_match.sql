-- Canonical PR/PM/PI article codes normalize to several tokens (for example
-- `PR-ING-007138` -> `pr ing 007138`). The GELLATTI multi-concept matcher is
-- intentionally identity-only, so admit only an exact normalized phrase from
-- the governed search text before invoking its broader ranked matching.

select pg_advisory_xact_lock(hashtextextended('product-article-code-exact-match-v1',0));

do $patch_article_code_exact_match$
declare
  v_signature regprocedure:=to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_duplicate text;
  v_single text;
  v_old text;
  v_new text;
begin
  if v_signature is null then raise exception 'product search authority missing'; end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched:=v_definition;

  -- The preceding compatibility migration may encounter a search definition
  -- that already included product_code. Keep the projection canonical.
  v_duplicate:=$old$p.product_code,p.product_name_display,
        p.product_name_internal,p.product_code,p.brand,$old$;
  v_single:=$new$p.product_code,p.product_name_display,
        p.product_name_internal,p.brand,$new$;
  if strpos(v_patched,v_duplicate)>0 then
    v_patched:=replace(v_patched,v_duplicate,v_single);
  end if;

  v_old:=$old$    and (e.q=''
      or (nullif(regexp_replace(p_query,'\D','','g'),'') is not null$old$;
  v_new:=$new$    and (e.q=''
      or (' '||c.search_text||' ') like '% '||e.q||' %'
      or (nullif(regexp_replace(p_query,'\D','','g'),'') is not null$new$;

  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then
      raise exception 'canonical exact article-code match anchor drifted';
    end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_article_code_exact_match$;

comment on function public.search_products_v1(
  text,text,text,text[],boolean,text,text,integer,integer,jsonb
) is 'Authenticated canonical picker search with exact normalized PI/PR/PM article-code discovery and governed GELLATTI ranked matching.';
