-- NON-MAPPER PRODUCT CLEANUP — DRY RUN BY DEFAULT
--
-- Read-only invocation (default): run this file without setting anything.
-- Authorized apply invocation (NOT part of this task):
--   set pinguino.mapper_only_cleanup_apply = 'on';
--   then run this file in one controlled staging transaction after reviewing
--   the emitted audit rows and taking a database backup.
--
-- This script never updates Mapper Basement or immutable recipe_versions.

begin;

create temporary table mapper_only_cleanup_audit on commit drop as
with non_mapper as (
  select
    p.id record_id,
    p.product_name_display name,
    p.product_kind,
    p.owner_user_id owner_id,
    p.owning_account_id tenant_id,
    p.created_at,
    p.created_by,
    b.mapper_ingredient_id mapper_id,
    p.product_code pi_id,
    p.status,
    p.canonical_provenance,
    p.is_active
  from public.products p
  left join public.product_behavior_bindings b
    on b.id=p.current_behavior_binding_id
   and b.product_id=p.id
   and b.is_current
  where p.product_kind<>'mapper_reference'
     or not exists (
       select 1
       from public.mapper_basement m
       where m.is_active
         and p.normalized_identity='mapper:'||m.ingredient_id
     )
), references as (
  select
    p.record_id,
    count(distinct r.user_id) filter(where r.favorite) favorite_refs,
    count(distinct r.user_id) filter(where r.recently_used_at is not null) recent_refs,
    count(distinct sr.id) draft_refs,
    count(distinct rv.id) version_refs
  from non_mapper p
  left join public.user_product_relations r on r.product_id=p.record_id
  left join public.saved_recipes sr
    on sr.recipe_input::text like '%'||p.record_id::text||'%'
  left join public.recipe_versions rv
    on rv.recipe_input::text like '%'||p.record_id::text||'%'
  group by p.record_id
)
select
  p.*,
  coalesce(r.favorite_refs,0)::bigint favorite_refs,
  coalesce(r.recent_refs,0)::bigint recent_refs,
  coalesce(r.draft_refs,0)::bigint draft_refs,
  coalesce(r.version_refs,0)::bigint version_refs,
  case
    when coalesce(r.version_refs,0)>0 then 'archive_preserve_history'
    when coalesce(r.draft_refs,0)>0 then 'archive_referenced_active_recipe'
    else 'archive_unreferenced'
  end cleanup_action,
  case
    when coalesce(r.version_refs,0)>0 then 'Immutable recipe version reference; preserve product history.'
    when coalesce(r.draft_refs,0)>0 then 'Current saved recipe reference; preserve for explicit user replacement.'
    else 'No recipe reference found; archive is the conservative idempotent action.'
  end cleanup_reason
from non_mapper p
left join references r using(record_id);

-- Exact dry-run report. Re-run after a controlled apply to prove idempotence.
select * from mapper_only_cleanup_audit order by cleanup_action,name,record_id;
select cleanup_action,count(*) records
from mapper_only_cleanup_audit
group by cleanup_action
order by cleanup_action;

-- Apply is opt-in. Relations are ranking/private overlays only; removing them
-- cannot alter recipe mass or immutable history. Product identities are archived
-- rather than deleted because canonical child tables use RESTRICT FKs.
delete from public.user_product_relations relation
using mapper_only_cleanup_audit audit
where current_setting('pinguino.mapper_only_cleanup_apply',true)='on'
  and relation.product_id=audit.record_id;

update public.products product
set is_active=false,
    updated_at=now()
from mapper_only_cleanup_audit audit
where current_setting('pinguino.mapper_only_cleanup_apply',true)='on'
  and product.id=audit.record_id
  and product.is_active;

-- Fail closed if an authorized apply leaves a non-Mapper product active.
do $guard$
begin
  if current_setting('pinguino.mapper_only_cleanup_apply',true)='on'
     and exists (
       select 1
       from public.products p
       where p.is_active
         and (
           p.product_kind<>'mapper_reference'
           or not exists (
             select 1 from public.mapper_basement m
             where m.is_active and p.normalized_identity='mapper:'||m.ingredient_id
           )
         )
     ) then
    raise exception 'Mapper-only cleanup incomplete: an active non-Mapper product remains';
  end if;
end
$guard$;

commit;
