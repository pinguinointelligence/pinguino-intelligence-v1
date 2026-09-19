-- SOL-052 — exact-SKU publication eligibility.
--
-- This migration changes definitions only. It intentionally performs no backfill and no correction
-- of PR-ING-007200; the existing row remains untouched until the separately approved data step.

begin;

create or replace function public.product_publication_identity_normalize_v1(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    extensions.unaccent(pg_catalog.lower(coalesce(p_value, ''))),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create or replace function public.product_publication_identity_eligible_v1(p_facts jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_identity jsonb := coalesce(p_facts->'identity', '{}'::jsonb);
  v_contract jsonb := p_facts->'publicationEligibility';
  v_name text := public.product_publication_identity_normalize_v1(
    coalesce(
      v_identity->>'displayName',
      v_identity->>'originalName',
      p_facts->>'displayName',
      p_facts->>'originalName'
    )
  );
  v_brand text := public.product_publication_identity_normalize_v1(
    coalesce(v_identity->>'brand', p_facts->>'brand')
  );
  v_manufacturer text := public.product_publication_identity_normalize_v1(p_facts->>'manufacturer');
  v_source text;
  v_exact boolean := false;
  v_party_words text;
  v_token text;
begin
  v_name := pg_catalog.regexp_replace(v_name, '( ab| ag| as| bv| co| company| corp| corporation| gmbh| inc| incorporated| limited| llc| ltd| nv| oy| plc| sa| sl| spa)+$', '', 'g');
  v_brand := pg_catalog.regexp_replace(v_brand, '( ab| ag| as| bv| co| company| corp| corporation| gmbh| inc| incorporated| limited| llc| ltd| nv| oy| plc| sa| sl| spa)+$', '', 'g');
  v_manufacturer := pg_catalog.regexp_replace(v_manufacturer, '( ab| ag| as| bv| co| company| corp| corporation| gmbh| inc| incorporated| limited| llc| ltd| nv| oy| plc| sa| sl| spa)+$', '', 'g');
  if v_name = '' then return false; end if;

  -- A new finalizer must explicitly stamp the canonical contract. Legacy immutable catalogue
  -- versions predate this field, so they retain catalogue provenance but still face the exact same
  -- distinguishing-name quality test below. New writes never receive this compatibility path.
  if pg_catalog.jsonb_typeof(v_contract) = 'object' then
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

  v_party_words := ' ' || pg_catalog.btrim(v_brand || ' ' || v_manufacturer) || ' ';
  foreach v_token in array pg_catalog.regexp_split_to_array(v_name, '\s+')
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

revoke all on function public.product_publication_identity_normalize_v1(text) from public, anon, authenticated;
revoke all on function public.product_publication_identity_eligible_v1(jsonb) from public, anon, authenticated;
grant execute on function public.product_publication_identity_normalize_v1(text) to service_role;
grant execute on function public.product_publication_identity_eligible_v1(jsonb) to service_role;

comment on function public.product_publication_identity_eligible_v1(jsonb) is
  'SOL-052: exact-SKU identity quality + provenance gate. Mapper/Engine readiness is not publication identity.';

-- Final routing + existing PR + finalized session semantics. An ineligible shared row is blocked;
-- correcting that row remains a separately approved data operation.
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
  if position('SOL052_PUBLICATION_ELIGIBILITY_UPSERT_V2' in v_def) > 0 then return; end if;

  v_old := '  v_route text;';
  if position(v_old in v_def) = 0 then raise exception 'sol052_route_declaration_anchor_missing'; end if;
  v_def := replace(v_def, v_old, v_old || E'\n' || '  v_publication_eligible boolean;');

  v_old :=
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  v_route:=case when v_ready and v_conf>85 then ''PR''' || E'\n' ||
    '                when v_ready then ''PM_READY''' || E'\n' ||
    '                else ''PM_UNVERIFIED'' end;';
  if position(v_old in v_def) = 0 then raise exception 'sol052_route_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  v_publication_eligible:=public.product_publication_identity_eligible_v1(p_scan_result);' || E'\n' ||
    '  -- SOL052_PUBLICATION_ELIGIBILITY_UPSERT_V2' || E'\n' ||
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

  -- Never modify or route around an ineligible shared row. Its correction is a separate task.
  v_old := '  end if;' || E'\n\n' || '  select * into v_pending from public.customer_added_products';
  if position(v_old in v_def) = 0 then raise exception 'sol052_shared_guard_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  end if;' || E'\n\n' ||
    '  if exists (' || E'\n' ||
    '    select 1 from public.products ineligible_shared' || E'\n' ||
    '    left join public.product_versions ineligible_version' || E'\n' ||
    '      on ineligible_version.id=ineligible_shared.current_version_id' || E'\n' ||
    '    where ineligible_shared.is_active and ineligible_shared.merged_into_product_id is null' || E'\n' ||
    '      and ineligible_shared.visibility=''shared''' || E'\n' ||
    '      and ineligible_shared.product_kind=''commercial_product''' || E'\n' ||
    '      and not public.product_publication_identity_eligible_v1(ineligible_version.facts)' || E'\n' ||
    '      and (ineligible_shared.ean_code_normalized=v_ean or exists (' || E'\n' ||
    '        select 1 from public.product_variants ineligible_variant' || E'\n' ||
    '        where ineligible_variant.product_id=ineligible_shared.id' || E'\n' ||
    '          and ineligible_variant.is_current and ineligible_variant.ean=v_ean))' || E'\n' ||
    '  ) then' || E'\n' ||
    '    raise exception ''shared_product_requires_separate_correction'';' || E'\n' ||
    '  end if;' || E'\n\n' ||
     '  select * into v_pending from public.customer_added_products');

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
  if position('SOL052_PUBLICATION_ELIGIBILITY_EXACT_V2' in v_def) > 0 then return; end if;
  v_old :=
    '  where p.is_active and p.merged_into_product_id is null and (' || E'\n' ||
    '    (p.visibility = ''shared'' and p.product_kind = ''commercial_product''' || E'\n' ||
    '      and coalesce(p.canonical_verification_status, '''') <> ''blocked'')';
  if position(v_old in v_def) = 0 then raise exception 'sol052_exact_resolver_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  -- SOL052_PUBLICATION_ELIGIBILITY_EXACT_V2' || E'\n' ||
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and coalesce(p.canonical_verification_status, '''') <> ''blocked'' and (' || E'\n' ||
    '    (p.visibility = ''shared'' and p.product_kind = ''commercial_product''' || E'\n' ||
    '      and public.product_publication_identity_eligible_v1(pv.facts))');

  -- Creator/owner access belongs to private products only. Without this scope, the creator of an
  -- ineligible shared PR can bypass the publication gate through the legacy ownership branch.
  v_old :=
    '    or (v_uid is not null and (p.owning_account_id = v_uid or p.created_by = v_uid))';
  if position(v_old in v_def) = 0 then raise exception 'sol052_exact_private_scope_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '    or (v_uid is not null and p.visibility <> ''shared''' || E'\n' ||
    '      and (p.owning_account_id = v_uid or p.created_by = v_uid))');
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
  if position('SOL052_PUBLICATION_ELIGIBILITY_SEARCH_V2' in v_def) > 0 then return; end if;
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
    '    -- SOL052_PUBLICATION_ELIGIBILITY_SEARCH_V2' || E'\n' ||
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
  if position('SOL052_PUBLICATION_ELIGIBILITY_CANONICAL_V2' in v_def) > 0 then return; end if;
  v_old :=
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and p.product_kind = ''commercial_product'' and p.visibility = ''shared''' || E'\n' ||
    '    and coalesce(nullif(p.barcode_normalized,''''), nullif(p.ean_code_normalized,'''')) = v_ean;';
  if position(v_old in v_def) = 0 then raise exception 'sol052_canonicalize_anchor_missing'; end if;
  v_def := replace(v_def, v_old,
    '  -- SOL052_PUBLICATION_ELIGIBILITY_CANONICAL_V2' || E'\n' ||
    '  left join public.product_versions publication_version on publication_version.id=p.current_version_id' || E'\n' ||
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and p.product_kind = ''commercial_product'' and p.visibility = ''shared''' || E'\n' ||
    '    and coalesce(p.canonical_verification_status, '''') <> ''blocked''' || E'\n' ||
    '    and public.product_publication_identity_eligible_v1(publication_version.facts)' || E'\n' ||
    '    and coalesce(nullif(p.barcode_normalized,''''), nullif(p.ean_code_normalized,'''')) = v_ean;');
  execute v_def;
end;
$patch_canonical_repoint$;

commit;
