-- ============================================================================
-- C-APP-08 — the application lifecycle tells the applicant by email
-- ============================================================================
-- STATUS: READY / WAITING OWNER DB APPROVAL — NOT APPLIED.
-- Staging and production share ONE Supabase project (A-DEF-02), so applying
-- this changes production's database. It is written, reversible and tested,
-- and waits for an explicit decision.
--
-- WHAT EXISTS ALREADY, AND IS REUSED RATHER THAN REBUILT:
--   * `gellatti_enqueue_email_v1` — the canonical enqueue. It owns idempotency
--     (`on conflict (idempotency_key) do nothing`), normalises the recipient and
--     sets next_attempt_at. No second mailer is introduced.
--   * the subject taxonomy in src/notifications/domain/emailSubject.ts already
--     contains every subject this needs, and NONE of them has ever been used:
--       partnerApplicationNew            → received
--       partnerApplicationMoreInfo       → more information requested
--       partnerApplicationApproved       → approved
--       partnerApplicationRejected       → rejected
--       partnerConnectActionRequired     → payout setup required
--   * `PARTNER` is already in the closed `metadata.area` vocabulary email_jobs
--     enforces.
--
-- WHY A TRIGGER RATHER THAN EDITING THE TWO RPCs:
--   The status is written from two places today (the submit RPC and the admin
--   action RPC) and could be written from a third tomorrow. Putting the mail on
--   the TRANSITION means every writer is covered, and neither large RPC has to
--   be reproduced here — reproducing them is how a subtle difference gets
--   introduced into a function nobody meant to change.
--
-- STATUSES DELIBERATELY NOT MAILED: draft, under_review, suspended, terminated.
--   The checklist row names five emails and the taxonomy has exactly those five
--   subjects. Sending for suspended/terminated would mean inventing a subject,
--   which the taxonomy is closed against on purpose. They are listed here so the
--   omission is a decision on the record rather than an oversight.
--
-- IDEMPOTENCY: the key carries the row's own `updated_at`, not now(). A replay
--   of the SAME transition collides and is suppressed; a genuine second visit to
--   the same status — request info, resubmit, request info again — is a
--   different transition and does send. Using now() would double-send on replay;
--   using status alone would silence the second, real request.
--
-- THE MAIL MUST NOT BE ABLE TO LOSE THE DECISION. The enqueue is wrapped, so a
--   queue failure cannot roll back an approval or a rejection. A missing mail is
--   visible as an absent email_jobs row; a lost decision is not recoverable.

create or replace function public.gellatti_partner_application_email_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_email text;
  v_name text := coalesce(nullif(btrim(new.application_data->>'displayName'), ''), 'Partnerze');
  v_origin text := coalesce(new.application_data->>'origin', '');
  v_environment text;
  v_app_url text;
  v_subject_key text;
  v_subject_tail text;
  v_body_lead text;
  v_body_action text;
  v_stamp text := extract(epoch from coalesce(new.updated_at, new.created_at))::bigint::text;
  v_partner_has_connect boolean;
begin
  -- Only act on a transition INTO a mailable status.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'submitted' then
      v_subject_key := 'partnerApplicationNew';
      v_subject_tail := 'Zgłoszenie przyjęte';
      v_body_lead := 'Twoje zgłoszenie do programu Gellatti Affiliate dotarło.';
      v_body_action := 'Odezwiemy się z decyzją. Nie musisz nic teraz robić.';
    when 'more_information_needed' then
      v_subject_key := 'partnerApplicationMoreInfo';
      v_subject_tail := 'Potrzebujemy więcej informacji';
      v_body_lead := 'Potrzebujemy jeszcze kilku informacji do Twojego zgłoszenia.';
      v_body_action := coalesce(nullif(btrim(new.decision_reason), ''),
                                'Uzupełnij zgłoszenie w panelu, aby kontynuować.');
    when 'approved' then
      v_subject_key := 'partnerApplicationApproved';
      v_subject_tail := 'Zgłoszenie zatwierdzone';
      v_body_lead := 'Tryb Affiliate jest aktywny na Twoim koncie.';
      v_body_action := 'Twój kod i link czekają w panelu.';
    when 'rejected' then
      v_subject_key := 'partnerApplicationRejected';
      v_subject_tail := 'Decyzja w sprawie zgłoszenia';
      v_body_lead := 'Tym razem nie rozpoczynamy współpracy.';
      v_body_action := coalesce(nullif(btrim(new.decision_reason), ''),
                                'Możesz wysłać nowe zgłoszenie później.');
    else
      -- draft / under_review / suspended / terminated: no subject exists in the
      -- closed taxonomy, and inventing one is what the taxonomy prevents.
      return new;
  end case;

  select u.email into v_email from auth.users u where u.id = new.user_id;
  if v_email is null or btrim(v_email) = '' then
    raise warning 'partner_application_email_skipped_no_recipient for %', new.id;
    return new;
  end if;

  -- Staging and production share one database, so the environment can only come
  -- from the origin the app recorded at submit time. Unknown falls back to
  -- staging: a production mail labelled staging is noise, a staging mail
  -- labelled production hides a test in a real inbox.
  v_environment := case when v_origin ilike '%gellatti.com%' then 'production' else 'staging' end;
  v_app_url := case
    when v_environment = 'production' then 'https://www.gellatti.com/partner'
    else 'https://staging.pinguinoai.com/partner'
  end;

  begin
    perform public.gellatti_enqueue_email_v1(
      p_idempotency_key := 'partner-application:' || new.id::text || ':' || new.status || ':' || v_stamp,
      p_subject_key := v_subject_key,
      p_subject := '[GELLATTI][PARTNER][APPLICATION]'
        || case when v_environment = 'production' then '' else '[STAGING]' end
        || ' ' || v_subject_tail,
      p_recipient := v_email,
      p_body_html := '<p>' || v_body_lead || '</p><p>' || v_body_action || '</p>'
        || '<p><a href="' || v_app_url || '">Otwórz panel Affiliate</a></p>',
      p_body_text := v_body_lead || chr(10) || chr(10) || v_body_action || chr(10) || chr(10)
        || v_app_url || chr(10),
      p_environment := v_environment,
      p_metadata := jsonb_build_object(
        'area', 'PARTNER', 'event', 'application_' || new.status,
        'entity_id', new.id::text
      ),
      p_max_attempts := 5
    );
  exception when others then
    raise warning 'partner_application_email_enqueue_failed for % (%): %', new.id, new.status, sqlerrm;
  end;

  -- "Payout setup required" is a SECOND, different message and only makes sense
  -- at approval: an approved partner with no Connect account cannot be paid, and
  -- that is the moment they can act on it.
  if new.status = 'approved' then
    select (p.stripe_connect_account_id is not null) into v_partner_has_connect
    from public.partners p where p.user_id = new.user_id;

    if coalesce(v_partner_has_connect, false) = false then
      begin
        perform public.gellatti_enqueue_email_v1(
          p_idempotency_key := 'partner-connect-required:' || new.id::text || ':' || v_stamp,
          p_subject_key := 'partnerConnectActionRequired',
          p_subject := '[GELLATTI][PARTNER][CONNECT][ACTION-REQUIRED]'
            || case when v_environment = 'production' then '' else '[STAGING]' end
            || ' Dokończ konfigurację wypłat',
          p_recipient := v_email,
          p_body_html := '<p>Zanim wypłacimy wynagrodzenie, potrzebujemy danych do wypłat.</p>'
            || '<p><a href="' || v_app_url || '">Dokończ konfigurację</a></p>',
          p_body_text := 'Zanim wypłacimy wynagrodzenie, potrzebujemy danych do wypłat.'
            || chr(10) || chr(10) || v_app_url || chr(10),
          p_environment := v_environment,
          p_metadata := jsonb_build_object(
            'area', 'PARTNER', 'event', 'connect_action_required',
            'entity_id', new.id::text
          ),
          p_max_attempts := 5
        );
      exception when others then
        raise warning 'partner_connect_email_enqueue_failed for %: %', new.id, sqlerrm;
      end;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists partner_application_lifecycle_email on public.partner_applications;
create trigger partner_application_lifecycle_email
  after insert or update of status on public.partner_applications
  for each row execute function public.gellatti_partner_application_email_v1();

-- The submit writer must record the origin, because the trigger has no other
-- way to know which app produced the application. Same allow-list shape as
-- 20260910044111; only the one key is added.
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
                              (p_application->>'consent')::boolean, false),
    -- Recorded so the lifecycle trigger can label mail with the app it came
    -- from. Never trusted as a claim: the classification rule lives server-side.
    'origin',        nullif(btrim(coalesce(p_application->>'origin', '')), '')
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
