-- ============================================================================
-- SHOP COUNTRY + SHIPPING AUTHORITY
--
-- One Starter Pack product, two fulfilment modes, both decided by DATA rather
-- than by code:
--
--   PHYSICAL            59 EUR + shipping from `shop_shipping_rates`
--   LOCAL_STARTER_PACK  0 EUR, a PDF of where to buy the same components locally
--
-- THREE RULES THIS SCHEMA EXISTS TO ENFORCE
--
-- 1. The Starter Pack composition is NOT duplicated per country. The canonical
--    bundle lives in `shop_bundle_items`; a country attaches purchase
--    alternatives to those SAME component products. Add a component to the
--    bundle and every country immediately shows it as missing.
--
-- 2. A country goes customer-live for the Local pack only when its mapping is
--    COMPLETE: every canonical component has at least one active row carrying a
--    local product name, a supplier and a purchase URL. `shop_country_local_
--    readiness` computes that; nothing is hand-maintained, and filling the last
--    link flips a country live with no deploy.
--
-- 3. Shipping has ONE authority. Checkout may not own a second copy of a price.
--    The carrier is a column, not an architecture: DHL today, Correos or UPS
--    tomorrow, without touching checkout.
--
-- BASELINE PRESERVED. The 15 EU countries hardcoded in the `shop-checkout` Edge
-- Function are seeded here as physical = true at the same flat 990 cents, so
-- behaviour on the day of this migration is unchanged. USA and Canada are
-- seeded physical = false with a full (empty) Local component skeleton, per the
-- owner's rollout decision.
-- ============================================================================

-- ── Countries ───────────────────────────────────────────────────────────────
create table if not exists public.shop_countries (
  iso2 text primary key check (iso2 ~ '^[A-Z]{2}$'),
  name text not null,
  active boolean not null default true,
  physical_starter_pack_available boolean not null default false,
  -- Operator INTENT. Being true is necessary but not sufficient: the mapping
  -- must also be complete (see `shop_country_local_readiness`).
  local_starter_pack_available boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_countries enable row level security;

drop policy if exists shop_countries_public_read on public.shop_countries;
create policy shop_countries_public_read on public.shop_countries
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_countries_admin_write on public.shop_countries;
create policy shop_countries_admin_write on public.shop_countries
  for all to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

-- ── Country-specific purchase alternatives for a canonical component ────────
create table if not exists public.shop_country_components (
  id uuid primary key default gen_random_uuid(),
  country_iso2 text not null references public.shop_countries(iso2) on delete cascade,
  -- The CANONICAL component, not a copy of its name. Join back through
  -- `shop_bundle_items` to know which components a country still owes.
  component_product_id uuid not null references public.shop_products(id) on delete cascade,
  local_product_name text,
  supplier_name text,
  purchase_url text,
  pack_size text,
  display_price text,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_country_components_country_idx
  on public.shop_country_components (country_iso2, component_product_id, sort_order);

alter table public.shop_country_components enable row level security;

drop policy if exists shop_country_components_public_read on public.shop_country_components;
create policy shop_country_components_public_read on public.shop_country_components
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_country_components_admin_write on public.shop_country_components;
create policy shop_country_components_admin_write on public.shop_country_components
  for all to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

-- ── Shipping authority ──────────────────────────────────────────────────────
create table if not exists public.shop_shipping_rates (
  id uuid primary key default gen_random_uuid(),
  country_iso2 text not null references public.shop_countries(iso2) on delete cascade,
  zone text,
  enabled boolean not null default true,
  carrier text not null default 'DHL',
  service text,
  customer_price_cents integer not null check (customer_price_cents >= 0),
  -- What the carrier actually charges us, when known. Margin is only ever shown
  -- where this is present; revenue is never labelled profit on a guess.
  carrier_cost_cents integer check (carrier_cost_cents is null or carrier_cost_cents >= 0),
  currency text not null default 'eur',
  max_weight_g integer check (max_weight_g is null or max_weight_g > 0),
  size_class text,
  eta_min_days integer check (eta_min_days is null or eta_min_days >= 0),
  eta_max_days integer check (eta_max_days is null or eta_max_days >= 0),
  physical_starter_pack_allowed boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_shipping_rates_country_idx
  on public.shop_shipping_rates (country_iso2, active, sort_order);

alter table public.shop_shipping_rates enable row level security;

drop policy if exists shop_shipping_rates_public_read on public.shop_shipping_rates;
create policy shop_shipping_rates_public_read on public.shop_shipping_rates
  for select to anon, authenticated using (active = true and enabled = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_shipping_rates_admin_write on public.shop_shipping_rates;
create policy shop_shipping_rates_admin_write on public.shop_shipping_rates
  for all to authenticated
  using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

-- ── Reusable customer address ───────────────────────────────────────────────
-- Collected for the 0 EUR Local pack too, so the same customer can be offered a
-- physical pack later without retyping anything.
create table if not exists public.shop_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  line1 text,
  line2 text,
  postal_code text,
  city text,
  state text,
  country text,
  phone text,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shop_customer_addresses_one_default
  on public.shop_customer_addresses (user_id) where is_default;

alter table public.shop_customer_addresses enable row level security;

drop policy if exists shop_customer_addresses_owner_all on public.shop_customer_addresses;
create policy shop_customer_addresses_owner_all on public.shop_customer_addresses
  for all to authenticated
  using (user_id = auth.uid()
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  with check (user_id = auth.uid());

-- ── Order: fulfilment mode, the PDF snapshot, and attribution ───────────────
alter table public.shop_orders
  add column if not exists order_type text not null default 'PHYSICAL',
  add column if not exists local_pack_country text,
  -- G: the EXACT rows used to build this order's PDF. An Admin link edited
  -- tomorrow changes future PDFs and leaves this order historically coherent.
  add column if not exists local_pack_snapshot jsonb,
  add column if not exists local_pack_generated_at timestamptz,
  add column if not exists local_pack_email_job_id uuid references public.email_jobs(id),
  -- P: acquisition attribution is preserved on a 0 EUR order so we can learn
  -- which partner brought the user. It carries NO commission — there is no sale.
  add column if not exists attribution_partner_id uuid,
  add column if not exists attribution_click_id uuid,
  add column if not exists attribution_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_orders_order_type_check'
  ) then
    alter table public.shop_orders
      add constraint shop_orders_order_type_check
      check (order_type in ('PHYSICAL', 'LOCAL_STARTER_PACK'));
  end if;
end $$;

create index if not exists shop_orders_order_type_idx on public.shop_orders (order_type, created_at desc);

-- ── Readiness: is a country's Local mapping COMPLETE? ───────────────────────
-- A country owes one active, fully-filled row for EVERY canonical component of
-- the Starter Pack bundle. `missing_components` is what Admin renders, so the
-- operator sees exactly which links are outstanding rather than a bare count.
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
      and coalesce(nullif(btrim(cc.purchase_url), ''), null) is not null
      and coalesce(nullif(btrim(cc.local_product_name), ''), null) is not null
      and coalesce(nullif(btrim(cc.supplier_name), ''), null) is not null
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
  -- The single flag the Shop reads. Intent AND completeness AND active.
  (c.active and c.local_starter_pack_available
    and (select count(*) from filled f where f.iso2 = c.iso2) = (select count(*) from canonical)
    and (select count(*) from canonical) > 0) as local_starter_pack_live
from public.shop_countries c;

-- Supabase's default privileges make a new view WRITABLE. Only an explicit
-- revoke naming every browser role closes it (see `publicViewPrivileges.guard`).
revoke all on public.shop_country_local_readiness from public;
revoke all on public.shop_country_local_readiness from anon;
revoke all on public.shop_country_local_readiness from authenticated;
grant select on public.shop_country_local_readiness to anon;
grant select on public.shop_country_local_readiness to authenticated;

-- ── Seed: preserve today's behaviour exactly ────────────────────────────────
insert into public.shop_countries (iso2, name, active, physical_starter_pack_available, local_starter_pack_available, sort_order)
values
  ('PL','Polska',true,true,false,10),
  ('ES','España',true,true,false,20),
  ('DE','Deutschland',true,true,false,30),
  ('FR','France',true,true,false,40),
  ('IT','Italia',true,true,false,50),
  ('PT','Portugal',true,true,false,60),
  ('NL','Nederland',true,true,false,70),
  ('BE','België',true,true,false,80),
  ('AT','Österreich',true,true,false,90),
  ('CZ','Česko',true,true,false,100),
  ('SK','Slovensko',true,true,false,110),
  ('DK','Danmark',true,true,false,120),
  ('SE','Sverige',true,true,false,130),
  ('FI','Suomi',true,true,false,140),
  ('IE','Ireland',true,true,false,150),
  -- Local-first markets. Physical stays OFF by owner decision; the Local pack
  -- turns itself on when the mapping below is complete.
  ('US','United States',true,false,true,200),
  ('CA','Canada',true,false,true,210)
on conflict (iso2) do nothing;

-- The flat rate the Edge Function charges today, now expressed as data.
insert into public.shop_shipping_rates
  (country_iso2, enabled, carrier, service, customer_price_cents, currency, physical_starter_pack_allowed, active, sort_order)
select c.iso2, true, 'DHL', 'Standard', 990, 'eur', true, true, 10
from public.shop_countries c
where c.physical_starter_pack_available
  and not exists (select 1 from public.shop_shipping_rates r where r.country_iso2 = c.iso2);

-- Every Local-intent country gets one empty row per canonical component, so
-- Admin shows the real work list instead of an empty table.
insert into public.shop_country_components (country_iso2, component_product_id, active, sort_order)
select c.iso2, i.id, true, row_number() over (partition by c.iso2 order by i.sku) * 10
from public.shop_countries c
cross join lateral (
  select i.id, i.sku
  from public.shop_bundle_items b
  join public.shop_products p on p.id = b.bundle_product_id
  join public.shop_products i on i.id = b.item_product_id
  where p.sku = 'GEL-STARTER-PACK'
) i
where c.local_starter_pack_available
  and not exists (
    select 1 from public.shop_country_components cc
    where cc.country_iso2 = c.iso2 and cc.component_product_id = i.id
  );
