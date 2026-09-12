-- SHARED PR-ING semantic binding and role-specific readiness.
--
-- Forward-only, no backfill. Existing versions/bindings are not rewritten.
-- Only a NEW, server-recomputed, exact-product TOPPING_ONLY authority may omit
-- a Mapper reference. BASE and SUBSTITUTE retain their existing fail-closed
-- requirements. mapper_basement is read-only throughout.

begin;

select pg_advisory_xact_lock(hashtextextended('shared-pr-ing-semantic-binding-v1',0));

-- ---------------------------------------------------------------------------------------------
-- 1. Canonical catalog ingest accepts exactly one null-reference exception:
--    conflict-free exact-product TOPPING_ONLY with a RESOLVED FINAL Search proposal.
-- ---------------------------------------------------------------------------------------------
do $patch_ingest$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_patched:=v_definition;
  v_old:=$old$        p_risk#>>'{productBehaviorAuthority,classificationOutcome}'='classified'
        and ($old$;
  v_new:=$new$        p_risk#>>'{productBehaviorAuthority,classificationOutcome}'='classified'
        and not (
          p_risk#>'{productBehaviorAuthority,referenceMapperIngredientId}'
            is not distinct from 'null'::jsonb
          and p_risk#>'{productBehaviorAuthority,mapperBehaviorBindingId}'
            is not distinct from 'null'::jsonb
          and coalesce((p_risk#>>'{productBehaviorAuthority,baseRecipeEligible}')::boolean,true)=false
          and coalesce((p_risk#>>'{productBehaviorAuthority,toppingEligible}')::boolean,false)
          and p_risk#>>'{productBehaviorAuthority,intendedUsageRole}'='TOPPING_ONLY'
          and p_risk#>>'{productBehaviorAuthority,behaviorRole}'='TOPPING_ONLY'
          and p_risk#>>'{productBehaviorAuthority,mainEligibility}'='TOPPING_ONLY'
          and p_risk#>>'{productBehaviorAuthority,mainPolicyStatus}'='NOT_APPLICABLE'
          and coalesce((p_risk#>>'{productBehaviorAuthority,profilePermissions,BASE_RECIPE}')::boolean,true)=false
          and coalesce((p_risk#>>'{productBehaviorAuthority,profilePermissions,TOPPING}')::boolean,false)
          and coalesce((p_risk#>>'{productBehaviorAuthority,profilePermissions,SUBSTITUTION}')::boolean,true)=false
          and p_risk#>>'{productBehaviorAuthority,processBehavior,decision}'='POST_PROCESS'
          and nullif(p_risk#>>'{productBehaviorAuthority,familyId}','') is not null
          and nullif(p_risk#>>'{productBehaviorAuthority,formId}','') is not null
          and p_risk#>>'{productProfileAuthority,profileReferenceAuthority}'='RECOGNITION_SEMANTIC_AUTHORITY'
          and p_risk#>>'{productProfileAuthority,recognition,authority}'='PRODUCT_RECOGNITION_V2'
          and coalesce((p_risk#>>'{productProfileAuthority,recognition,modelRequired}')::boolean,true)=false
          and coalesce((p_risk#>>'{productProfileAuthority,recognition,isTechnicalProduct}')::boolean,true)=false
          and p_risk#>>'{productProfileAuthority,recognition,intendedUsageRole}'='TOPPING_ONLY'
          and p_risk#>>'{productProfileAuthority,recognition,ingredientFamily}'<>'unknown'
          and p_risk#>>'{productProfileAuthority,recognition,physicalForm}'<>'UNKNOWN'
          and (
            coalesce((p_risk#>>'{productProfileAuthority,recognition,confidence}')::numeric,0)>=0.85
            or (
              p_risk#>>'{productProfileAuthority,recognition,classificationSource}'='CUSTOMER_CONFIRMED'
              and p_risk#>'{productProfileAuthority,recognition,evidenceRefs}' ? 'customerFamily'
            )
          )
          and p_risk#>>'{productProfileAuthority,evidence,kind}'='normal_food'
          and (
            coalesce((p_risk#>>'{productProfileAuthority,evidence,validatedBarcode}')::boolean,false)
            or coalesce((p_risk#>>'{productProfileAuthority,evidence,exactCanonicalMatch}')::boolean,false)
          )
          and nullif(p_risk#>>'{productProfileAuthority,evidence,fields,identity}','') is not null
          and p_risk#>>'{productProfileAuthority,evidence,fields,identity}'<>'mapper_family'
          and nullif(p_risk#>>'{productProfileAuthority,evidence,fields,barcode}','') is not null
          and case when jsonb_typeof(
            p_risk#>'{productProfileAuthority,evidence,materialConflicts}'
          )='array' then jsonb_array_length(
            p_risk#>'{productProfileAuthority,evidence,materialConflicts}'
          ) else -1 end=0
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,authority}'
            ='PR_ING_SEMANTIC_BINDING_V1'
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,state}'='RESOLVED'
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,searchAuthority,releaseId}'
            ='GELLATTI-SA10-2026-09-10-FINAL'
          and case when jsonb_typeof(
            p_risk#>'{productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
          )='array' then jsonb_array_length(
            p_risk#>'{productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
          ) else 0 end>0
          and not exists(
            select 1
            from jsonb_array_elements(case when jsonb_typeof(
              p_risk#>'{productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
            )='array' then
              p_risk#>'{productProfileAuthority,semanticBindingProposal,searchAuthority,concepts}'
            else '[]'::jsonb end) concept
            where concept->>'id' !~ '^SC-'
              or concept->>'key' is null
              or concept->>'targetType' not in ('INGREDIENT_CONCEPT','NAMED_COMPOSITE')
          )
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,classification,family}'
            =p_risk#>>'{productProfileAuthority,recognition,ingredientFamily}'
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,classification,form}'
            =p_risk#>>'{productProfileAuthority,recognition,physicalForm}'
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,classification,role}'
            ='TOPPING_ONLY'
          and p_risk#>>'{productProfileAuthority,semanticBindingProposal,behavior,behaviorFingerprint}'
            =p_risk#>>'{productBehaviorAuthority,behaviorFingerprint}'
          and coalesce(jsonb_typeof(
            p_risk#>'{productProfileAuthority,semanticBindingProposal,behavior,runtimeMapperIngredientId}'
          ),'null')='null'
          and coalesce((p_risk#>>'{productProfileAuthority,semanticBindingProposal,readiness,privateRecipe,base}')::boolean,true)=false
          and coalesce((p_risk#>>'{productProfileAuthority,semanticBindingProposal,readiness,privateRecipe,topping}')::boolean,false)
          and case when jsonb_typeof(
            p_risk#>'{productProfileAuthority,semanticBindingProposal,reasonCodes}'
          )='array' then jsonb_array_length(
            p_risk#>'{productProfileAuthority,semanticBindingProposal,reasonCodes}'
          ) else -1 end=0
        )
        and ($new$;
  if strpos(v_patched,$marker$PR_ING_SEMANTIC_BINDING_V1$marker$)=0 then
    if strpos(v_patched,v_old)=0 then
      raise exception 'shared PR-ING ingest authority anchor drifted';
    end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;
  execute v_patched;
end;
$patch_ingest$;

-- ---------------------------------------------------------------------------------------------
-- 2. Persist the semantic snapshot on the immutable version-bound ProductBehavior binding and
--    expose only role-specific permissions. No product/version/binding row already present is read
--    for update or rewritten by this migration.
-- ---------------------------------------------------------------------------------------------
do $patch_classifier$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
  v_patched:=v_definition;

  v_old:=$old$  v_product_behavior_topping_accepted boolean := false;$old$;
  v_new:=$new$  v_product_behavior_topping_accepted boolean := false;
  v_product_behavior_standalone_topping boolean := false;
  v_product_semantic_binding jsonb;
  v_role_readiness jsonb;$new$;
  if strpos(v_patched,'v_product_behavior_standalone_topping boolean')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'standalone topping declaration drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- Keep the complete existing Mapper lineage branch byte-for-byte. The OR branch is the only
  -- null-reference admission and repeats the service authority, exact evidence and FINAL Search
  -- checks at the database boundary.
  v_old:=$old$    and v_behavior_reference is not null
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
    );$old$;
  v_new:=$new$    and (
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
    );$new$;
  if strpos(v_patched,$marker$SERVER_ASSIGNED_VERSION$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'standalone topping classifier anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$    );

  -- Taxonomy is server-owned. Customer/public product fields are evidence for$old$;
  v_new:=$new$    );
  v_product_behavior_standalone_topping :=
    v_product_behavior_topping_accepted and v_behavior_reference is null;

  -- Taxonomy is server-owned. Customer/public product fields are evidence for$new$;
  if strpos(v_patched,'v_product_behavior_standalone_topping :=')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'standalone topping assignment anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- Label completeness remains a publication concern. A standalone topping may be privately
  -- recipe-ready only when its independent Product Accuracy verdict above is TOPPING_READY.
  v_old:=$old$  -- the allergen line is NEVER a gate (owner, 2026-09-06): absence is UNKNOWN, not a refusal
  v_topping := v_product.canonical_verification_status<>'blocked'
    and nullif(trim(coalesce(v_public_data->>'ingredientsText','')),'') is not null
    and jsonb_typeof(v_public_data->'nutrition')='object';$old$;
  v_new:=$new$  -- the allergen line is NEVER a gate (owner, 2026-09-06): absence is UNKNOWN, not a refusal
  v_topping := v_product.canonical_verification_status<>'blocked'
    and (
      v_product_behavior_standalone_topping
      or (
        nullif(trim(coalesce(v_public_data->>'ingredientsText','')),'') is not null
        and jsonb_typeof(v_public_data->'nutrition')='object'
      )
    );$new$;
  if strpos(v_patched,'v_product_behavior_standalone_topping
      or (')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'role-specific topping readiness anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  -- A standalone authority supplies only the taxonomy/process fields already frozen in its
  -- server ProductBehavior snapshot. It supplies no Mapper identity and no numeric composition.
  v_old:=$old$  v_family:=coalesce(v_family,v_mapper_family);
  v_subfamily:=coalesce(v_subfamily,v_mapper_subfamily);
  v_form:=coalesce(v_form,v_mapper_form);$old$;
  v_new:=$new$  if v_product_behavior_standalone_topping then
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
  v_form:=coalesce(v_form,v_mapper_form);$new$;
  if strpos(v_patched,'if v_product_behavior_standalone_topping then')=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'standalone taxonomy projection anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$  insert into public.product_behavior_bindings($old$;
  v_new:=$new$  v_role_readiness:=jsonb_build_object(
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

  insert into public.product_behavior_bindings($new$;
  if strpos(v_patched,"v_role_readiness:=jsonb_build_object(")=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'semantic snapshot construction anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  v_old:=$old$'productBehaviorAuthority',v_public_data#>'{productIntelligence,productBehaviorAuthority}'$old$;
  v_new:=$new$'productBehaviorAuthority',v_public_data#>'{productIntelligence,productBehaviorAuthority}',
      'productSemanticBinding',v_product_semantic_binding,
      'roleReadiness',v_role_readiness$new$;
  if strpos(v_patched,$marker$'productSemanticBinding',v_product_semantic_binding$marker$)=0 then
    if strpos(v_patched,v_old)=0 then raise exception 'semantic behavior snapshot anchor drifted'; end if;
    v_patched:=replace(v_patched,v_old,v_new);
  end if;

  execute v_patched;
end;
$patch_classifier$;

-- ---------------------------------------------------------------------------------------------
-- 3. A successful rescan of an existing exact-EAN PR gets one immutable semantic revalidation
--    version. The product UUID/code/EAN stay untouched, and an already-current binding is a no-op.
-- ---------------------------------------------------------------------------------------------
do $patch_scanner_existing_pr$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.gellatti_upsert_customer_added_product_v1(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );

  v_old:=$old$  v_existing_pr record;$old$;
  v_new:=$new$  v_existing_pr record;
  v_existing_version public.product_versions%rowtype;
  v_semantic_revalidated boolean:=false;$new$;
  if strpos(v_definition,'v_semantic_revalidated boolean')=0 then
    if strpos(v_definition,v_old)=0 then raise exception 'existing PR revalidation declaration drifted'; end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;

  v_old:=$old$  if v_existing_pr.id is not null then
    insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)$old$;
  v_new:=$new$  if v_existing_pr.id is not null then
    -- SHARED_PR_ING_TARGETED_REVALIDATION_V1. This is request-driven, never a migration backfill.
    -- Only a server-built RESOLVED proposal for this exact EAN and current PR name may advance
    -- the immutable version. A current, exact, ready semantic binding makes the rescan a no-op.
    if p_product_profile#>>'{semanticBindingProposal,authority}'='PR_ING_SEMANTIC_BINDING_V1'
      and p_product_profile#>>'{semanticBindingProposal,state}'='RESOLVED'
      and regexp_replace(
        coalesce(p_product_profile#>>'{semanticBindingProposal,exactIdentity,ean}',''),'\D','','g'
      )=v_ean
      and trim(p_product_profile#>>'{semanticBindingProposal,exactIdentity,productName}')
        =trim(v_existing_pr.product_name_display)
      and not exists(
        select 1
        from public.products current_product
        join public.product_behavior_bindings current_binding
          on current_binding.id=current_product.current_behavior_binding_id
          and current_binding.product_id=current_product.id
          and current_binding.product_version_id=current_product.current_version_id
          and current_binding.is_current
        where current_product.id=v_existing_pr.id
          and current_binding.behavior_snapshot#>>'{productSemanticBinding,authority}'
            ='PR_ING_SEMANTIC_BINDING_V1'
          and current_binding.behavior_snapshot#>>'{productSemanticBinding,state}'='RESOLVED'
          and current_binding.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,productId}'
            =current_product.id::text
          and current_binding.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,productVersionId}'
            =current_product.current_version_id::text
          and current_binding.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,ean}'=v_ean
          and (
            coalesce((current_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
            or coalesce((current_binding.profile_permissions->>'TOPPING')::boolean,false)
          )
      )
    then
      perform set_config('app.canonical_product_ingest','v1',true);
      perform 1 from public.products where id=v_existing_pr.id for update;
      select current_version.* into strict v_existing_version
      from public.products current_product
      join public.product_versions current_version
        on current_version.id=current_product.current_version_id
        and current_version.product_id=current_product.id
      where current_product.id=v_existing_pr.id;

      v_facts:=coalesce(v_existing_version.facts,'{}'::jsonb)||p_scan_result||jsonb_build_object(
        'technicalComposition',p_product_profile->'technicalComposition',
        'productAccuracy',p_product_profile->'productAccuracy',
        'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
        'allergenEvidenceStatus',p_product_profile->>'allergenEvidenceStatus',
        'ingredientsEvidenceStatus',p_product_profile->>'ingredientsEvidenceStatus',
        'productIntelligence',jsonb_build_object(
          'version',1,'authority','PRODUCT_PROFILE_V1','articleIdentity','PRODUCT_OWNED',
          'origin','CUSTOMER_ADDED','compositionReadiness',p_product_profile->>'readiness',
          'engineUsable',p_product_profile->'engineUsable',
          'criticalReadiness',p_product_profile->'criticalReadiness',
          'missingCritical',coalesce(p_product_profile->'missingCritical','[]'::jsonb),
          'missingEngineFields',coalesce(p_product_profile->'missingEngineFields','[]'::jsonb),
          'criticalPhysicsBlockers',coalesce(p_product_profile->'criticalPhysicsBlockers','[]'::jsonb),
          'fieldTruth',p_product_profile->'fieldTruth',
          'estimatedFromMapperIds',coalesce(p_product_profile->'estimatedFromMapperIds','[]'::jsonb),
          'mapperSimilarity',p_product_profile->'mapperSimilarity',
          'mapperProfileBasis',p_product_profile->'mapperProfileBasis',
          'mapperFingerprint',p_product_profile->'mapperFingerprint',
          'legacyEvidenceAccuracy',p_product_profile->'legacyEvidenceAccuracy',
          'productAccuracyAssessment',p_product_profile->'productAccuracyAssessment',
          'productProfileAuthority',p_product_profile,
          'productBehaviorAuthority',p_product_behavior
        )
      );
      insert into public.product_versions(
        product_id,version,facts,evidence_snapshot,verification_status,verification_method,
        provenance,facts_fingerprint,supersedes
      ) values(
        v_existing_pr.id,v_existing_version.version+1,v_facts,
        coalesce(v_existing_version.evidence_snapshot,'{}'::jsonb)||jsonb_build_object(
          'semanticRevalidation',jsonb_build_object(
            'authority','PR_ING_SEMANTIC_BINDING_V1','source','scanner',
            'previousVersionId',v_existing_version.id,'ean',v_ean,
            'recordedAt',statement_timestamp()
          )
        ),
        v_existing_version.verification_status,v_existing_version.verification_method,
        'scanner_semantic_revalidation_v1',
        encode(extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),'hex'),
        v_existing_version.id
      ) returning id into v_version_id;
      update public.products set current_version_id=v_version_id where id=v_existing_pr.id;
      select public.classify_catalog_product_behavior_v2(v_version_id,'product-behavior-v2')
        into v_binding_id;
      if not exists(
        select 1 from public.product_behavior_bindings accepted_binding
        where accepted_binding.id=v_binding_id
          and accepted_binding.product_id=v_existing_pr.id
          and accepted_binding.product_version_id=v_version_id
          and accepted_binding.is_current
          and accepted_binding.behavior_snapshot#>>'{productSemanticBinding,authority}'
            ='PR_ING_SEMANTIC_BINDING_V1'
          and accepted_binding.behavior_snapshot#>>'{productSemanticBinding,state}'='RESOLVED'
          and accepted_binding.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,productId}'
            =v_existing_pr.id::text
          and accepted_binding.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,productVersionId}'
            =v_version_id::text
          and (
            coalesce((accepted_binding.profile_permissions->>'BASE_RECIPE')::boolean,false)
            or coalesce((accepted_binding.profile_permissions->>'TOPPING')::boolean,false)
          )
      ) then
        raise exception 'shared_pr_semantic_revalidation_rejected';
      end if;
      v_semantic_revalidated:=true;
    end if;

    insert into public.user_product_relations(user_id,product_id,favorite,private_price,currency,supplier,notes)$new$;
  if strpos(v_definition,'SHARED_PR_ING_TARGETED_REVALIDATION_V1')=0 then
    if strpos(v_definition,v_old)=0 then raise exception 'existing PR revalidation branch drifted'; end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;

  v_old:=$old$      'brand',v_existing_pr.brand,'customerCount',null,'pendingId',null);$old$;
  v_new:=$new$      'brand',v_existing_pr.brand,'customerCount',null,'pendingId',null,
      'semanticRevalidated',v_semantic_revalidated,
      'productVersionId',case when v_semantic_revalidated then v_version_id else null end);$new$;
  if strpos(v_definition,$marker$'semanticRevalidated',v_semantic_revalidated$marker$)=0 then
    if strpos(v_definition,v_old)=0 then raise exception 'existing PR revalidation result drifted'; end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;

  execute v_definition;
end;
$patch_scanner_existing_pr$;

-- ---------------------------------------------------------------------------------------------
-- 4. Catalogue search exposes the persisted version-bound snapshot. Historical rows without it
--    retain their exact previous projection and may still be rebuilt read-only by the client.
-- ---------------------------------------------------------------------------------------------
do $patch_search$
declare
  v_signature regprocedure:=to_regprocedure(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then raise exception 'product search authority missing'; end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_old:=$old$(coalesce(v.facts->'public_data',v.facts)||jsonb_build_object('productCode',p.product_code,'lifecycleRejected',coalesce(p.status,'')='rejected','approvedForBase',coalesce(m.approved_for_base,false),'approvedForEngines',coalesce(m.approved_for_engines,false))) public_data$old$;
  v_new:=$new$(coalesce(v.facts->'public_data',v.facts)||jsonb_build_object(
        'productCode',p.product_code,
        'lifecycleRejected',coalesce(p.status,'')='rejected',
        'approvedForBase',coalesce(m.approved_for_base,false),
        'approvedForEngines',coalesce(m.approved_for_engines,false),
        'productSemanticBinding',b.behavior_snapshot->'productSemanticBinding',
        'roleReadiness',b.behavior_snapshot->'roleReadiness'
      )) public_data$new$;
  if strpos(v_definition,$marker$'productSemanticBinding',b.behavior_snapshot->'productSemanticBinding'$marker$)=0 then
    if strpos(v_definition,v_old)=0 then raise exception 'catalog semantic projection anchor drifted'; end if;
    v_definition:=replace(v_definition,v_old,v_new);
    execute v_definition;
  end if;
end;
$patch_search$;

-- ---------------------------------------------------------------------------------------------
-- 5. The exact-product read used by known-product surfaces exposes the same binding and the exact
--    pack/variant from immutable version evidence. Account visibility remains byte-equivalent.
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_canonical_product_for_account_v1(
  p_product_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=public
as $$
declare v_row jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select to_jsonb(p)||jsonb_build_object(
    'owner_user_id',auth.uid(),
    'created_by',case when p.created_by=auth.uid() then p.created_by else null end,
    'supplier',r.supplier,'cost_per_kg',r.private_price,'currency',r.currency,
    'usage_notes',r.notes,'product_image_url',null,'detected_text',null,
    'extracted_json',null,'reviewed_by',null,'reviewed_at',null,
    'review_notes',null,'mapper_notes',null,
    'package_size',coalesce(
      b.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,pack}',
      v.facts#>>'{package,netQuantityText}',
      v.facts->>'packageSize',
      case when pv.net_quantity is not null and pv.net_unit is not null
        then trim(pv.net_quantity::text||' '||pv.net_unit) end
    ),
    'product_variant',coalesce(
      b.behavior_snapshot#>>'{productSemanticBinding,exactIdentity,variant}',
      v.facts#>>'{identity,variant}',v.facts->>'variant'
    ),
    'product_semantic_binding',b.behavior_snapshot->'productSemanticBinding',
    'role_readiness',b.behavior_snapshot->'roleReadiness'
  ) into v_row
  from public.products p
  left join public.user_product_relations r
    on r.product_id=p.id and r.user_id=auth.uid()
  left join public.product_versions v
    on v.id=p.current_version_id and v.product_id=p.id
  left join public.product_behavior_bindings b
    on b.id=p.current_behavior_binding_id and b.product_id=p.id
      and b.product_version_id=p.current_version_id and b.is_current
  left join lateral (
    select variant.net_quantity,variant.net_unit
    from public.product_variants variant
    where variant.product_id=p.id and variant.is_current
    order by variant.created_at desc,variant.id
    limit 1
  ) pv on true
  where p.id=p_product_id and p.is_active and p.merged_into_product_id is null
    and (
      (p.visibility='shared' and p.canonical_verification_status<>'blocked')
      or p.owning_account_id=auth.uid() or p.created_by=auth.uid()
      or exists(select 1 from public.product_ingest_events e
        where e.product_id=p.id and e.actor_user_id=auth.uid())
      or exists(select 1 from public.customer_added_product_accounts linked
        where linked.product_id=p.id and linked.user_id=auth.uid())
    );
  return v_row;
end $$;

revoke all on function public.get_canonical_product_for_account_v1(uuid) from public,anon;
grant execute on function public.get_canonical_product_for_account_v1(uuid)
  to authenticated,service_role;

comment on function public.classify_catalog_product_behavior_v2(uuid,text)
is 'Persists exact version-bound PR/PM semantics. A null Mapper reference may grant TOPPING only for trusted, conflict-free TOPPING_ONLY Recognition plus FINAL Search authority; BASE and SUBSTITUTE remain fail-closed.';

-- Fail the migration rather than publish a broader authority than approved.
do $verify_contract$
declare
  v_ingest text:=pg_get_functiondef(
    'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_classifier text:=pg_get_functiondef(
    'public.classify_catalog_product_behavior_v2(uuid,text)'::regprocedure
  );
begin
  if strpos(v_ingest,'PR_ING_SEMANTIC_BINDING_V1')=0
    or strpos(v_ingest,"profile_permissions->>'BASE_RECIPE'")=0
    or strpos(v_classifier,'v_product_behavior_standalone_topping')=0
    or strpos(v_classifier,"'SUBSTITUTION',v_product_behavior_accepted and v_base")=0
    or strpos(v_classifier,"'BASE_RECIPE',v_product_behavior_accepted and v_base")=0
    or strpos(v_classifier,"'productSemanticBinding',v_product_semantic_binding")=0
    or strpos(v_classifier,"'roleReadiness',v_role_readiness")=0
  then raise exception 'shared PR-ING semantic binding contract incomplete'; end if;
end;
$verify_contract$;

commit;
