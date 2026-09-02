-- 20260817110000_main_technical_authority.sql
-- The Main crown is a technical solver objective in recipe formulation. It is
-- deliberately independent from the exact-grams constraint and from historic
-- sensory MAIN policy. Keep the existing Production/process/label authority
-- untouched; only Preview/Save/version formulation paths ask for STANDARD
-- technical Base eligibility.

do $patch_main_terminal_role$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.assert_recipe_behavior_authority_v1(jsonb,jsonb,text)'::regprocedure
  );
  v_patched := replace(v_definition,
    'v_role:=case when v_scope=''BASE_FORMULATION'' and v_item->>''lock_type''=''main''
      and not (v_technical_main_ids ? v_line_id)
      then ''MAIN'' else ''STANDARD'' end;',
    'v_role:=case when v_scope=''BASE_FORMULATION'' and v_item->>''lock_type''=''main''
      and p_module in (''PRODUCTION'',''PROCESS'',''LABEL'',''MASTER_LABEL'',''EXPORT'',''BATCH_RESCUE'')
      and not (v_technical_main_ids ? v_line_id)
      then ''MAIN'' else ''STANDARD'' end;'
  );
  if v_patched=v_definition
    or strpos(v_patched,
      'p_module in (''PRODUCTION'',''PROCESS'',''LABEL'',''MASTER_LABEL'',''EXPORT'',''BATCH_RESCUE'')')=0
    or strpos(v_patched,
      'v_scope=''BASE_FORMULATION'' and v_item->>''lock_type''=''main''')=0 then
    raise exception 'Main technical terminal-role patch drifted';
  end if;
  execute v_patched;
end;
$patch_main_terminal_role$;

-- A STANDARD technical request is intentionally independent from historical
-- sensory Main-policy versions. MAIN requests retained by Production/process
-- still compare the policy reference exactly as before.
do $patch_main_policy_staleness$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.validate_recipe_behavior_v1(jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(v_definition,
    'if coalesce(v_resolved->''mainPolicy''->>''policyId'','''')
      is distinct from coalesce(v_line->>''mainPolicyId'','''')
      or coalesce(v_resolved->''mainPolicy''->>''policyVersion'','''')
      is distinct from coalesce(v_line->>''mainPolicyVersion'','''') then
      v_reasons := array_append(v_reasons,''main_policy_stale'');
    end if;',
    'if coalesce(p_context->>''requestedRole'',''STANDARD'')=''MAIN'' and (
      coalesce(v_resolved->''mainPolicy''->>''policyId'','''')
        is distinct from coalesce(v_line->>''mainPolicyId'','''')
      or coalesce(v_resolved->''mainPolicy''->>''policyVersion'','''')
        is distinct from coalesce(v_line->>''mainPolicyVersion'','''')
    ) then
      v_reasons := array_append(v_reasons,''main_policy_stale'');
    end if;'
  );
  if v_patched=v_definition
    or strpos(v_patched,
      'coalesce(p_context->>''requestedRole'',''STANDARD'')=''MAIN''')=0 then
    raise exception 'Main policy staleness patch drifted';
  end if;
  execute v_patched;
end;
$patch_main_policy_staleness$;

do $assert_main_terminal_role$
declare v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.assert_recipe_behavior_authority_v1(jsonb,jsonb,text)'::regprocedure
  );
  if strpos(v_definition,
      'p_module in (''PRODUCTION'', ''PROCESS'', ''LABEL'', ''MASTER_LABEL'', ''EXPORT'', ''BATCH_RESCUE'')')=0
    and strpos(v_definition,
      'p_module in (''PRODUCTION'',''PROCESS'',''LABEL'',''MASTER_LABEL'',''EXPORT'',''BATCH_RESCUE'')')=0 then
    raise exception 'Main technical role after-state is missing';
  end if;
end;
$assert_main_terminal_role$;
