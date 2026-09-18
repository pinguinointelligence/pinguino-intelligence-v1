-- A customer's OWN photograph on a direct share (owner decisions 2026-09-17).
--
-- Owner-approved 2026-09-17 for the shared project tunabqqrwabacxjcxxkz (staging and
-- production). Applied exactly as this file, never through `db push`. Rollback: the
-- file with the same name in supabase/rollbacks/ (.rollback.sql).
--
-- Rule: a shared recipe shows the sharer's own photograph when one is attached,
-- otherwise the delivered card of the SHARED VERSION's profile (client authority
-- `recipeImageAuthority`, context `customer_share`).
--
-- Who may see the attached photograph (owner):
--   * anyone holding a valid, active, unexpired share TOKEN — a logged-out guest
--     included. The token is the share's own capability, exactly as in
--     gellatti_resolve_share_v1; signing in is not an extra condition for the
--     photograph. Recipe entitlement, gram redaction and the paywall are not
--     touched by this and stay where they are.
--   * without the token, only the sharer, the recipe owner or a recipient row
--     (the `/received` route) — a share id alone gives nothing.
--   * after a link is revoked or expires, EVERY new request is refused. There is
--     no signed URL and no public object: the image bytes are served by the
--     `share-photo` Edge Function, which asks gellatti_share_photo_v1 on every
--     request and only then reads the private object with the service role.
--
-- What this adds — and deliberately does NOT do:
--   * A PRIVATE bucket (never public, no client SELECT, no listing). A direct
--     share is not a Community publication.
--   * One photograph per link, uploaded by the sharer into
--     `<share_link_id>/<generated>.<ext>` (no account id in the path) and
--     attached through gellatti_set_share_photo_v1.
--   * No existing function, table, policy, token, expiry, paywall or grant is
--     changed. `recipe_input` is never returned; only its `category`, which the
--     demo-safe projection already exposes.

-- ── bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-share-photos',
  'recipe-share-photos',
  false,                                            -- PRIVATE: bytes only via share-photo
  10485760,                                         -- 10 MiB, same as Community photos
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── which photograph a link carries ─────────────────────────────────────────
-- RLS on and NO policy: clients cannot read or write this table at all. The
-- SECURITY DEFINER functions below (and service_role inside share-photo) are the
-- only way in. Grants are revoked as well, because this project's default
-- privileges grant DML on every new public table to anon and authenticated.
create table if not exists public.recipe_share_link_photos (
  share_link_id uuid primary key references public.recipe_share_links (id) on delete cascade,
  storage_path text not null unique,
  attached_by_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipe_share_link_photos enable row level security;
revoke all on table public.recipe_share_link_photos from public, anon, authenticated;

-- ── upload: only the sharer, into an ACTIVE link's own folder ───────────────
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

-- The ONLY client policy on this bucket. No select, update or delete policy:
-- nobody reads these objects with a client key, the owner included.
drop policy if exists recipe_share_photos_insert_sharer on storage.objects;
create policy recipe_share_photos_insert_sharer on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-share-photos'
    and public.gellatti_share_photo_folder_writable_v1((storage.foldername(name))[1])
  );

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

-- ── the one access decision (asked on EVERY photograph request) ─────────────
-- By TOKEN: anyone holding a valid token (guest or any account), the same
-- capability gellatti_resolve_share_v1 accepts. By ID: only the sharer, the
-- recipe owner or a recipient row, signed in. Revoked or expired → refused.
-- Returns whether a photograph is attached and the SHARED VERSION's profile —
-- never a storage path, never `recipe_input`.
create or replace function public.gellatti_share_photo_v1(
  p_share_link_id uuid default null, p_token text default null
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
  v_link public.recipe_share_links;
begin
  if v_token <> '' then
    select * into v_link from public.recipe_share_links
    where token_hash = extensions.digest(convert_to(v_token, 'UTF8'), 'sha256');
  elsif p_share_link_id is not null and v_uid is not null then
    select l.* into v_link from public.recipe_share_links l
    where l.id = p_share_link_id
      and (
        l.shared_by_user_id = v_uid
        or l.owner_user_id = v_uid
        or exists (
          select 1 from public.recipe_share_recipients r
          where r.share_link_id = l.id and r.recipient_user_id = v_uid));
  end if;
  if v_link.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_link.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_link.expires_at is not null and v_link.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'share_link_id', v_link.id,
    'category', (select v.recipe_input -> 'category' from public.recipe_versions v
                 where v.id = v_link.recipe_version_id),
    'has_own_photo', exists (
      select 1 from public.recipe_share_link_photos photo where photo.share_link_id = v_link.id)));
end;
$$;
revoke all on function public.gellatti_share_photo_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.gellatti_share_photo_v1(uuid, text) to anon, authenticated;
