-- ============================================================================
-- Community / Sharing v1 — grant + UPDATE-policy hardening
-- ============================================================================
-- WHY THIS EXISTS. The v1 migration granted exactly the privileges it
-- intended. That turned out not to be the whole story: a Supabase project
-- carries `alter default privileges ... grant all on tables to anon,
-- authenticated`, so EVERY newly created table in `public` starts with
-- SELECT/INSERT/UPDATE/DELETE for both roles no matter what the migration
-- says. Verified on staging after applying v1 — all thirteen new tables
-- showed full DML grants for `anon` and `authenticated`.
--
-- Nothing leaked: RLS was enabled on all thirteen, and a table with no policy
-- for a command denies that command outright. But it means the REAL access
-- control is the policy set, not the grant list — and reviewing the policies
-- under that assumption surfaced two that were written as if the grants were
-- doing part of the work.
--
-- ── HOLE 1 (serious): recipe_share_recipients.share_link_id was not pinned ──
-- `recipe_share_recipients_update_own` let a recipient update their own row
-- while checking only `auth.uid() = recipient_user_id`, `open_count` and
-- `first_opened_at`. `share_link_id` was NOT pinned, so a user holding any one
-- legitimate recipient row could repoint it at an arbitrary share link id and
-- then call `gellatti_open_received_share_v1`, which proves access by
-- membership in exactly this table. A paying user could therefore have read
-- the full formulation of any share link whose id they obtained. Fixed by
-- pinning every column except the one flag the recipient owns.
--
-- ── HOLE 2: community_publications was editable beyond its safe columns ─────
-- The update policy checked only ownership, so a creator could also write
-- `status`, `ranking_eligible`, `public_projection` and `recipe_version_id` —
-- i.e. un-hide a publication moderation had hidden (§51/§52), put themselves
-- back into rankings, swap the demo-safe body for one of their choosing, or
-- repoint a live publication at a different immutable version and break the
-- §5 guarantee that a published V1 keeps meaning V1. Fixed by pinning every
-- column except the presentation fields a creator legitimately edits.
--
-- Both policies now follow the same shape as `recipe_share_links_revoke_own`:
-- the WITH CHECK re-reads the stored row and requires every column the user
-- does not own to be unchanged.

-- ---------------------------------------------------------------------------
-- 1. Make the grant surface explicit rather than inherited
-- ---------------------------------------------------------------------------
-- Revoke the project default, then re-grant exactly what v1 intended. After
-- this the file's stated invariants are literally true of the database, not
-- merely of the migration text: `anon` reaches NO table directly, and
-- `authenticated` holds only the privileges named here.
do $$
declare t text;
begin
  foreach t in array array[
    'creator_profiles', 'creator_reserved_handles', 'community_publications',
    'recipe_lineage', 'recipe_share_links', 'recipe_share_recipients',
    'recipe_usage_events', 'recipe_make_events', 'recipe_ratings',
    'publication_metrics', 'creator_metrics', 'ranking_snapshots',
    'community_reports'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Read-only surfaces (RLS still scopes every row to its owner).
grant select on public.creator_profiles to authenticated;
grant select on public.recipe_lineage to authenticated;
grant select on public.recipe_usage_events to authenticated;
grant select on public.recipe_make_events to authenticated;
grant select on public.recipe_ratings to authenticated;

-- Owner-editable surfaces, narrowed by the policies below.
grant select, update on public.community_publications to authenticated;
grant select, update on public.recipe_share_links to authenticated;
grant select, update on public.recipe_share_recipients to authenticated;

-- The one place a client may INSERT: a report the reporter owns.
grant select, insert on public.community_reports to authenticated;

-- creator_reserved_handles, publication_metrics, creator_metrics and
-- ranking_snapshots receive NO grant at all: they are read through SECURITY
-- DEFINER functions or not at all.

-- ---------------------------------------------------------------------------
-- 2. HOLE 1 — a recipient may change exactly one flag
-- ---------------------------------------------------------------------------
-- „Usuń z otrzymanych" sets `removed_by_recipient`. Everything else about the
-- row — above all `share_link_id`, which IS the access proof — is immutable
-- from the client. Membership can now only be created by actually opening a
-- valid token.
drop policy if exists recipe_share_recipients_update_own on public.recipe_share_recipients;
create policy recipe_share_recipients_update_own on public.recipe_share_recipients
  for update using (auth.uid() = recipient_user_id)
  with check (
    auth.uid() = recipient_user_id
    and share_link_id = (select r.share_link_id from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
    and recipient_user_id = (select r.recipient_user_id from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
    and open_count = (select r.open_count from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
    and first_opened_at = (select r.first_opened_at from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
    and last_opened_at = (select r.last_opened_at from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
    and created_at = (select r.created_at from public.recipe_share_recipients r where r.id = recipe_share_recipients.id)
  );

-- ---------------------------------------------------------------------------
-- 3. HOLE 2 — a creator edits presentation, never identity or standing
-- ---------------------------------------------------------------------------
-- Editable: slug, title, description, image_url, category, tags.
-- Pinned: the creator identity, the recipe, THE IMMUTABLE VERSION (§5), the
-- demo-safe body (§9/§16), the moderation status and ranking eligibility
-- (§51/§52) — those last two move only through
-- gellatti_unpublish_v1 / gellatti_moderate_publication_v1.
drop policy if exists community_publications_update_own on public.community_publications;
create policy community_publications_update_own on public.community_publications
  for update using (auth.uid() = creator_user_id)
  with check (
    auth.uid() = creator_user_id
    and creator_profile_id = (select p.creator_profile_id from public.community_publications p where p.id = community_publications.id)
    and creator_user_id = (select p.creator_user_id from public.community_publications p where p.id = community_publications.id)
    and recipe_id = (select p.recipe_id from public.community_publications p where p.id = community_publications.id)
    and recipe_version_id = (select p.recipe_version_id from public.community_publications p where p.id = community_publications.id)
    and recipe_version_number = (select p.recipe_version_number from public.community_publications p where p.id = community_publications.id)
    and public_projection = (select p.public_projection from public.community_publications p where p.id = community_publications.id)
    and status = (select p.status from public.community_publications p where p.id = community_publications.id)
    and ranking_eligible = (select p.ranking_eligible from public.community_publications p where p.id = community_publications.id)
    and published_at = (select p.published_at from public.community_publications p where p.id = community_publications.id)
  );

-- ---------------------------------------------------------------------------
-- 4. recipe_share_links — pin the remaining identity columns
-- ---------------------------------------------------------------------------
-- v1 already pinned the version, the three roles and the counters. It did not
-- pin `owner_user_id`, `recipe_id`, `publication_id`, `title` or `expires_at`,
-- so a sharer could have rewritten them while „revoking". Revocation should
-- change status and nothing else.
drop policy if exists recipe_share_links_revoke_own on public.recipe_share_links;
create policy recipe_share_links_revoke_own on public.recipe_share_links
  for update using (auth.uid() = owner_user_id or auth.uid() = shared_by_user_id)
  with check (
    (auth.uid() = owner_user_id or auth.uid() = shared_by_user_id)
    and status = 'revoked'
    and token_hash = (select l.token_hash from public.recipe_share_links l where l.id = recipe_share_links.id)
    and owner_user_id = (select l.owner_user_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and creator_user_id = (select l.creator_user_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and shared_by_user_id = (select l.shared_by_user_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and partner_id is not distinct from (select l.partner_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and recipe_id = (select l.recipe_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and recipe_version_id = (select l.recipe_version_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and recipe_version_number = (select l.recipe_version_number from public.recipe_share_links l where l.id = recipe_share_links.id)
    and publication_id is not distinct from (select l.publication_id from public.recipe_share_links l where l.id = recipe_share_links.id)
    and title = (select l.title from public.recipe_share_links l where l.id = recipe_share_links.id)
    and expires_at is not distinct from (select l.expires_at from public.recipe_share_links l where l.id = recipe_share_links.id)
    and open_count = (select l.open_count from public.recipe_share_links l where l.id = recipe_share_links.id)
    and unique_open_count = (select l.unique_open_count from public.recipe_share_links l where l.id = recipe_share_links.id)
    and created_at = (select l.created_at from public.recipe_share_links l where l.id = recipe_share_links.id)
  );

-- ---------------------------------------------------------------------------
-- 5. NOT changed here, on purpose
-- ---------------------------------------------------------------------------
-- The project-wide `alter default privileges in schema public grant all on
-- tables to anon, authenticated` is deliberately LEFT ALONE. Changing it would
-- silently alter the grant surface of every table any future migration
-- creates, in this repo and in parallel work — a side effect far outside the
-- scope of this feature. The correct fix for the next feature is the same one
-- applied above: name your grants explicitly and revoke the rest.
--
-- Consequence to remember when reviewing any NEW table in public: its grants
-- are permissive by default, so RLS policies are the whole access control.
-- A table with RLS on and no policy for a command denies that command; a table
-- with a policy must pin every column the user does not own.
