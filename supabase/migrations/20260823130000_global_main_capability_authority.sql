-- GLOBAL MAIN AUTHORITY v1.4 — Mapper/Product-Intelligence driven Main
-- capability, with no SKU whitelist as the eligibility mechanism.
--
-- The old architecture answered ONE question ("is there an approved Main
-- envelope for this exact product and profile?") and used it for TWO decisions
-- (may this product define the recipe, and how much of it may PI choose).
-- Consequently a legitimate flavour ingredient — Banana in Sorbet, cocoa or
-- coffee in Gelato — was not selectable as Main at all, and every new product
-- needed a hand-authored SQL row before the owner could state their intent.
--
-- This migration separates the two questions:
--
--   * SEMANTIC CAPABILITY  — derived from the product's canonical functional
--     role (Mapper category/subcategory -> family/subfamily/form -> behaviour
--     role). It answers "can this define flavour?".
--   * CALIBRATION          — the approved Main envelope, exact-product or
--     family level. It answers "how much may PI choose by itself?".
--
-- A semantically capable product with no envelope resolves to
-- MAIN_CAPABLE_UNCALIBRATED: the owner may set it as Main, PINGÜINO holds
-- their grams and ratio exactly and optimises the supporting ingredients
-- around them. No percentage floor/ceiling is invented.
--
-- Everything here is additive. No table is dropped, no policy row is deleted,
-- no existing calibrated envelope changes, and mapper_basement is untouched.

-- ---------------------------------------------------------------------------
-- 1. Taxonomy data, so subfamily stops depending on an exact-id CASE.
-- ---------------------------------------------------------------------------

insert into public.product_taxonomy_nodes(taxonomy_version_id,id,parent_id,kind,canonical_name)
values
  ('pinguino-product-taxonomy-v1','citrus','fruit','subfamily','Citrus'),
  ('pinguino-product-taxonomy-v1','mango_tropical','fruit','subfamily','Mango / tropical')
on conflict do nothing;

-- Multilingual taxonomy aliases. This is TAXONOMY data (what is this fruit),
-- never a Main allow-list: a product matched here still needs an approved
-- policy to be calibrated, and a product NOT matched here is still Main-capable
-- through its family. New products inherit their subfamily automatically.
insert into public.product_taxonomy_aliases(taxonomy_version_id,node_id,language,alias,normalized_alias)
select 'pinguino-product-taxonomy-v1', node_id, language, alias, lower(alias)
from (values
  ('berry','en','raspberry'),('berry','en','raspberries'),('berry','en','blackberry'),
  ('berry','en','blackberries'),('berry','en','blueberry'),('berry','en','blueberries'),
  ('berry','en','strawberries'),('berry','en','redcurrant'),('berry','en','blackcurrant'),
  ('berry','en','currant'),('berry','en','currants'),('berry','en','gooseberry'),
  ('berry','en','cranberry'),('berry','en','cranberries'),('berry','en','elderberry'),
  ('berry','pl','malina'),('berry','pl','maliny'),('berry','pl','borowka'),
  ('berry','pl','jagoda'),('berry','pl','porzeczka'),('berry','pl','truskawki'),
  ('berry','es','frambuesa'),('berry','es','arandano'),('berry','es','mora'),
  ('berry','de','himbeere'),('berry','de','heidelbeere'),
  ('berry','it','lampone'),('berry','it','mirtillo'),
  ('berry','fr','framboise'),('berry','fr','myrtille'),
  ('banana','en','banana'),('banana','en','bananas'),('banana','pl','banan'),
  ('banana','es','platano'),('banana','de','banane'),('banana','it','banana'),
  ('kiwi','en','kiwi'),('kiwi','pl','kiwi'),
  ('citrus','en','lemon'),('citrus','en','lime'),('citrus','en','orange'),
  ('citrus','en','grapefruit'),('citrus','en','mandarin'),('citrus','en','tangerine'),
  ('citrus','en','clementine'),('citrus','en','bergamot'),('citrus','en','yuzu'),
  ('citrus','en','citrus'),('citrus','en','citron'),
  ('citrus','pl','cytryna'),('citrus','pl','limonka'),('citrus','pl','pomarancza'),
  ('citrus','es','limon'),('citrus','es','naranja'),('citrus','es','pomelo'),
  ('citrus','it','limone'),('citrus','it','arancia'),
  ('mango_tropical','en','mango'),('mango_tropical','en','passion'),
  ('mango_tropical','en','passionfruit'),('mango_tropical','en','maracuya'),
  ('mango_tropical','en','pineapple'),('mango_tropical','en','papaya'),
  ('mango_tropical','en','guava'),('mango_tropical','en','lychee'),
  ('mango_tropical','pl','marakuja'),('mango_tropical','pl','ananas'),
  ('mango_tropical','pl','papaja'),('mango_tropical','es','pina'),
  ('mango_tropical','it','ananas')
) as seed(node_id,language,alias)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Subfamily derivation without exact ingredient ids (owner v1.4 §2).
--
-- The historical CASE pinned six exact PI-ING identities. Those six products
-- keep exactly the same subfamily here, but now because of what they ARE, not
-- because of who they are: whole-token alias matching against the published
-- taxonomy, with the structured subcategory rules retained as a fallback.
-- Token matching (never `like '%lemon%'`) is what keeps WATERMELON out of the
-- citrus subfamily.
-- ---------------------------------------------------------------------------

create or replace function public.taxonomy_subfamily_from_text_v1(
  p_taxonomy_version_id text,
  p_family text,
  p_text text
) returns text
language sql stable
set search_path=pg_catalog,public
as $$
  select a.node_id
  from public.product_taxonomy_aliases a
  join public.product_taxonomy_nodes n
    on n.taxonomy_version_id=a.taxonomy_version_id and n.id=a.node_id
  join public.product_taxonomy_nodes parent
    on parent.taxonomy_version_id=n.taxonomy_version_id and parent.id=n.parent_id
  where a.taxonomy_version_id=p_taxonomy_version_id
    and n.kind='subfamily'
    and parent.id=p_family
    and a.normalized_alias = any(
      regexp_split_to_array(lower(coalesce(p_text,'')), '[^a-z0-9]+')
    )
  order by length(a.normalized_alias) desc, a.node_id
  limit 1
$$;

create or replace function public.mapper_behavior_subfamily_v3(
  p_family text,
  p_category text,
  p_subcategory text,
  p_name text
) returns text
language sql stable
set search_path=pg_catalog,public
as $$
  select coalesce(
    public.taxonomy_subfamily_from_text_v1(
      'pinguino-product-taxonomy-v1', p_family,
      coalesce(p_name,'')||' '||coalesce(p_subcategory,'')
    ),
    case
      when lower(coalesce(p_category,''))='fruit' and (
        lower(coalesce(p_subcategory,'')) like '%citrus%'
        or lower(coalesce(p_subcategory,'')) like '%lemon%'
        or lower(coalesce(p_subcategory,'')) like '%lime%'
        or lower(coalesce(p_subcategory,'')) like '%orange%'
      ) then 'citrus'
      when lower(coalesce(p_category,''))='fruit'
        and lower(coalesce(p_subcategory,'')) like '%tropical%' then 'mango_tropical'
      else null
    end
  )
$$;

-- The old exact-id function stays for signature compatibility but no longer
-- carries a whitelist: it delegates to the semantic derivation.
create or replace function public.mapper_behavior_subfamily_v2(
  p_ingredient_id text,
  p_category text,
  p_subcategory text
) returns text
language sql stable
set search_path=pg_catalog,public
as $$
  select public.mapper_behavior_subfamily_v3(
    public.mapper_behavior_family_v2(p_category,p_subcategory),
    p_category, p_subcategory,
    (select m.ingredient_name_display from public.mapper_basement m
      where m.ingredient_id=p_ingredient_id and m.is_active)
  )
$$;

revoke all on function public.taxonomy_subfamily_from_text_v1(text,text,text) from public,anon,authenticated;
revoke all on function public.mapper_behavior_subfamily_v3(text,text,text,text) from public,anon,authenticated;
grant execute on function public.taxonomy_subfamily_from_text_v1(text,text,text),
  public.mapper_behavior_subfamily_v3(text,text,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. THE canonical Main capability answer (owner v1.4 §3 / §26).
--
-- One function. UI, store, Engine, Rescue, Scanner and INTIMPORT all read the
-- same projection of it through resolve_product_behavior_v1.
-- ---------------------------------------------------------------------------

create or replace function public.main_capability_v1(
  p_resolved jsonb,
  p_context jsonb
) returns jsonb
language plpgsql stable
set search_path=pg_catalog,public
as $$
declare
  v_role text := coalesce(p_resolved->>'behaviorRole','');
  v_eligibility text := coalesce(p_resolved->>'mainEligibility','UNKNOWN');
  v_scope text := coalesce(p_context->>'processScope','BASE_FORMULATION');
  v_base text := coalesce(p_resolved#>>'{moduleEligibility,BASE_RECIPE}','blocked');
  v_profile text := coalesce(nullif(p_context->>'productProfile',''),'milk_gelato');
  v_mapper text := nullif(p_resolved->>'mapperIngredientId','');
  v_has_policy boolean := jsonb_typeof(p_resolved->'mainPolicy')='object';
  v_state text;
  v_reason text;
  v_calibration text := 'NONE';
begin
  if p_resolved->>'behaviorBindingId' is null then
    return jsonb_build_object(
      'capability','MAIN_UNKNOWN','reason','behavior_binding_missing',
      'authority','USER_HELD','calibrationLevel','NONE'
    );
  end if;
  if v_scope <> 'BASE_FORMULATION' then
    return jsonb_build_object(
      'capability','MAIN_TECHNICAL_BLOCKED','reason','post_process_product_not_base_main',
      'authority','USER_HELD','calibrationLevel','NONE'
    );
  end if;
  if v_base <> 'eligible' then
    return jsonb_build_object(
      'capability','MAIN_TECHNICAL_BLOCKED','reason','base_recipe_not_approved',
      'authority','USER_HELD','calibrationLevel','NONE'
    );
  end if;

  -- Semantic role, derived by the classifier from canonical functional
  -- semantics. `UNKNOWN_REQUIRES_EVIDENCE` is emitted only inside the
  -- classifier's flavour-candidate branch: the product IS a flavour carrier,
  -- only its governed form/concentration is unproven — a calibration gap.
  if v_role in ('STRUCTURAL_ONLY','NOT_MAIN')
    or (v_role = '' and v_eligibility = 'NOT_MAIN') then
    v_state := 'MAIN_TECHNICAL_BLOCKED'; v_reason := 'structural_product_not_flavour_main';
  elsif v_role = 'TOPPING_ONLY' or (v_role = '' and v_eligibility = 'TOPPING_ONLY') then
    v_state := 'MAIN_TECHNICAL_BLOCKED'; v_reason := 'post_process_product_not_base_main';
  elsif v_role = 'PROTEIN_CONTRIBUTOR_ONLY'
    or (v_role = '' and v_eligibility = 'PROTEIN_CONTRIBUTOR_ONLY') then
    v_state := 'MAIN_TECHNICAL_BLOCKED'; v_reason := 'protein_contributor_not_flavour_main';
  elsif v_role = 'STANDARD_ONLY' or (v_role = '' and v_eligibility = 'STANDARD_ONLY') then
    v_state := 'MAIN_TECHNICAL_BLOCKED'; v_reason := 'standard_product_not_flavour_main';
  elsif v_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','MAIN_CAPABLE_UNCALIBRATED',
                   'UNKNOWN_REQUIRES_EVIDENCE')
    or v_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','MAIN_BLOCKED_POLICY',
                         'MAIN_CAPABLE_UNCALIBRATED') then
    if v_has_policy then
      v_state := 'MAIN_CAPABLE'; v_reason := 'calibrated_main_policy';
      v_calibration := case
        when v_mapper is not null and exists (
          select 1 from public.product_behavior_policy_versions p
          where p.status='published' and p.product_profile=v_profile
            and p.exact_mapper_ingredient_id=v_mapper
            and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
        ) then 'EXACT_PRODUCT'
        else 'FAMILY'
      end;
    else
      v_state := 'MAIN_CAPABLE_UNCALIBRATED'; v_reason := 'user_held_no_calibration';
    end if;
  else
    v_state := 'MAIN_UNKNOWN'; v_reason := 'product_role_unknown';
  end if;

  return jsonb_build_object(
    'capability',v_state,
    'reason',v_reason,
    'authority',case when v_state='MAIN_CAPABLE' then 'CALIBRATED' else 'USER_HELD' end,
    'calibrationLevel',v_calibration
  );
end;
$$;

revoke all on function public.main_capability_v1(jsonb,jsonb) from public,anon;
grant execute on function public.main_capability_v1(jsonb,jsonb) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 4. Resolver wrapper: project the capability and stop letting a missing
--    envelope veto the owner's Main intent (§4, §5).
--
--    The 41 KB evidence gate is deliberately NOT rewritten. Its policy match,
--    identity, process and permission logic stay byte-identical; this wrapper
--    only adds the capability layer on top of its result.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_product_behavior_v1(
  p_entity_kind text,
  p_entity_id text,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path = pg_catalog, public
as $$
declare
  v_resolved jsonb;
  v_readiness jsonb;
  v_block_reasons jsonb;
  v_engine_ready boolean;
  v_role_ready boolean;
  v_process_only_block boolean;
  v_capability jsonb;
  v_state text;
  v_module text;
  v_module_state text;
  v_role_request text;
begin
  if p_context ? 'thermalMode'
    and nullif(p_context->>'thermalMode', '') is not null
    and p_context->>'thermalMode' not in ('COLD_ONLY', 'HEAT_CAPABLE') then
    raise exception 'invalid behavior thermal context' using errcode = '22023';
  end if;

  v_resolved := public.resolve_product_behavior_evidence_gate_v1(
    p_entity_kind, p_entity_id, p_context
  );

  -- GLOBAL MAIN AUTHORITY. Semantic capability first, calibration second.
  v_capability := public.main_capability_v1(v_resolved, p_context);
  v_state := v_capability->>'capability';
  v_module := coalesce(p_context->>'module','SEARCH');
  v_role_request := coalesce(p_context->>'requestedRole','STANDARD');
  v_resolved := jsonb_set(v_resolved,'{mainCapability}',to_jsonb(v_state),true);
  v_resolved := jsonb_set(v_resolved,'{mainAuthority}',to_jsonb(v_capability->>'authority'),true);
  v_resolved := jsonb_set(
    v_resolved,'{mainCalibrationLevel}',to_jsonb(v_capability->>'calibrationLevel'),true
  );
  v_resolved := jsonb_set(
    v_resolved,'{mainCapabilityReason}',to_jsonb(v_capability->>'reason'),true
  );
  if v_state in ('MAIN_CAPABLE','MAIN_CAPABLE_UNCALIBRATED') then
    v_resolved := jsonb_set(v_resolved,'{moduleEligibility,MAIN}','"eligible"'::jsonb,true);
    -- Reproduce the evidence gate's own rule for `state` with MAIN now
    -- eligible. It can only lift the Main veto; every other module permission,
    -- identity and profile condition is still the gate's untouched verdict.
    v_module_state := coalesce(v_resolved->'moduleEligibility'->>v_module,'blocked');
    if v_module_state in ('eligible','label_only') then
      v_resolved := jsonb_set(v_resolved,'{state}','"eligible"'::jsonb,true);
      -- "No approved range" is no longer a Main verdict; it is the calibration
      -- fact already carried by mainAuthority/mainCalibrationLevel.
      select coalesce(jsonb_agg(entry.value order by entry.ordinality),'[]'::jsonb)
      into v_block_reasons
      from jsonb_array_elements(coalesce(v_resolved->'blockReasons','[]'::jsonb))
        with ordinality entry(value, ordinality)
      where entry.value#>>'{}' not like 'main_policy_not_approved%'
        and entry.value#>>'{}' <> 'main_policy_missing'
        and entry.value#>>'{}' <> 'context_not_approved';
      v_resolved := jsonb_set(v_resolved,'{blockReasons}',v_block_reasons,true);
    end if;
    if v_state = 'MAIN_CAPABLE_UNCALIBRATED' then
      v_resolved := jsonb_set(
        v_resolved,'{blockReasons}',
        coalesce(v_resolved->'blockReasons','[]'::jsonb)
          || jsonb_build_array('main_user_held_no_calibration'),
        true
      );
    end if;
  end if;

  v_readiness := public.product_process_readiness_v1(v_resolved, p_context);
  v_resolved := jsonb_set(v_resolved, '{processReadiness}', v_readiness, true);

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  into v_block_reasons
  from jsonb_array_elements(
    coalesce(v_resolved->'blockReasons', '[]'::jsonb)
  ) with ordinality entry(value, ordinality)
  where entry.value#>>'{}' <> 'process_evidence_missing'
    and entry.value#>>'{}' not like 'process_evidence_unknown:%'
    -- User-held Main is a CALIBRATION fact, not a blocker. Leaving it in the
    -- blocker set would silently make every uncalibrated Main recipe
    -- Production-ineligible, which is exactly the coupling this migration
    -- removes. It stays visible in blockReasons for diagnostics below.
    and entry.value#>>'{}' <> 'main_user_held_no_calibration';

  v_process_only_block := jsonb_array_length(v_block_reasons) = 0;
  if v_state = 'MAIN_CAPABLE_UNCALIBRATED' then
    v_block_reasons := v_block_reasons
      || jsonb_build_array('main_user_held_no_calibration');
  end if;
  v_engine_ready :=
    coalesce(v_resolved#>>'{moduleEligibility,OPTIMAL}', 'blocked') = 'eligible'
    and coalesce(v_resolved#>>'{moduleEligibility,ECO}', 'blocked') = 'eligible';
  -- MAIN eligibility in the staging resolver also includes verified process
  -- evidence. Separate that factor here so a bounded advisory can remain MAIN
  -- only when the independent Main authority is actually present.
  v_role_ready := v_role_request = 'STANDARD'
    or v_state in ('MAIN_CAPABLE','MAIN_CAPABLE_UNCALIBRATED');

  if coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED' then
    v_resolved := jsonb_set(
      v_resolved, '{moduleEligibility,PRODUCTION}', '"blocked"'::jsonb, true
    );
    if v_module = 'PRODUCTION' then
      v_resolved := jsonb_set(v_resolved, '{state}', '"blocked"'::jsonb, true);
    end if;
    v_block_reasons := v_block_reasons || jsonb_build_array('process_readiness_blocked');
    v_resolved := jsonb_set(v_resolved, '{blockReasons}', v_block_reasons, true);
  elsif coalesce(p_context->>'processScope', 'BASE_FORMULATION') = 'BASE_FORMULATION'
    and nullif(v_resolved->>'mapperIngredientId', '') is not null
    and v_engine_ready and v_role_ready and v_process_only_block then
    v_resolved := jsonb_set(
      v_resolved, '{moduleEligibility,PRODUCTION}', '"eligible"'::jsonb, true
    );
    if v_module = 'PRODUCTION' then
      v_resolved := jsonb_set(v_resolved, '{state}', '"eligible"'::jsonb, true);
    end if;
    v_resolved := jsonb_set(v_resolved, '{blockReasons}', v_block_reasons, true);
  end if;

  return v_resolved;
end;
$$;

revoke all on function public.resolve_product_behavior_v1(text,text,jsonb)
  from public, anon;
grant execute on function public.resolve_product_behavior_v1(text,text,jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Server-owned audit projection for the full Mapper sweep (§12 / §38).
-- ---------------------------------------------------------------------------

create or replace view public.mapper_main_capability_audit_v1 as
select
  m.ingredient_id,
  m.ingredient_name_display as name,
  m.ingredient_category as category,
  m.ingredient_subcategory as subcategory,
  b.family_id,
  b.subfamily_id,
  b.form_id,
  b.behavior_role,
  b.main_eligibility,
  b.main_policy_status,
  case
    when b.id is null then 'MAIN_UNKNOWN'
    when not (m.approved_for_base and m.approved_for_engines) then 'MAIN_TECHNICAL_BLOCKED'
    when b.behavior_role in ('STRUCTURAL_ONLY','NOT_MAIN') then 'MAIN_TECHNICAL_BLOCKED'
    when b.behavior_role = 'TOPPING_ONLY' then 'MAIN_TECHNICAL_BLOCKED'
    when b.behavior_role = 'PROTEIN_CONTRIBUTOR_ONLY' then 'MAIN_TECHNICAL_BLOCKED'
    when b.behavior_role = 'STANDARD_ONLY' then 'MAIN_TECHNICAL_BLOCKED'
    when b.behavior_role in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC',
                             'MAIN_CAPABLE_UNCALIBRATED','UNKNOWN_REQUIRES_EVIDENCE')
      then case when exists (
        select 1 from public.product_behavior_policy_versions p
        where p.status='published' and p.exact_catalog_product_version_id is null
          and (p.exact_mapper_ingredient_id is null
               or p.exact_mapper_ingredient_id=b.mapper_ingredient_id)
          and (p.family_id is null or p.family_id=b.family_id)
          and (p.subfamily_id is null or p.subfamily_id=b.subfamily_id)
          and (p.form_id is null or p.form_id=b.form_id)
          and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
      ) then 'MAIN_CAPABLE' else 'MAIN_CAPABLE_UNCALIBRATED' end
    else 'MAIN_UNKNOWN'
  end as capability,
  case when exists (
    select 1 from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_mapper_ingredient_id=b.mapper_ingredient_id
      and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
  ) then 'EXACT_PRODUCT'
  when exists (
    select 1 from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_catalog_product_version_id is null
      and p.exact_mapper_ingredient_id is null
      and (p.family_id is null or p.family_id=b.family_id)
      and (p.subfamily_id is null or p.subfamily_id=b.subfamily_id)
      and (p.form_id is null or p.form_id=b.form_id)
      and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
  ) then 'FAMILY' else 'NONE' end as calibration_level,
  (
    select string_agg(distinct p.product_profile||':'||p.policy_key, '|' order by p.product_profile||':'||p.policy_key)
    from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_catalog_product_version_id is null
      and (p.exact_mapper_ingredient_id is null
           or p.exact_mapper_ingredient_id=b.mapper_ingredient_id)
      and (p.family_id is null or p.family_id=b.family_id)
      and (p.subfamily_id is null or p.subfamily_id=b.subfamily_id)
      and (p.form_id is null or p.form_id=b.form_id)
      and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
  ) as policies,
  array_to_string(b.classification_reason_codes,'|') as blocked_reason,
  b.classifier_version as provenance,
  coalesce(m.verification_status,'') as mapper_verification_status
from public.mapper_basement m
left join public.mapper_product_behavior_bindings b
  on b.mapper_ingredient_id=m.ingredient_id and b.is_current
where m.is_active;

revoke all on public.mapper_main_capability_audit_v1 from public,anon,authenticated;
grant select on public.mapper_main_capability_audit_v1 to service_role;

-- ---------------------------------------------------------------------------
-- 6. Re-derive Mapper taxonomy with the semantic subfamily rule. Every one of
--    the six formerly hard-coded identities must land on the same subfamily it
--    had before, now for a reason the architecture can repeat for any future
--    product.
-- ---------------------------------------------------------------------------

do $$
declare
  v_row record;
  v_expected constant jsonb := jsonb_build_object(
    'PI-ING-001553','berry','PI-ING-000345','banana','PI-ING-000366','kiwi',
    'PI-ING-001589','banana','PI-ING-000369','citrus','PI-ING-000340','mango_tropical'
  );
  v_key text;
  v_actual text;
begin
  for v_key in select jsonb_object_keys(v_expected) loop
    select public.mapper_behavior_subfamily_v3(
      public.mapper_behavior_family_v2(m.ingredient_category,m.ingredient_subcategory),
      m.ingredient_category, m.ingredient_subcategory, m.ingredient_name_display
    ) into v_actual
    from public.mapper_basement m where m.ingredient_id=v_key and m.is_active;
    if v_actual is distinct from v_expected->>v_key then
      raise exception
        'semantic subfamily regression for %: expected %, derived %',
        v_key, v_expected->>v_key, coalesce(v_actual,'NULL');
    end if;
  end loop;
end;
$$;

-- An exact reviewed policy may still supply taxonomy that coarse legacy
-- category/subcategory cannot express (§25: calibration authority, refactored,
-- not deleted). It keeps precedence over the derived value.
update public.mapper_product_behavior_bindings b
set subfamily_id = coalesce(
      (select p.subfamily_id from public.product_behavior_policy_versions p
        where p.status='published' and p.exact_mapper_ingredient_id=b.mapper_ingredient_id
          and p.subfamily_id is not null
        order by p.version desc, p.policy_key limit 1),
      public.mapper_behavior_subfamily_v3(
        b.family_id, m.ingredient_category, m.ingredient_subcategory, m.ingredient_name_display
      )
    )
from public.mapper_basement m
where m.ingredient_id = b.mapper_ingredient_id
  and m.is_active
  and b.is_current
  and b.family_id is not null
  and b.subfamily_id is distinct from coalesce(
      (select p.subfamily_id from public.product_behavior_policy_versions p
        where p.status='published' and p.exact_mapper_ingredient_id=b.mapper_ingredient_id
          and p.subfamily_id is not null
        order by p.version desc, p.policy_key limit 1),
      public.mapper_behavior_subfamily_v3(
        b.family_id, m.ingredient_category, m.ingredient_subcategory, m.ingredient_name_display
      )
    );
