-- ============================================================================
-- „Na podstawie … " on a PUBLISHED remix (§22)
-- ============================================================================
-- The lineage was already stored and unforgeable, and the deriving user could
-- read their own source through `gellatti_recipe_source_v1`. What was missing
-- is the half that matters most: §22 says a PUBLIC remix must DISPLAY
-- „Based on [Recipe] by [Creator]", and the public reader returned no lineage
-- at all — so Jan's published remix showed only Jan.
--
-- The card now carries `based_on` whenever the published recipe descends from
-- another PUBLISHED publication. `jsonb_strip_nulls` drops the key entirely
-- for an original recipe, so „original" and „remix" stay distinguishable
-- rather than one being an empty version of the other.
--
-- Deliberately narrow: it names the parent publication's title and its
-- creator's display name/handle, and nothing else. No formulation, no ids the
-- reader could not already resolve from the public route.
create or replace function public.gellatti_publication_card_v1(p_publication_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'publication_id', p.id,
    'title', p.title,
    'slug', p.slug,
    'description', p.description,
    'image_url', p.image_url,
    'category', p.category,
    'tags', to_jsonb(p.tags),
    'version_number', p.recipe_version_number,
    'published_at', p.published_at,
    'creator', jsonb_build_object(
      'handle', c.handle,
      'display_handle', c.display_handle,
      'display_name', c.display_name,
      'avatar_url', c.avatar_url,
      'country', c.country,
      'verification_status', c.verification_status),
    -- §22: attribution the remixer cannot remove, rendered publicly.
    'based_on', (
      select jsonb_build_object(
        'title', parent.title,
        'slug', parent.slug,
        'creator_display_name', parent_creator.display_name,
        'handle', case when parent_creator.is_public then parent_creator.handle else null end)
      from public.recipe_lineage lineage
      join public.community_publications parent
        on parent.id = lineage.parent_publication_id and parent.status = 'published'
      join public.creator_profiles parent_creator
        on parent_creator.id = parent.creator_profile_id
      where lineage.recipe_id = p.recipe_id
      limit 1),
    'metrics', jsonb_build_object(
      'unique_users', coalesce(m.unique_users, 0),
      'unique_makers', coalesce(m.unique_makers, 0),
      'total_makes', coalesce(m.total_makes, 0),
      'remix_count', coalesce(m.remix_count, 0),
      'rating_count', coalesce(m.rating_count, 0),
      'rating_average', case when coalesce(m.rating_count, 0) > 0
        then round(m.rating_sum::numeric / m.rating_count, 2) else null end)
  ))
  from public.community_publications p
  join public.creator_profiles c on c.id = p.creator_profile_id
  left join public.publication_metrics m on m.publication_id = p.id
  where p.id = p_publication_id and p.status = 'published' and c.moderation_status = 'ok';
$$;
revoke all on function public.gellatti_publication_card_v1(uuid) from public, anon, authenticated;
grant execute on function public.gellatti_publication_card_v1(uuid) to anon, authenticated;
