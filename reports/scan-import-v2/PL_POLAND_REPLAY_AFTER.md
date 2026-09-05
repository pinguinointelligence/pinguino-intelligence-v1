# PL_Poland label corpus replay (G5)

Rows with a nutrition declaration: 170; ready: 100.
Complete macros: 87/129 (67.4%).
Complete macros + ingredients: 87/94 (92.6%).
Ordinary food, complete label: 87/94 (92.6%).

| category | rows | ready | complete | complete ready |
|---|---|---|---|---|
| Bakery & sweets | 28 | 19 | 24 | 17 |
| Chocolate & cocoa | 10 | 3 | 4 | 1 |
| Coconut | 3 | 2 | 3 | 2 |
| Coffee, tea & spices | 9 | 2 | 7 | 2 |
| Dairy | 63 | 49 | 53 | 45 |
| Fruit | 11 | 2 | 7 | 2 |
| Nuts & pastes | 17 | 5 | 11 | 5 |
| Professional gelato products | 3 | 0 | 1 | 0 |
| Protein | 13 | 7 | 11 | 6 |
| Sugars & sweeteners | 2 | 1 | 1 | 1 |
| Vanilla | 1 | 1 | 1 | 1 |
| Vegan | 10 | 9 | 6 | 5 |

## Blockers among not-ready rows
- INGREDIENTS_EVIDENCE_REQUIRED: 53
- PRODUCT_SEMANTICS_UNRESOLVED: 23
- UNRESOLVED_SWEETENING_FREEZING_PATH: 21
- product_semantics_unresolved: 20
- NUTRITION_FACT_REQUIRED:salt_percent: 9
- MISSING_SALT_PERCENT: 7
- NUTRITION_FACT_REQUIRED:total_sugars_percent: 7
- MISSING_TOTAL_SUGARS_PERCENT: 5
- MISSING_FAT_PERCENT: 3
- NUTRITION_FACT_REQUIRED:fat_percent: 3
- SELF_CONTRADICTORY_DECLARATION: 2
- MISSING_CARBOHYDRATE_PERCENT: 2
- MISSING_PROTEIN_PERCENT: 2
- MISSING_TOTAL_SOLIDS_PERCENT: 2
- MISSING_WATER_PERCENT: 2
- NUTRITION_FACT_REQUIRED:carbohydrate_percent: 2
- NUTRITION_FACT_REQUIRED:protein_percent: 2
- product_role_unresolved: 2
- NUTRITION_FACT_REQUIRED:kcal_per_100g: 1

## Not ready despite a complete label with ingredients
- PL-AUC-AUCHAN-DARK-CHOC90-100G Auchan Czekolada gorzka 90% [Chocolate & cocoa] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=sugar_spectrum model=FORM_UNKNOWN
- PL-LIDL-00443 Fin Carré Czekolada mleczna [Chocolate & cocoa] family=chocolate role=BASE_ONLY blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=sugar_spectrum model=FORM_UNKNOWN
- PL-BIE-00324 Kamis Kamis Grill Klasyczny [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=sugar_spectrum model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00343 Kamis Kamis Grill Pikantny [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=PRODUCT_SEMANTICS_UNRESOLVED,product_semantics_unresolved missing= sweetness=sugar_spectrum model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00330 Kamis Kamis Grill przyprawa do karkówki [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=PRODUCT_SEMANTICS_UNRESOLVED,SELF_CONTRADICTORY_DECLARATION,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing= sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00352 Kamis Kamis Mieszanka przyprawowa przyprawa do dań z ziemniaków [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing= sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN/FORM_UNKNOWN
- PL-BIE-00351 Kamis Kamis Mieszanka przyprawowa przyprawa do kurczaka po staropolsku [Coffee, tea & spices] family=unknown role=NEITHER_REVIEW blockers=PRODUCT_SEMANTICS_UNRESOLVED,UNRESOLVED_SWEETENING_FREEZING_PATH,product_semantics_unresolved missing= sweetness=unresolved model=ARCHETYPE_UNKNOWN/FAMILY_UNKNOWN
