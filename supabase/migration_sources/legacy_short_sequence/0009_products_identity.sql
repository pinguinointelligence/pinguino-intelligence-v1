-- Mapper Products — 0009: product identity foundation for public.products (Slice D5A).
--
-- ADDS product-identity structure ONLY (no app logic): a DB-generated stable product
-- code, deterministic normalized EAN/barcode columns, identity/url/size columns, and
-- per-owner duplicate-prevention indexes. The duplicate-LOOKUP service and
-- createProductWithIdentity are a LATER slice (D5B); ProductRow + the products service
-- are intentionally UNCHANGED here (the new columns are returned by select(*) untyped
-- until D5B adds them to the type layer — same pattern as 0008 -> D3).
--
-- PRODUCT CODE: PR-ING-000001, PR-ING-000002, … generated DB-side by a sequence +
-- function + column DEFAULT (concurrency-safe; NEVER an app-side MAX()). The PI-ING-
-- prefix stays RESERVED for the locked mapper_basement; products use PR-ING-. The
-- counter is 6-digit zero-padded (to 999999); beyond that the number simply widens —
-- still unique. NOTE: a Postgres sequence persists across rollbacks, so gaps in
-- product_code are expected and harmless; for a true reset, drop the sequence manually.
--
-- NORMALIZED EAN/BARCODE: ean_code_normalized / barcode_normalized are GENERATED ALWAYS
-- … STORED via the IMMUTABLE helper public.normalize_to_digits() — strip every non-digit,
-- PRESERVE leading zeros, always in sync (no trigger, no app write). This is the exact
-- equivalent of the app-side canonicalEan (raw.replace(/\D+/g,'')), so a future lookup
-- `where ean_code_normalized = canonicalEan(scanned)` is consistent.
--
-- DUPLICATE PREVENTION is PER-OWNER, never global: a user cannot add the same normalized
-- EAN/barcode twice, but different users / catalogs still may (preserves the 0007
-- "not globally unique" contract and avoids leaking cross-user product existence via a
-- shared unique constraint). Partial unique indexes ignore blank (no-digit) values.
--
-- NO WRITE TO THE LOCKED REFERENCE BASE: this migration adds a read-only sequence + two
-- read-only functions (next_product_code, normalize_to_digits) that touch NO table, plus
-- columns/indexes on public.products. It contains NO trigger, NO foreign key, and NO
-- insert/update/delete against mapper_basement; its executable SQL never names that table.
-- The single UPDATE is a one-time backfill of public.products.product_code. No ingredient-
-- level NPAC value is added (v0.95 no-NPAC).
--
-- Apply ONCE in the Supabase SQL editor or via `supabase db push`. Idempotent on re-apply
-- (if not exists / create or replace). Before the per-owner unique indexes build, ensure
-- no owner already has pre-existing duplicate normalized EAN/barcode rows (table is new).

-- 1) Product-code sequence + generator (READ-ONLY; touches no table).
create sequence if not exists public.products_code_seq;

create or replace function public.next_product_code()
returns text language sql volatile as $$
  select 'PR-ING-' || lpad(nextval('public.products_code_seq')::text, 6, '0')
$$;
-- VOLATILE is REQUIRED: nextval() must run fresh for every row. Marking this STABLE or
-- IMMUTABLE would let Postgres cache a single value and assign duplicate product codes.

-- 2) Immutable digit-normalizer (matches the app-side canonicalEan exactly).
create or replace function public.normalize_to_digits(input text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g')
$$;

-- 3) product_code: DB-generated, backfilled, NOT NULL, unique (no app-side MAX).
alter table public.products add column if not exists product_code text;
alter table public.products alter column product_code set default public.next_product_code();
update public.products set product_code = public.next_product_code() where product_code is null;
alter table public.products alter column product_code set not null;
create unique index if not exists products_product_code_uniq on public.products (product_code);

-- 4) Identity / URL / size columns (all nullable; user / D5B-populated).
alter table public.products
  add column if not exists product_url text,
  add column if not exists source_url text,
  add column if not exists package_size text,
  add column if not exists product_identity_hash text;

-- 5) Generated normalized EAN/barcode (strip non-digits, preserve leading zeros).
alter table public.products
  add column if not exists ean_code_normalized text
    generated always as (public.normalize_to_digits(ean_code)) stored,
  add column if not exists barcode_normalized text
    generated always as (public.normalize_to_digits(barcode)) stored;

-- 6) Per-owner duplicate prevention (privacy-safe; NOT globally unique).
create unique index if not exists products_owner_ean_norm_uniq
  on public.products (owner_user_id, ean_code_normalized)
  where ean_code_normalized <> '';
create unique index if not exists products_owner_barcode_norm_uniq
  on public.products (owner_user_id, barcode_normalized)
  where barcode_normalized <> '';

-- 7) Non-unique lookup indexes for the future (D5B) duplicate-lookup service.
create index if not exists products_owner_identity_hash_idx
  on public.products (owner_user_id, product_identity_hash);
create index if not exists products_owner_source_url_idx
  on public.products (owner_user_id, source_url);
