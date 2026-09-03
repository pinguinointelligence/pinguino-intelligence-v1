-- ============================================================================
-- COUNTRY OVERALL STATUS, computed — READY / PARTIAL / BLOCKED / NOT_STARTED.
--
-- READY is a high bar on purpose: every Starter Pack component researched to
-- ENGINE_READY, at least one fresh base product, and a default base the Engine
-- has actually accepted. Shopping links alone can only ever reach PARTIAL.
--
-- NOTE the `count(lp.id)` rather than `count(*)`. The first version used
-- `count(*)` over a LEFT JOIN, which counts the COUNTRY row even when nothing
-- joined — so every country reported one researched product and read PARTIAL
-- while having no research at all. A readiness board that cannot tell
-- NOT_STARTED from PARTIAL is worse than no board.
-- ============================================================================
create or replace view public.country_readiness_overview
with (security_invoker = true) as
with canonical as (
  select i.id as component_product_id, i.sku
  from public.shop_bundle_items b
  join public.shop_products p on p.id = b.bundle_product_id
  join public.shop_products i on i.id = b.item_product_id
  where p.sku = 'GEL-STARTER-PACK'
),
pack as (
  select c.iso2,
         count(lp.id) filter (where lp.status = 'ENGINE_READY') as engine_ready,
         count(lp.id) filter (where lp.status = 'PURCHASE_VERIFIED') as purchase_verified,
         count(lp.id) filter (where lp.status = 'BLOCKED') as blocked,
         count(lp.id) filter (where lp.status = 'REVIEW_REQUIRED') as review_required,
         count(lp.id) as researched
  from public.shop_countries c
  left join public.country_local_products lp
    on lp.country_iso2 = c.iso2 and lp.role = 'STARTER_PACK'
   and lp.option_rank = 'PRIMARY' and lp.active
  group by c.iso2
),
fresh as (
  select c.iso2,
         count(lp.id) filter (where lp.status = 'ENGINE_READY') as fresh_engine_ready,
         count(lp.id) as fresh_researched
  from public.shop_countries c
  left join public.country_local_products lp
    on lp.country_iso2 = c.iso2 and lp.role = 'FRESH_BASE' and lp.active
  group by c.iso2
),
base as (
  select c.iso2,
         bool_or(b.engine_verified) filter (where b.profile = 'GELATO') as gelato_base_verified,
         count(b.id) filter (where b.active) as bases_configured
  from public.shop_countries c
  left join public.country_default_bases b on b.country_iso2 = c.iso2
  group by c.iso2
)
select
  c.iso2, c.name, c.active,
  c.physical_starter_pack_available, c.local_starter_pack_available,
  (select count(*) from canonical) as pack_components_required,
  coalesce(p.engine_ready, 0) as pack_engine_ready,
  coalesce(p.purchase_verified, 0) as pack_purchase_verified,
  coalesce(p.researched, 0) as pack_researched,
  coalesce(p.blocked, 0) as pack_blocked,
  coalesce(p.review_required, 0) as pack_review_required,
  coalesce(f.fresh_engine_ready, 0) as fresh_engine_ready,
  coalesce(f.fresh_researched, 0) as fresh_researched,
  coalesce(b.gelato_base_verified, false) as gelato_base_verified,
  coalesce(b.bases_configured, 0) as bases_configured,
  case
    when coalesce(p.blocked, 0) > 0 then 'BLOCKED'
    when coalesce(p.engine_ready, 0) = (select count(*) from canonical)
         and (select count(*) from canonical) > 0
         and coalesce(f.fresh_engine_ready, 0) > 0
         and coalesce(b.gelato_base_verified, false)
      then 'READY'
    when coalesce(p.researched, 0) > 0 or coalesce(f.fresh_researched, 0) > 0
      then 'PARTIAL'
    else 'NOT_STARTED'
  end as overall_status
from public.shop_countries c
left join pack p on p.iso2 = c.iso2
left join fresh f on f.iso2 = c.iso2
left join base b on b.iso2 = c.iso2;

revoke all on public.country_readiness_overview from public;
revoke all on public.country_readiness_overview from anon;
revoke all on public.country_readiness_overview from authenticated;
grant select on public.country_readiness_overview to anon;
grant select on public.country_readiness_overview to authenticated;
