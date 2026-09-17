-- Rollback for 20260917170000_share_photo_cleanup.
--
-- Stops the schedule first, then restores `gellatti_set_share_photo_v1` exactly
-- as 20260917103413 defined it (statement copied byte for byte), then removes
-- the cleanup functions. The ledger table `recipe_share_photo_cleanup` is KEPT:
-- it is the record of which files were queued and deleted, and it has no client
-- access. No photo, link, recipient or bucket is touched; files already deleted
-- by the worker cannot be restored by a rollback.

do $$
begin
  perform cron.unschedule('gellatti-share-photo-cleanup');
exception when others then null;
end $$;

drop function if exists public.gellatti_share_photo_cleanup_tick_v1();
drop function if exists public.gellatti_share_photo_cleanup_settle_v1(uuid, text[], text);
drop function if exists public.gellatti_share_photo_cleanup_claim_v1(integer);
drop function if exists public.gellatti_share_photo_cleanup_sweep_v1(interval, integer);

create or replace function public.gellatti_set_share_photo_v1(
  p_share_link_id uuid, p_storage_path text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_link public.recipe_share_links;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_link from public.recipe_share_links
  where id = p_share_link_id and shared_by_user_id = v_uid;
  if v_link.id is null then raise exception 'share_link_not_found' using errcode = '42501'; end if;
  if v_link.status <> 'active' or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    raise exception 'share_link_inactive' using errcode = '22023';
  end if;

  if v_path = '' then
    delete from public.recipe_share_link_photos where share_link_id = v_link.id;
    return jsonb_build_object('share_link_id', v_link.id, 'own_photo', false);
  end if;

  if v_path !~ ('^' || v_link.id::text || '/[A-Za-z0-9-]+\.(jpg|png|webp)$')
     or not exists (
       select 1 from storage.objects object
       where object.bucket_id = 'recipe-share-photos'
         and object.name = v_path
         and object.owner_id = v_uid::text
     ) then
    raise exception 'share_photo_not_owned' using errcode = '42501';
  end if;

  insert into public.recipe_share_link_photos (share_link_id, storage_path, attached_by_user_id)
  values (v_link.id, v_path, v_uid)
  on conflict (share_link_id) do update set
    storage_path = excluded.storage_path,
    attached_by_user_id = excluded.attached_by_user_id,
    updated_at = now();
  return jsonb_build_object('share_link_id', v_link.id, 'own_photo', true);
end;
$$;
revoke all on function public.gellatti_set_share_photo_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.gellatti_set_share_photo_v1(uuid, text) to authenticated;

drop function if exists public.gellatti_share_photo_cleanup_is_due_v1(text, integer, integer, timestamptz, timestamptz);
drop function if exists public.gellatti_share_photo_link_lock_v1(uuid);
drop function if exists public.gellatti_share_photo_object_lock_v1(text);
