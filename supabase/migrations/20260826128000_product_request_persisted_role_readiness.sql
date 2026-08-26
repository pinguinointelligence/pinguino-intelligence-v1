-- Approval consumes the same persisted ProductBehavior verdict as PR/PM
-- runtime. main_policy_status describes MAIN placement and must not veto an
-- independently granted BASE_RECIPE or TOPPING permission.

select pg_advisory_xact_lock(hashtextextended('product-request-persisted-role-readiness-v1',0));

do $patch_request_approval$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.gellatti_admin_product_request_action_v1(uuid,text,jsonb)'::regprocedure
  );
  v_patched:=v_definition;

  v_old:=$old$            and (
              (pb.behavior_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','STRUCTURAL_ONLY','PROTEIN_CONTRIBUTOR_ONLY')
                and pb.main_policy_status='COVERED'
                and pv.facts#>>'{productIntelligence,engineUsable}'='true')
              or (pb.behavior_role='TOPPING_ONLY'
                and coalesce((pb.profile_permissions->>'TOPPING')::boolean,false))
              or (pb.main_policy_status='COVERED'
                and pv.facts#>>'{productIntelligence,engineUsable}'='true'
                and coalesce((pb.profile_permissions->>'TOPPING')::boolean,false))
            )$old$;
  v_new:=$new$            and (
              (
                pv.facts#>>'{productIntelligence,engineUsable}'='true'
                and coalesce((pv.facts#>>'{productIntelligence,productBehaviorAuthority,baseRecipeEligible}')::boolean,false)
                and coalesce((pb.profile_permissions->>'BASE_RECIPE')::boolean,false)
              )
              or (
                coalesce((pv.facts#>>'{productIntelligence,productBehaviorAuthority,toppingEligible}')::boolean,false)
                and coalesce((pb.profile_permissions->>'TOPPING')::boolean,false)
              )
            )$new$;

  if strpos(v_patched,'productBehaviorAuthority,baseRecipeEligible')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'product request readiness anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_request_approval$;
