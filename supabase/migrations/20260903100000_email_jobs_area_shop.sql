-- ============================================================================
-- SHOP joins the transactional mail vocabulary.
--
-- `email_jobs.metadata` required `area` to be one of PARTNER / MACHINE /
-- MOBILE / TRAILER / FRANCHISE / REFERRAL. The Local Starter Pack notification
-- could therefore not be queued at all: the row was refused by the CHECK, and
-- because the first version of `shop-local-pack` did not read the insert error,
-- a real 0 EUR order was created with no mail and nothing said so.
--
-- SHOP is a real business domain with its own operational surface in Admin, so
-- it joins the closed vocabulary rather than being smuggled in under another
-- area's name. The function now also sets `environment` (NOT NULL, no default)
-- and REPORTS `emailQueued` instead of swallowing a failure.
-- ============================================================================
alter table public.email_jobs drop constraint if exists email_jobs_metadata_area_event_check;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.email_jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%metadata ? ''area''%'
  loop
    execute format('alter table public.email_jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.email_jobs add constraint email_jobs_metadata_area_event_check
  check (
    (metadata ? 'area')
    and (metadata ? 'event')
    and ((metadata ->> 'area') = any (array[
      'PARTNER','MACHINE','MOBILE','TRAILER','FRANCHISE','REFERRAL','SHOP'
    ]))
    and (btrim(coalesce(metadata ->> 'event', '')) <> '')
  );
