-- ============================================================================
-- The audit trail's environment is decided on the SERVER
-- ============================================================================
-- STATUS: READY / WAITING FOR OWNER DB APPROVAL — NOT APPLIED.
--
-- THE DEFECT. gellatti_write_audit_v1 (20260826120000) merges a LITERAL
--   jsonb_build_object('environment','staging')
-- into every audit row, on the right of `||`, so it also overwrites anything a
-- caller passed. Staging and production share one Supabase project, so every
-- production action in public.audit_log is filed as staging, and no reader can
-- tell the two apart. 26 SQL functions write through this one door.
--
-- THE FIX. The same closed map the mail paths use: gellatti_request_app_origin_v1
-- reads the Origin header PostgREST received and matches it EXACTLY against
-- public.app_origins. Nothing is read from a parameter, a body, or a substring.
-- The server's answer is still applied last, so a caller cannot set or override
-- it. Signature, grants, table and all 26 callers are unchanged.
--
-- WHAT IT CANNOT KNOW, stated rather than hidden. A row written by pg_cron, by
-- the Stripe webhook, or by an Edge Function's own service-role client carries
-- no browser Origin. Those rows get environment 'staging' with
-- originMatched = false, which is exactly what distinguishes "it really was
-- staging" from "there was no app request". Edge Functions that resolve the app
-- themselves (admin-control, after 20260910175900) keep writing their own value.
--
-- HISTORY. Existing rows are NOT rewritten: the Origin was never stored, so the
-- true environment of a past row cannot be re-derived. `environment` is
-- meaningful for rows written after this migration is applied.
--
-- DEPENDS ON 20260910175900_mail_origin_and_escaping.sql.
-- ============================================================================

do $dependency$
begin
  if to_regprocedure('public.gellatti_request_app_origin_v1()') is null
     or to_regclass('public.app_origins') is null then
    raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';
  end if;
end $dependency$;

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
declare
  v_id uuid;
  v_app jsonb;
begin
  -- An audit row must never be lost because the origin could not be resolved:
  -- a failure falls back to the resolver's own safe direction.
  begin
    v_app := public.gellatti_request_app_origin_v1();
  exception when others then
    v_app := null;
  end;

  insert into public.audit_log(
    actor_type, actor_id, action, entity_type, entity_id, diff, reason, correlation_id
  ) values (
    p_actor_type,
    coalesce(p_actor_id, auth.uid()::text),
    p_action,
    p_entity_type,
    p_entity_id,
    -- the server's answer LAST: a caller-supplied 'environment' cannot win
    coalesce(p_diff,'{}'::jsonb) || jsonb_build_object(
      'environment',   coalesce(v_app ->> 'environment', 'staging'),
      'originMatched', coalesce((v_app ->> 'matched')::boolean, false)
    ),
    p_reason,
    p_correlation_id
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.gellatti_write_audit_v1(
  text,text,text,jsonb,text,text,text,text
) from public, anon, authenticated;
