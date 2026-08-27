-- PRODUCT_PROFILE_V1 persists the complete server-recomputed profile, while
-- the nested Product Accuracy assessment has its own independently versioned
-- authority. The shared PR/PM scorer is now V2; keep the database admission
-- gate aligned with that exact server authority without changing any weights,
-- thresholds or readiness rules.

select pg_advisory_xact_lock(hashtextextended('product-accuracy-v2-ingest-authority-v1',0));

do $patch_ingest$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_patched:=v_definition;

  v_old:=$old$      or coalesce(p_risk#>>'{productProfileAuthority,productAccuracyAssessment,authority}','')
        <>'PRODUCT_PRODUCTION_ACCURACY_V1'$old$;
  v_new:=$new$      or coalesce(p_risk#>>'{productProfileAuthority,productAccuracyAssessment,authority}','')
        <>'PRODUCT_PRODUCTION_ACCURACY_V2'$new$;
  if strpos(v_patched,v_new)=0 then
    if strpos(v_patched,v_old)=0 then
      raise exception 'product accuracy ingest authority anchor drifted';
    end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end
$patch_ingest$;

