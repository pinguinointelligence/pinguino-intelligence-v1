-- ============================================================================
-- C-APP-08 — the partner lifecycle tells the person by email
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
--   * the subject taxonomy in src/notifications/domain/emailSubject.ts:
--       partnerApplicationNew            → received
--       partnerApplicationMoreInfo       → more information requested
--       partnerApplicationApproved       → approved
--       partnerApplicationRejected       → rejected
--       partnerActivated                 → Partner mode switched on without an
--                                          application (added with this rework)
--   * `PARTNER` is already in the closed `metadata.area` vocabulary email_jobs
--     enforces.
--   * 20260910175900_mail_origin_and_escaping.sql: the closed `app_origins` map,
--     the exact request-origin resolver and the HTML escape helper.
--
-- DEPENDS ON 20260910175900_mail_origin_and_escaping.sql (refuses without it).
--
-- WHY TRIGGERS RATHER THAN EDITING THE RPCs:
--   The status is written from four places today (submit, admin decision, admin
--   activation, invitation acceptance) and could be written from a fifth
--   tomorrow. Putting the stamp and the mail on the ROW means every writer is
--   covered, and none of those RPCs has to be reproduced here — reproducing
--   them is how a subtle difference gets introduced into a function nobody
--   meant to change.
--
-- STATUSES DELIBERATELY NOT MAILED: draft, under_review, suspended, terminated.
--   Sending for them would mean inventing a subject, which the taxonomy is
--   closed against on purpose. They are listed here so the omission is a
--   decision on the record rather than an oversight.
--
-- IDEMPOTENCY: the key carries the row's own `updated_at`, not now(). A replay
--   of the SAME transition collides and is suppressed; a genuine second visit to
--   the same status — request info, resubmit, request info again — is a
--   different transition and does send. Using now() would double-send on replay;
--   using status alone would silence the second, real request.
--
-- CORRECTED 2026-09-17 (review before approval), still NOT APPLIED:
--   * The recipient is the person, so every subject is a plain Polish sentence
--     (ES7); a non-production send is marked `[STAGING] ` exactly as
--     `buildCustomerSubject` renders it (ES4). The subject_key keeps the
--     taxonomy for filtering and metadata.
--   * The signed-in area is named Partner (owner decision C-APP-13).
--
-- REWORKED 2026-09-17 (owner decisions, Growth QA), still NOT APPLIED:
--   * THE ENVIRONMENT IS DECIDED ON THE SERVER. The earlier draft labelled mail
--     from `application_data.origin`, a value the app wrote into the request
--     BODY, classified with `ilike '%gellatti.com%'`. On the isolated QA branch
--     'https://gellatti.com.attacker.example' produced a production-labelled
--     mail with production links. Now:
--       - the HTTP Origin header PostgREST received (`request.headers`) is
--         matched EXACTLY against `public.app_origins` by
--         gellatti_request_app_origin_v1(); nothing in the body is read, and the
--         submit RPC is no longer redefined here;
--       - every link is built from the map's `base_url`, never from the request;
--       - an absent or unknown origin is never production.
--     The environment is stamped on the row by the request that CREATED it (the
--     applicant's submit, the admin's activation, the invitee's acceptance),
--     refreshed when the applicant resubmits, and kept when an admin decides:
--     the applicant's mail follows the applicant's app, not the admin's.
--   * NO PAYOUT-SETUP MAIL. The Partner does not configure payouts, so
--     "Dokończ konfigurację wypłat" (partnerConnectActionRequired) is no longer
--     sent from here.
--   * An admin's reason reaches the mail as text, never as markup
--     (gellatti_html_escape_v1).
--   * A MAIL SAYS WHAT HAPPENED. Admin activation and invitation acceptance
--     insert the row already 'approved'; nobody applied, so they receive
--     partnerActivated ("Tryb Partner jest aktywny"), never "Zgłoszenie
--     zatwierdzone". "Zgłoszenie przyjęte" goes only to the person who submitted
--     the application themselves — no invitee, admin or service write can
--     produce it.
--
-- THE MAIL MUST NOT BE ABLE TO LOSE THE DECISION. The enqueue is wrapped, so a
--   queue failure cannot roll back an approval or a rejection. A missing mail is
--   visible as an absent email_jobs row; a lost decision is not recoverable.

do $dependency$
begin
  if to_regprocedure('public.gellatti_request_app_origin_v1()') is null
     or to_regprocedure('public.gellatti_html_escape_v1(text)') is null
     or to_regclass('public.app_origins') is null then
    raise exception 'apply 20260910175900_mail_origin_and_escaping.sql first';
  end if;
end $dependency$;

-- ── The environment stamp on the application row ─────────────────────────────
alter table public.partner_applications
  add column if not exists app_environment text,
  add column if not exists app_origin_matched boolean;

alter table public.partner_applications
  drop constraint if exists partner_applications_app_environment_check;
alter table public.partner_applications
  add constraint partner_applications_app_environment_check
  check (app_environment is null or app_environment in ('production', 'staging'));

create or replace function public.gellatti_partner_application_stamp_app_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_app jsonb;
begin
  if tg_op = 'UPDATE'
     and not (new.status = 'submitted'
              and old.status is distinct from 'submitted'
              and auth.uid() is not distinct from new.user_id) then
    -- An admin decision, or any other write, keeps the applicant's environment.
    new.app_environment := old.app_environment;
    new.app_origin_matched := old.app_origin_matched;
    return new;
  end if;

  -- The request that creates the row decides, whatever a writer passed; so does
  -- the applicant resubmitting from the app they use now. A resolver failure must
  -- not refuse the application: it is stamped staging, the safe direction.
  begin
    v_app := public.gellatti_request_app_origin_v1();
  exception when others then
    v_app := null;
  end;
  new.app_environment := coalesce(v_app->>'environment', 'staging');
  new.app_origin_matched := coalesce((v_app->>'matched')::boolean, false);
  return new;
end;
$function$;

drop trigger if exists partner_application_stamp_app on public.partner_applications;
create trigger partner_application_stamp_app
  before insert or update on public.partner_applications
  for each row execute function public.gellatti_partner_application_stamp_app_v1();

-- ── The mail ─────────────────────────────────────────────────────────────────
create or replace function public.gellatti_partner_application_email_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_email text;
  v_environment text;
  v_environment_source text;
  v_base_url text;
  v_app_url text;
  v_subject_key text;
  v_subject_tail text;
  v_body_lead text;
  v_body_action text;
  v_event text;
  v_stamp text := extract(epoch from coalesce(new.updated_at, new.created_at))::bigint::text;
begin
  -- Only act on a transition INTO a mailable status.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'approved' then
    -- Admin activation and invitation acceptance create the row already
    -- approved. Nobody applied, so the mail must not speak of an application.
    v_subject_key := 'partnerActivated';
    v_event := 'partner_activated';
    v_subject_tail := 'Tryb Partner jest aktywny';
    v_body_lead := 'Tryb Partner jest aktywny na Twoim koncie.';
    v_body_action := 'Twój kod i link czekają w panelu.';
  else
    case new.status
      when 'submitted' then
        -- "Received" only to the person who sent it.
        if auth.uid() is distinct from new.user_id then
          raise warning 'partner_application_email_skipped_not_submitted_by_applicant for %', new.id;
          return new;
        end if;
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
        v_body_lead := 'Tryb Partner jest aktywny na Twoim koncie.';
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
    v_event := 'application_' || new.status;
  end if;

  select u.email into v_email from auth.users u where u.id = new.user_id;
  if v_email is null or btrim(v_email) = '' then
    raise warning 'partner_application_email_skipped_no_recipient for %', new.id;
    return new;
  end if;

  -- The stamp is the server's record of the person's app. A row written before
  -- the stamp existed has none; then the request changing it now is the only
  -- server-side evidence left, and it is still matched against the closed map.
  if new.app_environment is not null then
    v_environment := new.app_environment;
    v_environment_source := 'row';
  else
    begin
      v_environment := public.gellatti_request_app_origin_v1()->>'environment';
    exception when others then
      v_environment := null;
    end;
    v_environment := coalesce(v_environment, 'staging');
    v_environment_source := 'request';
  end if;

  begin
    select min(o.base_url) into v_base_url
      from public.app_origins o
      where o.environment = v_environment;
  exception when others then
    v_base_url := null;
  end;
  if v_base_url is null then
    raise warning 'partner_application_email_skipped_no_app_origin for % (%)', new.id, v_environment;
    return new;
  end if;
  v_app_url := v_base_url || '/partner';

  begin
    perform public.gellatti_enqueue_email_v1(
      p_idempotency_key := 'partner-application:' || new.id::text || ':' || new.status || ':' || v_stamp,
      p_subject_key := v_subject_key,
      -- ES7 + ES4: the person's subject is a sentence, marked off-production.
      p_subject := case when v_environment = 'production' then '' else '[STAGING] ' end
        || v_subject_tail,
      p_recipient := v_email,
      p_body_html := '<p>' || public.gellatti_html_escape_v1(v_body_lead) || '</p><p>'
        || public.gellatti_html_escape_v1(v_body_action) || '</p>'
        || '<p><a href="' || public.gellatti_html_escape_v1(v_app_url) || '">Otwórz panel Partner</a></p>',
      p_body_text := v_body_lead || chr(10) || chr(10) || v_body_action || chr(10) || chr(10)
        || v_app_url || chr(10),
      p_environment := v_environment,
      p_metadata := jsonb_build_object(
        'area', 'PARTNER', 'event', v_event,
        'entity_id', new.id::text,
        'environment_source', v_environment_source,
        'origin_matched', new.app_origin_matched
      ),
      p_max_attempts := 5
    );
  exception when others then
    raise warning 'partner_application_email_enqueue_failed for % (%): %', new.id, new.status, sqlerrm;
  end;

  return new;
end;
$function$;

drop trigger if exists partner_application_lifecycle_email on public.partner_applications;
create trigger partner_application_lifecycle_email
  after insert or update of status on public.partner_applications
  for each row execute function public.gellatti_partner_application_email_v1();
