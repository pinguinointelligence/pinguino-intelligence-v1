-- SCANNER — RESCUE REFRESH: CANONICAL INGEST CONTEXT.
--
-- The rescue-refresh branch (20260905183000) inserts a superseding product version
-- and updates the product row. Both tables carry the canonical write guards, which
-- require `app.canonical_product_ingest` — the create branch of the same function
-- sets it, the refresh branch did not, so the first served rescue failed with
-- customer_product_persistence_failed. This corrective patch inserts the context
-- into an already-patched definition. Idempotent: a definition that already carries
-- the marker (a fresh database applying the amended 20260905183000) is left alone.

do $patch_rescue_refresh_guard_context$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'gellatti_upsert_customer_added_product_v1_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  if strpos(v_definition,'rescue-refresh: canonical ingest context')>0 then
    return;
  end if;
  v_old := $old$    -- Same exact commercial identity, newer immutable technical truth. This is
    -- a version supersession on the existing provisional UUID, not a new item.
$old$;
  v_new := $new$    -- Same exact commercial identity, newer immutable technical truth. This is
    -- a version supersession on the existing provisional UUID, not a new item.
    -- rescue-refresh: canonical ingest context — the create branch sets it; the
    -- canonical write guards on products/product_versions require it here too.
    perform set_config('app.canonical_product_ingest','v1',true);
    perform set_config('app.product_article_origin','CUSTOMER_ADDED',true);
$new$;
  if strpos(v_definition,v_old)=0 then
    raise exception 'customer product rescue refresh anchor drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_rescue_refresh_guard_context$;
