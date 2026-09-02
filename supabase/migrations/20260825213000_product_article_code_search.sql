-- Restore the canonical article-code seam in the normal product picker.
-- ProductBehavior still owns selection eligibility; this patch only makes the
-- product-owned PR/PM identity searchable alongside its commercial name.

select pg_advisory_xact_lock(hashtextextended('product-article-code-search-v1',0));

do $patch_article_code_search$
declare
  v_signature regprocedure:=to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  if v_signature is null then raise exception 'product search authority missing'; end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched:=v_definition;

  v_old:=$old$p.product_name_internal,p.brand,p.canonical_family,p.product_category,b.family_id,b.subfamily_id,$old$;
  v_new:=$new$p.product_name_internal,p.product_code,p.brand,p.canonical_family,p.product_category,b.family_id,b.subfamily_id,$new$;

  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then
      raise exception 'commercial product article-code search anchor drifted';
    end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_article_code_search$;

comment on function public.search_products_v1(
  text,text,text,text[],boolean,text,text,integer,integer,jsonb
) is 'Authenticated canonical picker search, including exact PI/PR/PM article-code discovery while retaining immutable ProductBehavior selection authority.';
