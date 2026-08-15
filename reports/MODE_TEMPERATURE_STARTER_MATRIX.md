# MODE + TEMPERATURE STARTER MATRIX

Generated deterministically from `buildCanonicalNewRecipeStarter` at 1000 g. Prices are effective EUR/kg values under the current local reference data; `UNKNOWN` remains unknown and is never treated as zero. ECO and OPTIMAL intentionally share the approved vector because no validated cheaper alternative is currently registered.

## Complete 32-key summary

| Key | Template | Vector per 1000 g | POD | PAC | NPAC | Ice % | Water % | Solids % | Fat % | Protein % | Liquid dairy g | Cost/kg | Validation | Native Engine misses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gelato −11°C ECO | milk_base_v1 | Milk 3.5 % 670 g; Cream 30 % 130 g; Skimmed milk powder 35 g; Sucrose 130 g; Dextrose (monohydrate) 30 g; Tara gum 5 g | 15.917 | 23.709 | 37.234 | 50.031 | 67.29 | 32.711 | 6.273 | 3.735 | 670 | UNKNOWN | engine_validated_native | none |
| Gelato −11°C OPTIMAL | milk_base_v1 | Milk 3.5 % 670 g; Cream 30 % 130 g; Skimmed milk powder 35 g; Sucrose 130 g; Dextrose (monohydrate) 30 g; Tara gum 5 g | 15.917 | 23.709 | 37.234 | 50.031 | 67.29 | 32.711 | 6.273 | 3.735 | 670 | UNKNOWN | engine_validated_native | none |
| Gelato −12°C ECO | milk_base_g17_minus12_v1 | Milk 3.5 % 600 g; Cream 30 % 135 g; Skimmed milk powder 43 g; Sucrose 86 g; Dextrose (monohydrate) 80 g; Inulin 54 g; Tara gum 2 g | 14.936 | 28.146 | 47.485 | 50.329 | 62.144 | 37.856 | 6.184 | 3.795 | 600 | UNKNOWN | engine_validated_native | none |
| Gelato −12°C OPTIMAL | milk_base_g17_minus12_v1 | Milk 3.5 % 600 g; Cream 30 % 135 g; Skimmed milk powder 43 g; Sucrose 86 g; Dextrose (monohydrate) 80 g; Inulin 54 g; Tara gum 2 g | 14.936 | 28.146 | 47.485 | 50.329 | 62.144 | 37.856 | 6.184 | 3.795 | 600 | UNKNOWN | engine_validated_native | none |
| Gelato −13°C ECO | milk_base_g18_minus13_v1 | Milk 3.5 % 600 g; Cream 30 % 125 g; Skimmed milk powder 45 g; Sucrose 72 g; Dextrose (monohydrate) 112 g; Inulin 44 g; Tara gum 2 g | 15.726 | 32.41 | 54.737 | 49.644 | 61.723 | 38.278 | 5.886 | 3.842 | 600 | UNKNOWN | blocked_engine_native_band_miss | lactose_sandiness_risk:high:9.126 [5,9] |
| Gelato −13°C OPTIMAL | milk_base_g18_minus13_v1 | Milk 3.5 % 600 g; Cream 30 % 125 g; Skimmed milk powder 45 g; Sucrose 72 g; Dextrose (monohydrate) 112 g; Inulin 44 g; Tara gum 2 g | 15.726 | 32.41 | 54.737 | 49.644 | 61.723 | 38.278 | 5.886 | 3.842 | 600 | UNKNOWN | blocked_engine_native_band_miss | lactose_sandiness_risk:high:9.126 [5,9] |
| Gelato Świeże ECO | milk_base_v1 | Milk 3.5 % 670 g; Cream 30 % 130 g; Skimmed milk powder 35 g; Sucrose 130 g; Dextrose (monohydrate) 30 g; Tara gum 5 g | 15.917 | 23.709 | 37.234 | 50.031 | 67.29 | 32.711 | 6.273 | 3.735 | 670 | UNKNOWN | engine_validated_native | none |
| Gelato Świeże OPTIMAL | milk_base_v1 | Milk 3.5 % 670 g; Cream 30 % 130 g; Skimmed milk powder 35 g; Sucrose 130 g; Dextrose (monohydrate) 30 g; Tara gum 5 g | 15.917 | 23.709 | 37.234 | 50.031 | 67.29 | 32.711 | 6.273 | 3.735 | 670 | UNKNOWN | engine_validated_native | none |
| Sorbet −11°C ECO | S01 | Water 181 g; Sucrose 104 g; Dextrose (monohydrate) 59 g; Inulin 55 g; Tara gum 1 g | 36.042 | 51.783 | 109.832 | 0 | 47.148 | 52.852 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75] |
| Sorbet −11°C OPTIMAL | S01 | Water 181 g; Sucrose 104 g; Dextrose (monohydrate) 59 g; Inulin 55 g; Tara gum 1 g | 36.042 | 51.783 | 109.832 | 0 | 47.148 | 52.852 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75] |
| Sorbet −12°C ECO | S02 | Water 164 g; Sucrose 90 g; Dextrose (monohydrate) 90 g; Inulin 55 g; Tara gum 1 g | 37.818 | 61.83 | 142.081 | 49.541 | 43.517 | 56.483 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:49.541 [51,59]; npac:high:142.081 [42,49]; pod:high:37.818 [15,25]; water:low:43.517 [67,73]; total_solids:high:56.483 [25,33] |
| Sorbet −12°C OPTIMAL | S02 | Water 164 g; Sucrose 90 g; Dextrose (monohydrate) 90 g; Inulin 55 g; Tara gum 1 g | 37.818 | 61.83 | 142.081 | 49.541 | 43.517 | 56.483 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:49.541 [51,59]; npac:high:142.081 [42,49]; pod:high:37.818 [15,25]; water:low:43.517 [67,73]; total_solids:high:56.483 [25,33] |
| Sorbet −13°C ECO | S03 | Water 146 g; Sucrose 78 g; Dextrose (monohydrate) 125 g; Inulin 50 g; Tara gum 1 g | 40.775 | 74.125 | 186.925 | 45.812 | 39.655 | 60.345 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:45.812 [50,58]; npac:high:186.925 [48,55]; pod:high:40.775 [15,25]; water:low:39.655 [67,73]; total_solids:high:60.345 [25,33] |
| Sorbet −13°C OPTIMAL | S03 | Water 146 g; Sucrose 78 g; Dextrose (monohydrate) 125 g; Inulin 50 g; Tara gum 1 g | 40.775 | 74.125 | 186.925 | 45.812 | 39.655 | 60.345 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:45.812 [50,58]; npac:high:186.925 [48,55]; pod:high:40.775 [15,25]; water:low:39.655 [67,73]; total_solids:high:60.345 [25,33] |
| Sorbet Świeże ECO | S01 | Water 181 g; Sucrose 104 g; Dextrose (monohydrate) 59 g; Inulin 55 g; Tara gum 1 g | 36.042 | 51.783 | 109.832 | 0 | 47.148 | 52.852 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75] |
| Sorbet Świeże OPTIMAL | S01 | Water 181 g; Sucrose 104 g; Dextrose (monohydrate) 59 g; Inulin 55 g; Tara gum 1 g | 36.042 | 51.783 | 109.832 | 0 | 47.148 | 52.852 | 0 | 0 | 0 | UNKNOWN | blocked_missing_user_main | ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75] |
| Vegan Gelato −11°C ECO | vegan_neutral_minus11_final | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 185 g; Dextrose (monohydrate) 60 g; Inulin 53 g; Tara gum 2 g | 23.61 | 30.189 | 47.53 | 39.162 | 63.514 | 36.486 | 5.625 | 0.1 | 0 | UNKNOWN | blocked_engine_native_band_miss | ice_fraction:low:39.162 [45,61] |
| Vegan Gelato −11°C OPTIMAL | vegan_neutral_minus11_final | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 185 g; Dextrose (monohydrate) 60 g; Inulin 53 g; Tara gum 2 g | 23.61 | 30.189 | 47.53 | 39.162 | 63.514 | 36.486 | 5.625 | 0.1 | 0 | UNKNOWN | blocked_engine_native_band_miss | ice_fraction:low:39.162 [45,61] |
| Vegan Gelato −12°C ECO | vegan_neutral_minus12_final | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 145 g; Dextrose (monohydrate) 100 g; Inulin 53 g; Tara gum 2 g | 22.333 | 33.18 | 51.979 | 50.292 | 63.834 | 36.166 | 5.625 | 0.1 | 0 | UNKNOWN | engine_validated_native | none |
| Vegan Gelato −12°C OPTIMAL | vegan_neutral_minus12_final | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 145 g; Dextrose (monohydrate) 100 g; Inulin 53 g; Tara gum 2 g | 22.333 | 33.18 | 51.979 | 50.292 | 63.834 | 36.166 | 5.625 | 0.1 | 0 | UNKNOWN | engine_validated_native | none |
| Vegan Gelato −13°C ECO | V02_fixed | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 95 g; Dextrose (monohydrate) 150 g; Inulin 53 g; Tara gum 2 g | 20.737 | 36.921 | 57.478 | 49.565 | 64.234 | 35.766 | 5.625 | 0.1 | 0 | UNKNOWN | engine_validated_native | none |
| Vegan Gelato −13°C OPTIMAL | V02_fixed | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 95 g; Dextrose (monohydrate) 150 g; Inulin 53 g; Tara gum 2 g | 20.737 | 36.921 | 57.478 | 49.565 | 64.234 | 35.766 | 5.625 | 0.1 | 0 | UNKNOWN | engine_validated_native | none |
| Vegan Gelato Świeże ECO | vegan_neutral_minus11_final | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 185 g; Dextrose (monohydrate) 60 g; Inulin 53 g; Tara gum 2 g | 23.61 | 30.189 | 47.53 | 39.162 | 63.514 | 36.486 | 5.625 | 0.1 | 0 | UNKNOWN | blocked_engine_native_band_miss | ice_fraction:low:39.162 [45,61] |
| Vegan Gelato Świeże OPTIMAL | vegan_neutral_minus11_final | Water 397 g; OAT DRINK · Beverage · Chilled · BIO 250 g; REFINED COCONUT OIL · Elstar Fats Coconut · Dry 53 g; Sucrose 185 g; Dextrose (monohydrate) 60 g; Inulin 53 g; Tara gum 2 g | 23.61 | 30.189 | 47.53 | 39.162 | 63.514 | 36.486 | 5.625 | 0.1 | 0 | UNKNOWN | blocked_engine_native_band_miss | ice_fraction:low:39.162 [45,61] |
| Protein Gelato −11°C ECO | protein_dairy_neutral_minus11_v1 | Cream 30 % 110 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 247 g; Water 505 g; Sucrose 80 g; Dextrose (monohydrate) 56 g; Tara gum 2 g | 12.001 | 19.4 | 33.179 | 54.311 | 58.86 | 41.14 | 5.029 | 20.013 | 0 | UNKNOWN | engine_validated_native | none |
| Protein Gelato −11°C OPTIMAL | protein_dairy_neutral_minus11_v1 | Cream 30 % 110 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 247 g; Water 505 g; Sucrose 80 g; Dextrose (monohydrate) 56 g; Tara gum 2 g | 12.001 | 19.4 | 33.179 | 54.311 | 58.86 | 41.14 | 5.029 | 20.013 | 0 | UNKNOWN | engine_validated_native | none |
| Protein Gelato −12°C ECO | protein_dairy_neutral_minus12_v1 | Milk 3.5 % 460 g; Cream 30 % 100 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 230 g; Water 92 g; Sucrose 30 g; Dextrose (monohydrate) 86 g; Tara gum 2 g | 9.382 | 21.733 | 39.037 | 50.4 | 57.353 | 42.647 | 6.22 | 20.148 | 460 | UNKNOWN | blocked_engine_native_band_miss | npac:low:39.037 [42,50]; pod:low:9.382 [12,17] |
| Protein Gelato −12°C OPTIMAL | protein_dairy_neutral_minus12_v1 | Milk 3.5 % 460 g; Cream 30 % 100 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 230 g; Water 92 g; Sucrose 30 g; Dextrose (monohydrate) 86 g; Tara gum 2 g | 9.382 | 21.733 | 39.037 | 50.4 | 57.353 | 42.647 | 6.22 | 20.148 | 460 | UNKNOWN | blocked_engine_native_band_miss | npac:low:39.037 [42,50]; pod:low:9.382 [12,17] |
| Protein Gelato −13°C ECO | protein_dairy_neutral_minus13_v1 | Milk 3.5 % 460 g; Cream 30 % 100 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 230 g; Water 92 g; Dextrose (monohydrate) 116 g; Tara gum 2 g | 8.425 | 23.977 | 42.77 | 49.991 | 57.593 | 42.407 | 6.22 | 20.148 | 460 | UNKNOWN | blocked_engine_native_band_miss | npac:low:42.77 [48,55]; pod:low:8.425 [12,17] |
| Protein Gelato −13°C OPTIMAL | protein_dairy_neutral_minus13_v1 | Milk 3.5 % 460 g; Cream 30 % 100 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 230 g; Water 92 g; Dextrose (monohydrate) 116 g; Tara gum 2 g | 8.425 | 23.977 | 42.77 | 49.991 | 57.593 | 42.407 | 6.22 | 20.148 | 460 | UNKNOWN | blocked_engine_native_band_miss | npac:low:42.77 [48,55]; pod:low:8.425 [12,17] |
| Protein Gelato Świeże ECO | protein_dairy_neutral_minus11_v1 | Cream 30 % 110 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 247 g; Water 505 g; Sucrose 80 g; Dextrose (monohydrate) 56 g; Tara gum 2 g | 12.001 | 19.4 | 33.179 | 54.311 | 58.86 | 41.14 | 5.029 | 20.013 | 0 | UNKNOWN | engine_validated_native | none |
| Protein Gelato Świeże OPTIMAL | protein_dairy_neutral_minus11_v1 | Cream 30 % 110 g; PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 247 g; Water 505 g; Sucrose 80 g; Dextrose (monohydrate) 56 g; Tara gum 2 g | 12.001 | 19.4 | 33.179 | 54.311 | 58.86 | 41.14 | 5.029 | 20.013 | 0 | UNKNOWN | engine_validated_native | none |

## Per-line evidence

### Gelato −11°C ECO

Template: `milk_base_v1`; version: `registry@milk_base_v1`; target Engine temperature: -11°C; policy source: intentRecipeDraft.ts STARTER_TEMPLATES (locked starter template); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 670 | 67 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 130 | 13 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 35 | 3.5 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 130 | 13 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 30 | 3 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 5 | 0.5 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 15.917; PAC 23.709; NPAC 37.234; ice 50.031%; water 67.29%; total solids 32.711%; fat 6.273%; protein 3.735%; liquid dairy carrier 670 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato −11°C OPTIMAL

Template: `milk_base_v1`; version: `registry@milk_base_v1`; target Engine temperature: -11°C; policy source: intentRecipeDraft.ts STARTER_TEMPLATES (locked starter template); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 670 | 67 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 130 | 13 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 35 | 3.5 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 130 | 13 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 30 | 3 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 5 | 0.5 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 15.917; PAC 23.709; NPAC 37.234; ice 50.031%; water 67.29%; total solids 32.711%; fat 6.273%; protein 3.735%; liquid dairy carrier 670 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato −12°C ECO

Template: `milk_base_g17_minus12_v1`; version: `registry@milk_base_g17_minus12_v1`; target Engine temperature: -12°C; policy source: temperatureRegulator.ts G17 (owner-authorized 2026-07-18); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 600 | 60 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 135 | 13.5 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 43 | 4.3 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 86 | 8.6 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 80 | 8 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 54 | 5.4 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 14.936; PAC 28.146; NPAC 47.485; ice 50.329%; water 62.144%; total solids 37.856%; fat 6.184%; protein 3.795%; liquid dairy carrier 600 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato −12°C OPTIMAL

Template: `milk_base_g17_minus12_v1`; version: `registry@milk_base_g17_minus12_v1`; target Engine temperature: -12°C; policy source: temperatureRegulator.ts G17 (owner-authorized 2026-07-18); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 600 | 60 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 135 | 13.5 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 43 | 4.3 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 86 | 8.6 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 80 | 8 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 54 | 5.4 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 14.936; PAC 28.146; NPAC 47.485; ice 50.329%; water 62.144%; total solids 37.856%; fat 6.184%; protein 3.795%; liquid dairy carrier 600 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato −13°C ECO

Template: `milk_base_g18_minus13_v1`; version: `registry@milk_base_g18_minus13_v1`; target Engine temperature: -13°C; policy source: temperatureRegulator.ts G18 (owner-authorized 2026-07-18); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 600 | 60 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 125 | 12.5 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 45 | 4.5 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 72 | 7.2 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 112 | 11.2 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 44 | 4.4 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 15.726; PAC 32.41; NPAC 54.737; ice 49.644%; water 61.723%; total solids 38.278%; fat 5.886%; protein 3.842%; liquid dairy carrier 600 g; actual Protein n/a; technical score 9; native validation not validated; native Engine misses lactose_sandiness_risk:high:9.126 [5,9]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato −13°C OPTIMAL

Template: `milk_base_g18_minus13_v1`; version: `registry@milk_base_g18_minus13_v1`; target Engine temperature: -13°C; policy source: temperatureRegulator.ts G18 (owner-authorized 2026-07-18); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 600 | 60 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 125 | 12.5 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 45 | 4.5 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 72 | 7.2 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 112 | 11.2 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 44 | 4.4 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 15.726; PAC 32.41; NPAC 54.737; ice 49.644%; water 61.723%; total solids 38.278%; fat 5.886%; protein 3.842%; liquid dairy carrier 600 g; actual Protein n/a; technical score 9; native validation not validated; native Engine misses lactose_sandiness_risk:high:9.126 [5,9]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato Świeże ECO

Template: `milk_base_v1`; version: `registry@milk_base_v1`; target Engine temperature: -11°C; policy source: intentRecipeDraft.ts STARTER_TEMPLATES (locked starter template); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 670 | 67 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 130 | 13 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 35 | 3.5 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 130 | 13 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 30 | 3 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 5 | 0.5 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 15.917; PAC 23.709; NPAC 37.234; ice 50.031%; water 67.29%; total solids 32.711%; fat 6.273%; protein 3.735%; liquid dairy carrier 670 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Gelato Świeże OPTIMAL

Template: `milk_base_v1`; version: `registry@milk_base_v1`; target Engine temperature: -11°C; policy source: intentRecipeDraft.ts STARTER_TEMPLATES (locked starter template); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 670 | 67 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 130 | 13 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| Skimmed milk powder | PI-ING-000270 | 35 | 3.5 | milk_solids | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 130 | 13 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 30 | 3 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 5 | 0.5 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 15.917; PAC 23.709; NPAC 37.234; ice 50.031%; water 67.29%; total solids 32.711%; fat 6.273%; protein 3.735%; liquid dairy carrier 670 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet −11°C ECO

Template: `S01`; version: `registry@S01`; target Engine temperature: -11°C; policy source: temperatureRegulator.ts S01 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 181 | 18.1 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 104 | 10.4 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 59 | 5.9 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 55 | 5.5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 36.042; PAC 51.783; NPAC 109.832; ice 0%; water 47.148%; total solids 52.852%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet −11°C OPTIMAL

Template: `S01`; version: `registry@S01`; target Engine temperature: -11°C; policy source: temperatureRegulator.ts S01 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 181 | 18.1 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 104 | 10.4 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 59 | 5.9 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 55 | 5.5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 36.042; PAC 51.783; NPAC 109.832; ice 0%; water 47.148%; total solids 52.852%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet −12°C ECO

Template: `S02`; version: `registry@S02`; target Engine temperature: -12°C; policy source: temperatureRegulator.ts S02 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 164 | 16.4 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 90 | 9 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 90 | 9 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 55 | 5.5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 37.818; PAC 61.83; NPAC 142.081; ice 49.541%; water 43.517%; total solids 56.483%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:49.541 [51,59]; npac:high:142.081 [42,49]; pod:high:37.818 [15,25]; water:low:43.517 [67,73]; total_solids:high:56.483 [25,33]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet −12°C OPTIMAL

Template: `S02`; version: `registry@S02`; target Engine temperature: -12°C; policy source: temperatureRegulator.ts S02 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 164 | 16.4 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 90 | 9 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 90 | 9 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 55 | 5.5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 37.818; PAC 61.83; NPAC 142.081; ice 49.541%; water 43.517%; total solids 56.483%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:49.541 [51,59]; npac:high:142.081 [42,49]; pod:high:37.818 [15,25]; water:low:43.517 [67,73]; total_solids:high:56.483 [25,33]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet −13°C ECO

Template: `S03`; version: `registry@S03`; target Engine temperature: -13°C; policy source: temperatureRegulator.ts S03 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 146 | 14.6 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 78 | 7.8 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 125 | 12.5 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 50 | 5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 40.775; PAC 74.125; NPAC 186.925; ice 45.812%; water 39.655%; total solids 60.345%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:45.812 [50,58]; npac:high:186.925 [48,55]; pod:high:40.775 [15,25]; water:low:39.655 [67,73]; total_solids:high:60.345 [25,33]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet −13°C OPTIMAL

Template: `S03`; version: `registry@S03`; target Engine temperature: -13°C; policy source: temperatureRegulator.ts S03 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 146 | 14.6 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 78 | 7.8 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 125 | 12.5 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 50 | 5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 40.775; PAC 74.125; NPAC 186.925; ice 45.812%; water 39.655%; total solids 60.345%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:45.812 [50,58]; npac:high:186.925 [48,55]; pod:high:40.775 [15,25]; water:low:39.655 [67,73]; total_solids:high:60.345 [25,33]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet Świeże ECO

Template: `S01`; version: `registry@S01`; target Engine temperature: -11°C; policy source: temperatureRegulator.ts S01 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 181 | 18.1 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 104 | 10.4 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 59 | 5.9 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 55 | 5.5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 36.042; PAC 51.783; NPAC 109.832; ice 0%; water 47.148%; total solids 52.852%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Sorbet Świeże OPTIMAL

Template: `S01`; version: `registry@S01`; target Engine temperature: -11°C; policy source: temperatureRegulator.ts S01 (locked clean sorbet reference); strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_missing_user_main`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 181 | 18.1 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 104 | 10.4 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 59 | 5.9 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 55 | 5.5 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 1 | 0.1 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 36.042; PAC 51.783; NPAC 109.832; ice 0%; water 47.148%; total solids 52.852%; fat 0%; protein 0%; liquid dairy carrier 0 g; actual Protein n/a; technical score 2; native validation not validated; native Engine misses ice_fraction:low:0 [51,59]; npac:high:109.832 [35,40]; pod:high:36.042 [15,25]; total_solids:high:52.852 [25,33]; water:low:47.148 [67,75]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato −11°C ECO

Template: `vegan_neutral_minus11_final`; version: `registry@vegan_neutral_minus11_final`; target Engine temperature: -11°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 185 | 18.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 60 | 6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 23.61; PAC 30.189; NPAC 47.53; ice 39.162%; water 63.514%; total solids 36.486%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 7; native validation not validated; native Engine misses ice_fraction:low:39.162 [45,61]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato −11°C OPTIMAL

Template: `vegan_neutral_minus11_final`; version: `registry@vegan_neutral_minus11_final`; target Engine temperature: -11°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 185 | 18.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 60 | 6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 23.61; PAC 30.189; NPAC 47.53; ice 39.162%; water 63.514%; total solids 36.486%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 7; native validation not validated; native Engine misses ice_fraction:low:39.162 [45,61]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato −12°C ECO

Template: `vegan_neutral_minus12_final`; version: `registry@vegan_neutral_minus12_final`; target Engine temperature: -12°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 145 | 14.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 100 | 10 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 22.333; PAC 33.18; NPAC 51.979; ice 50.292%; water 63.834%; total solids 36.166%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato −12°C OPTIMAL

Template: `vegan_neutral_minus12_final`; version: `registry@vegan_neutral_minus12_final`; target Engine temperature: -12°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 145 | 14.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 100 | 10 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 22.333; PAC 33.18; NPAC 51.979; ice 50.292%; water 63.834%; total solids 36.166%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato −13°C ECO

Template: `V02_fixed`; version: `registry@V02_fixed`; target Engine temperature: -13°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 95 | 9.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 150 | 15 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 20.737; PAC 36.921; NPAC 57.478; ice 49.565%; water 64.234%; total solids 35.766%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato −13°C OPTIMAL

Template: `V02_fixed`; version: `registry@V02_fixed`; target Engine temperature: -13°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 95 | 9.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 150 | 15 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 20.737; PAC 36.921; NPAC 57.478; ice 49.565%; water 64.234%; total solids 35.766%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato Świeże ECO

Template: `vegan_neutral_minus11_final`; version: `registry@vegan_neutral_minus11_final`; target Engine temperature: -11°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 185 | 18.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 60 | 6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 23.61; PAC 30.189; NPAC 47.53; ice 39.162%; water 63.514%; total solids 36.486%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 7; native validation not validated; native Engine misses ice_fraction:low:39.162 [45,61]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Vegan Gelato Świeże OPTIMAL

Template: `vegan_neutral_minus11_final`; version: `registry@vegan_neutral_minus11_final`; target Engine temperature: -11°C; policy source: owner Vegan final task: MyGelato −13 reference + canonical PINGÜINO temperature direction; Mapper v1.0 plant identities; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Water | PI-ING-001409 | 397 | 39.7 | water | UNKNOWN | missing | UNKNOWN | exact |
| OAT DRINK · Beverage · Chilled · BIO | PI-ING-001565 | 250 | 25 | plant_liquid | UNKNOWN | missing | UNKNOWN | exact |
| REFINED COCONUT OIL · Elstar Fats Coconut · Dry | PI-ING-000163 | 53 | 5.3 | plant_fat | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 185 | 18.5 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 60 | 6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Inulin | PI-ING-000456 | 53 | 5.3 | fiber_body | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 23.61; PAC 30.189; NPAC 47.53; ice 39.162%; water 63.514%; total solids 36.486%; fat 5.625%; protein 0.1%; liquid dairy carrier 0 g; actual Protein n/a; technical score 7; native validation not validated; native Engine misses ice_fraction:low:39.162 [45,61]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato −11°C ECO

Template: `protein_dairy_neutral_minus11_v1`; version: `registry@protein_dairy_neutral_minus11_v1`; target Engine temperature: -11°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cream 30 % | PI-ING-000180 | 110 | 11 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 247 | 24.7 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 505 | 50.5 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 80 | 8 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 56 | 5.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 12.001; PAC 19.4; NPAC 33.179; ice 54.311%; water 58.86%; total solids 41.14%; fat 5.029%; protein 20.013%; liquid dairy carrier 0 g; actual Protein 20.013%; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato −11°C OPTIMAL

Template: `protein_dairy_neutral_minus11_v1`; version: `registry@protein_dairy_neutral_minus11_v1`; target Engine temperature: -11°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cream 30 % | PI-ING-000180 | 110 | 11 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 247 | 24.7 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 505 | 50.5 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 80 | 8 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 56 | 5.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 12.001; PAC 19.4; NPAC 33.179; ice 54.311%; water 58.86%; total solids 41.14%; fat 5.029%; protein 20.013%; liquid dairy carrier 0 g; actual Protein 20.013%; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato −12°C ECO

Template: `protein_dairy_neutral_minus12_v1`; version: `registry@protein_dairy_neutral_minus12_v1`; target Engine temperature: -12°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 460 | 46 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 100 | 10 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 230 | 23 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 92 | 9.2 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 30 | 3 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 86 | 8.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 9.382; PAC 21.733; NPAC 39.037; ice 50.4%; water 57.353%; total solids 42.647%; fat 6.22%; protein 20.148%; liquid dairy carrier 460 g; actual Protein 20.148%; technical score 6; native validation not validated; native Engine misses npac:low:39.037 [42,50]; pod:low:9.382 [12,17]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato −12°C OPTIMAL

Template: `protein_dairy_neutral_minus12_v1`; version: `registry@protein_dairy_neutral_minus12_v1`; target Engine temperature: -12°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 460 | 46 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 100 | 10 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 230 | 23 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 92 | 9.2 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 30 | 3 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 86 | 8.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 9.382; PAC 21.733; NPAC 39.037; ice 50.4%; water 57.353%; total solids 42.647%; fat 6.22%; protein 20.148%; liquid dairy carrier 460 g; actual Protein 20.148%; technical score 6; native validation not validated; native Engine misses npac:low:39.037 [42,50]; pod:low:9.382 [12,17]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato −13°C ECO

Template: `protein_dairy_neutral_minus13_v1`; version: `registry@protein_dairy_neutral_minus13_v1`; target Engine temperature: -13°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 460 | 46 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 100 | 10 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 230 | 23 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 92 | 9.2 | water | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 116 | 11.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 8.425; PAC 23.977; NPAC 42.77; ice 49.991%; water 57.593%; total solids 42.407%; fat 6.22%; protein 20.148%; liquid dairy carrier 460 g; actual Protein 20.148%; technical score 6; native validation not validated; native Engine misses npac:low:42.77 [48,55]; pod:low:8.425 [12,17]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato −13°C OPTIMAL

Template: `protein_dairy_neutral_minus13_v1`; version: `registry@protein_dairy_neutral_minus13_v1`; target Engine temperature: -13°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `blocked_engine_native_band_miss`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Milk 3.5 % | PI-ING-000236 | 460 | 46 | primary_liquid | UNKNOWN | missing | UNKNOWN | exact |
| Cream 30 % | PI-ING-000180 | 100 | 10 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 230 | 23 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 92 | 9.2 | water | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 116 | 11.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 8.425; PAC 23.977; NPAC 42.77; ice 49.991%; water 57.593%; total solids 42.407%; fat 6.22%; protein 20.148%; liquid dairy carrier 460 g; actual Protein 20.148%; technical score 6; native validation not validated; native Engine misses npac:low:42.77 [48,55]; pod:low:8.425 [12,17]; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato Świeże ECO

Template: `protein_dairy_neutral_minus11_v1`; version: `registry@protein_dairy_neutral_minus11_v1`; target Engine temperature: -11°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cream 30 % | PI-ING-000180 | 110 | 11 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 247 | 24.7 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 505 | 50.5 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 80 | 8 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 56 | 5.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 12.001; PAC 19.4; NPAC 33.179; ice 54.311%; water 58.86%; total solids 41.14%; fat 5.029%; protein 20.013%; liquid dairy carrier 0 g; actual Protein 20.013%; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

### Protein Gelato Świeże OPTIMAL

Template: `protein_dairy_neutral_minus11_v1`; version: `registry@protein_dairy_neutral_minus11_v1`; target Engine temperature: -11°C; policy source: owner Protein Gelato final task; exact verified Mapper protein identities; owner-approved Standard serving physics; strategy: `eco_equals_optimal_no_validated_alternative`; validation: `engine_validated_native`.

| Ingredient | Canonical ID | g/1000 g | % | Role | Effective price/kg | Price source | Line cost | Whole gram |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cream 30 % | PI-ING-000180 | 110 | 11 | dairy_fat | UNKNOWN | missing | UNKNOWN | exact |
| PROTEIN GEL WPC · Sempre Dairy · SEMPRE230 | PI-ING-000264 | 247 | 24.7 | protein_source | UNKNOWN | missing | UNKNOWN | exact |
| Water | PI-ING-001409 | 505 | 50.5 | water | UNKNOWN | missing | UNKNOWN | exact |
| Sucrose | PI-ING-000514 | 80 | 8 | sweetener_sucrose | UNKNOWN | missing | UNKNOWN | exact |
| Dextrose (monohydrate) | PI-ING-000494 | 56 | 5.6 | sugar_freezing_control | UNKNOWN | missing | UNKNOWN | exact |
| Tara gum | PI-ING-000492 | 2 | 0.2 | stabilizer | UNKNOWN | missing | UNKNOWN | exact |

Metrics: POD 12.001; PAC 19.4; NPAC 33.179; ice 54.311%; water 58.86%; total solids 41.14%; fat 5.029%; protein 20.013%; liquid dairy carrier 0 g; actual Protein 20.013%; technical score 10; native validation validated; native Engine misses none; cost/kg UNKNOWN; cost coverage incomplete/unknown.

## Scaling evidence

Automated tests materialize 1000 g, 5000 g and 1275 g representatives for every profile. Complete profiles reconcile to the exact requested Base mass with whole grams. Sorbet remains an intentionally incomplete technological scaffold: 400 g per 1000 g target, with the remaining 600 g reserved for a user-selected fruit/Main; it is reported as `blocked_missing_user_main` rather than inventing a fruit.
