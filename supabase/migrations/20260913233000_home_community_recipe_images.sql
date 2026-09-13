-- HOME Community publications require the maker's own camera/gallery photo.
-- Public delivery is intentional: Community cards are public, while writes and
-- deletes remain pinned to the authenticated owner's first path segment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-recipe-images',
  'community-recipe-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_recipe_images_insert_own on storage.objects;
create policy community_recipe_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists community_recipe_images_delete_own on storage.objects;
create policy community_recipe_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A publication must carry a non-stock image. The Storage policy above proves
-- ownership for app uploads; this constraint also refuses the old branded and
-- recipe-library fallbacks at the durable publication boundary.
create or replace function public.gellatti_publish_recipe_v1(
  p_recipe_id uuid, p_version_number integer, p_slug text, p_title text,
  p_description text default null, p_image_url text default null,
  p_category text default null, p_tags text[] default '{}'
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.creator_profiles;
  v_version public.recipe_versions;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_image_url text := btrim(coalesce(p_image_url, ''));
  v_image_marker constant text := '/storage/v1/object/public/community-recipe-images/';
  v_image_path text;
  v_pub public.community_publications;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_profile from public.creator_profiles where user_id = v_uid;
  if v_profile.id is null then raise exception 'creator_profile_required' using errcode = '42501'; end if;
  if v_profile.moderation_status in ('restricted', 'suspended') then
    raise exception 'creator_moderation_block' using errcode = '42501';
  end if;
  select * into v_version from public.recipe_versions
  where recipe_id = p_recipe_id and version_number = p_version_number and owner_user_id = v_uid;
  if v_version.id is null then raise exception 'recipe_version_not_found' using errcode = '42501'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'slug_invalid' using errcode = '22023'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'title_required' using errcode = '22023'; end if;
  if v_image_url = '' or position(v_image_marker in v_image_url) = 0 then
    raise exception 'community_photo_required' using errcode = '22023';
  end if;
  v_image_path := split_part(split_part(v_image_url, v_image_marker, 2), '?', 1);
  if v_image_path not like v_uid::text || '/%'
     or not exists (
       select 1 from storage.objects object
       where object.bucket_id = 'community-recipe-images'
         and object.name = v_image_path
     ) then
    raise exception 'community_photo_not_owned' using errcode = '42501';
  end if;

  select * into v_pub from public.community_publications
  where recipe_version_id = v_version.id and status = 'published';
  if v_pub.id is not null then
    update public.community_publications set
      slug = v_slug, title = btrim(p_title), description = p_description,
      image_url = v_image_url, category = p_category, tags = coalesce(p_tags, '{}')
    where id = v_pub.id returning * into v_pub;
  else
    insert into public.community_publications (
      creator_profile_id, creator_user_id, recipe_id, recipe_version_id,
      recipe_version_number, slug, title, description, image_url, category, tags,
      public_projection)
    values (
      v_profile.id, v_uid, p_recipe_id, v_version.id, v_version.version_number,
      v_slug, btrim(p_title), p_description, v_image_url, p_category, coalesce(p_tags, '{}'),
      public.gellatti_demo_safe_projection_v1(v_version.recipe_input))
    returning * into v_pub;
    insert into public.publication_metrics (publication_id) values (v_pub.id)
    on conflict (publication_id) do nothing;
  end if;
  perform public.gellatti_recompute_creator_metrics_v1(v_profile.id);
  return jsonb_build_object(
    'publication_id', v_pub.id, 'handle', v_profile.handle, 'slug', v_pub.slug,
    'version_number', v_pub.recipe_version_number, 'status', v_pub.status);
end;
$$;
revoke all on function public.gellatti_publish_recipe_v1(uuid, integer, text, text, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.gellatti_publish_recipe_v1(uuid, integer, text, text, text, text, text, text[])
  to authenticated;
