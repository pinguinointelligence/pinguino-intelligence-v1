-- ============================================================================
-- The application writer silently dropped three answers
-- ============================================================================
-- `v_clean` is an explicit ALLOW-LIST built with jsonb_build_object, so any key
-- the form sends that is not named in it is discarded with no error anywhere.
-- Three answers were being lost:
--
--   note          the free-text "Co chcesz robić z Gellatti" — the richest
--                 answer on the form, and the one a reviewer most wants. Never
--                 persisted. Pre-existing, not introduced by C-APP-02.
--   consent       the form sends `consent`; this writer only knew
--                 `termsAccepted`, so the consent a person actually gave was
--                 thrown away and every stored application looked unconsented.
--                 Introduced by C-APP-02, which added the checkbox without
--                 checking what the writer accepts.
--   audienceSize  added to the form for C-APP-02 and never named here.
--
-- Nothing surfaced this: the RPC returns success, the row is created, and the
-- missing keys are simply absent from a jsonb column that has no shape. The
-- lockstep test added alongside this migration is what makes it visible.
--
-- Both spellings of consent are accepted so that a client deployed before this
-- migration cannot lose it during the rollout, and `note` maps onto the
-- canonical `description` key this writer already defined rather than inventing
-- a fourth name for the same answer.

create or replace function public.gellatti_submit_partner_application_v1(p_application jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
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

  -- The real in-flight states are submitted and under_review;
  -- more_information_needed is deliberately NOT listed, because the applicant is
  -- expected to update that application.
  if v_status in ('submitted', 'under_review', 'approved') then
    return jsonb_build_object('id', v_id, 'status', v_status, 'duplicate', true);
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'displayName',   btrim(p_application->>'displayName'),
    'primaryLink',   btrim(p_application->>'primaryLink'),
    'otherLinks',    nullif(btrim(coalesce(p_application->>'otherLinks', '')), ''),
    'platforms',     coalesce(p_application->'platforms', '[]'::jsonb),
    'audience',      nullif(btrim(coalesce(p_application->>'audience', '')), ''),
    'audienceSize',  nullif(btrim(coalesce(p_application->>'audienceSize', '')), ''),
    'country',       nullif(btrim(coalesce(p_application->>'country', '')), ''),
    'languages',     nullif(btrim(coalesce(p_application->>'languages', '')), ''),
    -- The form's one free-text answer arrives as `note`; `description` is this
    -- writer's canonical name for it. Either spelling is accepted so the answer
    -- cannot be lost by which client happened to send it.
    'description',   nullif(btrim(coalesce(p_application->>'description',
                                           p_application->>'note', '')), ''),
    'promotionPlan', nullif(btrim(coalesce(p_application->>'promotionPlan', '')), ''),
    'proposedCodes', coalesce(p_application->'proposedCodes', '[]'::jsonb),
    'proposedSlug',  nullif(btrim(coalesce(p_application->>'proposedSlug', '')), ''),
    'termsAccepted', coalesce((p_application->>'termsAccepted')::boolean,
                              (p_application->>'consent')::boolean, false)
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
      jsonb_build_object('userId', v_user), null, v_id::text, 'user', v_user::text
    );
    return jsonb_build_object('id', v_id, 'status', 'submitted', 'resubmitted', true);
  end if;

  insert into public.partner_applications(user_id, status, application_data, submitted_at)
    values (v_user, 'submitted', v_clean, statement_timestamp())
    returning id into v_id;

  perform public.gellatti_write_audit_v1(
    'partner.application_submitted', 'partner_applications', v_id::text,
    jsonb_build_object('userId', v_user), null, v_id::text, 'user', v_user::text
  );

  return jsonb_build_object('id', v_id, 'status', 'submitted');
end;
$function$;
