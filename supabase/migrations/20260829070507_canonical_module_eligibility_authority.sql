-- CANONICAL MODULE ELIGIBILITY — ONE Mapper-derived authority for BASE_RECIPE
-- and TOPPING.
--
-- WHAT WAS TRUE BEFORE
--   `products.current_behavior_binding_id` for a canonical `mapper_reference`
--   product could be published by EITHER classifier:
--     * `classify_mapper_product_behavior_v2`  — Mapper-derived, BASE_RECIPE =
--       mapper_basement.approved_for_base;
--     * `classify_catalog_product_behavior_v2` — customer/scanner authority,
--       BASE_RECIPE = public_data.productIntelligence.engineUsable, which NO
--       mapper_reference version carries (0 of 2089), so it always resolves to
--       false.
--   `enqueue_mapper_product_behavior_authority_change_v1` enqueued every
--   product carrying the changed `mapper_ingredient_id` as a
--   `catalog_product_version` job — including the canonical mapper_reference
--   product itself. Whichever job drained last won. Half the canonical
--   catalogue therefore served BASE_RECIPE=false against a Mapper row that
--   says approved_for_base=true, and the ingredient picker (which reads
--   `mapper_basement.approved_for_base` directly) offered products that
--   ProductBehavior then refused.
--   Two per-product override triggers existed only to immunise three exact
--   ids (PI-ING-000270, PI-ING-000514, PI-ING-002114) against that race.
--
-- WHAT IS TRUE NOW
--   `canonical_module_eligibility_v1` is the single source of truth. It is
--   mechanical: Mapper's own `approved_for_base` plus the canonical technical
--   class already carried by `ingredient_category`/`ingredient_subcategory`.
--   The classifier, the served resolver gate and the picker all read it, so no
--   stored mirror can contradict Mapper, the per-product override registries
--   are removed, and a new canonical product needs no code change.
--
--   Module eligibility, profile compatibility and process authority stay three
--   separate questions: this migration touches only the first.
--
-- `public.mapper_basement` is read-only here.
begin;

select pg_advisory_xact_lock(hashtextextended('canonical-module-eligibility-v1',0));

-- ---------------------------------------------------------------------------
-- 1. Canonical product role — pure function of the canonical technical class.
--    Verbatim the category sets `classify_mapper_product_behavior_v2` already
--    uses for TOPPING_ONLY / STRUCTURAL_ONLY. No product id appears here.
-- ---------------------------------------------------------------------------
create or replace function public.canonical_module_product_role_v1(
  p_category text,
  p_subcategory text
) returns text
language sql
immutable
set search_path=pg_catalog,public
as $$
  select case
    -- Post-process inclusions: never part of base formulation physics.
    when lower(coalesce(p_category,'')) in (
      'confectionery_inclusion','bakery_inclusion','decorative_inclusion',
      'variegate','coating'
    ) then 'TOPPING_ONLY'
    -- Structural/functional matter: base formulation only. This is the owner's
    -- own decision for sucrose (PI-ING-000514) and for the Gellatti stabilizer
    -- (PI-ING-002114), expressed as a class instead of two ids.
    when lower(coalesce(p_category,'')) in (
      'sweetener','stabilizer','fiber','emulsifier','starch','acid','colorant',
      'functional_additive','additive'
    ) or lower(coalesce(p_subcategory,''))='water' then 'BASE_ONLY'
    else 'BASE_AND_TOPPING'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. THE canonical module eligibility of one Mapper identity.
--    Fail-closed: an unknown or inactive identity yields no row, and every
--    caller coalesces a missing answer to blocked.
-- ---------------------------------------------------------------------------
create or replace function public.canonical_module_eligibility_v1(
  p_mapper_ingredient_id text
) returns jsonb
language sql
stable
set search_path=pg_catalog,public
as $$
  select jsonb_build_object(
    'authorityType','CANONICAL_MODULE_ELIGIBILITY',
    'authorityVersion','canonical-module-eligibility-v1',
    'mapperIngredientId',m.ingredient_id,
    'productRole',r.product_role,
    'approvedForBase',m.approved_for_base,
    'approvedForEngines',m.approved_for_engines,
    'BASE_RECIPE',
      m.approved_for_base and r.product_role in ('BASE_ONLY','BASE_AND_TOPPING'),
    'TOPPING',
      m.approved_for_base and r.product_role in ('TOPPING_ONLY','BASE_AND_TOPPING')
  )
  from public.mapper_basement m
  cross join lateral (
    select public.canonical_module_product_role_v1(
      m.ingredient_category,m.ingredient_subcategory
    ) as product_role
  ) r
  where m.ingredient_id=p_mapper_ingredient_id and m.is_active;
$$;

revoke all on function public.canonical_module_product_role_v1(text,text) from public,anon;
revoke all on function public.canonical_module_eligibility_v1(text) from public,anon;
grant execute on function public.canonical_module_product_role_v1(text,text)
  to authenticated,service_role;
grant execute on function public.canonical_module_eligibility_v1(text)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Remove the duplicate per-product BASE_RECIPE/TOPPING registries. Their
--    exact results are reproduced mechanically by section 1 (sucrose and the
--    stabilizer are 'sweetener'/'stabilizer' -> BASE_ONLY; skimmed milk powder
--    is dairy -> BASE_AND_TOPPING, matching the picker that has always offered
--    it in both contexts).
-- ---------------------------------------------------------------------------
drop trigger if exists enforce_canonical_recipe_product_behavior_mapper_v1
  on public.mapper_product_behavior_bindings;
drop trigger if exists enforce_canonical_recipe_product_behavior_product_v1
  on public.product_behavior_bindings;
drop function if exists public.enforce_canonical_recipe_product_behavior_authority_v1();

drop trigger if exists enforce_gellatti_stabilizer_base_only_mapper_v1
  on public.mapper_product_behavior_bindings;
drop trigger if exists enforce_gellatti_stabilizer_base_only_product_v1
  on public.product_behavior_bindings;
drop function if exists public.enforce_gellatti_stabilizer_base_only_v1();

-- ---------------------------------------------------------------------------
-- 4. The Mapper classifier now writes the canonical answer instead of
--    projecting `approved_for_base` onto both modules.
-- ---------------------------------------------------------------------------
do $patch_mapper_classifier$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.classify_mapper_product_behavior_v2(text,text)'::regprocedure
  );
  v_old:=$old$      'BASE_RECIPE',v_mapper.approved_for_base,
      'TOPPING',v_mapper.approved_for_base,$old$;
  v_new:=$new$      'BASE_RECIPE',coalesce((public.canonical_module_eligibility_v1(
        v_mapper.ingredient_id)->>'BASE_RECIPE')::boolean,false),
      'TOPPING',coalesce((public.canonical_module_eligibility_v1(
        v_mapper.ingredient_id)->>'TOPPING')::boolean,false),$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'Mapper classifier module permission anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;

  -- A repeated classification of the same authority version must republish the
  -- payload, not merely stamp `classified_at`. Without this an authority change
  -- that reuses a classifier version silently keeps the previous permissions.
  v_old:=$old$  on conflict (mapper_ingredient_id,mapper_dataset_version,classifier_version)
  do update set classified_at=now()
  returning id into v_binding;$old$;
  v_new:=$new$  on conflict (mapper_ingredient_id,mapper_dataset_version,classifier_version)
  do update set classified_at=now(),
    taxonomy_version_id=excluded.taxonomy_version_id,
    family_id=excluded.family_id,subfamily_id=excluded.subfamily_id,
    form_id=excluded.form_id,form_hint=excluded.form_hint,
    main_eligibility=excluded.main_eligibility,
    vegan_eligibility=excluded.vegan_eligibility,
    protein_behavior=excluded.protein_behavior,
    approved_liquid_dairy_carrier=excluded.approved_liquid_dairy_carrier,
    profile_permissions=excluded.profile_permissions,
    process_behavior=excluded.process_behavior,
    raw_evidence=excluded.raw_evidence,
    behavior_role=excluded.behavior_role,
    main_policy_status=excluded.main_policy_status,
    profile_applicability=excluded.profile_applicability,
    classification_reason_codes=excluded.classification_reason_codes
  returning id into v_binding;$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'Mapper classifier mapper upsert anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;

  v_old:=$old$  on conflict(product_version_id,classifier_version)
  do update set classified_at=now()
  returning id into v_canonical_binding;$old$;
  v_new:=$new$  on conflict(product_version_id,classifier_version)
  do update set classified_at=now(),
    mapper_ingredient_id=excluded.mapper_ingredient_id,
    taxonomy_version_id=excluded.taxonomy_version_id,
    family_id=excluded.family_id,subfamily_id=excluded.subfamily_id,
    form_id=excluded.form_id,
    main_eligibility=excluded.main_eligibility,
    vegan_eligibility=excluded.vegan_eligibility,
    protein_behavior=excluded.protein_behavior,
    approved_liquid_dairy_carrier=excluded.approved_liquid_dairy_carrier,
    profile_permissions=excluded.profile_permissions,
    process_behavior=excluded.process_behavior,
    behavior_snapshot=excluded.behavior_snapshot,
    warnings=excluded.warnings,block_reasons=excluded.block_reasons,
    binding_status=excluded.binding_status,
    behavior_role=excluded.behavior_role,
    main_policy_status=excluded.main_policy_status,
    profile_applicability=excluded.profile_applicability,
    classification_reason_codes=excluded.classification_reason_codes
  returning id into v_canonical_binding;$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'Mapper classifier canonical upsert anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;

  execute v_definition;
end;
$patch_mapper_classifier$;

-- ---------------------------------------------------------------------------
-- 5. Close the enqueue leak: a canonical Mapper reference is never a catalog
--    classification subject. `enqueue_all_product_behavior_reclassification_v1`
--    and the queue worker already carry this guard; this trigger did not.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_mapper_product_behavior_authority_change_v1()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_ingredient_id text;
  v_version_id uuid;
begin
  v_ingredient_id:=case when tg_op='DELETE' then old.ingredient_id else new.ingredient_id end;
  if exists(select 1 from public.mapper_basement m
    where m.ingredient_id=v_ingredient_id and m.is_active) then
    perform public.enqueue_product_behavior_reclassification_v1(
      'mapper',v_ingredient_id,tg_table_name||'_changed'
    );
  end if;
  for v_version_id in
    select distinct p.current_version_id
    from public.products p
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current
    where p.is_active and p.merged_into_product_id is null
      and p.product_kind<>'mapper_reference'
      and p.current_version_id is not null and b.mapper_ingredient_id=v_ingredient_id
  loop
    perform public.enqueue_product_behavior_reclassification_v1(
      'catalog_product_version',v_version_id::text,tg_table_name||'_changed'
    );
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Defence in depth: even a pre-existing queued catalog job for a canonical
--    Mapper reference is classified by the Mapper authority.
-- ---------------------------------------------------------------------------
create or replace function public.process_product_behavior_reclassification_queue_v1(
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_job public.product_behavior_reclassification_queue%rowtype;
  v_binding uuid;
  v_processed integer := 0;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_catalog_version uuid;
  v_mapper_reference_id text;
begin
  if p_limit<1 or p_limit>1000 then raise exception 'classification batch limit out of range'; end if;
  for v_job in
    select * from public.product_behavior_reclassification_queue q
    where q.status in ('pending','failed') and q.attempt_count<q.max_attempts
    order by q.queued_at,q.id
    for update skip locked
    limit p_limit
  loop
    v_processed := v_processed+1;
    update public.product_behavior_reclassification_queue set
      status='running',attempt_count=attempt_count+1,started_at=now(),completed_at=null,
      progress='{"stage":"classifying","completed":0,"total":1}'::jsonb,
      last_error_code=null,last_error_message=null,updated_at=now()
    where id=v_job.id;
    begin
      -- Serialize the authority check, classifier and current-binding publish for
      -- one immutable entity. Without this lock an older worker can validate A,
      -- wait while a newer B job publishes, then overwrite B with A.
      perform pg_advisory_xact_lock(hashtextextended(
        'product-behavior:'||v_job.entity_kind||':'||v_job.entity_id,0
      ));
      if v_job.source_fingerprint is distinct from
        public.product_behavior_entity_fingerprint_v1(v_job.entity_kind,v_job.entity_id) then
        update public.product_behavior_reclassification_queue set
          status='succeeded',result_binding_id=null,completed_at=now(),
          progress=jsonb_build_object('stage','superseded','completed',1,'total',1),updated_at=now()
        where id=v_job.id;
        v_succeeded:=v_succeeded+1;
        continue;
      end if;
      v_mapper_reference_id := null;
      if v_job.entity_kind='catalog_product_version' then
        -- A canonical Mapper reference has no product-owned authority. The
        -- catalog classifier would answer BASE_RECIPE from label evidence it
        -- can never have, so route it back to the Mapper authority.
        select nullif(regexp_replace(coalesce(p.normalized_identity,''),'^mapper:','','i'),'')
        into v_mapper_reference_id
        from public.products p
        where p.current_version_id=v_job.entity_id::uuid
          and p.product_kind='mapper_reference'
          and p.is_active and p.merged_into_product_id is null
        limit 1;
        if v_mapper_reference_id is not null and not exists(
          select 1 from public.mapper_basement m
          where m.ingredient_id=v_mapper_reference_id and m.is_active
        ) then
          v_mapper_reference_id := null;
        end if;
      end if;
      if v_job.entity_kind='mapper' or v_mapper_reference_id is not null then
        v_binding := public.classify_mapper_product_behavior_v2(
          coalesce(v_mapper_reference_id,v_job.entity_id),v_job.classifier_version
        );
        -- Catalog bindings inherit the Mapper classification. Re-enqueue every
        -- dependent immutable version after the Mapper binding is published so
        -- UUID queue order can never leave a catalog product on the old Mapper
        -- or process authority.
        for v_catalog_version in
          select p.current_version_id
          from public.products p
          join public.product_behavior_bindings b
            on b.id=p.current_behavior_binding_id and b.is_current
          where p.is_active and p.merged_into_product_id is null
            and p.product_kind<>'mapper_reference'
            and p.current_version_id is not null
            and b.mapper_ingredient_id=coalesce(v_mapper_reference_id,v_job.entity_id)
          order by p.id
        loop
          perform public.enqueue_product_behavior_reclassification_v1(
            'catalog_product_version',v_catalog_version::text,'mapper_binding_published'
          );
        end loop;
      else
        v_binding := public.classify_catalog_product_behavior_v2(v_job.entity_id::uuid,v_job.classifier_version);
      end if;
      update public.product_behavior_reclassification_queue set
        status='succeeded',result_binding_id=v_binding,completed_at=now(),
        progress='{"stage":"published","completed":1,"total":1}'::jsonb,updated_at=now()
      where id=v_job.id;
      v_succeeded := v_succeeded+1;
    exception when others then
      update public.product_behavior_reclassification_queue set
        status='failed',completed_at=now(),last_error_code=sqlstate,
        last_error_message=left(sqlerrm,1000),
        progress=jsonb_build_object('stage','failed','completed',0,'total',1),updated_at=now()
      where id=v_job.id;
      v_failed := v_failed+1;
    end;
  end loop;
  return jsonb_build_object('processed',v_processed,'succeeded',v_succeeded,'failed',v_failed);
end $$;

-- ---------------------------------------------------------------------------
-- 7. The served gate answers BASE_RECIPE/TOPPING for a canonical Mapper
--    identity from the canonical authority, never from a stored mirror, and
--    the per-product profile allow-list branch is gone. Profile compatibility
--    keeps its own fact-derived rules (vegan verification, protein behavior).
-- ---------------------------------------------------------------------------
do $patch_evidence_gate$
declare
  v_definition text;
  v_patched text;
  v_declare_old text;
  v_declare_new text;
  v_gate_old text;
  v_gate_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'::regprocedure
  );
  v_declare_old:=$old$  v_allowed boolean := false;
begin$old$;
  v_declare_new:=$new$  v_allowed boolean := false;
  v_canonical_modules jsonb;
begin$new$;
  v_gate_old:=$old$  v_profile_allowed := case
    when v_profile_applicability->>'authorityType'='CANONICAL_RECIPE_PROFILE_ALLOWLIST'
      then coalesce(v_profile_applicability->>v_profile,'blocked')='eligible'
    when v_profile in ('vegan_gelato','sorbet') then v_vegan='verified'
    when v_profile='protein_gelato' then v_protein<>'unknown'
    else true
  end;$old$;
  v_gate_new:=$new$  v_profile_allowed := case
    when v_profile in ('vegan_gelato','sorbet') then v_vegan='verified'
    when v_profile='protein_gelato' then v_protein<>'unknown'
    else true
  end;
  -- CANONICAL MODULE ELIGIBILITY: for a canonical Mapper identity the module
  -- answer is recomputed from Mapper, so a stale or foreign-classifier mirror
  -- can never veto a product the catalogue approves, and never approve one it
  -- does not. Profile and process authority are unchanged and evaluated
  -- separately below.
  if p_entity_kind='mapper' then
    v_canonical_modules:=public.canonical_module_eligibility_v1(p_entity_id);
    v_permissions:=coalesce(v_permissions,'{}'::jsonb) || jsonb_build_object(
      'BASE_RECIPE',coalesce((v_canonical_modules->>'BASE_RECIPE')::boolean,false),
      'TOPPING',coalesce((v_canonical_modules->>'TOPPING')::boolean,false)
    );
    v_profile_applicability:=coalesce(v_profile_applicability,'{}'::jsonb)
      || jsonb_build_object(
        'authorityType','CANONICAL_MODULE_ELIGIBILITY',
        'authorityVersion','canonical-module-eligibility-v1',
        'productRole',coalesce(v_canonical_modules->>'productRole','BLOCKED')
      );
  end if;$new$;
  if strpos(v_definition,v_gate_new)>0 then
    return;
  end if;
  if strpos(v_definition,v_declare_old)=0 then
    raise exception 'ProductBehavior gate declaration anchor drifted';
  end if;
  if strpos(v_definition,v_gate_old)=0 then
    raise exception 'ProductBehavior profile gate anchor drifted';
  end if;
  v_patched:=replace(v_definition,v_declare_old,v_declare_new);
  v_patched:=replace(v_patched,v_gate_old,v_gate_new);
  execute v_patched;
end;
$patch_evidence_gate$;

-- ---------------------------------------------------------------------------
-- 8. PICKER PARITY: the BASE picker and the TOPPING picker read the same
--    authority the BASE_RECIPE/TOPPING gates read.
-- ---------------------------------------------------------------------------
do $patch_product_search$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  v_definition:=pg_get_functiondef(
    'public.search_products_v1(text,text,text,text[],boolean,text,text,integer,integer,jsonb)'::regprocedure
  );
  v_old:=$old$      (m.is_active and coalesce(p.status,'')<>'rejected' and m.approved_for_base) usable_in_base,$old$;
  v_new:=$new$      (m.is_active and coalesce(p.status,'')<>'rejected' and m.approved_for_base
        and public.canonical_module_product_role_v1(
          m.ingredient_category,m.ingredient_subcategory
        ) in ('BASE_ONLY','BASE_AND_TOPPING')) usable_in_base,$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'product search base eligibility anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;
  v_old:=$old$      (m.is_active and coalesce(p.status,'')<>'rejected' and m.approved_for_base) usable_as_topping,$old$;
  v_new:=$new$      (m.is_active and coalesce(p.status,'')<>'rejected' and m.approved_for_base
        and public.canonical_module_product_role_v1(
          m.ingredient_category,m.ingredient_subcategory
        ) in ('TOPPING_ONLY','BASE_AND_TOPPING')) usable_as_topping,$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'product search topping eligibility anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;
  v_old:=$old$        when e.context='TOPPING' and not m.approved_for_base
          then 'Niedostępny jako topping'$old$;
  v_new:=$new$        when e.context='TOPPING' and not (m.approved_for_base
            and public.canonical_module_product_role_v1(
              m.ingredient_category,m.ingredient_subcategory
            ) in ('TOPPING_ONLY','BASE_AND_TOPPING'))
          then 'Niedostępny jako topping'$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'product search topping reason anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;
  v_old:=$old$        when e.context='BASE' and not m.approved_for_base
          then 'Brak zatwierdzenia PINGÜINO Base'$old$;
  v_new:=$new$        when e.context='BASE' and not (m.approved_for_base
            and public.canonical_module_product_role_v1(
              m.ingredient_category,m.ingredient_subcategory
            ) in ('BASE_ONLY','BASE_AND_TOPPING'))
          then 'Brak zatwierdzenia PINGÜINO Base'$new$;
  if strpos(v_definition,v_new)=0 then
    if strpos(v_definition,v_old)=0 then
      raise exception 'product search base reason anchor drifted';
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;
  v_patched:=v_definition;
  execute v_patched;
end;
$patch_product_search$;

-- ---------------------------------------------------------------------------
-- 9. Republish every canonical Mapper binding through the single authority.
-- ---------------------------------------------------------------------------
do $republish_canonical_bindings$
declare
  v_id text;
begin
  for v_id in
    select m.ingredient_id from public.mapper_basement m
    where m.is_active
      and exists(
        select 1 from public.products p
        where p.product_kind='mapper_reference'
          and p.normalized_identity='mapper:'||m.ingredient_id
          and p.is_active and p.merged_into_product_id is null
          and p.current_version_id is not null
      )
    order by m.ingredient_id
  loop
    perform public.classify_mapper_product_behavior_v2(
      v_id,'canonical-module-eligibility-v1'
    );
  end loop;
end;
$republish_canonical_bindings$;

-- ---------------------------------------------------------------------------
-- 10. SINGLE SOURCE OF TRUTH ASSERTION — fail closed on any contradiction
--     between the canonical authority and the published canonical binding.
-- ---------------------------------------------------------------------------
do $assert_no_contradictions$
declare
  v_contradictions integer;
  v_sample text;
  v_role_leak integer;
begin
  select count(*),min(m.ingredient_id) into v_contradictions,v_sample
  from public.mapper_basement m
  join public.products p on p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:'||m.ingredient_id
    and p.is_active and p.merged_into_product_id is null
  join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
  where m.is_active
    and (
      coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
        is distinct from coalesce(
          (public.canonical_module_eligibility_v1(m.ingredient_id)->>'BASE_RECIPE')::boolean,false)
      or coalesce((b.profile_permissions->>'TOPPING')::boolean,false)
        is distinct from coalesce(
          (public.canonical_module_eligibility_v1(m.ingredient_id)->>'TOPPING')::boolean,false)
    );
  if v_contradictions>0 then
    raise exception 'canonical module eligibility contradictions remain: % (first %)',
      v_contradictions,v_sample;
  end if;

  -- A post-process inclusion must never be base-eligible, and a structural
  -- product must never be topping-eligible.
  select count(*) into v_role_leak
  from public.mapper_basement m
  where m.is_active and (
    (public.canonical_module_product_role_v1(m.ingredient_category,m.ingredient_subcategory)='TOPPING_ONLY'
      and coalesce((public.canonical_module_eligibility_v1(m.ingredient_id)->>'BASE_RECIPE')::boolean,false))
    or (public.canonical_module_product_role_v1(m.ingredient_category,m.ingredient_subcategory)='BASE_ONLY'
      and coalesce((public.canonical_module_eligibility_v1(m.ingredient_id)->>'TOPPING')::boolean,false))
  );
  if v_role_leak>0 then
    raise exception 'canonical product role leaked into the wrong module: %',v_role_leak;
  end if;
end;
$assert_no_contradictions$;

-- ---------------------------------------------------------------------------
-- 11. CORE INGREDIENT INVARIANT — every identity a fresh starter can emit must
--     satisfy the module eligibility its own canonical authority requires.
-- ---------------------------------------------------------------------------
do $assert_core_identities$
declare
  v_core text[] := array[
    'PI-ING-000038','PI-ING-000102','PI-ING-000180','PI-ING-000236','PI-ING-000237',
    'PI-ING-000264','PI-ING-000270','PI-ING-000294','PI-ING-000295','PI-ING-000345',
    'PI-ING-000394','PI-ING-000451','PI-ING-000452','PI-ING-000456','PI-ING-000458',
    'PI-ING-000492','PI-ING-000494','PI-ING-000514','PI-ING-000614','PI-ING-001395',
    'PI-ING-001409','PI-ING-001451','PI-ING-001578'
  ];
  v_id text;
begin
  foreach v_id in array v_core loop
    if not coalesce(
      (public.canonical_module_eligibility_v1(v_id)->>'BASE_RECIPE')::boolean,false
    ) then
      raise exception 'core starter identity % is not BASE_RECIPE eligible',v_id;
    end if;
    if not exists(
      select 1 from public.products p
      join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      where p.product_kind='mapper_reference'
        and p.normalized_identity='mapper:'||v_id
        and p.is_active
        and coalesce((b.profile_permissions->>'BASE_RECIPE')::boolean,false)
    ) then
      raise exception 'core starter identity % has no BASE_RECIPE binding',v_id;
    end if;
  end loop;
end;
$assert_core_identities$;

commit;
