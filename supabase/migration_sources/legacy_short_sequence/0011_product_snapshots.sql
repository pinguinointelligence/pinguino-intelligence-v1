-- Mapper Products — 0011: additive product_snapshots history table.
--
-- PURPOSE: an append-only history of a product's mutable fields (price, package, label
-- nutrition, ingredients text, source URL, OCR text) so the Mapper can detect changes over
-- time and feed the PI Verified audit trail. Purely ADDITIVE: it creates ONE new table and
-- touches nothing existing — no ALTER of public.products, no mapper_basement, no destructive
-- op, no reintroduced NPAC. Apply ONCE in the Supabase SQL editor or via `supabase db push`.
--
-- SAFETY: owner-scoped RLS; APPEND-ONLY (SELECT + INSERT policies only — no UPDATE/DELETE
-- policy, so history is immutable for users); grants to `authenticated` only (no anon, no
-- service_role); FK to public.products(id) ON DELETE CASCADE (snapshots die with the product).

create table if not exists public.product_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  change_type text not null default 'created'
    check (change_type in ('created', 'price', 'package', 'nutrition', 'ingredients', 'image', 'source', 'other')),
  -- captured mutable fields (all nullable — unknown stays NULL, never a fake 0)
  price numeric,
  package_size text,
  ingredients_text text,
  source_url text,
  ocr_text text,
  fat_percent numeric,
  saturated_fat_percent numeric,
  carbohydrate_percent numeric,
  total_sugars_percent numeric,
  protein_percent numeric,
  salt_percent numeric,
  kcal_per_100g numeric,
  -- what changed vs the previous snapshot (a jsonb diff; shape not constrained here)
  detected_changes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_snapshots_product_idx
  on public.product_snapshots (product_id, snapshot_at desc);

alter table public.product_snapshots enable row level security;

-- Owner-scoped, append-only: SELECT + INSERT only. No UPDATE/DELETE policy is created, so a
-- user can never mutate or delete a historical snapshot.
create policy product_snapshots_select_own on public.product_snapshots
  for select using (auth.uid() = owner_user_id);
create policy product_snapshots_insert_own on public.product_snapshots
  for insert with check (auth.uid() = owner_user_id);

grant select, insert on public.product_snapshots to authenticated;
