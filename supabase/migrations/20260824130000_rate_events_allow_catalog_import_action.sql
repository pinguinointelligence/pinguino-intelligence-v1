-- The catalog_import rate class needs the table to accept its name.
--
-- 20260824100000 gave bulk catalogue import its own action so it would stop
-- being metered as a manual candidate, but global_catalog_rate_events still
-- carried a CHECK listing only the four original actions. The reservation
-- insert therefore violated the constraint, preflight_product_ingest_v1 raised,
-- and catalog-submit answered 400 product_ingest_preflight_failed — leaving no
-- rate event and no denial, so the database looked untouched.
--
-- It only failed for accounts that EARN the new class: a non-entitled account
-- still resolves to manual_candidate and inserted fine, which is why the defect
-- reached the owner and no one else.
alter table public.global_catalog_rate_events
  drop constraint if exists global_catalog_rate_events_action_check;

alter table public.global_catalog_rate_events
  add constraint global_catalog_rate_events_action_check
  check (action = any (array[
    'ocr_scan','manual_candidate','review_escalation','duplicate_dispute','catalog_import'
  ]));
