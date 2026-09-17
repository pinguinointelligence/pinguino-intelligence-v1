-- SHOP K1 + K2 bucket (owner approval 2026-09-17). Shared backend: staging and production.
--
-- A free PDF (the "Składniki bazy lodów / Gelato Base Ingredients" shopping guide) is
-- ordered for 0 € as a real shop order of a third type, DIGITAL_DOCUMENT.
--
-- It is deliberately NOT a `shop_products` row. `gellatti_shop_catalog_v1` returns every
-- active product, so an older client would show it as a 0 € parcel with a basket button.
--
-- Older clients (production `main`, staging before the document UI):
--   * `gellatti_my_shop_orders_v1` and `gellatti_admin_shop_orders_v1` leave the type out,
--     so no document ever appears as a parcel in an account or in Admin's "to ship".
--   * `gellatti_shop_revenue_summary_v1` keeps its keys; its counts stay about the two
--     existing order types.
--   * The fulfilment actions refuse the type.
--   * Documents have their own reads.
--
-- Price (0), entitlement, availability, document version and file are all resolved here:
--   * The order and download functions are service-role only. The `shop-digital-document`
--     Edge Function calls them after authenticating the caller from the JWT.
--   * Idempotency: at most one active order per user per document version, enforced by a
--     partial unique index.
--   * An order is pinned to an immutable registry row (version, sha256, storage path).
--     A row that orders reference cannot be deleted.
--   * Availability (OFF / TEST_ACCOUNTS_ONLY / ON) gates NEW orders only. Existing orders
--     keep their download whatever it is later set to.
-- Existing orders, snapshots, prices and the physical checkout are not touched.

-- ── Registry: one immutable row per document version ────────────────────────
create table if not exists public.shop_digital_documents (
  id uuid primary key default gen_random_uuid(),
  document_key text not null check (document_key ~ '^[A-Z][A-Z0-9_]{2,62}$'),
  version text not null check (version ~ '^[0-9]+(\.[0-9]+){0,3}(-[a-z0-9]+)?$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'shop-documents' check (storage_bucket = 'shop-documents'),
  storage_path text not null check (storage_path ~ '^[a-z0-9][a-z0-9/._-]{2,200}\.pdf$'),
  byte_size integer not null check (byte_size > 0),
  download_file_name text not null check (download_file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,120}\.pdf$'),
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  availability text not null default 'OFF'
    check (availability in ('OFF', 'TEST_ACCOUNTS_ONLY', 'ON')),
  -- TEST_ACCOUNTS_ONLY entitles exactly these accounts, identified server-side.
  qa_user_ids uuid[] not null default '{}',
  -- Where order notifications for those accounts go instead of their own addresses.
  qa_notification_recipient text
    check (qa_notification_recipient is null or position('@' in qa_notification_recipient) > 1),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_key, version),
  unique (storage_bucket, storage_path)
);

create unique index if not exists shop_digital_documents_current_idx
  on public.shop_digital_documents (document_key) where is_current;

alter table public.shop_digital_documents enable row level security;
revoke all on public.shop_digital_documents from public;
revoke all on public.shop_digital_documents from anon;
revoke all on public.shop_digital_documents from authenticated;

create or replace function public.shop_digital_documents_keep_version_immutable()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.document_key is distinct from old.document_key
     or new.version is distinct from old.version
     or new.sha256 is distinct from old.sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.byte_size is distinct from old.byte_size then
    raise exception 'shop_document_version_is_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.shop_digital_documents_keep_version_immutable() from public, anon, authenticated;

drop trigger if exists shop_digital_documents_immutable on public.shop_digital_documents;
create trigger shop_digital_documents_immutable
  before update on public.shop_digital_documents
  for each row execute function public.shop_digital_documents_keep_version_immutable();

-- ── Orders: a third type that can never look like a parcel ─────────────────
alter table public.shop_orders
  add column if not exists document_id uuid
    references public.shop_digital_documents(id) on delete restrict,
  add column if not exists document_key text,
  add column if not exists document_version text,
  add column if not exists document_sha256 text,
  add column if not exists document_email_job_id uuid references public.email_jobs(id);

alter table public.shop_orders drop constraint if exists shop_orders_order_type_check;
alter table public.shop_orders add constraint shop_orders_order_type_check
  check (order_type in ('PHYSICAL', 'LOCAL_STARTER_PACK', 'DIGITAL_DOCUMENT'));

alter table public.shop_orders drop constraint if exists shop_orders_document_fields_belong_to_documents;
alter table public.shop_orders add constraint shop_orders_document_fields_belong_to_documents
  check (order_type = 'DIGITAL_DOCUMENT'
    or (document_id is null and document_key is null and document_version is null
        and document_sha256 is null and document_email_job_id is null));

alter table public.shop_orders drop constraint if exists shop_orders_document_is_not_a_parcel;
alter table public.shop_orders add constraint shop_orders_document_is_not_a_parcel
  check (order_type <> 'DIGITAL_DOCUMENT'
    or (status in ('paid', 'cancelled')
        and fulfillment_status in ('delivered', 'cancelled')
        and subtotal_cents = 0 and shipping_cents = 0 and tax_cents = 0 and total_cents = 0
        and coalesce(expected_total_cents, 0) = 0
        and contains_preorder = false
        and document_id is not null and document_key is not null and document_version is not null
        and document_sha256 ~ '^[0-9a-f]{64}$'
        and stripe_checkout_session_id is null and stripe_payment_intent_id is null
        and local_pack_snapshot is null and local_pack_country is null
        and shipping_name is null and shipping_line1 is null and shipping_country is null
        and tracking_number is null and shipped_at is null
        and attribution_partner_id is null));

-- The logical idempotency key: one active order per account per document version.
create unique index if not exists shop_orders_document_once_per_user_idx
  on public.shop_orders (user_id, document_id)
  where order_type = 'DIGITAL_DOCUMENT' and status <> 'cancelled';

-- ── K2: the private bucket (no storage.objects policy = no browser access) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-documents', 'shop-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Older reads: the new type stays out, keys unchanged ─────────────────────
create or replace function public.gellatti_my_shop_orders_v1()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(jsonb_agg(entry order by entry->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id, 'orderNumber', o.order_number, 'status', o.status,
      'fulfillmentStatus', o.fulfillment_status, 'containsPreorder', o.contains_preorder,
      'leadTimeWeeks', o.lead_time_weeks,
      'subtotalCents', o.subtotal_cents, 'shippingCents', o.shipping_cents,
      'taxCents', o.tax_cents, 'totalCents', o.total_cents,
      'currency', o.currency, 'created_at', o.created_at, 'paidAt', o.paid_at,
      'shippedAt', o.shipped_at,
      'orderType', coalesce(o.order_type, 'PHYSICAL'),
      'localPackCountry', o.local_pack_country,
      'localPackReady', (o.local_pack_snapshot is not null),
      'localPackEmailStatus', (
        select j.status from public.email_jobs j where j.id = o.local_pack_email_job_id
      ),
      'shipping', jsonb_build_object(
        'name', o.shipping_name, 'line1', o.shipping_line1, 'line2', o.shipping_line2,
        'postalCode', o.shipping_postal_code, 'city', o.shipping_city,
        'state', o.shipping_state, 'country', o.shipping_country,
        'phone', o.shipping_phone),
      'tracking', jsonb_build_object(
        'carrier', o.tracking_carrier, 'number', o.tracking_number),
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
      and o.order_type <> 'DIGITAL_DOCUMENT'
  ) rows;
$function$;

create or replace function public.gellatti_admin_shop_orders_v1(p_limit integer default 200)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
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
        'subtotalCents', o.subtotal_cents, 'shippingCents', o.shipping_cents,
        'taxCents', o.tax_cents, 'totalCents', o.total_cents, 'currency', o.currency,
        'stripeCheckoutSessionId', o.stripe_checkout_session_id,
        'stripePaymentIntentId', o.stripe_payment_intent_id,
        'paidAt', o.paid_at, 'created_at', o.created_at,
        'shippedAt', o.shipped_at, 'cancelledAt', o.cancelled_at, 'refundedAt', o.refunded_at,
        'orderType', coalesce(o.order_type, 'PHYSICAL'),
        'localPackCountry', o.local_pack_country,
        'localPackReady', (o.local_pack_snapshot is not null),
        'localPackEmailStatus', (
          select j.status from public.email_jobs j where j.id = o.local_pack_email_job_id),
        'carrier', (
          select r.carrier from public.shop_shipping_rates r
          where r.country_iso2 = o.shipping_country and r.active order by r.sort_order limit 1),
        'carrierCostCents', (
          select r.carrier_cost_cents from public.shop_shipping_rates r
          where r.country_iso2 = o.shipping_country and r.active order by r.sort_order limit 1),
        'shipping', jsonb_build_object(
          'name', o.shipping_name, 'line1', o.shipping_line1, 'line2', o.shipping_line2,
          'postalCode', o.shipping_postal_code, 'city', o.shipping_city,
          'state', o.shipping_state, 'country', o.shipping_country,
          'phone', o.shipping_phone),
        'tracking', jsonb_build_object(
          'carrier', o.tracking_carrier, 'number', o.tracking_number),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('sku', i.sku, 'title', i.title,
            'packSizeG', i.pack_size_g, 'unitPriceCents', i.unit_price_cents,
            'quantity', i.quantity, 'isPreorder', i.is_preorder))
          from public.shop_order_items i where i.order_id = o.id), '[]'::jsonb)
      ) as entry
      from public.shop_orders o
      where o.order_type <> 'DIGITAL_DOCUMENT'
      order by o.created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) rows
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.gellatti_shop_revenue_summary_v1()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select case
    when not public.gellatti_admin_has_permission_v1('FINANCE', auth.uid())
      then jsonb_build_object('error', 'forbidden')
    else (
      select jsonb_build_object(
        'orders', count(*),
        'paid', count(*) filter (where o.status = 'paid' and o.order_type = 'PHYSICAL'),
        'awaitingFulfilment', count(*) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'
            and o.fulfillment_status in ('awaiting','preparing')),
        'shipped', count(*) filter (where o.fulfillment_status = 'shipped'),
        'refunded', count(*) filter (where o.status = 'refunded'),
        -- Product revenue EXCLUDES shipping: collecting postage is not selling
        -- anything, and mixing them would overstate what the Shop earns.
        'productRevenueCents', coalesce(sum(o.subtotal_cents) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'), 0),
        'shippingCollectedCents', coalesce(sum(o.shipping_cents) filter (
          where o.status = 'paid' and o.order_type = 'PHYSICAL'), 0),
        -- A 0 EUR Local pack is a real order and NOT revenue. Counted on its
        -- own line so it can never quietly inflate a revenue figure.
        'localPackOrders', count(*) filter (where o.order_type = 'LOCAL_STARTER_PACK'),
        -- Actual carrier cost, only where a rate row records one. Null means
        -- unknown, and margin stays unavailable rather than guessed.
        'carrierCostKnownCents', coalesce((
          select sum(r.carrier_cost_cents)
          from public.shop_orders p
          join public.shop_shipping_rates r on r.country_iso2 = p.shipping_country
          where p.status = 'paid' and p.order_type = 'PHYSICAL'
            and r.carrier_cost_cents is not null), 0),
        'carrierCostKnown', exists (
          select 1 from public.shop_shipping_rates r where r.carrier_cost_cents is not null)
      )
      from public.shop_orders o
      -- 0 € documents are reported by gellatti_admin_shop_documents_v1, never here.
      where o.order_type <> 'DIGITAL_DOCUMENT'
    )
  end;
$function$;

create or replace function public.gellatti_admin_shop_order_action_v1(p_order_id uuid, p_fulfillment_status text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  if p_fulfillment_status not in ('awaiting','preparing','shipped','delivered','cancelled') then
    raise exception 'unsupported_fulfillment_status';
  end if;
  if exists (select 1 from public.shop_orders where id = p_order_id and order_type = 'DIGITAL_DOCUMENT') then
    raise exception 'digital_document_has_no_fulfilment';
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
$function$;

create or replace function public.gellatti_admin_shop_order_action_v1(p_order_id uuid, p_fulfillment_status text, p_tracking_carrier text default null::text, p_tracking_number text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare v_admin uuid := auth.uid();
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', v_admin) then
    raise exception 'finance_administrator_required';
  end if;
  if p_fulfillment_status not in ('awaiting','preparing','shipped','delivered','cancelled') then
    raise exception 'unsupported_fulfillment_status';
  end if;
  if exists (select 1 from public.shop_orders where id = p_order_id and order_type = 'DIGITAL_DOCUMENT') then
    raise exception 'digital_document_has_no_fulfilment';
  end if;
  update public.shop_orders
    set fulfillment_status = p_fulfillment_status,
        tracking_carrier = coalesce(nullif(trim(coalesce(p_tracking_carrier, '')), ''), tracking_carrier),
        tracking_number  = coalesce(nullif(trim(coalesce(p_tracking_number, '')), ''), tracking_number),
        -- `shipped_at` is stamped once, the first time it ships.
        shipped_at = case when p_fulfillment_status = 'shipped'
                          then coalesce(shipped_at, now()) else shipped_at end,
        cancelled_at = case when p_fulfillment_status = 'cancelled'
                            then coalesce(cancelled_at, now()) else cancelled_at end,
        updated_at = now()
    where id = p_order_id;
  if not found then raise exception 'shop_order_not_found'; end if;
  perform public.gellatti_write_audit_v1(
    'shop.order_' || p_fulfillment_status, 'shop_orders', p_order_id::text,
    jsonb_build_object('fulfillmentStatus', p_fulfillment_status,
                       'trackingCarrier', p_tracking_carrier,
                       'trackingNumber', p_tracking_number), null,
    p_order_id::text, 'admin', v_admin::text
  );
  return jsonb_build_object('id', p_order_id, 'fulfillmentStatus', p_fulfillment_status);
end;
$function$;

-- ── Document reads and actions ──────────────────────────────────────────────
-- What a visitor may know: the offer's state, and whether THIS caller may order now.
create or replace function public.gellatti_shop_document_availability_v1(p_document_key text)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce((
    select jsonb_build_object(
      'documentKey', d.document_key,
      'state', d.availability,
      'language', d.language,
      'orderable', case d.availability
        when 'ON' then auth.uid() is not null
        when 'TEST_ACCOUNTS_ONLY' then auth.uid() is not null and auth.uid() = any(d.qa_user_ids)
        else false end)
    from public.shop_digital_documents d
    where d.document_key = p_document_key and d.is_current
  ), jsonb_build_object('documentKey', p_document_key, 'state', 'OFF', 'orderable', false));
$$;
revoke all on function public.gellatti_shop_document_availability_v1(text) from public, anon, authenticated;
grant execute on function public.gellatti_shop_document_availability_v1(text) to anon, authenticated;

-- Service role only: the Edge Function passes the id and e-mail it read from the JWT.
create or replace function public.gellatti_shop_document_order_v1(
  p_user_id uuid, p_email text, p_document_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  d public.shop_digital_documents%rowtype;
  v_order public.shop_orders%rowtype;
  v_attempt integer := 0;
  v_created boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  select * into d from public.shop_digital_documents
    where document_key = p_document_key and is_current;
  if not found
     or d.availability = 'OFF'
     or (d.availability = 'TEST_ACCOUNTS_ONLY' and not (p_user_id = any(d.qa_user_ids))) then
    return jsonb_build_object('error', 'document_not_available');
  end if;
  -- Never confirm an order for a file that is not there.
  if not exists (select 1 from storage.objects so
                 where so.bucket_id = d.storage_bucket and so.name = d.storage_path) then
    return jsonb_build_object('error', 'document_file_missing');
  end if;

  select * into v_order from public.shop_orders o
    where o.user_id = p_user_id and o.document_id = d.id
      and o.order_type = 'DIGITAL_DOCUMENT' and o.status <> 'cancelled';
  if not found then
    loop
      v_attempt := v_attempt + 1;
      begin
        insert into public.shop_orders (
          order_number, user_id, email, status, fulfillment_status, contains_preorder,
          subtotal_cents, shipping_cents, tax_cents, total_cents, currency,
          expected_total_cents, expected_currency, paid_at,
          order_type, document_id, document_key, document_version, document_sha256)
        values (
          'G-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-'
            || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          p_user_id, coalesce(btrim(p_email), ''), 'paid', 'delivered', false,
          0, 0, 0, 0, 'eur', 0, 'eur', now(),
          'DIGITAL_DOCUMENT', d.id, d.document_key, d.version, d.sha256)
        on conflict (user_id, document_id)
          where order_type = 'DIGITAL_DOCUMENT' and status <> 'cancelled'
          do nothing
        returning * into v_order;
        v_created := v_order.id is not null;
        exit;
      exception when unique_violation then
        -- an order-number collision; the logical key is handled by ON CONFLICT above
        if v_attempt >= 5 then raise; end if;
      end;
    end loop;
    if not v_created then
      select * into v_order from public.shop_orders o
        where o.user_id = p_user_id and o.document_id = d.id
          and o.order_type = 'DIGITAL_DOCUMENT' and o.status <> 'cancelled';
    end if;
  end if;

  return jsonb_build_object(
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'created', v_created,
    'documentKey', d.document_key,
    'documentVersion', d.version,
    'emailJobId', v_order.document_email_job_id,
    'qaAccount', p_user_id = any(d.qa_user_ids),
    'qaRecipient', d.qa_notification_recipient);
end;
$$;
revoke all on function public.gellatti_shop_document_order_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.gellatti_shop_document_order_v1(uuid, text, text) to service_role;

-- Service role only. The owner of a paid document order, or a finance admin, gets the
-- storage location pinned in the order; availability does not matter here.
create or replace function public.gellatti_shop_document_download_v1(p_user_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v record;
  v_as_admin boolean;
begin
  if p_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  select o.id, o.user_id, o.status, o.order_number, d.storage_bucket, d.storage_path,
         d.download_file_name, d.version, d.sha256, d.byte_size
    into v
    from public.shop_orders o
    join public.shop_digital_documents d on d.id = o.document_id
    where o.id = p_order_id and o.order_type = 'DIGITAL_DOCUMENT';
  if not found or v.status <> 'paid' then
    return jsonb_build_object('error', 'order_not_found');
  end if;
  v_as_admin := v.user_id is distinct from p_user_id;
  if v_as_admin and not public.gellatti_admin_has_permission_v1('FINANCE', p_user_id) then
    return jsonb_build_object('error', 'order_not_found');
  end if;
  if not exists (select 1 from storage.objects so
                 where so.bucket_id = v.storage_bucket and so.name = v.storage_path) then
    return jsonb_build_object('error', 'document_file_missing');
  end if;
  return jsonb_build_object(
    'orderId', v.id, 'orderNumber', v.order_number,
    'bucket', v.storage_bucket, 'path', v.storage_path, 'fileName', v.download_file_name,
    'documentVersion', v.version, 'documentSha256', v.sha256, 'byteSize', v.byte_size,
    'asAdmin', v_as_admin);
end;
$$;
revoke all on function public.gellatti_shop_document_download_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gellatti_shop_document_download_v1(uuid, uuid) to service_role;

-- The caller's own document orders (Account → Orders).
create or replace function public.gellatti_my_shop_documents_v1()
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(jsonb_agg(entry order by entry->>'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id, 'orderNumber', o.order_number, 'status', o.status,
      'createdAt', o.created_at, 'totalCents', o.total_cents, 'currency', o.currency,
      'documentKey', o.document_key, 'documentVersion', o.document_version,
      'language', d.language,
      'emailStatus', (select j.status from public.email_jobs j where j.id = o.document_email_job_id)
    ) as entry
    from public.shop_orders o
    join public.shop_digital_documents d on d.id = o.document_id
    where o.user_id = auth.uid() and o.order_type = 'DIGITAL_DOCUMENT'
  ) rows;
$$;
revoke all on function public.gellatti_my_shop_documents_v1() from public, anon, authenticated;
grant execute on function public.gellatti_my_shop_documents_v1() to authenticated;

-- Admin: document orders on their own list, never in the parcel queue.
create or replace function public.gellatti_admin_shop_documents_v1(p_limit integer default 200)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if not public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()) then
    raise exception 'finance_administrator_required';
  end if;
  return coalesce((
    select jsonb_agg(entry order by entry->>'createdAt' desc)
    from (
      select jsonb_build_object(
        'id', o.id, 'orderNumber', o.order_number, 'email', o.email, 'userId', o.user_id,
        'status', o.status, 'createdAt', o.created_at,
        'documentKey', o.document_key, 'documentVersion', o.document_version,
        'documentSha256', o.document_sha256,
        'qaAccount', o.user_id = any(d.qa_user_ids),
        'emailStatus', (select j.status from public.email_jobs j where j.id = o.document_email_job_id)
      ) as entry
      from public.shop_orders o
      join public.shop_digital_documents d on d.id = o.document_id
      where o.order_type = 'DIGITAL_DOCUMENT'
      order by o.created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) rows
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.gellatti_admin_shop_documents_v1(integer) from public, anon, authenticated;
grant execute on function public.gellatti_admin_shop_documents_v1(integer) to authenticated;
