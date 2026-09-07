-- SCAN IMPORT 2.0 — dedicated exact-identity resolver (owner decision D8, 2026-09-05).
--
-- ONE canonical exact-by-code authority for guests and authenticated users:
--   * exact identity only — no fuzzy search, no text input, no ranking fallback;
--   * input is a validated GTIN (8–14 digits) plus the ACTUAL decoder symbology; the function
--     re-validates format, symbology/length consistency and the GTIN check digit itself;
--   * leading-zero semantics preserved (UPC-A ↔ EAN-13, EAN-8 ↔ GTIN-13, GTIN-14 with a leading 0);
--   * matches products.ean_code_normalized, current product_variants.ean and Mapper reference EANs;
--   * guests (auth.uid() is null) see PUBLIC canonical facts only: shared commercial products that are
--     not blocked, and Mapper references. Never private products, relations, favourites, preferences,
--     prices, owner/admin metadata;
--   * authenticated callers additionally see their own products and customer-provisional products
--     linked to their account, with an explicit `ownership` fact ('own' | 'linked' | 'public') so the
--     client can rank identity strength deterministically (canonical shared > linked > own) and report
--     AMBIGUOUS on a true tie instead of first-row-wins;
--   * STABLE, no side effects, bounded cardinality (20), minimal columns.
-- Validated on staging 2026-09-05 inside rolled-back transactions: anon/authenticated/other-user cases,
-- the three seeded canonical milks, an account-private provisional (no leak), invalid checksum/format,
-- symbology mismatch. Not applied by hand — normal migration workflow only.

create or replace function public.resolve_exact_products_by_gtin_v1(p_gtin text, p_symbology text default null)
returns table (
  product_id uuid,
  product_code text,
  display_name text,
  brand text,
  matched_gtin text,
  matched_from text,
  product_kind text,
  entity_kind text,
  visibility text,
  ownership text,
  current_version_id uuid,
  verification_status text,
  product_country text,
  markets text[],
  mapper_ingredient_id text,
  engine_usable boolean,
  lifecycle_rejected boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid uuid := auth.uid();
  v_len int;
  v_sum int := 0;
  v_i int;
  v_keys text[];
begin
  if p_gtin is null or p_gtin !~ '^[0-9]{8,14}$' then return; end if;
  v_len := length(p_gtin);
  if p_symbology is not null then
    if p_symbology not in ('EAN-13', 'EAN-8', 'UPC-A', 'UPC-E') then return; end if;
    -- UPC-E callers pass the expanded 12-digit UPC-A form; the symbology is kept for the audit trail
    if (p_symbology = 'EAN-13' and v_len <> 13)
       or (p_symbology = 'EAN-8' and v_len <> 8)
       or (p_symbology in ('UPC-A', 'UPC-E') and v_len <> 12) then return; end if;
  end if;
  -- GTIN check digit (mod 10, weights 3/1 from the right)
  for v_i in 1..(v_len - 1) loop
    v_sum := v_sum + substr(p_gtin, v_len - v_i, 1)::int * (case when v_i % 2 = 1 then 3 else 1 end);
  end loop;
  if (10 - (v_sum % 10)) % 10 <> substr(p_gtin, v_len, 1)::int then return; end if;
  v_keys := array[p_gtin];
  if v_len = 12 then v_keys := v_keys || ('0' || p_gtin); end if;
  if v_len in (13, 14) and left(p_gtin, 1) = '0' then v_keys := v_keys || substr(p_gtin, 2); end if;
  if v_len = 8 then v_keys := v_keys || ('00000' || p_gtin); end if;

  return query
  with hits as (
    select p.id as pid, 'products'::text as src, p.ean_code_normalized as gtin
      from public.products p
      where p.ean_code_normalized = any(v_keys)
    union all
    select v.product_id, 'product_variants'::text, v.ean
      from public.product_variants v
      where v.is_current and v.ean = any(v_keys)
    union all
    select p.id, 'mapper_reference'::text, regexp_replace(m.ean_code, '\D', '', 'g')
      from public.mapper_basement m
      join public.products p
        on p.product_kind = 'mapper_reference' and p.normalized_identity = 'mapper:' || m.ingredient_id
      where m.is_active and regexp_replace(coalesce(m.ean_code, ''), '\D', '', 'g') = any(v_keys)
  ), ranked as (
    select distinct on (h.pid) h.pid, h.src, h.gtin
      from hits h
      order by h.pid, (h.src = 'products') desc
  )
  select p.id,
    p.product_code,
    p.product_name_display,
    p.brand,
    r.gtin,
    r.src,
    p.product_kind,
    case when p.product_kind = 'mapper_reference' then 'pi_base'
         when p.product_kind = 'customer_provisional' then 'customer_provisional'
         else 'commercial_product' end,
    p.visibility,
    case when v_uid is not null and (p.owning_account_id = v_uid or p.created_by = v_uid) then 'own'
         when v_uid is not null and exists (
           select 1 from public.customer_added_product_accounts l where l.product_id = p.id and l.user_id = v_uid) then 'linked'
         else 'public' end,
    p.current_version_id,
    p.canonical_verification_status,
    p.country,
    coalesce((select array_agg(distinct v.market) from public.product_variants v
              where v.product_id = p.id and v.is_current and v.market is not null), '{}'::text[]),
    (select b.mapper_ingredient_id from public.product_behavior_bindings b where b.id = p.current_behavior_binding_id),
    coalesce((pv.facts -> 'productIntelligence' ->> 'engineUsable')::boolean, false),
    coalesce(p.status, '') = 'rejected'
  from ranked r
  join public.products p on p.id = r.pid
  left join public.product_versions pv on pv.id = p.current_version_id
  where p.is_active and p.merged_into_product_id is null and (
    (p.visibility = 'shared' and p.product_kind = 'commercial_product'
      and coalesce(p.canonical_verification_status, '') <> 'blocked')
    or p.product_kind = 'mapper_reference'
    or (v_uid is not null and (p.owning_account_id = v_uid or p.created_by = v_uid))
    or (v_uid is not null and p.product_kind = 'customer_provisional' and exists (
          select 1 from public.customer_added_product_accounts l where l.product_id = p.id and l.user_id = v_uid))
  )
  order by p.id
  limit 20;
end
$fn$;

revoke all on function public.resolve_exact_products_by_gtin_v1(text, text) from public;
grant execute on function public.resolve_exact_products_by_gtin_v1(text, text) to anon, authenticated, service_role;

comment on function public.resolve_exact_products_by_gtin_v1(text, text) is
  'Scan Import 2.0 exact-identity resolver: validated GTIN + decoder symbology → public canonical facts (guests) plus own/linked rows (authenticated). Exact only, read-only, bounded.';
