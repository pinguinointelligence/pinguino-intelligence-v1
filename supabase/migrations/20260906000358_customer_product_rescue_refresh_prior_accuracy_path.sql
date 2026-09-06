-- SCANNER — RESCUE REFRESH "BETTER" RULE: READ THE PRIOR ACCURACY WHERE THE FACTS KEEP IT.
--
-- 20260905234913 compared the rescued profile's Product Accuracy against
-- facts#>>'{productIntelligence,productAccuracy}'. The persisted facts carry the accuracy at the
-- TOP level ('productAccuracy'), not inside 'productIntelligence', so the prior side always read 0
-- and any accuracy looked like an improvement — identical facts still produced a new version.
-- The prior accuracy is now read from either place. Idempotent through its marker.

do $patch_rescue_refresh_prior_accuracy_path$
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
  if strpos(v_definition,'rescue-refresh: prior accuracy from either place')>0 then
    return;
  end if;
  v_old := $old$      v_prior_accuracy:=coalesce((v_prior_facts#>>'{productIntelligence,productAccuracy}')::numeric,0);$old$;
  v_new := $new$      -- rescue-refresh: prior accuracy from either place (top-level 'productAccuracy' is where
      -- the create branch keeps it; the nested key is kept for forward compatibility)
      v_prior_accuracy:=coalesce(
        (v_prior_facts#>>'{productIntelligence,productAccuracy}')::numeric,
        (v_prior_facts->>'productAccuracy')::numeric,
        0
      );$new$;
  if strpos(v_definition,v_old)=0 then
    raise exception 'customer product rescue refresh accuracy anchor drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_rescue_refresh_prior_accuracy_path$;
