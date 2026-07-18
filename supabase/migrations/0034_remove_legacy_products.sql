-- 0034 — Legacy Products cleanup (owner decision 2026-07-18): remove the verified
-- legacy Mercadona import rows whose useful content already lives in the canonical
-- `mapper_basement` library, or that are dead (rejected). FILE ONLY — applied by the
-- owner after review; the agent's Supabase MCP access is read-only.
--
-- WHY: the ~69 `public.products` rows are a single legacy import batch
-- (`source_type = 'mercadona'`, one owner, `product_code` PR-ING-000002…000070). They
-- are NO LONGER a shared/public catalogue — the canonical ingredient catalogue is the
-- 2,083-row `mapper_basement` („Składniki PI"). The 23 rows already matched to a
-- `mapper_basement` ingredient are fully represented there; the 3 `rejected` rows are
-- dead. Removing exactly those 26 rows retires the transitional data without touching
-- the products architecture that stays for FUTURE user-created private products.
--
-- WHAT: deletes exactly the 26 rows matched by the EXPLICIT predicate
--   source_type = 'mercadona' AND (matched_basement_id IS NOT NULL OR status = 'rejected')
-- and their 26 dependent `product_snapshots` (FK-safe: dependents first, then parents).
-- The 43 UNMATCHED draft/pi_calculated rows (raw label content not yet in the mapper)
-- are deliberately RETAINED. Nothing else is altered: the `products` / `product_snapshots`
-- tables, RLS, Product Intake / OCR pipeline, readiness, and private-product architecture
-- are UNCHANGED. No scientific value is invented or changed.
--
-- REVERSIBLE: both target sets are copied into `_backup_legacy_products_0034` and
-- `_backup_legacy_product_snapshots_0034` BEFORE any delete (idempotent
-- `create table if not exists … as select` — a re-run keeps the first backup). Restore with
--   insert into public.products select * from public._backup_legacy_products_0034;
--   insert into public.product_snapshots select * from public._backup_legacy_product_snapshots_0034;
--
-- REFERENCE AUDIT (verified read-only against staging before writing this file):
--   • only hard FK into products is product_snapshots.product_id (ON DELETE CASCADE) — 26 rows;
--   • saved_recipes (1 row, „Raspberry Cream") references NONE of these product ids/codes;
--   • accepted_corrections is empty; no other table references products. External refs = 0.
--
-- SAFETY: apply to STAGING (tunabqqrwabacxjcxxkz) ONLY. NEVER to prod
-- (riwipywgqobrulyzrzad) or MOOTOORS (tjntmljkrxbpwjmkautu). The predicate is EXPLICIT
-- (never a bare `delete from public.products`); future OCR/manual/private products are
-- `customer_upload`/`label_scan`/`barcode_ean`/`manual`/`api` — never `mercadona` — so
-- they can never match. If the owner later wants the FULL batch retired (all 69), widen
-- the predicate to `source_type = 'mercadona'` (both backups + both deletes).

-- 1. Reversible backups (captured BEFORE any delete; skipped intact on re-run).
create table if not exists public._backup_legacy_products_0034 as
select *
from public.products
where source_type = 'mercadona'
  and (matched_basement_id is not null or status = 'rejected');

create table if not exists public._backup_legacy_product_snapshots_0034 as
select ps.*
from public.product_snapshots ps
where ps.product_id in (
  select id
  from public.products
  where source_type = 'mercadona'
    and (matched_basement_id is not null or status = 'rejected')
);

-- 2. Delete dependent product_snapshots FIRST (FK-safe order), same explicit predicate.
delete from public.product_snapshots ps
where ps.product_id in (
  select id
  from public.products
  where source_type = 'mercadona'
    and (matched_basement_id is not null or status = 'rejected')
);

-- 3. Delete the 26 legacy products (matched → content in mapper_basement, or rejected/dead).
--    The 43 unmatched draft/pi_calculated rows are RETAINED by this predicate.
delete from public.products
where source_type = 'mercadona'
  and (matched_basement_id is not null or status = 'rejected');
