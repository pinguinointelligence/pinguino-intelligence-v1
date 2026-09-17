-- Rollback of 20260917154000_direct_share_own_photo.
--
-- Switches the feature OFF without deleting anyone's data: removes the access
-- and attach RPCs, the upload policy and its helper. Undeploy (or stop routing
-- to) the `share-photo` Edge Function together with this rollback.
--
-- Deliberately KEPT, so a rollback never deletes customers' files or links:
--   * the PRIVATE bucket `recipe-share-photos` and every photograph in it;
--   * the table `public.recipe_share_link_photos` (RLS on, no policy, no client
--     grants — inert without the functions).
-- Re-applying the forward migration is idempotent and brings the photographs back.
-- Existing shares, links, recipients, recipes and versions are untouched.
drop function if exists public.gellatti_share_photo_v1(uuid, text);
drop function if exists public.gellatti_set_share_photo_v1(uuid, text);

drop policy if exists recipe_share_photos_insert_sharer on storage.objects;
drop function if exists public.gellatti_share_photo_folder_writable_v1(text);
