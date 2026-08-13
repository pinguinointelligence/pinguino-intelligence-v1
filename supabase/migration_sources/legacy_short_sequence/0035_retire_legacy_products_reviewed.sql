-- 0035 — Legacy Products cleanup, REVIEWED / semantic (owner decision 2026-07-18).
-- Supersedes the FK-only scope of 0034: instead of "matched OR rejected", this deletes
-- exactly the rows a SEMANTIC audit proved are already represented in the canonical
-- `mapper_basement` library (or are dead), and RETAINS every row whose distinguishing
-- content is NOT in the mapper. FILE ONLY — applied by the owner AFTER reviewing the audit
-- (docs/product-audit/LEGACY_PRODUCTS_43_ROW_AUDIT_2026-07-18.md); the agent's Supabase MCP
-- access is read-only.
--
-- WHY: the 69 `public.products` rows are one legacy Mercadona import batch
-- (`source_type='mercadona'`, one owner, product_code PR-ING-000002…000070). Their useful
-- content lives in the 2,083-row `mapper_basement` („Składniki PI"). A prior pass keyed only
-- on the FK `matched_basement_id`; the owner required all 43 unmatched rows to be audited
-- SEMANTICALLY (identity + nutrition), because an FK link is not the only proof of migration.
--
-- WHAT: deletes EXACTLY 40 rows — the conclusive
--   exact_mapper_representation (3) + normalized_mapper_representation (22)
--   + duplicate (12) + obsolete/rejected (3)
-- classes from the audit — via an EXPLICIT product_code allow-list (never a predicate that
-- could sweep in a future row), and their 40 dependent `product_snapshots` (FK-safe:
-- dependents first, then parents). It RETAINS 29 rows:
--   • 28 genuinely_unmatched (lactose-free milks, +protein/fortified dairy, defatted peanut
--     protein powder, 0%-sugar sweetened dark chocolate, drinking-cocoa „a la taza", raw
--     pistachio, fruit BLENDS, 0%-sugar diet jams, kefir, tabletop sweeteners incl. the ONLY
--     saccharin, light high-protein Greek yogurt, vanilla essence); and
--   • 1 required reference — PR-ING-000002 „Leche entera", whose UUID
--     18313d47-ddad-4e4e-b1f9-ba39c9ad9434 is LIVE-WIRED into the DEV Mapper-smoke tool
--     (src/pages/dev/MapperSmokePage.tsx calls matchAndSaveProduct on it). Deleting it would
--     leave that tool pointing at a missing row. To retire it later: repoint SMOKE_PRODUCT_ID
--     / SMOKE_PRODUCT_CODE (or remove the dev tool), then add its id here.
-- Nothing else is altered: the `products` / `product_snapshots` tables, RLS, Product Intake /
-- OCR pipeline, readiness, and private-product architecture are UNCHANGED. No scientific value
-- is invented or changed.
--
-- DELETED = 40. RETAINED = 29. (DB-verified read-only: 40 codes → 40 mercadona rows →
-- 40 product_snapshots; 29 mercadona rows remain.)
--
-- REVERSIBLE: both target sets are copied into `_backup_legacy_products_0035` and
-- `_backup_legacy_product_snapshots_0035` BEFORE any delete (idempotent
-- `create table if not exists … as select` — a re-run keeps the first backup). Restore with:
--   insert into public.products select * from public._backup_legacy_products_0035;
--   insert into public.product_snapshots select * from public._backup_legacy_product_snapshots_0035;
--
-- REFERENCE AUDIT (verified read-only against staging before writing this file):
--   • only hard FK into products is product_snapshots.product_id (ON DELETE CASCADE) — 40 of
--     the 69 snapshots belong to the delete set;
--   • saved_recipes (1 row, „Raspberry Cream") references NONE of these product ids/codes;
--   • accepted_corrections is empty; no other table references products;
--   • one source reference exists (PR-ING-000002 in the dev smoke tool) → that row is RETAINED.
--
-- SAFETY: apply to STAGING (tunabqqrwabacxjcxxkz) ONLY. NEVER to prod
-- (riwipywgqobrulyzrzad) or MOOTOORS (tjntmljkrxbpwjmkautu). The delete is an EXPLICIT
-- product_code allow-list AND is scoped `source_type='mercadona'` (never a bare
-- `delete from public.products`); future OCR/manual/private products are
-- `customer_upload`/`label_scan`/`barcode_ean`/`manual`/`api` — never `mercadona` — and are
-- not in the list, so they can never match.

-- 1. Reversible backups (captured BEFORE any delete; skipped intact on re-run).
create table if not exists public._backup_legacy_products_0035 as
select *
from public.products
where source_type = 'mercadona'
  and product_code in (
    'PR-ING-000003','PR-ING-000004','PR-ING-000005','PR-ING-000006','PR-ING-000010',
    'PR-ING-000011','PR-ING-000012','PR-ING-000013','PR-ING-000014','PR-ING-000015',
    'PR-ING-000016','PR-ING-000017','PR-ING-000020','PR-ING-000024','PR-ING-000025',
    'PR-ING-000026','PR-ING-000027','PR-ING-000028','PR-ING-000029','PR-ING-000030',
    'PR-ING-000031','PR-ING-000033','PR-ING-000036','PR-ING-000037','PR-ING-000038',
    'PR-ING-000039','PR-ING-000040','PR-ING-000041','PR-ING-000042','PR-ING-000043',
    'PR-ING-000044','PR-ING-000046','PR-ING-000047','PR-ING-000054','PR-ING-000064',
    'PR-ING-000065','PR-ING-000066','PR-ING-000067','PR-ING-000068','PR-ING-000070'
  );

create table if not exists public._backup_legacy_product_snapshots_0035 as
select ps.*
from public.product_snapshots ps
where ps.product_id in (
  select id
  from public.products
  where source_type = 'mercadona'
    and product_code in (
      'PR-ING-000003','PR-ING-000004','PR-ING-000005','PR-ING-000006','PR-ING-000010',
      'PR-ING-000011','PR-ING-000012','PR-ING-000013','PR-ING-000014','PR-ING-000015',
      'PR-ING-000016','PR-ING-000017','PR-ING-000020','PR-ING-000024','PR-ING-000025',
      'PR-ING-000026','PR-ING-000027','PR-ING-000028','PR-ING-000029','PR-ING-000030',
      'PR-ING-000031','PR-ING-000033','PR-ING-000036','PR-ING-000037','PR-ING-000038',
      'PR-ING-000039','PR-ING-000040','PR-ING-000041','PR-ING-000042','PR-ING-000043',
      'PR-ING-000044','PR-ING-000046','PR-ING-000047','PR-ING-000054','PR-ING-000064',
      'PR-ING-000065','PR-ING-000066','PR-ING-000067','PR-ING-000068','PR-ING-000070'
    )
);

-- 2. Delete dependent product_snapshots FIRST (FK-safe order), same explicit allow-list.
delete from public.product_snapshots ps
where ps.product_id in (
  select id
  from public.products
  where source_type = 'mercadona'
    and product_code in (
      'PR-ING-000003','PR-ING-000004','PR-ING-000005','PR-ING-000006','PR-ING-000010',
      'PR-ING-000011','PR-ING-000012','PR-ING-000013','PR-ING-000014','PR-ING-000015',
      'PR-ING-000016','PR-ING-000017','PR-ING-000020','PR-ING-000024','PR-ING-000025',
      'PR-ING-000026','PR-ING-000027','PR-ING-000028','PR-ING-000029','PR-ING-000030',
      'PR-ING-000031','PR-ING-000033','PR-ING-000036','PR-ING-000037','PR-ING-000038',
      'PR-ING-000039','PR-ING-000040','PR-ING-000041','PR-ING-000042','PR-ING-000043',
      'PR-ING-000044','PR-ING-000046','PR-ING-000047','PR-ING-000054','PR-ING-000064',
      'PR-ING-000065','PR-ING-000066','PR-ING-000067','PR-ING-000068','PR-ING-000070'
    )
);

-- 3. Delete the 40 legacy products (represented in mapper_basement, or rejected/dead).
--    The 29 retained rows (28 genuinely_unmatched + PR-ING-000002) are NOT in this list.
delete from public.products
where source_type = 'mercadona'
  and product_code in (
    'PR-ING-000003','PR-ING-000004','PR-ING-000005','PR-ING-000006','PR-ING-000010',
    'PR-ING-000011','PR-ING-000012','PR-ING-000013','PR-ING-000014','PR-ING-000015',
    'PR-ING-000016','PR-ING-000017','PR-ING-000020','PR-ING-000024','PR-ING-000025',
    'PR-ING-000026','PR-ING-000027','PR-ING-000028','PR-ING-000029','PR-ING-000030',
    'PR-ING-000031','PR-ING-000033','PR-ING-000036','PR-ING-000037','PR-ING-000038',
    'PR-ING-000039','PR-ING-000040','PR-ING-000041','PR-ING-000042','PR-ING-000043',
    'PR-ING-000044','PR-ING-000046','PR-ING-000047','PR-ING-000054','PR-ING-000064',
    'PR-ING-000065','PR-ING-000066','PR-ING-000067','PR-ING-000068','PR-ING-000070'
  );
