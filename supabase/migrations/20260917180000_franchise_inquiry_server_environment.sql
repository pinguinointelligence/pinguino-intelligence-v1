-- ============================================================================
-- Franchise inquiry mail: the server decides the environment; content is escaped
-- ============================================================================
-- STATUS: READY / WAITING OWNER DB APPROVAL — NOT APPLIED.
-- Corrects LIVE code: 20260910032351_franchise_inquiry_admin_email.sql is in the
-- shared history. Staging and production share ONE Supabase project (A-DEF-02),
-- so applying this changes production's database.
-- DEPENDS ON 20260910175900_mail_origin_and_escaping.sql (refuses without it).
--
-- DEFECTS, reproduced on the isolated Growth QA branch by calling the live
-- function as anon, the role the public form uses:
--   F-1 The environment came from the request BODY, by substring. An `origin` of
--       'https://gellatti.com.attacker.example' produced a production-labelled
--       mail with the production admin link.
--   F-2 Request values went into the mail unescaped. The RPC is granted to anon,
--       so a fullName of
--       '<a href="https://attacker.example/login">Otwórz w panelu Admin</a>'
--       reached info@gellatti.com as a working link (in the body and in the
--       subject), and markup in the email field reached it as markup.
--
-- FIX. Only the mail part of the 20260910032351 body changes:
--   * the environment and the admin link come from
--     gellatti_request_app_origin_v1() and app_origins; the body's `origin` key
--     is no longer read;
--   * every request value in body_html goes through gellatti_html_escape_v1;
--   * the subject identifier is sanitised as emailSubject.ts ES5 does: control
--     characters removed, whitespace collapsed, length bounded;
--   * a failure to resolve the origin can never lose the lead: it is caught and
--     falls back to staging, the safe direction.
--   Validation, the insert, the admin notification, the idempotency key, the
--   sub-block that keeps the lead when the mail cannot be queued, the audit and
--   the grants are unchanged. No grant or revoke is issued here.

do $dependency$
begin
  if to_regprocedure('public.gellatti_request_app_origin_v1()') is null
     or to_regprocedure('public.gellatti_html_escape_v1(text)') is null then
    raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';
  end if;
end $dependency$;

create or replace function public.gellatti_submit_franchise_inquiry_v1(p_inquiry jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_inquiry->>'email', '')));
  v_concept text := lower(btrim(coalesce(p_inquiry->>'concept', '')));
  v_name text := btrim(coalesce(p_inquiry->>'fullName', ''));
  v_source text := btrim(coalesce(p_inquiry->>'sourceRoute', ''));
  v_app jsonb;
  v_environment text;
  v_label text;
  v_subject text;
  v_admin_url text;
begin
  if v_concept not in ('punkt', 'wozek', 'przyczepa', 'lokal') then
    raise exception 'franchise_concept_required';
  end if;
  if v_name = '' then raise exception 'franchise_name_required'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'franchise_email_invalid';
  end if;
  if v_source not in ('/franchise', '/trailer', '/mobile', '/machines') then
    v_source := null;
  end if;

  insert into public.franchise_inquiries(
    user_id, concept, full_name, email, phone, city, country, note, source_route
  ) values (
    auth.uid(), v_concept, v_name, v_email,
    nullif(btrim(coalesce(p_inquiry->>'phone', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'city', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'country', '')), ''),
    nullif(btrim(coalesce(p_inquiry->>'note', '')), ''),
    v_source
  ) returning id into v_id;

  insert into public.user_notifications(
    admin_permission, notification_type, entity_type, entity_id, title, body, deep_link, dedupe_key
  ) values (
    'SUPPORT', 'FRANCHISE_INQUIRY_SUBMITTED', 'franchise_inquiries', v_id::text,
    'Nowe zapytanie o Franchise',
    v_name || ' · ' || v_concept || coalesce(' · ' || v_source, ''),
    '/admin/franchise', 'franchise-inquiry:' || v_id::text
  ) on conflict (dedupe_key) do nothing;

  -- The app this request came from, decided on the server from the exact Origin
  -- header. If that cannot be decided the lead is still kept, as staging.
  begin
    v_app := public.gellatti_request_app_origin_v1();
  exception when others then
    v_app := null;
  end;
  v_environment := coalesce(v_app->>'environment', 'staging');
  v_admin_url := coalesce(v_app->>'baseUrl', 'https://staging.pinguinoai.com') || '/admin/franchise';

  -- ES5: the identifier is untrusted text; no control character may reach a header.
  v_label := left(btrim(regexp_replace(regexp_replace(
    v_name || ' · ' || v_concept, '[[:cntrl:]]+', ' ', 'g'), '\s+', ' ', 'g')), 100);
  v_subject := '[GELLATTI][FRANCHISE][INQUIRY][NEW]'
    || case when v_environment = 'production' then '' else '[STAGING]' end
    || ' ' || v_label;

  begin
    perform public.gellatti_enqueue_email_v1(
      p_idempotency_key := 'franchise-inquiry:' || v_id::text,
      p_subject_key := 'franchiseInquiryNew',
      p_subject := v_subject,
      p_recipient := 'info@gellatti.com',
      p_body_html :=
        '<p>Nowe zapytanie o Franchise.</p>'
        || '<p><b>' || public.gellatti_html_escape_v1(v_name) || '</b> · '
        || public.gellatti_html_escape_v1(v_concept)
        || coalesce(' · ' || public.gellatti_html_escape_v1(v_source), '') || '</p>'
        || '<p>' || public.gellatti_html_escape_v1(v_email) || '</p>'
        || '<p><a href="' || public.gellatti_html_escape_v1(v_admin_url) || '">Otwórz w panelu Admin</a></p>',
      p_body_text :=
        'Nowe zapytanie o Franchise.' || chr(10) || chr(10)
        || v_name || ' · ' || v_concept || coalesce(' · ' || v_source, '') || chr(10)
        || v_email || chr(10) || chr(10)
        || v_admin_url || chr(10),
      p_environment := v_environment,
      p_metadata := jsonb_build_object(
        'area', 'FRANCHISE',
        'event', 'inquiry_new',
        'entity_id', v_id::text,
        'source_route', v_source,
        'origin_matched', coalesce((v_app->>'matched')::boolean, false)
      ),
      p_max_attempts := 5
    );
  exception when others then
    raise warning 'franchise_inquiry_email_enqueue_failed for %: %', v_id, sqlerrm;
  end;

  perform public.gellatti_write_audit_v1(
    'franchise.inquiry_submitted', 'franchise_inquiries', v_id::text,
    jsonb_build_object('concept', v_concept, 'source_route', v_source), null, v_id::text, 'user',
    coalesce(auth.uid()::text, 'anonymous')
  );

  return jsonb_build_object('id', v_id, 'status', 'new');
end;
$function$;
