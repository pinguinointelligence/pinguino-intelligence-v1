-- SHOP — ordering requires an active Gellatti HOME or PRO plan (owner decision, 2026-09-18).
--
-- "SKLEP JEST PUBLICZNY … Zamówienie produktu w sklepie jest dostępne WYŁĄCZNIE, gdy użytkownik ma aktywne
-- uprawnienie HOME lub PRO. Dotyczy również darmowego PDF za 0 €." Viewing stays public; creating an order does not.
--
-- The check is the EXISTING server-side authority, not a second one: public.gellatti_has_paid_access_v1 reads
-- public.entitlements with the same rule as the central resolver (src/billing/entitlements/entitlementResolver.ts —
-- status active, started, not ended; HOME or PRO, scope-agnostic) plus the documented customer_subscriptions fallback.
-- No plan name, price id, e-mail, test role or shop-owned subscription list is consulted.
--
-- Placement: this function is the single place a DIGITAL_DOCUMENT order is inserted (v1 and v2 both delegate here) and
-- only service_role may execute it, so neither a direct RPC, a hand-written REST call, nor a replayed request can reach
-- an insert without passing the gate. It runs BEFORE availability, so a signed-in account without HOME/PRO is refused
-- for its plan whether or not it is on a QA list.
--
-- Unchanged on purpose: idempotency (one active order per account and document), the file-present check, and the
-- download path — gellatti_shop_document_download_v1 reads the order's own document row and never this gate, so a
-- document ordered with a plan stays downloadable after the plan changes.
create or replace function public.shop_document_place_order(p_user_id uuid, p_email text, p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  d public.shop_digital_documents%rowtype;
  v_order public.shop_orders%rowtype;
  v_attempt integer := 0;
  v_created boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  -- Ordering needs an active HOME or PRO plan (owner, 2026-09-18). The shop itself stays public.
  if not public.gellatti_has_paid_access_v1(p_user_id) then
    return jsonb_build_object('error', 'plan_required');
  end if;
  select * into d from public.shop_digital_documents where id = p_document_id and is_current;
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
    'countryIso2', d.country_iso2,
    'language', d.language,
    'emailJobId', v_order.document_email_job_id,
    'qaAccount', p_user_id = any(d.qa_user_ids),
    'qaRecipient', d.qa_notification_recipient);
end;
$function$;

-- Execution stays exactly as it was: service_role only (the Edge Function calls it; clients cannot).
revoke all on function public.shop_document_place_order(uuid, text, uuid) from public, anon, authenticated;
