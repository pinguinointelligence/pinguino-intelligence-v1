-- Exact live definition preserved before the Owner-authorized PostgreSQL 17 operator-typing repair.
-- Captured at: 2026-09-12T19:25:09Z
-- MD5: 3e91b08949b0431401cbc83ff5e6386f

CREATE OR REPLACE FUNCTION public.classify_catalog_product_behavior_v2(p_catalog_product_version_id uuid, p_classifier_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_product public.products%rowtype;
  v_version public.product_versions%rowtype;
  v_public_data jsonb;
  v_binding uuid;
  v_family text;
  v_subfamily text;
  v_form text;
  v_main text;
  v_mapping text;
  v_behavior_reference text;
  v_product_behavior_accepted boolean := false;
  v_product_behavior_topping_accepted boolean := false;
  v_product_behavior_standalone_topping boolean := false;
  v_product_semantic_binding jsonb;
  v_role_readiness jsonb;
  v_role text;
  v_policy_status text;
  v_reasons text[];
  v_profiles jsonb;
  v_mapper_process jsonb;
  v_mapper_role text;
  v_mapper_vegan text;
  v_mapper_protein text;
  v_mapper_family text;
  v_mapper_subfamily text;
  v_mapper_form text;
  v_base boolean := false;
  v_explicit_rejection boolean := false;
  v_topping boolean := false;
  v_liquid_dairy_carrier boolean := false;
begin
  perform set_config('app.canonical_product_ingest','v1',true);
  perform pg_advisory_xact_lock(hashtextextended(
    'product-behavior:catalog_product_version:'||p_catalog_product_version_id::text,0
  ));
  select * into v_version from public.product_versions
  where id=p_catalog_product_version_id;
  if not found then raise exception 'canonical product version not found'; end if;
  select * into v_product from public.products
  where id=v_version.product_id and is_active and merged_into_product_id is null;
  if not found then raise exception 'active canonical product not found'; end if;
  if v_product.current_version_id<>v_version.id then
    raise exception 'only the current canonical product version may become current behavior';
  end if;

  v_public_data := coalesce(v_version.facts->'public_data',v_version.facts);
  select current_binding.mapper_ingredient_id into v_mapping
  from public.product_behavior_bindings current_binding
  join public.mapper_basement m on m.ingredient_id=current_binding.mapper_ingredient_id
  where current_binding.id=v_product.current_behavior_binding_id
    and current_binding.product_id=v_product.id
    and current_binding.product_version_id=v_version.id
    and current_binding.is_current
    and m.is_active
  limit 1;
  v_behavior_reference:=nullif(v_public_data#>>'{productIntelligence,productBehaviorAuthority,referenceMapperIngredientId}','');
  v_product_behavior_accepted :=
    v_public_data#>>'{productIntelligence,productBehaviorAuthority,authority}'='PRODUCT_BEHAVIOR_V1'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,validationMode}'='server_recomputed_product_behavior'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,articleIdentity}'='PRODUCT_OWNED'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='classified'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,baseRecipeEligible}'='true'
    -- ingest_product_v1 strips nested JSON nulls after validating that the
    -- server authority explicitly supplied runtimeMapperIngredientId=null.
    and coalesce(v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}','null'::jsonb)='null'::jsonb
    and v_behavior_reference is not null
    and exists(
      select 1 from public.mapper_basement referenced_ingredient
      where referenced_ingredient.ingredient_id=v_behavior_reference
        and referenced_ingredient.is_active
    )
    and exists(
      select 1 from public.mapper_product_behavior_bindings provenance_binding
      where provenance_binding.id::text=
          v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        and provenance_binding.mapper_ingredient_id=v_behavior_reference
    )
    and exists(
      select 1 from public.mapper_product_behavior_bindings authority_binding
      where authority_binding.mapper_ingredient_id=v_behavior_reference
        and authority_binding.is_current
        and coalesce((authority_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
    );
  v_product_behavior_topping_accepted :=
    v_public_data#>>'{productIntelligence,productBehaviorAuthority,authority}'='PRODUCT_BEHAVIOR_V1'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,validationMode}'='server_recomputed_product_behavior'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,articleIdentity}'='PRODUCT_OWNED'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='classified'
    and v_public_data#>>'{productIntelligence,productBehaviorAuthority,toppingEligible}'='true'
    and coalesce(v_public_data#>'{productIntelligence,productBehaviorAuthority,runtimeMapperIngredientId}','null'::jsonb)='null'::jsonb
    and (
      (
        v_behavior_reference is not null
        and exists(
          select 1 from public.mapper_basement referenced_ingredient
          where referenced_ingredient.ingredient_id=v_behavior_reference
            and referenced_ingredient.is_active
        )
        and exists(
          select 1 from public.mapper_product_behavior_bindings provenance_binding
          where provenance_binding.id::text=
              v_public_data#>>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
            and provenance_binding.mapper_ingredient_id=v_behavior_reference
        )
        and exists(
          select 1 from public.mapper_product_behavior_bindings authority_binding
          where authority_binding.mapper_ingredient_id=v_behavior_reference
            and authority_binding.is_current
        )
      )
      or (
        v_behavior_reference is null
        and coalesce(jsonb_typeof(
          v_public_data#>'{productIntelligence,productBehaviorAuthority,mapperBehaviorBindingId}'
        ),'null')='null'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,baseRecipeEligible}'='false'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,intendedUsageRole}'='TOPPING_ONLY'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,behaviorRole}'='TOPPING_ONLY'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,mainEligibility}'='TOPPING_ONLY'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,mainPolicyStatus}'='NOT_APPLICABLE'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,profilePermissions,BASE_RECIPE}'='false'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,profilePermissions,TOPPING}'='true'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,profilePermissions,SUBSTITUTION}'='false'
        and v_public_data#>>'{productIntelligence,productBehaviorAuthority,processBehavior,decision}'='POST_PROCESS'
        and nullif(v_public_data#>>'{productIntelligence,productBehaviorAuthority,familyId}','') is not null
        and nullif(v_public_data#>>'{productIntelligence,productBehaviorAuthority,formId}','') is not null
        and v_public_data#>>'{productIntelligence,productProfileAuthority,profileReferenceAuthority}'='RECOGNITION_SEMANTIC_AUTHORITY'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,authority}'='PRODUCT_RECOGNITION_V2'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,modelRequired}'='false'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,isTechnicalProduct}'='false'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,intendedUsageRole}'='TOPPING_ONLY'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,ingredientFamily}'<>'unknown'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,physicalForm}'<>'UNKNOWN'
        and (
          coalesce((v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,confidence}')::numeric,0)>=0.85
          or (
            v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,classificationSource}'='CUSTOMER_CONFIRMED'
            and v_public_data#>'{productIntelligence,productProfileAuthority,recognition,evidenceRefs}' ? 'customerFamily'
          )
        )
        and v_public_data#>>'{productIntelligence,productProfileAuthority,evidence,kind}'='normal_food'
        and (
          v_public_data#>>'{productIntelligence,productProfileAuthority,evidence,validatedBarcode}'='true'
          or v_public_data#>>'{productIntelligence,productProfileAuthority,evidence,exactCanonicalMatch}'='true'
        )
        and nullif(v_public_data#>>'{productIntelligence,productProfileAuthority,evidence,fields,identity}','') is not null
        and v_public_data#>>'{productIntelligence,productProfileAuthority,evidence,fields,identity}'<>'mapper_family'
        and nullif(v_public_data#>>'{productIntelligence,productProfileAuthority,evidence,fields,barcode}','') is not null
        and case when jsonb_typeof(
          v_public_data#>'{productIntelligence,productProfileAuthority,evidence,materialConflicts}'
        )='array' then jsonb_array_length(
          v_public_data#>'{productIntelligence,productProfileAuthority,evidence,materialConflicts}'
        ) else -1 end=0
        and v_public_data#>>'{productIntelligence,productProfileAuthority,productAccuracyAssessment,roleReadiness}'='TOPPING_READY'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,productAccuracyAssessment,gellattiReadiness,ready}'='true'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,authority}'
          ='PR_ING_SEMANTIC_BINDING_V1'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,state}'='RESOLVED'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,source}'
          in ('scanner','recipe_library_import','manual_import','admin_import','future_import','revalidation')
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,productId}'
          ='SERVER_ASSIGNED_PRODUCT'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,productVersionId}'
          ='SERVER_ASSIGNED_VERSION'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,articleCode}'
          ='PR-ING-000000'
        and regexp_replace(
          coalesce(v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,ean}',''),
          '\D','','g'
        )=coalesce(v_product.ean_code_normalized,'')
        and trim(v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,productName}')
          =trim(coalesce(v_product.product_name_display,''))
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,searchAuthority,releaseId}'
          ='GELLATTI-SA10-2026-09-10-FINAL'
        and case when jsonb_typeof(
          v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
        )='array' then jsonb_array_length(
          v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
        ) else 0 end>0
        and not exists(
          select 1
          from jsonb_array_elements(case when jsonb_typeof(
            v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
          )='array' then
            v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
          else '[]'::jsonb end) concept
          where concept->>'id' !~ '^SC-'
            or concept->>'key' is null
            or concept->>'targetType' not in ('INGREDIENT_CONCEPT','NAMED_COMPOSITE')
        )
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,classification,family}'
          =v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,ingredientFamily}'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,classification,form}'
          =v_public_data#>>'{productIntelligence,productProfileAuthority,recognition,physicalForm}'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,classification,role}'
          ='TOPPING_ONLY'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,behavior,behaviorFingerprint}'
          =v_public_data#>>'{productIntelligence,productBehaviorAuthority,behaviorFingerprint}'
        and coalesce(jsonb_typeof(
          v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,behavior,runtimeMapperIngredientId}'
        ),'null')='null'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,readiness,privateRecipe,base}'='false'
        and v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,readiness,privateRecipe,topping}'='true'
        and case when jsonb_typeof(
          v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,reasonCodes}'
        )='array' then jsonb_array_length(
          v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal,reasonCodes}'
        ) else -1 end=0
      )
    );
  v_product_behavior_standalone_topping :=
    v_product_behavior_topping_accepted and v_behavior_reference is null;

  -- Taxonomy is server-owned. Customer/public product fields are evidence for
  -- review only and never outrank the exact current Mapper binding.
  v_family := null;
  v_subfamily := null;
  v_form := null;
  v_explicit_rejection := coalesce(v_product.status,'')='rejected' or exists(
    select 1 from public.product_behavior_bindings rejection_binding
    where rejection_binding.id=v_product.current_behavior_binding_id
      and rejection_binding.product_id=v_product.id
      and rejection_binding.product_version_id=v_version.id
      and 'product_rejected'=any(coalesce(rejection_binding.block_reasons,'{}'::text[]))
  );
  v_base := not v_explicit_rejection
    and v_public_data#>>'{productIntelligence,engineUsable}'='true'
    and jsonb_typeof(v_public_data->'technicalComposition')='object'
    and v_public_data->'technicalComposition'<>'{}'::jsonb;
  -- the allergen line is NEVER a gate (owner, 2026-09-06): absence is UNKNOWN, not a refusal
  v_topping := v_product.canonical_verification_status<>'blocked'
    and (
      v_product_behavior_standalone_topping
      or (
        nullif(trim(coalesce(v_public_data->>'ingredientsText','')),'') is not null
        and jsonb_typeof(v_public_data->'nutrition')='object'
      )
    );
  select coalesce(b.approved_liquid_dairy_carrier,false),b.process_behavior,
    b.behavior_role,b.family_id,b.subfamily_id,b.form_id,b.vegan_eligibility,b.protein_behavior
  into v_liquid_dairy_carrier,v_mapper_process,v_mapper_role,
    v_mapper_family,v_mapper_subfamily,v_mapper_form,v_mapper_vegan,v_mapper_protein
  from public.mapper_product_behavior_bindings b
  where b.mapper_ingredient_id=coalesce(v_mapping,v_behavior_reference) and b.is_current;
  if v_product_behavior_standalone_topping then
    v_mapper_process:=coalesce(
      v_public_data#>'{productIntelligence,productBehaviorAuthority,processBehavior}',
      '{}'::jsonb
    );
    v_mapper_role:='TOPPING_ONLY';
    v_mapper_family:=v_public_data#>>'{productIntelligence,productBehaviorAuthority,familyId}';
    v_mapper_subfamily:=nullif(
      v_public_data#>>'{productIntelligence,productBehaviorAuthority,subfamilyId}',''
    );
    v_mapper_form:=v_public_data#>>'{productIntelligence,productBehaviorAuthority,formId}';
    v_mapper_vegan:='unknown';
    v_mapper_protein:='unknown';
    v_liquid_dairy_carrier:=false;
  end if;
  v_family:=coalesce(v_family,v_mapper_family);
  v_subfamily:=coalesce(v_subfamily,v_mapper_subfamily);
  v_form:=coalesce(v_form,v_mapper_form);

  if v_family is not null and v_form is not null and exists (
    select 1 from public.product_behavior_policy_versions p
    where p.status='published'
      and (p.exact_catalog_product_version_id is null or p.exact_catalog_product_version_id=v_version.id)
      and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapping)
      and (p.family_id is null or p.family_id=v_family)
      and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
      and (p.form_id is null or p.form_id=v_form)
  ) then
    v_main := 'MAIN_PROFILE_SPECIFIC';
    v_role := 'MAIN_PROFILE_SPECIFIC';
    v_policy_status := 'COVERED';
  elsif v_family is null or v_form is null then
    v_role := coalesce(v_mapper_role,'UNKNOWN_REQUIRES_EVIDENCE');
    v_main := case v_role
      when 'STRUCTURAL_ONLY' then 'NOT_MAIN'
      when 'STANDARD_ONLY' then 'STANDARD_ONLY'
      when 'PROTEIN_CONTRIBUTOR_ONLY' then 'PROTEIN_CONTRIBUTOR_ONLY'
      when 'TOPPING_ONLY' then 'TOPPING_ONLY'
      else 'MAIN_BLOCKED_POLICY' end;
    v_policy_status := case when v_role in (
      'STRUCTURAL_ONLY','STANDARD_ONLY','PROTEIN_CONTRIBUTOR_ONLY','TOPPING_ONLY'
    ) then 'NOT_APPLICABLE' else 'BLOCKED_DATA' end;
  else
    v_main := 'MAIN_BLOCKED_POLICY';
    v_role := case when v_mapper_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
      then 'MAIN_ALLOWED' else coalesce(v_mapper_role,'UNKNOWN_REQUIRES_EVIDENCE') end;
    v_policy_status := 'BLOCKED_SCIENCE';
  end if;

  select coalesce(jsonb_object_agg(p.product_profile,'eligible'),'{}'::jsonb)
  into v_profiles
  from public.product_behavior_policy_versions p
  where p.status='published'
    and (p.exact_catalog_product_version_id is null or p.exact_catalog_product_version_id=v_version.id)
    and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapping)
    and (p.family_id is null or p.family_id=v_family)
    and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
    and (p.form_id is null or p.form_id=v_form);

  v_reasons := array_remove(array[
    case when v_policy_status='BLOCKED_DATA' and v_family is null and v_form is null
      then 'family_and_form_evidence_missing' end,
    case when v_policy_status='BLOCKED_DATA' and v_family is null and v_form is not null
      then 'family_evidence_missing' end,
    case when v_policy_status='BLOCKED_DATA' and v_family is not null and v_form is null
      then 'form_or_concentration_evidence_missing' end,
    case when v_policy_status in ('BLOCKED_DATA','BLOCKED_SCIENCE')
      and v_family is not null and v_form is not null
      then 'profile_main_policy_missing' end,
    case when not v_base and (
      coalesce(v_public_data#>>'{productIntelligence,authority}','')<>'PRODUCT_PROFILE_V1'
      or jsonb_typeof(v_public_data->'technicalComposition')<>'object'
      or v_public_data->'technicalComposition'='{}'::jsonb
    ) then 'product_owned_profile_missing' end,
    case when v_explicit_rejection then 'product_rejected' end
  ],null);
  if jsonb_typeof(v_public_data#>'{productIntelligence,productBehaviorAuthority,classificationReasonCodes}')='array' then
    select coalesce(array_agg(distinct reason order by reason),'{}'::text[])
    into v_reasons
    from unnest(v_reasons || array(
      select jsonb_array_elements_text(
        v_public_data#>'{productIntelligence,productBehaviorAuthority,classificationReasonCodes}'
      )
    )) reason;
  end if;

  v_role_readiness:=jsonb_build_object(
    'BASE',jsonb_build_object(
      'ready',v_product_behavior_accepted and v_base,
      'technicalAuthorityRequired',true,
      'referenceMapperIngredientId',v_behavior_reference
    ),
    'TOPPING',jsonb_build_object(
      'ready',v_product_behavior_topping_accepted and v_topping,
      'technicalAuthorityRequired',false,
      'referenceMapperIngredientId',v_behavior_reference
    ),
    'SUBSTITUTE',jsonb_build_object(
      'ready',v_product_behavior_accepted and v_base,
      'compatibilityAuthorityRequired',true,
      'referenceMapperIngredientId',v_behavior_reference
    )
  );
  if v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,authority}'
      ='PR_ING_SEMANTIC_BINDING_V1' then
    v_product_semantic_binding:=
      (v_public_data#>'{productIntelligence,productProfileAuthority,semanticBindingProposal}'
        - 'exactIdentity' - 'readiness')
      ||jsonb_build_object(
        'exactIdentity',jsonb_build_object(
          'productId',v_product.id,
          'articleCode',v_product.product_code,
          'productVersionId',v_version.id,
          'ean',nullif(v_product.ean_code_normalized,''),
          'brand',v_product.brand,
          'productName',v_product.product_name_display,
          'variant',nullif(v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,variant}',''),
          'pack',nullif(v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,exactIdentity,pack}','')
        ),
        'readiness',jsonb_build_object(
          'privateRecipe',jsonb_build_object(
            'base',v_product_behavior_accepted and v_base,
            'topping',v_product_behavior_topping_accepted and v_topping
          ),
          'publicCatalogue',
            v_product.canonical_verification_status='verified'
            and coalesce((v_public_data#>>'{productIntelligence,productProfileAuthority,semanticBindingProposal,readiness,publicCatalogue}')::boolean,false)
        )
      );
  end if;

  insert into public.product_behavior_bindings(
    product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,
    family_id,subfamily_id,form_id,main_eligibility,vegan_eligibility,protein_behavior,
    approved_liquid_dairy_carrier,profile_permissions,process_behavior,behavior_snapshot,
    warnings,block_reasons,classifier_version,binding_status,is_current,
    behavior_role,main_policy_status,profile_applicability,classification_reason_codes
  ) values (
    v_product.id,v_version.id,v_mapping,'pinguino-product-taxonomy-v1',
    v_family,v_subfamily,v_form,v_main,
    coalesce(v_mapper_vegan,'unknown'),coalesce(v_mapper_protein,'unknown'),
    coalesce(v_liquid_dairy_carrier,false),
    jsonb_build_object(
      'SEARCH',not v_explicit_rejection,
      'BASE_RECIPE',v_product_behavior_accepted and v_base,
      'MAIN',not v_explicit_rejection and v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'OPTIMAL',not v_explicit_rejection and v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'ECO',not v_explicit_rejection and v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'TOPPING',v_product_behavior_topping_accepted and v_topping,'SUBSTITUTION',v_product_behavior_accepted and v_base,'COST',not v_explicit_rejection,'MONITOR',v_product_behavior_accepted and v_base,
      'PRODUCTION',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),
      'LABEL',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),
      'NUTRITION',(v_product_behavior_accepted and v_base and v_topping)
        or (v_product_behavior_topping_accepted and v_topping),
      'SAVE',(v_product_behavior_accepted and v_base) or (v_product_behavior_topping_accepted and v_topping)
    ),
    coalesce(v_mapper_process,'{}'::jsonb)||jsonb_build_object(
      'BASE_FORMULATION',v_product_behavior_accepted and v_base,'POST_PROCESS_ADDON',v_product_behavior_topping_accepted and v_topping
    ),
    jsonb_build_object(
      'familyId',v_family,'subfamilyId',v_subfamily,'formId',v_form,
      'behaviorRole',v_role,'mainPolicyStatus',v_policy_status,
      'profileApplicability',v_profiles,'classificationReasonCodes',to_jsonb(v_reasons),
      'productBehaviorAuthority',v_public_data#>'{productIntelligence,productBehaviorAuthority}',
      'productSemanticBinding',v_product_semantic_binding,
      'roleReadiness',v_role_readiness
    ),
    case when v_product.canonical_verification_status='manual_unverified'
      then array['catalog_manual_unverified'] else '{}'::text[] end,
    v_reasons,p_classifier_version,
    case when v_explicit_rejection
      or v_public_data#>>'{productIntelligence,productBehaviorAuthority,classificationOutcome}'='blocked'
      then 'blocked' else 'ready' end,
    false,v_role,v_policy_status,v_profiles,v_reasons
  )
  on conflict(product_version_id,classifier_version)
  do update set classified_at=now()
  returning id into v_binding;

  update public.product_behavior_bindings set is_current=false
  where product_id=v_product.id and is_current and id<>v_binding;
  update public.product_behavior_bindings set is_current=true where id=v_binding;
  update public.products set current_behavior_binding_id=v_binding where id=v_product.id;

  if v_policy_status in ('BLOCKED_DATA','BLOCKED_SCIENCE') then
    insert into public.product_review_cases(
      consolidation_key,product_id,product_version_id,kind,missing_fields,latest_evidence
    ) values (
      'behavior:'||v_product.id::text,v_product.id,v_version.id,'conflict',v_reasons,
      jsonb_build_object('classifierVersion',p_classifier_version,'familyId',v_family,'formId',v_form)
    ) on conflict(consolidation_key) do update set
      submission_count=product_review_cases.submission_count+1,
      missing_fields=excluded.missing_fields,latest_evidence=excluded.latest_evidence,
      updated_at=now();
  end if;
  return v_binding;
end $function$
