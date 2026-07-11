-- ============================================================================
-- Migration 0024 — product-intake-images storage bucket + object policies
-- (OCR product intake spec §6 — FILE-FIRST, not applied anywhere yet)
-- ============================================================================
-- PRIVATE storage for the raw package photos behind ocr_intake_images.
-- Standard Supabase pattern: seed storage.buckets + owner-scoped policies on
-- storage.objects. Locked rules:
--  * the bucket is PRIVATE (public = false) — there is NO public read and NO
--    anon policy of any kind. The app displays images via short-lived SIGNED
--    URLs it creates for the owner; a leaked object path alone is useless.
--  * objects live under a per-user folder: {auth.uid()}/{session}/{file} —
--    every policy pins (storage.foldername(name))[1] = auth.uid()::text, so
--    one user can never touch (or even list) another user's uploads.
--  * caps mirror 0022's ocr_intake_images CHECKs exactly: 10 MiB per file,
--    png/jpeg/webp only (HEIC/HEIF is converted client-side or honestly
--    rejected — it never reaches storage).
--  * no UPDATE policy: replacing an image is delete + upload (new checksum,
--    new row in ocr_intake_images), never an in-place byte swap that would
--    detach stored bytes from their recorded checksum.

-- ── bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-intake-images',
  'product-intake-images',
  false,                                            -- PRIVATE: signed URLs only
  10485760,                                         -- 10 MiB = 0022 byte_size cap
  array['image/png', 'image/jpeg', 'image/webp']    -- = contract AcceptedMime
)
on conflict (id) do nothing;

-- ── storage.objects policies (owner-scoped, authenticated only) ─────────────
-- storage.objects already has RLS enabled by Supabase; policies are additive
-- per bucket. drop-if-exists first: storage.objects is a SHARED table, so the
-- create-policy calls must be idempotent across re-runs.

drop policy if exists product_intake_images_insert_own on storage.objects;
create policy product_intake_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-intake-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists product_intake_images_select_own on storage.objects;
create policy product_intake_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-intake-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists product_intake_images_delete_own on storage.objects;
create policy product_intake_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-intake-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- note: NO update policy (see header), NO anon policy, NO public read. The
-- owner-scoped select policy exists so the app can create signed URLs and
-- list the user's own uploads with the user's JWT — anyone else sees nothing.

-- ============================================================================
-- ROLLBACK PLAN (not applied — the paired down-migration, kept as comments)
-- ============================================================================
--   drop policy if exists product_intake_images_insert_own on storage.objects;
--   drop policy if exists product_intake_images_select_own on storage.objects;
--   drop policy if exists product_intake_images_delete_own on storage.objects;
--   delete from storage.buckets where id = 'product-intake-images';
--   (objects, if any were uploaded, must be emptied via the storage API first)
-- ============================================================================
