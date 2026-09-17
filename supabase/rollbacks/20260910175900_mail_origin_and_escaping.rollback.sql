-- ============================================================================
-- ROLLBACK for 20260910175900_mail_origin_and_escaping
-- ============================================================================
-- Removes the app-origin map, the request-origin resolver and the HTML escape
-- helper, and nothing else.
--
-- REFUSES while anything that calls them is applied: the partner lifecycle mail
-- (20260910180000) and the franchise inquiry correction (20260917180000). Roll
-- those back first. PL/pgSQL binds late, so without this refusal the drop would
-- succeed and break those paths at run time instead.

do $guard$
declare
  v_franchise regprocedure := to_regprocedure('public.gellatti_submit_franchise_inquiry_v1(jsonb)');
begin
  if to_regprocedure('public.gellatti_partner_application_stamp_app_v1()') is not null
     or to_regprocedure('public.gellatti_partner_application_email_v1()') is not null then
    raise exception 'rollback refused: roll back 20260910180000_partner_application_lifecycle_email first';
  end if;
  if v_franchise is not null
     and pg_get_functiondef(v_franchise) like '%gellatti_request_app_origin_v1%' then
    raise exception 'rollback refused: roll back 20260917180000_franchise_inquiry_server_environment first';
  end if;
end $guard$;

drop function if exists public.gellatti_html_escape_v1(text);
drop function if exists public.gellatti_request_app_origin_v1();
drop table if exists public.app_origins;
