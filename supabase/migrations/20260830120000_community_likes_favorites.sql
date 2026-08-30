-- ============================================================================
-- GELLATTI HOME §90/§91/§94 — Community Likes and Favourites
-- ============================================================================
-- Community v1 shipped RATINGS (`recipe_ratings`, 1–5 stars, gated on having
-- MADE the recipe) but no Like and no Favourite, and `global_catalog_favorites`
-- is about PRODUCTS, not publications. §90 asks for both, §91 for a liked-by
-- list, §94 for "login required, subscription NOT required".
--
-- DUPLICATES ARE PREVENTED STRUCTURALLY, not by application code: the primary
-- key IS (publication_id, user_id), so a double tap is an upsert no-op rather
-- than a second row. §109 asks us to verify "no duplicates"; this makes the
-- verification a property of the schema.
--
-- RLS LESSON APPLIED (from 20260829210000): a WITH CHECK predicate is evaluated
-- AS THE CALLER. Requiring "the publication is published" by selecting from
-- `community_publications` inside the policy would silently refuse every like
-- whenever that table's own RLS hides the row from the caller. So the check goes
-- through a SECURITY DEFINER predicate that answers yes/no with owner
-- privileges and exposes no publication data.
--
-- §94: the policies gate on `auth.uid()` ONLY. There is deliberately NO
-- entitlement/subscription term anywhere below — a free signed-in account may
-- like and favourite, and still cannot see grams (that is a different gate, in
-- the presentation layer).

-- ── owner-privileged predicate: is this a real, published publication? ───────
create or replace function public.gellatti_publication_is_published_v1(p_publication_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.community_publications p
    where p.id = p_publication_id and p.status = 'published'
  );
$$;

comment on function public.gellatti_publication_is_published_v1(uuid) is
  'Owner-privileged existence check for RLS predicates. Only the yes/no answer crosses the boundary — no publication row is exposed.';

grant execute on function public.gellatti_publication_is_published_v1(uuid) to authenticated;

-- ── likes ───────────────────────────────────────────────────────────────────
create table if not exists public.publication_likes (
  publication_id uuid not null references public.community_publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (publication_id, user_id)
);

create index if not exists publication_likes_user_idx
  on public.publication_likes (user_id, created_at desc);

alter table public.publication_likes enable row level security;

drop policy if exists publication_likes_select_own on public.publication_likes;
create policy publication_likes_select_own on public.publication_likes
  for select using (auth.uid() = user_id);

drop policy if exists publication_likes_insert_own on public.publication_likes;
create policy publication_likes_insert_own on public.publication_likes
  for insert with check (
    auth.uid() = user_id
    and public.gellatti_publication_is_published_v1(publication_id)
  );

drop policy if exists publication_likes_delete_own on public.publication_likes;
create policy publication_likes_delete_own on public.publication_likes
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.publication_likes to authenticated;

-- ── favourites ──────────────────────────────────────────────────────────────
create table if not exists public.publication_favorites (
  publication_id uuid not null references public.community_publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (publication_id, user_id)
);

create index if not exists publication_favorites_user_idx
  on public.publication_favorites (user_id, created_at desc);

alter table public.publication_favorites enable row level security;

drop policy if exists publication_favorites_select_own on public.publication_favorites;
create policy publication_favorites_select_own on public.publication_favorites
  for select using (auth.uid() = user_id);

drop policy if exists publication_favorites_insert_own on public.publication_favorites;
create policy publication_favorites_insert_own on public.publication_favorites
  for insert with check (
    auth.uid() = user_id
    and public.gellatti_publication_is_published_v1(publication_id)
  );

drop policy if exists publication_favorites_delete_own on public.publication_favorites;
create policy publication_favorites_delete_own on public.publication_favorites
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.publication_favorites to authenticated;

-- ── social counters + the viewer's own state ────────────────────────────────
-- Counts must be visible to EVERYONE (an anonymous visitor sees "12 likes",
-- §93), but the rows themselves stay private to their owner — nobody may
-- enumerate another account's likes through the table. So the aggregate is a
-- SECURITY DEFINER reader and the base-table SELECT policy stays owner-only.
create or replace function public.gellatti_publication_social_v1(p_publication_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select jsonb_build_object(
    'publication_id', p_publication_id,
    'like_count', (select count(*) from public.publication_likes l where l.publication_id = p_publication_id),
    'favorite_count', (select count(*) from public.publication_favorites f where f.publication_id = p_publication_id),
    'viewer_liked', auth.uid() is not null and exists (
      select 1 from public.publication_likes l
      where l.publication_id = p_publication_id and l.user_id = auth.uid()),
    'viewer_favorited', auth.uid() is not null and exists (
      select 1 from public.publication_favorites f
      where f.publication_id = p_publication_id and f.user_id = auth.uid())
  )
  where public.gellatti_publication_is_published_v1(p_publication_id);
$$;

comment on function public.gellatti_publication_social_v1(uuid) is
  'GELLATTI HOME §90 — public like/favourite counts plus the calling viewer''s own state. Never exposes who else liked; that is gellatti_publication_likers_v1.';

grant execute on function public.gellatti_publication_social_v1(uuid) to anon, authenticated;

-- ── §91 the liked-by list ───────────────────────────────────────────────────
-- Avatar, display name and a link to the PUBLIC profile — and nothing else.
-- No user id, no email, no messaging handle (§92 has no messaging at all).
--
-- PRIVACY RULE: only likers who have chosen a PUBLIC creator profile are
-- listed. Someone who liked a recipe without a public profile is counted in
-- `like_count` but is not named — liking must not out an account.
create or replace function public.gellatti_publication_likers_v1(
  p_publication_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  handle text,
  display_handle text,
  display_name text,
  avatar_url text,
  liked_at timestamptz
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select c.handle, c.display_handle, c.display_name, c.avatar_url, l.created_at as liked_at
  from public.publication_likes l
  join public.creator_profiles c
    on c.user_id = l.user_id
   and c.is_public
   and c.moderation_status = 'ok'
  where l.publication_id = p_publication_id
    and public.gellatti_publication_is_published_v1(p_publication_id)
  order by l.created_at desc
  limit greatest(0, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.gellatti_publication_likers_v1(uuid, integer, integer) is
  'GELLATTI HOME §91 — who liked a publication: avatar, display name and public handle only. Likers without a PUBLIC creator profile are counted but never named.';

grant execute on function public.gellatti_publication_likers_v1(uuid, integer, integer) to anon, authenticated;
