-- ============================================================================
-- Community v1 — confirmed makes resolved from the production run, plus two
-- anti-gaming corrections found while wiring the UI.
-- ============================================================================
-- ADDITIVE. No table is dropped, no existing column changes meaning.
--
-- ── 1. The make must be resolved server-side, not asserted by the client ────
-- `gellatti_record_make_v1` takes a publication id from the caller. That was
-- fine as a primitive, but it means the CLIENT decides which publication a
-- make belongs to — and the client is not an authority on attribution (§50).
--
-- `gellatti_record_make_for_run_v1` takes ONLY a production run id and derives
-- everything else:
--   * the run must be the caller's own, and `completed`;
--   * the publication is read from `recipe_lineage` for the run's recipe —
--     the DIRECT parent, i.e. the publication the maker actually copied. The
--     root gets its credit through remix_count, not by absorbing the makes of
--     every descendant, which would let one popular remix inflate an ancestor
--     it no longer resembles;
--   * a run whose recipe has no Community source records nothing at all and
--     says so, rather than failing.
--
-- Idempotency vs. genuine repetition (§41), the distinction that matters:
--   * the SAME run completing twice (a retry, a double click, a recovered
--     error path) hits `on conflict (production_run_id) do nothing` — one make;
--   * the SAME user making the recipe AGAIN later is a NEW production run with
--     a new id — a second make, which is exactly right.
--
-- ── 2. `recipe_make_events_unique_maker_idx` had to go ──────────────────────
-- It was unique on (publication_id, user_id, occurred_at) with
-- `occurred_at default now()`. `now()` is TRANSACTION start time, so two makes
-- recorded in one transaction would collide and the second would be rejected —
-- a constraint that silently drops a legitimate second make. The real
-- idempotency anchor is the unique `production_run_id`, which is exactly one
-- row per real run. Dropping the redundant index removes a false negative
-- without weakening anything.
--
-- ── 3. remix_count counts DISTINCT remixers ────────────────────────────────
-- It counted rows, so one account remixing a publication fifty times would add
-- fifty to its score. `unique_users` and `unique_makers` were already distinct;
-- this closes the one remaining raw-count vector (§50).

drop index if exists public.recipe_make_events_unique_maker_idx;

create index if not exists recipe_make_events_publication_user_idx
  on public.recipe_make_events (publication_id, user_id);

-- ---------------------------------------------------------------------------
-- Make, resolved from a completed production run
-- ---------------------------------------------------------------------------
create or replace function public.gellatti_record_make_for_run_v1(p_production_run_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_run public.production_runs;
  v_pub public.community_publications;
  v_pub_id uuid;
  v_event public.recipe_make_events;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_production_run_id is null then
    return jsonb_build_object('recorded', false, 'reason', 'production_run_required');
  end if;

  -- Proof of work: the caller's OWN run, and actually completed. Opening a
  -- recipe, previewing it or starting a run is not making it.
  select * into v_run from public.production_runs
  where id = p_production_run_id and owner_user_id = v_uid and status = 'completed';
  if v_run.id is null then
    return jsonb_build_object('recorded', false, 'reason', 'run_not_completed_by_caller');
  end if;

  -- The publication this recipe was derived from (direct parent).
  select coalesce(l.parent_publication_id, l.root_publication_id) into v_pub_id
  from public.recipe_lineage l where l.recipe_id = v_run.recipe_id;

  -- Or: the run's recipe IS itself published (a creator making their own).
  -- Recorded for completeness; self-actions are excluded from every metric.
  if v_pub_id is null then
    select p.id into v_pub_id from public.community_publications p
    where p.recipe_id = v_run.recipe_id and p.status = 'published'
    order by p.published_at desc limit 1;
  end if;

  if v_pub_id is null then
    return jsonb_build_object('recorded', false, 'reason', 'no_community_source');
  end if;

  select * into v_pub from public.community_publications where id = v_pub_id;
  if v_pub.id is null then
    return jsonb_build_object('recorded', false, 'reason', 'no_community_source');
  end if;

  insert into public.recipe_make_events (publication_id, user_id, production_run_id, recipe_id)
  values (v_pub_id, v_uid, p_production_run_id, v_run.recipe_id)
  on conflict (production_run_id) do nothing
  returning * into v_event;

  if v_event.id is null then
    -- A retry of a run already counted. Not an error, and not a second make.
    return jsonb_build_object('recorded', false, 'reason', 'already_recorded',
      'publication_id', v_pub_id);
  end if;

  perform public.gellatti_recompute_publication_metrics_v1(v_pub_id);
  perform public.gellatti_recompute_creator_metrics_v1(v_pub.creator_profile_id);
  return jsonb_build_object('recorded', true, 'make_event_id', v_event.id,
    'publication_id', v_pub_id);
end;
$$;
revoke all on function public.gellatti_record_make_for_run_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_record_make_for_run_v1(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remix_count → distinct remixers
-- ---------------------------------------------------------------------------
create or replace function public.gellatti_recompute_publication_metrics_v1(p_publication_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_pub public.community_publications;
begin
  select * into v_pub from public.community_publications where id = p_publication_id;
  if v_pub.id is null then return; end if;

  insert into public.publication_metrics as m (publication_id) values (p_publication_id)
  on conflict (publication_id) do nothing;

  update public.publication_metrics m set
    unique_users = coalesce((
      select count(distinct u.user_id) from public.recipe_usage_events u
      where u.publication_id = p_publication_id and u.user_id <> v_pub.creator_user_id), 0),
    -- DISTINCT: one account remixing fifty times is one remixer (§50).
    remix_count = coalesce((
      select count(distinct u.user_id) from public.recipe_usage_events u
      where u.publication_id = p_publication_id and u.event_type = 'remixed'
        and u.user_id <> v_pub.creator_user_id), 0),
    unique_makers = coalesce((
      select count(distinct e.user_id) from public.recipe_make_events e
      where e.publication_id = p_publication_id and e.user_id <> v_pub.creator_user_id), 0),
    total_makes = coalesce((
      select count(*) from public.recipe_make_events e
      where e.publication_id = p_publication_id and e.user_id <> v_pub.creator_user_id), 0),
    makes_last_7d = coalesce((
      select count(*) from public.recipe_make_events e
      where e.publication_id = p_publication_id and e.user_id <> v_pub.creator_user_id
        and e.occurred_at > now() - interval '7 days'), 0),
    makes_last_30d = coalesce((
      select count(*) from public.recipe_make_events e
      where e.publication_id = p_publication_id and e.user_id <> v_pub.creator_user_id
        and e.occurred_at > now() - interval '30 days'), 0),
    rating_count = coalesce((
      select count(*) from public.recipe_ratings r
      where r.publication_id = p_publication_id and r.status = 'active'
        and r.user_id <> v_pub.creator_user_id), 0),
    rating_sum = coalesce((
      select sum(r.stars)::integer from public.recipe_ratings r
      where r.publication_id = p_publication_id and r.status = 'active'
        and r.user_id <> v_pub.creator_user_id), 0),
    last_activity_at = greatest(
      (select max(e.occurred_at) from public.recipe_make_events e where e.publication_id = p_publication_id),
      (select max(u.occurred_at) from public.recipe_usage_events u where u.publication_id = p_publication_id)),
    recomputed_at = now()
  where m.publication_id = p_publication_id;
end;
$$;
revoke all on function public.gellatti_recompute_publication_metrics_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lineage for a recipe the caller owns — powers „Na podstawie … " in the UI
-- ---------------------------------------------------------------------------
-- The deriving user can already SELECT their own recipe_lineage row, but the
-- parent's TITLE and the source creator's DISPLAY NAME live on rows they
-- cannot read. This returns exactly those two display strings and nothing
-- else, so attribution can be rendered without widening any table policy.
create or replace function public.gellatti_recipe_source_v1(p_recipe_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_lineage public.recipe_lineage;
  v_pub public.community_publications;
  v_creator public.creator_profiles;
  v_title text;
  v_availability text := 'available';
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_lineage from public.recipe_lineage
  where recipe_id = p_recipe_id and derived_user_id = v_uid;
  if v_lineage.id is null then return jsonb_build_object('ok', false, 'reason', 'no_source'); end if;

  if v_lineage.parent_publication_id is not null then
    select * into v_pub from public.community_publications where id = v_lineage.parent_publication_id;
    v_title := v_pub.title;
    if v_pub.id is null or v_pub.status <> 'published' then v_availability := 'unpublished'; end if;
  else
    select l.title into v_title from public.recipe_share_links l where l.id = v_lineage.parent_share_link_id;
  end if;

  select * into v_creator from public.creator_profiles
  where user_id = coalesce(v_lineage.root_creator_user_id, v_lineage.parent_creator_user_id);
  if v_lineage.parent_creator_user_id is null and v_lineage.root_creator_user_id is null then
    v_availability := 'creator_unavailable';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'relation', v_lineage.relation,
    'depth', v_lineage.depth,
    'availability', v_availability,
    'source_title', v_title,
    'source_creator_display_name', v_creator.display_name,
    'source_creator_handle', case when v_creator.is_public then v_creator.handle else null end,
    'parent_publication_id', v_lineage.parent_publication_id,
    'root_publication_id', v_lineage.root_publication_id));
end;
$$;
revoke all on function public.gellatti_recipe_source_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_recipe_source_v1(uuid) to authenticated;
