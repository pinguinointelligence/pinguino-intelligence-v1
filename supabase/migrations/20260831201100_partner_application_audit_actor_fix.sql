-- ============================================================================
-- GELLATTI — REGRESSION FIX: partner application submission is broken
-- ============================================================================
-- PROPOSED — NOT APPLIED. Prepared for owner approval per the standing rule:
-- unexpected live result -> stop -> diagnose -> propose -> report -> wait.
--
-- ── WHAT I BROKE ────────────────────────────────────────────────────────────
-- `20260831201000_partner_application_more_information.sql`, applied as
-- registered version 20260831154203, re-declared
-- `gellatti_submit_partner_application_v1` and changed the audit actor_type it
-- passes from `'user'` to `'customer'`.
--
-- `audit_log_actor_type_check` allows only:
--     system · admin · user · webhook
--
-- `'customer'` is not in that set, so every call to the submit function now
-- fails on the audit write. BOTH branches are affected, because both call the
-- audit helper with the same wrong value:
--
--   * a brand-new application  (line ~136 of the applied body)
--   * a resubmit after MORE INFORMATION NEEDED (line ~125)
--
-- Proven live on staging, rolled back:
--
--   NEW_SUBMISSION = BROKEN
--     new row for relation "audit_log" violates check constraint
--     "audit_log_actor_type_check"
--   resubmit       = BROKEN, same constraint
--   ADMIN_ACTION   = more_information_needed (works — it passes 'admin')
--
-- So **partner application submission is currently broken on staging**, and it
-- is broken by this workstream, not by anything pre-existing. The original
-- `20260829190000_partner_application_lane` passed `'user'` and was correct.
--
-- ── WHY THE PRE-APPLY CHECKS MISSED IT ──────────────────────────────────────
-- Before applying 201000 I diffed the APPROVE branch against the live function
-- line by line, because that branch is reproduced wholesale and a silent revert
-- there would be expensive. I did not apply the same scrutiny to the SUBMIT
-- function, which I had also rewritten — and that is where the regression was.
-- Checking the part I had reasoned about, rather than the part I had changed.
--
-- The permanent guard is auditActorTypes.test.ts, which now parses every
-- gellatti_write_audit_v1 call in this workstream's migrations and fails on any
-- actor_type outside the CHECK constraint's set. It fails against the applied
-- 201000 body until this migration lands, which is the correct signal.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- Restore `'user'`. Nothing else changes: this is the body applied as
-- 20260831154203 with the two literals corrected, since `create or replace`
-- has no partial form.

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
    -- 'user', NOT 'customer': audit_log_actor_type_check allows only
    -- system | admin | user | webhook.
    perform public.gellatti_write_audit_v1(
      'partner.application_resubmitted', 'partner_applications', v_id::text,
      jsonb_build_object('userId', v_user), null, v_id::text, 'user', v_user::text
    );
    return jsonb_build_object('id', v_id, 'status', 'submitted', 'resubmitted', true);
  end if;

  insert into public.partner_applications(user_id, status, application_data, submitted_at)
    values (v_user, 'submitted', v_clean, statement_timestamp())
    returning id into v_id;

  -- 'user', NOT 'customer' — same constraint.
  perform public.gellatti_write_audit_v1(
    'partner.application_submitted', 'partner_applications', v_id::text,
    jsonb_build_object('userId', v_user), null, v_id::text, 'user', v_user::text
  );

  return jsonb_build_object('id', v_id, 'status', 'submitted');
end;
$$;

-- Grant surface unchanged from 20260831201000, restated because `create or
-- replace` resets nothing but the body and it costs nothing to be explicit.
revoke all on function public.gellatti_submit_partner_application_v1(jsonb)
  from public, anon;
grant execute on function public.gellatti_submit_partner_application_v1(jsonb) to authenticated;

-- ============================================================================
-- ROLLBACK: re-apply the 20260831201000 body, which passes 'customer' and
-- therefore breaks every partner application submission. There is no reason to
-- do this.
-- ============================================================================
