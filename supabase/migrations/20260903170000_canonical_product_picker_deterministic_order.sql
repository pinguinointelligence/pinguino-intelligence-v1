-- Canonical Product Picker v1.9: query relevance is deterministic.
--
-- Favorites are a filter and a star state, not a ranking signal. Recency is an
-- empty-query convenience only. The established search qualification,
-- ProductBehavior eligibility, exact-article matching and Mapper data remain
-- unchanged.

select pg_advisory_xact_lock(
  hashtextextended('canonical-product-picker-deterministic-order-v1', 0)
);

do $patch_product_picker_order$
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
    raise exception 'canonical product search authority is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := v_definition;

  v_old := $old$  order by public.gellatti_search_match_tier(
      c.display_name,c.original_name,c.brand,c.search_text,p_query,p_token_groups
    ) desc,c.favorite desc,c.relevance desc,c.recently_used_at desc nulls last,$old$;
  v_new := $new$  order by public.gellatti_search_match_tier(
      c.display_name,c.original_name,c.brand,c.search_text,p_query,p_token_groups
    ) desc,
    case when e.q<>'' then c.relevance - case when c.favorite then 8 else 0 end
      end desc nulls last,
    case when e.q='' then c.recently_used_at end desc nulls last,$new$;

  if strpos(v_patched, v_old) = 0 then
    raise exception 'canonical product search ordering anchor drifted';
  end if;
  v_patched := replace(v_patched, v_old, v_new);

  execute v_patched;
end;
$patch_product_picker_order$;

comment on function public.search_products_v1(
  text,text,text,text[],boolean,text,text,integer,integer,jsonb
) is 'Authenticated canonical product search: deterministic query relevance; favorites are filter/state only and recency orders empty-query discovery only.';
