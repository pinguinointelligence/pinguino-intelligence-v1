-- ============================================================================
-- Migration 0022 — ocr_intake_batches, ocr_intake_sessions, ocr_intake_images
-- (OCR product intake spec §6, §14 — FILE-FIRST, not applied anywhere yet)
-- ============================================================================
-- The persistence spine for the REAL OCR product-intake sessions: a user
-- photographs a food package (multiple images with roles), the local OCR
-- engine runs, evidence is reviewed, and saving goes ONLY through the
-- existing identity-aware import path (ProductIntakeCandidate →
-- mapRowToProductInsert → importProductCatalog) — never around it.
--
-- Locked intake rules mirrored in this schema:
--  * state vocabularies are EXACTLY the shared contract's unions
--    (src/features/ocr-intake/intakeContracts.ts) — the lockstep guard test
--    src/features/ocr-intake/ocrIntake.migration.test.ts fails on any drift.
--  * intake is USER working data (package photos + extraction evidence), not
--    financial/audit history — deleting the auth user cascades the whole
--    intake trail away (unlike the partner/commission tables, which anchor).
--  * nothing here touches products, mapper_basement, PAC/POD or any locked
--    reference table; the ONLY link to the catalog is a SOFT text id set by
--    the server after a successful import (see saved_product_id).
--
-- Writes: owner-scoped via RLS + column-level grants; the save/verification
-- columns are service-role only (no client grant). Reads: owner only.

-- ── ocr_intake_batches ───────────────────────────────────────────────────────
-- A batch is just an ordered grouping of sessions (spec §13). Its outcome is
-- DERIVED from the member sessions' states at read time — deliberately NO
-- stored saved/failed counters: counter columns drift from the session rows
-- under retries and partial failures; the sessions are the single truth.
create table if not exists public.ocr_intake_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ocr_intake_batches_user_id_idx
  on public.ocr_intake_batches (user_id);

-- ── ocr_intake_sessions ──────────────────────────────────────────────────────
-- One product-intake attempt. State machine = the contract's
-- IntakeSessionState (spec §4/§9):
--   collecting_images → extracting → review → ready_to_save → saving → saved
--   any non-terminal → cancelled | failed;  review → duplicate_blocked
create table if not exists public.ocr_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  -- owner: ON DELETE CASCADE is deliberate — intake sessions are the user's
  -- own working data (their package photos, their review), not shared
  -- financial evidence. Account deletion must take the intake trail with it.
  user_id uuid not null references auth.users (id) on delete cascade,

  state text not null default 'collecting_images' check (state in
    ('collecting_images', 'extracting', 'review', 'ready_to_save', 'saving',
     'saved', 'duplicate_blocked', 'cancelled', 'failed')),

  -- manually entered/scanned EAN (normalized digits), independent of OCR
  -- evidence; nullable — many intakes have no barcode shot
  manual_ean text check (manual_ean is null or manual_ean ~ '^[0-9]{8,14}$'),

  -- optional batch membership (spec §13); removing a batch never destroys
  -- its sessions — they simply become unbatched
  batch_id uuid references public.ocr_intake_batches (id) on delete set null,

  -- SOFT link (text, NO foreign key) to public.products.id, set ONLY by the
  -- server after the identity-aware import path saved the product. Soft on
  -- purpose: a hard FK would couple this working-data table to the catalog's
  -- lifecycle (re-imports, replacements, catalog maintenance would need to
  -- update or break intake history), and the import path — not this schema —
  -- owns product identity. Clients can NEVER write this column (no grant).
  saved_product_id text,

  cancelled_at timestamptz,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- terminal states must carry their timestamp (audit coherence)
  constraint ocr_intake_sessions_saved_shape check
    (state <> 'saved' or saved_at is not null),
  constraint ocr_intake_sessions_cancelled_shape check
    (state <> 'cancelled' or cancelled_at is not null)
);

create index if not exists ocr_intake_sessions_user_id_idx
  on public.ocr_intake_sessions (user_id);
create index if not exists ocr_intake_sessions_batch_id_idx
  on public.ocr_intake_sessions (batch_id);
create index if not exists ocr_intake_sessions_state_idx
  on public.ocr_intake_sessions (state);

drop trigger if exists ocr_intake_sessions_touch on public.ocr_intake_sessions;
create trigger ocr_intake_sessions_touch
  before update on public.ocr_intake_sessions
  for each row execute function public.touch_updated_at();

-- ── ocr_intake_images ────────────────────────────────────────────────────────
-- One uploaded package photo. role/state vocabularies = the contract's
-- IntakeImageRole / IntakeImageState; mime = AcceptedMime (HEIC/HEIF are
-- converted client-side or honestly rejected — they never reach storage).
create table if not exists public.ocr_intake_images (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ocr_intake_sessions (id) on delete cascade,

  role text not null check (role in
    ('front', 'back', 'nutrition_table', 'ingredients', 'barcode',
     'claims_allergens', 'other')),

  -- 0-based display/processing order, contiguous within the session
  display_order integer not null check (display_order >= 0),

  file_name text not null,
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  -- 10 MiB cap — MUST stay equal to the bucket file_size_limit in 0024
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  -- SHA-256 hex of the bytes: duplicate-upload detection + evidence identity
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),

  state text not null default 'uploaded' check (state in
    ('uploaded', 'analysing', 'needs_review', 'ready', 'failed')),
  -- failure reason when state = 'failed' (typed upstream, message here)
  failure text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- duplicate-upload guard: the same bytes can join a session only once
  constraint ocr_intake_images_checksum_uniq unique (session_id, checksum_sha256),
  -- ordering spine: one image per slot; DEFERRABLE so a reorder (swap two
  -- display_order values inside one transaction) never trips the constraint
  constraint ocr_intake_images_order_uniq unique (session_id, display_order)
    deferrable initially immediate,
  constraint ocr_intake_images_failed_shape check
    (state <> 'failed' or failure is not null)
);

create index if not exists ocr_intake_images_session_id_idx
  on public.ocr_intake_images (session_id);

drop trigger if exists ocr_intake_images_touch on public.ocr_intake_images;
create trigger ocr_intake_images_touch
  before update on public.ocr_intake_images
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.ocr_intake_batches enable row level security;
alter table public.ocr_intake_sessions enable row level security;
alter table public.ocr_intake_images enable row level security;

-- batches: owner-scoped select/insert/delete; nothing to update (no mutable
-- columns — outcome is derived, see header)
create policy ocr_intake_batches_select_own on public.ocr_intake_batches
  for select using (auth.uid() = user_id);
create policy ocr_intake_batches_insert_own on public.ocr_intake_batches
  for insert with check (auth.uid() = user_id);
create policy ocr_intake_batches_delete_own on public.ocr_intake_batches
  for delete using (auth.uid() = user_id);

-- sessions: owner-scoped; update is row-scoped here and COLUMN-scoped by the
-- grant below (state transitions + manual_ean + batch membership + terminal
-- timestamps only — saved_product_id and user_id are NOT client-writable)
create policy ocr_intake_sessions_select_own on public.ocr_intake_sessions
  for select using (auth.uid() = user_id);
create policy ocr_intake_sessions_insert_own on public.ocr_intake_sessions
  for insert with check (auth.uid() = user_id);
create policy ocr_intake_sessions_update_own on public.ocr_intake_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ocr_intake_sessions_delete_own on public.ocr_intake_sessions
  for delete using (auth.uid() = user_id);

-- images: owner-scoped through the parent session (images carry no user_id —
-- the session is the ownership anchor)
create policy ocr_intake_images_select_own on public.ocr_intake_images
  for select using (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy ocr_intake_images_insert_own on public.ocr_intake_images
  for insert with check (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy ocr_intake_images_update_own on public.ocr_intake_images
  for update using (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy ocr_intake_images_delete_own on public.ocr_intake_images
  for delete using (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));

-- ── grants (column-scoped writes; NOTHING for anon) ─────────────────────────
grant select, insert, delete on table public.ocr_intake_batches to authenticated;

grant select, insert, delete on table public.ocr_intake_sessions to authenticated;
-- clients may transition state, edit the manual EAN, join/leave a batch and
-- stamp their own terminal timestamps — and NOTHING else. saved_product_id
-- is deliberately absent: only the server-side import path (service role,
-- which bypasses grants and RLS) may record the saved product link.
grant update (state, manual_ean, batch_id, cancelled_at, saved_at)
  on public.ocr_intake_sessions to authenticated;

grant select, insert, delete on table public.ocr_intake_images to authenticated;
-- role/order/state/failure are reviewable; file identity (file_name, mime,
-- byte_size, checksum_sha256, width, height) is IMMUTABLE after upload —
-- replacing an image is delete + insert, never an in-place byte swap.
grant update (role, display_order, state, failure)
  on public.ocr_intake_images to authenticated;

-- note: NO grants to anon at all — demo sessions can never read or write
-- intake data.

-- ============================================================================
-- ROLLBACK PLAN (not applied — the paired down-migration, kept as comments)
-- ============================================================================
-- 0023/0024 depend on these tables — roll those back first. Then:
--   drop table if exists public.ocr_intake_images;
--   drop table if exists public.ocr_intake_sessions;
--   drop table if exists public.ocr_intake_batches;
-- ============================================================================
