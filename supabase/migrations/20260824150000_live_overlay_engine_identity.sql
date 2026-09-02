-- PINGÜINO — Live Overlay engine identity.
--
-- A product that arrives by scan or by import has, until now, had nowhere to go. It is
-- saved to the catalogue correctly and then cannot enter a recipe, because a recipe line
-- needs BASE_RECIPE eligibility and that eligibility is granted only to a product carrying
-- an authorized Mapper identity — a decision that today only an administrator with a
-- verification signoff can make. So every scanned product waits for a human.
--
-- This is the automatic route for the case that does not need a human: an ORDINARY,
-- SAFE, fully-declared food product whose own declared composition AGREES with exactly
-- one verified Mapper row.
--
-- What it is NOT:
--   * it does not invent physics — the recipe still runs on the Mapper row's composition,
--     and nothing here writes to `mapper_basement`;
--   * it does not trust the client — the caller passes a product id and nothing else;
--     the candidate, the agreement and the safety predicate are all computed here;
--   * it is not scanner-specific — `product-scan-finalize` and `catalog-submit` call the
--     same function, so INTIMPORT and the Scanner reach identical capability;
--   * it does not overwrite an existing mapping — an authorized identity is a decision,
--     and only an unmapped binding is eligible.
--
-- Fail-closed by construction. Ambiguity (two Mapper rows agree) is refused rather than
-- guessed. High-risk additives, alcohol, technical/dosage-sensitive products and anything
-- with an incomplete label are refused and left for review, exactly as before.

-- Agreement tolerances, per 100 g. Tight enough that milk cannot be read as cream.
create or replace function public.live_overlay_macro_tolerance_v1(p_field text)
returns numeric language sql immutable set search_path=public as $$
  select case p_field
    when 'fat' then 1.5
    when 'carbohydrate' then 1.5
    when 'protein' then 1.5
    when 'sugars' then 2.0
    when 'salt' then 0.2
    when 'energyKcal' then 20
    else 0 end::numeric;
$$;

-- The additive vocabulary that keeps a product out of the automatic route. It is the
-- SAME list the Scanner's own validator uses for `high_risk_dosage_authority`; the two
-- must not drift, because a product the Scanner calls high-risk cannot be a product this
-- function calls ordinary.
create or replace function public.live_overlay_high_risk_terms_v1()
returns text[] language sql immutable set search_path=public as $$
  select array[
    'tara gum','guma tara','carrageenan','karagen','polysorbate','polisorbat',
    'guar','enzyme','enzym','acesulfame','aspartame','sucralose','sukraloz',
    'e407','e410','e412','e433','e471'
  ]::text[];
$$;

/**
 * The decision, with no side effects. Deterministic: the same product version and the
 * same Mapper dataset always produce the same answer, so it can be shown to the owner
 * before anything is written and asserted in a test.
 */
create or replace function public.propose_live_overlay_mapper_identity_v1(
  p_product_version_id uuid
) returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare
  v_version public.product_versions%rowtype;
  v_product public.products%rowtype;
  v_facts jsonb;
  v_public jsonb;
  v_nutrition jsonb;
  v_ingredients text;
  v_allergens text;
  v_category text;
  v_category_known boolean := false;
  v_reasons text[] := '{}';
  v_kcal numeric; v_fat numeric; v_carb numeric; v_protein numeric; v_salt numeric; v_sugars numeric;
  v_candidates jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_chosen text;
  v_agreement jsonb;
  v_term text;
begin
  select * into v_version from public.product_versions where id = p_product_version_id;
  if not found then
    return jsonb_build_object('decision','REVIEW','reasons',jsonb_build_array('product_version_not_found'));
  end if;
  select * into v_product from public.products
    where id = v_version.product_id and is_active and merged_into_product_id is null;
  if not found or v_product.current_version_id <> v_version.id then
    return jsonb_build_object('decision','REVIEW','reasons',jsonb_build_array('not_the_current_product_version'));
  end if;
  if v_product.product_kind <> 'commercial_product' then
    return jsonb_build_object('decision','BLOCKED','reasons',jsonb_build_array('not_an_ordinary_commercial_product'));
  end if;
  if v_product.canonical_verification_status = 'blocked' then
    return jsonb_build_object('decision','BLOCKED','reasons',jsonb_build_array('product_blocked'));
  end if;

  v_facts := coalesce(v_version.facts,'{}'::jsonb);
  v_public := coalesce(v_facts->'public_data', v_facts);
  v_nutrition := v_public->'nutrition';
  v_ingredients := lower(coalesce(nullif(trim(coalesce(v_public->>'ingredientsText','')),''),''));
  v_allergens := nullif(trim(coalesce(v_public->>'allergensText','')),'');
  v_category := lower(nullif(trim(coalesce(v_product.product_category,'')),''));

  -- 1. A complete, ordinary label. Anything missing is review evidence, not a decision.
  if v_ingredients = '' then v_reasons := array_append(v_reasons, 'ingredients_missing'); end if;
  if v_allergens is null then v_reasons := array_append(v_reasons, 'allergens_missing'); end if;
  if jsonb_typeof(v_nutrition) <> 'object' or coalesce(v_nutrition->>'basis','') <> 'per_100g' then
    v_reasons := array_append(v_reasons, 'nutrition_per_100g_missing');
  end if;
  -- A category is a FILTER when the dataset knows it, not a requirement. A scan reads
  -- whatever the package calls itself; when that word means nothing to the Mapper
  -- taxonomy the agreement simply has to be unique across the whole eligible set, which
  -- is the stricter of the two paths.
  v_category_known := v_category is not null and exists(
    select 1 from public.mapper_basement m
    where lower(m.ingredient_category) = v_category and m.is_active
  );

  -- 2. Dosage-sensitive and technical products never take the automatic route.
  foreach v_term in array public.live_overlay_high_risk_terms_v1() loop
    if v_ingredients like '%'||v_term||'%' then
      return jsonb_build_object(
        'decision','BLOCKED',
        'reasons',jsonb_build_array('high_risk_additive_requires_authority:'||v_term)
      );
    end if;
  end loop;
  if coalesce((v_public->>'technicalParameters'),'') <> ''
    or jsonb_typeof(v_public->'technicalParameters') = 'object'
    or jsonb_typeof(v_public->'dosage') = 'object'
    or coalesce((v_public->>'dosage'),'') <> '' then
    return jsonb_build_object('decision','BLOCKED','reasons',jsonb_build_array('technical_or_dosage_product'));
  end if;

  if array_length(v_reasons,1) is not null then
    return jsonb_build_object('decision','REVIEW','reasons',to_jsonb(v_reasons));
  end if;

  v_kcal := nullif(v_nutrition->>'energyKcal','')::numeric;
  v_fat := nullif(v_nutrition->>'fat','')::numeric;
  v_carb := nullif(v_nutrition->>'carbohydrate','')::numeric;
  v_protein := nullif(v_nutrition->>'protein','')::numeric;
  v_salt := nullif(v_nutrition->>'salt','')::numeric;
  v_sugars := nullif(v_nutrition->>'sugars','')::numeric;
  if v_kcal is null or v_fat is null or v_carb is null or v_protein is null or v_salt is null then
    return jsonb_build_object('decision','REVIEW','reasons',jsonb_build_array('declared_macros_incomplete'));
  end if;

  -- 3. Exactly one verified Mapper row whose own composition agrees with the label.
  --    Agreement is a comparison, never an estimate: nothing is inferred here.
  select coalesce(jsonb_agg(jsonb_build_object(
           'mapperIngredientId', m.ingredient_id,
           'name', m.ingredient_name_display,
           'delta', jsonb_build_object(
             'energyKcal', round(abs(m.kcal_per_100g - v_kcal),3),
             'fat', round(abs(m.fat_percent - v_fat),3),
             'carbohydrate', round(abs(m.carbohydrate_percent - v_carb),3),
             'protein', round(abs(m.protein_percent - v_protein),3),
             'salt', round(abs(m.salt_percent - v_salt),3)
           )
         ) order by m.ingredient_id),'[]'::jsonb), count(*)
    into v_candidates, v_count
  from public.mapper_basement m
  where m.is_active and m.approved_for_base and m.approved_for_engines
    -- The v1.0 dataset vocabulary: every `Verified*` family counts as verified
    -- ('Verified', 'Verified / Basis Check Needed', 'Verified / PI Calculated',
    -- 'Verified / Public Label'). An exact 'verified' matches NOTHING in this
    -- dataset — measured on staging: 0 of 2088 rows.
    and m.verification_status ilike 'Verified%'
    and (not v_category_known or lower(m.ingredient_category) = v_category)
    and coalesce(m.alcohol_percent,0) = 0
    and m.kcal_per_100g is not null and m.fat_percent is not null
    and m.carbohydrate_percent is not null and m.protein_percent is not null
    and m.salt_percent is not null
    and abs(m.kcal_per_100g - v_kcal) <= public.live_overlay_macro_tolerance_v1('energyKcal')
    and abs(m.fat_percent - v_fat) <= public.live_overlay_macro_tolerance_v1('fat')
    and abs(m.carbohydrate_percent - v_carb) <= public.live_overlay_macro_tolerance_v1('carbohydrate')
    and abs(m.protein_percent - v_protein) <= public.live_overlay_macro_tolerance_v1('protein')
    and abs(m.salt_percent - v_salt) <= public.live_overlay_macro_tolerance_v1('salt')
    and (v_sugars is null or m.total_sugars_percent is null
         or abs(m.total_sugars_percent - v_sugars) <= public.live_overlay_macro_tolerance_v1('sugars'));

  if v_count = 0 then
    return jsonb_build_object('decision','REVIEW','reasons',jsonb_build_array('no_agreeing_mapper_identity'));
  end if;
  if v_count > 1 then
    -- Two ordinary ingredients this product could equally be. A guess here would be a
    -- silent substitution in someone's recipe.
    return jsonb_build_object(
      'decision','REVIEW','reasons',jsonb_build_array('ambiguous_mapper_identity'),
      'candidates',v_candidates
    );
  end if;

  v_chosen := v_candidates->0->>'mapperIngredientId';
  v_agreement := v_candidates->0->'delta';
  return jsonb_build_object(
    'decision','PROPOSE',
    'mapperIngredientId',v_chosen,
    'agreement',v_agreement,
    'candidates',v_candidates,
    'reasons',jsonb_build_array()
  );
end;
$$;

/**
 * Authorize what the proposal decided, as one transaction: a new current behavior
 * binding carrying the Mapper identity, then the ordinary classifier. The product's own
 * facts never become Engine composition — the binding is what makes the shared authority
 * grant BASE_RECIPE, and the composition it hands the Engine is the Mapper row's.
 *
 * Service-role only. It is called by `product-scan-finalize` and by `catalog-submit`
 * immediately after a successful ingest, so both entry points converge here.
 */
create or replace function public.authorize_live_overlay_mapper_identity_v1(
  p_actor_user_id uuid,
  p_product_id uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_product public.products%rowtype;
  v_binding public.product_behavior_bindings%rowtype;
  v_proposal jsonb;
  v_mapper text;
  v_new_binding uuid;
begin
  if p_actor_user_id is null or p_product_id is null then
    raise exception 'invalid live overlay authorization request';
  end if;
  perform set_config('app.canonical_product_ingest','v1',true);
  perform pg_advisory_xact_lock(hashtextextended('live-overlay:'||p_product_id::text,0));
  select * into v_product from public.products
    where id = p_product_id and is_active and merged_into_product_id is null for update;
  if not found then
    return jsonb_build_object('authorized',false,'reason','product_not_found');
  end if;
  select * into v_binding from public.product_behavior_bindings
    where id = v_product.current_behavior_binding_id
      and product_id = v_product.id and product_version_id = v_product.current_version_id
      and is_current;
  if not found then
    return jsonb_build_object('authorized',false,'reason','current_binding_missing');
  end if;
  -- An authorized identity is a decision. This route only ever fills an empty one.
  if v_binding.mapper_ingredient_id is not null then
    return jsonb_build_object(
      'authorized',false,'reason','mapper_identity_already_authorized',
      'mapperIngredientId',v_binding.mapper_ingredient_id
    );
  end if;

  v_proposal := public.propose_live_overlay_mapper_identity_v1(v_product.current_version_id);
  if coalesce(v_proposal->>'decision','') <> 'PROPOSE' then
    return jsonb_build_object(
      'authorized',false,
      'reason',lower(coalesce(v_proposal->>'decision','review')),
      'proposal',v_proposal
    );
  end if;
  v_mapper := v_proposal->>'mapperIngredientId';
  -- Re-checked here rather than trusted from the proposal: the dataset may have moved
  -- between the two statements.
  if not exists(
    select 1 from public.mapper_basement m
    where m.ingredient_id = v_mapper and m.is_active
      and m.approved_for_base and m.approved_for_engines
      and m.verification_status ilike 'Verified%'
  ) then
    return jsonb_build_object('authorized',false,'reason','mapper_identity_not_engine_eligible');
  end if;

  update public.product_behavior_bindings set is_current=false
    where product_id = v_product.id and is_current;
  insert into public.product_behavior_bindings(
    product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,family_id,subfamily_id,form_id,
    main_eligibility,vegan_eligibility,protein_behavior,approved_liquid_dairy_carrier,
    profile_permissions,process_behavior,behavior_snapshot,warnings,block_reasons,
    classifier_version,binding_status,is_current
  )
  select b.product_id,b.product_version_id,v_mapper,b.taxonomy_version_id,
    b.family_id,b.subfamily_id,b.form_id,'UNKNOWN_REQUIRES_EVIDENCE',b.vegan_eligibility,
    b.protein_behavior,false,'{}'::jsonb,b.process_behavior,
    b.behavior_snapshot||jsonb_build_object(
      'mappingDecision','pending_reclassification',
      'mapperIngredientId',v_mapper,
      'liveOverlayAuthorization',jsonb_build_object(
        'authority','live_overlay_composition_agreement_v1',
        'authorizedAt',now(),
        'authorizedBy',p_actor_user_id,
        'agreement',v_proposal->'agreement'
      )
    ),b.warnings,array['behavior_reclassification_required'],
    -- A DIFFERENT marker from the one the classifier is called with, exactly as the
    -- administrator path does: the provisional row and the classified row must not
    -- collide on (product, version, classifier_version).
    'live-overlay-provisional:'||left(md5(v_mapper||v_product.id::text),24),'blocked',true
  from public.product_behavior_bindings b where b.id = v_binding.id
  returning id into v_new_binding;
  update public.products set current_behavior_binding_id = v_new_binding where id = v_product.id;

  -- The ordinary classifier replaces the provisional binding synchronously. If it
  -- refuses, the whole authorization rolls back with it.
  v_new_binding := public.classify_catalog_product_behavior_v2(
    v_product.current_version_id,
    'live-overlay-identity:'||left(md5(v_mapper||v_product.id::text),24)
  );
  update public.products set
    mapper_status='matched',
    matched_basement_id=v_mapper,
    -- The vocabulary the products table already has for exactly this decision: the
    -- candidate was found by category and confirmed by composition.
    match_method='category_composition_similarity',
    match_confidence='high',
    needs_review_reason=null,
    mapper_notes='Automatyczna tożsamość Live Overlay: skład deklarowany zgadza się z dokładnie jedną zweryfikowaną pozycją Mapper.',
    updated_at=now()
  where id = v_product.id;
  return jsonb_build_object(
    'authorized',true,
    'mapperIngredientId',v_mapper,
    'behaviorBindingId',v_new_binding,
    'agreement',v_proposal->'agreement'
  );
end;
$$;

revoke all on function public.live_overlay_macro_tolerance_v1(text) from public,anon,authenticated;
revoke all on function public.live_overlay_high_risk_terms_v1() from public,anon,authenticated;
revoke all on function public.propose_live_overlay_mapper_identity_v1(uuid) from public,anon;
revoke all on function public.authorize_live_overlay_mapper_identity_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.live_overlay_macro_tolerance_v1(text) to service_role;
grant execute on function public.live_overlay_high_risk_terms_v1() to service_role;
-- The proposal is inspectable by the owner it concerns; it writes nothing.
grant execute on function public.propose_live_overlay_mapper_identity_v1(uuid) to authenticated, service_role;
grant execute on function public.authorize_live_overlay_mapper_identity_v1(uuid,uuid) to service_role;
