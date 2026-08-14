-- Product behavior classification v2.
--
-- This is a forward-only authority migration. It never writes Mapper facts and
-- never changes Engine science. It separates a product's ordinary behavior
-- role from Main-policy coverage, expands stable taxonomy data, routes the
-- already accepted owner dairy policies through the live milk_gelato profile,
-- rejects ambiguous policy matches, and adds resumable reclassification.

-- ---------------------------------------------------------------------------
-- Stable taxonomy expansion. These are identity/form labels only; inserting a
-- taxonomy node does not imply that an automatic Main envelope exists.
-- ---------------------------------------------------------------------------

insert into public.product_taxonomy_nodes(
  taxonomy_version_id,id,parent_id,kind,canonical_name,metadata
)
values
  ('pinguino-product-taxonomy-v1','dairy_flavour',null,'family','Dairy flavour','{}'),
  ('pinguino-product-taxonomy-v1','coconut',null,'family','Coconut','{}'),
  ('pinguino-product-taxonomy-v1','bakery_cookie',null,'family','Bakery / cookie','{}'),
  ('pinguino-product-taxonomy-v1','spice_herb',null,'family','Spice / herb','{}'),
  ('pinguino-product-taxonomy-v1','vanilla',null,'family','Vanilla','{}'),
  ('pinguino-product-taxonomy-v1','caramel',null,'family','Caramel','{}'),
  ('pinguino-product-taxonomy-v1','honey',null,'family','Honey','{}')
on conflict do nothing;

insert into public.product_taxonomy_nodes(
  taxonomy_version_id,id,parent_id,kind,canonical_name,metadata
)
values
  ('pinguino-product-taxonomy-v1','citrus','fruit','subfamily','Citrus','{}'),
  ('pinguino-product-taxonomy-v1','mango_tropical','fruit','subfamily','Mango / tropical','{}'),
  ('pinguino-product-taxonomy-v1','ordinary_fruit','fruit','subfamily','Other ordinary fruit','{}')
on conflict do nothing;

insert into public.product_taxonomy_nodes(
  taxonomy_version_id,id,parent_id,kind,canonical_name,metadata
)
values
  ('pinguino-product-taxonomy-v1','juice',null,'form','Juice','{}'),
  ('pinguino-product-taxonomy-v1','concentrate',null,'form','Concentrate','{}'),
  ('pinguino-product-taxonomy-v1','powder',null,'form','Powder','{}'),
  ('pinguino-product-taxonomy-v1','extract',null,'form','Extract','{}'),
  ('pinguino-product-taxonomy-v1','whole_nut',null,'form','Whole nut','{}'),
  ('pinguino-product-taxonomy-v1','syrup',null,'form','Syrup','{}'),
  ('pinguino-product-taxonomy-v1','flavour_paste',null,'form','Flavour paste','{}'),
  ('pinguino-product-taxonomy-v1','paste',null,'form','Paste (concentration unknown)','{"requiresConcentrationEvidence":true}'),
  ('pinguino-product-taxonomy-v1','cream_liqueur',null,'form','Cream liqueur','{}'),
  ('pinguino-product-taxonomy-v1','retained_infusion',null,'form','Retained infusion','{}'),
  ('pinguino-product-taxonomy-v1','whole',null,'form','Whole ingredient','{}'),
  ('pinguino-product-taxonomy-v1','liquid',null,'form','Liquid','{}'),
  ('pinguino-product-taxonomy-v1','dried',null,'form','Dried','{}'),
  ('pinguino-product-taxonomy-v1','peel',null,'form','Peel','{}')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Explicit role, policy coverage and evidence provenance.
-- ---------------------------------------------------------------------------

alter table public.product_behavior_policy_versions
  add column if not exists policy_evidence_status text;
alter table public.product_behavior_policy_versions
  add column if not exists temperature_min_c numeric,
  add column if not exists temperature_max_c numeric;
alter table public.product_behavior_policy_versions
  add constraint product_behavior_policy_temperature_v2_check check (
    (temperature_min_c is null and temperature_max_c is null)
    or (temperature_min_c is not null and temperature_max_c is not null
      and temperature_min_c<=temperature_max_c)
  );

update public.product_behavior_policy_versions
set policy_evidence_status=case evidence_status
  when 'owner_provisional' then 'OWNER_PROVISIONAL'
  when 'verified' then 'PRODUCTION_VALIDATED'
  when 'reference_only' then 'SOURCE_REFERENCE'
  else 'BLOCKED_DATA'
end
where policy_evidence_status is null;

alter table public.product_behavior_policy_versions
  alter column policy_evidence_status set not null;
alter table public.product_behavior_policy_versions
  drop constraint if exists product_behavior_policy_evidence_v2_check;
alter table public.product_behavior_policy_versions
  add constraint product_behavior_policy_evidence_v2_check check (
    policy_evidence_status in (
      'PRODUCTION_VALIDATED','PINGUINO_CALIBRATED','OWNER_PROVISIONAL',
      'SOURCE_REFERENCE','MAPPER_DERIVED_PROVISIONAL','BLOCKED_DATA','BLOCKED_SCIENCE'
    )
  );

alter table public.mapper_product_behavior_bindings
  add column if not exists behavior_role text not null default 'UNKNOWN_REQUIRES_EVIDENCE',
  add column if not exists main_policy_status text not null default 'UNKNOWN_REQUIRES_EVIDENCE',
  add column if not exists profile_applicability jsonb not null default '{}'::jsonb,
  add column if not exists classification_reason_codes text[] not null default '{}';

alter table public.product_behavior_bindings
  add column if not exists behavior_role text not null default 'UNKNOWN_REQUIRES_EVIDENCE',
  add column if not exists main_policy_status text not null default 'UNKNOWN_REQUIRES_EVIDENCE',
  add column if not exists profile_applicability jsonb not null default '{}'::jsonb,
  add column if not exists classification_reason_codes text[] not null default '{}';

alter table public.mapper_product_behavior_bindings
  drop constraint if exists mapper_product_behavior_role_v2_check,
  drop constraint if exists mapper_product_main_policy_status_v2_check;
alter table public.mapper_product_behavior_bindings
  add constraint mapper_product_behavior_role_v2_check check (behavior_role in (
    'MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','STRUCTURAL_ONLY',
    'PROTEIN_CONTRIBUTOR_ONLY','TOPPING_ONLY','NOT_MAIN','UNKNOWN_REQUIRES_EVIDENCE'
  )),
  add constraint mapper_product_main_policy_status_v2_check check (main_policy_status in (
    'COVERED','NOT_APPLICABLE','BLOCKED_DATA','BLOCKED_SCIENCE','UNKNOWN_REQUIRES_EVIDENCE'
  ));

alter table public.product_behavior_bindings
  drop constraint if exists product_behavior_role_v2_check,
  drop constraint if exists product_main_policy_status_v2_check;
alter table public.product_behavior_bindings
  add constraint product_behavior_role_v2_check check (behavior_role in (
    'MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC','STANDARD_ONLY','STRUCTURAL_ONLY',
    'PROTEIN_CONTRIBUTOR_ONLY','TOPPING_ONLY','NOT_MAIN','UNKNOWN_REQUIRES_EVIDENCE'
  )),
  add constraint product_main_policy_status_v2_check check (main_policy_status in (
    'COVERED','NOT_APPLICABLE','BLOCKED_DATA','BLOCKED_SCIENCE','UNKNOWN_REQUIRES_EVIDENCE'
  ));

-- Retire, never rewrite, v1 owner policy evidence. Version 2 carries exactly
-- the same owner-approved values but uses the live canonical dairy profile.
update public.product_behavior_policy_versions
set status='retired'
where status='published'
  and policy_key in (
    'main-fruit-fresh-dairy','main-fruit-puree-dairy',
    'main-berry-fresh-dairy','main-berry-puree-dairy',
    'main-kiwi-fresh-dairy','main-banana-fresh-dairy',
    'main-pure-nut-paste-dairy'
  );

insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,
  family_id,subfamily_id,form_id,main_eligibility,basis,
  eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,equivalent_factor,
  requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,policy_evidence_status,evidence,published_at
)
values
  ('main-fruit-fresh-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','fruit',null,'fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',20,35,45,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato"}',now()),
  ('main-fruit-puree-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','fruit',null,'puree','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',20,35,45,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato"}',now()),
  ('main-berry-fresh-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','fruit','berry','fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',25,35,45,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato"}',now()),
  ('main-berry-puree-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','fruit','berry','puree','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',25,35,45,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato"}',now()),
  ('main-kiwi-fresh-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','fruit','kiwi','fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,15,20,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato"}',now()),
  ('main-banana-fresh-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','fruit','banana','fresh','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,20,30,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato"}',now()),
  ('main-pure-nut-paste-dairy',2,'pinguino-product-taxonomy-v1','published','milk_gelato','nut',null,'pure_nut_paste','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',8,15,15,1,true,30,'owner_provisional','OWNER_PROVISIONAL','{"ownerPrompt":"2026-08-12","profileRoute":"canonical_milk_gelato","compoundRequiresExactFactor":true}',now())
on conflict (policy_key,version) do nothing;

insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,
  family_id,subfamily_id,form_id,exact_mapper_ingredient_id,main_eligibility,basis,
  eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,equivalent_factor,
  requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,policy_evidence_status,evidence,published_at
) values (
  'main-pistachio-pure-paste-dairy-0614',1,'pinguino-product-taxonomy-v1','published','milk_gelato',
  'nut',null,'pure_nut_paste','PI-ING-000614','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',
  8,15,15,1,true,30,'owner_provisional','OWNER_PROVISIONAL',
  '{"ownerPrompt":"2026-08-12","exactIdentityEvidence":"100_percent_pistachio_paste","scope":"exact_mapper_identity_only"}',now()
) on conflict(policy_key,version) do nothing;

-- Exact accepted profile fixtures only. These rows pin the exact formulation
-- template point; they do not turn a whole family/form into generic science.
-- Protein rows below are limited to the exact accepted calibration identities;
-- the coffee-input row is immediately retired because its retained-mass/process
-- relation is still unknown. No neighbouring Protein product inherits them.
insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,
  family_id,subfamily_id,form_id,exact_mapper_ingredient_id,main_eligibility,basis,
  eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,equivalent_factor,
  requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,policy_evidence_status,evidence,published_at
)
values
  ('main-sorbet-strawberry-fresh-1553',1,'pinguino-product-taxonomy-v1','published','sorbet','fruit','berry','fresh','PI-ING-001553','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',60,60,60,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateIds":["S01","S02","S03"],"fixture":"exact_strawberry_600g_per_1000g","scope":"exact_mapper_identity_only"}',now()),
  ('main-sorbet-lime-fresh-0369',1,'pinguino-product-taxonomy-v1','published','sorbet','fruit','citrus','fresh','PI-ING-000369','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',60,60,60,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateIds":["S01","S02","S03"],"fixture":"exact_citrus_600g_per_1000g","scope":"exact_mapper_identity_only"}',now()),
  ('main-sorbet-mango-puree-0340',1,'pinguino-product-taxonomy-v1','published','sorbet','fruit','mango_tropical','puree','PI-ING-000340','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',60,60,60,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateIds":["S01","S02","S03"],"fixture":"exact_mango_600g_per_1000g","scope":"exact_mapper_identity_only"}',now()),
  ('main-vegan-strawberry-fresh-1553',2,'pinguino-product-taxonomy-v1','published','vegan_gelato','fruit','berry','fresh','PI-ING-001553','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',30,87.6,87.6,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateId":"vegan_fruit","wholeGramSweep":{"temperatures":[-11,-12,-13],"singleMaxGrams":786,"multiMainMaxTotalGrams":825},"scope":"exact_mapper_identity_only","multiMainGroupKey":"main-vegan-fruit-combination-v2"}',now()),
  ('main-vegan-banana-puree-1589',2,'pinguino-product-taxonomy-v1','published','vegan_gelato','fruit','banana','puree','PI-ING-001589','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',30,87.6,87.6,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateId":"vegan_fruit","wholeGramSweep":{"temperatures":[-11,-12,-13],"singleMaxGrams":876,"multiMainMaxTotalGrams":825},"scope":"exact_mapper_identity_only","multiMainGroupKey":"main-vegan-fruit-combination-v2"}',now()),
  ('main-vegan-pistachio-paste-0614',2,'pinguino-product-taxonomy-v1','published','vegan_gelato','nut',null,'pure_nut_paste','PI-ING-000614','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',12,26.6,26.6,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateId":"vegan_nut","wholeGramSweep":{"temperatures":[-11,-12,-13],"maxGrams":266},"scope":"exact_mapper_identity_only"}',now()),
  ('main-vegan-cocoa-powder-1578',2,'pinguino-product-taxonomy-v1','published','vegan_gelato','chocolate_cocoa',null,'cocoa_powder','PI-ING-001578','MAIN_PROFILE_SPECIFIC','COCOA_SOLIDS_EQUIVALENT',6,24,24,1,false,null,'verified','PINGUINO_CALIBRATED','{"templateId":"vegan_cocoa","wholeGramSweep":{"temperatures":[-11,-12,-13],"maxGrams":240},"scope":"exact_mapper_identity_only"}',now())
on conflict(policy_key,version) do nothing;

-- Protein flavour calibration is exact-identity and profile-specific. The
-- accepted Protein matrix preserves these whole-gram Main inputs across dairy
-- and plant protein routes; it does not generalise to neighbouring products.
insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,
  family_id,subfamily_id,form_id,exact_mapper_ingredient_id,main_eligibility,basis,
  eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,equivalent_factor,
  requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,policy_evidence_status,evidence,published_at
)
values
  ('main-protein-strawberry-1553',2,'pinguino-product-taxonomy-v1','published','protein_gelato','fruit','berry','fresh','PI-ING-001553','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,49.5,49.5,1,false,null,'verified','PINGUINO_CALIBRATED','{"fixtures":["target_10_to_30_minus11_minus12_minus13","fruit_multi_1_1","fruit_multi_2_1"],"wholeGramSweep":{"maxGrams":495},"routes":["dairy","plant_rice","plant_pea","selected_protein"],"multiMainGroupKey":"main-protein-fruit-combination-v2","scope":"exact_mapper_identity_only"}',now()),
  ('main-protein-banana-0345',2,'pinguino-product-taxonomy-v1','published','protein_gelato','fruit','banana','fresh','PI-ING-000345','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,49.5,49.5,1,false,null,'verified','PINGUINO_CALIBRATED','{"fixtures":["banana_target20","fruit_multi_1_1","fruit_multi_2_1"],"wholeGramSweep":{"singleMaxGrams":171,"approvedGroupCeilingGrams":495},"routes":["dairy","plant"],"multiMainGroupKey":"main-protein-fruit-combination-v2","scope":"exact_mapper_identity_only"}',now()),
  ('main-protein-vanilla-0246',2,'pinguino-product-taxonomy-v1','published','protein_gelato','vanilla',null,'flavour_paste','PI-ING-000246','MAIN_PROFILE_SPECIFIC','PERCENT_OF_BASE',0.5,4.9,4.9,1,false,null,'verified','PINGUINO_CALIBRATED','{"fixture":"vanilla_target20","wholeGramSweep":{"maxGrams":49},"scope":"exact_mapper_identity_only"}',now()),
  ('main-protein-coffee-input-0166',2,'pinguino-product-taxonomy-v1','published','protein_gelato','coffee',null,'infusion_input','PI-ING-000166','MAIN_PROFILE_SPECIFIC','INFUSION_INPUT_PER_KG',1.5,3.1,3.1,1,false,null,'verified','PINGUINO_CALIBRATED','{"fixture":"coffee_input_target20","wholeGramSweep":{"maxInputGrams":31},"retainedMass":"not_inferred","scope":"exact_mapper_identity_only"}',now()),
  ('main-protein-cocoa-1578',2,'pinguino-product-taxonomy-v1','published','protein_gelato','chocolate_cocoa',null,'cocoa_powder','PI-ING-001578','MAIN_PROFILE_SPECIFIC','COCOA_SOLIDS_EQUIVALENT',6,6.1,6.1,1,false,null,'verified','PINGUINO_CALIBRATED','{"fixture":"cocoa_target20","wholeGramSweep":{"maxGrams":61},"scope":"exact_mapper_identity_only"}',now()),
  ('main-protein-pistachio-0614',1,'pinguino-product-taxonomy-v1','published','protein_gelato','nut',null,'pure_nut_paste','PI-ING-000614','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',10,10,10,1,false,null,'verified','PINGUINO_CALIBRATED','{"fixture":"pistachio_100g_per_1000g","scope":"exact_mapper_identity_only","compoundProducts":"blocked_without_equivalent_factor"}',now())
on conflict(policy_key,version) do nothing;

-- Ground coffee input is not the retained product mass. Until that process
-- relationship is versioned, the exact Protein coffee envelope stays blocked.
update public.product_behavior_policy_versions set status='retired'
where policy_key='main-protein-coffee-input-0166' and version=2;

-- Exact alcohol boundary already protected by the accepted whole-gram Main
-- fixture. The envelope is valid only for this Mapper identity at -11 C; ABV,
-- ethanol contribution and process evidence are read from the exact Mapper and
-- process bindings, so no neighbouring spirit or unknown-ABV product inherits it.
insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,
  family_id,subfamily_id,form_id,exact_mapper_ingredient_id,main_eligibility,basis,
  eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,equivalent_factor,
  requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,policy_evidence_status,evidence,published_at,
  temperature_min_c,temperature_max_c
) values (
  'main-whisky-40-dairy-0038-minus11',1,'pinguino-product-taxonomy-v1','published','milk_gelato',
  'alcohol',null,'alcoholic_beverage','PI-ING-000038','MAIN_PROFILE_SPECIFIC','ETHANOL_PERCENT',
  2,4.9,4.9,1,true,30,'verified','PINGUINO_CALIBRATED',
  '{"fixture":"mainFlavourObjective:whisky","wholeGramSweep":{"startingGrams":20,"maxGrams":49,"firstRejectedGrams":50},"abvAuthority":"exact_mapper_composition","scope":"exact_mapper_identity_minus11_only"}',now(),
  -11,-11
) on conflict(policy_key,version) do nothing;

update public.product_behavior_policy_versions
set temperature_min_c=-13,temperature_max_c=-11
where status='published' and product_profile in ('sorbet','vegan_gelato','protein_gelato');

-- Preserve only exact manufacturer dosage ranges that prove both ends of the
-- envelope. Minimum-only Hazelnut/Coffee references remain review evidence in
-- the documentation and audit; they cannot manufacture an OPTIMAL ceiling or
-- hard limit and therefore are intentionally not published as runtime policy.
insert into public.product_behavior_policy_versions(
  policy_key,version,taxonomy_version_id,status,product_profile,
  family_id,subfamily_id,form_id,exact_mapper_ingredient_id,main_eligibility,basis,
  eco_floor_percent,optimal_ceiling_percent,hard_limit_percent,equivalent_factor,
  requires_liquid_dairy_carrier,liquid_dairy_carrier_floor_percent,
  evidence_status,policy_evidence_status,evidence,published_at
)
select
  seed.policy_key,1,'pinguino-product-taxonomy-v1','published',seed.product_profile,
  seed.family_id,null,seed.form_id,seed.ingredient_id,'MAIN_PROFILE_SPECIFIC','PERCENT_OF_BASE',
  seed.floor_percent,seed.ceiling_percent,seed.ceiling_percent,1,
  seed.requires_carrier,case when seed.requires_carrier then 30 else null end,
  'reference_only','SOURCE_REFERENCE',jsonb_build_object(
    'scope','exact_mapper_identity_only','manufacturerDosage',seed.dosage,
    'sourceUrl',seed.source_url,'conversion','100*x/(1000+x)'
  ),now()
from (values
  ('main-exact-strawberry-fortefrutto-0737-milk','milk_gelato','fruit','concentrate','PI-ING-000737',1.961,6.542,true,'20-70 g per 1000 g base','https://shop.pregelamerica.com/strawberry-fortefrutto-45872'),
  ('main-exact-strawberry-fortefrutto-0737-sorbet','sorbet','fruit','concentrate','PI-ING-000737',1.961,6.542,false,'20-70 g per 1000 g base','https://shop.pregelamerica.com/strawberry-fortefrutto-45872'),
  ('main-exact-strawberry-fortefrutto-0737-vegan','vegan_gelato','fruit','concentrate','PI-ING-000737',1.961,6.542,false,'20-70 g per 1000 g base','https://shop.pregelamerica.com/strawberry-fortefrutto-45872'),
  ('main-exact-raspberry-fortefrutto-0732-milk','milk_gelato','fruit','concentrate','PI-ING-000732',1.961,6.542,true,'20-70 g per 1000 g base','https://shop.pregelamerica.com/raspberry-fortefrutto-46272'),
  ('main-exact-raspberry-fortefrutto-0732-sorbet','sorbet','fruit','concentrate','PI-ING-000732',1.961,6.542,false,'20-70 g per 1000 g base','https://shop.pregelamerica.com/raspberry-fortefrutto-46272'),
  ('main-exact-raspberry-fortefrutto-0732-vegan','vegan_gelato','fruit','concentrate','PI-ING-000732',1.961,6.542,false,'20-70 g per 1000 g base','https://shop.pregelamerica.com/raspberry-fortefrutto-46272'),
  ('main-exact-prontociocc-0757-chocolate','chocolate_gelato','chocolate_cocoa','flavour_paste','PI-ING-000757',9.091,13.043,true,'100-150 g per 1000 g base','https://pregelamerica.com/pga_collateral/PreGel_Product_Catalog.pdf')
) as seed(policy_key,product_profile,family_id,form_id,ingredient_id,floor_percent,ceiling_percent,requires_carrier,dosage,source_url)
on conflict(policy_key,version) do nothing;

-- Single-product limits and combination limits are distinct evidence. The
-- conservative values below are the minimum proven across -11/-12/-13; no
-- interpolation or new sensory science is introduced.
update public.product_behavior_policy_versions
set optimal_ceiling_percent=74.7,hard_limit_percent=74.7,
    evidence=evidence||'{"multiMainHardLimitPercent":82.5,"temperaturePolicy":"conservative_minimum_across_minus11_minus12_minus13"}'::jsonb
where policy_key='main-vegan-strawberry-fresh-1553' and version=2;
update public.product_behavior_policy_versions
set optimal_ceiling_percent=86,hard_limit_percent=86,
    evidence=evidence||'{"multiMainHardLimitPercent":82.5,"temperaturePolicy":"conservative_minimum_across_minus11_minus12_minus13"}'::jsonb
where policy_key='main-vegan-banana-puree-1589' and version=2;
update public.product_behavior_policy_versions
set evidence=evidence||'{"multiMainHardLimitPercent":20.7}'::jsonb
where policy_key='main-protein-strawberry-1553' and version=2;
update public.product_behavior_policy_versions
set optimal_ceiling_percent=17.1,hard_limit_percent=17.1,
    evidence=evidence||'{"multiMainHardLimitPercent":20.7}'::jsonb
where policy_key='main-protein-banana-0345' and version=2;

-- ---------------------------------------------------------------------------
-- Deterministic evidence-only Mapper derivation. These helpers classify stable
-- taxonomy from structured category/subcategory fields. They never derive a
-- Main percentage or potency factor.
-- ---------------------------------------------------------------------------

create or replace function public.mapper_behavior_family_v2(
  p_category text,
  p_subcategory text
) returns text
language sql immutable
set search_path=public
as $$
  select case
    when lower(coalesce(p_subcategory,''))='honey' then 'honey'
    when lower(coalesce(p_subcategory,'')) like '%caramel%' or lower(coalesce(p_subcategory,''))='kajmak' then 'caramel'
    when lower(coalesce(p_subcategory,'')) like '%vanilla%' then 'vanilla'
    when lower(coalesce(p_category,''))='fruit' then 'fruit'
    when lower(coalesce(p_category,'')) in ('nut','nut_paste') then 'nut'
    when lower(coalesce(p_category,'')) in ('chocolate','cocoa') then 'chocolate_cocoa'
    when lower(coalesce(p_category,'')) in ('coffee','coffee_tea')
      or lower(coalesce(p_subcategory,'')) like '%coffee%'
      or lower(coalesce(p_subcategory,''))='espresso_coffee' then 'coffee'
    when lower(coalesce(p_category,''))='alcohol' then 'alcohol'
    when lower(coalesce(p_category,''))='coconut' then 'coconut'
    when lower(coalesce(p_category,'')) in ('bakery','bakery_inclusion') then 'bakery_cookie'
    when lower(coalesce(p_category,'')) in ('spice','botanical') then 'spice_herb'
    when lower(coalesce(p_category,''))='dairy' and lower(coalesce(p_subcategory,'')) in (
      'mascarpone_cheese','natural_yogurt','skyr_yoghurt','greek_yogurt','yoghurt_9_percent',
      'fermented_milk_drink','cream_cheese','soft_cheese','blue_cheese','brie_cheese',
      'blue_cheese_roquefort','parmesan_cheese','fatty_cottage_cheese','fatty_cottage_cheese_8_percent'
    ) then 'dairy_flavour'
    else null
  end
$$;

create or replace function public.mapper_behavior_subfamily_v2(
  p_ingredient_id text,
  p_category text,
  p_subcategory text
) returns text
language sql immutable
set search_path=public
as $$
  select case
    when p_ingredient_id='PI-ING-001553' then 'berry'
    when p_ingredient_id='PI-ING-000345' then 'banana'
    when p_ingredient_id='PI-ING-000366' then 'kiwi'
    when p_ingredient_id='PI-ING-001589' then 'banana'
    when p_ingredient_id='PI-ING-000369' then 'citrus'
    when p_ingredient_id='PI-ING-000340' then 'mango_tropical'
    when lower(coalesce(p_category,''))='fruit' and (
      lower(coalesce(p_subcategory,'')) like '%citrus%'
      or lower(coalesce(p_subcategory,'')) like '%lemon%'
      or lower(coalesce(p_subcategory,'')) like '%lime%'
      or lower(coalesce(p_subcategory,'')) like '%orange%'
    ) then 'citrus'
    when lower(coalesce(p_category,''))='fruit' and lower(coalesce(p_subcategory,'')) like '%tropical%' then 'mango_tropical'
    else null
  end
$$;

create or replace function public.mapper_behavior_form_v2(
  p_category text,
  p_subcategory text
) returns text
language sql immutable
set search_path=public
as $$
  select case
    when lower(coalesce(p_subcategory,'')) like '%juice_concentrate%' then 'concentrate'
    when lower(coalesce(p_subcategory,'')) like '%concentrate%' then 'concentrate'
    when lower(coalesce(p_subcategory,'')) like '%fresh%' then 'fresh'
    when lower(coalesce(p_subcategory,'')) like '%frozen%' then 'frozen'
    when lower(coalesce(p_subcategory,'')) like '%puree%' then 'puree'
    when lower(coalesce(p_subcategory,'')) like '%juice%' then 'juice'
    when lower(coalesce(p_subcategory,'')) like '%extract%' then 'extract'
    when lower(coalesce(p_subcategory,''))='espresso_coffee' then 'espresso'
    when lower(coalesce(p_subcategory,'')) like '%dark_chocolate%' then 'dark_chocolate'
    when lower(coalesce(p_subcategory,'')) like '%milk_chocolate%' then 'milk_chocolate'
    when lower(coalesce(p_subcategory,'')) like '%cocoa_mass%' then 'cocoa_mass'
    when lower(coalesce(p_subcategory,'')) like '%cocoa_powder%' then 'cocoa_powder'
    when lower(coalesce(p_subcategory,'')) like '%powder%' then 'powder'
    when lower(coalesce(p_category,''))='alcohol' and lower(coalesce(p_subcategory,'')) like '%cream_liqueur%' then 'cream_liqueur'
    when lower(coalesce(p_category,''))='alcohol' then 'alcoholic_beverage'
    when lower(coalesce(p_category,'')) in ('flavor_paste','flavour_paste') then 'flavour_paste'
    when lower(coalesce(p_subcategory,'')) like '%syrup%' then 'syrup'
    when lower(coalesce(p_subcategory,'')) like '%paste%' then 'paste'
    when lower(coalesce(p_category,'')) in ('nut','nut_paste') and lower(coalesce(p_subcategory,'')) in (
      'pistachio','almond','peanut','walnut','cashew','pecan','hazelnut','brazil_nuts','chestnut','macadamia'
    ) then 'whole_nut'
    when lower(coalesce(p_subcategory,'')) like '%dried%' then 'dried'
    when lower(coalesce(p_subcategory,'')) like '%peel%' then 'peel'
    when lower(coalesce(p_subcategory,'')) like '%drink%'
      or lower(coalesce(p_subcategory,'')) in ('milk','fresh_milk','water','cream') then 'liquid'
    else null
  end
$$;

revoke all on function public.mapper_behavior_family_v2(text,text) from public,anon,authenticated;
revoke all on function public.mapper_behavior_subfamily_v2(text,text,text) from public,anon,authenticated;
revoke all on function public.mapper_behavior_form_v2(text,text) from public,anon,authenticated;
grant execute on function public.mapper_behavior_family_v2(text,text),
  public.mapper_behavior_subfamily_v2(text,text,text),
  public.mapper_behavior_form_v2(text,text) to service_role;

create or replace function public.classify_mapper_product_behavior_v2(
  p_mapper_ingredient_id text,
  p_classifier_version text
) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_mapper public.mapper_basement%rowtype;
  v_process public.mapper_process_metadata%rowtype;
  v_category text;
  v_subcategory text;
  v_family text;
  v_subfamily text;
  v_form text;
  v_role text;
  v_policy_status text;
  v_main_eligibility text;
  v_reasons text[];
  v_profiles jsonb;
  v_binding uuid;
  v_canonical_product uuid;
  v_canonical_version uuid;
  v_canonical_binding uuid;
  v_exact boolean;
  v_policy_covered boolean;
  v_structural boolean;
  v_topping boolean;
  v_flavour_candidate boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'product-behavior:mapper:'||p_mapper_ingredient_id,0
  ));
  select * into v_mapper from public.mapper_basement
  where ingredient_id=p_mapper_ingredient_id and is_active;
  if not found then raise exception 'active Mapper ingredient not found'; end if;
  select * into v_process from public.mapper_process_metadata
  where ingredient_id=p_mapper_ingredient_id;

  v_category := lower(coalesce(v_mapper.ingredient_category,''));
  v_subcategory := lower(coalesce(v_mapper.ingredient_subcategory,''));
  v_family := public.mapper_behavior_family_v2(v_category,v_subcategory);
  v_subfamily := public.mapper_behavior_subfamily_v2(v_mapper.ingredient_id,v_category,v_subcategory);
  v_form := public.mapper_behavior_form_v2(v_category,v_subcategory);
  -- An exact reviewed policy may supply taxonomy that cannot be inferred from
  -- coarse legacy category/subcategory alone (for example vanilla paste).
  v_family:=coalesce((select p.family_id from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_mapper_ingredient_id=v_mapper.ingredient_id
      and p.family_id is not null order by p.version desc,p.policy_key limit 1),v_family);
  v_subfamily:=coalesce((select p.subfamily_id from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_mapper_ingredient_id=v_mapper.ingredient_id
      and p.subfamily_id is not null order by p.version desc,p.policy_key limit 1),v_subfamily);
  v_form:=coalesce((select p.form_id from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_mapper_ingredient_id=v_mapper.ingredient_id
      and p.form_id is not null order by p.version desc,p.policy_key limit 1),v_form);
  v_exact := exists (
    select 1 from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_mapper_ingredient_id=v_mapper.ingredient_id
      and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
  );
  v_policy_covered := v_family is not null and v_form is not null and exists (
    select 1 from public.product_behavior_policy_versions p
    where p.status='published' and p.exact_catalog_product_version_id is null
      and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapper.ingredient_id)
      and (p.family_id is null or p.family_id=v_family)
      and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
      and (p.form_id is null or p.form_id=v_form)
      and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
  );
  v_structural := v_category in (
    'sweetener','stabilizer','fiber','emulsifier','starch','acid','colorant',
    'functional_additive','additive'
  ) or v_subcategory='water';
  v_topping := v_category in (
    'confectionery_inclusion','bakery_inclusion','decorative_inclusion','variegate','coating'
  );
  v_flavour_candidate := v_category in (
    'fruit','fruit_powder','flavor_paste','flavor_powder','flavor_syrup',
    'flavor_concentrate','chocolate','cocoa','nut','nut_paste','coffee',
    'coffee_tea','alcohol','beverage','confectionery_spread'
  ) or v_family in ('coconut','bakery_cookie','spice_herb','vanilla','caramel','honey','dairy_flavour');

  if v_policy_covered then
    v_role := 'MAIN_PROFILE_SPECIFIC';
    v_policy_status := 'COVERED';
    v_main_eligibility := 'MAIN_PROFILE_SPECIFIC';
    select coalesce(jsonb_object_agg(x.product_profile,'eligible'),'{}'::jsonb)
    into v_profiles
    from (
      select distinct p.product_profile
      from public.product_behavior_policy_versions p
      where p.status='published' and p.exact_catalog_product_version_id is null
        and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapper.ingredient_id)
        and (p.family_id is null or p.family_id=v_family)
        and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
        and (p.form_id is null or p.form_id=v_form)
        and p.main_eligibility in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
    ) x;
  elsif v_category='protein' then
    v_role := 'PROTEIN_CONTRIBUTOR_ONLY';
    v_policy_status := 'NOT_APPLICABLE';
    v_main_eligibility := 'PROTEIN_CONTRIBUTOR_ONLY';
    v_profiles := jsonb_build_object('protein_gelato','contributor_only');
  elsif v_topping then
    v_role := 'TOPPING_ONLY';
    v_policy_status := 'NOT_APPLICABLE';
    v_main_eligibility := 'TOPPING_ONLY';
    v_profiles := jsonb_build_object('POST_PROCESS_ADDON','eligible_where_mapper_approved');
  elsif v_structural then
    v_role := 'STRUCTURAL_ONLY';
    v_policy_status := 'NOT_APPLICABLE';
    v_main_eligibility := 'NOT_MAIN';
    v_profiles := jsonb_build_object('all_existing_profiles','structural_where_mapper_approved');
  elsif v_flavour_candidate then
    v_role := case when v_family is not null and v_form is not null
      then 'MAIN_ALLOWED' else 'UNKNOWN_REQUIRES_EVIDENCE' end;
    v_policy_status := case
      when v_family is null or v_form is null then 'BLOCKED_DATA'
      when v_form in ('paste','flavour_paste','concentrate','extract') and not v_exact then 'BLOCKED_DATA'
      when v_family='alcohol' and coalesce(v_mapper.alcohol_percent,0)<=0 then 'BLOCKED_DATA'
      else 'BLOCKED_SCIENCE'
    end;
    v_main_eligibility := 'MAIN_BLOCKED_POLICY';
    v_profiles := jsonb_build_object('automatic_main','blocked_pending_exact_evidence');
  else
    v_role := 'STANDARD_ONLY';
    v_policy_status := 'NOT_APPLICABLE';
    v_main_eligibility := 'STANDARD_ONLY';
    v_profiles := jsonb_build_object('all_existing_profiles','standard_where_mapper_approved');
  end if;

  v_reasons := array_remove(array[
    case when v_role='UNKNOWN_REQUIRES_EVIDENCE' and v_family is null and v_form is null
      then 'family_and_form_evidence_missing' end,
    case when v_role='UNKNOWN_REQUIRES_EVIDENCE' and v_family is null and v_form is not null
      then 'family_evidence_missing' end,
    case when v_role='UNKNOWN_REQUIRES_EVIDENCE' and v_family is not null and v_form is null
      then 'form_or_concentration_evidence_missing' end,
    case when v_policy_status in ('BLOCKED_DATA','BLOCKED_SCIENCE')
      and v_family is not null and v_form is not null
      and not (
        v_policy_status='BLOCKED_DATA'
        and v_form in ('paste','flavour_paste','concentrate','extract')
        and not v_exact
      )
      and not (
        v_policy_status='BLOCKED_DATA'
        and v_family='alcohol'
        and coalesce(v_mapper.alcohol_percent,0)<=0
      )
      then 'profile_main_policy_missing' end,
    case when v_policy_status='BLOCKED_DATA'
      and v_family is not null and v_form is not null
      and v_form in ('paste','flavour_paste','concentrate','extract') and not v_exact
      then 'form_or_concentration_evidence_missing' end,
    case when v_policy_status='BLOCKED_DATA' and v_family='alcohol'
      and v_form is not null and coalesce(v_mapper.alcohol_percent,0)<=0
      then 'abv_evidence_missing' end,
    case when v_role='PROTEIN_CONTRIBUTOR_ONLY' then 'protein_contributor_not_flavour_main' end,
    case when v_role='TOPPING_ONLY' then 'post_process_product_not_base_main' end,
    case when v_role='STRUCTURAL_ONLY' then 'structural_product_not_flavour_main' end,
    case when v_role='STANDARD_ONLY' then 'standard_product_not_flavour_main' end,
    case when coalesce(v_process.process_decision,'UNKNOWN')='UNKNOWN' then 'process_evidence_missing' end
  ],null);

  insert into public.mapper_product_behavior_bindings(
    mapper_ingredient_id,mapper_dataset_version,taxonomy_version_id,
    family_id,subfamily_id,form_id,form_hint,main_eligibility,
    vegan_eligibility,protein_behavior,approved_liquid_dairy_carrier,
    profile_permissions,process_behavior,raw_evidence,classifier_version,is_current,
    behavior_role,main_policy_status,profile_applicability,classification_reason_codes
  ) values (
    v_mapper.ingredient_id,v_mapper.dataset_version,'pinguino-product-taxonomy-v1',
    v_family,v_subfamily,v_form,coalesce(v_form,'other'),v_main_eligibility,
    case v_mapper.vegan when 'true' then 'verified' when 'false' then 'false' else 'unknown' end,
    -- Product protein content remains an exact technical fact. The behavior
    -- role is narrower: only an explicit protein ingredient or aerating
    -- protein source is a route contributor; fruit/nut/cocoa flavour products
    -- are neutral rather than mysteriously blocking the Protein profile.
    case when v_category='protein' or coalesce(v_mapper.aerating_protein_percent,0)>0
      then 'contributor' else 'neutral' end,
    v_mapper.ingredient_id in ('PI-ING-000200','PI-ING-000201','PI-ING-000234','PI-ING-000235','PI-ING-000236'),
    jsonb_build_object(
      'BASE_RECIPE',v_mapper.approved_for_base and v_mapper.approved_for_engines,
      'TOPPING',v_mapper.approved_for_base,
      'SUBSTITUTION',v_mapper.approved_for_base and v_mapper.approved_for_engines,
      'MONITOR',v_mapper.approved_for_base and v_mapper.approved_for_engines,
      'PRODUCTION',v_mapper.approved_for_base and v_mapper.approved_for_engines,
      'LABEL',true,'NUTRITION',true,'COST',true,'SAVE',v_mapper.approved_for_base
    ),
    jsonb_build_object(
      'decision',coalesce(v_process.process_decision,'UNKNOWN'),
      'verificationStatus',coalesce(v_process.verification_status,'unknown'),
      'datasetVersion',v_process.dataset_version,
      'reasonType',v_process.reason_type,
      'explanation',v_process.explanation_pl,
      'heatSensitive',coalesce(v_process.heat_sensitive,false),
      'lateAdditionGuidance',v_process.late_addition_guidance_pl,
      'sourceLabel',v_process.source_label,'sourceReference',v_process.source_reference
    ),
    jsonb_build_object(
      'ingredientCategory',v_mapper.ingredient_category,
      'ingredientSubcategory',v_mapper.ingredient_subcategory,
      'verificationStatus',v_mapper.verification_status,
      'approvedForBase',v_mapper.approved_for_base,
      'approvedForEngines',v_mapper.approved_for_engines
    ),
    p_classifier_version,false,
    v_role,v_policy_status,v_profiles,v_reasons
  )
  on conflict (mapper_ingredient_id,mapper_dataset_version,classifier_version)
  do update set classified_at=now()
  returning id into v_binding;

  -- The candidate exists and satisfies every table constraint before the old
  -- current row is retired. A failure rolls this function back atomically.
  update public.mapper_product_behavior_bindings
  set is_current=false
  where mapper_ingredient_id=v_mapper.ingredient_id and is_current and id<>v_binding;
  update public.mapper_product_behavior_bindings set is_current=true where id=v_binding;

  -- 10300 creates one canonical mapper_reference product/version per active
  -- Mapper identity. Mirror this exact result into the canonical behavior
  -- table so built-ins use the same server binding contract as catalog items.
  perform set_config('app.canonical_product_ingest','v1',true);
  select p.id,p.current_version_id into v_canonical_product,v_canonical_version
  from public.products p
  join public.product_versions pv on pv.id=p.current_version_id and pv.product_id=p.id
  where p.product_kind='mapper_reference'
    and p.normalized_identity='mapper:'||v_mapper.ingredient_id
    and p.is_active and p.merged_into_product_id is null
    and pv.facts->>'mapperIngredientId'=v_mapper.ingredient_id
    and pv.facts->>'mapperDatasetVersion'=v_mapper.dataset_version;
  if v_canonical_product is null or v_canonical_version is null then
    raise exception 'canonical Mapper reference/version missing for %',v_mapper.ingredient_id;
  end if;

  insert into public.product_behavior_bindings(
    product_id,product_version_id,mapper_ingredient_id,taxonomy_version_id,
    family_id,subfamily_id,form_id,main_eligibility,vegan_eligibility,protein_behavior,
    approved_liquid_dairy_carrier,profile_permissions,process_behavior,behavior_snapshot,
    warnings,block_reasons,classifier_version,binding_status,is_current,
    behavior_role,main_policy_status,profile_applicability,classification_reason_codes
  )
  select
    v_canonical_product,v_canonical_version,b.mapper_ingredient_id,b.taxonomy_version_id,
    b.family_id,b.subfamily_id,b.form_id,b.main_eligibility,b.vegan_eligibility,b.protein_behavior,
    b.approved_liquid_dairy_carrier,b.profile_permissions,b.process_behavior,
    jsonb_build_object(
      'mapperDatasetVersion',b.mapper_dataset_version,
      'familyId',b.family_id,'subfamilyId',b.subfamily_id,'formId',b.form_id,
      'behaviorRole',b.behavior_role,'mainPolicyStatus',b.main_policy_status,
      'profileApplicability',b.profile_applicability,
      'classificationReasonCodes',to_jsonb(b.classification_reason_codes)
    ),
    '{}'::text[],b.classification_reason_codes,p_classifier_version,
    case when v_mapper.approved_for_base then 'ready' else 'blocked' end,false,
    b.behavior_role,b.main_policy_status,b.profile_applicability,b.classification_reason_codes
  from public.mapper_product_behavior_bindings b where b.id=v_binding
  on conflict(product_version_id,classifier_version)
  do update set classified_at=now()
  returning id into v_canonical_binding;

  update public.product_behavior_bindings set is_current=false
  where product_id=v_canonical_product and is_current and id<>v_canonical_binding;
  update public.product_behavior_bindings set is_current=true where id=v_canonical_binding;
  update public.products set current_behavior_binding_id=v_canonical_binding
  where id=v_canonical_product;

  return v_binding;
end $$;

revoke all on function public.classify_mapper_product_behavior_v2(text,text) from public,anon,authenticated;
grant execute on function public.classify_mapper_product_behavior_v2(text,text) to service_role;

-- Canonical product classifier. It writes only the one product root introduced
-- by the immediately preceding migration; compatibility catalog views remain
-- read-only.
create or replace function public.classify_catalog_product_behavior_v2(
  p_catalog_product_version_id uuid,
  p_classifier_version text
) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
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
    and m.is_active and m.approved_for_base and m.approved_for_engines
    and m.verification_status='verified'
  limit 1;
  -- Taxonomy is server-owned. Customer/public product fields are evidence for
  -- review only and never outrank the exact current Mapper binding.
  v_family := null;
  v_subfamily := null;
  v_form := null;
  v_base := v_product.canonical_verification_status<>'blocked' and v_mapping is not null;
  v_topping := v_product.canonical_verification_status<>'blocked'
    and nullif(trim(coalesce(v_public_data->>'ingredientsText','')),'') is not null
    and nullif(trim(coalesce(v_public_data->>'allergensText','')),'') is not null
    and jsonb_typeof(v_public_data->'nutrition')='object';
  select coalesce(b.approved_liquid_dairy_carrier,false),b.process_behavior,
    b.behavior_role,b.family_id,b.subfamily_id,b.form_id,b.vegan_eligibility,b.protein_behavior
  into v_liquid_dairy_carrier,v_mapper_process,v_mapper_role,
    v_mapper_family,v_mapper_subfamily,v_mapper_form,v_mapper_vegan,v_mapper_protein
  from public.mapper_product_behavior_bindings b
  where b.mapper_ingredient_id=v_mapping and b.is_current;
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
    case when v_mapping is null then 'base_technical_authority_missing' end
  ],null);

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
      'SEARCH',v_product.canonical_verification_status<>'blocked',
      'BASE_RECIPE',v_base,
      'MAIN',v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'OPTIMAL',v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'ECO',v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC'),
      'TOPPING',v_topping,'SUBSTITUTION',v_base,'COST',true,'MONITOR',v_base,
      'PRODUCTION',v_base or v_topping,'LABEL',v_topping,'NUTRITION',v_topping,
      'SAVE',v_base or v_topping
    ),
    coalesce(v_mapper_process,'{}'::jsonb)||jsonb_build_object(
      'BASE_FORMULATION',v_base,'POST_PROCESS_ADDON',v_topping
    ),
    jsonb_build_object(
      'familyId',v_family,'subfamilyId',v_subfamily,'formId',v_form,
      'behaviorRole',v_role,'mainPolicyStatus',v_policy_status,
      'profileApplicability',v_profiles,'classificationReasonCodes',to_jsonb(v_reasons)
    ),
    case when v_product.canonical_verification_status='manual_unverified'
      then array['catalog_manual_unverified'] else '{}'::text[] end,
    v_reasons,p_classifier_version,
    case when v_product.canonical_verification_status='blocked' then 'blocked' else 'ready' end,
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
end $$;

revoke all on function public.classify_catalog_product_behavior_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.classify_catalog_product_behavior_v2(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Resumable, idempotent classification queue.
-- ---------------------------------------------------------------------------

create table if not exists public.product_behavior_reclassification_queue (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('mapper','catalog_product_version')),
  entity_id text not null,
  reason text not null,
  source_fingerprint text not null,
  classifier_version text not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  progress jsonb not null default '{"stage":"queued","completed":0,"total":1}'::jsonb,
  result_binding_id uuid,
  last_error_code text,
  last_error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  idempotency_key text not null unique
);
create index if not exists product_behavior_reclassification_claim_idx
  on public.product_behavior_reclassification_queue(status,attempt_count,queued_at);

alter table public.product_behavior_reclassification_queue enable row level security;
revoke all on public.product_behavior_reclassification_queue from public,anon,authenticated;

create or replace function public.product_behavior_authority_fingerprint_v1()
returns text
language sql stable security definer
set search_path=public,extensions
as $$
  select encode(extensions.digest(
    coalesce((select string_agg(to_jsonb(p)::text,E'\n' order by p.policy_key,p.version)
      from public.product_behavior_policy_versions p where p.status='published'),'') || E'\n' ||
    coalesce((select string_agg(to_jsonb(n)::text,E'\n' order by n.taxonomy_version_id,n.kind,n.id)
      from public.product_taxonomy_nodes n),'') || E'\n' ||
    coalesce((select string_agg(to_jsonb(a)::text,E'\n' order by a.taxonomy_version_id,a.node_id,a.language,a.normalized_alias)
      from public.product_taxonomy_aliases a),''),
    'sha256'
  ),'hex')
$$;

create or replace function public.product_behavior_entity_fingerprint_v1(
  p_entity_kind text,
  p_entity_id text
) returns text
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare v_local text;
begin
  if p_entity_kind='mapper' then
    select coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,'')
    into v_local
    from public.mapper_basement m
    left join public.mapper_process_metadata pm on pm.ingredient_id=m.ingredient_id
    where m.ingredient_id=p_entity_id;
  elsif p_entity_kind='catalog_product_version' then
    select coalesce(to_jsonb(v)::text,'')||'|'||coalesce((to_jsonb(p)-array['current_behavior_binding_id','updated_at'])::text,'')||'|'||
      coalesce(b.mapper_ingredient_id,'')||'|'||
      coalesce(to_jsonb(m)::text,'')||'|'||coalesce(to_jsonb(pm)::text,'')
    into v_local
    from public.product_versions v
    join public.products p on p.id=v.product_id
    left join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    left join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    left join public.mapper_process_metadata pm on pm.ingredient_id=b.mapper_ingredient_id
    where v.id=p_entity_id::uuid;
  else
    raise exception 'unsupported classification entity kind';
  end if;
  if v_local is null then raise exception 'classification entity not found'; end if;
  return encode(extensions.digest(
    public.product_behavior_authority_fingerprint_v1()||'|'||v_local,'sha256'
  ),'hex');
end $$;

create or replace function public.enqueue_product_behavior_reclassification_v1(
  p_entity_kind text,
  p_entity_id text,
  p_reason text,
  p_source_fingerprint text default null,
  p_classifier_version text default null
) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_fingerprint text;
  v_classifier text;
  v_key text;
  v_id uuid;
begin
  if p_entity_kind not in ('mapper','catalog_product_version') then
    raise exception 'unsupported classification entity kind';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'product-behavior:'||p_entity_kind||':'||p_entity_id,0
  ));
  v_fingerprint := coalesce(nullif(p_source_fingerprint,''),
    public.product_behavior_entity_fingerprint_v1(p_entity_kind,p_entity_id));
  v_classifier := coalesce(nullif(p_classifier_version,''),
    'product-behavior-layered-v2-'||left(v_fingerprint,16));
  v_key := encode(extensions.digest(
    p_entity_kind||'|'||p_entity_id||'|'||v_classifier||'|'||v_fingerprint,'sha256'
  ),'hex');
  insert into public.product_behavior_reclassification_queue(
    entity_kind,entity_id,reason,source_fingerprint,classifier_version,idempotency_key
  ) values (
    p_entity_kind,p_entity_id,p_reason,v_fingerprint,v_classifier,v_key
  )
  on conflict (idempotency_key) do update set
    reason=excluded.reason,
    status=case when product_behavior_reclassification_queue.status='running'
      then 'running' else 'pending' end,
    attempt_count=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.attempt_count else 0 end,
    last_error_code=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.last_error_code else null end,
    last_error_message=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.last_error_message else null end,
    result_binding_id=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.result_binding_id else null end,
    progress=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.progress else '{"stage":"queued","completed":0,"total":1}'::jsonb end,
    queued_at=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.queued_at else now() end,
    started_at=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.started_at else null end,
    completed_at=case when product_behavior_reclassification_queue.status='running'
      then product_behavior_reclassification_queue.completed_at else null end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.enqueue_all_product_behavior_reclassification_v1(
  p_reason text
) returns integer
language plpgsql security definer
set search_path=public,extensions
as $$
declare v_id text; v_count integer := 0;
begin
  for v_id in select ingredient_id from public.mapper_basement where is_active order by ingredient_id loop
    perform public.enqueue_product_behavior_reclassification_v1('mapper',v_id,p_reason);
    v_count := v_count+1;
  end loop;
  for v_id in
    select current_version_id::text from public.products
    where is_active and merged_into_product_id is null and current_version_id is not null
      and product_kind<>'mapper_reference'
    order by id
  loop
    perform public.enqueue_product_behavior_reclassification_v1('catalog_product_version',v_id,p_reason);
    v_count := v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.process_product_behavior_reclassification_queue_v1(
  p_limit integer default 100
) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare
  v_job public.product_behavior_reclassification_queue%rowtype;
  v_binding uuid;
  v_processed integer := 0;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_catalog_version uuid;
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
      if v_job.entity_kind='mapper' then
        v_binding := public.classify_mapper_product_behavior_v2(v_job.entity_id,v_job.classifier_version);
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
            and b.mapper_ingredient_id=v_job.entity_id
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

revoke all on function public.product_behavior_authority_fingerprint_v1() from public,anon,authenticated;
revoke all on function public.product_behavior_entity_fingerprint_v1(text,text) from public,anon,authenticated;
revoke all on function public.enqueue_product_behavior_reclassification_v1(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.enqueue_all_product_behavior_reclassification_v1(text) from public,anon,authenticated;
revoke all on function public.process_product_behavior_reclassification_queue_v1(integer) from public,anon,authenticated;
grant execute on function public.product_behavior_authority_fingerprint_v1(),
  public.product_behavior_entity_fingerprint_v1(text,text),
  public.enqueue_product_behavior_reclassification_v1(text,text,text,text,text),
  public.enqueue_all_product_behavior_reclassification_v1(text),
  public.process_product_behavior_reclassification_queue_v1(integer) to service_role;

-- Convert only the exact version/binding process decision into the immutable
-- recipe evidence contract. Unknown remains an honest empty evidence set.
create or replace function public.product_process_evidence_v2(
  p_process jsonb,
  p_identity text
) returns jsonb
language plpgsql immutable
set search_path=public
as $$
declare
  v_decision text := coalesce(p_process->>'decision','UNKNOWN');
  v_function jsonb;
  v_safety jsonb;
begin
  if v_decision='UNKNOWN' then return '[]'::jsonb; end if;
  v_function := jsonb_build_object(
    'decision','heat_required_for_function','reasonType',p_process->>'reasonType',
    'affectedIngredientIds',jsonb_build_array(p_identity),
    'explanation',p_process->>'explanation',
    'lateAdditionGuidance',p_process->'lateAdditionGuidance',
    'source',jsonb_build_object(
      'id',(p_process->>'datasetVersion')||':'||p_identity||':heat_required_for_function',
      'label',p_process->>'sourceLabel','reference',p_process->>'sourceReference',
      'verificationStatus',p_process->>'verificationStatus'
    )
  );
  v_safety := jsonb_build_object(
    'decision','heat_required_for_safety','reasonType','food_safety',
    'affectedIngredientIds',jsonb_build_array(p_identity),
    'explanation',p_process->>'explanation',
    'lateAdditionGuidance',p_process->'lateAdditionGuidance',
    'source',jsonb_build_object(
      'id',(p_process->>'datasetVersion')||':'||p_identity||':heat_required_for_safety',
      'label',p_process->>'sourceLabel','reference',p_process->>'sourceReference',
      'verificationStatus',p_process->>'verificationStatus'
    )
  );
  return case v_decision
    when 'COLD_PROCESS_OK' then jsonb_build_array(jsonb_build_object(
      'decision','cold_process_approved','reasonType',p_process->>'reasonType',
      'affectedIngredientIds',jsonb_build_array(p_identity),
      'explanation',p_process->>'explanation',
      'lateAdditionGuidance',p_process->'lateAdditionGuidance',
      'source',jsonb_build_object(
        'id',(p_process->>'datasetVersion')||':'||p_identity||':cold_process_approved',
        'label',p_process->>'sourceLabel','reference',p_process->>'sourceReference',
        'verificationStatus',p_process->>'verificationStatus'
      )
    ))
    when 'HEAT_REQUIRED_FOR_FUNCTION' then jsonb_build_array(v_function)
    when 'HEAT_REQUIRED_FOR_SAFETY' then jsonb_build_array(v_safety)
    when 'HEAT_REQUIRED_FOR_BOTH' then jsonb_build_array(v_function,v_safety)
    else '[]'::jsonb
  end;
end $$;

revoke all on function public.product_process_evidence_v2(jsonb,text) from public,anon,authenticated;
grant execute on function public.product_process_evidence_v2(jsonb,text) to service_role;

-- One deterministic policy lookup. Equal best-specificity candidates are not
-- silently ordered by UUID: automatic Main is rejected with an exact reason.
create or replace function public.resolve_product_behavior_v1(
  p_entity_kind text,
  p_entity_id text,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path=public,extensions
as $$
declare
  v_profile text := coalesce(nullif(p_context->>'productProfile',''),'milk_gelato');
  v_scope text := coalesce(nullif(p_context->>'processScope',''),'BASE_FORMULATION');
  v_role_request text := coalesce(nullif(p_context->>'requestedRole',''),'STANDARD');
  v_module text := coalesce(nullif(p_context->>'module',''),'SEARCH');
  v_temperature numeric := nullif(p_context->>'temperatureC','')::numeric;
  v_product_id uuid;
  v_version_id uuid;
  v_status text;
  v_source text;
  v_mapping text;
  v_binding_id uuid;
  v_binding_version text;
  v_facts_fingerprint text;
  v_taxonomy text;
  v_family text;
  v_subfamily text;
  v_form text;
  v_main text;
  v_behavior_role text;
  v_main_policy_status text;
  v_vegan text;
  v_protein text;
  v_liquid_dairy_carrier boolean := false;
  v_permissions jsonb;
  v_process jsonb;
  v_profile_applicability jsonb;
  v_classification_reasons text[];
  v_warnings text[];
  v_blocks text[];
  v_policy public.product_behavior_policy_versions%rowtype;
  v_policy_id uuid;
  v_policy_count integer := 0;
  v_policy_ambiguous boolean := false;
  v_version_facts jsonb := '{}'::jsonb;
  v_public_facts jsonb := '{}'::jsonb;
  v_shared_facts jsonb;
  v_private_overlay jsonb;
  v_profile_eligibility jsonb := '[]'::jsonb;
  v_module_eligibility jsonb := '{}'::jsonb;
  v_queue_status text;
  v_base_allowed boolean := false;
  v_topping_allowed boolean := false;
  v_profile_allowed boolean := true;
  v_has_nutrition boolean := false;
  v_has_allergens boolean := false;
  v_has_process boolean := false;
  v_mapper_composition jsonb;
  v_mapper_reference_price jsonb;
  v_allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if v_profile not in (
      'milk_gelato','fruit_gelato','nut_gelato','chocolate_gelato',
      'alcohol_gelato','sorbet','vegan_gelato','protein_gelato'
    ) or v_scope not in ('BASE_FORMULATION','POST_PROCESS_ADDON')
    or v_role_request not in ('STANDARD','MAIN') then raise exception 'invalid behavior context'; end if;
  if v_temperature is not null and v_temperature not in (-11,-12,-13) then
    raise exception 'invalid behavior temperature context';
  end if;

  if p_entity_kind='catalog_product_version' then
    v_version_id := p_entity_id::uuid;
    select b.product_id,b.id,b.classifier_version,
      v.facts_fingerprint,
      b.mapper_ingredient_id,b.taxonomy_version_id,
      b.family_id,b.subfamily_id,b.form_id,b.main_eligibility,b.behavior_role,b.main_policy_status,
      b.vegan_eligibility,b.protein_behavior,b.approved_liquid_dairy_carrier,
      b.profile_permissions,b.process_behavior,b.profile_applicability,b.classification_reason_codes,
      b.warnings,b.block_reasons,p.canonical_verification_status,p.canonical_provenance,v.facts
    into v_product_id,v_binding_id,v_binding_version,v_facts_fingerprint,v_mapping,v_taxonomy,
      v_family,v_subfamily,v_form,v_main,v_behavior_role,v_main_policy_status,
      v_vegan,v_protein,v_liquid_dairy_carrier,
      v_permissions,v_process,v_profile_applicability,v_classification_reasons,
      v_warnings,v_blocks,v_status,v_source,v_version_facts
    from public.product_behavior_bindings b
    join public.products p on p.id=b.product_id and p.is_active and p.merged_into_product_id is null
      and (
        (p.visibility='shared' and p.canonical_verification_status<>'blocked')
        or p.owning_account_id=auth.uid() or p.owner_user_id=auth.uid()
        or p.created_by=auth.uid()
        or exists(select 1 from public.admin_users a
          where a.user_id=auth.uid() and a.revoked_at is null)
      )
    join public.product_versions v on v.id=b.product_version_id
    where b.product_version_id=v_version_id and b.is_current
      and p.current_version_id=v_version_id;
  elsif p_entity_kind='mapper' then
    select p.id,v.id,b.id,b.classifier_version,v.facts_fingerprint,
      b.mapper_ingredient_id,b.taxonomy_version_id,
      b.family_id,b.subfamily_id,b.form_id,b.main_eligibility,b.behavior_role,b.main_policy_status,
      b.vegan_eligibility,b.protein_behavior,b.approved_liquid_dairy_carrier,
      b.profile_permissions,b.process_behavior,b.profile_applicability,b.classification_reason_codes,
      '{}'::text[],'{}'::text[],to_jsonb(m)
    into v_product_id,v_version_id,v_binding_id,v_binding_version,v_facts_fingerprint,v_mapping,v_taxonomy,
      v_family,v_subfamily,v_form,v_main,v_behavior_role,v_main_policy_status,
      v_vegan,v_protein,v_liquid_dairy_carrier,
      v_permissions,v_process,v_profile_applicability,v_classification_reasons,
      v_warnings,v_blocks,v_version_facts
    from public.products p
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id
    where p.product_kind='mapper_reference'
      and p.normalized_identity='mapper:'||p_entity_id
      and p.is_active and p.merged_into_product_id is null
      and b.mapper_ingredient_id=p_entity_id
      and m.is_active and m.approved_for_base;
    v_status := 'pi_base'; v_source := 'mapper';
  else
    raise exception 'unsupported entity kind';
  end if;

  -- `factsFingerprint` is the complete current shared authority fingerprint,
  -- not merely the immutable product JSON. It changes with the exact current
  -- Mapper/process authority and policy/taxonomy registry.
  v_facts_fingerprint:=public.product_behavior_entity_fingerprint_v1(p_entity_kind,p_entity_id);

  if v_binding_id is null then
    return jsonb_build_object(
      'schemaVersion',1,'entityKind',p_entity_kind,'entityId',p_entity_id,
      'state','blocked','module',v_module,'reasons',jsonb_build_array('behavior_binding_missing')
    );
  end if;

  -- A current binding remains published while a replacement is calculated,
  -- but no customer gate may treat it as current authority during that window.
  select q.status into v_queue_status
  from public.product_behavior_reclassification_queue q
  where q.entity_kind=p_entity_kind and q.entity_id=p_entity_id
    and q.status in ('pending','running','failed')
    and q.source_fingerprint=public.product_behavior_entity_fingerprint_v1(p_entity_kind,p_entity_id)
  order by q.updated_at desc,q.id desc limit 1;
  if v_queue_status is not null then
    return jsonb_build_object(
      'schemaVersion',1,
      'resolverVersion','unified-product-behavior-v2',
      'entityKind',p_entity_kind,
      'entityId',p_entity_id,
      'state','blocked',
      'module',v_module,
      'reasons',jsonb_build_array(case when v_queue_status='failed'
        then 'classification_failed' else 'classification_pending' end),
      'blockReasons',jsonb_build_array(case when v_queue_status='failed'
        then 'classification_failed' else 'classification_pending' end)
    );
  end if;

  with candidates as (
    select p.id,
      case
        when p.exact_catalog_product_version_id is not null then 500
        when p.exact_mapper_ingredient_id is not null then 400
        when p.subfamily_id is not null and p.form_id is not null then 300
        when p.family_id is not null and p.subfamily_id is null and p.form_id is not null then 200
        when p.exact_catalog_product_version_id is null and p.exact_mapper_ingredient_id is null
          and p.family_id is null and p.subfamily_id is null and p.form_id is null then 100
        else 0
      end as specificity
    from public.product_behavior_policy_versions p
    where p.status='published' and p.taxonomy_version_id=v_taxonomy and p.product_profile=v_profile
      and (p.temperature_min_c is null or (v_temperature is not null and v_temperature>=p.temperature_min_c))
      and (p.temperature_max_c is null or (v_temperature is not null and v_temperature<=p.temperature_max_c))
      and (p.exact_catalog_product_version_id is null or p.exact_catalog_product_version_id=v_version_id)
      and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapping)
      and (p.family_id is null or p.family_id=v_family)
      and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
      and (p.form_id is null or p.form_id=v_form)
  ), best as (
    select max(specificity) as specificity from candidates where specificity>0
  ), top_candidates as (
    select c.id from candidates c join best b on b.specificity=c.specificity
  )
  select count(*),(array_agg(id order by id))[1]
  into v_policy_count,v_policy_id from top_candidates;

  if v_policy_count=1 then
    select * into v_policy from public.product_behavior_policy_versions where id=v_policy_id;
  elsif v_policy_count>1 then
    v_policy_ambiguous := true;
    v_blocks := coalesce(v_blocks,'{}'::text[]) || array['ambiguous_main_policy'];
  end if;

  -- Resolve immutable shared facts for this exact version. Private commercial
  -- data is deliberately sourced from the per-user relation only, below.
  v_public_facts := case
    when p_entity_kind='catalog_product_version'
      then coalesce(v_version_facts->'public_data',v_version_facts,'{}'::jsonb)
    else v_version_facts
  end;

  select coalesce(jsonb_agg(x.product_profile order by x.product_profile),'[]'::jsonb)
  into v_profile_eligibility
  from (
    select distinct p.product_profile
    from public.product_behavior_policy_versions p
    where p.status='published' and p.taxonomy_version_id=v_taxonomy
      and (p.exact_catalog_product_version_id is null or p.exact_catalog_product_version_id=v_version_id)
      and (p.exact_mapper_ingredient_id is null or p.exact_mapper_ingredient_id=v_mapping)
      and (p.family_id is null or p.family_id=v_family)
      and (p.subfamily_id is null or p.subfamily_id=v_subfamily)
      and (p.form_id is null or p.form_id=v_form)
  ) x;

  if v_mapping is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'water',to_jsonb(m.water_percent),
      'totalSolids',to_jsonb(m.total_solids_percent),
      'fat',to_jsonb(m.fat_percent),
      'saturatedFat',to_jsonb(m.saturated_fat_percent),
      'milkFat',to_jsonb(m.milk_fat_percent),
      'nonFatMilkSolids',to_jsonb(m.non_fat_milk_solids_percent),
      'protein',to_jsonb(m.protein_percent),
      'aeratingProtein',to_jsonb(m.aerating_protein_percent),
      'carbohydrate',to_jsonb(m.carbohydrate_percent),
      'sugars',to_jsonb(m.total_sugars_percent),
      'sucrose',to_jsonb(m.sucrose_percent),
      'dextrose',to_jsonb(m.dextrose_percent),
      'glucose',to_jsonb(m.glucose_percent),
      'fructose',to_jsonb(m.fructose_percent),
      'lactose',to_jsonb(m.lactose_percent),
      'polyols',to_jsonb(m.polyol_percent),
      'fibre',to_jsonb(m.fiber_percent),
      'salt',to_jsonb(m.salt_percent),
      'alcohol',to_jsonb(m.alcohol_percent),
      'energyKcal',to_jsonb(m.kcal_per_100g),
      'podValue',to_jsonb(m.pod_value),
      'pacValue',to_jsonb(m.pac_value),
      'deValue',to_jsonb(m.de_value)
    )),case when m.cost_per_kg is not null then jsonb_build_object(
      'pricePerKg',m.cost_per_kg,
      'currency',coalesce(nullif(upper(m.currency),''),'EUR'),
      'sourceVersion',m.dataset_version||':'||m.ingredient_id
    ) else null end into v_mapper_composition,v_mapper_reference_price
    from public.mapper_basement m
    where m.ingredient_id=v_mapping and m.is_active
      and m.approved_for_base and m.approved_for_engines;
  end if;

  if p_entity_kind='catalog_product_version' then
    v_shared_facts := jsonb_build_object(
      'schemaVersion',1,
      'technicalComposition',v_mapper_composition,
      'nutritionPer100g',case
        when jsonb_typeof(v_public_facts->'nutrition')='object'
          and v_public_facts->'nutrition'->>'basis'='per_100g'
          then jsonb_build_object(
            'basis','per_100g',
            'energyKcal',v_public_facts->'nutrition'->'energyKcal',
            'fat',v_public_facts->'nutrition'->'fat',
            'saturatedFat',v_public_facts->'nutrition'->'saturatedFat',
            'carbohydrate',v_public_facts->'nutrition'->'carbohydrate',
            'sugars',v_public_facts->'nutrition'->'sugars',
            'protein',v_public_facts->'nutrition'->'protein',
            'salt',v_public_facts->'nutrition'->'salt',
            'fibre',v_public_facts->'nutrition'->'fibre'
          )
        when v_public_facts ? 'kcal_per_100g' then jsonb_build_object(
          'basis','per_100g',
          'energyKcal',v_public_facts->'kcal_per_100g',
          'fat',v_public_facts->'fat_percent',
          'saturatedFat',v_public_facts->'saturated_fat_percent',
          'carbohydrate',v_public_facts->'carbohydrate_percent',
          'sugars',v_public_facts->'total_sugars_percent',
          'protein',v_public_facts->'protein_percent',
          'salt',v_public_facts->'salt_percent',
          'fibre',v_public_facts->'fiber_percent'
        )
        else null
      end,
      'allergens',case
        when nullif(trim(coalesce(v_public_facts->>'ingredientsText','')),'') is not null
          or nullif(trim(coalesce(v_public_facts->>'allergensText','')),'') is not null
        then jsonb_build_object(
          'ingredientsText',v_public_facts->'ingredientsText',
          'allergensText',v_public_facts->'allergensText',
          'declared',case when jsonb_typeof(v_public_facts->'declaredAllergens')='array'
            then v_public_facts->'declaredAllergens' else '[]'::jsonb end,
          'mayContain',case when jsonb_typeof(v_public_facts->'mayContainAllergens')='array'
            then v_public_facts->'mayContainAllergens' else '[]'::jsonb end,
          'evidenceVersion',v_binding_version
        ) else null end,
      'processEvidence',public.product_process_evidence_v2(
        v_process,coalesce(v_mapping,p_entity_id)
      ),
      'profileEligibility',v_profile_eligibility,
      'veganEligibility',v_vegan,
      'proteinBehavior',v_protein,
      'referencePrice',case
        when jsonb_typeof(v_public_facts->'referencePrice')='object'
          and jsonb_typeof(v_public_facts->'referencePrice'->'pricePerKg')='number'
        then v_public_facts->'referencePrice'||jsonb_build_object('sourceVersion',v_binding_version)
        else v_mapper_reference_price
      end
    );

  else
    v_shared_facts := jsonb_build_object(
      'schemaVersion',1,
      'technicalComposition',jsonb_strip_nulls(jsonb_build_object(
        'water',v_version_facts->'water_percent',
        'totalSolids',v_version_facts->'total_solids_percent',
        'fat',v_version_facts->'fat_percent',
        'saturatedFat',v_version_facts->'saturated_fat_percent',
        'milkFat',v_version_facts->'milk_fat_percent',
        'nonFatMilkSolids',v_version_facts->'non_fat_milk_solids_percent',
        'protein',v_version_facts->'protein_percent',
        'aeratingProtein',v_version_facts->'aerating_protein_percent',
        'carbohydrate',v_version_facts->'carbohydrate_percent',
        'sugars',v_version_facts->'total_sugars_percent',
        'sucrose',v_version_facts->'sucrose_percent',
        'dextrose',v_version_facts->'dextrose_percent',
        'glucose',v_version_facts->'glucose_percent',
        'fructose',v_version_facts->'fructose_percent',
        'lactose',v_version_facts->'lactose_percent',
        'polyols',v_version_facts->'polyol_percent',
        'fibre',v_version_facts->'fiber_percent',
        'salt',v_version_facts->'salt_percent',
        'alcohol',v_version_facts->'alcohol_percent',
        'energyKcal',v_version_facts->'kcal_per_100g',
        'podValue',v_version_facts->'pod_value',
        'pacValue',v_version_facts->'pac_value',
        'deValue',v_version_facts->'de_value'
      )),
      'nutritionPer100g',jsonb_build_object(
        'basis','per_100g',
        'energyKcal',v_version_facts->'kcal_per_100g',
        'fat',v_version_facts->'fat_percent',
        'saturatedFat',v_version_facts->'saturated_fat_percent',
        'carbohydrate',v_version_facts->'carbohydrate_percent',
        'sugars',v_version_facts->'total_sugars_percent',
        'protein',v_version_facts->'protein_percent',
        'salt',v_version_facts->'salt_percent',
        'fibre',v_version_facts->'fiber_percent'
      ),
      'allergens',case when nullif(trim(coalesce(v_version_facts->>'allergens','')),'') is not null
        then jsonb_build_object(
          'ingredientsText',v_version_facts->'ingredient_name_display',
          'allergensText',v_version_facts->'allergens',
          'declared','[]'::jsonb,
          'mayContain','[]'::jsonb,
          'evidenceVersion',v_binding_version
        ) else null end,
      'processEvidence',case coalesce(v_process->>'decision','UNKNOWN')
        when 'COLD_PROCESS_OK' then jsonb_build_array(jsonb_build_object(
          'decision','cold_process_approved','reasonType',v_process->>'reasonType',
          'affectedIngredientIds',jsonb_build_array(p_entity_id),
          'explanation',v_process->>'explanation',
          'lateAdditionGuidance',v_process->'lateAdditionGuidance',
          'source',jsonb_build_object(
            'id',(v_process->>'datasetVersion')||':'||p_entity_id||':cold_process_approved',
            'label',v_process->>'sourceLabel','reference',v_process->>'sourceReference',
            'verificationStatus',v_process->>'verificationStatus'
          )
        ))
        when 'HEAT_REQUIRED_FOR_FUNCTION' then jsonb_build_array(jsonb_build_object(
          'decision','heat_required_for_function','reasonType',v_process->>'reasonType',
          'affectedIngredientIds',jsonb_build_array(p_entity_id),
          'explanation',v_process->>'explanation',
          'lateAdditionGuidance',v_process->'lateAdditionGuidance',
          'source',jsonb_build_object(
            'id',(v_process->>'datasetVersion')||':'||p_entity_id||':heat_required_for_function',
            'label',v_process->>'sourceLabel','reference',v_process->>'sourceReference',
            'verificationStatus',v_process->>'verificationStatus'
          )
        ))
        when 'HEAT_REQUIRED_FOR_SAFETY' then jsonb_build_array(jsonb_build_object(
          'decision','heat_required_for_safety','reasonType','food_safety',
          'affectedIngredientIds',jsonb_build_array(p_entity_id),
          'explanation',v_process->>'explanation',
          'lateAdditionGuidance',v_process->'lateAdditionGuidance',
          'source',jsonb_build_object(
            'id',(v_process->>'datasetVersion')||':'||p_entity_id||':heat_required_for_safety',
            'label',v_process->>'sourceLabel','reference',v_process->>'sourceReference',
            'verificationStatus',v_process->>'verificationStatus'
          )
        ))
        when 'HEAT_REQUIRED_FOR_BOTH' then jsonb_build_array(
          jsonb_build_object(
            'decision','heat_required_for_function','reasonType',v_process->>'reasonType',
            'affectedIngredientIds',jsonb_build_array(p_entity_id),
            'explanation',v_process->>'explanation',
            'lateAdditionGuidance',v_process->'lateAdditionGuidance',
            'source',jsonb_build_object(
              'id',(v_process->>'datasetVersion')||':'||p_entity_id||':heat_required_for_function',
              'label',v_process->>'sourceLabel','reference',v_process->>'sourceReference',
              'verificationStatus',v_process->>'verificationStatus'
            )
          ),
          jsonb_build_object(
            'decision','heat_required_for_safety','reasonType','food_safety',
            'affectedIngredientIds',jsonb_build_array(p_entity_id),
            'explanation',v_process->>'explanation',
            'lateAdditionGuidance',v_process->'lateAdditionGuidance',
            'source',jsonb_build_object(
              'id',(v_process->>'datasetVersion')||':'||p_entity_id||':heat_required_for_safety',
              'label',v_process->>'sourceLabel','reference',v_process->>'sourceReference',
              'verificationStatus',v_process->>'verificationStatus'
            )
          )
        )
        else '[]'::jsonb
      end,
      'profileEligibility',v_profile_eligibility,
      'veganEligibility',v_vegan,
      'proteinBehavior',v_protein,
      'referencePrice',case when jsonb_typeof(v_version_facts->'cost_per_kg')='number'
        then jsonb_build_object(
          'pricePerKg',v_version_facts->'cost_per_kg',
          'currency',coalesce(nullif(v_version_facts->>'currency',''),'EUR'),
          'sourceVersion',v_binding_version
        ) else null end
    );
  end if;

  select jsonb_build_object(
    'favorite',r.favorite,
    'recentAt',r.recently_used_at,
    'privatePricePerKg',r.private_price,
    'privatePriceCurrency',r.currency,
    'supplier',r.supplier,
    'note',r.notes,
    'stock',r.stock
  ) into v_private_overlay
  from public.user_product_relations r
  where r.user_id=auth.uid() and r.product_id=v_product_id;

  v_profile_allowed := case
    when v_profile in ('vegan_gelato','sorbet') then v_vegan='verified'
    when v_profile='protein_gelato' then v_protein<>'unknown'
    else true
  end;
  v_base_allowed := v_status<>'blocked'
    and v_scope='BASE_FORMULATION'
    and v_profile_allowed
    and coalesce((v_permissions->>'BASE_RECIPE')::boolean,false)
    and v_mapping is not null;
  v_topping_allowed := v_status<>'blocked'
    and v_scope='POST_PROCESS_ADDON'
    and coalesce((v_permissions->>'TOPPING')::boolean,false);
  v_has_nutrition := jsonb_typeof(v_shared_facts->'nutritionPer100g')='object';
  v_has_allergens := jsonb_typeof(v_shared_facts->'allergens')='object'
    and nullif(trim(coalesce(v_shared_facts->'allergens'->>'ingredientsText','')),'') is not null
    and nullif(trim(coalesce(v_shared_facts->'allergens'->>'allergensText','')),'') is not null;
  v_has_process := jsonb_typeof(v_shared_facts->'processEvidence')='array'
    and jsonb_array_length(v_shared_facts->'processEvidence')>0
    and coalesce(v_process->>'verificationStatus','')='verified';

  v_module_eligibility := jsonb_build_object(
    'SEARCH',case when v_status='blocked' then 'blocked' else 'eligible' end,
    'BASE_RECIPE',case when v_base_allowed then 'eligible' else 'blocked' end,
    'MAIN',case when v_base_allowed and v_main in ('MAIN_ALLOWED','MAIN_PROFILE_SPECIFIC')
      and v_policy.id is not null and not v_policy_ambiguous and v_has_process then 'eligible' else 'blocked' end,
    'OPTIMAL',case when v_base_allowed then 'eligible' else 'blocked' end,
    'ECO',case when v_base_allowed then 'eligible' else 'blocked' end,
    'TOPPING',case when v_topping_allowed then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'SUBSTITUTION',case when v_base_allowed and coalesce((v_permissions->>'SUBSTITUTION')::boolean,false)
      then 'eligible' else 'blocked' end,
    'COST',case when v_status<>'blocked' and coalesce((v_permissions->>'COST')::boolean,false)
      then 'eligible' else 'blocked' end,
    'MONITOR',case when v_status<>'blocked' and coalesce((v_permissions->>'MONITOR')::boolean,false)
      then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'PRODUCTION',case when v_status<>'blocked' and (v_base_allowed or v_topping_allowed)
      then case when v_base_allowed then 'eligible' else 'label_only' end else 'blocked' end,
    'LABEL',case when v_status<>'blocked' and coalesce((v_permissions->>'LABEL')::boolean,false)
      and v_has_allergens then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'NUTRITION',case when v_status<>'blocked' and coalesce((v_permissions->>'NUTRITION')::boolean,false)
      and v_has_nutrition then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'ALLERGENS',case when v_status<>'blocked' and coalesce((v_permissions->>'LABEL')::boolean,false)
      and v_has_allergens then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'PROCESS',case when v_status<>'blocked' and (v_base_allowed or v_topping_allowed) and v_has_process
      then case when v_base_allowed then 'eligible' else 'label_only' end else 'blocked' end,
    'SUMMARY',case when v_status<>'blocked' and (v_base_allowed or v_topping_allowed)
      then case when v_base_allowed then 'eligible' else 'label_only' end else 'blocked' end,
    'BATCH_RESCUE',case when v_base_allowed then 'eligible' else 'blocked' end,
    'MASTER_LABEL',case when v_status<>'blocked' and coalesce((v_permissions->>'LABEL')::boolean,false)
      and v_has_nutrition and v_has_allergens
      then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'RECIPE_VERSION',case when v_status<>'blocked' and (v_base_allowed or v_topping_allowed)
      then case when v_base_allowed then 'eligible' else 'label_only' end else 'blocked' end,
    'RESTORE',case when v_status<>'blocked' and (v_base_allowed or v_topping_allowed)
      then case when v_base_allowed then 'eligible' else 'label_only' end else 'blocked' end,
    'EXPORT',case when v_status<>'blocked' and coalesce((v_permissions->>'LABEL')::boolean,false)
      and (v_has_nutrition or v_has_allergens)
      then case when v_mapping is null then 'label_only' else 'eligible' end else 'blocked' end,
    'SAVE',case when v_status<>'blocked' and (v_base_allowed or v_topping_allowed)
      then case when v_base_allowed then 'eligible' else 'label_only' end else 'blocked' end
  );
  v_allowed := coalesce(v_module_eligibility->>v_module,'blocked') in ('eligible','label_only');
  if v_role_request='MAIN' then
    v_allowed:=v_allowed
      and coalesce(v_module_eligibility->>'MAIN','blocked')='eligible';
  end if;

  return jsonb_build_object(
    'schemaVersion',1,
    'resolverVersion','unified-product-behavior-v2',
    'entityKind',p_entity_kind,
    'productId',coalesce(v_product_id::text,p_entity_id),
    'productVersionId',coalesce(v_version_id::text,'mapper:'||p_entity_id),
    'factsFingerprint',v_facts_fingerprint,
    'catalogStatus',v_status,
    'provenance',v_source,
    'behaviorBindingId',v_binding_id,
    'behaviorBindingVersion',v_binding_version,
    'taxonomyVersion',v_taxonomy,
    'mapperIngredientId',v_mapping,
    'familyId',v_family,
    'subfamilyId',v_subfamily,
    'formId',v_form,
    'behaviorRole',v_behavior_role,
    'mainPolicyStatus',v_main_policy_status,
    'mainEligibility',v_main,
    'veganEligibility',v_vegan,
    'proteinBehavior',v_protein,
    'approvedLiquidDairyCarrier',v_liquid_dairy_carrier,
    'processBehavior',v_process,
    'sharedFacts',v_shared_facts,
    'privateOverlay',v_private_overlay,
    'profileApplicability',v_profile_applicability,
    'classificationReasonCodes',to_jsonb(coalesce(v_classification_reasons,'{}'::text[])),
    'context',p_context,
    'module',v_module,
    'state',case when v_allowed then 'eligible' else 'blocked' end,
    'moduleEligibility',v_module_eligibility,
    'mainPolicy',case when v_policy.id is null or v_policy_ambiguous then null else jsonb_build_object(
      'policyId',coalesce(nullif(v_policy.evidence->>'multiMainGroupKey',''),v_policy.policy_key),
      'policyVersion',v_policy.version::text,
      'familyId',v_policy.family_id,
      'subfamilyId',v_policy.subfamily_id,
      'formId',v_policy.form_id,
      'basis',v_policy.basis,
      'ecoFloorPercent',v_policy.eco_floor_percent,
      'optimalCeilingPercent',v_policy.optimal_ceiling_percent,
      'hardLimitPercent',v_policy.hard_limit_percent,
      'multiMainHardLimitPercent',nullif(v_policy.evidence->>'multiMainHardLimitPercent','')::numeric,
      'temperatureMinC',v_policy.temperature_min_c,
      'temperatureMaxC',v_policy.temperature_max_c,
      'mainEquivalentFactor',v_policy.equivalent_factor,
      'requiresLiquidDairyCarrier',v_policy.requires_liquid_dairy_carrier,
      'liquidDairyCarrierFloorPercent',v_policy.liquid_dairy_carrier_floor_percent,
      'approvedMixedFamilyIds',v_policy.approved_mixed_family_ids,
      'evidenceStatus',v_policy.policy_evidence_status
    ) end,
    'warnings',to_jsonb(coalesce(v_warnings,'{}'::text[])),
    'blockReasons',to_jsonb(array_remove(
      coalesce(v_blocks,'{}'::text[]) ||
      case when v_allowed then '{}'::text[] else array['context_not_approved'] end,
      null
    ))
  );
end $$;

revoke all on function public.resolve_product_behavior_v1(text,text,jsonb) from public,anon;
grant execute on function public.resolve_product_behavior_v1(text,text,jsonb) to authenticated,service_role;

-- Server-side terminal gate for Preview/Apply/Save/Production. The client
-- supplies only immutable snapshot references; this function re-resolves the
-- exact requested module against current policy/taxonomy/mapping authority.
create or replace function public.validate_recipe_behavior_v1(
  p_lines jsonb,
  p_context jsonb
) returns jsonb
language plpgsql security definer stable
set search_path=public,extensions
as $$
declare
  v_module text := nullif(p_context->>'module','');
  v_line jsonb;
  v_resolved jsonb;
  v_line_id text;
  v_reasons text[];
  v_rows jsonb := '[]'::jsonb;
  v_stale_ids jsonb := '[]'::jsonb;
  v_ready boolean := true;
  v_expected_price jsonb;
  v_expected_currency text;
  v_actual_price jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0
    or jsonb_array_length(p_lines)>250 then
    raise exception 'invalid recipe behavior line set';
  end if;
  if v_module is null or v_module not in (
    'SEARCH','BASE_RECIPE','MAIN','OPTIMAL','ECO','TOPPING','SUBSTITUTION','COST',
    'MONITOR','PRODUCTION','LABEL','NUTRITION','ALLERGENS','PROCESS','SUMMARY',
    'BATCH_RESCUE','MASTER_LABEL','RECIPE_VERSION','RESTORE','EXPORT','SAVE'
  ) then raise exception 'invalid recipe behavior module'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) x
    group by x->>'lineId' having count(*)>1
  ) then raise exception 'duplicate recipe behavior line id'; end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'lineId','');
    if v_line_id is null
      or v_line->>'entityKind' not in ('mapper','catalog_product_version')
      or nullif(v_line->>'entityId','') is null then
      raise exception 'invalid recipe behavior line';
    end if;

    v_reasons := '{}'::text[];
    if v_line->>'entityKind'='mapper'
      and v_line->>'entityId' is distinct from v_line->>'mapperIngredientId' then
      v_reasons := array_append(v_reasons,'mapper_entity_identity_mismatch');
    elsif v_line->>'entityKind'='catalog_product_version'
      and v_line->>'entityId' is distinct from v_line->>'productVersionId' then
      v_reasons := array_append(v_reasons,'catalog_version_identity_mismatch');
    end if;

    v_resolved := public.resolve_product_behavior_v1(
      v_line->>'entityKind',v_line->>'entityId',p_context
    );
    if coalesce(v_resolved->>'state','blocked')<>'eligible' then
      v_reasons := array_append(v_reasons,'requested_module_not_eligible');
    end if;
    if coalesce(v_resolved->'reasons','[]'::jsonb) ? 'classification_pending'
      or coalesce(v_resolved->'blockReasons','[]'::jsonb) ? 'classification_pending' then
      v_reasons := array_append(v_reasons,'classification_pending');
    end if;
    if coalesce(v_resolved->'reasons','[]'::jsonb) ? 'classification_failed'
      or coalesce(v_resolved->'blockReasons','[]'::jsonb) ? 'classification_failed' then
      v_reasons := array_append(v_reasons,'classification_failed');
    end if;
    if coalesce(v_resolved->>'productId','') is distinct from coalesce(v_line->>'productId','') then
      v_reasons := array_append(v_reasons,'product_identity_stale');
    end if;
    if coalesce(v_resolved->>'productVersionId','') is distinct from coalesce(v_line->>'productVersionId','') then
      v_reasons := array_append(v_reasons,'product_version_stale');
    end if;
    if coalesce(v_resolved->>'behaviorBindingId','') is distinct from coalesce(v_line->>'behaviorBindingId','') then
      v_reasons := array_append(v_reasons,'behavior_binding_stale');
    end if;
    if coalesce(v_resolved->>'behaviorBindingVersion','') is distinct from coalesce(v_line->>'behaviorBindingVersion','') then
      v_reasons := array_append(v_reasons,'behavior_binding_version_stale');
    end if;
    if coalesce(v_resolved->>'factsFingerprint','') is distinct from coalesce(v_line->>'factsFingerprint','') then
      v_reasons := array_append(v_reasons,'facts_fingerprint_stale');
    end if;
    if coalesce(v_resolved->'sharedFacts','null'::jsonb)
      is distinct from coalesce(v_line->'sharedFacts','null'::jsonb) then
      v_reasons := array_append(v_reasons,'shared_facts_stale');
    end if;
    if coalesce(v_resolved->>'taxonomyVersion','') is distinct from coalesce(v_line->>'taxonomyVersion','') then
      v_reasons := array_append(v_reasons,'taxonomy_version_stale');
    end if;
    if coalesce(v_resolved->>'mapperIngredientId','') is distinct from coalesce(v_line->>'mapperIngredientId','') then
      v_reasons := array_append(v_reasons,'mapper_mapping_stale');
    end if;
    if coalesce(v_resolved->'mainPolicy'->>'policyId','')
      is distinct from coalesce(v_line->>'mainPolicyId','')
      or coalesce(v_resolved->'mainPolicy'->>'policyVersion','')
      is distinct from coalesce(v_line->>'mainPolicyVersion','') then
      v_reasons := array_append(v_reasons,'main_policy_stale');
    end if;
    if v_line->>'entityKind'='catalog_product_version' then
      v_expected_price:=case
        when jsonb_typeof(v_resolved#>'{privateOverlay,privatePricePerKg}')='number'
          then v_resolved#>'{privateOverlay,privatePricePerKg}'
        when jsonb_typeof(v_resolved#>'{sharedFacts,referencePrice,pricePerKg}')='number'
          then v_resolved#>'{sharedFacts,referencePrice,pricePerKg}'
        else null
      end;
      v_expected_currency:=case
        when jsonb_typeof(v_resolved#>'{privateOverlay,privatePricePerKg}')='number'
          then nullif(v_resolved#>>'{privateOverlay,privatePriceCurrency}','')
        when jsonb_typeof(v_resolved#>'{sharedFacts,referencePrice,pricePerKg}')='number'
          then nullif(v_resolved#>>'{sharedFacts,referencePrice,currency}','')
        else null
      end;
      v_actual_price:=v_line->'costPerKg';
      if (v_expected_price is null or jsonb_typeof(v_expected_price)='null') then
        if v_actual_price is not null and jsonb_typeof(v_actual_price)<>'null' then
          v_reasons:=array_append(v_reasons,'private_price_stale');
        end if;
      elsif jsonb_typeof(v_actual_price)<>'number'
        or abs((v_expected_price#>>'{}')::numeric-(v_actual_price#>>'{}')::numeric)>0.0000001
        or v_expected_currency is distinct from nullif(v_line->>'costCurrency','') then
        v_reasons:=array_append(v_reasons,'private_price_stale');
      end if;
    end if;

    v_reasons := array(select distinct unnest(v_reasons) order by 1);
    if cardinality(v_reasons)>0 then
      v_ready := false;
      v_stale_ids := v_stale_ids||jsonb_build_array(v_line_id);
    end if;
    v_rows := v_rows||jsonb_build_array(jsonb_build_object(
      'lineId',v_line_id,
      'state',case when cardinality(v_reasons)=0 then 'ready' else 'stale' end,
      'reasons',to_jsonb(v_reasons)
    ));
  end loop;

  return jsonb_build_object(
    'schemaVersion',1,
    'ready',v_ready,
    'module',v_module,
    'lines',v_rows,
    'staleLineIds',v_stale_ids
  );
end $$;

revoke all on function public.validate_recipe_behavior_v1(jsonb,jsonb) from public,anon;
grant execute on function public.validate_recipe_behavior_v1(jsonb,jsonb) to authenticated,service_role;

-- Transactional terminal enforcement. UI checks improve feedback, but writes to
-- immutable recipe versions and Production runs must remain fail-closed for a
-- direct authenticated API caller as well.
create or replace function public.assert_recipe_behavior_authority_v1(
  p_recipe_input jsonb,
  p_product_composition jsonb,
  p_module text
) returns void
language plpgsql security definer stable
set search_path=public,extensions
as $$
declare
  v_snapshots jsonb:=coalesce(p_product_composition->'behaviorSnapshots','{}'::jsonb);
  v_item jsonb;
  v_snapshot jsonb;
  v_line_id text;
  v_scope text;
  v_role text;
  v_line jsonb;
  v_result jsonb;
  v_technical jsonb;
  v_nutrition jsonb;
  v_allergens jsonb;
  v_expected jsonb;
  v_actual jsonb;
  v_pair record;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_recipe_input)<>'object' then raise exception 'invalid recipe authority payload'; end if;
  if jsonb_typeof(v_snapshots)<>'object' then raise exception 'invalid recipe behavior snapshots'; end if;

  for v_item in
    select value||jsonb_build_object('_scope','BASE_FORMULATION')
      from jsonb_array_elements(coalesce(p_recipe_input->'items','[]'::jsonb))
    union all
    select value||jsonb_build_object('_scope','POST_PROCESS_ADDON')
      from jsonb_array_elements(coalesce(p_product_composition->'toppings','[]'::jsonb))
  loop
    v_line_id:=nullif(v_item->>'id','');
    if v_line_id is null then raise exception 'invalid recipe line identity'; end if;
    v_scope:=v_item->>'_scope';
    -- Every persisted recipe/Production line is product-managed at the
    -- terminal database boundary. A direct API caller must not evade the
    -- resolver by stripping canonical/provenance marker fields. Historical
    -- rows without snapshots remain readable, but no new version/run may be
    -- written until every line is reconstructed and RESOLVED.
    v_snapshot:=v_snapshots->v_line_id;
    if jsonb_typeof(v_snapshot)<>'object' or v_snapshot->>'resolutionState'<>'RESOLVED' then
      raise exception 'recipe product behavior snapshot missing or unresolved for %',v_line_id;
    end if;
    if v_snapshot->>'processScope' is distinct from v_scope then
      raise exception 'recipe product behavior scope mismatch for %',v_line_id;
    end if;

    -- A valid snapshot reference beside caller-forged recipe facts is not
    -- authority. Match every persisted Engine field to the exact frozen
    -- shared projection before a recipe/version/Production write can commit.
    if v_scope='BASE_FORMULATION'
      or coalesce(v_item#>>'{ingredient,kind}','')<>'catalog_label_topping' then
      v_technical:=v_snapshot#>'{sharedFacts,technicalComposition}';
      if jsonb_typeof(v_technical)<>'object' or v_technical='{}'::jsonb then
        raise exception 'recipe technical authority is missing for %',v_line_id;
      end if;
      for v_pair in
        select * from (values
          ('water_percent','water',false),('solids_percent','totalSolids',false),
          ('fat_percent','fat',false),('saturated_fat_percent','saturatedFat',false),
          ('protein_percent','protein',false),('carbohydrate_percent','carbohydrate',false),
          ('sugar_percent','sugars',false),('sucrose_percent','sucrose',false),
          ('glucose_percent','glucose',false),('dextrose_percent','dextrose',false),
          ('fructose_percent','fructose',false),('lactose_percent','lactose',false),
          ('polyol_percent','polyols',false),('fiber_percent','fibre',false),
          ('salt_percent','salt',false),('alcohol_percent','alcohol',false),
          ('kcal_per_100g','energyKcal',false),('pod_value','podValue',true),
          ('pac_value','pacValue',true),('de_value','deValue',true)
        ) as fields(ingredient_key,fact_key,is_top_level)
      loop
        v_expected:=v_technical->v_pair.fact_key;
        v_actual:=case when v_pair.is_top_level
          then v_item->'ingredient'->v_pair.ingredient_key
          else v_item#>'{ingredient,composition}'->v_pair.ingredient_key end;
        if v_expected is null or jsonb_typeof(v_expected)='null' then
          if v_actual is not null and jsonb_typeof(v_actual)<>'null' then
            raise exception 'recipe technical fact % is stale for %',v_pair.ingredient_key,v_line_id;
          end if;
        elsif jsonb_typeof(v_expected)<>'number' or jsonb_typeof(v_actual)<>'number'
          or abs((v_expected#>>'{}')::numeric-(v_actual#>>'{}')::numeric)>0.0000001 then
          raise exception 'recipe technical fact % is stale for %',v_pair.ingredient_key,v_line_id;
        end if;
      end loop;
    else
      v_nutrition:=v_snapshot#>'{sharedFacts,nutritionPer100g}';
      v_allergens:=v_snapshot#>'{sharedFacts,allergens}';
      if jsonb_typeof(v_nutrition)<>'object' or jsonb_typeof(v_allergens)<>'object' then
        raise exception 'recipe label authority is missing for %',v_line_id;
      end if;
      for v_pair in
        select * from (values
          ('energyKcal'),('fat'),('saturatedFat'),('carbohydrate'),
          ('sugars'),('protein'),('salt'),('fibre')
        ) as fields(fact_key)
      loop
        v_expected:=v_nutrition->v_pair.fact_key;
        v_actual:=v_item#>'{ingredient,label_nutrition_per_100g}'->v_pair.fact_key;
        if v_expected is null or jsonb_typeof(v_expected)='null' then
          if v_actual is not null and jsonb_typeof(v_actual)<>'null' then
            raise exception 'recipe label fact % is stale for %',v_pair.fact_key,v_line_id;
          end if;
        elsif jsonb_typeof(v_expected)<>'number' or jsonb_typeof(v_actual)<>'number'
          or abs((v_expected#>>'{}')::numeric-(v_actual#>>'{}')::numeric)>0.0000001 then
          raise exception 'recipe label fact % is stale for %',v_pair.fact_key,v_line_id;
        end if;
      end loop;
      if coalesce(v_allergens->>'ingredientsText','') is distinct from
          coalesce(v_item#>>'{ingredient,ingredients_text}','')
        or coalesce(v_allergens->>'allergensText','') is distinct from
          coalesce(v_item#>>'{ingredient,allergens_text}','') then
        raise exception 'recipe label evidence is stale for %',v_line_id;
      end if;
    end if;
    v_role:=case when v_scope='BASE_FORMULATION' and v_item->>'lock_type'='main'
      then 'MAIN' else 'STANDARD' end;
    v_line:=jsonb_build_object(
      'lineId',v_line_id,
      'entityKind',case when v_snapshot->>'source'='mapper' then 'mapper' else 'catalog_product_version' end,
      'entityId',case when v_snapshot->>'source'='mapper'
        then v_snapshot->>'mapperIngredientId' else v_snapshot->>'productVersionId' end,
      'productId',v_snapshot->>'productId',
      'productVersionId',v_snapshot->>'productVersionId',
      'behaviorBindingId',v_snapshot->>'behaviorBindingId',
      'behaviorBindingVersion',v_snapshot->>'behaviorBindingVersion',
      'factsFingerprint',v_snapshot->>'factsFingerprint',
      'taxonomyVersion',v_snapshot->>'taxonomyVersion',
      'mapperIngredientId',v_snapshot->>'mapperIngredientId',
      'mainPolicyId',v_snapshot->>'mainPolicyId',
      'mainPolicyVersion',v_snapshot->>'mainPolicyVersion',
      'sharedFacts',v_snapshot->'sharedFacts',
      'costPerKg',case when v_snapshot->>'source'='mapper' then null
        else v_item#>'{ingredient,cost_per_kg}' end,
      'costCurrency',case when v_snapshot->>'source'='mapper' then null
        else v_item#>>'{ingredient,cost_currency}' end
    );
    v_result:=public.validate_recipe_behavior_v1(jsonb_build_array(v_line),jsonb_build_object(
      'module',p_module,
      'productProfile',p_recipe_input->>'category',
      'temperatureC',p_recipe_input->'target_temperature_c',
      'mode',coalesce(p_recipe_input#>>'{goals,formulation_strategy}',p_recipe_input->>'mode'),
      'processScope',v_scope,
      'requestedRole',v_role
    ));
    if not coalesce((v_result->>'ready')::boolean,false) then
      raise exception 'recipe product behavior is stale or blocked for %',v_line_id;
    end if;
  end loop;
end $$;

create or replace function public.recipe_behavior_write_guard_v1()
returns trigger
language plpgsql security definer
set search_path=public,extensions
as $$
declare v_recipe public.recipe_versions%rowtype;
begin
  if tg_table_name='production_runs' then
    select * into v_recipe from public.recipe_versions
      where id=new.recipe_version_id and owner_user_id=auth.uid();
    if not found then raise exception 'production recipe version is unavailable'; end if;
    perform public.assert_recipe_behavior_authority_v1(
      v_recipe.recipe_input,v_recipe.product_composition,'PRODUCTION'
    );
  elsif tg_table_name='recipe_versions' then
    perform public.assert_recipe_behavior_authority_v1(
      new.recipe_input,new.product_composition,'RECIPE_VERSION'
    );
  else
    perform public.assert_recipe_behavior_authority_v1(
      new.recipe_input,new.product_composition,'SAVE'
    );
  end if;
  return new;
end $$;

drop trigger if exists saved_recipe_behavior_write_guard_v1 on public.saved_recipes;
create trigger saved_recipe_behavior_write_guard_v1 before insert or update of recipe_input,product_composition
on public.saved_recipes for each row execute function public.recipe_behavior_write_guard_v1();
drop trigger if exists recipe_version_behavior_write_guard_v1 on public.recipe_versions;
create trigger recipe_version_behavior_write_guard_v1 before insert
on public.recipe_versions for each row execute function public.recipe_behavior_write_guard_v1();
drop trigger if exists production_run_behavior_write_guard_v1 on public.production_runs;
create trigger production_run_behavior_write_guard_v1 before insert
on public.production_runs for each row execute function public.recipe_behavior_write_guard_v1();

revoke all on function public.assert_recipe_behavior_authority_v1(jsonb,jsonb,text)
  from public,anon,authenticated;
revoke all on function public.recipe_behavior_write_guard_v1()
  from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Automatic invalidation inputs. Statement-level authority changes enqueue all
-- affected entities; entity changes enqueue only that immutable version.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_all_product_behavior_authority_change_v1()
returns trigger
language plpgsql security definer
set search_path=public,extensions
as $$
begin
  perform public.enqueue_all_product_behavior_reclassification_v1(tg_table_name||'_changed');
  return null;
end $$;

drop trigger if exists product_behavior_policy_reclassify_v1 on public.product_behavior_policy_versions;
create trigger product_behavior_policy_reclassify_v1
after insert or update or delete on public.product_behavior_policy_versions
for each statement execute function public.enqueue_all_product_behavior_authority_change_v1();

drop trigger if exists product_taxonomy_node_reclassify_v1 on public.product_taxonomy_nodes;
create trigger product_taxonomy_node_reclassify_v1
after insert or update or delete on public.product_taxonomy_nodes
for each statement execute function public.enqueue_all_product_behavior_authority_change_v1();

drop trigger if exists product_taxonomy_alias_reclassify_v1 on public.product_taxonomy_aliases;
create trigger product_taxonomy_alias_reclassify_v1
after insert or update or delete on public.product_taxonomy_aliases
for each statement execute function public.enqueue_all_product_behavior_authority_change_v1();

create or replace function public.enqueue_catalog_product_behavior_entity_change_v1()
returns trigger
language plpgsql security definer
set search_path=public,extensions
as $$
declare v_version uuid;
begin
  if tg_table_name='product_versions' then
    v_version := case when tg_op='DELETE' then old.id else new.id end;
  elsif tg_table_name='product_behavior_bindings' then
    v_version := case when tg_op='DELETE' then old.product_version_id else new.product_version_id end;
  else
    v_version := case when tg_op='DELETE' then old.current_version_id else new.current_version_id end;
  end if;
  if v_version is not null then
    perform public.enqueue_product_behavior_reclassification_v1(
      'catalog_product_version',v_version::text,tg_table_name||'_changed'
    );
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists product_version_reclassify_v2 on public.product_versions;
create trigger product_version_reclassify_v2
after insert on public.product_versions
for each row execute function public.enqueue_catalog_product_behavior_entity_change_v1();

drop trigger if exists canonical_product_mapping_reclassify_v2 on public.product_behavior_bindings;
create trigger canonical_product_mapping_reclassify_v2
after update of mapper_ingredient_id on public.product_behavior_bindings
for each row execute function public.enqueue_catalog_product_behavior_entity_change_v1();

drop trigger if exists product_reclassify_v2 on public.products;
create trigger product_reclassify_v2
after update of canonical_verification_status,canonical_family,current_version_id on public.products
for each row execute function public.enqueue_catalog_product_behavior_entity_change_v1();

-- Mapper and process corrections do not mutate formulas here. They invalidate
-- every affected immutable binding immediately, so resolver/terminal validation
-- fail closed until the server worker publishes a new binding.
create or replace function public.enqueue_mapper_product_behavior_authority_change_v1()
returns trigger
language plpgsql security definer
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
      and p.current_version_id is not null and b.mapper_ingredient_id=v_ingredient_id
  loop
    perform public.enqueue_product_behavior_reclassification_v1(
      'catalog_product_version',v_version_id::text,tg_table_name||'_changed'
    );
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists mapper_basement_behavior_reclassify_v2 on public.mapper_basement;
create trigger mapper_basement_behavior_reclassify_v2
after insert or update or delete on public.mapper_basement
for each row execute function public.enqueue_mapper_product_behavior_authority_change_v1();

drop trigger if exists mapper_process_behavior_reclassify_v2 on public.mapper_process_metadata;
create trigger mapper_process_behavior_reclassify_v2
after insert or update or delete on public.mapper_process_metadata
for each row execute function public.enqueue_mapper_product_behavior_authority_change_v1();

revoke all on function public.enqueue_all_product_behavior_authority_change_v1() from public,anon,authenticated;
revoke all on function public.enqueue_catalog_product_behavior_entity_change_v1() from public,anon,authenticated;
revoke all on function public.enqueue_mapper_product_behavior_authority_change_v1() from public,anon,authenticated;

-- Supabase staging supports pg_cron. The bounded worker is idempotent and uses
-- SKIP LOCKED; failures stay queryable/retryable instead of publishing partial
-- behavior. This is the runtime continuation for policy/Mapper/process changes.
create extension if not exists pg_cron;
do $$
begin
  if not exists(select 1 from cron.job where jobname='upi-product-behavior-reclassification-v1') then
    perform cron.schedule(
      'upi-product-behavior-reclassification-v1',
      '* * * * *',
      'select public.process_product_behavior_reclassification_queue_v1(250);'
    );
  end if;
end $$;

-- Initial deterministic backfill. Failed jobs preserve the old current binding
-- and remain visible with exact failure state for a later bounded retry.
select public.enqueue_all_product_behavior_reclassification_v1('product_behavior_v2_initial_backfill');
do $$
declare v_result jsonb;
begin
  loop
    exit when not exists (
      select 1 from public.product_behavior_reclassification_queue
      where status in ('pending','failed') and attempt_count<max_attempts
    );
    v_result := public.process_product_behavior_reclassification_queue_v1(250);
    exit when coalesce((v_result->>'processed')::integer,0)=0;
  end loop;

  if (
    select count(*) from public.mapper_product_behavior_bindings b
    join public.mapper_basement m on m.ingredient_id=b.mapper_ingredient_id and m.is_active
    where b.is_current and b.classifier_version like 'product-behavior-layered-v2-%'
  ) <> (select count(*) from public.mapper_basement where is_active) then
    raise exception 'Mapper product behavior v2 backfill is incomplete';
  end if;

  if exists (
    select 1 from public.product_behavior_reclassification_queue
    where entity_kind='mapper' and status<>'succeeded'
  ) then
    raise exception 'Mapper product behavior v2 backfill contains failed jobs';
  end if;

  if (
    select count(*)
    from public.products p
    join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id
    join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id
      and b.product_id=p.id and b.product_version_id=v.id and b.is_current
    where p.product_kind='mapper_reference' and p.is_active
      and p.merged_into_product_id is null
      and p.normalized_identity='mapper:'||(v.facts->>'mapperIngredientId')
      and b.mapper_ingredient_id=v.facts->>'mapperIngredientId'
      and b.classifier_version like 'product-behavior-layered-v2-%'
  ) <> (select count(*) from public.mapper_basement where is_active) then
    raise exception 'canonical Mapper reference behavior backfill is incomplete';
  end if;

  if exists (
    select 1 from public.products p
    left join public.product_versions v
      on v.id=p.current_version_id and v.product_id=p.id
    left join public.product_behavior_bindings b
      on b.id=p.current_behavior_binding_id and b.product_id=p.id
      and b.product_version_id=p.current_version_id and b.is_current
    where p.is_active and p.merged_into_product_id is null
      and (v.id is null or b.id is null)
  ) then
    raise exception 'canonical product current version/behavior pointer invariant failed';
  end if;
end $$;

-- Audit views expose both axes and exact reasons without opening the underlying
-- system tables to customer writes.
-- 10200 published narrower signatures under these names. PostgreSQL cannot
-- rename/reorder view columns through CREATE OR REPLACE, so replace the two
-- read-only audit projections explicitly after the canonical backfill.
drop view if exists public.mapper_product_behavior_audit_v1;
drop view if exists public.catalog_product_behavior_audit_v1;

create or replace view public.mapper_product_behavior_audit_v1 as
select
  m.ingredient_id,m.ingredient_name_display,m.ingredient_category,m.ingredient_subcategory,
  m.approved_for_base,m.approved_for_engines,
  coalesce(b.behavior_role,'UNKNOWN_REQUIRES_EVIDENCE') as behavior_role,
  coalesce(b.main_policy_status,'UNKNOWN_REQUIRES_EVIDENCE') as main_policy_status,
  coalesce(b.main_eligibility,'UNKNOWN') as main_eligibility,
  b.family_id,b.subfamily_id,b.form_id,b.form_hint,
  b.profile_applicability,b.profile_permissions,b.process_behavior,
  b.vegan_eligibility,b.protein_behavior,b.classification_reason_codes,
  b.classifier_version,b.classified_at,
  case when b.id is null then 'UNKNOWN_REQUIRES_EVIDENCE' else 'BOUND' end as binding_status
from public.mapper_basement m
left join public.mapper_product_behavior_bindings b
  on b.mapper_ingredient_id=m.ingredient_id and b.is_current
where m.is_active;

create or replace view public.catalog_product_behavior_audit_v1 as
select
  p.id as catalog_product_id,p.current_version_id,p.canonical_verification_status as status,p.canonical_family,
  b.mapper_ingredient_id,b.behavior_role,b.main_policy_status,b.main_eligibility,
  b.family_id,b.subfamily_id,b.form_id,b.profile_applicability,b.profile_permissions,
  b.process_behavior,b.warnings,b.block_reasons,b.classification_reason_codes,
  b.classifier_version,b.classified_at,
  case when b.id is null then 'UNKNOWN_REQUIRES_EVIDENCE' else 'BOUND' end as binding_status
from public.products p
left join public.product_behavior_bindings b
  on b.product_id=p.id and b.is_current
where p.is_active and p.merged_into_product_id is null;

revoke all on public.mapper_product_behavior_audit_v1,public.catalog_product_behavior_audit_v1
  from public,anon,authenticated;
grant select on public.mapper_product_behavior_audit_v1,public.catalog_product_behavior_audit_v1
  to service_role;
