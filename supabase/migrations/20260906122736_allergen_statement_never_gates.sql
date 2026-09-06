-- OWNER RULING 2026-09-06 — THE ALLERGEN LINE IS NEVER A GATE, FOR ANY INGREDIENT.
--
-- One channel: `allergensText`. When a source states it we keep it; when nobody states it the value
-- is UNKNOWN. UNKNOWN never means "contains no allergens" and never means "may contain allergens",
-- and it blocks nothing — not the product, the Mapper, Rescue, a role, a recipe, production or a
-- label. Allergen information is the food producer's to declare, and the customer sets or changes
-- the final line on the label of their recipe or batch.
--
-- The rule is identical for Base, Main, Topping, a scanned article, a Mapper row and a Registry
-- product: there is no per-role exception, and nothing else about Base/Main/Topping qualification
-- changes here. Two predicates consulted the line; each loses exactly that conjunct and keeps every
-- other condition byte-identical. Both patches are idempotent.

do $patch_topping_allergen_gate$
declare
  v_signature regprocedure := to_regprocedure(
    'public.classify_catalog_product_behavior_v2(uuid,text)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'classify_catalog_product_behavior_v2_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_old := $old$  v_topping := v_product.canonical_verification_status<>'blocked'
    and nullif(trim(coalesce(v_public_data->>'ingredientsText','')),'') is not null
    and nullif(trim(coalesce(v_public_data->>'allergensText','')),'') is not null
    and jsonb_typeof(v_public_data->'nutrition')='object';$old$;
  v_new := $new$  -- the allergen line is NEVER a gate (owner, 2026-09-06): absence is UNKNOWN, not a refusal
  v_topping := v_product.canonical_verification_status<>'blocked'
    and nullif(trim(coalesce(v_public_data->>'ingredientsText','')),'') is not null
    and jsonb_typeof(v_public_data->'nutrition')='object';$new$;
  if strpos(v_definition,v_new)>0 then
    return;
  end if;
  if strpos(v_definition,v_old)=0 then
    raise exception 'catalog topping predicate drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_topping_allergen_gate$;

do $patch_label_allergen_gate$
declare
  v_signature regprocedure := to_regprocedure(
    'public.resolve_product_behavior_evidence_gate_v1(text,text,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
begin
  if v_signature is null then
    raise exception 'resolve_product_behavior_evidence_gate_v1_missing';
  end if;
  select pg_get_functiondef(v_signature) into v_definition;
  v_old := $old$  v_has_allergens := jsonb_typeof(v_shared_facts->'allergens')='object'
    and nullif(trim(coalesce(v_shared_facts->'allergens'->>'ingredientsText','')),'') is not null
    and nullif(trim(coalesce(v_shared_facts->'allergens'->>'allergensText','')),'') is not null;$old$;
  v_new := $new$  -- the label needs the INGREDIENT declaration; the allergen line is never a gate
  -- (owner, 2026-09-06). Its absence is UNKNOWN and the customer sets the final line on the label.
  v_has_allergens := jsonb_typeof(v_shared_facts->'allergens')='object'
    and nullif(trim(coalesce(v_shared_facts->'allergens'->>'ingredientsText','')),'') is not null;$new$;
  if strpos(v_definition,v_new)>0 then
    return;
  end if;
  if strpos(v_definition,v_old)=0 then
    raise exception 'label allergen predicate drifted';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$patch_label_allergen_gate$;
