-- SHARE PHOTO CLEANUP — DRY RUN (READ ONLY)
--
-- What 20260917170000_share_photo_cleanup would treat as deletable RIGHT NOW,
-- without applying it: it deletes nothing, writes nothing and prints no file
-- names of real customers — only counts, bytes and time windows per category.
-- Run it with any read-only SQL client against the project.
--
-- Categories mirror the package rules:
--   1 CHRONIONE      attached to a link (active, revoked or expired) — never deleted
--   2 CHRONIONE      not attached, younger than 24 h — may still be an upload in progress
--   3 KWALIFIKUJE SIĘ not attached, older than 24 h, own link folder, owned by the sharer
--   4 POZA ZAKRESEM  no such link, another owner, or a name the app never generates —
--                    left alone; needs a separate decision
-- Replacements and detaches made AFTER the package is applied are queued at the
-- moment they commit and become deletable 10 minutes later (see the ledger query).

with objects as (
  select object.name,
         object.owner_id,
         object.created_at,
         coalesce((object.metadata ->> 'size')::bigint, 0) as bytes,
         link.id as link_id,
         link.shared_by_user_id,
         case
           when link.expires_at is not null and link.expires_at <= now() then 'expired'
           else link.status
         end as link_state,
         object.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9-]+\.(jpg|png|webp)$' as name_ok,
         exists (
           select 1 from public.recipe_share_link_photos ph where ph.storage_path = object.name
         ) as attached
    from storage.objects object
    left join public.recipe_share_links link
      on link.id::text = split_part(object.name, '/', 1)
   where object.bucket_id = 'recipe-share-photos'
)
select case
         when attached then '1 CHRONIONE — dołączone do linku (' || coalesce(link_state, '?') || ')'
         when not name_ok then '4 POZA ZAKRESEM — nazwa spoza wzorca'
         when link_id is null then '4 POZA ZAKRESEM — link nie istnieje'
         when owner_id is distinct from shared_by_user_id::text then '4 POZA ZAKRESEM — właściciel pliku ≠ udostępniający'
         when created_at >= now() - interval '24 hours' then '2 CHRONIONE — nieprzypięte, młodsze niż 24 h'
         else '3 KWALIFIKUJE SIĘ — nieprzypięte, starsze niż 24 h'
       end as category,
       count(*) as files,
       sum(bytes) as bytes,
       min(created_at) as oldest,
       max(created_at) as newest,
       max(created_at) + interval '24 hours' as last_one_eligible_after
  from objects
 group by 1
 order by 1;

-- After the package is applied, the ledger shows what happened (also read only):
-- select reason, status, last_error, count(*) as files, min(queued_at), max(settled_at)
--   from public.recipe_share_photo_cleanup
--  group by 1, 2, 3
--  order by 1, 2, 3;
