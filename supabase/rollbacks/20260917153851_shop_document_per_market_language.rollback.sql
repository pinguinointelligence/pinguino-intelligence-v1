-- Rollback for 20260917153851_shop_document_per_market_language.sql (applied to the shared project as ledger version 20260917153851).
-- Restores the exact K1 definitions (copied from 20260917113631_shop_digital_document_orders.sql) of the
-- registry trigger function, the v1 availability/order functions and both document lists, removes the
-- market functions and the market column, and restores the per-document "current" rule.
-- Refuses to run while any market document exists: those rows (and any orders pinned to them) need an
-- owner decision first — set their availability to OFF instead of deleting anything.
do $$
begin
  if exists (select 1 from public.shop_digital_documents where country_iso2 is not null) then
    raise exception 'market_documents_exist: set availability OFF instead of rolling back';
  end if;
end $$;

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

drop function if exists public.gellatti_shop_document_order_v2(uuid, text, text, text, text);
drop function if exists public.gellatti_shop_document_markets_v1(text);
drop function if exists public.shop_document_place_order(uuid, text, uuid);

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

drop index if exists public.shop_digital_documents_current_idx;
create unique index if not exists shop_digital_documents_current_idx
  on public.shop_digital_documents (document_key) where is_current;
drop index if exists public.shop_digital_documents_key_market_language_version_idx;
alter table public.shop_digital_documents
  add constraint shop_digital_documents_document_key_version_key unique (document_key, version);

alter table public.shop_digital_documents
  drop constraint if exists shop_digital_documents_language_check;
alter table public.shop_digital_documents
  add constraint shop_digital_documents_language_check check (language ~ '^[a-z]{2}$');

alter table public.shop_digital_documents
  drop constraint if exists shop_digital_documents_country_iso2_check;
alter table public.shop_digital_documents
  drop column if exists country_iso2;
