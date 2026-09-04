-- A higher Rescue revision already atomically replaces the active snapshot.
-- Preserve that behavior and add explicit append-only evidence naming the
-- prior revision/acceptance that the new valid snapshot supersedes. The old
-- authorization and event rows remain historical evidence; physical actuals
-- are not changed by this patch.

do $patch_production_rescue_supersession_audit$
declare
  v_signature regprocedure :=
    'public.production_apply_rescue_v1(uuid,integer,integer,jsonb,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_patched text;
  v_old text := $old$'previousProcessAdvisories', v_run.process_advisories,
      'processReadiness', v_readiness->>'status',
      'processAdvisories', v_readiness->'advisories'$old$;
  v_new text := $new$'previousProcessAdvisories', v_run.process_advisories,
      'processReadiness', v_readiness->>'status',
      'processAdvisories', v_readiness->'advisories',
      'supersededRescueRevision',
        case when v_run.rescue_recipe_input is null then null else v_run.rescue_revision end,
      'supersededRescueAcceptedAt',
        case when v_run.rescue_recipe_input is null then null else v_run.rescue_accepted_at end$new$;
begin
  v_definition := pg_get_functiondef(v_signature);
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Production Rescue supersession audit anchor drifted for %', v_signature;
  end if;
  v_patched := replace(v_definition, v_old, v_new);
  execute v_patched;
end;
$patch_production_rescue_supersession_audit$;
