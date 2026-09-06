# PL_Poland label corpus replay (BEFORE)

Rows with a nutrition declaration: 170; ready: 45.
Complete macros: 37/129 (28.7%).
Complete macros + ingredients: 37/94 (39.4%).
Ordinary food, complete label: 37/94 (39.4%).

| category | rows | ready | complete | complete ready |
|---|---|---|---|---|
| Bakery & sweets | 28 | 10 | 24 | 9 |
| Chocolate & cocoa | 10 | 0 | 4 | 0 |
| Coconut | 3 | 0 | 3 | 0 |
| Coffee, tea & spices | 9 | 2 | 7 | 1 |
| Dairy | 63 | 22 | 53 | 20 |
| Fruit | 11 | 0 | 7 | 0 |
| Nuts & pastes | 17 | 4 | 11 | 4 |
| Professional gelato products | 3 | 0 | 1 | 0 |
| Protein | 13 | 2 | 11 | 1 |
| Sugars & sweeteners | 2 | 0 | 1 | 0 |
| Vanilla | 1 | 0 | 1 | 0 |
| Vegan | 10 | 5 | 6 | 2 |

## Blockers among not-ready rows
- UNRESOLVED_SWEETENING_FREEZING_PATH: 73
- PRODUCT_SEMANTICS_UNRESOLVED: 67
- INGREDIENTS_EVIDENCE_REQUIRED: 53
- product_semantics_unresolved: 39
- MISSING_TOTAL_SOLIDS_PERCENT: 26
- MISSING_WATER_PERCENT: 26
- NUTRITION_FACT_REQUIRED:salt_percent: 8
- NUTRITION_FACT_REQUIRED:total_sugars_percent: 7
- MISSING_SALT_PERCENT: 6
- MISSING_TOTAL_SUGARS_PERCENT: 5
- MISSING_FAT_PERCENT: 4
- NUTRITION_FACT_REQUIRED:fat_percent: 4
- MISSING_CARBOHYDRATE_PERCENT: 3
- MISSING_PROTEIN_PERCENT: 3
- NUTRITION_FACT_REQUIRED:carbohydrate_percent: 3
- NUTRITION_FACT_REQUIRED:kcal_per_100g: 3
- NUTRITION_FACT_REQUIRED:protein_percent: 3
- family_and_form_evidence_missing: 3
- SELF_CONTRADICTORY_DECLARATION: 2
- product_role_unresolved: 2

## Not ready despite a complete label with ingredients
- PL-BIE-00158 Baitz Caramel & Peanuts Waffle Baitz [Bakery & sweets] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN
- PL-BIE-00161 Baitz Rogalik z nadzieniem kakaowym Baitz Cocoa Rogal [Bakery & sweets] family=chocolate role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00159 Baitz Strawberry & Crisps Waffle Baitz [Bakery & sweets] family=unknown role=NEITHER_REVIEW blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing= sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN
- PL-AUC-AUCHAN-PISTACHIO-DONUT-80G Cukiernia Auchan Pączek z nadzieniem pistacjowym [Bakery & sweets] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00287 Lubella Lubella Owsianka z malinami i daktylami [Bakery & sweets] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00224 Milka Milka Choc&Choc [Bakery & sweets] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-AUC-NESTLE-NESQUIK-SNACK-26G Nestlé Nesquik snack kakao [Bakery & sweets] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved model=FORM_UNKNOWN
- PL-BIE-00193 Wedel E. Wedel Ptasie Mleczko Waniliowe w czekoladzie deserowej 340 g [Bakery & sweets] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved model=FORM_UNKNOWN
- PL-AUC-AUCHAN-DARK-CHOC90-100G Auchan Czekolada gorzka 90% [Chocolate & cocoa] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved model=FORM_UNKNOWN
- PL-BIE-00430 Bakello Bakello Kakao extra ciemne [Chocolate & cocoa] family=cocoa_butter role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=stored model=FORM_UNKNOWN
- PL-LIDL-00443 Fin Carré Czekolada mleczna [Chocolate & cocoa] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=stored model=FORM_UNKNOWN
- PL-FRI-AROYD-COCONUT-MILK-150ML AROY-D Mleczko kokosowe 19% tłuszczu, ekstrakt kokosowy 60% [Coconut] family=coconut_fat role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00092 goBIO Olej kokosowy extra virgin goBIO [Coconut] family=coconut_fat role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=trivially_zero
- PL-BIE-GOVEGE-OAT-CINNAMON-1L Go Vege Napój owsiany barista z cynamonem [Coffee, tea & spices] family=plant_beverage role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00324 Kamis Kamis Grill Klasyczny [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00343 Kamis Kamis Grill Pikantny [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00330 Kamis Kamis Grill przyprawa do karkówki [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,SELF_CONTRADICTORY_DECLARATION,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00352 Kamis Kamis Mieszanka przyprawowa przyprawa do dań z ziemniaków [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00351 Kamis Kamis Mieszanka przyprawowa przyprawa do kurczaka po staropolsku [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN
- PL-BIE-00077 Delikate Serek w plastrach kanapkowy Delikate [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00078 Delikate Serek w plastrach kanapkowy Delikate [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00027 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00028 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00029 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00030 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00031 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00033 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00034 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00036 Fruvita Jogurt Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00025 Fruvita Jogurt pitny Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00041 Fruvita Skyr pitny Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00042 Fruvita Skyr pitny Fruvita [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00056 Fruvita Pure Jogurt Fruvita Pure [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00051 Fruvita Pure Jogurt pitny Fruvita Pure z płatkami owsianymi i jaglanymi [Dairy] family=dairy_liquid role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00015 Mleczna Dolina Mleko UHT Mleczna Dolina 0,5% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-00009 Mleczna Dolina Mleko UHT Mleczna Dolina 1,5% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-00010 Mleczna Dolina Mleko UHT Mleczna Dolina 3,2% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-00008 Mleczna Dolina Mleko UHT bez laktozy Mleczna Dolina 1,5% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-00013 Mleczna Dolina Mleko UHT bez laktozy Mleczna Dolina 3,2% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-00007 Mleczna Dolina Mleko świeże Mleczna Dolina 2% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-00006 Mleczna Dolina Mleko świeże Mleczna Dolina 3,2% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-BIE-MLEKOVITA-MILK32-1L Mlekovita Mleko spożywcze Polskie 3,2% [Dairy] family=dairy_liquid role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-FRI-MLEKOVITA-CURD-BAR-VANILLA-40G Mlekovita Wypasione Batonik twarogowy waniliowy w czekoladzie mlecznej [Dairy] family=confectionery role=TOPPING_ONLY blockers=family_and_form_evidence_missing missing= sweetness=unresolved
- PL-AUC-MLEKOVITA-CHOC-MILK-1L Mlekovita Wypasione mleko czekoladowe [Dairy] family=chocolate role=BASE_ONLY blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing=water_percent,total_solids_percent sweetness=unresolved model=FORM_UNKNOWN
- PL-BIE-00132 BakaD'Or Rodzynki hetmańskie bezpestkowe Thompson BakaD'Or [Fruit] family=fruit role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=stored model=FORM_UNKNOWN
- PL-BIE-00133 BakaD'Or Śliwki suszone BakaD'Or [Fruit] family=fruit role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved model=FORM_UNKNOWN
- PL-BIE-00143 BakaD'Or Mieszanka orzechowa BakaD'Or [Nuts & pastes] family=inclusion role=TOPPING_ONLY blockers=family_and_form_evidence_missing missing=water_percent,total_solids_percent sweetness=unresolved
- PL-FRI-ESSENSEY-WPC-VANILLA-300G ESSENSEY Whey Protein Premium smak waniliowy [Protein] family=dairy_protein role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00149 GO Active Granola wysokobiałkowa GO Active [Protein] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved model=FORM_UNKNOWN
- PL-BIE-00144 GO Active Musli GO Active z orzechami i kawą [Protein] family=coffee role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00145 GO Active Musli wysokobiałkowe proteinowe GO Active [Protein] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved model=FORM_UNKNOWN
- PL-BIE-00183 Go Active Go Active Suplement diety WPC Koncentrat białka serwatkowego smak waniliowy 700 g [Protein] family=dairy_protein role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-ZLOTA-PASIEKA-LINDEN-400G Złota Pasieka Miód lipowy z europejskich pasiek [Sugars & sweeteners] family=other_sugar role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED missing= sweetness=stored
- PL-FRI-DR-OETKER-VANILLIN-SUGAR-16G Dr. Oetker Cukier wanilinowy (z naturalnym ekstraktem wanilii) [Vanilla] family=unknown role=NEITHER_REVIEW blockers=MISSING_TOTAL_SOLIDS_PERCENT,MISSING_WATER_PERCENT,PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing=water_percent,total_solids_percent sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00172 Go Vege Go Vege Napój roślinny Migdał 1 l [Vegan] family=beverage role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00164 Go Vege Go Vege Smalec z fasoli z jabłkiem i cebulką 175 g [Vegan] family=beverage role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
- PL-BIE-00168 Go Vege go Vege Paprykarz warzywny z kaszą jaglaną 180 g [Vegan] family=beverage role=BASE_ONLY blockers=UNRESOLVED_SWEETENING_FREEZING_PATH missing= sweetness=unresolved
