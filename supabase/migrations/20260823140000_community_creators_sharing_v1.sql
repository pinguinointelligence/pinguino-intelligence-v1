-- ============================================================================
-- Gellatti Community / Creators / Direct Sharing / Partner attribution — v1
-- ============================================================================
-- ADDITIVE ONLY. Nothing in the Engine, Mapper, saved_recipes (0001),
-- saved_recipe_meta / recipe_versions (0027) or the billing/partner platform
-- (0014–0021) is altered. Community and Sharing sit ON TOP of the existing
-- immutable recipe-version architecture.
--
-- ── The three visibility states (locked) ────────────────────────────────────
--   A. PRIVATE   — a normal saved_recipes row. Unchanged. The DEFAULT for
--                  every recipe that already exists: this migration creates
--                  no publication and no share for any existing row, so a
--                  migrated recipe can never become public by accident.
--   B. UNLISTED  — reachable through ONE row in recipe_share_links, addressed
--                  by a high-entropy token that is stored ONLY as a SHA-256
--                  hash. Not searchable, not ranked, `noindex` at the edge.
--   C. PUBLISHED — an explicit row in community_publications. Discoverable,
--                  rankable, publicly readable.
--
-- ── Immutable version rule (locked, §5 of the product spec) ─────────────────
-- Both a publication and a share link bind `recipe_version_id` → the
-- IMMUTABLE public.recipe_versions row. recipe_versions has SELECT+INSERT
-- only (0027) — no update path exists anywhere — so a share of V1 keeps
-- meaning V1 forever, and publishing V2 creates a SECOND publication row
-- rather than rewriting the first.
--
-- ── Demo data security (locked, §16 of the product spec) ────────────────────
-- Hiding grams in the client is not security. Non-entitled readers never
-- receive `recipe_input`: RLS grants NO client SELECT on the version body for
-- anyone but its owner, and every public/demo read goes through a SECURITY
-- DEFINER function that returns only
-- `public.gellatti_demo_safe_projection_v1(recipe_input)` — a WHITELIST that
-- emits ingredient NAMES and recipe structure and can never emit a gram, a
-- composition profile, a cost or a Mapper identifier.
--
-- ── Partner attribution (locked, §23–§34) ───────────────────────────────────
-- No parallel referral system is created. A share link carries `partner_id`;
-- opening it writes evidence into the EXISTING public.referral_clicks /
-- public.referral_attributions ledger (0017), so the existing commission
-- machinery (0018–0019) is the one and only money path. Three roles stay
-- separate on every share row: `creator_user_id` (authorship — never
-- transferable), `shared_by_user_id` (who sent it), `partner_id` (who earns).

-- ---------------------------------------------------------------------------
-- 0. Shared helpers
-- ---------------------------------------------------------------------------

-- Admin/moderation predicate — mirrors 0025 admin_users (no self-promotion).
create or replace function public.gellatti_is_admin_v1()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select auth.uid() is not null and exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.revoked_at is null
  );
$$;
revoke all on function public.gellatti_is_admin_v1() from public, anon, authenticated;
grant execute on function public.gellatti_is_admin_v1() to authenticated;

-- Paid-entitlement predicate for a GIVEN user. Entitlements are the ACCESS
-- source of truth (locked decision 8, migration 0015); the older
-- customer_subscriptions cache is the additive fallback so an account that
-- predates the entitlement writer is never wrongly downgraded to Demo.
-- Deliberately scope-agnostic: Home AND Pro both unlock a shared recipe's
-- exact formulation; what each plan may then DO with it stays with the
-- existing capability matrix in the app.
create or replace function public.gellatti_has_paid_access_v1(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select p_user_id is not null and (
    exists (
      select 1 from public.entitlements e
      where e.user_id = p_user_id
        and e.scope in ('home', 'pro')
        and e.status = 'active'
        and e.starts_at <= statement_timestamp()
        and (e.ends_at is null or e.ends_at > statement_timestamp())
    )
    or exists (
      select 1 from public.customer_subscriptions s
      where s.user_id = p_user_id
        and (
          s.status in ('active', 'trialing')
          or (s.status = 'past_due'
              and s.current_period_end is not null
              and s.current_period_end > statement_timestamp())
        )
    )
  );
$$;
revoke all on function public.gellatti_has_paid_access_v1(uuid) from public, anon, authenticated;

-- ── THE demo-safe projection (single chokepoint) ────────────────────────────
-- WHITELIST, never a blacklist: the output object is BUILT from named safe
-- fields, so a new Engine field added to recipe_input tomorrow is absent here
-- by construction instead of leaking until somebody remembers to redact it.
-- Emitted: category, mode, target temperature, batch size, and per line the
-- ingredient NAME + coarse ingredient category + lock/role markers.
-- NEVER emitted: planned_grams, actual_grams, any *_constraint, any
-- composition profile, POD/PAC/DE, cost_per_kg, goals, or any Mapper /
-- private-product identifier.
create or replace function public.gellatti_demo_safe_projection_v1(p_recipe_input jsonb)
returns jsonb language sql immutable
set search_path = pg_catalog, public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'demo_safe', true,
    'category', p_recipe_input -> 'category',
    'mode', p_recipe_input -> 'mode',
    'target_temperature_c', p_recipe_input -> 'target_temperature_c',
    'target_batch_grams', p_recipe_input -> 'target_batch_grams',
    'line_count', jsonb_array_length(coalesce(p_recipe_input -> 'items', '[]'::jsonb)),
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', item -> 'ingredient' -> 'name',
        'ingredient_category', item -> 'ingredient' -> 'category',
        'is_main', case when item ->> 'lock_type' = 'MAIN' then true else null end
      )) order by ordinality)
      from jsonb_array_elements(coalesce(p_recipe_input -> 'items', '[]'::jsonb))
        with ordinality as t(item, ordinality)
    ), '[]'::jsonb)
  ));
$$;
revoke all on function public.gellatti_demo_safe_projection_v1(jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. creator_profiles — OPTIONAL public identity (§6)
-- ---------------------------------------------------------------------------
-- A normal subscriber never needs one. Handles are unique case-insensitively,
-- URL-safe and reserved-word protected; `handle` stores the canonical
-- lower-case form and `display_handle` the creator's preferred casing.
create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,

  handle text not null check (handle = lower(handle) and handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_handle text not null,
  display_name text not null check (display_name <> ''),
  avatar_url text,
  bio text,
  country text,
  city text,

  -- three INDEPENDENT switches (§52: Creator and Partner moderation are never
  -- one boolean, and visibility is never the same lever as ranking)
  is_public boolean not null default false,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'official')),
  ranking_eligible boolean not null default true,
  moderation_status text not null default 'ok'
    check (moderation_status in ('ok', 'under_review', 'restricted', 'suspended')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists creator_profiles_handle_uniq on public.creator_profiles (handle);
create index if not exists creator_profiles_public_idx
  on public.creator_profiles (is_public, moderation_status);
alter table public.creator_profiles enable row level security;

-- Reserved handles: routes, brand words and role words can never be claimed.
create table if not exists public.creator_reserved_handles (
  handle text primary key check (handle = lower(handle))
);
alter table public.creator_reserved_handles enable row level security;
insert into public.creator_reserved_handles (handle) values
  ('admin'), ('administrator'), ('account'), ('api'), ('app'), ('billing'),
  ('community'), ('creator'), ('creators'), ('dev'), ('demo'), ('gellatti'),
  ('help'), ('home'), ('login'), ('logout'), ('machine'), ('mapper'),
  ('moderation'), ('official'), ('partner'), ('partners'), ('pinguino'),
  ('pro'), ('production'), ('products'), ('profile'), ('recipe'), ('recipes'),
  ('root'), ('settings'), ('share'), ('shop'), ('signup'), ('start'),
  ('studio'), ('subscription'), ('support'), ('system'), ('top100'), ('user'),
  ('users'), ('www')
on conflict (handle) do nothing;

drop trigger if exists creator_profiles_touch on public.creator_profiles;
create trigger creator_profiles_touch before update on public.creator_profiles
  for each row execute function public.touch_updated_at();

-- A creator READS only their own profile row (§57). There is deliberately NO
-- client INSERT or UPDATE: the reserved-handle list lives in a table, not in a
-- CHECK constraint, so a direct insert would bypass it and let somebody claim
-- `@admin` or `@share`. Every write goes through
-- gellatti_claim_creator_handle_v1, which validates the handle, refuses
-- reserved words, and cannot touch verification / moderation / ranking state.
-- The public directory is served by the reader functions below rather than by
-- a table policy, so moderation gates visibility in exactly one place.
drop policy if exists creator_profiles_select_own on public.creator_profiles;
create policy creator_profiles_select_own on public.creator_profiles
  for select using (auth.uid() = user_id);
grant select on public.creator_profiles to authenticated;
-- creator_reserved_handles: RLS on, no policy, no grant — server-side only.

-- ---------------------------------------------------------------------------
-- 2. community_publications — visibility state C (§7)
-- ---------------------------------------------------------------------------
create table if not exists public.community_publications (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete restrict,
  -- Authorship is a SEPARATE column from the profile link so it survives a
  -- profile rename and can be tombstoned on account deletion (§55) without
  -- the publication losing its identity.
  creator_user_id uuid not null references auth.users (id) on delete restrict,

  recipe_id uuid not null references public.saved_recipes (id) on delete restrict,
  -- THE immutable snapshot this publication forever means (§5).
  recipe_version_id uuid not null references public.recipe_versions (id) on delete restrict,
  recipe_version_number integer not null check (recipe_version_number >= 1),

  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text not null check (title <> ''),
  description text,
  image_url text,
  category text,
  tags text[] not null default '{}',

  -- The demo-safe body, materialised at publish time by the publish RPC from
  -- gellatti_demo_safe_projection_v1. Public readers read THIS, never the
  -- version row. Stored (not computed per request) so the public page is a
  -- single cheap indexed read and can be cached safely.
  public_projection jsonb not null,

  status text not null default 'published'
    check (status in ('published', 'unpublished', 'hidden_by_moderation')),
  ranking_eligible boolean not null default true,

  published_at timestamptz not null default now(),
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live publication per (creator, slug); an unpublished slug frees up.
create unique index if not exists community_publications_slug_live_uniq
  on public.community_publications (creator_profile_id, slug)
  where status = 'published';
-- Republishing the SAME immutable version twice is a no-op, not a duplicate.
create unique index if not exists community_publications_version_live_uniq
  on public.community_publications (recipe_version_id)
  where status = 'published';
create index if not exists community_publications_creator_idx
  on public.community_publications (creator_profile_id, status, published_at desc);
create index if not exists community_publications_discovery_idx
  on public.community_publications (status, ranking_eligible, published_at desc);
create index if not exists community_publications_category_idx
  on public.community_publications (category, status);
create index if not exists community_publications_recipe_idx
  on public.community_publications (recipe_id);
alter table public.community_publications enable row level security;

drop trigger if exists community_publications_touch on public.community_publications;
create trigger community_publications_touch before update on public.community_publications
  for each row execute function public.touch_updated_at();

-- Creators manage ONLY their own publications; nobody can mutate another
-- creator's row (§57). Public discovery is served by reader functions.
drop policy if exists community_publications_select_own on public.community_publications;
create policy community_publications_select_own on public.community_publications
  for select using (auth.uid() = creator_user_id);
drop policy if exists community_publications_update_own on public.community_publications;
create policy community_publications_update_own on public.community_publications
  for update using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);
grant select, update on public.community_publications to authenticated;
-- NO client INSERT: publishing goes through publish_recipe_to_community_v1,
-- which is the only code that may build the demo-safe projection.

-- ---------------------------------------------------------------------------
-- 3. recipe_lineage — copies and remixes (§21–§22)
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_lineage (
  id uuid primary key default gen_random_uuid(),

  -- the DERIVED recipe (always owned by the person who pressed the button)
  recipe_id uuid not null unique references public.saved_recipes (id) on delete cascade,
  derived_user_id uuid not null references auth.users (id) on delete cascade,
  relation text not null check (relation in ('copy', 'remix')),

  -- DIRECT parent
  parent_publication_id uuid references public.community_publications (id) on delete set null,
  parent_share_link_id uuid,
  parent_recipe_version_id uuid references public.recipe_versions (id) on delete restrict,
  parent_creator_user_id uuid references auth.users (id) on delete set null,

  -- ROOT of the family (equal to the parent for a depth-1 derivation)
  root_publication_id uuid references public.community_publications (id) on delete set null,
  root_creator_user_id uuid references auth.users (id) on delete set null,

  depth integer not null default 1 check (depth >= 1 and depth <= 64),
  created_at timestamptz not null default now()
);
create index if not exists recipe_lineage_parent_idx on public.recipe_lineage (parent_publication_id);
create index if not exists recipe_lineage_root_idx on public.recipe_lineage (root_publication_id);
create index if not exists recipe_lineage_user_idx on public.recipe_lineage (derived_user_id);
alter table public.recipe_lineage enable row level security;
-- A creator may read lineage rows that name them as parent or root (that is
-- how "Based on you" attribution is counted) and rows for their own recipes.
drop policy if exists recipe_lineage_select_involved on public.recipe_lineage;
create policy recipe_lineage_select_involved on public.recipe_lineage
  for select using (
    auth.uid() = derived_user_id
    or auth.uid() = parent_creator_user_id
    or auth.uid() = root_creator_user_id
  );
grant select on public.recipe_lineage to authenticated;
-- NO client write: lineage is stamped by the copy/remix RPC. Attribution that
-- the deriving user could edit would not be attribution (§22).

-- ---------------------------------------------------------------------------
-- 4. recipe_share_links — visibility state B (§10, §48)
-- ---------------------------------------------------------------------------
-- The token is NEVER stored. `token_hash` is sha256(token) and the lookup is
-- by hash, so a database read cannot resurrect a live share URL. The token
-- itself is returned exactly once, by the create RPC, to the creator.
create table if not exists public.recipe_share_links (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,

  recipe_id uuid not null references public.saved_recipes (id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions (id) on delete restrict,
  recipe_version_number integer not null check (recipe_version_number >= 1),

  -- THE THREE ROLES, never collapsed into one referrer field (§85):
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  creator_user_id uuid not null references auth.users (id) on delete restrict,
  shared_by_user_id uuid not null references auth.users (id) on delete cascade,
  -- commercial attribution; stamped server-side from the sharer's ACTIVE
  -- partner row at creation time (§27) — the client never sends a partner id
  partner_id uuid references public.partners (id) on delete set null,
  -- optional: a publication this share points at (a shared Community recipe)
  publication_id uuid references public.community_publications (id) on delete set null,

  title text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  revoked_at timestamptz,

  -- server-maintained aggregates (§13); no client write path exists
  open_count integer not null default 0 check (open_count >= 0),
  unique_open_count integer not null default 0 check (unique_open_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipe_share_links_owner_idx
  on public.recipe_share_links (owner_user_id, status, created_at desc);
create index if not exists recipe_share_links_sharer_idx
  on public.recipe_share_links (shared_by_user_id, status, created_at desc);
create index if not exists recipe_share_links_partner_idx
  on public.recipe_share_links (partner_id) where partner_id is not null;
create index if not exists recipe_share_links_recipe_idx on public.recipe_share_links (recipe_id);
alter table public.recipe_share_links enable row level security;

alter table public.recipe_lineage
  drop constraint if exists recipe_lineage_parent_share_link_fk;
alter table public.recipe_lineage
  add constraint recipe_lineage_parent_share_link_fk
  foreign key (parent_share_link_id) references public.recipe_share_links (id) on delete set null;

drop trigger if exists recipe_share_links_touch on public.recipe_share_links;
create trigger recipe_share_links_touch before update on public.recipe_share_links
  for each row execute function public.touch_updated_at();

-- „Wysłane przeze mnie" (§13): the sharer and the owner read the row. The
-- token hash is excluded from the client-facing view below, and revocation is
-- the ONLY column a client may change — everything else, including
-- partner_id and the counters, is server-owned (§49: a partner must not be
-- able to repoint an existing share at themselves).
drop policy if exists recipe_share_links_select_own on public.recipe_share_links;
create policy recipe_share_links_select_own on public.recipe_share_links
  for select using (auth.uid() = owner_user_id or auth.uid() = shared_by_user_id);
drop policy if exists recipe_share_links_revoke_own on public.recipe_share_links;
create policy recipe_share_links_revoke_own on public.recipe_share_links
  for update using (auth.uid() = owner_user_id or auth.uid() = shared_by_user_id)
  with check (
    (auth.uid() = owner_user_id or auth.uid() = shared_by_user_id)
    and status = 'revoked'
    and recipe_version_id = (select l.recipe_version_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and creator_user_id = (select l.creator_user_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and shared_by_user_id = (select l.shared_by_user_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and partner_id is not distinct from (select l.partner_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and open_count = (select l.open_count from public.recipe_share_links l where l.id = recipe_share_links.id)
    and unique_open_count = (select l.unique_open_count from public.recipe_share_links l where l.id = recipe_share_links.id)
  );
grant select, update on public.recipe_share_links to authenticated;

-- ── recipe_share_recipients — „Udostępnione mi → Otrzymane" (§12) ───────────
create table if not exists public.recipe_share_recipients (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.recipe_share_links (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,

  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  open_count integer not null default 1 check (open_count >= 1),
  -- „Usuń z moich otrzymanych" hides the row for the recipient ONLY; the
  -- sender's recipe and the share record are untouched (§12).
  removed_by_recipient boolean not null default false,

  created_at timestamptz not null default now()
);
create unique index if not exists recipe_share_recipients_uniq
  on public.recipe_share_recipients (share_link_id, recipient_user_id);
create index if not exists recipe_share_recipients_user_idx
  on public.recipe_share_recipients (recipient_user_id, removed_by_recipient, last_opened_at desc);
alter table public.recipe_share_recipients enable row level security;

-- The recipient reads and may only flip their own `removed_by_recipient`.
-- The SENDER cannot read this table at all: who opened a link is the
-- recipient's private data, and §13/§81 say a sharer sees aggregates only.
drop policy if exists recipe_share_recipients_select_own on public.recipe_share_recipients;
create policy recipe_share_recipients_select_own on public.recipe_share_recipients
  for select using (auth.uid() = recipient_user_id);
drop policy if exists recipe_share_recipients_update_own on public.recipe_share_recipients;
create policy recipe_share_recipients_update_own on public.recipe_share_recipients
  for update using (auth.uid() = recipient_user_id)
  with check (
    auth.uid() = recipient_user_id
    and open_count = (select r.open_count from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
    and first_opened_at = (select r.first_opened_at from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
  );
grant select, update on public.recipe_share_recipients to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Proof-of-use events (§41, §50) — the ranking substrate
-- ---------------------------------------------------------------------------
-- Views are deliberately NOT stored per row here: they carry no ranking
-- weight (§38) and storing one row per refresh is exactly the gaming vector
-- §50 forbids. Only genuine, idempotent actions land in these tables.
create table if not exists public.recipe_usage_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid references public.community_publications (id) on delete cascade,
  share_link_id uuid references public.recipe_share_links (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('used', 'remixed')),
  -- the recipe created BY this use — also the idempotency anchor: one derived
  -- recipe can only ever justify one usage event, so refreshing or retrying
  -- the copy button cannot inflate the count (§50, §65.6).
  derived_recipe_id uuid unique references public.saved_recipes (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  constraint recipe_usage_events_source_present
    check (publication_id is not null or share_link_id is not null)
);
create index if not exists recipe_usage_events_publication_idx
  on public.recipe_usage_events (publication_id, event_type, occurred_at desc);
create index if not exists recipe_usage_events_user_idx on public.recipe_usage_events (user_id);
alter table public.recipe_usage_events enable row level security;
drop policy if exists recipe_usage_events_select_own on public.recipe_usage_events;
create policy recipe_usage_events_select_own on public.recipe_usage_events
  for select using (auth.uid() = user_id);
grant select on public.recipe_usage_events to authenticated;

-- ── recipe_make_events — „Zrobione w Gellatti" (§41) ────────────────────────
-- A make is NOT a page view: `production_run_id` binds each row to a real
-- completed production run, and it is UNIQUE — a webhook retry, a refresh or
-- a double click cannot mint a second make for the same run. One user may
-- genuinely make a recipe many times: that is many runs, hence many rows.
create table if not exists public.recipe_make_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.community_publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  production_run_id uuid unique,
  recipe_id uuid references public.saved_recipes (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists recipe_make_events_publication_idx
  on public.recipe_make_events (publication_id, occurred_at desc);
create unique index if not exists recipe_make_events_unique_maker_idx
  on public.recipe_make_events (publication_id, user_id, occurred_at);
create index if not exists recipe_make_events_user_idx on public.recipe_make_events (user_id);
alter table public.recipe_make_events enable row level security;
drop policy if exists recipe_make_events_select_own on public.recipe_make_events;
create policy recipe_make_events_select_own on public.recipe_make_events
  for select using (auth.uid() = user_id);
grant select on public.recipe_make_events to authenticated;

-- ── recipe_ratings — VERIFIED ratings only (§42) ────────────────────────────
-- The insert path refuses a rater with no make event, so „verified" is a
-- structural property, not a label. One active rating per (publication, user),
-- updatable.
create table if not exists public.recipe_ratings (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.community_publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  review text,
  -- proof the rater actually made it; NOT NULL is the whole guarantee
  make_event_id uuid not null references public.recipe_make_events (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'hidden_by_moderation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publication_id, user_id)
);
create index if not exists recipe_ratings_publication_idx
  on public.recipe_ratings (publication_id, status);
alter table public.recipe_ratings enable row level security;
drop trigger if exists recipe_ratings_touch on public.recipe_ratings;
create trigger recipe_ratings_touch before update on public.recipe_ratings
  for each row execute function public.touch_updated_at();
drop policy if exists recipe_ratings_select_own on public.recipe_ratings;
create policy recipe_ratings_select_own on public.recipe_ratings
  for select using (auth.uid() = user_id);
grant select on public.recipe_ratings to authenticated;
-- No client INSERT/UPDATE: rate_community_recipe_v1 is the only writer, and
-- it is what proves the make.

-- ---------------------------------------------------------------------------
-- 6. Aggregates + rankings (§38, §39, §61)
-- ---------------------------------------------------------------------------
-- Server-computed counters. No client write path exists anywhere (§50: counts
-- cannot be forged client-side), and the RAW components are stored so any
-- ranking can be recomputed after a weight change (§38).
create table if not exists public.publication_metrics (
  publication_id uuid primary key references public.community_publications (id) on delete cascade,
  unique_users integer not null default 0 check (unique_users >= 0),
  unique_makers integer not null default 0 check (unique_makers >= 0),
  total_makes integer not null default 0 check (total_makes >= 0),
  remix_count integer not null default 0 check (remix_count >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  makes_last_7d integer not null default 0 check (makes_last_7d >= 0),
  makes_last_30d integer not null default 0 check (makes_last_30d >= 0),
  last_activity_at timestamptz,
  recomputed_at timestamptz not null default now()
);
alter table public.publication_metrics enable row level security;
-- RLS on, NO policy, NO grant: the public reader functions expose exactly the
-- aggregates a visitor may see; nothing reads this table directly.

create table if not exists public.creator_metrics (
  creator_profile_id uuid primary key references public.creator_profiles (id) on delete cascade,
  public_recipe_count integer not null default 0 check (public_recipe_count >= 0),
  unique_users integer not null default 0 check (unique_users >= 0),
  unique_makers integer not null default 0 check (unique_makers >= 0),
  total_makes integer not null default 0 check (total_makes >= 0),
  remix_count integer not null default 0 check (remix_count >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  recomputed_at timestamptz not null default now()
);
alter table public.creator_metrics enable row level security;

-- Deterministic, recomputable ranking snapshots. `components` keeps the raw
-- signal values that produced `score`, so a rank is always auditable and a
-- weight change can be replayed over history instead of losing it.
create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('top_recipes', 'top_creators')),
  window_key text not null check (window_key in ('trending', 'week', 'month', 'all_time')),
  scope text not null default 'global',
  computed_at timestamptz not null default now(),
  weights_version text not null,
  rank integer not null check (rank >= 1),
  publication_id uuid references public.community_publications (id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles (id) on delete cascade,
  score numeric not null,
  components jsonb not null default '{}'::jsonb,
  constraint ranking_snapshots_subject_present
    check (publication_id is not null or creator_profile_id is not null)
);
create index if not exists ranking_snapshots_board_idx
  on public.ranking_snapshots (board, window_key, scope, computed_at desc, rank);
alter table public.ranking_snapshots enable row level security;

-- ---------------------------------------------------------------------------
-- 7. community_reports — moderation intake (§51)
-- ---------------------------------------------------------------------------
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  publication_id uuid references public.community_publications (id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles (id) on delete cascade,
  reason text not null check (reason in
    ('spam', 'inappropriate', 'stolen_content', 'misleading_or_dangerous', 'abuse', 'other')),
  detail text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_reports_subject_present
    check (publication_id is not null or creator_profile_id is not null)
);
create index if not exists community_reports_status_idx on public.community_reports (status, created_at desc);
create unique index if not exists community_reports_no_duplicate_open
  on public.community_reports (reporter_user_id, coalesce(publication_id, creator_profile_id))
  where status = 'open';
alter table public.community_reports enable row level security;
drop trigger if exists community_reports_touch on public.community_reports;
create trigger community_reports_touch before update on public.community_reports
  for each row execute function public.touch_updated_at();
drop policy if exists community_reports_insert_own on public.community_reports;
create policy community_reports_insert_own on public.community_reports
  for insert with check (auth.uid() = reporter_user_id and status = 'open');
drop policy if exists community_reports_select_own on public.community_reports;
create policy community_reports_select_own on public.community_reports
  for select using (auth.uid() = reporter_user_id);
grant select, insert on public.community_reports to authenticated;
-- No client UPDATE: triage is admin/service-role work.

-- ---------------------------------------------------------------------------
-- 8. Partner eligibility (owner rule, 2026-08-23)
-- ---------------------------------------------------------------------------
-- LOCKED: only a partner whose status is ACTIVE **at the moment of the
-- qualifying referral/purchase** is eligible for commission. Creator status,
-- recipe popularity, sharing volume and historical referrals never create a
-- payment entitlement on their own. Everyone may apply through the Partner
-- activation process, but commissions begin only once Partner status is
-- active and are NEVER retroactive:
--   * a share created while the sharer was NOT an active partner stores
--     partner_id = NULL, and that NULL is permanent — activating later cannot
--     reach back and monetise links that were already in circulation;
--   * a share created while the sharer WAS active still re-checks activity at
--     every attribution point below, so a suspended or terminated partner
--     stops generating new eligible attributions immediately.
create or replace function public.gellatti_active_partner_for_user_v1(p_user_id uuid)
returns uuid language sql stable security definer
set search_path = pg_catalog, public as $$
  select p.id from public.partners p
  where p.user_id = p_user_id and p.status = 'active'
  limit 1;
$$;
revoke all on function public.gellatti_active_partner_for_user_v1(uuid)
  from public, anon, authenticated;

create or replace function public.gellatti_partner_is_active_v1(p_partner_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select p_partner_id is not null and exists (
    select 1 from public.partners p where p.id = p_partner_id and p.status = 'active'
  );
$$;
revoke all on function public.gellatti_partner_is_active_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Creator profile RPC (§6)
-- ---------------------------------------------------------------------------
create or replace function public.gellatti_claim_creator_handle_v1(
  p_handle text, p_display_name text, p_bio text default null,
  p_country text default null, p_city text default null,
  p_avatar_url text default null, p_is_public boolean default true
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  v_row public.creator_profiles;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if v_handle !~ '^[a-z0-9][a-z0-9_-]{2,29}$' then
    raise exception 'handle_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.creator_reserved_handles r where r.handle = v_handle) then
    raise exception 'handle_reserved' using errcode = '22023';
  end if;
  if exists (select 1 from public.creator_profiles c where c.handle = v_handle and c.user_id <> v_uid) then
    raise exception 'handle_taken' using errcode = '23505';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'display_name_required' using errcode = '22023';
  end if;

  insert into public.creator_profiles as c
    (user_id, handle, display_handle, display_name, bio, country, city, avatar_url, is_public)
  values
    (v_uid, v_handle, btrim(p_handle), btrim(p_display_name), p_bio, p_country, p_city,
     p_avatar_url, coalesce(p_is_public, true))
  on conflict (user_id) do update set
    handle = excluded.handle,
    display_handle = excluded.display_handle,
    display_name = excluded.display_name,
    bio = excluded.bio,
    country = excluded.country,
    city = excluded.city,
    avatar_url = excluded.avatar_url,
    is_public = excluded.is_public
  returning * into v_row;

  insert into public.creator_metrics (creator_profile_id) values (v_row.id)
  on conflict (creator_profile_id) do nothing;

  return jsonb_build_object(
    'id', v_row.id, 'handle', v_row.handle, 'display_handle', v_row.display_handle,
    'display_name', v_row.display_name, 'is_public', v_row.is_public,
    'verification_status', v_row.verification_status,
    'moderation_status', v_row.moderation_status);
end;
$$;
revoke all on function public.gellatti_claim_creator_handle_v1(text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.gellatti_claim_creator_handle_v1(text, text, text, text, text, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Publish / unpublish (§7, §53)
-- ---------------------------------------------------------------------------
-- Publishing NEVER copies formulation data: it stores a pointer to the
-- immutable recipe_versions row plus the demo-safe projection built here, so
-- a later V2 cannot rewrite what V1's public page means (§5).
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
  v_pub public.community_publications;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_profile from public.creator_profiles where user_id = v_uid;
  if v_profile.id is null then raise exception 'creator_profile_required' using errcode = '42501'; end if;
  if v_profile.moderation_status in ('restricted', 'suspended') then
    raise exception 'creator_moderation_block' using errcode = '42501';
  end if;

  -- Ownership is proven against the IMMUTABLE version row, not the mutable
  -- aggregate: you can only publish a snapshot you actually own (§57).
  select * into v_version from public.recipe_versions
  where recipe_id = p_recipe_id and version_number = p_version_number and owner_user_id = v_uid;
  if v_version.id is null then raise exception 'recipe_version_not_found' using errcode = '42501'; end if;

  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then
    raise exception 'slug_invalid' using errcode = '22023';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'title_required' using errcode = '22023';
  end if;

  -- Republishing the same immutable version is idempotent, not a duplicate.
  select * into v_pub from public.community_publications
  where recipe_version_id = v_version.id and status = 'published';
  if v_pub.id is not null then
    update public.community_publications set
      slug = v_slug, title = btrim(p_title), description = p_description,
      image_url = p_image_url, category = p_category, tags = coalesce(p_tags, '{}')
    where id = v_pub.id returning * into v_pub;
  else
    insert into public.community_publications (
      creator_profile_id, creator_user_id, recipe_id, recipe_version_id,
      recipe_version_number, slug, title, description, image_url, category, tags,
      public_projection)
    values (
      v_profile.id, v_uid, p_recipe_id, v_version.id, v_version.version_number,
      v_slug, btrim(p_title), p_description, p_image_url, p_category, coalesce(p_tags, '{}'),
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

-- Unpublishing removes discovery and ranking but PRESERVES lineage: other
-- people's legitimate copies and remixes are untouched (§53).
create or replace function public.gellatti_unpublish_v1(p_publication_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid(); v_pub public.community_publications;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  update public.community_publications
    set status = 'unpublished', unpublished_at = now(), ranking_eligible = false
  where id = p_publication_id and creator_user_id = v_uid and status = 'published'
  returning * into v_pub;
  if v_pub.id is null then raise exception 'publication_not_found' using errcode = '42501'; end if;
  delete from public.ranking_snapshots where publication_id = v_pub.id;
  perform public.gellatti_recompute_creator_metrics_v1(v_pub.creator_profile_id);
  return jsonb_build_object('publication_id', v_pub.id, 'status', v_pub.status);
end;
$$;
revoke all on function public.gellatti_unpublish_v1(uuid) from public, anon, authenticated;
grant execute on function public.gellatti_unpublish_v1(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Direct share links (§10, §27, §48)
-- ---------------------------------------------------------------------------
-- The token is 32 CSPRNG bytes rendered base64url (~256 bits). It is returned
-- to the caller EXACTLY ONCE and never stored: the row keeps sha256(token)
-- only, so no database read — by us, by an admin, or by an attacker with a
-- dump — can reconstruct a live share URL. Sequential recipe ids are never an
-- access credential (§10).
create or replace function public.gellatti_create_share_link_v1(
  p_recipe_id uuid, p_version_number integer, p_publication_id uuid default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_version public.recipe_versions;
  v_recipe public.saved_recipes;
  v_token text;
  v_partner_id uuid;
  v_creator_user_id uuid;
  v_link public.recipe_share_links;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_version from public.recipe_versions
  where recipe_id = p_recipe_id and version_number = p_version_number and owner_user_id = v_uid;
  if v_version.id is null then raise exception 'recipe_version_not_found' using errcode = '42501'; end if;
  select * into v_recipe from public.saved_recipes where id = p_recipe_id;

  -- AUTHORSHIP (§23): if this recipe descends from somebody else's work, the
  -- original creator stays the creator no matter who is sharing it. Sharing
  -- can never transfer authorship.
  select coalesce(l.root_creator_user_id, l.parent_creator_user_id) into v_creator_user_id
  from public.recipe_lineage l where l.recipe_id = p_recipe_id;
  v_creator_user_id := coalesce(v_creator_user_id, v_uid);

  -- COMMERCIAL ATTRIBUTION (§27 + owner rule 2026-08-23): stamped from the
  -- sharer's ACTIVE partner row at creation time. The client never sends a
  -- partner id, so a forged one is structurally impossible (§49). A sharer
  -- who is not an active partner right now gets NULL — permanently, because
  -- commissions are not retroactive.
  v_partner_id := public.gellatti_active_partner_for_user_v1(v_uid);

  v_token := replace(replace(replace(
    encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');

  insert into public.recipe_share_links (
    token_hash, recipe_id, recipe_version_id, recipe_version_number,
    owner_user_id, creator_user_id, shared_by_user_id, partner_id, publication_id, title)
  values (
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    p_recipe_id, v_version.id, v_version.version_number,
    v_uid, v_creator_user_id, v_uid, v_partner_id, p_publication_id,
    coalesce(nullif(btrim(v_recipe.name), ''), 'Receptura'))
  returning * into v_link;

  return jsonb_build_object(
    'share_link_id', v_link.id,
    'token', v_token,                        -- returned ONCE; never stored
    'version_number', v_link.recipe_version_number,
    'partner_attribution', v_partner_id is not null,
    'created_at', v_link.created_at);
end;
$$;
revoke all on function public.gellatti_create_share_link_v1(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_create_share_link_v1(uuid, integer, uuid) to authenticated;

-- ── Resolve a share for a LOGGED-OUT visitor (§14 steps 1–3) ────────────────
-- Demo-safe by construction: this returns the stored-nowhere-else projection
-- computed from the immutable version, plus who created it and who sent it.
-- It records NOTHING about the visitor and creates no recipient row — that
-- happens only after authentication, in gellatti_open_share_v1.
create or replace function public.gellatti_resolve_share_v1(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare
  v_link public.recipe_share_links;
  v_version public.recipe_versions;
  v_creator public.creator_profiles;
  v_sharer_name text;
begin
  if coalesce(btrim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_link from public.recipe_share_links
  where token_hash = extensions.digest(convert_to(btrim(p_token), 'UTF8'), 'sha256');
  if v_link.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_link.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v_link.expires_at is not null and v_link.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_version from public.recipe_versions where id = v_link.recipe_version_id;
  select * into v_creator from public.creator_profiles where user_id = v_link.creator_user_id;
  -- Only a display name ever crosses to the recipient — never an email, never
  -- an account id (§81). A creator display name wins over the account profile
  -- because it is the name that person chose to be known by publicly.
  v_sharer_name := coalesce(
    (select nullif(btrim(cp.display_name), '') from public.creator_profiles cp
      where cp.user_id = v_link.shared_by_user_id),
    (select nullif(btrim(ap.display_name), '') from public.account_profiles ap
      where ap.user_id = v_link.shared_by_user_id));

  return jsonb_build_object(
    'ok', true,
    'share_link_id', v_link.id,
    'title', v_link.title,
    'version_number', v_link.recipe_version_number,
    'entitlement', 'shared_recipe_demo',
    'created_by', jsonb_strip_nulls(jsonb_build_object(
      'display_name', coalesce(v_creator.display_name, 'Twórca Gellatti'),
      'handle', case when v_creator.is_public then v_creator.handle else null end)),
    'shared_by', jsonb_strip_nulls(jsonb_build_object('display_name', v_sharer_name)),
    'shared_by_is_creator', v_link.shared_by_user_id = v_link.creator_user_id,
    'recipe', public.gellatti_demo_safe_projection_v1(v_version.recipe_input));
end;
$$;
revoke all on function public.gellatti_resolve_share_v1(text) from public, anon, authenticated;
grant execute on function public.gellatti_resolve_share_v1(text) to anon, authenticated;

-- ── Open a share as a SIGNED-IN user (§12, §14, §20, §29) ───────────────────
-- Does four things, in this order and only server-side:
--   1. validates the token and the link's state;
--   2. records / refreshes the recipient row so the recipe appears under
--      „Udostępnione mi → Otrzymane";
--   3. records Partner acquisition evidence into the EXISTING referral ledger
--      (0017) when — and only when — the link carries a partner that is
--      STILL active. Never retroactive, never client-supplied;
--   4. returns the FULL formulation to an entitled recipient, or the
--      demo-safe projection to everyone else. The branch is here, in the
--      database. A manipulated frontend cannot change which branch runs.
create or replace function public.gellatti_open_share_v1(p_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_link public.recipe_share_links;
  v_version public.recipe_versions;
  v_base jsonb;
  v_is_new_recipient boolean := false;
  v_entitled boolean;
  v_partner_active boolean;
  v_code_id uuid;
  v_click_id uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;

  v_base := public.gellatti_resolve_share_v1(p_token);
  if not coalesce((v_base ->> 'ok')::boolean, false) then return v_base; end if;

  select * into v_link from public.recipe_share_links
  where id = (v_base ->> 'share_link_id')::uuid;
  select * into v_version from public.recipe_versions where id = v_link.recipe_version_id;

  -- 2. recipient association (idempotent per user; a refresh is not a new open)
  insert into public.recipe_share_recipients (share_link_id, recipient_user_id)
  values (v_link.id, v_uid)
  on conflict (share_link_id, recipient_user_id) do update
    set last_opened_at = now(), open_count = recipe_share_recipients.open_count + 1
  returning (xmax = 0) into v_is_new_recipient;

  update public.recipe_share_links
    set open_count = open_count + 1,
        unique_open_count = unique_open_count + (case when v_is_new_recipient then 1 else 0 end)
  where id = v_link.id;

  -- 3. Partner acquisition evidence. Owner rule 2026-08-23: eligibility is
  -- decided by the partner's status RIGHT NOW, not by who they were when the
  -- link was made. Self-referral is refused here as well as in the domain
  -- layer (§49) — a partner opening their own link earns nothing.
  v_partner_active := public.gellatti_partner_is_active_v1(v_link.partner_id)
                      and v_link.shared_by_user_id <> v_uid;
  if v_partner_active then
    select c.id into v_code_id from public.partner_codes c
    where c.partner_id = v_link.partner_id and c.status = 'active' limit 1;

    if v_code_id is not null then
      insert into public.referral_clicks (partner_code_id, partner_id, landing_path, context)
      values (v_code_id, v_link.partner_id, '/share',
              jsonb_build_object('source', 'recipe_share', 'share_link_id', v_link.id))
      returning id into v_click_id;
    end if;

    -- A pending attribution is created only if this user has no attribution
    -- at all yet. An existing row — pending OR locked — is never overwritten
    -- here: precedence between a code, a share journey and a stored referral
    -- is decided by the ONE policy in the domain layer, not by whichever
    -- link happened to be opened last (§32).
    if not exists (select 1 from public.referral_attributions ra where ra.user_id = v_uid) then
      insert into public.referral_attributions (
        partner_id, partner_code_id, click_id, user_id, method,
        status, clicked_at, window_expires_at)
      values (
        v_link.partner_id, v_code_id, v_click_id, v_uid, 'referral_link',
        'pending', now(), now() + interval '30 days');
    end if;
  end if;

  -- 4. THE entitlement branch — server-side, never client-side.
  v_entitled := public.gellatti_has_paid_access_v1(v_uid);
  if v_entitled then
    return v_base
      || jsonb_build_object(
           'entitlement', 'full',
           'recipe_id', v_link.recipe_id,
           'recipe_version_id', v_link.recipe_version_id,
           'recipe_input', v_version.recipe_input,
           'engine_version', v_version.engine_version,
           'config_version', v_version.config_version,
           'total_batch_g', v_version.total_batch_g);
  end if;
  -- Not entitled: v_base already carries ONLY the demo-safe projection.
  return v_base || jsonb_build_object('entitlement', 'shared_recipe_demo');
end;
$$;
revoke all on function public.gellatti_open_share_v1(text) from public, anon, authenticated;
grant execute on function public.gellatti_open_share_v1(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Server-computed metrics (§50: counts can never be forged client-side)
-- ---------------------------------------------------------------------------
-- Recomputed from the RAW event tables, never incremented from a client call.
-- Self-actions are excluded: a creator using, making or rating their own
-- publication contributes nothing to its standing (§50).
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
    remix_count = coalesce((
      select count(*) from public.recipe_usage_events u
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

create or replace function public.gellatti_recompute_creator_metrics_v1(p_creator_profile_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.creator_metrics (creator_profile_id) values (p_creator_profile_id)
  on conflict (creator_profile_id) do nothing;

  update public.creator_metrics c set
    public_recipe_count = coalesce((
      select count(*) from public.community_publications p
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    unique_users = coalesce((
      select sum(m.unique_users) from public.publication_metrics m
      join public.community_publications p on p.id = m.publication_id
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    unique_makers = coalesce((
      select sum(m.unique_makers) from public.publication_metrics m
      join public.community_publications p on p.id = m.publication_id
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    total_makes = coalesce((
      select sum(m.total_makes) from public.publication_metrics m
      join public.community_publications p on p.id = m.publication_id
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    remix_count = coalesce((
      select sum(m.remix_count) from public.publication_metrics m
      join public.community_publications p on p.id = m.publication_id
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    rating_count = coalesce((
      select sum(m.rating_count) from public.publication_metrics m
      join public.community_publications p on p.id = m.publication_id
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    rating_sum = coalesce((
      select sum(m.rating_sum) from public.publication_metrics m
      join public.community_publications p on p.id = m.publication_id
      where p.creator_profile_id = p_creator_profile_id and p.status = 'published'), 0),
    recomputed_at = now()
  where c.creator_profile_id = p_creator_profile_id;
end;
$$;
revoke all on function public.gellatti_recompute_creator_metrics_v1(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. Proof-of-use writers (§21, §22, §41, §42)
-- ---------------------------------------------------------------------------
-- Records that a recipe the caller already owns was DERIVED from a source.
-- The derived recipe is created by the existing recipe-persistence path — this
-- function only stamps lineage and the usage event, so recipe saving,
-- versioning and the Engine stay untouched (§1).
create or replace function public.gellatti_record_derivation_v1(
  p_derived_recipe_id uuid, p_relation text,
  p_publication_id uuid default null, p_share_link_id uuid default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_pub public.community_publications;
  v_link public.recipe_share_links;
  v_parent_version_id uuid;
  v_parent_creator uuid;
  v_root_pub uuid;
  v_root_creator uuid;
  v_depth integer := 1;
  v_parent_lineage public.recipe_lineage;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_relation not in ('copy', 'remix') then
    raise exception 'relation_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.saved_recipes r
                 where r.id = p_derived_recipe_id and r.user_id = v_uid) then
    raise exception 'derived_recipe_not_owned' using errcode = '42501';
  end if;
  if p_publication_id is null and p_share_link_id is null then
    raise exception 'source_required' using errcode = '22023';
  end if;

  if p_publication_id is not null then
    select * into v_pub from public.community_publications
    where id = p_publication_id and status = 'published';
    if v_pub.id is null then raise exception 'publication_not_found' using errcode = '42501'; end if;
    v_parent_version_id := v_pub.recipe_version_id;
    v_parent_creator := v_pub.creator_user_id;
    -- ROOT: walk ONE hop to the parent's own lineage row. The tree is stamped
    -- at creation, so the root is always already resolved on the parent —
    -- no recursive walk, and therefore no unbounded query.
    select * into v_parent_lineage from public.recipe_lineage l where l.recipe_id = v_pub.recipe_id;
    v_root_pub := coalesce(v_parent_lineage.root_publication_id, v_pub.id);
    v_root_creator := coalesce(v_parent_lineage.root_creator_user_id, v_pub.creator_user_id);
    v_depth := coalesce(v_parent_lineage.depth, 0) + 1;
  else
    select * into v_link from public.recipe_share_links
    where id = p_share_link_id and status = 'active';
    if v_link.id is null then raise exception 'share_not_found' using errcode = '42501'; end if;
    if not exists (select 1 from public.recipe_share_recipients sr
                   where sr.share_link_id = v_link.id and sr.recipient_user_id = v_uid) then
      raise exception 'share_not_opened_by_caller' using errcode = '42501';
    end if;
    v_parent_version_id := v_link.recipe_version_id;
    v_parent_creator := v_link.creator_user_id;
    v_root_creator := v_link.creator_user_id;
  end if;

  -- §22: no circular lineage. A derived recipe can never name itself as its
  -- own parent, and depth is hard-capped by the column constraint.
  if v_pub.id is not null and v_pub.recipe_id = p_derived_recipe_id then
    raise exception 'circular_lineage' using errcode = '22023';
  end if;
  if v_depth > 64 then raise exception 'lineage_too_deep' using errcode = '22023'; end if;

  insert into public.recipe_lineage (
    recipe_id, derived_user_id, relation, parent_publication_id, parent_share_link_id,
    parent_recipe_version_id, parent_creator_user_id, root_publication_id,
    root_creator_user_id, depth)
  values (
    p_derived_recipe_id, v_uid, p_relation, p_publication_id, p_share_link_id,
    v_parent_version_id, v_parent_creator, v_root_pub, v_root_creator, v_depth)
  on conflict (recipe_id) do nothing;

  -- Idempotent by derived_recipe_id: refreshing or retrying „Użyj tej
  -- receptury" can never count twice (§21, §50).
  insert into public.recipe_usage_events (
    publication_id, share_link_id, user_id, event_type, derived_recipe_id)
  values (
    p_publication_id, p_share_link_id, v_uid,
    case when p_relation = 'remix' then 'remixed' else 'used' end, p_derived_recipe_id)
  on conflict (derived_recipe_id) do nothing;

  if p_publication_id is not null then
    perform public.gellatti_recompute_publication_metrics_v1(p_publication_id);
    perform public.gellatti_recompute_creator_metrics_v1(v_pub.creator_profile_id);
  end if;

  return jsonb_build_object(
    'recipe_id', p_derived_recipe_id, 'relation', p_relation,
    'parent_creator_user_id', v_parent_creator, 'root_publication_id', v_root_pub,
    'depth', v_depth);
end;
$$;
revoke all on function public.gellatti_record_derivation_v1(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_record_derivation_v1(uuid, text, uuid, uuid) to authenticated;

-- ── „Zrobione w Gellatti" (§41) ─────────────────────────────────────────────
-- Bound to a real COMPLETED production run. Opening a recipe is not making it,
-- and the unique production_run_id makes a retry a no-op rather than a second
-- make.
create or replace function public.gellatti_record_make_v1(
  p_publication_id uuid, p_production_run_id uuid, p_recipe_id uuid default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_pub public.community_publications;
  v_event public.recipe_make_events;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_pub from public.community_publications where id = p_publication_id;
  if v_pub.id is null then raise exception 'publication_not_found' using errcode = '42501'; end if;
  if p_production_run_id is null then
    raise exception 'production_run_required' using errcode = '22023';
  end if;
  -- The run must be the caller's own COMPLETED run: a make is proof of work,
  -- so it is never asserted by the client on its own word.
  if not exists (
    select 1 from public.production_runs pr
    where pr.id = p_production_run_id and pr.owner_user_id = v_uid and pr.status = 'completed')
  then
    raise exception 'production_run_not_completed_by_caller' using errcode = '42501';
  end if;

  insert into public.recipe_make_events (publication_id, user_id, production_run_id, recipe_id)
  values (p_publication_id, v_uid, p_production_run_id, p_recipe_id)
  on conflict (production_run_id) do nothing
  returning * into v_event;

  perform public.gellatti_recompute_publication_metrics_v1(p_publication_id);
  perform public.gellatti_recompute_creator_metrics_v1(v_pub.creator_profile_id);
  return jsonb_build_object('recorded', v_event.id is not null, 'make_event_id', v_event.id);
end;
$$;
revoke all on function public.gellatti_record_make_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_record_make_v1(uuid, uuid, uuid) to authenticated;

-- ── Verified ratings (§42) ──────────────────────────────────────────────────
-- „Verified" is structural: the insert reads the caller's own make event and
-- refuses without one. There is no code path that can create an unverified
-- rating, so the average can never be diluted by people who did not cook it.
create or replace function public.gellatti_rate_publication_v1(
  p_publication_id uuid, p_stars smallint, p_review text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_pub public.community_publications;
  v_make_id uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'stars_out_of_range' using errcode = '22023';
  end if;
  select * into v_pub from public.community_publications where id = p_publication_id;
  if v_pub.id is null then raise exception 'publication_not_found' using errcode = '42501'; end if;

  select e.id into v_make_id from public.recipe_make_events e
  where e.publication_id = p_publication_id and e.user_id = v_uid
  order by e.occurred_at desc limit 1;
  if v_make_id is null then
    raise exception 'rating_requires_confirmed_make' using errcode = '42501';
  end if;

  insert into public.recipe_ratings (publication_id, user_id, stars, review, make_event_id)
  values (p_publication_id, v_uid, p_stars, p_review, v_make_id)
  on conflict (publication_id, user_id) do update
    set stars = excluded.stars, review = excluded.review, make_event_id = excluded.make_event_id;

  perform public.gellatti_recompute_publication_metrics_v1(p_publication_id);
  perform public.gellatti_recompute_creator_metrics_v1(v_pub.creator_profile_id);
  return jsonb_build_object('rated', true, 'stars', p_stars);
end;
$$;
revoke all on function public.gellatti_rate_publication_v1(uuid, smallint, text)
  from public, anon, authenticated;
grant execute on function public.gellatti_rate_publication_v1(uuid, smallint, text) to authenticated;

-- Integrity link for the make proof. ON DELETE SET NULL, not CASCADE: if a
-- production run is ever removed the historical make stays counted, it simply
-- loses its receipt.
alter table public.recipe_make_events
  drop constraint if exists recipe_make_events_production_run_fk;
alter table public.recipe_make_events
  add constraint recipe_make_events_production_run_fk
  foreign key (production_run_id) references public.production_runs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 14. Public readers (§8, §9, §37, §38, §39, §58)
-- ---------------------------------------------------------------------------
-- Every public surface is served by these functions and by nothing else. They
-- return the demo-safe projection plus aggregates a visitor is allowed to
-- see. `recipe_input` is not reachable from any of them, for any caller.

-- The safe public shape of one publication, shared by every list below.
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
    'metrics', jsonb_build_object(
      'unique_users', coalesce(m.unique_users, 0),
      'unique_makers', coalesce(m.unique_makers, 0),
      'total_makes', coalesce(m.total_makes, 0),
      'remix_count', coalesce(m.remix_count, 0),
      'rating_count', coalesce(m.rating_count, 0),
      -- Verified average, or NULL. Never a fabricated score: a publication
      -- nobody has rated shows no rating at all (§6, §59).
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

-- The public recipe page: card + the demo-safe body. A logged-out visitor,
-- a Demo user and a free user all receive EXACTLY this.
create or replace function public.gellatti_get_publication_v1(p_handle text, p_slug text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_pub public.community_publications; v_card jsonb;
begin
  select p.* into v_pub
  from public.community_publications p
  join public.creator_profiles c on c.id = p.creator_profile_id
  where c.handle = lower(btrim(coalesce(p_handle, '')))
    and p.slug = lower(btrim(coalesce(p_slug, '')))
    and p.status = 'published' and c.moderation_status = 'ok';
  if v_pub.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_card := public.gellatti_publication_card_v1(v_pub.id);
  return jsonb_build_object('ok', true, 'entitlement', 'community_public')
    || v_card
    || jsonb_build_object('recipe', v_pub.public_projection);
end;
$$;
revoke all on function public.gellatti_get_publication_v1(text, text) from public, anon, authenticated;
grant execute on function public.gellatti_get_publication_v1(text, text) to anon, authenticated;

-- The entitled read of a published recipe (§20, §21). Separate function,
-- separate grant, server-side entitlement check — there is no parameter a
-- client can set to make the public reader return a gram.
create or replace function public.gellatti_get_publication_full_v1(p_publication_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid(); v_pub public.community_publications; v_version public.recipe_versions;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_pub from public.community_publications
  where id = p_publication_id and status = 'published';
  if v_pub.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- The creator always reaches their own work; everyone else needs paid access.
  if v_pub.creator_user_id <> v_uid and not public.gellatti_has_paid_access_v1(v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'entitlement_required',
      'entitlement', 'community_public');
  end if;

  select * into v_version from public.recipe_versions where id = v_pub.recipe_version_id;
  return jsonb_build_object(
    'ok', true, 'entitlement', 'full',
    'publication_id', v_pub.id,
    'recipe_id', v_pub.recipe_id,
    'recipe_version_id', v_pub.recipe_version_id,
    'version_number', v_pub.recipe_version_number,
    'title', v_pub.title,
    'creator_user_id', v_pub.creator_user_id,
    'recipe_input', v_version.recipe_input,
    'engine_version', v_version.engine_version,
    'config_version', v_version.config_version,
    'total_batch_g', v_version.total_batch_g);
end;
$$;
revoke all on function public.gellatti_get_publication_full_v1(uuid) from public, anon, authenticated;
grant execute on function public.gellatti_get_publication_full_v1(uuid) to authenticated;

-- ── Community discovery (§37) ───────────────────────────────────────────────
-- Windows: trending | week | month | all_time. Ordering is by the ranking
-- score computed in SQL from the SAME raw components the TypeScript ranking
-- module documents, so the list and the board can never disagree about what
-- „successful" means. Views carry ZERO weight (§38).
create or replace function public.gellatti_list_community_v1(
  p_window text default 'trending', p_category text default null,
  p_limit integer default 24, p_offset integer default 0
) returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  with scoped as (
    select p.id, m.*
    from public.community_publications p
    join public.creator_profiles c on c.id = p.creator_profile_id
    left join public.publication_metrics m on m.publication_id = p.id
    where p.status = 'published' and p.ranking_eligible
      and c.moderation_status = 'ok'
      and (p_category is null or p.category = p_category)
      and (
        p_window = 'all_time'
        or (p_window = 'month' and p.published_at > now() - interval '30 days')
        or (p_window = 'week' and p.published_at > now() - interval '7 days')
        or (p_window = 'trending')
      )
  ), scored as (
    select s.id,
      -- v1 weights (mirrored in src/features/community/domain/ranking.ts):
      -- makers 5, makes 2, remixes 3, users 1, verified rating 4×(avg-3),
      -- recency multiplier only in the `trending` window.
      (5 * coalesce(s.unique_makers, 0)
       + 2 * coalesce(s.total_makes, 0)
       + 3 * coalesce(s.remix_count, 0)
       + 1 * coalesce(s.unique_users, 0)
       + case when coalesce(s.rating_count, 0) >= 3
              then 4 * (s.rating_sum::numeric / s.rating_count - 3) * least(s.rating_count, 50) / 50
              else 0 end
      ) * case when p_window = 'trending'
               then 1 + (coalesce(s.makes_last_7d, 0)::numeric / 10) else 1 end as score
    from scoped s
  )
  select coalesce(jsonb_agg(card order by score desc, card ->> 'published_at' desc), '[]'::jsonb)
  from (
    select public.gellatti_publication_card_v1(scored.id) as card, scored.score
    from scored order by scored.score desc
    limit greatest(least(coalesce(p_limit, 24), 100), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) page
  where card is not null;
$$;
revoke all on function public.gellatti_list_community_v1(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.gellatti_list_community_v1(text, text, integer, integer)
  to anon, authenticated;

-- ── TOP 100 (§38) ───────────────────────────────────────────────────────────
create or replace function public.gellatti_top_recipes_v1(
  p_window text default 'all_time', p_limit integer default 100
) returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select public.gellatti_list_community_v1(p_window, null, least(coalesce(p_limit, 100), 100), 0);
$$;
revoke all on function public.gellatti_top_recipes_v1(text, integer) from public, anon, authenticated;
grant execute on function public.gellatti_top_recipes_v1(text, integer) to anon, authenticated;

-- ── Top Creators (§39) — ranked by recipe performance, never by followers ───
create or replace function public.gellatti_top_creators_v1(p_limit integer default 50)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(entry order by entry_score desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'handle', c.handle, 'display_handle', c.display_handle,
      'display_name', c.display_name, 'avatar_url', c.avatar_url,
      'country', c.country, 'verification_status', c.verification_status,
      'metrics', jsonb_build_object(
        'public_recipe_count', cm.public_recipe_count,
        'unique_users', cm.unique_users,
        'unique_makers', cm.unique_makers,
        'total_makes', cm.total_makes,
        'remix_count', cm.remix_count,
        'rating_average', case when cm.rating_count > 0
          then round(cm.rating_sum::numeric / cm.rating_count, 2) else null end)) as entry,
      (5 * cm.unique_makers + 2 * cm.total_makes + 3 * cm.remix_count
       + 1 * cm.unique_users + 2 * cm.public_recipe_count) as entry_score
    from public.creator_profiles c
    join public.creator_metrics cm on cm.creator_profile_id = c.id
    where c.is_public and c.moderation_status = 'ok' and c.ranking_eligible
      and cm.public_recipe_count > 0
      -- A creator with no confirmed usage has no meaningful rank; §39 says
      -- show a rank only where the data means something.
      and (cm.unique_makers > 0 or cm.unique_users > 0)
    order by entry_score desc
    limit greatest(least(coalesce(p_limit, 50), 100), 1)
  ) ranked;
$$;
revoke all on function public.gellatti_top_creators_v1(integer) from public, anon, authenticated;
grant execute on function public.gellatti_top_creators_v1(integer) to anon, authenticated;

-- ── Public creator profile (§6) ─────────────────────────────────────────────
create or replace function public.gellatti_get_creator_v1(p_handle text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_c public.creator_profiles; v_m public.creator_metrics;
begin
  select * into v_c from public.creator_profiles
  where handle = lower(btrim(coalesce(p_handle, ''))) and is_public and moderation_status = 'ok';
  if v_c.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_m from public.creator_metrics where creator_profile_id = v_c.id;

  return jsonb_build_object(
    'ok', true,
    'creator', jsonb_strip_nulls(jsonb_build_object(
      'handle', v_c.handle, 'display_handle', v_c.display_handle,
      'display_name', v_c.display_name, 'avatar_url', v_c.avatar_url,
      'bio', v_c.bio, 'country', v_c.country, 'city', v_c.city,
      'verification_status', v_c.verification_status)),
    'metrics', jsonb_build_object(
      'public_recipe_count', coalesce(v_m.public_recipe_count, 0),
      'unique_users', coalesce(v_m.unique_users, 0),
      'unique_makers', coalesce(v_m.unique_makers, 0),
      'total_makes', coalesce(v_m.total_makes, 0),
      'remix_count', coalesce(v_m.remix_count, 0),
      'rating_average', case when coalesce(v_m.rating_count, 0) > 0
        then round(v_m.rating_sum::numeric / v_m.rating_count, 2) else null end),
    'publications', coalesce((
      select jsonb_agg(public.gellatti_publication_card_v1(p.id) order by p.published_at desc)
      from public.community_publications p
      where p.creator_profile_id = v_c.id and p.status = 'published'), '[]'::jsonb));
end;
$$;
revoke all on function public.gellatti_get_creator_v1(text) from public, anon, authenticated;
grant execute on function public.gellatti_get_creator_v1(text) to anon, authenticated;

-- ── Community search (§58) — title, creator handle/name, category ───────────
-- Deliberately narrow: no ingredient or Mapper-internal search surface exists
-- here, so proprietary catalogue structure cannot be probed through it.
create or replace function public.gellatti_search_community_v1(
  p_query text, p_limit integer default 24
) returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(card), '[]'::jsonb) from (
    select public.gellatti_publication_card_v1(p.id) as card
    from public.community_publications p
    join public.creator_profiles c on c.id = p.creator_profile_id
    where p.status = 'published' and c.moderation_status = 'ok'
      and btrim(coalesce(p_query, '')) <> ''
      and (
        p.title ilike '%' || btrim(p_query) || '%'
        or p.category ilike '%' || btrim(p_query) || '%'
        or c.handle ilike '%' || btrim(p_query) || '%'
        or c.display_name ilike '%' || btrim(p_query) || '%')
    order by p.published_at desc
    limit greatest(least(coalesce(p_limit, 24), 50), 1)
  ) hits where card is not null;
$$;
revoke all on function public.gellatti_search_community_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.gellatti_search_community_v1(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 15. „Udostępnione mi" — received + sent (§12, §13)
-- ---------------------------------------------------------------------------
create or replace function public.gellatti_list_received_shares_v1()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'share_link_id', l.id,
    'title', l.title,
    'version_number', l.recipe_version_number,
    'received_at', r.first_opened_at,
    'last_opened_at', r.last_opened_at,
    'status', l.status,
    'created_by', coalesce(cc.display_name, 'Twórca Gellatti'),
    'created_by_handle', case when cc.is_public then cc.handle else null end,
    'shared_by', coalesce(sc.display_name, sa.display_name),
    'shared_by_is_creator', l.shared_by_user_id = l.creator_user_id,
    -- The recipient's own entitlement, resolved server-side, so the list can
    -- honestly say „Demo" or „Odblokowane" without the client deciding.
    'entitlement', case when public.gellatti_has_paid_access_v1(auth.uid())
      then 'full' else 'shared_recipe_demo' end,
    'recipe', public.gellatti_demo_safe_projection_v1(v.recipe_input)
  )) order by r.last_opened_at desc), '[]'::jsonb)
  from public.recipe_share_recipients r
  join public.recipe_share_links l on l.id = r.share_link_id
  join public.recipe_versions v on v.id = l.recipe_version_id
  left join public.creator_profiles cc on cc.user_id = l.creator_user_id
  left join public.creator_profiles sc on sc.user_id = l.shared_by_user_id
  left join public.account_profiles sa on sa.user_id = l.shared_by_user_id
  where r.recipient_user_id = auth.uid() and not r.removed_by_recipient;
$$;
revoke all on function public.gellatti_list_received_shares_v1() from public, anon, authenticated;
grant execute on function public.gellatti_list_received_shares_v1() to authenticated;

-- „Wysłane przeze mnie" — AGGREGATES ONLY. Recipient identities are never
-- returned: §13 and §81 say a sharer sees that a conversion happened, not who
-- the customer is.
create or replace function public.gellatti_list_sent_shares_v1()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'share_link_id', l.id,
    'title', l.title,
    'recipe_id', l.recipe_id,
    'version_number', l.recipe_version_number,
    'created_at', l.created_at,
    'status', l.status,
    'expires_at', l.expires_at,
    'opens', l.open_count,
    'unique_opens', l.unique_open_count,
    'partner_attribution', l.partner_id is not null
      and public.gellatti_partner_is_active_v1(l.partner_id)
  )) order by l.created_at desc), '[]'::jsonb)
  from public.recipe_share_links l
  where l.shared_by_user_id = auth.uid() or l.owner_user_id = auth.uid();
$$;
revoke all on function public.gellatti_list_sent_shares_v1() from public, anon, authenticated;
grant execute on function public.gellatti_list_sent_shares_v1() to authenticated;

-- ---------------------------------------------------------------------------
-- 16. Creator analytics vs Partner analytics — deliberately SEPARATE (§36)
-- ---------------------------------------------------------------------------
-- „32 000 osób zrobiło moją recepturę" and „320 € prowizji" are different
-- kinds of fact and are returned by different functions, so no screen can
-- accidentally present one as the other.
create or replace function public.gellatti_creator_analytics_v1()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid(); v_c public.creator_profiles; v_m public.creator_metrics;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_c from public.creator_profiles where user_id = v_uid;
  if v_c.id is null then return jsonb_build_object('ok', false, 'reason', 'no_creator_profile'); end if;
  select * into v_m from public.creator_metrics where creator_profile_id = v_c.id;

  return jsonb_build_object(
    'ok', true,
    'handle', v_c.handle,
    'is_public', v_c.is_public,
    'moderation_status', v_c.moderation_status,
    'metrics', jsonb_build_object(
      'public_recipe_count', coalesce(v_m.public_recipe_count, 0),
      'unique_users', coalesce(v_m.unique_users, 0),
      'unique_makers', coalesce(v_m.unique_makers, 0),
      'total_makes', coalesce(v_m.total_makes, 0),
      'remix_count', coalesce(v_m.remix_count, 0),
      'rating_count', coalesce(v_m.rating_count, 0),
      'rating_average', case when coalesce(v_m.rating_count, 0) > 0
        then round(v_m.rating_sum::numeric / v_m.rating_count, 2) else null end),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'publication_id', p.id, 'title', p.title, 'slug', p.slug,
        'status', p.status, 'version_number', p.recipe_version_number,
        'published_at', p.published_at,
        'unique_makers', coalesce(pm.unique_makers, 0),
        'total_makes', coalesce(pm.total_makes, 0),
        'remix_count', coalesce(pm.remix_count, 0),
        'rating_count', coalesce(pm.rating_count, 0)) order by p.published_at desc)
      from public.community_publications p
      left join public.publication_metrics pm on pm.publication_id = p.id
      where p.creator_profile_id = v_c.id), '[]'::jsonb));
end;
$$;
revoke all on function public.gellatti_creator_analytics_v1() from public, anon, authenticated;
grant execute on function public.gellatti_creator_analytics_v1() to authenticated;

-- Partner dashboard (§35). Reads the EXISTING commission ledger — no new
-- money tables, no client-supplied amounts. Returns aggregates only; no
-- customer identity ever crosses this boundary (§81). A user who is not an
-- active partner gets a typed refusal rather than an empty dashboard, because
-- „no commissions yet" and „you are not a partner" are different answers
-- (owner rule 2026-08-23).
create or replace function public.gellatti_partner_dashboard_v1()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid(); v_partner public.partners;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_partner from public.partners where user_id = v_uid;
  if v_partner.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_partner');
  end if;
  if v_partner.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'partner_not_active',
      'partner_status', v_partner.status);
  end if;

  return jsonb_build_object(
    'ok', true,
    'partner_status', v_partner.status,
    'tier', v_partner.tier,
    'payouts_enabled', v_partner.payouts_enabled,
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'slug', c.slug, 'status', c.status))
      from public.partner_codes c where c.partner_id = v_partner.id and c.status = 'active'), '[]'::jsonb),
    'traffic', jsonb_build_object(
      'referral_opens', coalesce((
        select count(*) from public.referral_clicks rc where rc.partner_id = v_partner.id), 0),
      'recipe_share_opens', coalesce((
        select sum(l.open_count) from public.recipe_share_links l
        where l.partner_id = v_partner.id), 0),
      'recipe_share_unique_opens', coalesce((
        select sum(l.unique_open_count) from public.recipe_share_links l
        where l.partner_id = v_partner.id), 0)),
    'attributions', jsonb_build_object(
      'pending', coalesce((select count(*) from public.referral_attributions ra
        where ra.partner_id = v_partner.id and ra.status = 'pending'), 0),
      'active', coalesce((select count(*) from public.referral_attributions ra
        where ra.partner_id = v_partner.id and ra.status = 'active'), 0)),
    'commissions', coalesce((
      select jsonb_object_agg(status, agg) from (
        select ce.status, jsonb_build_object(
          'count', count(*), 'amount_cents', coalesce(sum(ce.amount_cents), 0),
          'currency', min(ce.currency)) as agg
        from public.commission_entries ce
        where ce.partner_id = v_partner.id group by ce.status) totals), '{}'::jsonb));
end;
$$;
revoke all on function public.gellatti_partner_dashboard_v1() from public, anon, authenticated;
grant execute on function public.gellatti_partner_dashboard_v1() to authenticated;

-- ---------------------------------------------------------------------------
-- 17. Moderation (§51, §52) — Creator and Partner levers stay independent
-- ---------------------------------------------------------------------------
-- Suspending a partner's commissions must NOT delete their legitimate
-- Community recipes, and hiding a publication must NOT touch their partner
-- standing. Two functions, two levers, no shared boolean.
create or replace function public.gellatti_moderate_publication_v1(
  p_publication_id uuid, p_action text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_pub public.community_publications;
begin
  if not public.gellatti_is_admin_v1() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'exclude_from_ranking', 'restore') then
    raise exception 'action_invalid' using errcode = '22023';
  end if;
  update public.community_publications set
    status = case when p_action = 'hide' then 'hidden_by_moderation'
                  when p_action = 'restore' then 'published' else status end,
    ranking_eligible = case when p_action = 'restore' then true else false end
  where id = p_publication_id returning * into v_pub;
  if v_pub.id is null then raise exception 'publication_not_found' using errcode = '42501'; end if;
  if p_action <> 'restore' then
    delete from public.ranking_snapshots where publication_id = v_pub.id;
  end if;
  perform public.gellatti_recompute_creator_metrics_v1(v_pub.creator_profile_id);
  return jsonb_build_object('publication_id', v_pub.id, 'status', v_pub.status,
    'ranking_eligible', v_pub.ranking_eligible);
end;
$$;
revoke all on function public.gellatti_moderate_publication_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.gellatti_moderate_publication_v1(uuid, text) to authenticated;

create or replace function public.gellatti_moderate_creator_v1(
  p_creator_profile_id uuid, p_moderation_status text, p_ranking_eligible boolean default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_c public.creator_profiles;
begin
  if not public.gellatti_is_admin_v1() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if p_moderation_status not in ('ok', 'under_review', 'restricted', 'suspended') then
    raise exception 'moderation_status_invalid' using errcode = '22023';
  end if;
  update public.creator_profiles set
    moderation_status = p_moderation_status,
    ranking_eligible = coalesce(p_ranking_eligible, ranking_eligible)
  where id = p_creator_profile_id returning * into v_c;
  if v_c.id is null then raise exception 'creator_not_found' using errcode = '42501'; end if;
  -- NOTE: this function deliberately does NOT read or write public.partners.
  -- Partner suspension is a separate admin action on a separate table (§52).
  return jsonb_build_object('creator_profile_id', v_c.id,
    'moderation_status', v_c.moderation_status, 'ranking_eligible', v_c.ranking_eligible);
end;
$$;
revoke all on function public.gellatti_moderate_creator_v1(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.gellatti_moderate_creator_v1(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 18. Ranking snapshots (§38, §79) — deterministic and recomputable
-- ---------------------------------------------------------------------------
-- Stores rank + score + the RAW components that produced it, so a rank can be
-- audited, replayed after a weight change, and compared across runs. Running
-- it twice over unchanged data produces the same ordering.
create or replace function public.gellatti_snapshot_rankings_v1(
  p_window text default 'all_time', p_weights_version text default 'v1'
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  if not public.gellatti_is_admin_v1() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  delete from public.ranking_snapshots
  where board = 'top_recipes' and window_key = p_window and scope = 'global';

  insert into public.ranking_snapshots
    (board, window_key, scope, weights_version, rank, publication_id, score, components)
  select 'top_recipes', p_window, 'global', p_weights_version,
    row_number() over (order by s.score desc, s.published_at desc, s.id),
    s.id, s.score, s.components
  from (
    select p.id, p.published_at,
      jsonb_build_object(
        'unique_makers', coalesce(m.unique_makers, 0),
        'total_makes', coalesce(m.total_makes, 0),
        'remix_count', coalesce(m.remix_count, 0),
        'unique_users', coalesce(m.unique_users, 0),
        'rating_count', coalesce(m.rating_count, 0),
        'rating_sum', coalesce(m.rating_sum, 0),
        'makes_last_7d', coalesce(m.makes_last_7d, 0)) as components,
      (5 * coalesce(m.unique_makers, 0)
       + 2 * coalesce(m.total_makes, 0)
       + 3 * coalesce(m.remix_count, 0)
       + 1 * coalesce(m.unique_users, 0)
       + case when coalesce(m.rating_count, 0) >= 3
              then 4 * (m.rating_sum::numeric / m.rating_count - 3) * least(m.rating_count, 50) / 50
              else 0 end
      ) * case when p_window = 'trending'
               then 1 + (coalesce(m.makes_last_7d, 0)::numeric / 10) else 1 end as score
    from public.community_publications p
    join public.creator_profiles c on c.id = p.creator_profile_id
    left join public.publication_metrics m on m.publication_id = p.id
    where p.status = 'published' and p.ranking_eligible and c.moderation_status = 'ok'
  ) s
  where s.score > 0
  limit 100;

  get diagnostics v_count = row_count;
  return jsonb_build_object('board', 'top_recipes', 'window', p_window, 'ranked', v_count);
end;
$$;
revoke all on function public.gellatti_snapshot_rankings_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.gellatti_snapshot_rankings_v1(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 19. Closing invariants
-- ---------------------------------------------------------------------------
-- * No table created here grants INSERT to `authenticated` except
--   community_reports (a report the reporter owns) — every count, every
--   attribution and every publication is written by a SECURITY DEFINER
--   function that verifies ownership and entitlement first.
-- * `anon` is granted EXECUTE on exactly eight reader functions
--   (gellatti_resolve_share_v1, gellatti_get_publication_v1,
--   gellatti_publication_card_v1, gellatti_list_community_v1,
--   gellatti_top_recipes_v1, gellatti_top_creators_v1, gellatti_get_creator_v1,
--   gellatti_search_community_v1) and on NO table.
-- * `recipe_input` leaves the database through exactly THREE functions —
--   gellatti_open_share_v1, gellatti_open_received_share_v1 (added in §20
--   below) and gellatti_get_publication_full_v1 — and every one of them calls
--   gellatti_has_paid_access_v1 first. None is granted to anon.
--
-- * FOLLOW-UP, verified on staging: a Supabase project carries
--   `alter default privileges ... grant all on tables to anon, authenticated`,
--   so the tables above are created with FULL DML grants for both roles
--   regardless of the `grant` statements here. RLS still denied every
--   unintended command, but the grant list above is not self-sufficient.
--   Migration 20260823141500 revokes the inherited default, re-grants exactly
--   what this file intends, and tightens two UPDATE policies that had been
--   written as if the grants were doing part of the work. Read the two files
--   together.

-- ---------------------------------------------------------------------------
-- 20. Reopening a received share WITHOUT the token (§12)
-- ---------------------------------------------------------------------------
-- Once a recipe is filed under „Udostępnione mi", the recipient must be able
-- to open it again from their library. They do not have the token — it lived
-- in a link somebody sent them, and we deliberately never stored it.
--
-- So access here is proven by MEMBERSHIP instead: a row in
-- recipe_share_recipients naming this caller. That row can only exist because
-- the caller once opened a valid token, which makes it exactly as strong a
-- proof as the token itself, and no weaker: a stranger who guesses a
-- share_link_id has no recipient row and is refused.
--
-- Revocation still applies. §54 says new access is denied after a revoke, and
-- „open it again tomorrow" is new access — a previously-made independent copy
-- is what legitimately survives, not continued reading of the source.
create or replace function public.gellatti_open_received_share_v1(p_share_link_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_link public.recipe_share_links;
  v_version public.recipe_versions;
  v_creator public.creator_profiles;
  v_sharer_name text;
  v_base jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select l.* into v_link
  from public.recipe_share_links l
  join public.recipe_share_recipients r
    on r.share_link_id = l.id and r.recipient_user_id = v_uid
  where l.id = p_share_link_id;
  if v_link.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_link.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_link.expires_at is not null and v_link.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_version from public.recipe_versions where id = v_link.recipe_version_id;
  select * into v_creator from public.creator_profiles where user_id = v_link.creator_user_id;
  v_sharer_name := coalesce(
    (select nullif(btrim(cp.display_name), '') from public.creator_profiles cp
      where cp.user_id = v_link.shared_by_user_id),
    (select nullif(btrim(ap.display_name), '') from public.account_profiles ap
      where ap.user_id = v_link.shared_by_user_id));

  update public.recipe_share_recipients
    set last_opened_at = now(), open_count = recipe_share_recipients.open_count + 1
  where share_link_id = v_link.id and recipient_user_id = v_uid;

  v_base := jsonb_build_object(
    'ok', true,
    'share_link_id', v_link.id,
    'title', v_link.title,
    'version_number', v_link.recipe_version_number,
    'created_by', jsonb_strip_nulls(jsonb_build_object(
      'display_name', coalesce(v_creator.display_name, 'Twórca Gellatti'),
      'handle', case when v_creator.is_public then v_creator.handle else null end)),
    'shared_by', jsonb_strip_nulls(jsonb_build_object('display_name', v_sharer_name)),
    'shared_by_is_creator', v_link.shared_by_user_id = v_link.creator_user_id,
    'recipe', public.gellatti_demo_safe_projection_v1(v_version.recipe_input));

  -- Same server-side entitlement branch as the token path. Reopening from the
  -- library is not a way to get a different answer.
  if public.gellatti_has_paid_access_v1(v_uid) then
    return v_base || jsonb_build_object(
      'entitlement', 'full',
      'recipe_id', v_link.recipe_id,
      'recipe_version_id', v_link.recipe_version_id,
      'recipe_input', v_version.recipe_input,
      'engine_version', v_version.engine_version,
      'config_version', v_version.config_version,
      'total_batch_g', v_version.total_batch_g);
  end if;
  return v_base || jsonb_build_object('entitlement', 'shared_recipe_demo');
end;
$$;
revoke all on function public.gellatti_open_received_share_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.gellatti_open_received_share_v1(uuid) to authenticated;

-- Note for §19 of this file's closing invariants: `recipe_input` now leaves
-- the database through THREE functions — gellatti_open_share_v1,
-- gellatti_open_received_share_v1 and gellatti_get_publication_full_v1 — and
-- every one of them calls gellatti_has_paid_access_v1 first. None is granted
-- to anon.
