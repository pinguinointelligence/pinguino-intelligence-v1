-- ============================================================================
-- GELLATTI HOME §38/§107 — public attribution must name the ORIGINAL creator
-- ============================================================================
-- DEFECT (pre-existing, since 20260823154500): `gellatti_publication_card_v1`
-- resolved `based_on` from `recipe_lineage.parent_publication_id` — the recipe
-- the remixer personally started from. For a first-generation remix that IS the
-- original, so the bug was invisible. At depth 2 it is wrong:
--
--   Maria publishes A. Tomek remixes A → B. Anna remixes B → C.
--   C publicly credited TOMEK. §38 requires MARIA.
--
-- The data to fix it was already stored: `recipe_lineage` stamps
-- `root_publication_id` / `root_creator_user_id` at derivation time (see
-- 20260823140000, `v_root_pub := coalesce(parent_lineage.root_publication_id,
-- v_pub.id)`), precisely so root resolution is ONE hop and never an ancestor
-- walk. The card simply read the wrong column.
--
-- FIX: `based_on` resolves the ROOT publication, falling back to the parent when
-- there is no published root (a share-link derivation has a parent share link and
-- no root publication). Authorship travels DOWN the whole family tree and is
-- never transferable — which is exactly what `lineage.ts` already documents and
-- what the card now finally renders.
--
-- SCOPE: this is the ONLY change. Every other key of the card is byte-identical,
-- including the metrics block and the moderation/status gates. §107 is respected:
-- the FULL chain stays in `recipe_lineage` for internal/admin history; the PUBLIC
-- card names the original creator and nothing else.
--
-- Additive and reversible: `create or replace` on a function, no data touched.

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
    -- §38: the ORIGINAL creator of the family — the name no later editor,
    -- sharer or partner can overwrite, at any remix depth.
    'based_on', (
      select jsonb_build_object(
        'title', origin.title,
        'slug', origin.slug,
        'creator_display_name', origin_creator.display_name,
        'handle', case when origin_creator.is_public then origin_creator.handle else null end)
      from public.recipe_lineage lineage
      join public.community_publications origin
        on origin.id = coalesce(lineage.root_publication_id, lineage.parent_publication_id)
       and origin.status = 'published'
      join public.creator_profiles origin_creator
        on origin_creator.id = origin.creator_profile_id
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

comment on function public.gellatti_publication_card_v1(uuid) is
  'Public publication card. `based_on` names the ORIGINAL creator of the family (recipe_lineage.root_*), never the intermediate remixer — GELLATTI HOME §38.';
