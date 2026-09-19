-- QA ONLY — mail isolation B: capture every Supabase Auth e-mail (invite, recovery, magic link, signup, email change)
-- through the Send Email Hook instead of any SMTP. Tokens are NOT stored: only whether they were present and a
-- sha256 of token_hash (to prove two captures are distinct links), plus redirect_to/site_url/action type/recipient.
--
-- Dashboard side (QA project ncmsonfwbgsqedgnzofg only): Authentication → Auth Hooks → Send Email hook →
-- Postgres → public.qa_capture_auth_email_v1. While enabled, Auth sends nothing through SMTP.
--
-- Rollback: disable the hook in the QA dashboard FIRST (otherwise Auth e-mails fail), then
--   drop function if exists public.qa_capture_auth_email_v1(jsonb);
--   (qa_harness.auth_email_capture is kept as the record of what was captured)
do $capture$
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg' and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b') then
    raise exception 'isolation guard: not the QA branch';
  end if;

  create table if not exists qa_harness.auth_email_capture (
    id bigint generated always as identity primary key,
    captured_at timestamptz not null default now(),
    email_action_type text,
    recipient text,
    user_id uuid,
    redirect_to text,
    site_url text,
    token_present boolean not null,
    token_new_present boolean not null,
    token_hash_sha256 text,
    event_without_tokens jsonb not null
  );
  alter table qa_harness.auth_email_capture enable row level security;
  revoke all on qa_harness.auth_email_capture from public, anon, authenticated, service_role;

  create or replace function public.qa_capture_auth_email_v1(event jsonb)
  returns jsonb language plpgsql security definer
  set search_path = pg_catalog, public
  as $fn$
  begin
    insert into qa_harness.auth_email_capture (email_action_type, recipient, user_id, redirect_to, site_url,
      token_present, token_new_present, token_hash_sha256, event_without_tokens)
    values (
      event -> 'email_data' ->> 'email_action_type',
      event -> 'user' ->> 'email',
      nullif(event -> 'user' ->> 'id', '')::uuid,
      event -> 'email_data' ->> 'redirect_to',
      event -> 'email_data' ->> 'site_url',
      coalesce(event -> 'email_data' ->> 'token', '') <> '',
      coalesce(event -> 'email_data' ->> 'token_new', '') <> '',
      nullif(encode(sha256(convert_to(coalesce(event -> 'email_data' ->> 'token_hash', ''), 'UTF8')), 'hex'),
             encode(sha256(convert_to('', 'UTF8')), 'hex')),
      jsonb_build_object(
        'user', jsonb_build_object('id', event -> 'user' -> 'id', 'email', event -> 'user' -> 'email',
                                   'app_metadata', event -> 'user' -> 'app_metadata'),
        'email_data', (event -> 'email_data') - 'token' - 'token_hash' - 'token_new' - 'token_hash_new'));
    return '{}'::jsonb;
  end
  $fn$;
  revoke all on function public.qa_capture_auth_email_v1(jsonb) from public, anon, authenticated, service_role;
  grant execute on function public.qa_capture_auth_email_v1(jsonb) to supabase_auth_admin;

  insert into qa_bootstrap.environment_changes (change, reason)
  values ('qa_harness.auth_email_capture + public.qa_capture_auth_email_v1(jsonb) (execute: supabase_auth_admin only). Rollback: disable the QA Send Email hook first, then drop function public.qa_capture_auth_email_v1(jsonb).',
          'Mail isolation B. Observed BEFORE on the QA branch (dashboard, 2026-09-17 ~17:55Z): custom SMTP ENABLED (host smtp.resend.com:465, sender no-reply@notify.pinguinoai.com, inherited from the shared project), NO auth hooks, Site URL https://gellatti.com, redirect URLs https://staging.pinguinoai.com/**, http://localhost:5173/**, https://gellatti.com/**, https://www.gellatti.com/**. So any QA Auth invite or recovery would have gone through the shared SMTP with production links.');
end
$capture$;
select to_regprocedure('public.qa_capture_auth_email_v1(jsonb)') is not null as function_present,
       has_function_privilege('supabase_auth_admin', 'public.qa_capture_auth_email_v1(jsonb)', 'execute') as auth_admin_can_execute,
       has_function_privilege('anon', 'public.qa_capture_auth_email_v1(jsonb)', 'execute') as anon_can_execute,
       has_function_privilege('authenticated', 'public.qa_capture_auth_email_v1(jsonb)', 'execute') as authenticated_can_execute;
