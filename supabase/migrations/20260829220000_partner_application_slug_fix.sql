-- GELLATTI — record the partner slug fix in migration history.
--
-- `gellatti_admin_partner_application_action_v1` derived the partner's public
-- slug with `lower(regexp_replace(displayName, '[^a-z0-9]+', '-', 'g'))`. The
-- character class also matches UPPERCASE letters, so running it before
-- `lower()` ate the capitals themselves: "Marysia Lody" became "arysia-ody",
-- and that mangled string became the partner's public address and the seed for
-- their attribution code.
--
-- The fix (lowercase first) was applied directly to staging as soon as it was
-- found, so the live function is already correct; this migration exists so the
-- recorded history matches reality. It is a no-op on an environment that
-- already has the corrected body.
--
-- The full function is re-declared rather than patched, because a
-- `create or replace` is the only honest unit here: there is no partial form.

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
    update public.partner_applications
      set status = case when p_action = 'reject' then 'rejected' else 'in_review' end,
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
    return jsonb_build_object('id', v_app.id, 'status',
      case when p_action = 'reject' then 'rejected' else 'in_review' end);
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
