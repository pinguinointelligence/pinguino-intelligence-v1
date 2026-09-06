-- SCANNER — RESCUE REFRESH "BETTER" RULE: THE PRIOR VERSION IS USABLE ONLY IF THE CATALOGUE LETS IT IN.
--
-- 20260905234913 read the prior version's own `engineUsable` fact. A version whose facts said
-- "usable" while its CURRENT behaviour binding refused the module its role needs (TOPPING for an
-- add-on, BASE_RECIPE otherwise) therefore blocked its own repair: the rescued, genuinely usable
-- profile compared as "no better" and the refused binding stayed forever. The prior usability now
-- requires both, exactly as the exact resolver and the analyze path decide it. Idempotent marker.

do $patch_rescue_refresh_prior_usability_binding$
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
  if strpos(v_definition,'rescue-refresh: prior usability includes the binding')>0 then
    return;
  end if;
  v_old := $old$      v_prior_usable:=coalesce((v_prior_facts#>>'{productIntelligence,engineUsable}')::boolean,false);$old$;
  v_new := $new$      -- rescue-refresh: prior usability includes the binding — the module the catalogue grants
      -- the role (TOPPING for an add-on, BASE_RECIPE otherwise) on the CURRENT behaviour binding
      v_prior_usable:=coalesce((v_prior_facts#>>'{productIntelligence,engineUsable}')::boolean,false)
        and coalesce((
          select (b.profile_permissions->>(case
            when v_prior_facts#>>'{productIntelligence,productBehaviorAuthority,intendedUsageRole}'='TOPPING_ONLY'
              then 'TOPPING' else 'BASE_RECIPE' end))::boolean
          from public.products pp
          join public.product_behavior_bindings b on b.id=pp.current_behavior_binding_id
          where pp.id=v_product_id
        ),false);$new$;
  if strpos(v_definition,v_old)=0 then
    raise exception 'customer product rescue refresh usability anchor drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_rescue_refresh_prior_usability_binding$;
