-- Add the second Engine-authorized Production enlargement objective without
-- weakening the existing proof boundary. Forward-only; Mapper and Engine
-- science are unchanged.

do $$
declare
  v_constraint_name text;
begin
  select constraint_name into v_constraint_name
  from information_schema.check_constraints
  where constraint_schema = 'private'
    and constraint_name in (
      select conname
      from pg_catalog.pg_constraint
      where conrelid = 'private.production_rescue_authorizations'::regclass
        and contype = 'c'
        and pg_catalog.pg_get_constraintdef(oid) like '%stable_option_id%'
    )
  limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table private.production_rescue_authorizations drop constraint %I',
      v_constraint_name
    );
  end if;
end
$$;
alter table private.production_rescue_authorizations
  add constraint production_rescue_authorizations_stable_option_id_check
  check (
    stable_option_id in (
      'keep_original_batch',
      'enlarge_batch',
      'restore_original_recipe',
      'leave_as_is'
    )
  );

-- The original RPC has a second fail-closed allow-list inside its security
-- definer body. Preserve the complete installed definition and extend only
-- that exact literal list so grants, timeouts and all proof checks stay intact.
do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_catalog.pg_get_functiondef(procedure.oid)
    into v_definition
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'production_create_rescue_authorization_v1';

  if v_definition is null then
    raise exception 'production_create_rescue_authorization_v1 is required';
  end if;

  v_updated := replace(
    v_definition,
    '''keep_original_batch'', ''enlarge_batch'', ''leave_as_is''',
    '''keep_original_batch'', ''enlarge_batch'', ''restore_original_recipe'', ''leave_as_is'''
  );
  if v_updated = v_definition then
    raise exception 'Production Rescue stable-option allow-list signature changed';
  end if;
  execute v_updated;
end
$$;
