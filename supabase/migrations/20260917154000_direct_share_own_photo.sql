-- A customer's OWN photograph on a direct share (owner decision 2026-09-17).
--
-- READY / NOT APPLIED — WAITING OWNER DB APPROVAL. Apply exactly this file, never
-- through `db push`. Rollback: supabase/rollbacks/20260917154000_direct_share_own_photo.rollback.sql
--
-- Rule: a shared recipe shows the sharer's own photograph when one is attached,
-- otherwise the branded card of the shared version's profile (client authority
-- `recipeImageAuthority`, context `customer_share`). Until now nothing could
-- carry that photograph: no share, recipe or version table stores one.
--
-- What this adds — and deliberately does NOT do:
--   * A PRIVATE bucket. A direct share is not a Community publication, so its
--     photograph is never in the public `community-recipe-images` bucket and
--     never has a public URL. It is read through short-lived signed URLs.
--   * One photo per share link, attached by the person who shared it. Objects
--     live under `<share_link_id>/<generated>.<ext>`: the path carries no
--     account id, only the link id the recipient already receives.
--   * Readable by the sharer, the recipe owner and recipients who opened the
--     link — only while the link is active and not expired. Revoking the link
--     revokes the photograph; nothing is copied into the recipe or its version.
--   * No existing function, table, policy, token, expiry, paywall or grant is
--     changed. `recipe_input` is never read or returned here.
--   * Logged-out visitors (`gellatti_resolve_share_v1`) get no photograph: a
--     private object cannot be signed for an anonymous token holder without a
--     server-side signer (an Edge Function), which is out of this package.

-- ── bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-share-photos',
  'recipe-share-photos',
  false,                                            -- PRIVATE: signed URLs only
  10485760,                                         -- 10 MiB, same as Community photos
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── which photograph a link carries ─────────────────────────────────────────
-- RLS on and NO policy: clients cannot read or write this table at all. The two
-- SECURITY DEFINER functions below are the only way in. Grants are revoked as
-- well, because this project's default privileges grant DML on every new
-- public table to anon and authenticated.
create table if not exists public.recipe_share_link_photos (
  share_link_id uuid primary key references public.recipe_share_links (id) on delete cascade,
  storage_path text not null unique,
  attached_by_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipe_share_link_photos enable row level security;
revoke all on table public.recipe_share_link_photos from public, anon, authenticated;

-- ── policy helpers (SECURITY DEFINER: recipients cannot read share links) ────
-- May the caller upload into this link's folder? Only its sharer, while active.
create or replace function public.gellatti_share_photo_folder_writable_v1(p_folder text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.recipe_share_links l
    where l.id = case
        when p_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then p_folder::uuid end
      and l.shared_by_user_id = auth.uid()
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > now()));
$$;
revoke all on function public.gellatti_share_photo_folder_writable_v1(text)
  from public, anon, authenticated;
grant execute on function public.gellatti_share_photo_folder_writable_v1(text) to authenticated;

-- May the caller read this object? Only the photograph ATTACHED to a link that
-- is active and unexpired, and only for its sharer, its recipe owner, or a
-- recipient the link was opened by (the same membership that
-- gellatti_open_received_share_v1 accepts).
create or replace function public.gellatti_share_photo_readable_v1(p_object_name text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (
    select 1
    from public.recipe_share_link_photos photo
    join public.recipe_share_links l on l.id = photo.share_link_id
    where photo.storage_path = p_object_name
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > now())
      and (
        l.shared_by_user_id = auth.uid()
        or l.owner_user_id = auth.uid()
        or exists (
          select 1 from public.recipe_share_recipients r
          where r.share_link_id = l.id and r.recipient_user_id = auth.uid())));
$$;
revoke all on function public.gellatti_share_photo_readable_v1(text)
  from public, anon, authenticated;
grant execute on function public.gellatti_share_photo_readable_v1(text) to authenticated;

-- ── storage.objects policies (authenticated only, this bucket only) ─────────
drop policy if exists recipe_share_photos_insert_sharer on storage.objects;
create policy recipe_share_photos_insert_sharer on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-share-photos'
    and public.gellatti_share_photo_folder_writable_v1((storage.foldername(name))[1])
  );

-- The uploader always sees their own object (needed to remove it); everyone
-- else only through an attached, active link.
drop policy if exists recipe_share_photos_select_party on storage.objects;
create policy recipe_share_photos_select_party on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-share-photos'
    and (
      owner_id = (select auth.uid())::text
      or public.gellatti_share_photo_readable_v1(name)
    )
  );

drop policy if exists recipe_share_photos_delete_own on storage.objects;
create policy recipe_share_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-share-photos'
    and owner_id = (select auth.uid())::text
  );
-- No update policy: a photograph is replaced by uploading a new object and
-- attaching it, never rewritten in place. No anon policy, no public read.

-- ── attach / detach (the sharer, on an active link) ─────────────────────────
-- p_storage_path NULL or blank detaches: the recipient sees the profile card
-- again. Attaching requires an object the caller uploaded into THIS link's
-- folder, with a generated name and an accepted extension.
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

-- ── read (sharer, recipe owner, or a recipient of the link) ─────────────────
-- Returns the attached object path (to sign with the caller's own JWT) and the
-- SHARED VERSION's profile — never the caller's profile and never
-- `recipe_input`. A stranger, a revoked or an expired link gets no path.
create or replace function public.gellatti_share_photo_v1(p_share_link_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_link public.recipe_share_links;
  v_path text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select l.* into v_link from public.recipe_share_links l
  where l.id = p_share_link_id
    and (
      l.shared_by_user_id = v_uid
      or l.owner_user_id = v_uid
      or exists (
        select 1 from public.recipe_share_recipients r
        where r.share_link_id = l.id and r.recipient_user_id = v_uid));
  if v_link.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_link.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_link.expires_at is not null and v_link.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select photo.storage_path into v_path
  from public.recipe_share_link_photos photo where photo.share_link_id = v_link.id;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'share_link_id', v_link.id,
    'category', (select v.recipe_input -> 'category' from public.recipe_versions v
                 where v.id = v_link.recipe_version_id),
    'own_photo_path', v_path));
end;
$$;
revoke all on function public.gellatti_share_photo_v1(uuid) from public, anon, authenticated;
grant execute on function public.gellatti_share_photo_v1(uuid) to authenticated;
