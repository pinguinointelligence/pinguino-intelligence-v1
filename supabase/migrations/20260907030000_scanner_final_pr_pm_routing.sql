-- SCANNER FINAL ROUTING — owner contract 2026-09-07.
--
-- WHAT WAS WRONG. Every scanned product became `CA-ING-*`. Not because a gate rejected it — because
-- `gellatti_upsert_customer_added_product_v1` had exactly two outcomes: reuse an existing shared
-- `PR-ING-%` row found by EAN, or fall through to ONE insert whose `product_kind`, `visibility` and
-- article origin were LITERALS (`'customer_provisional'`, `'internal'`,
-- `set_config('app.product_article_origin','CUSTOMER_ADDED')`). No input, flag or account property
-- could change them, and no branch anywhere in the scanner could create a shared registry row. On
-- top of that the function REFUSED outright (`customer_product_ready_profile_required`) unless the
-- profile was already ready — which is why a product that needed completion had nowhere to live.
--
-- THE CONTRACT NOW IMPLEMENTED. Routing happens ONCE, at the end of the existing automatic path
-- (enrichment → Product Registry lookup → Mapper Rescue → classification → behaviour → readiness),
-- from the SAME canonical profile that path produced. This function is the last step, so it does
-- not recompute readiness and does not keep a second list of required fields:
--
--     finalConfidence > 85  AND  productionReady        →  PR-ING, shared registry, immediately
--     productionReady, confidence ≤ 85                  →  PM-ING READY   (private, usable)
--     not productionReady after the whole rescue        →  PM-ING UNVERIFIED (private, not usable)
--
-- 85.00 is NOT above 85: the comparison is strictly `> 85`.
--
-- PER-USER PM IDENTITY (contract §6: "istniejący PM-ING TEGO UŻYTKOWNIKA → aktualizuj, nie
-- duplikuj"). `customer_added_products` carried `UNIQUE (normalized_ean)` — the one-central-row-per-
-- EAN model that let two accounts share a single provisional product (which is exactly how Cola Zero
-- came to be linked to both home@ and pro@). A private product cannot be shared, so the demand row
-- gains an owner and the uniqueness becomes per (EAN, owner). A NULL owner keeps the old meaning:
-- a shared/PR-bound demand record.

-- ---------------------------------------------------------------------------------------------
-- 1. Per-user identity for the demand row.
-- ---------------------------------------------------------------------------------------------
alter table public.customer_added_products
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

alter table public.customer_added_products
  drop constraint if exists customer_added_products_normalized_ean_key;

create unique index if not exists customer_added_products_ean_owner_key
  on public.customer_added_products (normalized_ean, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on column public.customer_added_products.owner_user_id is
  'Owner of a private PM demand row. NULL = a shared/PR-bound record (the historical meaning).';

-- ---------------------------------------------------------------------------------------------
-- 2. The routing itself, applied as targeted patches on the DEPLOYED body so that every other
--    guard, the canonicalization transaction and the rescue-refresh logic are provably untouched.
-- ---------------------------------------------------------------------------------------------
do $migration$
declare
  v_sig regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_def text;
  v_old text;
  v_new text;
begin
  if v_sig is null then raise exception 'gellatti_upsert_customer_added_product_v1_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;

  if position('v_route' in v_def) > 0 then
    raise notice 'final PR/PM routing already applied; nothing to do';
    return;
  end if;

  ---------------------------------------------------------------------------------------------
  -- 2a. route variables
  ---------------------------------------------------------------------------------------------
  v_old := '  v_product_code text;';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_declare_not_found'; end if;
  v_def := replace(v_def, v_old,
    '  v_product_code text;' || E'\n' ||
    '  v_ready boolean;' || E'\n' ||
    '  v_conf numeric;' || E'\n' ||
    '  v_route text;');

  ---------------------------------------------------------------------------------------------
  -- 2b. readiness stops being an admission gate — it becomes the routing input.
  --     The AUTHORITY and SHAPE checks stay hard failures: a malformed profile is still refused.
  ---------------------------------------------------------------------------------------------
  v_old :=
    '    or p_product_profile#>>''{origin}''<>''CUSTOMER_ADDED''' || E'\n' ||
    '    or coalesce((p_product_profile#>>''{productAccuracyAssessment,gellattiReadiness,ready}'')::boolean,false)=false' || E'\n' ||
    '    or p_product_profile#>>''{productAccuracyAssessment,roleReadiness}'' not in (''BASE_READY'',''TOPPING_READY'')' || E'\n' ||
    '    or jsonb_typeof(p_product_profile->''technicalComposition'')<>''object''';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_profile_guard_not_found'; end if;
  v_def := replace(v_def, v_old,
    '    or p_product_profile#>>''{origin}''<>''CUSTOMER_ADDED''' || E'\n' ||
    '    or jsonb_typeof(p_product_profile->''technicalComposition'')<>''object''');

  ---------------------------------------------------------------------------------------------
  -- 2c. same for the behaviour verdict, and compute the route right after both guards
  ---------------------------------------------------------------------------------------------
  v_old :=
    '    or p_product_behavior#>>''{articleIdentity}''<>''PRODUCT_OWNED''' || E'\n' ||
    '    or p_product_behavior#>>''{classificationOutcome}''<>''classified''' || E'\n' ||
    '    or not (coalesce((p_product_behavior->>''baseRecipeEligible'')::boolean,false)' || E'\n' ||
    '      or coalesce((p_product_behavior->>''toppingEligible'')::boolean,false))' || E'\n' ||
    '  then raise exception ''customer_product_behavior_authority_required''; end if;';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_behavior_guard_not_found'; end if;
  v_def := replace(v_def, v_old,
    '    or p_product_behavior#>>''{articleIdentity}''<>''PRODUCT_OWNED''' || E'\n' ||
    '  then raise exception ''customer_product_behavior_authority_required''; end if;' || E'\n' ||
    E'\n' ||
    '  -- FINAL ROUTING. Both inputs come from the canonical profile/behaviour this pipeline just' || E'\n' ||
    '  -- produced; nothing is recomputed here and no second list of required fields exists.' || E'\n' ||
    '  v_ready:=coalesce((p_product_profile#>>''{productAccuracyAssessment,gellattiReadiness,ready}'')::boolean,false)' || E'\n' ||
    '    and p_product_profile#>>''{productAccuracyAssessment,roleReadiness}'' in (''BASE_READY'',''TOPPING_READY'')' || E'\n' ||
    '    and p_product_behavior#>>''{classificationOutcome}''=''classified''' || E'\n' ||
    '    and (coalesce((p_product_behavior->>''baseRecipeEligible'')::boolean,false)' || E'\n' ||
    '      or coalesce((p_product_behavior->>''toppingEligible'')::boolean,false));' || E'\n' ||
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  -- STRICTLY above 85. 85.00 is not above 85 and takes the PM path.' || E'\n' ||
    '  v_route:=case when v_ready and v_conf>85 then ''PR''' || E'\n' ||
    '                when v_ready then ''PM_READY''' || E'\n' ||
    '                else ''PM_UNVERIFIED'' end;');

  ---------------------------------------------------------------------------------------------
  -- 2d. a private product is deduplicated per OWNER, a shared one per EAN
  ---------------------------------------------------------------------------------------------
  v_old := '  perform pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean,0));';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_lock_not_found'; end if;
  v_def := replace(v_def, v_old,
    '  perform pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean||' || E'\n' ||
    '    case when v_route=''PR'' then '''' else '':''||p_actor_user_id::text end,0));');

  v_old :=
    '  select * into v_pending from public.customer_added_products' || E'\n' ||
    '    where normalized_ean=v_ean and status=''PENDING'' for update;';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_pending_not_found'; end if;
  v_def := replace(v_def, v_old,
    '  select * into v_pending from public.customer_added_products' || E'\n' ||
    '    where normalized_ean=v_ean and status=''PENDING''' || E'\n' ||
    '      and owner_user_id is not distinct from' || E'\n' ||
    '        (case when v_route=''PR'' then null else p_actor_user_id end) for update;');

  ---------------------------------------------------------------------------------------------
  -- 2e. the article prefix. This is the literal that made every product a CA.
  --     Replaces BOTH occurrences (the create branch and the rescue-refresh branch).
  ---------------------------------------------------------------------------------------------
  v_old := 'perform set_config(''app.product_article_origin'',''CUSTOMER_ADDED'',true);';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_origin_not_found'; end if;
  v_def := replace(v_def, v_old,
    'perform set_config(''app.product_article_origin'',case when v_route=''PR'' then ''PR'' else ''PM'' end,true);');

  ---------------------------------------------------------------------------------------------
  -- 2f. ownership, kind and visibility on the created product.
  --     PR  → shared, no owner            (products_canonical_privacy_check)
  --     PM  → account_private, owned      (same CHECK enforces the owner is present)
  ---------------------------------------------------------------------------------------------
  v_old := '      owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_insert_columns_not_found'; end if;
  v_def := replace(v_def, v_old,
    '      owner_user_id,owning_account_id,created_by,brand,ean_code,barcode,product_name_internal,product_name_display,');

  v_old := '      null,p_actor_user_id,v_brand,v_ean,v_ean,';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_insert_owner_not_found'; end if;
  v_def := replace(v_def, v_old,
    '      case when v_route=''PR'' then null else p_actor_user_id end,' || E'\n' ||
    '      case when v_route=''PR'' then null else p_actor_user_id end,' || E'\n' ||
    '      p_actor_user_id,v_brand,v_ean,v_ean,');

  v_old := '      ''manual_adjusted'',''label_scan'',true,''customer_provisional'',''internal'',';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_insert_kind_not_found'; end if;
  v_def := replace(v_def, v_old,
    '      ''manual_adjusted'',''label_scan'',true,' || E'\n' ||
    '      case when v_route=''PR'' then ''commercial_product'' else ''customer_provisional'' end,' || E'\n' ||
    '      case when v_route=''PR'' then ''shared'' else ''account_private'' end,');

  ---------------------------------------------------------------------------------------------
  -- 2g. stamp the owner on the demand row so the per-owner unique index holds
  ---------------------------------------------------------------------------------------------
  v_old :=
    '    insert into public.customer_added_products(normalized_ean,product_id)' || E'\n' ||
    '      values(v_ean,v_product_id) returning * into v_pending;';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_demand_insert_not_found'; end if;
  v_def := replace(v_def, v_old,
    '    insert into public.customer_added_products(normalized_ean,product_id,owner_user_id)' || E'\n' ||
    '      values(v_ean,v_product_id,case when v_route=''PR'' then null else p_actor_user_id end)' || E'\n' ||
    '      returning * into v_pending;');

  ---------------------------------------------------------------------------------------------
  -- 2h. the existing-product branch must accept a shared PR as well as a provisional PM
  ---------------------------------------------------------------------------------------------
  v_old :=
    '      from public.products where id=v_product_id and is_active' || E'\n' ||
    '        and product_kind=''customer_provisional'' and merged_into_product_id is null;';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_existing_kind_not_found'; end if;
  v_def := replace(v_def, v_old,
    '      from public.products where id=v_product_id and is_active' || E'\n' ||
    '        and product_kind in (''customer_provisional'',''commercial_product'')' || E'\n' ||
    '        and merged_into_product_id is null;');

  ---------------------------------------------------------------------------------------------
  -- 2i. tell the caller which way it went, and stop claiming engineUsable for an unready product
  ---------------------------------------------------------------------------------------------
  v_old :=
    '    ''pendingId'',v_pending.id,''customerCount'',v_count,''engineUsable'',true,' || E'\n' ||
    '    ''productAccuracy'',p_product_profile->''productAccuracy''';
  if position(v_old in v_def) = 0 then raise exception 'routing_anchor_return_not_found'; end if;
  v_def := replace(v_def, v_old,
    '    ''pendingId'',v_pending.id,''customerCount'',v_count,''engineUsable'',v_ready,' || E'\n' ||
    '    ''route'',v_route,''finalConfidence'',v_conf,''productionReady'',v_ready,' || E'\n' ||
    '    ''productAccuracy'',p_product_profile->''productAccuracy''');

  execute v_def;
  raise notice 'final PR/PM routing applied';
end
$migration$;

-- ---------------------------------------------------------------------------------------------
-- 3. A private product is readable only by its owner. The link-table policy grants read on ANY
--    `customer_provisional` row to ANY account listed in customer_added_product_accounts; with
--    per-owner demand rows nothing can list a second account on a PM, but the policy is narrowed
--    as well so that a stray link row can never expose one.
-- ---------------------------------------------------------------------------------------------
drop policy if exists products_customer_added_linked_read on public.products;
create policy products_customer_added_linked_read on public.products for select using (
  product_kind = 'customer_provisional'
  and is_active
  and merged_into_product_id is null
  and (owning_account_id is null or owning_account_id = auth.uid())
  and exists (
    select 1 from public.customer_added_product_accounts linked
    where linked.product_id = products.id and linked.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------------------------
-- 4. Produkty → Niezweryfikowane. The caller's OWN private products that the pipeline could not
--    make production-ready after the full rescue, with what is missing in PLAIN words.
--
--    Never returns `roleReadiness`, `binding_missing`, `INGREDIENTS_EVIDENCE_REQUIRED`, an RPC name
--    or a raw status. The product id is returned only because the UI needs it to navigate.
-- ---------------------------------------------------------------------------------------------
create or replace function public.gellatti_my_unverified_products_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  return coalesce((
    select jsonb_agg(row_data order by row_data->>'savedAt' desc)
    from (
      select jsonb_build_object(
        'productId', p.id,
        'ean', nullif(p.ean_code_normalized, ''),
        'name', coalesce(p.product_name_display, p.product_name_internal),
        'brand', p.brand,
        'savedAt', p.created_at,
        'missing', coalesce(
          (select jsonb_agg(distinct m) from jsonb_array_elements_text(
             coalesce(pv.facts#>'{productIntelligence,missingCritical}', '[]'::jsonb)) as m),
          '[]'::jsonb)
      ) as row_data
      from public.products p
      join public.product_versions pv on pv.id = p.current_version_id
      where p.is_active
        and p.merged_into_product_id is null
        and p.product_kind = 'customer_provisional'
        and p.owning_account_id = v_uid
        and coalesce(
          (pv.facts#>>'{productIntelligence,productAccuracyAssessment,gellattiReadiness,ready}')::boolean,
          false) = false
    ) s
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.gellatti_my_unverified_products_v1() from public;
grant execute on function public.gellatti_my_unverified_products_v1() to authenticated;
