-- QA ONLY — the QA preview origins in the existing closed map.
--
-- NOT a shared-backend package and never to be applied there: production must
-- not trust a localhost origin. The shape CHECKs of 20260910175900 allow only
-- `https://host`, so on the QA branch they are widened to also allow the two
-- preview origins, and the rows are added with the environment the project
-- already has for a non-production app ('staging' — no new vocabulary).
--
-- Effect on QA: a request from the preview resolves to itself, so mails,
-- notifications and audit rows carry QA links instead of staging ones, and the
-- unmatched fallback (lowest staging origin) becomes the preview too.
--
-- Rollback: delete the two rows and restore the original CHECKs (below).
do $qa$
begin
  if not exists (select 1 from qa_bootstrap.environment where project_ref = 'ncmsonfwbgsqedgnzofg' and branch_id = '14d26da6-6ce1-404d-87b7-449f1cbd700b') then
    raise exception 'isolation guard: not the QA branch';
  end if;

  alter table public.app_origins drop constraint if exists app_origins_origin_shape;
  alter table public.app_origins add constraint app_origins_origin_shape
    check (origin ~ '^https://[a-z0-9.-]+$' or origin ~ '^http://localhost:[0-9]{2,5}$');
  alter table public.app_origins drop constraint if exists app_origins_base_url_shape;
  alter table public.app_origins add constraint app_origins_base_url_shape
    check (base_url ~ '^https://[a-z0-9.-]+$' or base_url ~ '^http://localhost:[0-9]{2,5}$');

  insert into public.app_origins (origin, environment, base_url) values
    ('http://localhost:5188', 'staging', 'http://localhost:5188'),
    ('http://localhost:5189', 'staging', 'http://localhost:5189')
  on conflict (origin) do update set environment = excluded.environment, base_url = excluded.base_url;

  insert into qa_bootstrap.environment_changes (change, reason)
  values ('public.app_origins: QA preview origins http://localhost:5188 and :5189 added (environment staging, base_url = the origin itself) and the two shape CHECKs widened on QA to allow http://localhost:PORT. QA ONLY — never applied to the shared project. Rollback: delete the two rows, then restore the CHECKs to ''^https://[a-z0-9.-]+$''.',
          'Owner decision 2026-09-17: QA links must come back to the QA preview. Without a row the closed map resolves the preview as unmatched → staging, so QA mails and audit rows carried staging links.');
end
$qa$;
select jsonb_agg(to_jsonb(a) order by a.origin) as app_origins from public.app_origins a;
