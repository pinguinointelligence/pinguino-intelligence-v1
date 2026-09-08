-- SOL-052 — exact-SKU publication eligibility.
--
-- This migration changes definitions only. It intentionally performs no backfill and no correction
-- of PR-ING-007200; the existing row remains untouched until the separately approved data step.

create or replace function public.product_publication_identity_normalize_v1(p_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(regexp_replace(
    extensions.unaccent(lower(coalesce(p_value, ''))),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create or replace function public.product_publication_identity_eligible_v1(p_facts jsonb)
returns boolean
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_identity jsonb := coalesce(p_facts->'identity', '{}'::jsonb);
  v_contract jsonb := p_facts->'publicationEligibility';
  v_name text := public.product_publication_identity_normalize_v1(
    coalesce(v_identity->>'displayName', v_identity->>'originalName')
  );
  v_brand text := public.product_publication_identity_normalize_v1(v_identity->>'brand');
  v_manufacturer text := public.product_publication_identity_normalize_v1(p_facts->>'manufacturer');
  v_source text;
  v_exact boolean := false;
  v_party_words text;
  v_token text;
begin
  v_name := regexp_replace(v_name, '( ab| ag| as| bv| co| company| corp| corporation| gmbh| inc| incorporated| limited| llc| ltd| nv| oy| plc| sa| sl| spa)+$', '', 'g');
  v_brand := regexp_replace(v_brand, '( ab| ag| as| bv| co| company| corp| corporation| gmbh| inc| incorporated| limited| llc| ltd| nv| oy| plc| sa| sl| spa)+$', '', 'g');
  v_manufacturer := regexp_replace(v_manufacturer, '( ab| ag| as| bv| co| company| corp| corporation| gmbh| inc| incorporated| limited| llc| ltd| nv| oy| plc| sa| sl| spa)+$', '', 'g');
  if v_name = '' then return false; end if;

  -- A new finalizer must explicitly stamp the canonical contract. Legacy immutable catalogue
  -- versions predate this field, so they retain catalogue provenance but still face the exact same
  -- distinguishing-name quality test below. New writes never receive this compatibility path.
  if jsonb_typeof(v_contract) = 'object' then
    if v_contract->>'version' <> 'PRODUCT_PUBLICATION_IDENTITY_V1'
       or coalesce((v_contract->>'eligible')::boolean, false) = false then
      return false;
    end if;
    v_source := v_contract#>>'{fieldProvenance,displayName,source}';
    v_exact := coalesce(
      (v_contract#>>'{fieldProvenance,displayName,exactGtinMatch}')::boolean,
      false
    );
    if v_source in ('label', 'user_confirmed', 'catalog_verified') then
      null;
    elsif v_source in ('barcode_registry', 'manufacturer', 'retailer', 'web_search') and v_exact then
      null;
    else
      return false;
    end if;
  end if;

  -- Legal suffixes do not make the brand/manufacturer a product line.
  if (v_brand <> '' and v_name = v_brand)
     or (v_manufacturer <> '' and v_name = v_manufacturer) then
    return false;
  end if;

  v_party_words := ' ' || trim(v_brand || ' ' || v_manufacturer) || ' ';
  foreach v_token in array regexp_split_to_array(v_name, '\s+')
  loop
    continue when v_token = '';
    continue when v_token = any(array[
      'ab','ag','as','bv','co','company','corp','corporation','gmbh','inc','incorporated',
      'limited','llc','ltd','nv','oy','plc','sa','sl','spa',
      'beverage','drink','food','ingredient','mineral','napoj','product','produkt','vitamin',
      'vitamins','water','woda'
    ]::text[]);
    if position(' ' || v_token || ' ' in v_party_words) = 0 then return true; end if;
  end loop;
  return false;
exception when others then
  -- Publication is fail-closed; malformed historical JSON remains private/hidden.
  return false;
end;
$$;

revoke all on function public.product_publication_identity_normalize_v1(text) from public;
revoke all on function public.product_publication_identity_eligible_v1(jsonb) from public;
grant execute on function public.product_publication_identity_normalize_v1(text) to service_role;
grant execute on function public.product_publication_identity_eligible_v1(jsonb) to service_role;

comment on function public.product_publication_identity_eligible_v1(jsonb) is
  'SOL-052: exact-SKU identity quality + provenance gate. Mapper/Engine readiness is not publication identity.';

-- Final routing + existing PR + correction-in-place + finalized session semantics.
do $patch_scan_upsert$
declare
  v_sig regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_def text;
  v_old text;
begin
  if v_sig is null then raise exception 'sol052_scan_upsert_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  if position('v_publication_eligible boolean;' in v_def) > 0 then return; end if;

  v_old := '  v_route text;';
  if position(v_old in v_def) = 0 then raise exception 'sol052_route_declaration_anchor_missing'; end if;
   v_def := replace(v_def, v_old,
     v_old || E'\n' ||
     '  v_publication_eligible boolean;' || E'\n' ||
     '  v_correction_shared_count integer;');

  v_old :=
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  v_route:=case when v_ready and v_conf>85 then ''PR''' || E'\n' ||
    '                when v_ready then ''PM_READY''' || E'\n' ||
    '                else ''PM_UNVERIFIED'' end;';
  if position(v_old in v_def) = 0 then raise exception 'sol052_route_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  v_publication_eligible:=public.product_publication_identity_eligible_v1(p_scan_result);' || E'\n' ||
    '  -- ready and confidence are necessary, but never sufficient for shared publication.' || E'\n' ||
    '  v_route:=case when v_ready and v_conf > 85 and v_publication_eligible then ''PR''' || E'\n' ||
    '                when v_ready then ''PM_READY''' || E'\n' ||
    '                else ''PM_UNVERIFIED'' end;');

  -- Existing PR is an answer only when its CURRENT immutable facts are publication-eligible.
  v_old :=
    '  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr' || E'\n' ||
    '    from public.products p' || E'\n' ||
    '    where p.is_active and p.merged_into_product_id is null';
  if position(v_old in v_def) = 0 then raise exception 'sol052_existing_pr_join_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  -- SOL-052 existing PR publication gate.' || E'\n' ||
    '  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr' || E'\n' ||
    '    from public.products p' || E'\n' ||
    '    join public.product_versions current_version on current_version.id=p.current_version_id' || E'\n' ||
    '    where p.is_active and p.merged_into_product_id is null');
  v_old :=
    '      and p.product_code like ''PR-ING-%'' and p.canonical_verification_status<>''blocked''' || E'\n' ||
    '      and (p.ean_code_normalized=v_ean';
  if position(v_old in v_def) = 0 then raise exception 'sol052_existing_pr_gate_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '      and p.product_code like ''PR-ING-%'' and p.canonical_verification_status<>''blocked''' || E'\n' ||
    '      and public.product_publication_identity_eligible_v1(current_version.facts)' || E'\n' ||
    '      and (p.ean_code_normalized=v_ean');

  -- A quarantined/non-publishable shared row owns the EAN. Weak evidence may not return it and may
  -- not create a duplicate PM; a later exact-SKU PR verdict reuses its demand row and UUID below.
  v_old := '  end if;' || E'\n\n' || '  select * into v_pending from public.customer_added_products';
  if position(v_old in v_def) = 0 then raise exception 'sol052_correction_guard_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  end if;' || E'\n\n' ||
    '  if v_route<>''PR'' and exists (' || E'\n' ||
    '    select 1 from public.products correction_product' || E'\n' ||
    '    where correction_product.is_active and correction_product.merged_into_product_id is null' || E'\n' ||
    '      and correction_product.visibility=''shared''' || E'\n' ||
    '      and correction_product.product_kind=''commercial_product''' || E'\n' ||
    '      and (correction_product.ean_code_normalized=v_ean or exists (' || E'\n' ||
    '        select 1 from public.product_variants correction_variant' || E'\n' ||
    '        where correction_variant.product_id=correction_product.id' || E'\n' ||
    '          and correction_variant.is_current and correction_variant.ean=v_ean))' || E'\n' ||
    '  ) then' || E'\n' ||
    '    raise exception ''product_publication_identity_correction_required'';' || E'\n' ||
    '  end if;' || E'\n\n' ||
     '  select * into v_pending from public.customer_added_products');

  -- A shared row may predate customer_added_products, while the caller may already have a private
  -- PM demand row. A qualifying correction must prefer/recreate the shared demand pointer and reuse
  -- that UUID rather than promote the PM into a second shared product. The EAN lock serializes this.
  v_old := '    limit 1 for update;' || E'\n' || '  if v_pending.id is null then';
  if position(v_old in v_def) = 0 then raise exception 'sol052_correction_reuse_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '    limit 1 for update;' || E'\n' ||
    '  if v_route=''PR'' then' || E'\n' ||
    '    select count(*) into v_correction_shared_count from public.products correction_product' || E'\n' ||
    '    where correction_product.is_active and correction_product.merged_into_product_id is null' || E'\n' ||
    '      and correction_product.visibility=''shared''' || E'\n' ||
    '      and correction_product.product_kind=''commercial_product''' || E'\n' ||
    '      and (correction_product.ean_code_normalized=v_ean or exists (' || E'\n' ||
    '        select 1 from public.product_variants correction_variant' || E'\n' ||
    '        where correction_variant.product_id=correction_product.id' || E'\n' ||
    '          and correction_variant.is_current and correction_variant.ean=v_ean));' || E'\n' ||
    '    if v_correction_shared_count>1 then' || E'\n' ||
    '      raise exception ''ambiguous_shared_products_for_ean'';' || E'\n' ||
    '    elsif v_correction_shared_count=1 then' || E'\n' ||
    '      select correction_product.id into v_product_id from public.products correction_product' || E'\n' ||
    '      where correction_product.is_active and correction_product.merged_into_product_id is null' || E'\n' ||
    '        and correction_product.visibility=''shared''' || E'\n' ||
    '        and correction_product.product_kind=''commercial_product''' || E'\n' ||
    '        and (correction_product.ean_code_normalized=v_ean or exists (' || E'\n' ||
    '          select 1 from public.product_variants correction_variant' || E'\n' ||
    '          where correction_variant.product_id=correction_product.id' || E'\n' ||
    '            and correction_variant.is_current and correction_variant.ean=v_ean))' || E'\n' ||
    '      for update;' || E'\n' ||
    '      insert into public.customer_added_products(normalized_ean,product_id,owner_user_id)' || E'\n' ||
    '        values(v_ean,v_product_id,null) on conflict do nothing;' || E'\n' ||
    '      select * into v_pending from public.customer_added_products' || E'\n' ||
    '        where normalized_ean=v_ean and owner_user_id is null limit 1 for update;' || E'\n' ||
    '      if v_pending.id is null or v_pending.product_id is distinct from v_product_id then' || E'\n' ||
    '        raise exception ''shared_product_demand_state_invalid'';' || E'\n' ||
    '      end if;' || E'\n' ||
    '    end if;' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if v_pending.id is null then');

  v_old :=
    '      v_improves:=(v_new_usable and not v_prior_usable)' || E'\n' ||
    '        or (v_new_usable and v_prior_usable';
  if position(v_old in v_def) = 0 then raise exception 'sol052_refresh_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '      v_improves:=(not public.product_publication_identity_eligible_v1(v_prior_facts)' || E'\n' ||
    '          and public.product_publication_identity_eligible_v1(p_scan_result))' || E'\n' ||
    '        or (v_new_usable and not v_prior_usable)' || E'\n' ||
    '        or (v_new_usable and v_prior_usable');

  v_old :=
    '  update public.product_scan_sessions set state=''finalized'',exact_product_id=v_product_id,' || E'\n' ||
    '    overlay_state=''USABLE_FOR_OWNER'',updated_at=statement_timestamp()';
  if position(v_old in v_def) = 0 then raise exception 'sol052_finalized_session_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  update public.product_scan_sessions set state=''finalized'',exact_product_id=v_product_id,' || E'\n' ||
    '    finalized_at=coalesce(finalized_at,statement_timestamp()),' || E'\n' ||
    '    overlay_state=case when v_route=''PR'' then ''PUBLISHED''' || E'\n' ||
    '      when v_ready then ''USABLE_FOR_OWNER'' else ''SCAN_DRAFT'' end,' || E'\n' ||
    '    updated_at=statement_timestamp()');

  execute v_def;
end;
$patch_scan_upsert$;

-- Exact GTIN resolver: quarantine is absolute and every shared row needs exact-SKU eligible facts.
-- Private rows retain their existing owner/link rules.
do $patch_exact_resolver$
declare
  v_sig regprocedure := to_regprocedure('public.resolve_exact_products_by_gtin_v1(text,text)');
  v_def text;
  v_old text;
begin
  if v_sig is null then raise exception 'sol052_exact_resolver_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  v_old :=
    '  where p.is_active and p.merged_into_product_id is null and (' || E'\n' ||
    '    (p.visibility = ''shared'' and p.product_kind = ''commercial_product''' || E'\n' ||
    '      and coalesce(p.canonical_verification_status, '''') <> ''blocked'')';
  if position(v_old in v_def) = 0 then raise exception 'sol052_exact_resolver_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and coalesce(p.canonical_verification_status, '''') <> ''blocked'' and (' || E'\n' ||
    '    (p.visibility = ''shared'' and p.product_kind = ''commercial_product''' || E'\n' ||
    '      and public.product_publication_identity_eligible_v1(pv.facts))');
  execute v_def;
end;
$patch_exact_resolver$;

-- Search: a blocked row is never a result through creator/link short-circuits; publication quality
-- applies to shared rows only, so valid private PM behaviour and privacy remain unchanged.
do $patch_product_search$
declare
  v_sig regprocedure := to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_def text;
  v_old text;
begin
  if v_sig is null then raise exception 'sol052_product_search_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  v_old :=
    '    where p.product_kind<>''mapper_reference'' and p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '      and ((p.visibility=''shared'')' || E'\n' ||
    '        or p.owning_account_id=auth.uid() or p.created_by=auth.uid()' || E'\n' ||
    '        or exists(select 1 from public.product_ingest_events ev' || E'\n' ||
    '          where ev.product_id=p.id and ev.actor_user_id=auth.uid())' || E'\n' ||
    '        or exists(select 1 from public.customer_added_product_accounts linked' || E'\n' ||
    '          where linked.product_id=p.id and linked.user_id=auth.uid()))';
  if position(v_old in v_def) = 0 then raise exception 'sol052_product_search_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '    where p.product_kind<>''mapper_reference'' and p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '      and coalesce(p.canonical_verification_status, '''') <> ''blocked''' || E'\n' ||
    '      and ((p.visibility=''shared'' and' || E'\n' ||
    '          public.product_publication_identity_eligible_v1(v.facts))' || E'\n' ||
    '        or (p.visibility<>''shared'' and (' || E'\n' ||
    '          p.owning_account_id=auth.uid() or p.created_by=auth.uid()' || E'\n' ||
    '          or exists(select 1 from public.product_ingest_events ev' || E'\n' ||
    '            where ev.product_id=p.id and ev.actor_user_id=auth.uid())' || E'\n' ||
    '          or exists(select 1 from public.customer_added_product_accounts linked' || E'\n' ||
    '            where linked.product_id=p.id and linked.user_id=auth.uid()))))');
  execute v_def;
end;
$patch_product_search$;

-- Self-healing may only point an EAN at a publication-eligible shared identity. This prevents the
-- lookup side effect from re-addressing a quarantined or generic PR before its correction.
do $patch_canonical_repoint$
declare
  v_sig regprocedure := to_regprocedure('public.canonicalize_ean_identity_v1(text,uuid)');
  v_def text;
  v_old text;
begin
  if v_sig is null then raise exception 'sol052_canonicalize_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  v_old :=
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and p.product_kind = ''commercial_product'' and p.visibility = ''shared''' || E'\n' ||
    '    and coalesce(nullif(p.barcode_normalized,''''), nullif(p.ean_code_normalized,'''')) = v_ean;';
  if position(v_old in v_def) = 0 then raise exception 'sol052_canonicalize_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  left join public.product_versions publication_version on publication_version.id=p.current_version_id' || E'\n' ||
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and p.product_kind = ''commercial_product'' and p.visibility = ''shared''' || E'\n' ||
    '    and coalesce(p.canonical_verification_status, '''') <> ''blocked''' || E'\n' ||
    '    and public.product_publication_identity_eligible_v1(publication_version.facts)' || E'\n' ||
    '    and coalesce(nullif(p.barcode_normalized,''''), nullif(p.ean_code_normalized,'''')) = v_ean;');
  execute v_def;
end;
$patch_canonical_repoint$;
