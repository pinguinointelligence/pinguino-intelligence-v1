-- SCANNER — RESCUE REFRESH "BETTER" RULE: USABILITY IS THE ROLE'S READINESS, NOT BASE PHYSICS ALONE.
--
-- `engineUsable` is the BASE-physics verdict; a post-process add-on (TOPPING_ONLY) is ready when the
-- readiness authority grants its role (gellattiReadiness.ready / roleReadiness TOPPING_READY) and its
-- engineUsable is false by design. Comparing engineUsable made every ready topping "no better" than
-- its refused predecessor. Both sides now read the role readiness where the facts carry it, falling
-- back to engineUsable for older versions. Idempotent marker.

do $patch_rescue_refresh_role_readiness$
declare
  v_signature regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_definition text;
  v_old_prior text;
  v_new_prior text;
  v_old_new text;
  v_new_new text;
begin
  if v_signature is null then
    raise exception 'gellatti_upsert_customer_added_product_v1_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  if strpos(v_definition,'rescue-refresh: usability is the role readiness')>0 then
    return;
  end if;
  v_old_prior := $old$      v_prior_usable:=coalesce((v_prior_facts#>>'{productIntelligence,engineUsable}')::boolean,false)
        and coalesce(($old$;
  v_new_prior := $new$      -- rescue-refresh: usability is the role readiness (gellattiReadiness.ready), engineUsable
      -- only for versions that never recorded it
      v_prior_usable:=coalesce(
          (v_prior_facts#>>'{productIntelligence,productAccuracyAssessment,gellattiReadiness,ready}')::boolean,
          (v_prior_facts#>>'{productIntelligence,engineUsable}')::boolean,
          false)
        and coalesce(($new$;
  v_old_new := $old$      v_new_usable:=coalesce((p_product_profile->>'engineUsable')::boolean,false);$old$;
  v_new_new := $new$      v_new_usable:=coalesce(
        (p_product_profile#>>'{productAccuracyAssessment,gellattiReadiness,ready}')::boolean,
        (p_product_profile->>'engineUsable')::boolean,
        false);$new$;
  if strpos(v_definition,v_old_prior)=0 or strpos(v_definition,v_old_new)=0 then
    raise exception 'customer product rescue refresh readiness anchor drifted';
  end if;
  execute replace(replace(v_definition,v_old_prior,v_new_prior),v_old_new,v_new_new);
end;
$patch_rescue_refresh_role_readiness$;
