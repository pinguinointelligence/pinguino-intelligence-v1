-- ============================================================================
-- ROLLBACK for 20260910180000_partner_application_lifecycle_email
-- ============================================================================
-- Reverses the C-APP-08 lifecycle mail exactly, and nothing else.
--
-- SAFE TO RUN AT ANY TIME. It removes a notification path and the environment
-- stamp that only this path reads; it touches no decision, no partner and no
-- status. Mail already queued keeps its own lifecycle in email_jobs — this does
-- not retract sent or pending mail, deliberately: cancelling a message that has
-- already left is not something a schema rollback should decide.
--
-- WHAT IT DOES
--   1. drops the mail trigger and its function, so no further transition
--      enqueues mail
--   2. drops the environment stamp trigger and its function
--   3. drops the request-origin resolver and the closed app-origin map
--   4. drops the two stamp columns from partner_applications
--
-- WHAT IT DOES NOT DO
--   It does not touch gellatti_submit_partner_application_v1. The reworked
--   migration no longer redefines it, so the 20260910044111 form (with the
--   note/consent/audienceSize fixes) is what stays in place.

drop trigger if exists partner_application_lifecycle_email on public.partner_applications;
drop function if exists public.gellatti_partner_application_email_v1();

drop trigger if exists partner_application_stamp_app on public.partner_applications;
drop function if exists public.gellatti_partner_application_stamp_app_v1();

drop function if exists public.gellatti_request_app_origin_v1();

alter table public.partner_applications
  drop constraint if exists partner_applications_app_environment_check;
alter table public.partner_applications
  drop column if exists app_origin_matched,
  drop column if exists app_environment;

drop table if exists public.app_origins;
