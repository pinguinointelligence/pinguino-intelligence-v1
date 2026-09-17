-- SHOP K4 + K6 (owner approval 2026-09-17). Shared backend: staging and production.
--
-- K6 — signed-out visitors could not read the country list. The public read policies
-- on four shop tables OR-ed in `gellatti_admin_has_permission_v1(...)`, a function
-- `anon` may not EXECUTE (20260826120000). Postgres checks EXECUTE when it prepares the
-- qual, so every anon read failed with 42501 (HTTP 401), before any row was considered.
--   * Public read is now a plain row predicate, with no admin function in it.
--   * A finance admin keeps reading every row, inactive ones included, through the existing
--     `*_admin_write` (FOR ALL) policies. On `shop_products`, which has none, that is a new
--     SELECT-only policy for `authenticated`, gated by the same function.
--   * Browser roles read commercial columns only. Carrier cost, Stripe ids and the internal
--     ingredient mapping stay behind the FINANCE-gated SECURITY DEFINER RPCs that already
--     serve Admin.
--   * `anon` still has no EXECUTE on `gellatti_admin_has_permission_v1`.
--
-- K4 — the only "live" Local Starter Pack (US) is live on 7 QA fixture rows whose
-- purchase links point at the reserved `.invalid` domain (RFC 2606 / RFC 6761). A reserved
-- test domain can never be a real shop, so such a row:
--   * never counts towards readiness: the view feeds the Shop UI and the `shop-local-pack`
--     order gate, so a direct call is refused too;
--   * is never served to browser roles as a purchase recommendation.
-- No row, flag, order or snapshot is changed or deleted.

-- ── K4: one definition of "reserved test address" ───────────────────────────
create or replace function public.shop_is_reserved_test_url(p_url text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with parts as (
    select lower(rtrim(
      regexp_replace(
        regexp_replace(
          coalesce(
            substring(btrim(p_url) from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)'),
            substring(btrim(p_url) from '^([^/?#]*)')
          ),
          '^.*@', ''),
        ':[0-9]*$', ''),
      '.')) as host
  )
  select coalesce(
    host ~ '(^|\.)(test|example|invalid|localhost)$'
      or host ~ '(^|\.)example\.(com|net|org)$',
    false)
  from parts;
$$;

revoke all on function public.shop_is_reserved_test_url(text) from public;
revoke all on function public.shop_is_reserved_test_url(text) from anon;
revoke all on function public.shop_is_reserved_test_url(text) from authenticated;
-- Evaluated inside browser-facing RLS policies, so browser roles must be able to run it.
grant execute on function public.shop_is_reserved_test_url(text) to anon, authenticated, service_role;

-- ── K4: readiness ignores reserved test addresses ───────────────────────────
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
      and not public.shop_is_reserved_test_url(cc.purchase_url)
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

-- ── K6: public read without the admin function ──────────────────────────────
drop policy if exists shop_countries_public_read on public.shop_countries;
create policy shop_countries_public_read on public.shop_countries
  for select to anon, authenticated using (active = true);

drop policy if exists shop_country_components_public_read on public.shop_country_components;
create policy shop_country_components_public_read on public.shop_country_components
  for select to anon, authenticated
  using (active = true and not public.shop_is_reserved_test_url(purchase_url));

drop policy if exists shop_shipping_rates_public_read on public.shop_shipping_rates;
create policy shop_shipping_rates_public_read on public.shop_shipping_rates
  for select to anon, authenticated using (active = true and enabled = true);

drop policy if exists shop_products_public_read on public.shop_products;
create policy shop_products_public_read on public.shop_products
  for select to anon, authenticated using (active = true);

drop policy if exists shop_products_finance_read on public.shop_products;
create policy shop_products_finance_read on public.shop_products
  for select to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

-- ── K6: browser roles read commercial columns only ──────────────────────────
revoke select on public.shop_shipping_rates from anon, authenticated;
grant select (
  id, country_iso2, zone, enabled, carrier, service, customer_price_cents, currency,
  max_weight_g, size_class, eta_min_days, eta_max_days, physical_starter_pack_allowed,
  active, sort_order, created_at, updated_at
) on public.shop_shipping_rates to anon, authenticated;

revoke select on public.shop_products from anon, authenticated;
grant select (
  id, sku, slug, kind, title, description, pack_size_g, price_cents, currency, image_url,
  availability, lead_time_weeks, active, sort_order, created_at, updated_at, allergens
) on public.shop_products to anon, authenticated;
