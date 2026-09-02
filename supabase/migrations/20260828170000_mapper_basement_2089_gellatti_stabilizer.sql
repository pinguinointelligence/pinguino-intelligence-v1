-- Owner-authorized canonical Mapper expansion: exactly one new row.
-- This forward-only migration is intentionally local until owner integration.
begin;

insert into public.mapper_basement (
  ingredient_id, ingredient_name_internal, ingredient_name_display, brand, supplier, country,
  ean_code, ingredient_category, ingredient_subcategory, approved_for_base,
  approved_for_engines, verification_status, verification_source, verification_date,
  data_confidence_percent, water_percent, total_solids_percent, fat_percent,
  saturated_fat_percent, milk_fat_percent, non_fat_milk_solids_percent, protein_percent,
  aerating_protein_percent, carbohydrate_percent, total_sugars_percent, sucrose_percent,
  dextrose_percent, glucose_percent, fructose_percent, lactose_percent, polyol_percent,
  fiber_percent, salt_percent, alcohol_percent, ash_percent, acidity_percent, brix,
  dry_matter_percent, pod_value, pac_value, de_value, sweetness_factor, freezing_factor,
  stabilizer_activity, recommended_dosage_percent_min, recommended_dosage_percent_max,
  kcal_per_100g, cost_per_kg, currency, allergens, vegan, dairy_free, gluten_free,
  contains_alcohol, storage_type, shelf_life_days, usage_notes, engine_notes, source_url,
  screenshot_reference, last_reviewed_by, last_reviewed_at, dataset_version, is_active
) values (
  'PI-ING-002114',
  'gellatti_stabilizer',
  'GELLATTI STABILIZER · Gellatti Stabilizer Blend · Dry',
  'Gellatti', 'Gellatti', 'Spain', '', 'stabilizer', 'stabilizer_blend', true, true,
  'Verified / PI Calculated', 'OWNER_FORMULATION', '2026-08-28', 100,
  7.1625, 92.8375, 0.5375, 0, 0, 0, 2.9985, 0, 13.1700,
  0, 0, 0, 0, 0, 0, 0, 74.3150, 0, 0, 0, 0, 0, 92.8375,
  0, 0, null, 0, 0, 1, null, null, 192.0, null, '', 'none_declared',
  'true', 'true', 'true', 'false', 'ambient_dry', null,
  'Gellatti own manufactured dry blend from Spain. Ingredients: Tara gum (E417) 60%; Locust bean gum (E410) 25%; Guar gum (E412) 15%. Premix with dry ingredients and hydrate at approximately 80–85°C. Owner procurement reference approximately 65.45 PLN/kg; not customer MOJA CENA and not shared price authority.',
  'OWNER_FORMULATION · Gellatti owner formula · weighted from PI-ING-000492 (60%); PI-ING-000475 (25%); PI-ING-000472 (15%). BASE_ONLY; topping=false. Exact profile dosage authority is stored separately and standalone gum dosage limits do not apply.',
  '', '', 'Gellatti owner', '2026-08-28', 'v1.0', true
)
on conflict (ingredient_id) do update set
  ingredient_name_internal=excluded.ingredient_name_internal,
  ingredient_name_display=excluded.ingredient_name_display,
  brand=excluded.brand,
  supplier=excluded.supplier,
  country=excluded.country,
  ean_code=excluded.ean_code,
  ingredient_category=excluded.ingredient_category,
  ingredient_subcategory=excluded.ingredient_subcategory,
  approved_for_base=excluded.approved_for_base,
  approved_for_engines=excluded.approved_for_engines,
  verification_status=excluded.verification_status,
  verification_source=excluded.verification_source,
  verification_date=excluded.verification_date,
  data_confidence_percent=excluded.data_confidence_percent,
  water_percent=excluded.water_percent,
  total_solids_percent=excluded.total_solids_percent,
  fat_percent=excluded.fat_percent,
  saturated_fat_percent=excluded.saturated_fat_percent,
  milk_fat_percent=excluded.milk_fat_percent,
  non_fat_milk_solids_percent=excluded.non_fat_milk_solids_percent,
  protein_percent=excluded.protein_percent,
  aerating_protein_percent=excluded.aerating_protein_percent,
  carbohydrate_percent=excluded.carbohydrate_percent,
  total_sugars_percent=excluded.total_sugars_percent,
  sucrose_percent=excluded.sucrose_percent,
  dextrose_percent=excluded.dextrose_percent,
  glucose_percent=excluded.glucose_percent,
  fructose_percent=excluded.fructose_percent,
  lactose_percent=excluded.lactose_percent,
  polyol_percent=excluded.polyol_percent,
  fiber_percent=excluded.fiber_percent,
  salt_percent=excluded.salt_percent,
  alcohol_percent=excluded.alcohol_percent,
  ash_percent=excluded.ash_percent,
  acidity_percent=excluded.acidity_percent,
  brix=excluded.brix,
  dry_matter_percent=excluded.dry_matter_percent,
  pod_value=excluded.pod_value,
  pac_value=excluded.pac_value,
  de_value=excluded.de_value,
  sweetness_factor=excluded.sweetness_factor,
  freezing_factor=excluded.freezing_factor,
  stabilizer_activity=excluded.stabilizer_activity,
  recommended_dosage_percent_min=excluded.recommended_dosage_percent_min,
  recommended_dosage_percent_max=excluded.recommended_dosage_percent_max,
  kcal_per_100g=excluded.kcal_per_100g,
  cost_per_kg=excluded.cost_per_kg,
  currency=excluded.currency,
  allergens=excluded.allergens,
  vegan=excluded.vegan,
  dairy_free=excluded.dairy_free,
  gluten_free=excluded.gluten_free,
  contains_alcohol=excluded.contains_alcohol,
  storage_type=excluded.storage_type,
  shelf_life_days=excluded.shelf_life_days,
  usage_notes=excluded.usage_notes,
  engine_notes=excluded.engine_notes,
  source_url=excluded.source_url,
  screenshot_reference=excluded.screenshot_reference,
  last_reviewed_by=excluded.last_reviewed_by,
  last_reviewed_at=excluded.last_reviewed_at,
  dataset_version=excluded.dataset_version,
  is_active=excluded.is_active,
  updated_at=now();

-- The canonical Product root is the same Mapper identity, not a parallel
-- Overlay. The deterministic UUID contract is identical to the accepted
-- canonical-product backfill.
-- This transaction is the governed Mapper ingest authority. Keep the accepted
-- canonical write guard enabled and enter its transaction-local ingest context
-- instead of bypassing or disabling the guard.
select set_config('app.canonical_product_ingest','v1',true);

insert into public.products(
  id,owner_user_id,created_by,brand,ean_code,barcode,product_name_internal,
  product_name_display,product_category,product_subcategory,country,status,source_type,
  dataset_version,is_active,product_kind,visibility,owning_account_id,
  canonical_verification_status,canonical_verification_method,canonical_provenance,
  explicitly_unbranded,normalized_identity,search_document
)
select
  md5('pinguino:mapper-reference:'||m.dataset_version||':'||m.ingredient_id)::uuid,
  null,null,m.brand,m.ean_code,m.ean_code,m.ingredient_name_internal,m.ingredient_name_display,
  m.ingredient_category,m.ingredient_subcategory,m.country,'pi_verified','catalog_import',
  m.dataset_version,true,'mapper_reference','internal',null,'verified','human',
  'mapper_basement:'||m.dataset_version,false,'mapper:'||m.ingredient_id,
  trim(concat_ws(' ',m.ingredient_id,m.ingredient_name_display,m.ingredient_name_internal,
    m.brand,m.ingredient_category,m.ingredient_subcategory,m.ean_code))
from public.mapper_basement m
where m.ingredient_id='PI-ING-002114' and m.is_active
on conflict (id) do nothing;

insert into public.product_versions(
  product_id,version,facts,evidence_snapshot,verification_status,verification_method,
  provenance,facts_fingerprint,effective_at,created_at
)
select p.id,1,f.facts,'{}'::jsonb,'verified','human',p.canonical_provenance,
  encode(extensions.digest(convert_to(f.facts::text,'utf8'),'sha256'),'hex'),
  m.updated_at,m.created_at
from public.mapper_basement m
join public.products p on p.product_kind='mapper_reference'
  and p.normalized_identity='mapper:'||m.ingredient_id
cross join lateral (
  select jsonb_strip_nulls(to_jsonb(m)||jsonb_build_object(
    'mapperIngredientId',m.ingredient_id,'mapperDatasetVersion',m.dataset_version
  )) facts
) f
where m.ingredient_id='PI-ING-002114'
on conflict (product_id,version) do nothing;

update public.products p set current_version_id=v.id
from public.product_versions v
where p.normalized_identity='mapper:PI-ING-002114'
  and p.product_kind='mapper_reference' and v.product_id=p.id and v.version=1;

do $$
begin
  if (select count(*) from public.mapper_basement where is_active) <> 2089 then
    raise exception 'Mapper 2089 expansion is incomplete';
  end if;
  if (select count(*) from public.mapper_basement where ingredient_id='PI-ING-002114') <> 1 then
    raise exception 'PI-ING-002114 must exist exactly once';
  end if;
  if (select count(*) from public.products
      where normalized_identity='mapper:PI-ING-002114' and product_kind='mapper_reference') <> 1 then
    raise exception 'PI-ING-002114 canonical product identity is incomplete';
  end if;
end $$;

commit;
