-- Owner contract: verification/provenance/confidence labels are information
-- only. This forward repair intentionally leaves the immutable Mapper dataset
-- untouched and supersedes the already-applied 143000 Verified-prefix gate.

select pg_advisory_xact_lock(hashtextextended('product-status-information-only-v1',0));

create temporary table mapper_status_information_guard on commit drop as
select count(*)::integer row_count,
  count(distinct ingredient_id)::integer id_count,
  encode(extensions.digest(string_agg(
    ingredient_id||'|'||verification_status||'|'||coalesce(data_confidence_percent::text,'')||'|'||
    verification_source||'|'||approved_for_base::text||'|'||approved_for_engines::text,
    E'\n' order by ingredient_id
  ),'sha256'),'hex') status_fingerprint
from public.mapper_basement where is_active;

create temporary table catalog_mapping_information_guard on commit drop as
select p.id product_id,p.current_version_id,b.mapper_ingredient_id,
  b.family_id,b.subfamily_id,b.form_id
from public.products p
join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
where p.product_kind<>'mapper_reference' and p.is_active
  and p.merged_into_product_id is null and b.mapper_ingredient_id is not null;

-- Technical-only Main is a restricted Owner Review capability, not a flag an
-- authenticated recipe writer may mint in product_composition. Keep the exact
-- template/version/line authority server-owned and unavailable through PostgREST.
create table if not exists public.owner_review_recipe_authorities(
  authority_id text not null,
  authority_version integer not null check(authority_version>0),
  technical_only_main_line_ids text[] not null check(cardinality(technical_only_main_line_ids)>0),
  active boolean not null default true,
  primary key(authority_id,authority_version)
);
alter table public.owner_review_recipe_authorities enable row level security;
revoke all on table public.owner_review_recipe_authorities from public,anon,authenticated;
insert into public.owner_review_recipe_authorities(
  authority_id,authority_version,technical_only_main_line_ids,active
) values
  ('fantasy-rocero-v1',1,array['fantasy-rocero-v1-base-7'],true),
  ('fantasy-raphaello-v1',1,array['fantasy-raphaello-v1-base-7','fantasy-raphaello-v1-base-8'],true),
  ('fantasy-kidi-bueno-v1',1,array['fantasy-kidi-bueno-v1-base-7'],true),
  ('fantasy-oreyo-v1',1,array['fantasy-oreyo-v1-base-7'],true),
  ('fantasy-knickers-v1',1,array['fantasy-knickers-v1-base-7'],true)
on conflict(authority_id,authority_version) do update
set technical_only_main_line_ids=excluded.technical_only_main_line_ids,
    active=excluded.active;

do $patch_search$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer)'::regprocedure
  );
  v_patched := v_definition;

  v_patched := replace(v_patched,
    '''pi_base''::text verification_method,''mapper''::text provenance,',
    'case when lower(coalesce(m.verification_status,'''')) like ''verified%'' then ''mapper_verified'' when lower(coalesce(m.verification_status,'''')) like ''%label review%'' then ''mapper_needs_label_review'' when lower(coalesce(m.verification_status,'''')) like ''estimated%'' or lower(coalesce(m.verification_status,'''')) like ''pi calculated%'' then ''mapper_estimated'' else ''mapper_other'' end::text verification_method,''mapper''::text provenance,'
  );
  v_patched := replace(v_patched,
    '(p.canonical_verification_status<>''blocked'' and m.ingredient_id is not null
        and m.is_active and m.approved_for_base and m.approved_for_engines
        and lower(coalesce(m.verification_status,'''')) like ''verified%'') usable_in_base,',
    '(coalesce(p.status,'''')<>''rejected'' and m.ingredient_id is not null and m.is_active and m.approved_for_base) usable_in_base,'
  );
  v_patched := replace(v_patched,
    'm.is_active and m.approved_for_base and m.approved_for_engines
        and lower(coalesce(m.verification_status,'''')) like ''verified%''',
    'm.is_active and coalesce(p.status,'''')<>''rejected'' and m.approved_for_base'
  );
  v_patched := replace(v_patched,
    'when e.context=''BASE'' and not (m.approved_for_base and m.approved_for_engines)',
    'when e.context=''BASE'' and not m.approved_for_base'
  );
  v_patched := replace(v_patched,
    'when e.context=''BASE'' and lower(coalesce(m.verification_status,'''')) not like ''verified%''
          then ''Wymaga weryfikacji Mapper''',
    ''
  );
  v_patched := replace(v_patched,
    'when e.context=''TOPPING'' and not (m.approved_for_base and m.approved_for_engines
          and lower(coalesce(m.verification_status,'''')) like ''verified%'')',
    'when e.context=''TOPPING'' and not m.approved_for_base'
  );
  v_patched := replace(v_patched,
    '+ case when lower(coalesce(m.verification_status,'''')) like ''verified%'' then 8 else -12 end',
    '+ 0'
  );
  v_patched := replace(v_patched,
    '''{}''::jsonb public_data,r.private_price,r.currency private_currency,',
    'jsonb_build_object(''verificationStatus'',m.verification_status,''sourceConfidence'',m.data_confidence_percent,''verificationSource'',m.verification_source,''approvedForBase'',m.approved_for_base,''approvedForEngines'',m.approved_for_engines,''lifecycleRejected'',coalesce(p.status,'''')=''rejected'') public_data,r.private_price,r.currency private_currency,'
  );
  v_patched := replace(v_patched,
    'p.canonical_verification_status<>''blocked'' and m.ingredient_id is not null',
    'coalesce(p.status,'''')<>''rejected'' and m.ingredient_id is not null'
  );
  v_patched := replace(v_patched,
    '(p.canonical_verification_status<>''blocked''
        and coalesce((b.profile_permissions->>''TOPPING'')::boolean,false)) usable_as_topping,',
    '((coalesce(p.status,'''')<>''rejected'' and m.ingredient_id is not null and m.is_active and m.approved_for_base)
        or (p.canonical_verification_status<>''blocked'' and coalesce((b.profile_permissions->>''TOPPING'')::boolean,false))) usable_as_topping,'
  );
  v_patched := replace(v_patched,
    'coalesce(v.facts->''public_data'',v.facts) public_data,r.private_price,r.currency private_currency,',
    '(coalesce(v.facts->''public_data'',v.facts)||jsonb_build_object(''lifecycleRejected'',coalesce(p.status,'''')=''rejected'',''approvedForBase'',coalesce(m.approved_for_base,false),''approvedForEngines'',coalesce(m.approved_for_engines,false))) public_data,r.private_price,r.currency private_currency,'
  );
  v_patched := replace(v_patched,
    'when e.context=''BASE'' and not c.usable_in_base then ''Brak aktualnego mapowania PINGÜINO Base''
        when e.context=''TOPPING'' and not c.usable_as_topping then ''Brak kompletnych danych Topping''',
    'when coalesce((c.public_data->>''lifecycleRejected'')::boolean,false) then ''product_rejected:''||c.id::text||'':''||coalesce(c.mapped_ingredient_id,''none'')||'':''||coalesce(c.current_version_id::text,''none'')||'':''||e.context
        when e.context=''BASE'' and not c.usable_in_base then ''approved_for_base_false:''||c.id::text||'':''||coalesce(c.mapped_ingredient_id,''none'')||'':''||coalesce(c.current_version_id::text,''none'')||'':BASE_RECIPE''
        when e.context=''TOPPING'' and not c.usable_as_topping then ''module_permission_missing:''||c.id::text||'':''||coalesce(c.mapped_ingredient_id,''none'')||'':''||coalesce(c.current_version_id::text,''none'')||'':TOPPING'''
  );
  v_patched := replace(v_patched,
    '(p.visibility=''shared'' and p.canonical_verification_status<>''blocked'')',
    '(p.visibility=''shared'')'
  );
  v_patched := replace(v_patched,
    '+ case when c.status=''verified'' then 4 else 0 end',
    '+ 0'
  );

  if v_patched=v_definition
    or strpos(v_patched,'Wymaga weryfikacji Mapper')>0
    or strpos(v_patched,'else -12 end')>0
    or strpos(v_patched,'mapper_estimated')=0
    or strpos(v_patched,'p.canonical_verification_status<>''blocked'' and m.ingredient_id is not null')>0
    or strpos(v_patched,'m.approved_for_base and m.approved_for_engines')>0
    or strpos(v_patched,'''lifecycleRejected''')=0
    or strpos(v_patched,'''product_rejected:''')=0 then
    raise exception 'search_products_v1 information-only patch drifted';
  end if;
  execute v_patched;
end;
$patch_search$;

do $patch_mapper_classifier$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.classify_mapper_product_behavior_v2(text,text)'::regprocedure
  );
  v_patched := replace(v_definition,
    '''BASE_RECIPE'',v_mapper.approved_for_base and v_mapper.approved_for_engines,',
    '''BASE_RECIPE'',v_mapper.approved_for_base,'
  );
  if v_patched=v_definition then
    raise exception 'Mapper classifier Base/Engine predicate drifted';
  end if;
  execute v_patched;
end;
$patch_mapper_classifier$;

do $patch_catalog_classifier$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_patched := v_definition;
  v_patched := replace(v_patched,
    'v_base boolean := false;',
    'v_base boolean := false;
  v_explicit_rejection boolean := false;'
  );
  v_patched := replace(v_patched,
    'and m.is_active and m.approved_for_base and m.approved_for_engines
    and lower(coalesce(m.verification_status,'''')) like ''verified%''',
    'and m.is_active'
  );
  v_patched := replace(v_patched,
    'v_base := v_product.canonical_verification_status<>''blocked'' and v_mapping is not null;',
    'v_explicit_rejection := coalesce(v_product.status,'''')=''rejected'' or exists(
    select 1 from public.product_behavior_bindings rejection_binding
    where rejection_binding.id=v_product.current_behavior_binding_id
      and rejection_binding.product_id=v_product.id
      and rejection_binding.product_version_id=v_version.id
      and ''product_rejected''=any(coalesce(rejection_binding.block_reasons,''{}''::text[]))
  );
  v_base := not v_explicit_rejection and v_mapping is not null and exists(select 1 from public.mapper_basement m where m.ingredient_id=v_mapping and m.is_active and m.approved_for_base);'
  );
  v_patched := replace(v_patched,
    'v_topping := v_product.canonical_verification_status<>''blocked''
    and nullif(trim(coalesce(v_public_data->>''ingredientsText'','''')),'''''') is not null
    and nullif(trim(coalesce(v_public_data->>''allergensText'','''')),'''''') is not null
    and jsonb_typeof(v_public_data->''nutrition'')=''object'';',
    'v_topping := not v_explicit_rejection and (v_mapping is not null or (v_product.canonical_verification_status<>''blocked''
    and nullif(trim(coalesce(v_public_data->>''ingredientsText'','''')),'''''') is not null
    and nullif(trim(coalesce(v_public_data->>''allergensText'','''')),'''''') is not null
    and jsonb_typeof(v_public_data->''nutrition'')=''object''));'
  );
  v_patched := replace(v_patched,
    'case when v_mapping is null then ''base_technical_authority_missing'' end',
    'case when v_mapping is null then ''base_technical_authority_missing'' end,
    case when v_explicit_rejection then ''product_rejected'' end'
  );
  v_patched := replace(v_patched,
    '''SEARCH'',v_product.canonical_verification_status<>''blocked'',',
    '''SEARCH'',not v_explicit_rejection,'
  );
  v_patched := replace(v_patched,
    '''MAIN'',v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC''),',
    '''MAIN'',not v_explicit_rejection and v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC''),'
  );
  v_patched := replace(v_patched,
    '''OPTIMAL'',v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC''),',
    '''OPTIMAL'',not v_explicit_rejection and v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC''),'
  );
  v_patched := replace(v_patched,
    '''ECO'',v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC''),',
    '''ECO'',not v_explicit_rejection and v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC''),'
  );
  v_patched := replace(v_patched,
    '''TOPPING'',v_topping,''SUBSTITUTION'',v_base,''COST'',true,''MONITOR'',v_base,',
    '''TOPPING'',v_topping,''SUBSTITUTION'',v_base,''COST'',not v_explicit_rejection,''MONITOR'',v_base,'
  );
  v_patched := replace(v_patched,
    'case when v_product.canonical_verification_status=''blocked'' then ''blocked'' else ''ready'' end,',
    'case when v_explicit_rejection then ''blocked'' else ''ready'' end,'
  );
  if v_patched=v_definition
    or strpos(v_patched,'lower(coalesce(m.verification_status')>0
    or strpos(v_patched,'v_base := not v_explicit_rejection and v_mapping is not null and exists')=0
    or strpos(v_patched,'coalesce(v_product.status,'''')=''rejected'' or exists')=0 then
    raise exception 'catalog classifier information-only patch drifted';
  end if;
  execute v_patched;
end;
$patch_catalog_classifier$;

do $patch_ingest_mapper_decision$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(v_definition,
    'and m.is_active and m.approved_for_base and m.approved_for_engines
        and lower(coalesce(m.verification_status,'''')) like ''verified%''',
    'and m.is_active'
  );
  v_patched := replace(v_patched,
    'Mapper authorization target is not active, approved and verified',
    'Mapper authorization target is not active'
  );
  if v_patched=v_definition
    or strpos(v_patched,'approved and verified')>0
    or strpos(v_patched,'and m.is_active and m.approved_for_base and m.approved_for_engines')>0 then
    raise exception 'ingest Mapper decision information-only patch drifted';
  end if;
  execute v_patched;
end;
$patch_ingest_mapper_decision$;

do $patch_resolver$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.resolve_product_behavior_v1(text,text,jsonb)'::regprocedure
  );
  v_patched := v_definition;
  v_patched := replace(v_patched,
    'v_mapper_reference_price jsonb;
  v_allowed boolean := false;',
    'v_mapper_reference_price jsonb;
  v_mapper_recommended_dose jsonb;
  v_mapper_verification_status text;
  v_mapper_base_approved boolean := false;
  v_mapper_engine_approved boolean := false;
  v_missing_technical_fields text[] := ''{}''::text[];
  v_engine_allowed boolean := false;
  v_product_lifecycle_status text;
  v_explicit_rejection boolean := false;
  v_allowed boolean := false;'
  );
  v_patched := replace(v_patched,
    '(p.visibility=''shared'' and p.canonical_verification_status<>''blocked'')
        or p.owning_account_id=auth.uid()',
    '(p.visibility=''shared'' and (p.canonical_verification_status<>''blocked'' or b.mapper_ingredient_id is not null))
        or p.owning_account_id=auth.uid()'
  );
  v_patched := replace(v_patched,
    'and b.mapper_ingredient_id=p_entity_id
      and m.is_active and m.approved_for_base;
    v_status := ''pi_base''; v_source := ''mapper'';',
    'and b.mapper_ingredient_id=p_entity_id
      and m.is_active;
    select m.verification_status,
      case when lower(coalesce(m.verification_status,'''')) like ''verified%'' then ''verified''
        when lower(coalesce(m.verification_status,'''')) like ''%label review%'' then ''needs_label_review''
        when lower(coalesce(m.verification_status,'''')) like ''estimated%'' or lower(coalesce(m.verification_status,'''')) like ''pi calculated%'' then ''estimated''
        else ''manual_unverified'' end
    into v_mapper_verification_status,v_status
    from public.mapper_basement m where m.ingredient_id=p_entity_id and m.is_active;
    v_source := ''mapper'';'
  );
  v_patched := replace(v_patched,
    'from public.mapper_basement m
    where m.ingredient_id=v_mapping and m.is_active
      and m.approved_for_base and m.approved_for_engines;',
    'from public.mapper_basement m
    where m.ingredient_id=v_mapping and m.is_active
      and m.approved_for_engines;'
  );
  v_patched := replace(v_patched,
    ') else null end into v_mapper_composition,v_mapper_reference_price
    from public.mapper_basement m',
    ') else null end,
    case when m.recommended_dosage_percent_min is not null
          or m.recommended_dosage_percent_max is not null then jsonb_build_object(
      ''minPercent'',m.recommended_dosage_percent_min,
      ''maxPercent'',m.recommended_dosage_percent_max,
      ''sourceVersion'',m.dataset_version||'':''||m.ingredient_id
    ) else null end into v_mapper_composition,v_mapper_reference_price,v_mapper_recommended_dose
    from public.mapper_basement m'
  );
  v_patched := replace(v_patched,
    'else v_mapper_reference_price
      end
    );',
    'else v_mapper_reference_price
      end,
      ''recommendedDose'',v_mapper_recommended_dose
    );'
  );
  v_patched := replace(v_patched,
    ') else null end
    );
  end if;

  select jsonb_build_object(',
    ') else null end,
      ''recommendedDose'',v_mapper_recommended_dose
    );
  end if;

  select jsonb_build_object('
  );
  v_patched := replace(v_patched,
    'v_profile_allowed := case',
    'select m.verification_status,m.approved_for_base,m.approved_for_engines,
      array_remove(array[
        case when m.water_percent is null or m.water_percent<0 then ''water_percent'' end,
        case when m.total_solids_percent is null or m.total_solids_percent<0 then ''total_solids_percent'' end,
        case when m.fat_percent is null or m.fat_percent<0 then ''fat_percent'' end,
        case when m.protein_percent is null or m.protein_percent<0 then ''protein_percent'' end,
        case when m.carbohydrate_percent is null or m.carbohydrate_percent<0 then ''carbohydrate_percent'' end,
        case when m.total_sugars_percent is null or m.total_sugars_percent<0 then ''total_sugars_percent'' end,
        case when m.salt_percent is null or m.salt_percent<0 then ''salt_percent'' end,
        case when m.pod_value is null or m.pod_value<0 then ''pod_value'' end,
        case when m.pac_value is null or m.pac_value<0 then ''pac_value'' end
      ],null)
    into v_mapper_verification_status,v_mapper_base_approved,v_mapper_engine_approved,
      v_missing_technical_fields
    from public.mapper_basement m where m.ingredient_id=v_mapping and m.is_active;

  select p.status into v_product_lifecycle_status
  from public.products p where p.id=v_product_id;
  v_explicit_rejection := coalesce(v_product_lifecycle_status,'''')=''rejected''
    or ''product_rejected''=any(coalesce(v_blocks,''{}''::text[]));

  v_profile_allowed := case'
  );
  v_patched := replace(v_patched,
    'v_base_allowed := v_status<>''blocked''
    and v_scope=''BASE_FORMULATION''',
    'v_base_allowed := not v_explicit_rejection and v_scope=''BASE_FORMULATION'''
  );
  v_patched := replace(v_patched,
    'and v_mapping is not null;
  v_topping_allowed :=',
    'and v_mapping is not null;
  v_engine_allowed := v_base_allowed and coalesce(v_mapper_engine_approved,false)
    and cardinality(coalesce(v_missing_technical_fields,''{}''::text[]))=0;
  v_topping_allowed :='
  );
  v_patched := replace(v_patched,
    'v_topping_allowed := v_status<>''blocked''
    and v_scope=''POST_PROCESS_ADDON''
    and coalesce((v_permissions->>''TOPPING'')::boolean,false);',
    'v_topping_allowed := not v_explicit_rejection and v_scope=''POST_PROCESS_ADDON''
    and (v_mapping is not null or v_status<>''blocked'')
    and coalesce((v_permissions->>''TOPPING'')::boolean,false);'
  );
  v_patched := replace(v_patched,
    '''SEARCH'',case when v_status=''blocked'' then ''blocked'' else ''eligible'' end,',
    '''SEARCH'',case when v_mapping is not null or v_status<>''blocked'' then ''eligible'' else ''blocked'' end,'
  );
  v_patched := replace(v_patched,
    '''MAIN'',case when v_base_allowed and v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC'')
      and v_policy.id is not null and not v_policy_ambiguous and v_has_process then ''eligible'' else ''blocked'' end,',
    '''MAIN'',case when v_engine_allowed and v_main in (''MAIN_ALLOWED'',''MAIN_PROFILE_SPECIFIC'')
      and v_policy.id is not null and not v_policy_ambiguous then ''eligible'' else ''blocked'' end,'
  );
  v_patched := replace(v_patched,
    '''OPTIMAL'',case when v_base_allowed then ''eligible'' else ''blocked'' end,',
    '''OPTIMAL'',case when v_engine_allowed then ''eligible'' else ''blocked'' end,'
  );
  v_patched := replace(v_patched,
    '''ECO'',case when v_base_allowed then ''eligible'' else ''blocked'' end,',
    '''ECO'',case when v_engine_allowed then ''eligible'' else ''blocked'' end,'
  );
  v_patched := replace(v_patched,
    '''SUBSTITUTION'',case when v_base_allowed and coalesce((v_permissions->>''SUBSTITUTION'')::boolean,false)',
    '''SUBSTITUTION'',case when v_engine_allowed and coalesce((v_permissions->>''SUBSTITUTION'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''COST'',case when v_status<>''blocked'' and coalesce((v_permissions->>''COST'')::boolean,false)',
    '''COST'',case when (v_mapping is not null or v_status<>''blocked'') and coalesce((v_permissions->>''COST'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''MONITOR'',case when v_status<>''blocked'' and coalesce((v_permissions->>''MONITOR'')::boolean,false)',
    '''MONITOR'',case when v_engine_allowed and coalesce((v_permissions->>''MONITOR'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''PRODUCTION'',case when v_status<>''blocked'' and (v_base_allowed or v_topping_allowed)',
    '''PRODUCTION'',case when (v_topping_allowed or (v_engine_allowed and v_has_process))'
  );
  v_patched := replace(v_patched,
    'then case when v_base_allowed then ''eligible'' else ''label_only'' end else ''blocked'' end,',
    'then case when v_engine_allowed then ''eligible'' else ''label_only'' end else ''blocked'' end,'
  );
  v_patched := replace(v_patched,
    '''LABEL'',case when v_status<>''blocked'' and coalesce((v_permissions->>''LABEL'')::boolean,false)',
    '''LABEL'',case when (v_mapping is not null or v_status<>''blocked'') and coalesce((v_permissions->>''LABEL'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''NUTRITION'',case when v_status<>''blocked'' and coalesce((v_permissions->>''NUTRITION'')::boolean,false)',
    '''NUTRITION'',case when (v_mapping is not null or v_status<>''blocked'') and coalesce((v_permissions->>''NUTRITION'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''ALLERGENS'',case when v_status<>''blocked'' and coalesce((v_permissions->>''LABEL'')::boolean,false)',
    '''ALLERGENS'',case when (v_mapping is not null or v_status<>''blocked'') and coalesce((v_permissions->>''LABEL'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''PROCESS'',case when v_status<>''blocked'' and (v_base_allowed or v_topping_allowed) and v_has_process',
    '''PROCESS'',case when (v_engine_allowed or v_topping_allowed) and v_has_process'
  );
  v_patched := replace(v_patched,
    '''SUMMARY'',case when v_status<>''blocked'' and (v_base_allowed or v_topping_allowed)',
    '''SUMMARY'',case when (v_engine_allowed or v_topping_allowed)'
  );
  v_patched := replace(v_patched,
    '''BATCH_RESCUE'',case when v_base_allowed then ''eligible'' else ''blocked'' end,',
    '''BATCH_RESCUE'',case when v_engine_allowed then ''eligible'' else ''blocked'' end,'
  );
  v_patched := replace(v_patched,
    '''MASTER_LABEL'',case when v_status<>''blocked'' and coalesce((v_permissions->>''LABEL'')::boolean,false)',
    '''MASTER_LABEL'',case when (v_mapping is not null or v_status<>''blocked'') and coalesce((v_permissions->>''LABEL'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''RECIPE_VERSION'',case when v_status<>''blocked'' and (v_base_allowed or v_topping_allowed)',
    '''RECIPE_VERSION'',case when (v_engine_allowed or v_topping_allowed)'
  );
  v_patched := replace(v_patched,
    '''RESTORE'',case when v_status<>''blocked'' and (v_base_allowed or v_topping_allowed)',
    '''RESTORE'',case when (v_engine_allowed or v_topping_allowed)'
  );
  v_patched := replace(v_patched,
    '''EXPORT'',case when v_status<>''blocked'' and coalesce((v_permissions->>''LABEL'')::boolean,false)',
    '''EXPORT'',case when (v_mapping is not null or v_status<>''blocked'') and coalesce((v_permissions->>''LABEL'')::boolean,false)'
  );
  v_patched := replace(v_patched,
    '''SAVE'',case when v_status<>''blocked'' and (v_base_allowed or v_topping_allowed)',
    '''SAVE'',case when (v_engine_allowed or v_topping_allowed)'
  );
  v_patched := replace(v_patched,
    'v_allowed := coalesce(v_module_eligibility->>v_module,''blocked'') in (''eligible'',''label_only'');',
    'if v_explicit_rejection then
    v_module_eligibility := (select jsonb_object_agg(key,''blocked'') from jsonb_each(v_module_eligibility));
  end if;
  v_allowed := coalesce(v_module_eligibility->>v_module,''blocked'') in (''eligible'',''label_only'');'
  );
  v_patched := replace(v_patched,
    'v_facts_fingerprint:=public.product_behavior_entity_fingerprint_v1(p_entity_kind,p_entity_id);

  if v_binding_id is null then',
    'v_facts_fingerprint:=public.product_behavior_entity_fingerprint_v1(p_entity_kind,p_entity_id);

  -- Recover exact public identity fields even when the current binding itself
  -- is absent, so terminal feedback never substitutes an entity-kind token for
  -- the actual product/version/Mapper identity.
  if v_binding_id is null and p_entity_kind=''catalog_product_version'' then
    select v.product_id,v.id,p.matched_basement_id
    into v_product_id,v_version_id,v_mapping
    from public.product_versions v join public.products p on p.id=v.product_id
    where v.id=p_entity_id::uuid
      and p.is_active and p.merged_into_product_id is null
      and (p.visibility=''shared'' or p.owning_account_id=auth.uid()
        or p.owner_user_id=auth.uid() or p.created_by=auth.uid()
        or exists(select 1 from public.admin_users a
          where a.user_id=auth.uid() and a.revoked_at is null))
    limit 1;
  elsif v_binding_id is null and p_entity_kind=''mapper'' then
    select p.id,p.current_version_id,p.matched_basement_id
    into v_product_id,v_version_id,v_mapping
    from public.products p
    where p.product_kind=''mapper_reference'' and p.visibility=''shared''
      and p.normalized_identity=''mapper:''||p_entity_id
    limit 1;
    v_mapping:=coalesce(v_mapping,p_entity_id);
  end if;

  if v_binding_id is null then'
  );
  v_patched := replace(v_patched,
    '''state'',''blocked'',''module'',v_module,''reasons'',jsonb_build_array(''behavior_binding_missing'')',
    '''state'',''blocked'',''module'',v_module,
      ''reasons'',jsonb_build_array(''behavior_binding_missing:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,p_entity_id)||'':''||v_module||'':refresh_product_data''),
      ''blockReasons'',jsonb_build_array(''behavior_binding_missing:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,p_entity_id)||'':''||v_module||'':refresh_product_data'')'
  );
  v_patched := replace(v_patched,
    'then ''classification_failed'' else ''classification_pending'' end',
    'then ''classification_failed:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':retry_classification''
        else ''classification_pending:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':wait_for_classification'' end'
  );
  v_patched := replace(v_patched,
    '''catalogStatus'',v_status,
    ''provenance'',v_source,',
    '''catalogStatus'',v_status,
    ''mapperVerificationStatus'',v_mapper_verification_status,
    ''provenance'',v_source,'
  );
  v_patched := replace(v_patched,
    'coalesce(v_blocks,''{}''::text[]) ||
      case when v_allowed then ''{}''::text[] else array[''context_not_approved''] end,',
    'array_remove(array_remove(coalesce(v_blocks,''{}''::text[]),''context_not_approved''),''requested_module_not_eligible'') ||
      case when v_allowed then ''{}''::text[] else array_remove(array[
        case when v_explicit_rejection
          then ''product_rejected:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':contact_owner'' end,
        case when v_scope=''BASE_FORMULATION'' and not coalesce(v_mapper_base_approved,false)
          then ''approved_for_base_false:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':choose_base_approved_product'' end,
        case when v_scope=''BASE_FORMULATION'' and coalesce(v_mapper_base_approved,false)
          and not coalesce(v_mapper_engine_approved,false) and v_module<>''BASE_RECIPE''
          then ''approved_for_engines_false:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':choose_engine_approved_product'' end,
        case when v_scope=''BASE_FORMULATION'' and coalesce(v_mapper_engine_approved,false)
          and cardinality(coalesce(v_missing_technical_fields,''{}''::text[]))>0
          then ''missing_technical_fields:''||array_to_string(v_missing_technical_fields,'','')||'':''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':complete_technical_fields'' end,
        case when v_module in (''PROCESS'',''PRODUCTION'') and v_scope=''BASE_FORMULATION'' and not v_has_process
          then ''process_evidence_unknown:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':add_process_evidence'' end,
        case when v_scope=''BASE_FORMULATION'' and v_mapping is null
          then ''mapper_mapping_missing:''||coalesce(v_product_id::text,p_entity_id)||'':none:''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':select_exact_mapper_binding'' end,
        case when v_scope=''BASE_FORMULATION'' and not v_profile_allowed
          then ''profile_not_approved:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':change_profile_or_product'' end,
        case when v_role_request=''MAIN''
          and coalesce(v_module_eligibility->>''MAIN'',''blocked'')<>''eligible''
          then ''main_policy_not_approved:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':use_standard_or_approved_main'' end,
        case when (
          (v_module=''BASE_RECIPE'' and not coalesce((v_permissions->>''BASE_RECIPE'')::boolean,false))
          or (v_module=''TOPPING'' and not coalesce((v_permissions->>''TOPPING'')::boolean,false))
          or (v_module=''SUBSTITUTION'' and not coalesce((v_permissions->>''SUBSTITUTION'')::boolean,false))
          or (v_module=''COST'' and not coalesce((v_permissions->>''COST'')::boolean,false))
          or (v_module=''MONITOR'' and not coalesce((v_permissions->>''MONITOR'')::boolean,false))
          or (v_module in (''LABEL'',''ALLERGENS'',''MASTER_LABEL'',''EXPORT'')
            and not coalesce((v_permissions->>''LABEL'')::boolean,false))
          or (v_module=''NUTRITION'' and not coalesce((v_permissions->>''NUTRITION'')::boolean,false))
        ) then ''module_permission_missing:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':choose_module_eligible_product'' end,
        case when v_module in (''NUTRITION'',''MASTER_LABEL'') and not v_has_nutrition
          then ''nutrition_facts_missing:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':complete_label_nutrition'' end,
        case when v_module in (''LABEL'',''ALLERGENS'',''MASTER_LABEL'') and not v_has_allergens
          then ''allergen_facts_missing:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':complete_allergen_facts'' end,
        case when not (
          v_explicit_rejection
          or (v_scope=''BASE_FORMULATION'' and not coalesce(v_mapper_base_approved,false))
          or (v_scope=''BASE_FORMULATION'' and coalesce(v_mapper_base_approved,false)
            and not coalesce(v_mapper_engine_approved,false) and v_module<>''BASE_RECIPE'')
          or (v_scope=''BASE_FORMULATION'' and coalesce(v_mapper_engine_approved,false)
            and cardinality(coalesce(v_missing_technical_fields,''{}''::text[]))>0)
          or (v_module in (''PROCESS'',''PRODUCTION'') and v_scope=''BASE_FORMULATION'' and not v_has_process)
          or (v_scope=''BASE_FORMULATION'' and v_mapping is null)
          or (v_scope=''BASE_FORMULATION'' and not v_profile_allowed)
          or (v_role_request=''MAIN'' and coalesce(v_module_eligibility->>''MAIN'',''blocked'')<>''eligible'')
          or (v_module=''BASE_RECIPE'' and not coalesce((v_permissions->>''BASE_RECIPE'')::boolean,false))
          or (v_module=''TOPPING'' and not coalesce((v_permissions->>''TOPPING'')::boolean,false))
          or (v_module=''SUBSTITUTION'' and not coalesce((v_permissions->>''SUBSTITUTION'')::boolean,false))
          or (v_module=''COST'' and not coalesce((v_permissions->>''COST'')::boolean,false))
          or (v_module=''MONITOR'' and not coalesce((v_permissions->>''MONITOR'')::boolean,false))
          or (v_module in (''LABEL'',''ALLERGENS'',''MASTER_LABEL'',''EXPORT'')
            and not coalesce((v_permissions->>''LABEL'')::boolean,false))
          or (v_module=''NUTRITION'' and not coalesce((v_permissions->>''NUTRITION'')::boolean,false))
          or (v_module in (''NUTRITION'',''MASTER_LABEL'') and not v_has_nutrition)
          or (v_module in (''LABEL'',''ALLERGENS'',''MASTER_LABEL'') and not v_has_allergens)
        ) then ''module_not_eligible:''||coalesce(v_product_id::text,p_entity_id)||'':''||coalesce(v_mapping,''none'')||'':''||coalesce(v_version_id::text,''none'')||'':''||v_module||'':return_to_recipe'' end
      ],null) end,'
  );

  if v_patched=v_definition
    or strpos(v_patched,'v_engine_allowed boolean')=0
    or strpos(v_patched,'mapperVerificationStatus')=0
    or strpos(v_patched,'recommendedDose')=0
    or strpos(v_patched,'or b.mapper_ingredient_id is not null')=0
    or strpos(v_patched,'v_topping_allowed := v_status<>''blocked''')>0
    or strpos(v_patched,'''SAVE'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''PRODUCTION'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''COST'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''LABEL'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''NUTRITION'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''ALLERGENS'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''PROCESS'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''MASTER_LABEL'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''EXPORT'',case when v_status<>''blocked''')>0
    or strpos(v_patched,'''PRODUCTION'',case when (v_topping_allowed or (v_engine_allowed and v_has_process))')=0
    or strpos(v_patched,'case when v_allowed then ''{}''::text[] else array[''context_not_approved''] end')>0
    or strpos(v_patched,'''module_not_eligible:''')=0
    or strpos(v_patched,'''product_rejected:''')=0
    or strpos(v_patched,'''behavior_binding_missing:''')=0
    or strpos(v_patched,'Recover exact public identity fields')=0
    or strpos(v_patched,'''classification_pending:''')=0
    or strpos(v_patched,'and v_policy.id is not null and not v_policy_ambiguous and v_has_process')>0 then
    raise exception 'resolver information-only patch drifted';
  end if;
  execute v_patched;
end;
$patch_resolver$;

-- Preserve the resolver's exact, structured technical reason at every server
-- validation seam. The former validator collapsed all failures into the
-- provenance-like `requested_module_not_eligible` token.
do $patch_recipe_validator$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.validate_recipe_behavior_v1(jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(v_definition,
    'v_reasons text[];
  v_rows jsonb',
    'v_reasons text[];
  v_resolver_reasons text[];
  v_rows jsonb'
  );
  v_patched := replace(v_patched,
    'if coalesce(v_resolved->>''state'',''blocked'')<>''eligible'' then
      v_reasons := array_append(v_reasons,''requested_module_not_eligible'');
    end if;
    if coalesce(v_resolved->''reasons'',''[]''::jsonb) ? ''classification_pending''
      or coalesce(v_resolved->''blockReasons'',''[]''::jsonb) ? ''classification_pending'' then
      v_reasons := array_append(v_reasons,''classification_pending'');
    end if;
    if coalesce(v_resolved->''reasons'',''[]''::jsonb) ? ''classification_failed''
      or coalesce(v_resolved->''blockReasons'',''[]''::jsonb) ? ''classification_failed'' then
      v_reasons := array_append(v_reasons,''classification_failed'');
    end if;',
    'if coalesce(v_resolved->>''state'',''blocked'')<>''eligible'' then
      select coalesce(array_agg(distinct reason order by reason),''{}''::text[])
      into v_resolver_reasons
      from (
        select value reason from jsonb_array_elements_text(coalesce(v_resolved->''reasons'',''[]''::jsonb))
        union all
        select value reason from jsonb_array_elements_text(coalesce(v_resolved->''blockReasons'',''[]''::jsonb))
      ) exact_reasons
      where reason not in (''context_not_approved'',''requested_module_not_eligible'');
      if cardinality(v_resolver_reasons)=0 then
        v_resolver_reasons:=array[''module_not_eligible:''||
          coalesce(v_resolved->>''productId'',v_line->>''productId'',v_line->>''entityId'')||'':''||
          coalesce(v_resolved->>''mapperIngredientId'',v_line->>''mapperIngredientId'',''none'')||'':''||
          coalesce(v_resolved->>''productVersionId'',v_line->>''productVersionId'',''none'')||'':''||
          v_module||'':return_to_recipe''];
      end if;
      v_reasons:=v_reasons||v_resolver_reasons;
    end if;'
  );
  if v_patched=v_definition
    or strpos(v_patched,'v_reasons := array_append(v_reasons,''requested_module_not_eligible'')')>0
    or strpos(v_patched,'jsonb_array_elements_text(coalesce(v_resolved->''blockReasons''')=0 then
    raise exception 'recipe validator exact-reason patch drifted';
  end if;
  execute v_patched;
end;
$patch_recipe_validator$;

-- Terminal recipe/version/Production writes must honor the same Owner Review
-- technical-only Main contract as Preview/Apply, and must match the Engine's
-- documented zero-default semantics for optional Mapper components.
do $patch_recipe_terminal_authority$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.assert_recipe_behavior_authority_v1(jsonb,jsonb,text)'::regprocedure
  );
  v_patched := replace(v_definition,
    'v_snapshots jsonb:=coalesce(p_product_composition->''behaviorSnapshots'',''{}''::jsonb);',
    'v_snapshots jsonb:=coalesce(p_product_composition->''behaviorSnapshots'',''{}''::jsonb);
  v_owner_review_gate jsonb:=coalesce(p_product_composition->''ownerReviewGate'',''{}''::jsonb);
  v_technical_main_ids jsonb:=coalesce(p_product_composition#>''{ownerReviewGate,technicalOnlyMainLineIds}'',''[]''::jsonb);
  v_authoritative_main_ids text[];
  v_supplied_main_ids text[];'
  );
  v_patched := replace(v_patched,
    'if auth.uid() is null then raise exception ''authentication required''; end if;
  if jsonb_typeof(p_recipe_input)',
    'if auth.uid() is null then raise exception ''authentication required''; end if;
  if v_owner_review_gate<>''{}''::jsonb then
    if v_owner_review_gate->>''status''<>''OWNER_REVIEW_EDITABLE''
      or v_owner_review_gate->>''productionStatus''<>''PRODUCTION_BLOCKED''
      or v_owner_review_gate->>''labelStatus''<>''LABEL_BLOCKED''
      or coalesce(v_owner_review_gate->>''authorityId'','''')=''''
      or coalesce(v_owner_review_gate->>''authorityVersion'','''')!~''^[1-9][0-9]*$''
      or jsonb_typeof(v_technical_main_ids)<>''array''
      or not exists(select 1 from public.admin_users a
        where a.user_id=auth.uid() and a.revoked_at is null) then
      raise exception ''invalid or unauthorized Owner Review authority'';
    end if;
    select a.technical_only_main_line_ids into v_authoritative_main_ids
    from public.owner_review_recipe_authorities a
    where a.authority_id=v_owner_review_gate->>''authorityId''
      and a.authority_version=(v_owner_review_gate->>''authorityVersion'')::integer
      and a.active;
    if v_authoritative_main_ids is null then
      raise exception ''Owner Review authority is not registered'';
    end if;
    select array_agg(value order by value) into v_supplied_main_ids
    from jsonb_array_elements_text(v_technical_main_ids);
    select array_agg(value order by value) into v_authoritative_main_ids
    from unnest(v_authoritative_main_ids) value;
    if v_supplied_main_ids is distinct from v_authoritative_main_ids
      or exists(
        select 1 from unnest(v_authoritative_main_ids) required_id
        where not exists(
          select 1 from jsonb_array_elements(coalesce(p_recipe_input->''items'',''[]''::jsonb)) item
          where item->>''id''=required_id and item->>''lock_type''=''main''
        )
      ) then
      raise exception ''Owner Review technical Main lines do not match server authority'';
    end if;
    if p_module=''PRODUCTION'' then
      raise exception ''owner review recipe is explicitly blocked for Production'';
    end if;
  end if;
  if jsonb_typeof(p_recipe_input)'
  );
  v_patched := replace(v_patched,
    'if v_expected is null or jsonb_typeof(v_expected)=''null'' then
          if v_actual is not null and jsonb_typeof(v_actual)<>''null'' then
            raise exception ''recipe technical fact % is stale for %'',v_pair.ingredient_key,v_line_id;
          end if;',
    'if v_expected is null or jsonb_typeof(v_expected)=''null'' then
          if v_actual is not null and jsonb_typeof(v_actual)<>''null''
            and not (v_pair.fact_key in (''sucrose'',''glucose'',''dextrose'',''fructose'',''lactose'',''polyols'',''fibre'',''alcohol'',''energyKcal'')
              and jsonb_typeof(v_actual)=''number'' and (v_actual#>>''{}'')::numeric=0) then
            raise exception ''recipe technical fact % is stale for %'',v_pair.ingredient_key,v_line_id;
          end if;'
  );
  v_patched := replace(v_patched,
    'v_role:=case when v_scope=''BASE_FORMULATION'' and v_item->>''lock_type''=''main''
      then ''MAIN'' else ''STANDARD'' end;',
    'v_role:=case when v_scope=''BASE_FORMULATION'' and v_item->>''lock_type''=''main''
      and not (v_technical_main_ids ? v_line_id)
      then ''MAIN'' else ''STANDARD'' end;'
  );
  if v_patched=v_definition
    or strpos(v_patched,'v_technical_main_ids ? v_line_id')=0
    or strpos(v_patched,'v_pair.fact_key in (''sucrose''')=0
    or strpos(v_patched,'owner review recipe is explicitly blocked for Production')=0
    or strpos(v_patched,'owner_review_recipe_authorities')=0
    or strpos(v_patched,'invalid or unauthorized Owner Review authority')=0 then
    raise exception 'recipe terminal authority patch drifted';
  end if;
  execute v_patched;
end;
$patch_recipe_terminal_authority$;

-- Legacy saved references may resolve through an exact active mapping regardless
-- of provenance labels, while an explicit lifecycle rejection remains blocked.
do $patch_legacy_recipe_resolver$
declare v_definition text; v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.resolve_legacy_recipe_behavior_v1(jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(v_definition,
    '(p.visibility=''shared'' and p.canonical_verification_status<>''blocked'')',
    '(p.visibility=''shared'' and coalesce(p.status,'''')<>''rejected'')'
  );
  v_patched := replace(v_patched,
    '''blockReasons'',jsonb_build_array(''legacy_product_reference_unresolved'')',
    '''entityKind'',case when coalesce(p_reference->>''mapperIngredientId'',p_reference->>''canonicalIdentity'','''') like ''PI-ING-%'' then ''mapper'' else ''catalog_product_version'' end,
      ''entityId'',coalesce(p_reference->>''mapperIngredientId'',p_reference->>''canonicalIdentity'',p_reference->>''productVersionId'',p_reference->>''productId'',''unresolved''),
      ''productId'',coalesce(p_reference->>''productId'',''unresolved''),
      ''productVersionId'',coalesce(p_reference->>''productVersionId'',''unresolved''),
      ''mapperIngredientId'',coalesce(p_reference->>''mapperIngredientId'',p_reference->>''canonicalIdentity''),
      ''blockReasons'',jsonb_build_array(''legacy_product_reference_unresolved:''||coalesce(p_reference->>''productId'',''none'')||'':''||coalesce(p_reference->>''mapperIngredientId'',p_reference->>''canonicalIdentity'',''none'')||'':''||coalesce(p_reference->>''productVersionId'',''none'')||'':''||coalesce(p_context->>''module'',''SEARCH'')||'':repair_legacy_reference'')'
  );
  if v_patched=v_definition
    or strpos(v_patched,'p.canonical_verification_status<>''blocked''')>0
    or strpos(v_patched,'coalesce(p.status,'''')<>''rejected''')=0
    or strpos(v_patched,'legacy_product_reference_unresolved:''')=0 then
    raise exception 'legacy recipe resolver information-only patch drifted';
  end if;
  execute v_patched;
end;
$patch_legacy_recipe_resolver$;

-- Rebuild canonical Mapper behavior with the new Base/Engine split. A new
-- classifier version guarantees an append-only current binding rather than an
-- ON CONFLICT reuse of a historical interpretation.
do $reclassify_mapper$
declare v_id text;
begin
  for v_id in select ingredient_id from public.mapper_basement where is_active order by ingredient_id loop
    perform public.classify_mapper_product_behavior_v2(v_id,'product-status-information-only-v1');
  end loop;
end;
$reclassify_mapper$;

-- Restore exact, administrator-evidence-backed commercial mappings even when
-- the target provenance is Estimated. Form/identity is never inferred here.
do $restore_exact_catalog_bindings$
declare v_row record; v_provisional_binding uuid;
begin
  for v_row in
    select p.id product_id,p.current_version_id,p.current_behavior_binding_id,
      p.matched_basement_id mapper_ingredient_id,b.form_id prior_form_id,
      mb.form_id mapper_form_id
    from public.products p
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    join public.mapper_basement m on m.ingredient_id=p.matched_basement_id and m.is_active
    join public.mapper_product_behavior_bindings mb
      on mb.mapper_ingredient_id=p.matched_basement_id and mb.is_current
    where p.product_kind<>'mapper_reference' and p.is_active and p.merged_into_product_id is null
      and coalesce(p.status,'')<>'rejected'
      and p.mapper_status='matched' and p.matched_basement_id is not null
      and b.mapper_ingredient_id is null
      and (b.form_id is null or b.form_id is not distinct from mb.form_id)
      and exists(
        select 1 from public.product_evidence e
        where e.product_id=p.id and e.product_version_id=p.current_version_id
          and e.evidence_kind='admin_mapper_decision'
          and e.evidence#>>'{mapperDecision,mapperIngredientId}'=p.matched_basement_id
      )
    order by p.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'product-behavior:catalog_product_version:'||v_row.current_version_id::text,0
    ));
    perform set_config('app.canonical_product_ingest','v1',true);
    update public.product_behavior_bindings set is_current=false
    where id=v_row.current_behavior_binding_id and is_current;
    insert into public.product_behavior_bindings(
      product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,
      family_id,subfamily_id,form_id,main_eligibility,vegan_eligibility,
      protein_behavior,approved_liquid_dairy_carrier,profile_permissions,
      process_behavior,behavior_snapshot,warnings,block_reasons,
      classifier_version,binding_status,is_current,behavior_role,
      main_policy_status,profile_applicability,classification_reason_codes
    )
    select b.product_id,b.product_version_id,v_row.mapper_ingredient_id,
      b.taxonomy_version_id,b.family_id,b.subfamily_id,b.form_id,
      'UNKNOWN_REQUIRES_EVIDENCE',b.vegan_eligibility,b.protein_behavior,
      b.approved_liquid_dairy_carrier,'{}'::jsonb,b.process_behavior,
      b.behavior_snapshot||jsonb_build_object(
        'mappingDecision','information_only_status_repair',
        'mapperIngredientId',v_row.mapper_ingredient_id
      ),b.warnings,array['behavior_reclassification_required'],
      'product-status-information-only-provisional-v1','blocked',true,
      'UNKNOWN_REQUIRES_EVIDENCE','BLOCKED_DATA','{}'::jsonb,
      array['behavior_reclassification_required']
    from public.product_behavior_bindings b where b.id=v_row.current_behavior_binding_id
    returning id into v_provisional_binding;
    update public.products set current_behavior_binding_id=v_provisional_binding
    where id=v_row.product_id;
  end loop;
end;
$restore_exact_catalog_bindings$;

do $reclassify_catalog$
declare v_id uuid;
begin
  for v_id in
    select current_version_id from public.products
    where product_kind<>'mapper_reference' and is_active and merged_into_product_id is null
      and current_version_id is not null order by id
  loop
    perform public.classify_catalog_product_behavior_v2(v_id,'product-status-information-only-v1');
  end loop;
end;
$reclassify_catalog$;

-- Authenticated, public-safe audit projection. It exposes no account-private
-- price, supplier, note or stock data and performs no writes.
create or replace function public.audit_mapper_runtime_usability_v1()
returns table(
  ingredient_id text,
  product_id uuid,
  product_version_id uuid,
  binding_id uuid,
  verification_status text,
  source_confidence numeric,
  verification_source text,
  approved_for_base boolean,
  approved_for_engines boolean,
  missing_technical_fields text[],
  process_status text,
  behavior_state text,
  main_policy_status text,
  binding_status text,
  selectable_base boolean,
  pi_calculable boolean
)
language plpgsql stable security definer
set search_path=public,extensions
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return query
  select m.ingredient_id,p.id,p.current_version_id,b.id,m.verification_status,
    m.data_confidence_percent,m.verification_source,m.approved_for_base,m.approved_for_engines,
    array_remove(array[
      case when m.water_percent is null or m.water_percent<0 then 'water_percent' end,
      case when m.total_solids_percent is null or m.total_solids_percent<0 then 'total_solids_percent' end,
      case when m.fat_percent is null or m.fat_percent<0 then 'fat_percent' end,
      case when m.protein_percent is null or m.protein_percent<0 then 'protein_percent' end,
      case when m.carbohydrate_percent is null or m.carbohydrate_percent<0 then 'carbohydrate_percent' end,
      case when m.total_sugars_percent is null or m.total_sugars_percent<0 then 'total_sugars_percent' end,
      case when m.salt_percent is null or m.salt_percent<0 then 'salt_percent' end,
      case when m.pod_value is null or m.pod_value<0 then 'pod_value' end,
      case when m.pac_value is null or m.pac_value<0 then 'pac_value' end
    ],null),coalesce(b.process_behavior->>'decision','UNKNOWN'),b.behavior_role,
    b.main_policy_status,b.binding_status,
    (m.is_active and m.approved_for_base),
    (m.is_active and m.approved_for_engines
      and m.water_percent is not null and m.water_percent>=0
      and m.total_solids_percent is not null and m.total_solids_percent>=0
      and m.fat_percent is not null and m.fat_percent>=0
      and m.protein_percent is not null and m.protein_percent>=0
      and m.carbohydrate_percent is not null and m.carbohydrate_percent>=0
      and m.total_sugars_percent is not null and m.total_sugars_percent>=0
      and m.salt_percent is not null and m.salt_percent>=0
      and m.pod_value is not null and m.pod_value>=0
      and m.pac_value is not null and m.pac_value>=0)
  from public.mapper_basement m
  join public.products p on p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:'||m.ingredient_id
    and p.is_active and p.merged_into_product_id is null
  join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
    and b.product_id=p.id and b.product_version_id=v.id and b.is_current
  where m.is_active order by m.ingredient_id;
end;
$$;
revoke all on function public.audit_mapper_runtime_usability_v1() from public,anon;
grant execute on function public.audit_mapper_runtime_usability_v1() to authenticated,service_role;

do $assert_contract$
declare
  v_guard mapper_status_information_guard%rowtype;
  v_after text;
  v_searchable integer;
  v_selectable integer;
  v_pi_calculable integer;
begin
  select * into v_guard from mapper_status_information_guard;
  select encode(extensions.digest(string_agg(
    ingredient_id||'|'||verification_status||'|'||coalesce(data_confidence_percent::text,'')||'|'||
    verification_source||'|'||approved_for_base::text||'|'||approved_for_engines::text,
    E'\n' order by ingredient_id
  ),'sha256'),'hex') into v_after
  from public.mapper_basement where is_active;
  if v_guard.row_count<>2088 or v_guard.id_count<>2088 or v_after<>v_guard.status_fingerprint then
    raise exception 'immutable Mapper status/approval guard changed';
  end if;
  if (select count(*) from public.mapper_basement where is_active and approved_for_base)<>2075 then
    raise exception 'approved_for_base baseline drifted';
  end if;
  if (select count(*) from public.mapper_basement where is_active and approved_for_engines)<>2074 then
    raise exception 'approved_for_engines baseline drifted';
  end if;
  if (select count(*) from public.mapper_basement where is_active
      and approved_for_base and approved_for_engines
      and lower(coalesce(verification_status,'')) like 'verified%')<>1712 then
    raise exception 'pre-repair provenance-gated baseline drifted';
  end if;
  if exists(
    select 1 from catalog_mapping_information_guard g
    left join public.products p on p.id=g.product_id and p.current_version_id=g.current_version_id
    left join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    where b.id is null or b.mapper_ingredient_id is distinct from g.mapper_ingredient_id
      or b.family_id is distinct from g.family_id
      or b.subfamily_id is distinct from g.subfamily_id
      or b.form_id is distinct from g.form_id
  ) then raise exception 'existing exact catalog Mapper binding was lost or transferred'; end if;
  if exists(
    select 1
    from public.products p
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    where p.product_kind<>'mapper_reference' and p.is_active
      and p.merged_into_product_id is null
      and p.mapper_status='matched' and p.matched_basement_id is not null
      and exists(
        select 1 from public.product_evidence e
        where e.product_id=p.id and e.product_version_id=p.current_version_id
          and e.evidence_kind='admin_mapper_decision'
          and e.evidence#>>'{mapperDecision,mapperIngredientId}'=p.matched_basement_id
      )
      and b.mapper_ingredient_id is distinct from p.matched_basement_id
  ) then raise exception 'evidence-backed catalog Mapper binding was not restored exactly'; end if;
  if exists(
    select 1
    from public.products p
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    join public.mapper_product_behavior_bindings mb
      on mb.mapper_ingredient_id=b.mapper_ingredient_id and mb.is_current
    where p.product_kind<>'mapper_reference' and p.is_active
      and p.merged_into_product_id is null and b.mapper_ingredient_id is not null
      and (b.family_id is distinct from mb.family_id
        or b.subfamily_id is distinct from mb.subfamily_id
        or b.form_id is distinct from mb.form_id)
  ) then raise exception 'commercial Mapper binding crossed family or form authority'; end if;
  if exists(
    select 1
    from public.products p
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    where p.status='rejected' and (
      b.binding_status<>'blocked'
      or not ('product_rejected'=any(coalesce(b.block_reasons,'{}'::text[])))
      or coalesce((b.profile_permissions->>'SEARCH')::boolean,false)
      or coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
      or coalesce((b.profile_permissions->>'TOPPING')::boolean,false)
      or coalesce((b.profile_permissions->>'SAVE')::boolean,false)
      or coalesce((b.profile_permissions->>'PRODUCTION')::boolean,false)
    )
  ) then raise exception 'explicit product rejection was reactivated'; end if;
  if exists(
    select 1 from public.mapper_basement m
    left join public.products p on p.product_kind='mapper_reference'
      and p.normalized_identity='mapper:'||m.ingredient_id and p.is_active
    left join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    left join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    where m.is_active and (p.id is null or v.id is null or b.id is null
      or b.mapper_ingredient_id<>m.ingredient_id)
  ) then raise exception 'canonical Mapper product/version/binding coverage incomplete or cross-bound'; end if;
  if exists(
    select 1 from public.mapper_basement m
    join public.products p on p.normalized_identity='mapper:'||m.ingredient_id
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id and b.is_current
    where m.is_active and m.approved_for_base
      and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false) is not true
  ) then raise exception 'Base-selectable Mapper binding coverage incomplete'; end if;
  select count(*) into v_searchable
  from public.mapper_basement m
  join public.products p on p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:'||m.ingredient_id
    and p.is_active and p.merged_into_product_id is null
  join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
    and b.product_id=p.id and b.product_version_id=v.id and b.is_current
  where m.is_active;
  select count(*) into v_selectable
  from public.mapper_basement m
  join public.products p on p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:'||m.ingredient_id and p.is_active
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id and b.is_current
  where m.is_active and m.approved_for_base
    and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false);
  select count(*) into v_pi_calculable
  from public.mapper_basement m
  where m.is_active and m.approved_for_engines
    and m.water_percent is not null and m.water_percent>=0
    and m.total_solids_percent is not null and m.total_solids_percent>=0
    and m.fat_percent is not null and m.fat_percent>=0
    and m.protein_percent is not null and m.protein_percent>=0
    and m.carbohydrate_percent is not null and m.carbohydrate_percent>=0
    and m.total_sugars_percent is not null and m.total_sugars_percent>=0
    and m.salt_percent is not null and m.salt_percent>=0
    and m.pod_value is not null and m.pod_value>=0
    and m.pac_value is not null and m.pac_value>=0;
  if v_searchable<>2088 then
    raise exception 'post-repair searchable Mapper count drifted: %',v_searchable;
  end if;
  if v_selectable<>2075 then
    raise exception 'post-repair Base-selectable Mapper count drifted: %',v_selectable;
  end if;
  if v_pi_calculable<>2074 then
    raise exception 'post-repair PI-calculable Mapper count drifted: %',v_pi_calculable;
  end if;
end;
$assert_contract$;

comment on function public.audit_mapper_runtime_usability_v1()
is 'Authenticated public-safe audit of all active Mapper references. Verification/confidence are informational; Base and PI booleans use only technical facts.';
