-- Rollback for 20260917170000_share_photo_cleanup.
--
-- ORDER (owner decision 2026-09-17, correction 2). Restoring the old attach
-- function while a worker still holds a claim would let a file be attached again
-- and then deleted by that worker. So this file REFUSES to run until new work has
-- stopped and the work already sent has finished:
--
--   1. select public.gellatti_share_photo_cleanup_pause_v1('rollback');
--        the claim and the tick refuse from this moment on.
--   2. select cron.unschedule('gellatti-share-photo-cleanup');
--        no new invocation is scheduled (this alone proves nothing).
--   3. select public.gellatti_share_photo_cleanup_status_v1();
--        repeat until `in_flight` is 0. For a worker that died mid-run:
--        select public.gellatti_share_photo_cleanup_release_stale_claims_v1();
--        (15 minutes after the claim; it records what Storage really has).
--   4. run this file.
--
-- It then restores `gellatti_set_share_photo_v1` exactly as 20260917103413
-- defined it (statement copied byte for byte) and removes the cleanup functions.
-- The ledger `recipe_share_photo_cleanup` and the control row are KEPT: they are
-- the record of what was queued, kept and deleted, and have no client access.
-- No photo, link, recipient or bucket is touched. A rollback CANNOT bring back a
-- photo the Storage API already deleted.

do $$
declare
  v_paused   boolean;
  v_inflight integer;
begin
  select paused into v_paused from public.recipe_share_photo_cleanup_control where id;
  select count(*) into v_inflight from public.recipe_share_photo_cleanup where status = 'claimed';
  if not coalesce(v_paused, false) then
    raise exception 'share_photo_cleanup_not_paused: run gellatti_share_photo_cleanup_pause_v1() first'
      using errcode = '55000';
  end if;
  if v_inflight > 0 then
    raise exception 'share_photo_cleanup_in_flight: % claim(s) still out; wait for gellatti_share_photo_cleanup_status_v1() to report in_flight 0', v_inflight
      using errcode = '55000';
  end if;
end $$;

do $$
begin
  perform cron.unschedule('gellatti-share-photo-cleanup');
exception when others then null;
end $$;

drop function if exists public.gellatti_share_photo_cleanup_tick_v1();
drop function if exists public.gellatti_share_photo_cleanup_settle_v1(uuid, text[], text);
drop function if exists public.gellatti_share_photo_cleanup_confirm_v1(uuid, text[]);
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

drop function if exists public.gellatti_share_photo_cleanup_release_stale_claims_v1();
drop function if exists public.gellatti_share_photo_cleanup_pause_v1(text);
drop function if exists public.gellatti_share_photo_cleanup_resume_v1();
drop function if exists public.gellatti_share_photo_cleanup_status_v1();
drop function if exists public.gellatti_share_photo_cleanup_is_due_v1(text, integer, integer, timestamptz, timestamptz);
drop function if exists public.gellatti_share_photo_link_lock_v1(uuid);
drop function if exists public.gellatti_share_photo_object_lock_v1(text);
