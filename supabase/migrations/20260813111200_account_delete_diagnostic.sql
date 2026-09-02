-- Temporary, service-only diagnostic. The inner exception block always rolls
-- the attempted auth deletion back and returns only PostgreSQL invariant names.
create or replace function public.diagnose_account_delete_v1(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  v_message text;
  v_detail text;
  v_hint text;
  v_constraint text;
  v_table text;
  v_schema text;
begin
  begin
    delete from auth.users where id=p_user_id;
    raise exception 'diagnostic_delete_would_succeed';
  exception when others then
    get stacked diagnostics
      v_message=message_text,
      v_detail=pg_exception_detail,
      v_hint=pg_exception_hint,
      v_constraint=constraint_name,
      v_table=table_name,
      v_schema=schema_name;
    return jsonb_strip_nulls(jsonb_build_object(
      'wouldSucceed',v_message='diagnostic_delete_would_succeed',
      'message',v_message,
      'detail',v_detail,
      'hint',v_hint,
      'constraint',v_constraint,
      'table',v_table,
      'schema',v_schema
    ));
  end;
end $$;
revoke all on function public.diagnose_account_delete_v1(uuid) from public,anon,authenticated;
grant execute on function public.diagnose_account_delete_v1(uuid) to service_role;
