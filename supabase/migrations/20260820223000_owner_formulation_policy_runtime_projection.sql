-- Forward-only runtime correction for Owner formulation dosage authority.
--
-- 20260820213000 selected the exact Owner policy after the evidence resolver
-- had already assembled sharedFacts. Preserve that selection and project the
-- resulting dose into the final sharedFacts envelope consumed by Preview,
-- Apply and every guarded write. Canonical Mapper source rows are untouched.

do $patch_owner_dosage_runtime_projection$
declare
  v_definition text;
  v_patched text;
  v_marker text :=
    'v_mapper_recommended_dose:=coalesce(v_owner_recommended_dose,v_mapper_recommended_dose);';
begin
  v_definition := pg_get_functiondef(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    v_marker,
    v_marker || '
  v_shared_facts:=jsonb_set(
    coalesce(v_shared_facts,''{}''::jsonb),
    ''{recommendedDose}'',
    coalesce(v_mapper_recommended_dose,''null''::jsonb),
    true
  );'
  );

  if v_patched = v_definition
    or strpos(v_patched, '''{recommendedDose}''') = 0
    or strpos(v_patched, 'coalesce(v_mapper_recommended_dose,''null''::jsonb)') = 0 then
    raise exception 'owner dosage runtime projection patch drifted';
  end if;

  execute v_patched;
end;
$patch_owner_dosage_runtime_projection$;

