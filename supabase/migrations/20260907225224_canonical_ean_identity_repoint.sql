-- ONE EXACT EAN, ONE CANONICAL PRODUCT — owner contract 2026-09-07/08.
--
-- ============================================================================================
-- THE DEFECT, MEASURED.
--
-- EAN 8402001042911 carries two live products with identical identity (Cola Zero / Hacendado,
-- the same digits in ean_code, ean_code_normalized, barcode and barcode_normalized):
--
--   PM-ING-007193  customer_provisional  account_private  home@home.com   73.4   REVIEW
--   PR-ING-007197  commercial_product    shared           (null)          94.12  BASE_READY
--
-- and ONE variant row, still addressing the PM. Replaying the deployed lookup's own query:
--
--   home@home.com  -> PM-ING-007193 @ 73.4 / REVIEW   (its owner never reaches the better row)
--   pro@pro.com    -> null -> full path
--   third account  -> null -> full path
--
-- so the shared BASE_READY product was addressable by nobody, and every other account fell
-- through to the full path — which is how the second product came to exist at all.
--
-- WHY A RE-POINT AND NOT A NEW ROW. `product_variants_ean_uniq` is
--     CREATE UNIQUE INDEX ... ON product_variants (ean) WHERE (ean IS NOT NULL)
-- which ignores `is_current`. An EAN therefore has exactly one variant row, ever; there is no
-- variant history to write. "Mark the old one stale and insert the new" would simply be rejected.
-- The single row is MOVED, under a lock, or nothing happens.
--
-- WHAT THIS DOES NOT DO. It deletes nothing — no product, no session, no photo, no account link,
-- no private data. It copies no customer's private data anywhere. A PM keeps every field it had
-- and every account relation it had; it becomes an overlay on the canonical product rather than
-- the address of the EAN.
-- ============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. The operation itself, callable and idempotent, so the runtime can use it too.
--
--    Serialised on the EAN, so two accounts scanning the same code at the same moment cannot
--    both decide to re-point, and cannot produce two shared products.
-- ---------------------------------------------------------------------------------------------
create or replace function public.canonicalize_ean_identity_v1(p_ean text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_ean text := regexp_replace(coalesce(p_ean,''), '\D', '', 'g');
  v_canonical uuid;
  v_shared_count int;
  v_variant public.product_variants%rowtype;
  v_moved boolean := false;
  v_linked int := 0;
begin
  if length(v_ean) < 8 or length(v_ean) > 14 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_ean');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('canonical-ean:'||v_ean, 0));

  -- The canonical identity: the shared registry product for this code.
  select count(*) into v_shared_count
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.product_kind = 'commercial_product' and p.visibility = 'shared'
    and coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) = v_ean;

  -- Two shared rows for one code is exactly what this function exists to prevent, and it cannot
  -- be resolved from row data. Report it and change nothing, rather than pick by ordering.
  if v_shared_count > 1 then
    return jsonb_build_object('ok', false, 'reason', 'ambiguous_shared_products',
                              'shared_products', v_shared_count);
  end if;
  if v_shared_count = 0 then
    -- No shared product yet. A private PM may legitimately hold the EAN (contract point 3).
    return jsonb_build_object('ok', true, 'reason', 'no_shared_product_yet', 'moved', false);
  end if;

  select p.id into v_canonical
  from public.products p
  where p.is_active and p.merged_into_product_id is null
    and p.product_kind = 'commercial_product' and p.visibility = 'shared'
    and coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) = v_ean;

  select * into v_variant from public.product_variants where ean = v_ean for update;

  /*
    `canonical_product_write_guard` funnels every canonical write through `ingest_product_v1`, and
    this IS such a write. The guard's own sanctioned release is `app.canonical_product_ingest`,
    transaction-scoped — the same flag the ingest path sets. It is opened immediately before the
    two statements that need it and closed immediately after, so the rest of the caller's
    transaction stays guarded rather than inheriting an open door.
  */
  perform set_config('app.canonical_product_ingest', 'v1', true);

  if found then
    if v_variant.product_id <> v_canonical then
      -- THE MOVE. One row, re-pointed; the unique index forbids anything else.
      -- `product_variants` has no `updated_at`; created_at is the only timestamp it carries.
      update public.product_variants
        set product_id = v_canonical, is_current = true
        where id = v_variant.id;
      v_moved := true;
    elsif not v_variant.is_current then
      update public.product_variants set is_current = true
        where id = v_variant.id;
      v_moved := true;
    end if;
  else
    -- The canonical product had no address at all: give it the one row this EAN is allowed.
    insert into public.product_variants (product_id, ean, is_current)
      values (v_canonical, v_ean, true);
    v_moved := true;
  end if;

  perform set_config('app.canonical_product_ingest', '', true);

  /*
    THE OVERLAY POINTER HAS NO HOME, AND THAT IS A CONSTRAINT, NOT AN OVERSIGHT.

    The plan was to record PM -> canonical PR in `customer_added_products.canonical_product_id`.
    The name reads like a pointer to the canonical product; the table says otherwise:

      customer_added_products_check1:
        CHECK (canonical_product_id IS NULL OR canonical_product_id = product_id)
      customer_added_products_check:
        CHECK ((status = 'CANONICALIZED') = (canonical_product_id IS NOT NULL))

    The column may only ever point at the row's OWN product, and only while the row is
    CANONICALIZED. It means "this demand row has itself been canonicalised"; it cannot express
    "this private row is an overlay on another product". Writing it would violate the check or
    falsify the status, and the attempt failed loudly on 8402001042911 before anything was applied.

    Nothing is lost. The relation is carried where it is load-bearing: the EAN's single variant row
    now addresses the canonical product, so every account resolves to it, while the private row
    keeps its own account relation in `customer_added_product_accounts` and is re-attached per
    caller by `resolveCanonicalEanIdentity`. The link stays derivable from the EAN. A dedicated
    column would be a schema decision for the owner, not one taken quietly here.
  */
  v_linked := 0;

  return jsonb_build_object('ok', true, 'reason', 'canonicalized',
                            'canonical_product_id', v_canonical,
                            'moved', v_moved, 'overlays_linked', v_linked);
end;
$$;

revoke all on function public.canonicalize_ean_identity_v1(text) from public, anon, authenticated;
grant execute on function public.canonicalize_ean_identity_v1(text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Backfill every split case that already exists, not only the one that was reported.
--
--    Read-only dry-run of 2026-09-08 over the live catalogue: 14 EANs carry an active PM or PR;
--    1 has more than one product; 1 is a PM+PR pair; 0 have more than one shared PR; 0 have more
--    than one current variant; 0 have conflicting identity between the PM and the PR. So exactly
--    one EAN is expected to move here — and the loop is written to handle the general case
--    anyway, skipping and reporting anything ambiguous rather than guessing.
-- ---------------------------------------------------------------------------------------------
do $backfill$
declare
  r record;
  v_result jsonb;
  v_moved int := 0;
  v_skipped int := 0;
begin
  for r in
    select distinct coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) as ean
    from public.products p
    where p.is_active and p.merged_into_product_id is null
      and p.product_kind = 'commercial_product' and p.visibility = 'shared'
      and coalesce(nullif(p.barcode_normalized,''), nullif(p.ean_code_normalized,'')) is not null
  loop
    v_result := public.canonicalize_ean_identity_v1(r.ean);
    if (v_result->>'ok')::boolean and coalesce((v_result->>'moved')::boolean, false) then
      v_moved := v_moved + 1;
      raise notice 'canonicalised % -> %', r.ean, v_result->>'canonical_product_id';
    elsif not (v_result->>'ok')::boolean then
      v_skipped := v_skipped + 1;
      raise warning 'SKIPPED % : %', r.ean, v_result->>'reason';
    end if;
  end loop;
  raise notice 'canonical EAN backfill: % moved, % skipped', v_moved, v_skipped;
end
$backfill$;
