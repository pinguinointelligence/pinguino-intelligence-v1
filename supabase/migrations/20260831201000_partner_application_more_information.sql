-- ============================================================================
-- GELLATTI — WORK WITH US §6: the MORE INFORMATION NEEDED application state
-- ============================================================================
-- Owner spec §6 requires seven customer-visible statuses:
--   RECEIVED · UNDER REVIEW · MORE INFORMATION NEEDED · APPROVED · REJECTED ·
--   SUSPENDED · TERMINATED
-- The database had no state for "more information needed".
--
-- ── A LATENT BUG THIS ALSO FIXES ────────────────────────────────────────────
-- `gellatti_admin_partner_application_action_v1` already accepts a
-- `request_information` action, and writes `status = 'in_review'`. But
-- `'in_review'` is NOT in the partner_applications status CHECK constraint,
-- which allows only:
--   draft · submitted · under_review · approved · rejected · suspended · terminated
--
-- So today the admin "request more information" action fails with a check
-- constraint violation every time it is used. The value is written in three
-- places (the submit duplicate-guard, the decision UPDATE and its return
-- payload) and none of them can ever have worked. The guard clause
-- `if v_status in ('submitted','in_review','approved')` is likewise dead for
-- its middle term, because no row can hold that value.
--
-- This migration introduces the state properly as `more_information_needed`
-- and repoints all three sites at it. `in_review` is never added to the
-- constraint: it was a typo for a state that did not exist, not a state we
-- want.
--
-- Writes stay service-role/Edge mediated. No new grants.

-- ── 1. The new state ────────────────────────────────────────────────────────
alter table public.partner_applications
  drop constraint if exists partner_applications_status_check;

alter table public.partner_applications
  add constraint partner_applications_status_check
  check (status in (
    'draft',
    'submitted',
    'under_review',
    'more_information_needed',
    'approved',
    'rejected',
    'suspended',
    'terminated'
  ));

-- ── 2. An application awaiting information is still IN FLIGHT ───────────────
-- §6 forbids duplicate active applications. A partner who has been asked for
-- more information must complete THAT application, not file a second one.
drop index if exists public.partner_applications_open_uniq;
create unique index if not exists partner_applications_open_uniq
  on public.partner_applications (user_id)
  where status in ('draft', 'submitted', 'under_review', 'more_information_needed');

-- ── 3. Submit guard: treat the real states as in-flight ─────────────────────
create or replace function public.gellatti_submit_partner_application_v1(
  p_application jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_status text;
  v_clean jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;

  if coalesce(btrim(p_application->>'displayName'), '') = '' then
    raise exception 'partner_application_display_name_required';
  end if;
  if coalesce(btrim(p_application->>'primaryLink'), '') = '' then
    raise exception 'partner_application_link_required';
  end if;

  -- An already-active partner has nothing to apply for.
  if exists (select 1 from public.partners where user_id = v_user and status = 'active') then
    raise exception 'partner_already_active';
  end if;

  select id, status into v_id, v_status
  from public.partner_applications
  where user_id = v_user
  order by created_at desc
  limit 1;

  -- Was ('submitted','in_review','approved') — 'in_review' is not a legal
  -- status, so that term could never match. The real in-flight states are
  -- submitted and under_review; more_information_needed is deliberately NOT
  -- listed, because the applicant is expected to update that application (a
  -- resubmit re-opens the same lane rather than being refused as a duplicate).
  if v_status in ('submitted', 'under_review', 'approved') then
    return jsonb_build_object('id', v_id, 'status', v_status, 'duplicate', true);
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'displayName',   btrim(p_application->>'displayName'),
    'primaryLink',   btrim(p_application->>'primaryLink'),
    'otherLinks',    nullif(btrim(coalesce(p_application->>'otherLinks', '')), ''),
    'platforms',     coalesce(p_application->'platforms', '[]'::jsonb),
    'audience',      nullif(btrim(coalesce(p_application->>'audience', '')), ''),
    'country',       nullif(btrim(coalesce(p_application->>'country', '')), ''),
    'languages',     nullif(btrim(coalesce(p_application->>'languages', '')), ''),
    'description',   nullif(btrim(coalesce(p_application->>'description', '')), ''),
    'promotionPlan', nullif(btrim(coalesce(p_application->>'promotionPlan', '')), ''),
    'proposedCodes', coalesce(p_application->'proposedCodes', '[]'::jsonb),
    'proposedSlug',  nullif(btrim(coalesce(p_application->>'proposedSlug', '')), ''),
    'termsAccepted', coalesce((p_application->>'termsAccepted')::boolean, false)
  ));

  -- An application awaiting more information is UPDATED in place, so the
  -- reviewer keeps one thread and the open-application index stays satisfied.
  if v_status = 'more_information_needed' then
    update public.partner_applications
      set application_data = v_clean,
          status = 'submitted',
          submitted_at = statement_timestamp(),
          decision_reason = null,
          updated_at = statement_timestamp()
      where id = v_id;
    perform public.gellatti_write_audit_v1(
      'partner.application_resubmitted', 'partner_applications', v_id::text,
      jsonb_build_object('userId', v_user), null, v_id::text, 'customer', v_user::text
    );
    return jsonb_build_object('id', v_id, 'status', 'submitted', 'resubmitted', true);
  end if;

  insert into public.partner_applications(user_id, status, application_data, submitted_at)
    values (v_user, 'submitted', v_clean, statement_timestamp())
    returning id into v_id;

  perform public.gellatti_write_audit_v1(
    'partner.application_submitted', 'partner_applications', v_id::text,
    jsonb_build_object('userId', v_user), null, v_id::text, 'customer', v_user::text
  );

  return jsonb_build_object('id', v_id, 'status', 'submitted');
end;
$$;

grant execute on function public.gellatti_submit_partner_application_v1(jsonb) to authenticated;

-- ── 4. Decision: write the legal status ─────────────────────────────────────
-- Only the reject/request_information branch changes. The approve branch is
-- reproduced byte-for-byte from 20260829220000 (including its slug fix), because
-- `create or replace` has no partial form.
create or replace function public.gellatti_admin_partner_application_action_v1(
  p_application_id uuid,
  p_action text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_admin uuid := auth.uid();
  v_app public.partner_applications%rowtype;
  v_partner uuid;
  v_slug text;
  v_display text;
  v_code text;
  v_code_id uuid;
  v_suffix integer := 0;
  v_next_status text;
begin
  if not public.gellatti_admin_has_permission_v1('PARTNER', v_admin) then
    raise exception 'partner_administrator_required';
  end if;
  select * into v_app from public.partner_applications where id = p_application_id;
  if v_app.id is null then raise exception 'partner_application_not_found'; end if;
  if p_action not in ('approve', 'reject', 'request_information') then
    raise exception 'unsupported_partner_application_action';
  end if;

  if p_action = 'reject' or p_action = 'request_information' then
    -- Was 'in_review', which the status CHECK rejects, so this action could
    -- never succeed. The legal state is more_information_needed.
    v_next_status := case when p_action = 'reject' then 'rejected' else 'more_information_needed' end;

    update public.partner_applications
      set status = v_next_status,
          reviewed_at = statement_timestamp(),
          reviewed_by = v_admin::text,
          decision_reason = p_reason,
          updated_at = statement_timestamp()
      where id = v_app.id;
    insert into public.user_notifications(
      recipient_user_id, notification_type, entity_type, entity_id, title, body, deep_link, dedupe_key
    ) values (
      v_app.user_id,
      case when p_action = 'reject' then 'PARTNER_APPLICATION_REJECTED'
           else 'PARTNER_APPLICATION_INFORMATION_REQUESTED' end,
      'partner_applications', v_app.id::text,
      case when p_action = 'reject' then 'Zgłoszenie partnerskie rozpatrzone'
           else 'Potrzebujemy więcej informacji' end,
      coalesce(p_reason, case when p_action = 'reject'
        then 'Tym razem nie rozpoczynamy współpracy.'
        else 'Uzupełnij zgłoszenie, aby kontynuować.' end),
      '/work-with-us',
      'partner-application:' || p_action || ':' || v_app.id::text
        || ':' || extract(epoch from statement_timestamp())::bigint::text
    ) on conflict (dedupe_key) do nothing;
    perform public.gellatti_write_audit_v1(
      'partner.application_' || p_action, 'partner_applications', v_app.id::text,
      jsonb_build_object('userId', v_app.user_id), p_reason, v_app.id::text, 'admin', v_admin::text
    );
    return jsonb_build_object('id', v_app.id, 'status', v_next_status);
  end if;

  v_display := coalesce(nullif(btrim(v_app.application_data->>'displayName'), ''), 'Partner Gellatti');
  -- Lowercase FIRST: `[^a-z0-9]` also matches uppercase letters, so running the
  -- class over the original casing eats the capitals themselves.
  v_slug := regexp_replace(
    lower(coalesce(nullif(btrim(v_app.application_data->>'proposedSlug'), ''), v_display)),
    '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  if length(v_slug) < 3 then v_slug := 'partner-' || left(replace(v_app.id::text, '-', ''), 8); end if;
  v_slug := left(v_slug, 40);
  while exists (
    select 1 from public.partner_public_profiles pp
    where pp.slug = v_slug and pp.partner_id is distinct from (
      select id from public.partners where user_id = v_app.user_id
    )
  ) or v_slug in (
    'admin','api','login','logout','home','pro','partner','products','recipes',
    'settings','account','auth','pricing','community','gellatti','pinguino'
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := left(btrim(v_slug, '-'), 36) || '-' || v_suffix::text;
    if v_suffix > 50 then raise exception 'invalid_partner_slug'; end if;
  end loop;

  select id into v_partner from public.partners where user_id = v_app.user_id;
  if v_partner is null then
    insert into public.partners(user_id, application_id, status)
      values (v_app.user_id, v_app.id, 'active') returning id into v_partner;
  else
    update public.partners set status = 'active', application_id = v_app.id,
      updated_at = statement_timestamp() where id = v_partner;
  end if;

  insert into public.partner_public_profiles(partner_id, slug, display_name, updated_by_user_id)
    values (v_partner, v_slug, v_display, v_admin)
    on conflict (partner_id) do update set slug = excluded.slug,
      display_name = excluded.display_name, moderation_status = 'APPROVED',
      updated_by_user_id = v_admin;

  insert into public.entitlements(user_id, scope, source_type, source_id, granted_by, metadata)
    select v_app.user_id, s.scope, 'approved_partner', v_partner, v_admin::text,
           jsonb_build_object('partnerId', v_partner, 'applicationId', v_app.id)
    from (values ('home'), ('pro'), ('partner')) s(scope)
    on conflict do nothing;

  select id, code into v_code_id, v_code
    from public.partner_codes where partner_id = v_partner and status = 'active' limit 1;
  if v_code_id is null then
    v_code := upper(left(regexp_replace(v_slug, '[^a-z0-9]', '', 'g'), 10));
    if length(v_code) < 4 then v_code := 'GEL' || upper(left(replace(v_partner::text,'-',''), 5)); end if;
    v_suffix := 0;
    while exists (select 1 from public.partner_codes where code = v_code) loop
      v_suffix := v_suffix + 1;
      v_code := left(v_code, 8) || v_suffix::text;
      if v_suffix > 99 then raise exception 'partner_code_unavailable'; end if;
    end loop;
    insert into public.partner_codes(partner_id, code, slug, status, internal_label)
      values (v_partner, v_code, v_slug, 'active', 'Pierwszy kod partnera')
      returning id into v_code_id;
  end if;

  update public.partner_applications
    set status = 'approved', reviewed_at = statement_timestamp(),
        reviewed_by = v_admin::text, decision_reason = p_reason,
        updated_at = statement_timestamp()
    where id = v_app.id;

  insert into public.user_notifications(
    recipient_user_id, notification_type, entity_type, entity_id, title, body, deep_link, dedupe_key
  ) values (
    v_app.user_id, 'PARTNER_ACTIVATED', 'partners', v_partner::text,
    'Tryb Partner jest aktywny',
    'Twój kod ' || v_code || ' i link partnerski są gotowe w panelu Partner.',
    '/partner', 'partner:activated:' || v_partner::text
  ) on conflict (dedupe_key) do nothing;

  perform public.gellatti_write_audit_v1(
    'partner.application_approved', 'partners', v_partner::text,
    jsonb_build_object('userId', v_app.user_id, 'slug', v_slug, 'code', v_code,
                       'applicationId', v_app.id),
    p_reason, v_partner::text, 'admin', v_admin::text
  );

  return jsonb_build_object(
    'id', v_app.id, 'status', 'approved', 'partnerId', v_partner,
    'slug', v_slug, 'code', v_code
  );
end;
$$;

grant execute on function public.gellatti_admin_partner_application_action_v1(uuid, text, text) to authenticated;

-- ============================================================================
-- ROLLBACK (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- Reverting re-breaks the "request more information" admin action, so only do
-- so knowingly. Any row already holding 'more_information_needed' must be moved
-- to 'under_review' BEFORE the constraint is narrowed, or the ALTER will fail.
--   update public.partner_applications set status = 'under_review'
--     where status = 'more_information_needed';
--   alter table public.partner_applications drop constraint partner_applications_status_check;
--   alter table public.partner_applications add constraint partner_applications_status_check
--     check (status in ('draft','submitted','under_review','approved','rejected','suspended','terminated'));
-- ============================================================================
