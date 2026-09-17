-- Rollback of 20260917154000_direct_share_own_photo.
--
-- Removes the two RPCs, the three storage policies, the two policy helpers and
-- the link → photograph table. Existing shares, links, recipients, recipes and
-- versions are untouched: nothing in the forward migration changed them.
--
-- The PRIVATE bucket `recipe-share-photos` is intentionally left in place:
-- Supabase refuses direct SQL deletes from storage tables, and without these
-- policies nobody but service_role can read or write it. Remove its objects
-- and then the bucket through the Storage API / dashboard if it should go.
drop function if exists public.gellatti_share_photo_v1(uuid);
drop function if exists public.gellatti_set_share_photo_v1(uuid, text);

drop policy if exists recipe_share_photos_delete_own on storage.objects;
drop policy if exists recipe_share_photos_select_party on storage.objects;
drop policy if exists recipe_share_photos_insert_sharer on storage.objects;

drop function if exists public.gellatti_share_photo_readable_v1(text);
drop function if exists public.gellatti_share_photo_folder_writable_v1(text);

drop table if exists public.recipe_share_link_photos;
