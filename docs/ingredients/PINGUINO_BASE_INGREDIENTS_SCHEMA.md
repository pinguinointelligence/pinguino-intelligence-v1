# PINGÜINO Base Approved Ingredients — FROZEN Schema Contract

**Status: FROZEN.** This is the authoritative column contract for the Hermes
intake sheet and all future ingredient-import tooling. The machine-readable
source of truth is [`src/data/ingredients/ingredientIntakeColumns.ts`](../../src/data/ingredients/ingredientIntakeColumns.ts);
the CSV template [`pinguino_base_ingredients_template.csv`](pinguino_base_ingredients_template.csv)
must match it column-for-column.

This is **data, not an app feature** — it is not wired to Supabase, the engine, or
the UI. It defines how tested, safe ingredient **profiles** are collected before
any import.

---

## Global rules (read first)

1. **An ingredient is a reusable profile, NOT a recipe.**
2. **Per 100 g.** Every composition value is per 100 g unless a column says otherwise
   (e.g. `brix` = °Bx, `cost_per_kg` = per kg, `kcal_per_100g` = per 100 g, `shelf_life_days` = days).
3. **Missing data is blank (`''`) or `null` — NEVER invented as `0`.**
4. **`0` is allowed ONLY when the value is a verified true zero** (e.g. sucrose has 0 g fat).
5. **Hermes must never guess.** Unknown stays blank/`null`; unknown booleans stay `unknown`.
6. **Every row needs a stable `ingredient_id`** that is never reused or renamed.
7. **Trust is explicit.** Only `verification_status = verified` ingredients may later be used by
   the engine. `draft`, `internet_data`, `needs_review`, `rejected` (and any non-verified state)
   are **NOT** safe for automatic recipe generation.
8. **External POD / PAC / NPAC may be stored** if available, but must carry a
   `verification_source` and a `data_confidence_percent` (and ideally `source_url`).

### How "missing" is stored, by type

| Type | Missing/unknown is stored as | A real `0`/`false` means |
|---|---|---|
| `string` | `''` (empty) | n/a |
| `number_or_null` | blank / `null` | a verified zero |
| `number` | (see column; `data_confidence_percent` defaults `0` = no confidence) | a verified value |
| `boolean` | (defaults `false`) | verified false |
| `boolean_or_unknown` | `unknown` | verified true/false |
| `enum` | the column's default (often `unknown`/`draft`) | the chosen member |
| `iso_date_or_null` | `null` | a real `YYYY-MM-DD` |

---

## Types used

`string`, `boolean` (`true`/`false`), `boolean_or_unknown` (`true`/`false`/`unknown`),
`enum` (closed set), `number`, `number_or_null` (blank = unknown, `0` = verified zero),
`iso_date_or_null` (`YYYY-MM-DD` or `null`).

## Enums

- **`verification_status`** — `draft` · `internet_data` · `label_data` · `supplier_data` ·
  `external_reference_data` · `needs_review` · `verified` · `rejected`. Default `draft`.
- **`storage_type`** — `ambient` · `chilled` · `frozen` · `dry` · `unknown`. Default `unknown`.
- **`approved_for_pinguino_base`** — `true`/`false`. Default `false`.
- **`approved_for_minus_11_engine`** — `true`/`false`. Default `false`.
- **`vegan` / `dairy_free` / `gluten_free` / `contains_alcohol`** — `true`/`false`/`unknown`. Default `unknown`.
- **`data_confidence_percent`** — number `0`–`100`. Default `0` (`0` = no confidence yet).

---

## Columns (63) — identity, approval & verification

| key | type | required | default | allowed / notes |
|---|---|---|---|---|
| `ingredient_id` | string | **yes** | `''` | stable, unique, snake_case; never reused |
| `ingredient_name_internal` | string | **yes** | `''` | canonical internal name |
| `ingredient_name_display` | string | **yes** | `''` | human-facing name |
| `brand` | string | no | `''` | blank if unknown |
| `supplier` | string | no | `''` | blank if unknown |
| `country` | string | no | `''` | blank if unknown |
| `ean_code` | string | no | `''` | barcode if available |
| `ingredient_category` | string | **yes** | `''` | e.g. sugar, dairy, fat, fruit, nut_paste, chocolate_cocoa, stabilizer, flavor, alcohol, water, egg, other |
| `ingredient_subcategory` | string | no | `''` | optional finer group |
| `approved_for_pinguino_base` | boolean | no | `false` | `true`/`false` |
| `approved_for_minus_11_engine` | boolean | **yes** | `false` | `true`/`false` — see approval gate below |
| `verification_status` | enum | **yes** | `draft` | see enum list |
| `verification_source` | string | no | `''` | where the data came from |
| `verification_date` | iso_date_or_null | no | `null` | `YYYY-MM-DD` |
| `data_confidence_percent` | number | no | `0` | `0`–`100`; `0` = no confidence yet |

## Columns — composition (per 100 g, `number_or_null`, default `null`, `0`–`100`)

`water_percent` (**required**), `total_solids_percent`, `fat_percent`, `saturated_fat_percent`,
`milk_fat_percent`, `non_fat_milk_solids_percent`, `protein_percent`, `aerating_protein_percent`,
`carbohydrate_percent`, `total_sugars_percent`, `sucrose_percent`, `dextrose_percent`,
`glucose_percent`, `fructose_percent`, `lactose_percent`, `polyol_percent`, `fiber_percent`,
`salt_percent`, `alcohol_percent`, `ash_percent`, `acidity_percent`, `dry_matter_percent`.
**`brix`** is `number_or_null` (default `null`) in **°Bx** (not a percent).
Blank = unknown; `0` = verified zero.

## Columns — engine values (`number_or_null`, default `null`)

| key | bound | notes |
|---|---|---|
| `pod_value` | ≥ 0 (**required**) | relative sweetening, sucrose = 100; may exceed 100 |
| `pac_value` | ≥ 0 | relative anti-freezing, sucrose = 100; may exceed 100 |
| `npac_value` | ≥ 0 | net anti-freezing |
| `de_value` | 0–100 | dextrose equivalent (syrups) |
| `sweetness_factor` | ≥ 0 | optional |
| `freezing_factor` | ≥ 0 | optional |
| `stabilizer_activity` | ≥ 0 | optional |
| `recommended_dosage_percent_min` | 0–100 | of total mix |
| `recommended_dosage_percent_max` | 0–100 | of total mix |

External POD/PAC/NPAC must include `verification_source` + `data_confidence_percent`.

## Columns — nutrition / cost

| key | type | default | notes |
|---|---|---|---|
| `kcal_per_100g` | number_or_null | `null` | energy per 100 g |
| `cost_per_kg` | number_or_null | `null` | blank = unknown; `0` = verified free/zero, never missing |
| `currency` | string | `''` | ISO 4217, e.g. `EUR` |

## Columns — food safety / usage

| key | type | default | allowed / notes |
|---|---|---|---|
| `allergens` | string | `''` | list; blank if unknown |
| `vegan` | boolean_or_unknown | `unknown` | `true`/`false`/`unknown` |
| `dairy_free` | boolean_or_unknown | `unknown` | `true`/`false`/`unknown` |
| `gluten_free` | boolean_or_unknown | `unknown` | `true`/`false`/`unknown` |
| `contains_alcohol` | boolean_or_unknown | `unknown` | `true`/`false`/`unknown` |
| `storage_type` | enum | `unknown` | `ambient`/`chilled`/`frozen`/`dry`/`unknown` |
| `shelf_life_days` | number_or_null | `null` | days |
| `usage_notes` | string | `''` | free text; do not invent |
| `engine_notes` | string | `''` | engine mapping notes |
| `source_url` | string | `''` | link to proof |
| `screenshot_reference` | string | `''` | stored proof reference |
| `last_reviewed_by` | string | `''` | reviewer |
| `last_reviewed_at` | iso_date_or_null | `null` | `YYYY-MM-DD` |

---

## Validation rules

- **`required` has two tiers.** The five **row-creation** fields must have real values to create a
  row at all: `ingredient_id`, `ingredient_name_internal`, `ingredient_name_display`,
  `ingredient_category`, `verification_status`. The other `required` columns
  (`water_percent`, `pod_value`, `approved_for_minus_11_engine`) must exist in every row, but their
  **value** may be blank/`null`/`false` while the ingredient is still draft/pending — they become
  mandatory **values** only at engine approval (below).
- Numbers must respect their bounds (percent columns `0`–`100`; POD/PAC/NPAC `≥ 0`; `de_value` `0`–`100`).
- Booleans are exactly `true`/`false`; `boolean_or_unknown` is `true`/`false`/`unknown`.
- Enums must be a listed member.
- Dates are `YYYY-MM-DD` or `null`.
- **Never** write `0`/`false`/`ambient`-etc. to stand in for "unknown".

### Hermes may create a row only when
`ingredient_id`, `ingredient_name_internal`, `ingredient_name_display`, `ingredient_category`,
and `verification_status` are present, **and** unknown numeric values are blank/`null` (not `0`).

### Hermes may set `approved_for_minus_11_engine = true` only when
- `verification_status = verified`, **and**
- `data_confidence_percent ≥ 90`, **and**
- core composition present: `water_percent`, `total_solids_percent`, `fat_percent`,
  `protein_percent`, `carbohydrate_percent`, `total_sugars_percent`, `salt_percent`, **and**
- sugar breakdown present when relevant: `sucrose_percent`, `dextrose_percent`, `glucose_percent`,
  `fructose_percent`, `lactose_percent`, **and**
- `pod_value` / `pac_value` / `npac_value` present or clearly derivable by the engine, **and**
- source/proof documented (`verification_source` and/or `source_url` / `screenshot_reference`).

### Hermes must NOT approve for the −11°C Engine when
- `verification_status` is `draft` / `internet_data` / `needs_review` / `rejected` (or any non-`verified`),
- required values are missing,
- the sugar breakdown is unknown **and** the ingredient contains sugars,
- alcohol content is unknown **and** the ingredient may contain alcohol,
- the source is unclear.

---

## Examples

**Correct**
- Sucrose fat: `fat_percent = 0` (verified zero, sucrose has no fat).
- Unknown saturated fat on a new fruit purée: `saturated_fat_percent = ` (blank).
- Free tap water cost: `cost_per_kg = 0` (verified free); unknown supplier cost: `cost_per_kg = ` (blank).
- Unknown vegan status: `vegan = unknown`.
- External POD with a screenshot: `pod_value = 70.84`, `verification_source = supplier_data`,
  `data_confidence_percent = 80`, `source_url = ...`.

**Incorrect**
- `saturated_fat_percent = 0` when it is simply unknown → **never** invent zero.
- `vegan = false` when it is actually unknown → use `unknown`.
- `cost_per_kg = 0` to mean "no price yet" → leave blank instead.
- `approved_for_minus_11_engine = true` while `verification_status = internet_data` → forbidden.
- `lactose_percent = 0` on a dairy ingredient whose lactose is unknown → leave blank.
