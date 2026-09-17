-- Rollback for 20260917111101_shop_public_offer_read_and_qa_fixture_guard.sql (applied to the shared project as ledger version 20260917111101).
-- Restores the exact pre-change privileges, policies and readiness view. No data is touched.
-- Note: this also restores the signed-out 401 on the country list (K6) and the US
-- Local Starter Pack being "live" on QA fixture rows (K4).

-- Column grants back to table-level SELECT.
revoke select (
  id, country_iso2, zone, enabled, carrier, service, customer_price_cents, currency,
  max_weight_g, size_class, eta_min_days, eta_max_days, physical_starter_pack_allowed,
  active, sort_order, created_at, updated_at
) on public.shop_shipping_rates from anon, authenticated;
grant select on public.shop_shipping_rates to anon, authenticated;

revoke select (
  id, sku, slug, kind, title, description, pack_size_g, price_cents, currency, image_url,
  availability, lead_time_weeks, active, sort_order, created_at, updated_at, allergens
) on public.shop_products from anon, authenticated;
grant select on public.shop_products to anon, authenticated;

-- Policies as created by 20260829200000 and 20260902150000.
drop policy if exists shop_products_finance_read on public.shop_products;

drop policy if exists shop_products_public_read on public.shop_products;
create policy shop_products_public_read on public.shop_products
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_countries_public_read on public.shop_countries;
create policy shop_countries_public_read on public.shop_countries
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_country_components_public_read on public.shop_country_components;
create policy shop_country_components_public_read on public.shop_country_components
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_shipping_rates_public_read on public.shop_shipping_rates;
create policy shop_shipping_rates_public_read on public.shop_shipping_rates
  for select to anon, authenticated using (active = true and enabled = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

-- Readiness view exactly as LIVE before this change (pg_get_viewdef md5 4a17c6a9ae43603b14be669b57801c28).
-- It differs only cosmetically from the text of 20260902150000 (no redundant coalesce(..., null)).
create or replace view public.shop_country_local_readiness
with (security_invoker = true) as
with canonical as (
  select i.id as component_product_id, i.sku, i.title
  from public.shop_bundle_items b
  join public.shop_products p on p.id = b.bundle_product_id
  join public.shop_products i on i.id = b.item_product_id
  where p.sku = 'GEL-STARTER-PACK'
),
filled as (
  select c.iso2, k.component_product_id
  from public.shop_countries c
  cross join canonical k
  where exists (
    select 1 from public.shop_country_components cc
    where cc.country_iso2 = c.iso2
      and cc.component_product_id = k.component_product_id
      and cc.active
      and nullif(btrim(cc.purchase_url), '') is not null
      and nullif(btrim(cc.local_product_name), '') is not null
      and nullif(btrim(cc.supplier_name), '') is not null
  )
)
select
  c.iso2,
  c.name,
  c.active,
  c.physical_starter_pack_available,
  c.local_starter_pack_available,
  (select count(*) from canonical) as components_required,
  (select count(*) from filled f where f.iso2 = c.iso2) as components_ready,
  (select coalesce(array_agg(k.sku order by k.sku), '{}')
     from canonical k
     where not exists (select 1 from filled f where f.iso2 = c.iso2
                         and f.component_product_id = k.component_product_id)
  ) as missing_components,
  ((select count(*) from filled f where f.iso2 = c.iso2) = (select count(*) from canonical)
    and (select count(*) from canonical) > 0) as mapping_complete,
  (c.active and c.local_starter_pack_available
    and (select count(*) from filled f where f.iso2 = c.iso2) = (select count(*) from canonical)
    and (select count(*) from canonical) > 0) as local_starter_pack_live
from public.shop_countries c;

revoke all on public.shop_country_local_readiness from public;
revoke all on public.shop_country_local_readiness from anon;
revoke all on public.shop_country_local_readiness from authenticated;
grant select on public.shop_country_local_readiness to anon;
grant select on public.shop_country_local_readiness to authenticated;

-- Nothing depends on the helper any more.
drop function if exists public.shop_is_reserved_test_url(text);
