-- Roll back SOL-052 definitions only. This cannot and does not undo data written by requests that
-- ran while SOL-052 was active. Run only after restoring the previous Edge Function bundles.

begin;

do $rollback_scan_upsert$
declare
  v_sig regprocedure := to_regprocedure(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'
  );
  v_def text;
  v_old text;
  v_new text;
begin
  if v_sig is null then raise exception 'sol052_rollback_scan_upsert_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  if position('SOL052_PUBLICATION_ELIGIBILITY_UPSERT_V2' in v_def) = 0 then return; end if;

  v_new := '  v_route text;' || E'\n' || '  v_publication_eligible boolean;';
  v_old := '  v_route text;';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_declaration_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  v_new :=
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  v_publication_eligible:=public.product_publication_identity_eligible_v1(p_scan_result);' || E'\n' ||
    '  -- SOL052_PUBLICATION_ELIGIBILITY_UPSERT_V2' || E'\n' ||
    '  -- ready and confidence are necessary, but never sufficient for shared publication.' || E'\n' ||
    '  v_route:=case when v_ready and v_conf > 85 and v_publication_eligible then ''PR''' || E'\n' ||
    '                when v_ready then ''PM_READY''' || E'\n' ||
    '                else ''PM_UNVERIFIED'' end;';
  v_old :=
    '  v_conf:=coalesce((p_product_profile->>''productAccuracy'')::numeric,0);' || E'\n' ||
    '  v_route:=case when v_ready and v_conf>85 then ''PR''' || E'\n' ||
    '                when v_ready then ''PM_READY''' || E'\n' ||
    '                else ''PM_UNVERIFIED'' end;';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_route_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  v_new :=
    '  -- SOL-052 existing PR publication gate.' || E'\n' ||
    '  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr' || E'\n' ||
    '    from public.products p' || E'\n' ||
    '    join public.product_versions current_version on current_version.id=p.current_version_id' || E'\n' ||
    '    where p.is_active and p.merged_into_product_id is null';
  v_old :=
    '  select p.id,p.product_code,p.product_name_display,p.brand into v_existing_pr' || E'\n' ||
    '    from public.products p' || E'\n' ||
    '    where p.is_active and p.merged_into_product_id is null';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_existing_join_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  v_new :=
    '      and p.product_code like ''PR-ING-%'' and p.canonical_verification_status<>''blocked''' || E'\n' ||
    '      and public.product_publication_identity_eligible_v1(current_version.facts)' || E'\n' ||
    '      and (p.ean_code_normalized=v_ean';
  v_old :=
    '      and p.product_code like ''PR-ING-%'' and p.canonical_verification_status<>''blocked''' || E'\n' ||
    '      and (p.ean_code_normalized=v_ean';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_existing_gate_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  v_new :=
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
    '  select * into v_pending from public.customer_added_products';
  v_old := '  end if;' || E'\n\n' || '  select * into v_pending from public.customer_added_products';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_shared_guard_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  v_new :=
    '  update public.product_scan_sessions set state=''finalized'',exact_product_id=v_product_id,' || E'\n' ||
    '    finalized_at=coalesce(finalized_at,statement_timestamp()),' || E'\n' ||
    '    overlay_state=case when v_route=''PR'' then ''PUBLISHED''' || E'\n' ||
    '      when v_ready then ''USABLE_FOR_OWNER'' else ''SCAN_DRAFT'' end,' || E'\n' ||
    '    updated_at=statement_timestamp()';
  v_old :=
    '  update public.product_scan_sessions set state=''finalized'',exact_product_id=v_product_id,' || E'\n' ||
    '    overlay_state=''USABLE_FOR_OWNER'',updated_at=statement_timestamp()';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_session_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  execute v_def;
end;
$rollback_scan_upsert$;

do $rollback_exact_resolver$
declare
  v_sig regprocedure := to_regprocedure('public.resolve_exact_products_by_gtin_v1(text,text)');
  v_def text;
  v_old text;
  v_new text;
begin
  if v_sig is null then raise exception 'sol052_rollback_exact_resolver_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  if position('SOL052_PUBLICATION_ELIGIBILITY_EXACT_V2' in v_def) = 0 then return; end if;
  v_new :=
    '  -- SOL052_PUBLICATION_ELIGIBILITY_EXACT_V2' || E'\n' ||
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and coalesce(p.canonical_verification_status, '''') <> ''blocked'' and (' || E'\n' ||
    '    (p.visibility = ''shared'' and p.product_kind = ''commercial_product''' || E'\n' ||
    '      and public.product_publication_identity_eligible_v1(pv.facts))';
  v_old :=
    '  where p.is_active and p.merged_into_product_id is null and (' || E'\n' ||
    '    (p.visibility = ''shared'' and p.product_kind = ''commercial_product''' || E'\n' ||
    '      and coalesce(p.canonical_verification_status, '''') <> ''blocked'')';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_exact_anchor_missing'; end if;
  v_def := replace(v_def, v_new, v_old);

  v_new :=
    '    or (v_uid is not null and p.visibility <> ''shared''' || E'\n' ||
    '      and (p.owning_account_id = v_uid or p.created_by = v_uid))';
  v_old :=
    '    or (v_uid is not null and (p.owning_account_id = v_uid or p.created_by = v_uid))';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_exact_private_scope_anchor_missing'; end if;
  execute replace(v_def, v_new, v_old);
end;
$rollback_exact_resolver$;

do $rollback_product_search$
declare
  v_sig regprocedure := to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_def text;
  v_old text;
  v_new text;
begin
  if v_sig is null then raise exception 'sol052_rollback_product_search_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  if position('SOL052_PUBLICATION_ELIGIBILITY_SEARCH_V2' in v_def) = 0 then return; end if;
  v_new :=
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
    '            where linked.product_id=p.id and linked.user_id=auth.uid()))))';
  v_old :=
    '    where p.product_kind<>''mapper_reference'' and p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '      and ((p.visibility=''shared'')' || E'\n' ||
    '        or p.owning_account_id=auth.uid() or p.created_by=auth.uid()' || E'\n' ||
    '        or exists(select 1 from public.product_ingest_events ev' || E'\n' ||
    '          where ev.product_id=p.id and ev.actor_user_id=auth.uid())' || E'\n' ||
    '        or exists(select 1 from public.customer_added_product_accounts linked' || E'\n' ||
    '          where linked.product_id=p.id and linked.user_id=auth.uid()))';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_search_anchor_missing'; end if;
  execute replace(v_def, v_new, v_old);
end;
$rollback_product_search$;

do $rollback_canonical_repoint$
declare
  v_sig regprocedure := to_regprocedure('public.canonicalize_ean_identity_v1(text,uuid)');
  v_def text;
  v_old text;
  v_new text;
begin
  if v_sig is null then raise exception 'sol052_rollback_canonicalize_missing'; end if;
  select pg_get_functiondef(v_sig) into v_def;
  if position('SOL052_PUBLICATION_ELIGIBILITY_CANONICAL_V2' in v_def) = 0 then return; end if;
  v_new :=
    '  -- SOL052_PUBLICATION_ELIGIBILITY_CANONICAL_V2' || E'\n' ||
    '  left join public.product_versions publication_version on publication_version.id=p.current_version_id' || E'\n' ||
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and p.product_kind = ''commercial_product'' and p.visibility = ''shared''' || E'\n' ||
    '    and coalesce(p.canonical_verification_status, '''') <> ''blocked''' || E'\n' ||
    '    and public.product_publication_identity_eligible_v1(publication_version.facts)' || E'\n' ||
    '    and coalesce(nullif(p.barcode_normalized,''''), nullif(p.ean_code_normalized,'''')) = v_ean;';
  v_old :=
    '  where p.is_active and p.merged_into_product_id is null' || E'\n' ||
    '    and p.product_kind = ''commercial_product'' and p.visibility = ''shared''' || E'\n' ||
    '    and coalesce(nullif(p.barcode_normalized,''''), nullif(p.ean_code_normalized,'''')) = v_ean;';
  if position(v_new in v_def) = 0 then raise exception 'sol052_rollback_canonical_anchor_missing'; end if;
  execute replace(v_def, v_new, v_old);
end;
$rollback_canonical_repoint$;

drop function if exists public.product_publication_identity_eligible_v1(jsonb);
drop function if exists public.product_publication_identity_normalize_v1(text);

commit;
