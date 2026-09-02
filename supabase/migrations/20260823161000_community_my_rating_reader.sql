-- ============================================================================
-- „Czy mogę ocenić, i jak oceniłem?" — a READ helper for the rating control
-- ============================================================================
-- NOT a second rating path. `gellatti_rate_publication_v1` remains the ONLY
-- writer, and it is what proves the confirmed make. This function answers the
-- two questions the control needs before it can render honestly:
--
--   * may this user rate at all (do they have a confirmed make)?
--   * have they already rated, and with what?
--
-- Both facts are already readable by the user through the owner-scoped SELECT
-- policies on recipe_make_events and recipe_ratings. Doing it here instead of
-- as two client table reads keeps the service surface narrow (one RPC, one
-- round trip) and keeps the eligibility rule stated in exactly one place.
--
-- It is advisory ONLY. A client that lies to itself about `can_rate` gains
-- nothing: the write still calls gellatti_rate_publication_v1, which re-reads
-- the caller's make events and raises `rating_requires_confirmed_make`
-- regardless of what the UI believed.
create or replace function public.gellatti_my_rating_v1(p_publication_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_make_count integer;
  v_rating public.recipe_ratings;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;

  -- Eligibility is a CONFIRMED MAKE and nothing else. Viewing, copying or
  -- remixing a recipe does not qualify (§42) — none of those write a
  -- recipe_make_events row.
  select count(*) into v_make_count from public.recipe_make_events e
  where e.publication_id = p_publication_id and e.user_id = v_uid;

  select * into v_rating from public.recipe_ratings r
  where r.publication_id = p_publication_id and r.user_id = v_uid;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'can_rate', v_make_count > 0,
    'confirmed_makes', v_make_count,
    'stars', v_rating.stars,
    'review', v_rating.review,
    'rated_at', v_rating.updated_at));
end;
$$;
revoke all on function public.gellatti_my_rating_v1(uuid) from public, anon, authenticated;
grant execute on function public.gellatti_my_rating_v1(uuid) to authenticated;
