-- ─────────────────────────────────────────────────────────────────────────────
-- Share photo cleanup — delete the files of direct shares that nothing uses.
--
-- OWNER DECISION 2026-09-17 („PLIKI PO WYMIANIE I ODŁĄCZENIU”): detaching or
-- replacing a share photo must not silently keep the file forever. This
-- package deletes, through the Storage API, ONLY files of the private bucket
-- `recipe-share-photos` that are:
--   (1) the previous photo after a CONFIRMED replacement (the attach committed),
--   (2) the photo after a CONFIRMED detach (the detach committed),
--   (3) an upload that completed but was never attached — only once it is
--       older than a 24 h grace window, so an upload in progress is never hit.
-- Never deleted: the photo attached to a link — active, revoked or expired —
-- files of links that no longer exist, files whose owner is not the sharer,
-- anything in another bucket. Revoking a link deletes nothing. A failed
-- replacement or detach rolls back and queues nothing.
--
-- MECHANISM (reused, not a second file service): the shape already live for
-- `gellatti-email-dispatch` (20260903120000) — pg_cron → SECURITY DEFINER tick
-- → Vault (`gellatti_edge_functions_base_url` + this package's OWN key name
-- `gellatti_share_photo_cleanup_key`, so switching the cleanup on never switches
-- on email dispatch, whose key stays separate)
-- → net.http_post → an operator-only Edge worker (`share-photo-cleanup`) that
-- claims with `for update skip locked` and settles through SECURITY DEFINER
-- functions. The worker deletes with the Storage API because storage.objects
-- refuses a direct DELETE (trigger protect_objects_delete).
--
-- RACE: attaching a path and claiming or sweeping it take the same
-- transaction-scoped advisory lock on the object name, always in ascending
-- name order, and an attach refuses a path that is already in the cleanup
-- ledger. A file is therefore either attached or deletable — never both.
--
-- INERT UNTIL CONFIGURED: without both Vault secrets the tick returns
-- `not_configured` and changes nothing, exactly like the email tick.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ledger: what may be deleted, why, and what happened ─────────────────────
create table if not exists public.recipe_share_photo_cleanup (
  object_name   text primary key,
  share_link_id uuid not null,
  owner_user_id uuid not null,
  reason        text not null check (reason in ('replaced', 'detached', 'unattached')),
  status        text not null default 'queued'
                  check (status in ('queued', 'claimed', 'deleted', 'failed', 'kept')),
  queued_at     timestamptz not null default now(),
  claim_token   uuid,
  claimed_at    timestamptz,
  attempts      integer not null default 0 check (attempts >= 0),
  max_attempts  integer not null default 5 check (max_attempts between 1 and 20),
  last_error    text,
  settled_at    timestamptz,
  constraint recipe_share_photo_cleanup_name_format check (
    object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9-]+\.(jpg|png|webp)$'
  ),
  constraint recipe_share_photo_cleanup_own_folder check (
    split_part(object_name, '/', 1) = share_link_id::text
  )
);
create index if not exists recipe_share_photo_cleanup_status_idx
  on public.recipe_share_photo_cleanup (status, queued_at);

alter table public.recipe_share_photo_cleanup enable row level security;
revoke all on table public.recipe_share_photo_cleanup from public, anon, authenticated, service_role;

comment on table public.recipe_share_photo_cleanup is
  'Share photo files queued for deletion (replaced, detached, unattached after 24 h). '
  'Operator-only; the share-photo-cleanup worker deletes through the Storage API.';

-- ── one lock key per object name, and one per link ──────────────────────────
create or replace function public.gellatti_share_photo_object_lock_v1(p_object_name text)
returns void language sql volatile security definer
set search_path = pg_catalog, public as $$
  select pg_advisory_xact_lock(hashtextextended('recipe-share-photos/' || p_object_name, 20260917));
$$;
revoke all on function public.gellatti_share_photo_object_lock_v1(text)
  from public, anon, authenticated, service_role;

create or replace function public.gellatti_share_photo_link_lock_v1(p_share_link_id uuid)
returns void language sql volatile security definer
set search_path = pg_catalog, public as $$
  select pg_advisory_xact_lock(hashtextextended('recipe-share-link-photo/' || p_share_link_id::text, 20260917));
$$;
revoke all on function public.gellatti_share_photo_link_lock_v1(uuid)
  from public, anon, authenticated, service_role;

-- ── due predicate: ONE definition for the tick and the claim ────────────────
create or replace function public.gellatti_share_photo_cleanup_is_due_v1(
  p_status text, p_attempts integer, p_max_attempts integer,
  p_queued_at timestamptz, p_claimed_at timestamptz
) returns boolean language sql stable
set search_path = pg_catalog, public as $$
  select p_queued_at <= now() - interval '10 minutes'
     and (
       (p_status in ('queued', 'failed') and p_attempts < p_max_attempts)
       or (p_status = 'claimed' and p_claimed_at < now() - interval '15 minutes'
           and p_attempts < p_max_attempts)
     );
$$;
revoke all on function public.gellatti_share_photo_cleanup_is_due_v1(text, integer, integer, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

-- ── attach / detach: unchanged contract, now queues the file it releases ────
-- Same arguments, errors, grants and return value as 20260917103413. Added:
-- a per-link lock (two attaches of one link cannot both miss the previous
-- path), object locks in ascending name order, refusal of a path already in the
-- cleanup ledger, and — only after the change itself succeeded — the released
-- path is queued as 'replaced' or 'detached'.
create or replace function public.gellatti_set_share_photo_v1(
  p_share_link_id uuid, p_storage_path text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_link public.recipe_share_links;
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_previous text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_link from public.recipe_share_links
  where id = p_share_link_id and shared_by_user_id = v_uid;
  if v_link.id is null then raise exception 'share_link_not_found' using errcode = '42501'; end if;
  if v_link.status <> 'active' or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    raise exception 'share_link_inactive' using errcode = '22023';
  end if;

  perform public.gellatti_share_photo_link_lock_v1(v_link.id);
  select ph.storage_path into v_previous
    from public.recipe_share_link_photos ph
   where ph.share_link_id = v_link.id;

  if v_path = '' then
    if v_previous is not null then
      perform public.gellatti_share_photo_object_lock_v1(v_previous);
      delete from public.recipe_share_link_photos where share_link_id = v_link.id;
      insert into public.recipe_share_photo_cleanup (object_name, share_link_id, owner_user_id, reason)
      values (v_previous, v_link.id, v_uid, 'detached')
      on conflict (object_name) do nothing;
    end if;
    return jsonb_build_object('share_link_id', v_link.id, 'own_photo', false);
  end if;

  if v_path !~ ('^' || v_link.id::text || '/[A-Za-z0-9-]+\.(jpg|png|webp)$') then
    raise exception 'share_photo_not_owned' using errcode = '42501';
  end if;

  if v_previous is not null and v_previous <> v_path then
    perform public.gellatti_share_photo_object_lock_v1(least(v_path, v_previous));
    perform public.gellatti_share_photo_object_lock_v1(greatest(v_path, v_previous));
  else
    perform public.gellatti_share_photo_object_lock_v1(v_path);
  end if;

  if not exists (
       select 1 from storage.objects object
       where object.bucket_id = 'recipe-share-photos'
         and object.name = v_path
         and object.owner_id = v_uid::text
     )
     or exists (
       select 1 from public.recipe_share_photo_cleanup queued
       where queued.object_name = v_path
     ) then
    raise exception 'share_photo_not_owned' using errcode = '42501';
  end if;

  insert into public.recipe_share_link_photos (share_link_id, storage_path, attached_by_user_id)
  values (v_link.id, v_path, v_uid)
  on conflict (share_link_id) do update set
    storage_path = excluded.storage_path,
    attached_by_user_id = excluded.attached_by_user_id,
    updated_at = now();

  if v_previous is not null and v_previous <> v_path then
    insert into public.recipe_share_photo_cleanup (object_name, share_link_id, owner_user_id, reason)
    values (v_previous, v_link.id, v_uid, 'replaced')
    on conflict (object_name) do nothing;
  end if;
  return jsonb_build_object('share_link_id', v_link.id, 'own_photo', true);
end;
$$;
revoke all on function public.gellatti_set_share_photo_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.gellatti_set_share_photo_v1(uuid, text) to authenticated;

-- ── sweep: uploads that completed but were never attached (24 h grace) ──────
create or replace function public.gellatti_share_photo_cleanup_sweep_v1(
  p_grace interval default interval '24 hours',
  p_limit integer default 500
) returns integer language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_object record;
  v_queued integer := 0;
begin
  if p_grace is null or p_grace < interval '24 hours' then
    raise exception 'share_photo_cleanup_grace_too_short' using errcode = '22023';
  end if;
  for v_object in
    select object.name, link.id as share_link_id, link.shared_by_user_id
      from storage.objects object
      join public.recipe_share_links link
        on link.id::text = split_part(object.name, '/', 1)
     where object.bucket_id = 'recipe-share-photos'
       and object.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9-]+\.(jpg|png|webp)$'
       and object.created_at < now() - p_grace
       and object.owner_id = link.shared_by_user_id::text
       and not exists (select 1 from public.recipe_share_link_photos ph where ph.storage_path = object.name)
       and not exists (select 1 from public.recipe_share_photo_cleanup queued where queued.object_name = object.name)
     order by object.name
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    perform public.gellatti_share_photo_object_lock_v1(v_object.name);
    -- Re-read under the lock: an attach that committed meanwhile wins.
    continue when exists (
      select 1 from public.recipe_share_link_photos ph where ph.storage_path = v_object.name
    );
    insert into public.recipe_share_photo_cleanup (object_name, share_link_id, owner_user_id, reason)
    values (v_object.name, v_object.share_link_id, v_object.shared_by_user_id, 'unattached')
    on conflict (object_name) do nothing;
    if found then v_queued := v_queued + 1; end if;
  end loop;
  return v_queued;
end;
$$;
revoke all on function public.gellatti_share_photo_cleanup_sweep_v1(interval, integer)
  from public, anon, authenticated, service_role;

-- ── claim: the database decides, right before the worker deletes ────────────
create or replace function public.gellatti_share_photo_cleanup_claim_v1(p_limit integer default 50)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_token uuid := gen_random_uuid();
  v_row public.recipe_share_photo_cleanup;
  v_keep text;
  v_names text[] := '{}';
begin
  for v_row in
    select queued.*
      from public.recipe_share_photo_cleanup queued
     where public.gellatti_share_photo_cleanup_is_due_v1(
             queued.status, queued.attempts, queued.max_attempts, queued.queued_at, queued.claimed_at)
     order by queued.object_name
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  loop
    perform public.gellatti_share_photo_object_lock_v1(v_row.object_name);

    v_keep := case
      when exists (select 1 from public.recipe_share_link_photos ph where ph.storage_path = v_row.object_name)
        then 'in_use'
      when not exists (
        select 1 from public.recipe_share_links link
        where link.id = v_row.share_link_id and link.shared_by_user_id = v_row.owner_user_id)
        then 'link_gone_or_other_sharer'
      when exists (
        select 1 from storage.objects object
        where object.bucket_id = 'recipe-share-photos' and object.name = v_row.object_name
          and object.owner_id is distinct from v_row.owner_user_id::text)
        then 'other_owner'
      else null
    end;

    if v_keep is not null then
      update public.recipe_share_photo_cleanup
         set status = 'kept', last_error = v_keep, claim_token = null, settled_at = now()
       where recipe_share_photo_cleanup.object_name = v_row.object_name;
    elsif not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'recipe-share-photos' and object.name = v_row.object_name
    ) then
      update public.recipe_share_photo_cleanup
         set status = 'deleted', last_error = 'already_absent', claim_token = null, settled_at = now()
       where recipe_share_photo_cleanup.object_name = v_row.object_name;
    else
      update public.recipe_share_photo_cleanup
         set status = 'claimed', claim_token = v_token, claimed_at = now(), attempts = attempts + 1
       where recipe_share_photo_cleanup.object_name = v_row.object_name;
      v_names := v_names || v_row.object_name;
    end if;
  end loop;

  return jsonb_build_object(
    'claim_token', case when cardinality(v_names) > 0 then v_token end,
    'objects', to_jsonb(v_names)
  );
end;
$$;
revoke all on function public.gellatti_share_photo_cleanup_claim_v1(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.gellatti_share_photo_cleanup_claim_v1(integer) to service_role;

-- ── settle: a file counts as deleted only when Storage no longer has it ─────
create or replace function public.gellatti_share_photo_cleanup_settle_v1(
  p_claim_token uuid,
  p_removed text[] default '{}',
  p_error text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_deleted integer;
  v_failed integer;
begin
  if p_claim_token is null then
    raise exception 'share_photo_cleanup_claim_required' using errcode = '22023';
  end if;

  update public.recipe_share_photo_cleanup queued
     set status = 'deleted', last_error = null, claim_token = null, settled_at = now()
   where queued.claim_token = p_claim_token
     and queued.status = 'claimed'
     and queued.object_name = any (coalesce(p_removed, '{}'))
     and not exists (
       select 1 from storage.objects object
       where object.bucket_id = 'recipe-share-photos' and object.name = queued.object_name
     );
  get diagnostics v_deleted = row_count;

  -- Everything else of this claim — reported or not, still present or not —
  -- goes back to the queue with the reason; attempts bound the retries.
  update public.recipe_share_photo_cleanup queued
     set status = 'failed',
         last_error = left(coalesce(nullif(p_error, ''), 'not_removed'), 200),
         claim_token = null
   where queued.claim_token = p_claim_token
     and queued.status = 'claimed';
  get diagnostics v_failed = row_count;

  return jsonb_build_object('deleted', v_deleted, 'failed', v_failed);
end;
$$;
revoke all on function public.gellatti_share_photo_cleanup_settle_v1(uuid, text[], text)
  from public, anon, authenticated, service_role;
grant execute on function public.gellatti_share_photo_cleanup_settle_v1(uuid, text[], text) to service_role;

-- ── scheduled caller (the email-dispatch tick, for this worker) ─────────────
create or replace function public.gellatti_share_photo_cleanup_tick_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_base_url     text;
  v_dispatch_key text;
  v_queued       integer;
  v_due          integer;
  v_request_id   bigint;
begin
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'gellatti_edge_functions_base_url';
  select decrypted_secret into v_dispatch_key
    from vault.decrypted_secrets where name = 'gellatti_share_photo_cleanup_key';

  if coalesce(v_base_url, '') = '' or coalesce(v_dispatch_key, '') = '' then
    return jsonb_build_object('skipped', 'not_configured');
  end if;

  v_queued := public.gellatti_share_photo_cleanup_sweep_v1();

  select count(*) into v_due
    from public.recipe_share_photo_cleanup queued
   where public.gellatti_share_photo_cleanup_is_due_v1(
           queued.status, queued.attempts, queued.max_attempts, queued.queued_at, queued.claimed_at);

  if v_due = 0 then
    return jsonb_build_object('skipped', 'nothing_due', 'queued', v_queued);
  end if;

  select net.http_post(
    url     => rtrim(v_base_url, '/') || '/share-photo-cleanup',
    body    => '{}'::jsonb,
    headers => jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_dispatch_key
               ),
    timeout_milliseconds => 20000
  ) into v_request_id;

  return jsonb_build_object('dispatched', true, 'due', v_due, 'queued', v_queued, 'requestId', v_request_id);
end $$;

comment on function public.gellatti_share_photo_cleanup_tick_v1() is
  'Scheduled caller for the share-photo-cleanup Edge Function. Inert until the Vault '
  'secrets gellatti_edge_functions_base_url and gellatti_share_photo_cleanup_key exist.';

revoke all on function public.gellatti_share_photo_cleanup_tick_v1()
  from public, anon, authenticated, service_role;

-- ── schedule: every 15 minutes, re-runnable ─────────────────────────────────
do $$
begin
  perform cron.unschedule('gellatti-share-photo-cleanup');
exception when others then null;
end $$;

select cron.schedule(
  'gellatti-share-photo-cleanup',
  '*/15 * * * *',
  $cron$select public.gellatti_share_photo_cleanup_tick_v1()$cron$
);
