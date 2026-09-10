-- ============================================================================
-- P-LEAD-06 — a Franchise enquiry notifies Admin by email, not only in-app
-- ============================================================================
-- The enquiry already wrote a `user_notifications` row (admin_permission
-- SUPPORT, deep-linked to /admin/franchise), so an operator who opens the app
-- sees it. Nobody was told when the app is closed. This adds the mail.
--
-- EVERYTHING IT USES ALREADY EXISTED — nothing new is invented:
--   * `gellatti_enqueue_email_v1` is the canonical enqueue. It owns idempotency
--     (`on conflict (idempotency_key) do nothing`), normalises the recipient and
--     sets next_attempt_at, so this does not become a second, slightly
--     different way to create a Gellatti email.
--   * `FRANCHISE` is already in the closed `metadata.area` vocabulary that
--     email_jobs enforces.
--   * `franchiseInquiryNew` is already in the TS subject taxonomy
--     (src/notifications/domain/emailSubject.ts) and already renders
--     `[GELLATTI][FRANCHISE][INQUIRY][NEW]`; the subject below is that exact
--     shape rather than a new phrasing.
--
-- TWO TRAPS THE SHOP ENQUEUE DOCUMENTS, BOTH AVOIDED HERE: `environment` is NOT
-- NULL and `metadata.area` is closed. Omit either and the row is silently
-- refused, leaving a real enquiry with no mail.
--
-- WHY environment IS DERIVED FROM AN ORIGIN, NOT ASSUMED:
--   Staging and production share ONE Supabase project (A-DEF-02), so the
--   database genuinely cannot tell which app is calling it. The caller passes
--   its own origin and the CLASSIFICATION RULE lives here rather than in the
--   client, so a client cannot simply declare itself production. The label is
--   cosmetic — it only prefixes the subject for non-production — and an unknown
--   or missing origin falls back to 'staging', which is the safe direction: a
--   production mail mislabelled as staging is noise, a staging mail
--   mislabelled as production hides a test in a real inbox.
--
-- THE MAIL MUST NOT BE ABLE TO LOSE THE ENQUIRY. The enqueue is wrapped so that
-- a failure to queue can never roll back the inquiry row: the customer's
-- submission is the product event, the email is a notification about it. A gap
-- is visible to Admin in email_jobs; a lost lead is not recoverable.

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
  v_origin text := btrim(coalesce(p_inquiry->>'origin', ''));
  v_environment text;
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

  -- The lead queue lives at /admin/franchise; sending the operator to
  -- /admin/operations made them hunt for it.
  insert into public.user_notifications(
    admin_permission, notification_type, entity_type, entity_id, title, body, deep_link, dedupe_key
  ) values (
    'SUPPORT', 'FRANCHISE_INQUIRY_SUBMITTED', 'franchise_inquiries', v_id::text,
    'Nowe zapytanie o Franchise',
    v_name || ' · ' || v_concept || coalesce(' · ' || v_source, ''),
    '/admin/franchise', 'franchise-inquiry:' || v_id::text
  ) on conflict (dedupe_key) do nothing;

  -- P-LEAD-06: tell Admin by mail as well, through the canonical enqueue.
  v_environment := case
    when v_origin ilike '%gellatti.com%' then 'production'
    else 'staging'
  end;
  v_admin_url := case
    when v_environment = 'production' then 'https://www.gellatti.com/admin/franchise'
    else 'https://staging.pinguinoai.com/admin/franchise'
  end;
  v_subject := '[GELLATTI][FRANCHISE][INQUIRY][NEW]'
    || case when v_environment = 'production' then '' else '[STAGING]' end
    || ' ' || v_name || ' · ' || v_concept;

  begin
    perform public.gellatti_enqueue_email_v1(
      p_idempotency_key := 'franchise-inquiry:' || v_id::text,
      p_subject_key := 'franchiseInquiryNew',
      p_subject := v_subject,
      p_recipient := 'info@gellatti.com',
      p_body_html :=
        '<p>Nowe zapytanie o Franchise.</p>'
        || '<p><b>' || v_name || '</b> · ' || v_concept
        || coalesce(' · ' || v_source, '') || '</p>'
        || '<p>' || v_email || '</p>'
        || '<p><a href="' || v_admin_url || '">Otwórz w panelu Admin</a></p>',
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
        'source_route', v_source
      ),
      p_max_attempts := 5
    );
  exception when others then
    -- A queue failure must never destroy a real lead. The inquiry row and the
    -- in-app notification both stand; the missing mail is visible as an absent
    -- email_jobs row for this inquiry id.
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
