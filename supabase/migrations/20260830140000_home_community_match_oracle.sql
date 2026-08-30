-- ============================================================================
-- GELLATTI HOME §32–§40 — Community match oracle
-- ============================================================================
-- WHY A SERVER-SIDE MATCHER AT ALL: the public Community card
-- (`gellatti_top_recipes_v1`) carries title, tags, category, creator, metrics and
-- `based_on` — but no ingredients. §32 requires that EVERY requested canonical
-- ingredient identity be present before a recipe may be offered as a match, and the
-- owner is explicit that title similarity is not sufficient proof. Evaluating that
-- rule therefore has to happen where the version rows live.
--
-- WHAT THIS IS, PRECISELY: a MATCH oracle, not a formulation oracle. It answers
-- "does this publication satisfy the requested identities?" and returns the public
-- presentation a match needs.
--
-- GRAM BOUNDARY (the one hard rule): no gram, no ratio, no percentage, no mass and
-- no ordering-by-mass leaves this function. Recipe COMPOSITION is public in Gellatti
-- — ingredient identities and names are normal recipe presentation — but exact grams
-- are gated by the existing entitlement authority, and nothing here may become a side
-- channel that reconstructs them. `also_includes` is a NAME list; it is deliberately
-- unordered with respect to mass and carries no quantity.
--
-- RANKING: this function invents NO popularity model. Candidates come from
-- `gellatti_top_recipes_v1`, and that function's order is preserved verbatim as
-- `rank` via WITH ORDINALITY. Strict identity matching is applied only as a FILTER on
-- top of that order (§34, §110).
--
-- VISIBILITY: published publications with an `ok`-moderated creator only. Drafts,
-- `unpublished` and `hidden_by_moderation` rows cannot appear, and the function never
-- reads a private/unpublished recipe. It grants an anonymous caller nothing beyond
-- what the existing public Community surfaces already show.

create or replace function public.gellatti_match_community_top100_v1(
  p_ingredient_ids text[],
  p_category text default null,
  p_limit integer default 10
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with top100 as (
    -- The ONE ranking authority. Order is preserved as `rank`; nothing is re-scored.
    select (elem->>'publication_id')::uuid as publication_id, ord as rank
    from jsonb_array_elements(public.gellatti_top_recipes_v1('all_time', 100))
      with ordinality as ranked(elem, ord)
  ),
  eligible as (
    select
      t.rank,
      p.id as publication_id,
      p.slug, p.title, p.description, p.image_url, p.category,
      p.published_at, p.recipe_version_number,
      p.creator_profile_id,
      p.recipe_id,
      v.recipe_input
    from top100 t
    join public.community_publications p
      on p.id = t.publication_id
     and p.status = 'published'
    join public.creator_profiles c
      on c.id = p.creator_profile_id
     and c.moderation_status = 'ok'
    join public.recipe_versions v
      on v.recipe_id = p.recipe_id
     and v.version_number = p.recipe_version_number
    -- §40: when the profile is known, only compatible recipes are considered.
    where p_category is null or lower(coalesce(p.category, '')) = lower(p_category)
  ),
  composed as (
    select
      e.*,
      coalesce((
        select array_agg(distinct coalesce(
          item->'ingredient'->>'canonical_ingredient_id',
          item->'ingredient'->>'id'))
        from jsonb_array_elements(coalesce(e.recipe_input->'items', '[]'::jsonb)) item
      ), array[]::text[]) as ingredient_ids,
      coalesce((
        -- NAMES ONLY. No planned_grams, no actual_grams, no share of batch, and the
        -- aggregate is ordered by NAME so nothing about mass order can be inferred.
        select jsonb_agg(distinct item->'ingredient'->>'name' order by item->'ingredient'->>'name')
        from jsonb_array_elements(coalesce(e.recipe_input->'items', '[]'::jsonb)) item
        where coalesce(
          item->'ingredient'->>'canonical_ingredient_id',
          item->'ingredient'->>'id') <> all (coalesce(p_ingredient_ids, array[]::text[]))
      ), '[]'::jsonb) as also_includes
    from eligible e
  )
  select coalesce(jsonb_agg(card order by rank), '[]'::jsonb)
  from (
    select
      c.rank,
      jsonb_build_object(
        'publication_id', c.publication_id,
        'slug', c.slug,
        'title', c.title,
        'description', c.description,
        'image_url', c.image_url,
        'category', c.category,
        'published_at', c.published_at,
        'version_number', c.recipe_version_number,
        'rank', c.rank,
        -- §32 satisfied: this is the ANSWER, not the evidence trail.
        'all_requested_present', true,
        -- §36 "Also includes: …" — public ingredient NAMES, never quantities.
        'also_includes', c.also_includes,
        'creator', jsonb_build_object(
          'handle', cp.handle,
          'display_handle', cp.display_handle,
          'display_name', cp.display_name,
          'avatar_url', cp.avatar_url,
          'verification_status', cp.verification_status),
        -- §38: the ORIGINAL creator, reusing the canonical card authority.
        'based_on', public.gellatti_publication_card_v1(c.publication_id)->'based_on'
      ) as card
    from composed c
    join public.creator_profiles cp on cp.id = c.creator_profile_id
    where cardinality(coalesce(p_ingredient_ids, array[]::text[])) > 0
      -- §32 STRICT: every requested identity must be present. `<@` is containment,
      -- not overlap — a recipe missing one requested ingredient is not a weaker
      -- match, it is not a match.
      and coalesce(p_ingredient_ids, array[]::text[]) <@ c.ingredient_ids
    order by c.rank
    limit greatest(0, least(coalesce(p_limit, 10), 25))
  ) ordered;
$$;

comment on function public.gellatti_match_community_top100_v1(text[], text, integer) is
  'GELLATTI HOME §32-§40 — Top100 match oracle. Answers whether a published Community recipe contains EVERY requested canonical ingredient, and returns public card data plus ingredient NAMES. Never returns grams, ratios or any mass ordering. Ranking comes from gellatti_top_recipes_v1 and is never recomputed.';

-- Anonymous callers may match, exactly as they may already browse Community (§93).
-- The function exposes no more than the existing public surfaces do.
grant execute on function public.gellatti_match_community_top100_v1(text[], text, integer)
  to anon, authenticated;
