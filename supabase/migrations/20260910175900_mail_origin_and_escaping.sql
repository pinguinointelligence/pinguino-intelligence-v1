-- ============================================================================
-- Mail foundations: the app a request came from, and escaped content
-- ============================================================================
-- STATUS: READY / WAITING OWNER DB APPROVAL — NOT APPLIED.
-- Staging and production share ONE Supabase project (A-DEF-02), so applying
-- this changes production's database. It only ADDS three objects and changes
-- nothing that exists. It is reversible and tested.
--
-- WHY. The database cannot tell a production request from a staging one, so two
-- mail paths guessed the environment from a value the CLIENT put in the request
-- body, with `ilike '%gellatti.com%'`. On the isolated Growth QA branch
-- 'https://gellatti.com.attacker.example' was labelled production and given
-- production links, in the partner lifecycle draft and in the LIVE franchise
-- inquiry mail. That live mail also put anonymous input into HTML unescaped.
-- Owner decision 2026-09-17: environment and links are decided on the server,
-- never from a client-supplied origin or a substring.
--
-- WHAT
--   * public.app_origins — the closed map. The same three origins
--     shop-digital-document and supabase/functions/_shared/appOrigins.ts already
--     trust; a contract test keeps all three identical.
--   * public.gellatti_request_app_origin_v1() — the HTTP Origin header PostgREST
--     received (`request.headers`), matched EXACTLY against the map. The header
--     is set by the browser, not by page script. A suffix, a prefix, another
--     scheme or port, or a lookalike host is unknown, and unknown is staging:
--     a production mail marked staging is noise, a staging mail marked
--     production hides a test in a real inbox. No request body is read.
--   * public.gellatti_html_escape_v1(text) — text into HTML, so request values
--     can never become markup in a mail.
--
-- USED BY (separate packages; each needs this one first):
--   20260910180000_partner_application_lifecycle_email.sql
--   20260917180000_franchise_inquiry_server_environment.sql

-- ── The closed app-origin map ────────────────────────────────────────────────
create table if not exists public.app_origins (
  origin text primary key,
  environment text not null,
  base_url text not null,
  constraint app_origins_origin_shape check (origin ~ '^https://[a-z0-9.-]+$'),
  constraint app_origins_base_url_shape check (base_url ~ '^https://[a-z0-9.-]+$'),
  constraint app_origins_environment check (environment in ('production', 'staging'))
);

alter table public.app_origins enable row level security;
-- No policies and no client grants: read by SECURITY DEFINER functions only.
revoke all on table public.app_origins from public, anon, authenticated;

insert into public.app_origins (origin, environment, base_url) values
  ('https://staging.pinguinoai.com', 'staging', 'https://staging.pinguinoai.com'),
  ('https://www.gellatti.com', 'production', 'https://www.gellatti.com'),
  ('https://gellatti.com', 'production', 'https://www.gellatti.com')
on conflict (origin) do update
  set environment = excluded.environment, base_url = excluded.base_url;

-- ── The app THIS request came from ───────────────────────────────────────────
create or replace function public.gellatti_request_app_origin_v1()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_origin text := '';
  v_result jsonb;
begin
  begin
    v_origin := lower(rtrim(btrim(coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'origin', ''
    )), '/'));
  exception when others then
    v_origin := '';
  end;

  select jsonb_build_object('environment', o.environment, 'baseUrl', o.base_url, 'matched', true)
    into v_result
    from public.app_origins o
    where o.origin = v_origin;

  if v_result is null then
    select jsonb_build_object('environment', 'staging', 'baseUrl', o.base_url, 'matched', false)
      into v_result
      from public.app_origins o
      where o.environment = 'staging'
      order by o.origin
      limit 1;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.gellatti_request_app_origin_v1() from public, anon, authenticated;

-- ── Text into HTML ───────────────────────────────────────────────────────────
-- `&` first, so an escape is never escaped twice. STRICT: null stays null, so an
-- optional part concatenated to it still disappears as it did before.
create or replace function public.gellatti_html_escape_v1(p_text text)
 returns text
 language sql
 immutable
 strict
 parallel safe
 set search_path to 'pg_catalog'
as $function$
  select replace(replace(replace(replace(replace(
    p_text,
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$function$;

revoke all on function public.gellatti_html_escape_v1(text) from public, anon, authenticated;
