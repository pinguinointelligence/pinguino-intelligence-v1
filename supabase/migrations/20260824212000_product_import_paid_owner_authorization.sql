-- Staging exposed that the commercial INTIMPORT owner is paid but is not an
-- account administrator. Run controls remain service-role-only; authorize the
-- same paid account boundary already accepted by catalog_import.

create or replace function public.product_import_actor_authorized_v1(p_actor_user_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select public.gellatti_has_paid_access_v1(p_actor_user_id) or exists(
    select 1 from public.admin_users a
    where a.user_id=p_actor_user_id and a.revoked_at is null
  );
$$;
revoke all on function public.product_import_actor_authorized_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.product_import_actor_authorized_v1(uuid) to service_role;

-- 21100 may already have been applied with the stricter admin-only predicate.
-- Patch only these five service-only functions, preserving their bodies and
-- signatures. Fresh databases already contain the final predicate, so each
-- replacement becomes a no-op there.
do $patch_existing_import_functions$
declare
  v_signature text;
  v_definition text;
  v_patched text;
begin
  foreach v_signature in array array[
    'public.product_import_clean_preflight_v1(uuid)',
    'public.start_product_import_run_v1(uuid,text,text,text,text,text,integer)',
    'public.register_legacy_product_import_run_v1(uuid,timestamptz,timestamptz,integer,integer,integer,text,jsonb)',
    'public.rollback_product_import_run_v1(uuid,uuid)',
    'public.snapshot_and_clean_pr_catalog_v1(uuid,text)'
  ] loop
    select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
    if v_definition is null then
      raise exception 'missing product import function %',v_signature;
    end if;
    v_patched:=replace(
      v_definition,
      'select exists(select 1 from public.admin_users a' || chr(10) ||
        '    where a.user_id=p_actor_user_id and a.revoked_at is null) into v_admin;',
      'select public.product_import_actor_authorized_v1(p_actor_user_id) into v_admin;'
    );
    v_patched:=regexp_replace(
      v_patched,
      'if not exists\(select 1 from public\.admin_users a[[:space:]]+where a\.user_id=p_actor_user_id and a\.revoked_at is null\)',
      'if not public.product_import_actor_authorized_v1(p_actor_user_id)',
      'g'
    );
    if v_patched is distinct from v_definition then execute v_patched; end if;
  end loop;
end;
$patch_existing_import_functions$;

notify pgrst,'reload schema';
