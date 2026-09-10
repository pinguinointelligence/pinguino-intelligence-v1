-- ============================================================================
-- ROLLBACK for 20260910180000_partner_application_lifecycle_email
-- ============================================================================
-- Reverses the C-APP-08 lifecycle mail exactly, and nothing else.
--
-- SAFE TO RUN AT ANY TIME. It removes a notification path; it touches no
-- application row, no partner, and no decision. Mail already queued keeps its
-- own lifecycle in email_jobs — this does not retract sent or pending mail,
-- deliberately: cancelling a message that has already left is not something a
-- schema rollback should decide.
--
-- WHAT IT DOES
--   1. drops the trigger, so no further application transition enqueues mail
--   2. drops the trigger function
--   3. restores gellatti_submit_partner_application_v1 to its 20260910160000
--      form — i.e. WITHOUT the `origin` key, and WITH the note/consent/
--      audienceSize fixes retained
--
-- WHAT IT DOES NOT DO
--   It does not restore the answer-dropping behaviour that 20260910160000
--   fixed. Rolling back this migration must not silently reintroduce a
--   different, older bug.

drop trigger if exists partner_application_lifecycle_email on public.partner_applications;
drop function if exists public.gellatti_partner_application_email_v1();

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

  if exists (select 1 from public.partners where user_id = v_user and status = 'active') then
    raise exception 'partner_already_active';
  end if;

  select id, status into v_id, v_status
  from public.partner_applications
  where user_id = v_user
  order by created_at desc
  limit 1;

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
    'description',   nullif(btrim(coalesce(p_application->>'description',
                                           p_application->>'note', '')), ''),
    'promotionPlan', nullif(btrim(coalesce(p_application->>'promotionPlan', '')), ''),
    'proposedCodes', coalesce(p_application->'proposedCodes', '[]'::jsonb),
    'proposedSlug',  nullif(btrim(coalesce(p_application->>'proposedSlug', '')), ''),
    'termsAccepted', coalesce((p_application->>'termsAccepted')::boolean,
                              (p_application->>'consent')::boolean, false)
  ));

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
