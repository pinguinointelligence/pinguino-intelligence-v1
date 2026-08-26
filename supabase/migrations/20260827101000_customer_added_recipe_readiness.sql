-- Customer-added products carry the same PRODUCT_BEHAVIOR_V1 null runtime
-- Mapper identity as PR/PM. The established ingest seam strips that JSON null
-- before classification; the Scanner CA seam preserves it. Accept both safe
-- serializations of the same null authority without granting a runtime Mapper
-- binding or changing any ProductBehavior decision.

select pg_advisory_xact_lock(hashtextextended('customer-added-recipe-readiness-v1',0));

do $patch_classifier$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_patched:=v_definition;
  v_old:=$old$and v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}' is null$old$;
  v_new:=$new$and coalesce(v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}','null'::jsonb)='null'::jsonb$new$;

  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then
      raise exception 'customer-added ProductBehavior null-runtime anchor drifted';
    end if;
    v_patched:=replace(v_patched,v_old,v_new);
    execute v_patched;
  end if;
end;
$patch_classifier$;

-- Existing staging proof artifacts were classified before the safe null
-- representation was accepted. A new classifier-version binding recomputes
-- only their persisted permissions; immutable product versions and profiles
-- remain unchanged.
do $refresh_customer_added$
declare v_version_id uuid;
begin
  for v_version_id in
    select p.current_version_id
    from public.products p
    where p.is_active
      and p.merged_into_product_id is null
      and p.product_kind='customer_provisional'
      and p.current_version_id is not null
  loop
    perform public.classify_catalog_product_behavior_v2(
      v_version_id,'customer-added-runtime-null-v1'
    );
  end loop;
end;
$refresh_customer_added$;

comment on function public.classify_catalog_product_behavior_v2(uuid,text)
is 'Classifies immutable PR/PM/CA ProductBehavior; absent and explicit JSON null both mean no runtime Mapper identity.';
