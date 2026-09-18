-- ============================================================================
-- ROLLBACK for 20260918090000_audit_environment_server_decided
-- ============================================================================
-- Restores the 20260826120000 body byte for byte, including its hard-coded
-- 'staging'. No audit row is read, written or deleted; the table, the signature
-- and the grants are untouched.
--
-- Roll this back BEFORE 20260910175900_mail_origin_and_escaping, whose own
-- rollback refuses while this function still calls the resolver.

create or replace function public.gellatti_write_audit_v1(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_diff jsonb,
  p_reason text,
  p_correlation_id text,
  p_actor_type text default 'admin',
  p_actor_id text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  insert into public.audit_log(
    actor_type, actor_id, action, entity_type, entity_id, diff, reason, correlation_id
  ) values (
    p_actor_type,
    coalesce(p_actor_id, auth.uid()::text),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_diff,'{}'::jsonb) || jsonb_build_object('environment','staging'),
    p_reason,
    p_correlation_id
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.gellatti_write_audit_v1(
  text,text,text,jsonb,text,text,text,text
) from public, anon, authenticated;
