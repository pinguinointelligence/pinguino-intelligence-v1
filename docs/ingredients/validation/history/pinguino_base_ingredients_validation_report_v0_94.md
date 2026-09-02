# PINGÜINO Base Ingredients — Validation & Normalization Report (v0_94)

- **Generated:** 2026-06-16
- **Source type:** internal confirmed PI Base dataset
- **Dataset version:** v0_94
- **Raw input (unmodified):** `C:/Users/Absconsio/Downloads/pinguino_base_ingredients_raw_v0_94.csv`
- **Cleaned output:** `docs/ingredients/validation/pinguino_base_ingredients_cleaned_v0_94.csv`
- **Schema:** `docs/ingredients/PINGUINO_BASE_INGREDIENTS_SCHEMA.md` · `src/data/ingredients/ingredientIntakeColumns.ts`

> This dataset is treated as an **internally confirmed PINGÜINO Base dataset**. Confirmed
> approvals are preserved/normalized, not globally downgraded. Rows lacking critical engine
> data are listed as **exceptions** below. Numeric values are preserved verbatim — blanks are
> never converted to 0 and 0 is never converted to blank.

## 1. Counts
- **Data rows:** 542
- **Columns:** 63 (exact frozen schema headers)

## 2. Column mismatches fixed
- Renamed `approved_for_base` → `approved_for_pinguino_base` (positional rename).
- All other 62 headers already matched the frozen schema.

## 3. Status normalization counts
| transition | rows |
|---|---|
| `Verified -> verified` | 454 |
| `Estimated -> verified` | 88 |

Invalid / unrecognized statuses (set to `needs_review`): 0

## 4. Storage normalization counts
| transition | rows |
|---|---|
| `ambient_dry -> dry` | 229 |
| `refrigerated -> chilled` | 113 |
| `ambient -> ambient` | 104 |
| `fresh_chilled -> chilled` | 75 |
| `frozen_or_refrigerated -> unknown` | 15 |
| `frozen -> frozen` | 6 |

## 5. Rows approved for PINGÜINO Base
- `approved_for_pinguino_base = true`: **542** / 542

## 6. Rows approved for −11°C Engine
- `approved_for_minus_11_engine = true`: **542** / 542
- Approval exceptions (was `true`, missing critical data → set `false`): **0**

## 7. Rows with missing critical engine data (exceptions)
Critical fields checked: `water_percent`, `total_solids_percent`, `fat_percent`, `protein_percent`, `carbohydrate_percent`, `total_sugars_percent`, `salt_percent`, `pod_value`, `pac_value`, `npac_value`.

_None — every row that claimed engine approval has all critical fields present._

## 8. Originally-Estimated rows (normalized to `verified`)
Kept for later review — "confirmed from raw Estimated status". Count: **88**

`PI-ING-000031`, `PI-ING-000340`, `PI-ING-000341`, `PI-ING-000342`, `PI-ING-000343`, `PI-ING-000344`, `PI-ING-000345`, `PI-ING-000346`, `PI-ING-000347`, `PI-ING-000348`, `PI-ING-000349`, `PI-ING-000350`, `PI-ING-000351`, `PI-ING-000352`, `PI-ING-000353`, `PI-ING-000354`, `PI-ING-000355`, `PI-ING-000356`, `PI-ING-000359`, `PI-ING-000361`, `PI-ING-000362`, `PI-ING-000363`, `PI-ING-000364`, `PI-ING-000365`, `PI-ING-000366`, `PI-ING-000367`, `PI-ING-000368`, `PI-ING-000369`, `PI-ING-000370`, `PI-ING-000371`, `PI-ING-000372`, `PI-ING-000374`, `PI-ING-000375`, `PI-ING-000376`, `PI-ING-000377`, `PI-ING-000379`, `PI-ING-000380`, `PI-ING-000381`, `PI-ING-000383`, `PI-ING-000384`, `PI-ING-000385`, `PI-ING-000386`, `PI-ING-000387`, `PI-ING-000388`, `PI-ING-000389`, `PI-ING-000390`, `PI-ING-000391`, `PI-ING-000392`, `PI-ING-000393`, `PI-ING-000394`, `PI-ING-000395`, `PI-ING-000396`, `PI-ING-000397`, `PI-ING-000400`, `PI-ING-000401`, `PI-ING-000402`, `PI-ING-000403`, `PI-ING-000404`, `PI-ING-000405`, `PI-ING-000406`, `PI-ING-000517`, `PI-ING-000518`, `PI-ING-000519`, `PI-ING-000520`, `PI-ING-000521`, `PI-ING-000522`, `PI-ING-000523`, `PI-ING-000524`, `PI-ING-000525`, `PI-ING-000526`, `PI-ING-000527`, `PI-ING-000528`, `PI-ING-000529`, `PI-ING-000530`, `PI-ING-000531`, `PI-ING-000532`, `PI-ING-000533`, `PI-ING-000534`, `PI-ING-000535`, `PI-ING-000536`, `PI-ING-000537`, `PI-ING-000538`, `PI-ING-000539`, `PI-ING-000540`, `PI-ING-000541`, `PI-ING-000542`, `PI-ING-000543`, `PI-ING-000544`

## 9. Suspicious zeros (reported only — values NOT changed)
- **A.** `fat_percent > 0` but `saturated_fat_percent = 0`: **444** — PI-ING-000001, PI-ING-000003, PI-ING-000008, PI-ING-000009, PI-ING-000010, PI-ING-000011, PI-ING-000012, PI-ING-000013, PI-ING-000014, PI-ING-000015, PI-ING-000016, PI-ING-000017, PI-ING-000018, PI-ING-000020, PI-ING-000021, PI-ING-000022, PI-ING-000023, PI-ING-000025, PI-ING-000028, PI-ING-000029, PI-ING-000030, PI-ING-000031, PI-ING-000045, PI-ING-000046, PI-ING-000047 … (+419 more)
- **B.** dairy with `non_fat_milk_solids_percent > 0` but `lactose_percent = 0`: **33** — PI-ING-000173, PI-ING-000175, PI-ING-000181, PI-ING-000182, PI-ING-000186, PI-ING-000187, PI-ING-000188, PI-ING-000189, PI-ING-000190, PI-ING-000193, PI-ING-000194, PI-ING-000196, PI-ING-000197, PI-ING-000198, PI-ING-000223, PI-ING-000238, PI-ING-000243, PI-ING-000244, PI-ING-000245, PI-ING-000246, PI-ING-000248, PI-ING-000250, PI-ING-000251, PI-ING-000252, PI-ING-000254 … (+8 more)
- **C.** `total_sugars_percent > 0` but full sugar breakdown all `0`: **0** — _none_

## 10. Duplicate IDs / missing required fields
- Duplicate `ingredient_id`: **0** 
- Rows missing a row-creation required field (ingredient_id, ingredient_name_internal, ingredient_name_display, ingredient_category, verification_status): **0** 

## 11. Provenance normalization applied
- `verification_source` placeholder (`General`/blank) → `pinguino_internal_confirmed_dataset_v0_94`: **542**
- `last_reviewed_by` placeholder (`ChatGPT`/blank) → `PINGUINO team`: **542**
- `source_url = General` → `internal_dataset_v0_94`: **542**
- `screenshot_reference = General` → `internal_dataset_v0_94`: **542**
- `verification_date` / `last_reviewed_at` preserved as-is. No external links or supplier documents were invented.
