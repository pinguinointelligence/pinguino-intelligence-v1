-- GELLATTI — Shop: sellable articles, orders and the operator's controls.
--
-- `/shop` was an honest placeholder ("Katalog zakupowy nie jest jeszcze
-- dostępny"). This adds the smallest complete commerce spine: articles that
-- REFERENCE existing canonical products (no duplicate ingredient is ever
-- created), orders with a real payment status, and admin control over price,
-- availability, preorder lead time and fulfilment.
--
-- Commerce exists to make the core product easier, so the schema stays small
-- and legible rather than growing into a generic ecommerce platform.

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique,
  kind text not null default 'single' check (kind in ('single', 'bundle')),
  title text not null,
  description text,
  /** Mapper identity this article delivers. NULL for a bundle. */
  canonical_ingredient_id text,
  pack_size_g integer check (pack_size_g is null or pack_size_g > 0),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'eur',
  image_url text,
  availability text not null default 'in_stock'
    check (availability in ('in_stock', 'preorder', 'out_of_stock')),
  lead_time_weeks integer check (lead_time_weeks is null or lead_time_weeks between 1 and 52),
  active boolean not null default true,
  sort_order integer not null default 100,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_bundle_items (
  bundle_product_id uuid not null references public.shop_products(id) on delete cascade,
  item_product_id uuid not null references public.shop_products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  primary key (bundle_product_id, item_product_id)
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  fulfillment_status text not null default 'awaiting'
    check (fulfillment_status in ('awaiting', 'preparing', 'shipped', 'delivered', 'cancelled')),
  contains_preorder boolean not null default false,
  lead_time_weeks integer,
  subtotal_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text not null default 'eur',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_id uuid references public.shop_products(id) on delete set null,
  sku text not null,
  title text not null,
  pack_size_g integer,
  unit_price_cents integer not null,
  quantity integer not null check (quantity > 0),
  is_preorder boolean not null default false
);

create index if not exists shop_orders_user_created_idx on public.shop_orders (user_id, created_at desc);
create index if not exists shop_order_items_order_idx on public.shop_order_items (order_id);

alter table public.shop_products enable row level security;
alter table public.shop_bundle_items enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;

drop policy if exists shop_products_public_read on public.shop_products;
create policy shop_products_public_read on public.shop_products
  for select to anon, authenticated using (active = true
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_bundle_items_public_read on public.shop_bundle_items;
create policy shop_bundle_items_public_read on public.shop_bundle_items
  for select to anon, authenticated using (true);

drop policy if exists shop_orders_owner_read on public.shop_orders;
create policy shop_orders_owner_read on public.shop_orders
  for select to authenticated using (user_id = auth.uid()
    or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));

drop policy if exists shop_order_items_owner_read on public.shop_order_items;
create policy shop_order_items_owner_read on public.shop_order_items
  for select to authenticated using (exists (
    select 1 from public.shop_orders o
    where o.id = order_id
      and (o.user_id = auth.uid() or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()))
  ));

-- ------------------------------------------------------------- catalogue ----
create or replace function public.gellatti_shop_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(jsonb_agg(entry order by ord, name), '[]'::jsonb)
  from (
    select p.sort_order as ord, p.title as name, jsonb_build_object(
      'id', p.id, 'sku', p.sku, 'slug', p.slug, 'kind', p.kind,
      'title', p.title, 'description', p.description,
      'canonicalIngredientId', p.canonical_ingredient_id,
      'packSizeG', p.pack_size_g, 'priceCents', p.price_cents, 'currency', p.currency,
      'imageUrl', p.image_url, 'availability', p.availability,
      'leadTimeWeeks', p.lead_time_weeks,
      'contents', coalesce((
        select jsonb_agg(jsonb_build_object('sku', c.sku, 'title', c.title, 'packSizeG', c.pack_size_g)
                          order by c.sort_order)
        from public.shop_bundle_items b
        join public.shop_products c on c.id = b.item_product_id
        where b.bundle_product_id = p.id
      ), '[]'::jsonb)
    ) as entry
    from public.shop_products p
    where p.active = true
  ) rows;
$$;

grant execute on function public.gellatti_shop_catalog_v1() to anon, authenticated;

-- ------------------------------------------------------------ my orders -----
create or replace function public.gellatti_my_shop_orders_v1()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(jsonb_agg(entry order by entry->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id, 'orderNumber', o.order_number, 'status', o.status,
      'fulfillmentStatus', o.fulfillment_status, 'containsPreorder', o.contains_preorder,
      'leadTimeWeeks', o.lead_time_weeks, 'totalCents', o.total_cents,
      'currency', o.currency, 'created_at', o.created_at, 'paidAt', o.paid_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'sku', i.sku, 'title', i.title, 'packSizeG', i.pack_size_g,
          'unitPriceCents', i.unit_price_cents, 'quantity', i.quantity,
          'isPreorder', i.is_preorder))
        from public.shop_order_items i where i.order_id = o.id
      ), '[]'::jsonb)
    ) as entry
    from public.shop_orders o
    where o.user_id = auth.uid()
  ) rows;
$$;

grant execute on function public.gellatti_my_shop_orders_v1() to authenticated;

-- ------------------------------------------------------------ admin shop ----
create or replace function public.gellatti_admin_shop_products_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(entries) order by entries.sort_order, entries.title)
    from (select p.* from public.shop_products p) entries
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.gellatti_admin_shop_products_v1() to authenticated;

create or replace function public.gellatti_admin_shop_product_upsert_v1(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid := nullif(p_product->>'id', '')::uuid;
  v_row public.shop_products%rowtype;
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  if coalesce(btrim(p_product->>'sku'), '') = '' then raise exception 'shop_sku_required'; end if;
  if (p_product->>'priceCents')::int < 0 then raise exception 'shop_price_invalid'; end if;
  if coalesce(p_product->>'availability','in_stock') = 'preorder'
     and coalesce((p_product->>'leadTimeWeeks')::int, 0) <= 0 then
    raise exception 'shop_preorder_lead_time_required';
  end if;

  insert into public.shop_products as t (
    id, sku, slug, kind, title, description, canonical_ingredient_id, pack_size_g,
    price_cents, currency, image_url, availability, lead_time_weeks, active, sort_order
  ) values (
    coalesce(v_id, gen_random_uuid()),
    btrim(p_product->>'sku'),
    coalesce(nullif(btrim(p_product->>'slug'), ''), lower(regexp_replace(btrim(p_product->>'sku'), '[^a-zA-Z0-9]+', '-', 'g'))),
    coalesce(nullif(p_product->>'kind', ''), 'single'),
    btrim(coalesce(p_product->>'title', p_product->>'sku')),
    nullif(btrim(coalesce(p_product->>'description', '')), ''),
    nullif(btrim(coalesce(p_product->>'canonicalIngredientId', '')), ''),
    nullif(p_product->>'packSizeG', '')::int,
    (p_product->>'priceCents')::int,
    coalesce(nullif(p_product->>'currency', ''), 'eur'),
    nullif(btrim(coalesce(p_product->>'imageUrl', '')), ''),
    coalesce(nullif(p_product->>'availability', ''), 'in_stock'),
    nullif(p_product->>'leadTimeWeeks', '')::int,
    coalesce((p_product->>'active')::boolean, true),
    coalesce(nullif(p_product->>'sortOrder', '')::int, 100)
  )
  on conflict (id) do update set
    sku = excluded.sku, slug = excluded.slug, kind = excluded.kind, title = excluded.title,
    description = excluded.description, canonical_ingredient_id = excluded.canonical_ingredient_id,
    pack_size_g = excluded.pack_size_g, price_cents = excluded.price_cents,
    currency = excluded.currency, image_url = excluded.image_url,
    availability = excluded.availability, lead_time_weeks = excluded.lead_time_weeks,
    active = excluded.active, sort_order = excluded.sort_order, updated_at = now()
  returning * into v_row;

  perform public.gellatti_write_audit_v1(
    'shop.product_upsert', 'shop_products', v_row.id::text,
    jsonb_build_object('sku', v_row.sku, 'priceCents', v_row.price_cents,
                       'availability', v_row.availability, 'active', v_row.active),
    null, v_row.id::text, 'admin', v_admin::text
  );
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.gellatti_admin_shop_product_upsert_v1(jsonb) to authenticated;

create or replace function public.gellatti_admin_shop_orders_v1(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(entry order by entry->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', o.id, 'orderNumber', o.order_number, 'email', o.email, 'userId', o.user_id,
        'status', o.status, 'fulfillmentStatus', o.fulfillment_status,
        'containsPreorder', o.contains_preorder, 'leadTimeWeeks', o.lead_time_weeks,
        'subtotalCents', o.subtotal_cents, 'totalCents', o.total_cents, 'currency', o.currency,
        'stripeCheckoutSessionId', o.stripe_checkout_session_id,
        'stripePaymentIntentId', o.stripe_payment_intent_id,
        'paidAt', o.paid_at, 'created_at', o.created_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('sku', i.sku, 'title', i.title,
            'packSizeG', i.pack_size_g, 'unitPriceCents', i.unit_price_cents,
            'quantity', i.quantity, 'isPreorder', i.is_preorder))
          from public.shop_order_items i where i.order_id = o.id), '[]'::jsonb)
      ) as entry
      from public.shop_orders o
      order by o.created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) rows
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.gellatti_admin_shop_orders_v1(integer) to authenticated;

create or replace function public.gellatti_admin_shop_order_action_v1(
  p_order_id uuid,
  p_fulfillment_status text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  if p_fulfillment_status not in ('awaiting','preparing','shipped','delivered','cancelled') then
    raise exception 'unsupported_fulfillment_status';
  end if;
  update public.shop_orders
    set fulfillment_status = p_fulfillment_status, updated_at = now()
    where id = p_order_id;
  if not found then raise exception 'shop_order_not_found'; end if;
  perform public.gellatti_write_audit_v1(
    'shop.order_' || p_fulfillment_status, 'shop_orders', p_order_id::text,
    jsonb_build_object('fulfillmentStatus', p_fulfillment_status), null,
    p_order_id::text, 'admin', v_admin::text
  );
  return jsonb_build_object('id', p_order_id, 'fulfillmentStatus', p_fulfillment_status);
end;
$$;

grant execute on function public.gellatti_admin_shop_order_action_v1(uuid, text) to authenticated;
